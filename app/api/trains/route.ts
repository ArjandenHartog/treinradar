import { NextResponse } from 'next/server'
import { getDepartures, getDelayMinutes } from '@/lib/ns-api'
import { supabase } from '@/lib/supabase'

// Major Dutch railway stations to poll — covers NS + regional operators incl. Valleilijn/R-net
const MAJOR_STATIONS = [
  // Grote NS-knooppunten
  'AMS',  // Amsterdam Centraal
  'UT',   // Utrecht Centraal
  'RTD',  // Rotterdam Centraal
  'EHV',  // Eindhoven Centraal
  'GVC',  // Den Haag Centraal
  'LW',   // Leeuwarden
  'AMF',  // Amersfoort
  'ZWL',  // Zwolle
  'GD',   // Gouda
  'AH',   // Arnhem Centraal
  'NM',   // Nijmegen
  'HT',   // Heerlen
  'HLM',  // Haarlem
  'AMR',  // Alkmaar
  'BD',   // Breda
  'HRL',  // Heerenveen
  'DV',   // Deventer
  'DT',   // Dordrecht
  'BTL',  // Barendrecht
  'TBU',  // Tilburg
  'WD',   // Woerden
  'ASD',  // Amsterdam Amstel
  'ASDL', // Amsterdam Lelylaan
  'ASRA', // Amsterdam RAI
  'HVS',  // Hilversum
  'MN',   // Middelburg (Arriva)
  'VLIS', // Vlissingen
  'GST',  // Goes (Arriva)
  // Overige grote stations
  'ASS',  // Amsterdam Sloterdijk
  'LLS',  // Lelystad Centrum
  'APD',  // Apeldoorn
  'SHL',  // Schiphol Airport
  'ZL',   // Zoetermeer (? / Den Haag regio)
  // Valleilijn stations (EBS/R-net) — codes geverifieerd via NS stations API
  'ED',   // Ede-Wageningen (hoofdspoor, ook Valleilijn eindpunt)
  'EDC',  // Ede Centrum (Valleilijn specifiek)
  'BNN',  // Barneveld Noord
  'BNC',  // Barneveld Centrum
  'BNZ',  // Barneveld Zuid
  'AMFS', // Amersfoort Schothorst
  'AVAT', // Amersfoort Vathorst
  'LTN',  // Lunteren
  // Arriva Friesland/Groningen
  'HDN',  // Hoorn
  'KAM',  // Kampen
  'SNK',  // Sneek
  'HDE',  // Den Helder
]

export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const now = new Date()

    // Fetch departures from all major stations in parallel
    const allDepartures = await Promise.allSettled(
      MAJOR_STATIONS.map(s => getDepartures(s, 40))
    )

    // trainSeen: bijhouden welke treinen (service number) al verwerkt zijn voor deduplicatie
    const trainSeen = new Map<string, boolean>()
    const rows: Record<string, unknown>[] = []

    for (let i = 0; i < MAJOR_STATIONS.length; i++) {
      const result = allDepartures[i]
      if (result.status !== 'fulfilled') continue
      const stationCode = MAJOR_STATIONS[i]

      for (const dep of result.value) {
        const trainNumber = dep.product?.number
        if (!trainNumber) continue

        const delay = getDelayMinutes(dep.plannedDateTime, dep.actualDateTime)

        // Sleutels: één rij per trein per vertrekstation per dag
        const depKey = `${trainNumber}_${stationCode}_${today}`

        // Voor statistieken: track één unieke trein overall (eerste keer dat we 'm zien)
        if (!trainSeen.has(trainNumber)) {
          trainSeen.set(trainNumber, true)
        }

        // Extract cancellation reason from messages array
        const msgs = dep.messages as Array<{ message?: string; text?: string }> | undefined
        const cancelReason = dep.cancelled && msgs?.length
          ? (msgs[0]?.message ?? msgs[0]?.text ?? '')
          : ''

        rows.push({
          id: depKey,
          service_number: trainNumber,
          station_code: stationCode,
          origin: stationCode,
          destination: dep.direction ?? '',
          destination_actual: dep.direction ?? '',
          type: dep.product?.longCategoryName ?? dep.trainCategory ?? '',
          type_code: dep.product?.categoryCode ?? dep.product?.shortCategoryName ?? '',
          operator: dep.product?.operatorName ?? dep.product?.operatorCode ?? 'NS',
          delay,
          cancelled: dep.cancelled ?? false,
          cancel_reason: cancelReason,
          departure_time: dep.plannedDateTime ?? dep.actualDateTime,
          platform: dep.actualTrack ?? dep.plannedTrack ?? '',
          via: dep.routeStations?.map(r => r.mediumName).join(' · ') ?? '',
          updated_at: now.toISOString(),
        })
      }
    }

    // Upsert to Supabase
    if (rows.length > 0) {
      await supabase.from('train_departures').upsert(rows, { onConflict: 'id' })
    }

    return NextResponse.json({ trains: rows, count: rows.length, updated_at: now.toISOString() })
  } catch (err) {
    console.error('Trains error:', err)
    return NextResponse.json({ error: 'Failed to fetch trains' }, { status: 500 })
  }
}
