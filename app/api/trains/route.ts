import { NextResponse } from 'next/server'
import { getDepartures, getDelayMinutes } from '@/lib/ns-api'
import { supabase } from '@/lib/supabase'

// Major Dutch railway stations to poll
const MAJOR_STATIONS = [
  'AMS', 'UT', 'RTD', 'EHV', 'GVC', 'LW', 'AMF', 'ZWL', 'GD', 'AH',
  'NM', 'HT', 'HLM', 'AMR', 'BD', 'HRL', 'ZL', 'DV', 'DT', 'BTL',
  'TBU', 'WD', 'ASD', 'ASDL', 'ASRA', 'HVS', 'MN', 'VLIS', 'GST', 'HFTR',
]

export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const now = new Date()

    // Fetch departures from all major stations in parallel
    const allDepartures = await Promise.allSettled(
      MAJOR_STATIONS.map(s => getDepartures(s, 40))
    )

    const seen = new Set<string>()
    const rows: Record<string, unknown>[] = []

    for (let i = 0; i < MAJOR_STATIONS.length; i++) {
      const result = allDepartures[i]
      if (result.status !== 'fulfilled') continue
      const stationCode = MAJOR_STATIONS[i]

      for (const dep of result.value) {
        const trainNumber = dep.product?.number
        if (!trainNumber) continue

        const depKey = `${trainNumber}_${stationCode}_${today}`
        if (seen.has(depKey)) continue
        seen.add(depKey)

        const delay = getDelayMinutes(dep.plannedDateTime, dep.actualDateTime)

        rows.push({
          id: depKey,
          service_number: trainNumber,
          station_code: stationCode,
          origin: stationCode,
          destination: dep.direction ?? '',
          destination_actual: dep.direction ?? '',
          type: dep.product?.longCategoryName ?? dep.trainCategory ?? '',
          type_code: dep.product?.categoryCode ?? '',
          operator: dep.product?.operatorName ?? dep.product?.operatorCode ?? 'NS',
          delay,
          cancelled: dep.cancelled ?? false,
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
