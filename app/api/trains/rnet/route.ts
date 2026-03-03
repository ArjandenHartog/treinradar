import { NextResponse } from 'next/server'

/**
 * RNet / Valleilijn real-time rijtijden via de OVAPI (KV78 turbo)
 *
 * De Valleilijn (Amersfoort–Ede/Barneveld) wordt gereden door EBS
 * onder de R-net kwaliteitslabel. GPS-posities zijn niet beschikbaar
 * via de NS Virtual Train API, maar vertrek- en aankomsttijden
 * inclusief vertragingen zijn opvraagbaar via de NDOV/OVAPI.
 *
 * Endpoint: GET /api/trains/rnet
 */

const OVAPI_BASE = 'https://v0.ovapi.nl'

// R-net treinlijnen op de Valleilijn (EBS, DataOwnerCode = EBS)
const VALLEILIJN_OPERATORS = ['EBS']

export interface RNetJourney {
  id: string
  operator: string
  lineNumber: string
  journeyNumber: string
  fromStation: string
  toStation: string
  plannedArrival: string | null
  expectedArrival: string | null
  delaySeconds: number
  cancelled: boolean
}

// In-memory cache — 30 seconden TTL
let cache: { data: RNetJourney[]; ts: number } | null = null
const CACHE_TTL = 30_000

export async function GET() {
  try {
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      return NextResponse.json({ journeys: cache.data, count: cache.data.length, source: 'cache' })
    }

    // Probeer voor elke operator
    const allJourneys: RNetJourney[] = []

    for (const op of VALLEILIJN_OPERATORS) {
      try {
        const res = await fetch(`${OVAPI_BASE}/tpc/${op}`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(5000),
          next: { revalidate: 0 },
        })
        if (!res.ok) continue

        const raw = await res.json() as Record<string, unknown>

        // KV78 formaat: { [DataOwnerCode]: { Journeys: { [key]: Journey } } }
        const ownerData = raw[op] as Record<string, unknown> | undefined
        const journeys = ownerData?.Journeys as Record<string, Record<string, unknown>> | undefined
        if (!journeys) continue

        for (const [key, journey] of Object.entries(journeys)) {
          if (journey.TransportType !== 'TRAIN') continue
          const stops = Array.isArray(journey.Stops) ? journey.Stops as Record<string, unknown>[] : []
          const firstStop = stops[0]
          const lastStop = stops[stops.length - 1]

          allJourneys.push({
            id: key,
            operator: String(journey.DataOwnerCode ?? op),
            lineNumber: String(journey.LinePublicNumber ?? ''),
            journeyNumber: String(journey.JourneyNumber ?? ''),
            fromStation: String(firstStop?.StopCode ?? ''),
            toStation: String(lastStop?.StopCode ?? ''),
            plannedArrival: String(lastStop?.TargetArrivalTime ?? '') || null,
            expectedArrival: String(lastStop?.ExpectedArrivalTime ?? '') || null,
            delaySeconds: 0,
            cancelled: journey.JourneyStopType === 'LAST' ? false : false,
          })
        }
      } catch {
        // Skip dit operator als OVAPI tijdelijk niet beschikbaar is
        continue
      }
    }

    cache = { data: allJourneys, ts: Date.now() }
    return NextResponse.json({ journeys: allJourneys, count: allJourneys.length, source: 'ovapi' })
  } catch (err) {
    console.error('[rnet]', err)
    // Geef lege lijst terug — niet fataal
    return NextResponse.json({ journeys: [], count: 0, source: 'error', error: String(err) })
  }
}
