import { NextResponse } from 'next/server'
import { getDepartures, getDelayMinutes } from '@/lib/ns-api'

/**
 * Valleilijn / R-net vertrektijden
 *
 * De Valleilijn (Amersfoort–Ede/Barneveld) wordt gereden door EBS
 * onder de R-net kwaliteitslabel. EBS is NIET beschikbaar in de OVAPI v0.
 * GPS-posities zijn niet beschikbaar buiten het NS Virtual Train API
 * (EBS rijdt met eigen diesel FLIRT3 materieel).
 *
 * Wél beschikbaar: departures van NS-beheerde stations via de NS API.
 * Die data wordt ook al opgehaald door /api/trains, maar dit endpoint
 * geeft een specifiek overzicht van enkel de Valleilijn/R-net treinen.
 *
 * Endpoint: GET /api/trains/rnet
 */

// Alle NS-stationcodes op de Valleilijn (geverifieerd via NS stations API)
const VALLEILIJN_STATIONS = [
  'AMFS', // Amersfoort Schothorst
  'AVAT', // Amersfoort Vathorst
  'LTN',  // Lunteren
  'EDC',  // Ede Centrum
  'ED',   // Ede-Wageningen (ook intercity-eindpunt)
  'BNZ',  // Barneveld Zuid
  'BNC',  // Barneveld Centrum
  'BNN',  // Barneveld Noord
]

// Operator-indicatoren voor Valleilijn (EBS) in de NS API response
const RNET_OPERATORS = ['EBS', 'R-NET', 'RNET', 'Connexxion', 'Breng', 'Valleilijn']

export interface RNetDeparture {
  serviceNumber: string
  station: string
  destination: string
  plannedTime: string
  actualTime: string
  delayMinutes: number
  cancelled: boolean
  platform: string
  operator: string
  typeCode: string
}

// Cache — 60 seconden
let cache: { data: RNetDeparture[]; ts: number } | null = null
const CACHE_TTL = 60_000

export async function GET() {
  try {
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      return NextResponse.json({ departures: cache.data, count: cache.data.length, source: 'cache' })
    }

    // Haal departures op van alle Valleilijn stations parallel
    const results = await Promise.allSettled(
      VALLEILIJN_STATIONS.map(s => getDepartures(s, 20))
    )

    const seen = new Set<string>()
    const departures: RNetDeparture[] = []

    for (let i = 0; i < VALLEILIJN_STATIONS.length; i++) {
      const result = results[i]
      if (result.status !== 'fulfilled') continue
      const station = VALLEILIJN_STATIONS[i]

      for (const dep of result.value) {
        const trainNumber = dep.product?.number
        if (!trainNumber) continue

        // Filter op R-net/EBS operator OF treintype dat op de Valleilijn rijdt
        const operatorName = dep.product?.operatorName ?? dep.product?.operatorCode ?? ''
        const isRNet = RNET_OPERATORS.some(op =>
          operatorName.toLowerCase().includes(op.toLowerCase())
        )
        if (!isRNet) continue

        // Dedupliceer per trein
        const key = `${trainNumber}_${station}`
        if (seen.has(key)) continue
        seen.add(key)

        departures.push({
          serviceNumber: trainNumber,
          station,
          destination: dep.direction ?? '',
          plannedTime: dep.plannedDateTime ?? '',
          actualTime: dep.actualDateTime ?? dep.plannedDateTime ?? '',
          delayMinutes: getDelayMinutes(dep.plannedDateTime, dep.actualDateTime),
          cancelled: dep.cancelled ?? false,
          platform: dep.actualTrack ?? dep.plannedTrack ?? '',
          operator: operatorName,
          typeCode: dep.product?.categoryCode ?? dep.product?.shortCategoryName ?? '',
        })
      }
    }

    // Sorteer op vertrektijd
    departures.sort((a, b) => a.plannedTime.localeCompare(b.plannedTime))

    cache = { data: departures, ts: Date.now() }

    return NextResponse.json({
      departures,
      count: departures.length,
      stations: VALLEILIJN_STATIONS,
      source: 'ns-api',
      note: 'GPS-posities Valleilijn niet beschikbaar (EBS rijdt met eigen niet-NS materieel)',
    })
  } catch (err) {
    console.error('[rnet]', err)
    return NextResponse.json({ departures: [], count: 0, error: String(err) }, { status: 500 })
  }
}
