import { NextResponse } from 'next/server'
import { getVehicles, getTrainDestination } from '@/lib/ns-api'
import { supabase } from '@/lib/supabase'
import { getBelgianPositionsImmediate } from '@/lib/irail-api'

// ─── In-memory cache (500ms TTL for smooth real-time updates) ─────────────────
let positionsCache: { data: unknown; timestamp: number } | null = null
const CACHE_TTL = 2_000

/**
 * Lightweight positioned train — returned on every poll.
 * Real GPS position, speed, and heading from the Virtual Train API.
 */
export interface PositionedTrain {
  id: string
  serviceNumber: string
  lat: number
  lng: number
  speedKmh: number
  heading: number
  accuracy: number
  typeCode: string
  operator: string
  destination: string
  origin: string
  delay: number
  cancelled: boolean
  platform: string
  via: string
  materieelNummers: number[]
}

// ─── Normalise type string from VT API ───────────────────────────────────────

function normaliseType(raw?: string): string {
  if (!raw) return ''
  const u = raw.toUpperCase().trim()
  const MAP: Record<string, string> = {
    SPRINTER: 'SPR', INTERCITY: 'IC', 'INTERCITY DIRECT': 'ICD',
    'INTERCITY-DIRECT': 'ICD', INTERCITYEXPRESS: 'ICE', 'INTER CITY EXPRESS': 'ICE',
    THALYS: 'THA', EUROSTAR: 'EUR', INTERNATIONAL: 'INT', NACHTTREIN: 'NT',
    'R-NET': 'RNT', RNET: 'RNT', 'R NET': 'RNT',
    VALLEILIJN: 'VLL', 'VALLEI LIJN': 'VLL',
    ARRIVA: 'ARR', STOPTREIN: 'STP',
    LIGHTRAIL: 'LR', 'LIGHT RAIL': 'LR',
    FLIRT: 'FLI', FLIRT3: 'FLI',
    SNG: 'SPR', SNG3: 'SPR', SNG4: 'SPR',
    VIRM: 'IC', VIRM4: 'IC', VIRM6: 'IC',
    ICM: 'IC', DDZ: 'SPR',
  }
  const normalised = u.replace(/\s+/g, '')
  if (MAP[normalised]) return MAP[normalised]
  if (MAP[u]) return MAP[u]
  if (u.startsWith('ICE')) return 'ICE'
  if (u.startsWith('SNG')) return 'SPR'
  if (u.startsWith('VIRM')) return 'IC'
  if (u.startsWith('ICM')) return 'IC'
  if (u.startsWith('DDZ')) return 'SPR'
  if (u.startsWith('FLIRT')) return 'SPR'
  if (u.startsWith('GTW')) return 'GTW'
  if (u.startsWith('TALENT')) return 'SPR'
  return u.slice(0, 4)
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const now = new Date()
    const nowMs = now.getTime()

    if (positionsCache && nowMs - positionsCache.timestamp < CACHE_TTL) {
      return NextResponse.json(positionsCache.data)
    }

    // BE is served from cache immediately; background refresh populates it for next poll
    const belgianTrains = getBelgianPositionsImmediate()

    const vehicles = await getVehicles({ features: 'materieel' })

    if (!vehicles.length && !belgianTrains.length) {
      return NextResponse.json({ trains: [], count: 0, source: 'virtual-train-api-empty' })
    }

    // ── Supabase departure data for metadata (delay, destination, operator) ───
    const { data: departures } = await supabase
      .from('train_departures')
      .select('service_number, station_code, origin, destination, destination_actual, type_code, operator, delay, cancelled, platform, via')
      .gte('updated_at', new Date(nowMs - 5 * 60 * 1000).toISOString())

    const depByNumber = new Map<string, NonNullable<typeof departures>[number]>()
    for (const d of departures ?? []) {
      if (!depByNumber.has(d.service_number)) depByNumber.set(d.service_number, d)
    }

    // ── Build positioned trains (first pass with Supabase data) ──────────────
    const trains: PositionedTrain[] = vehicles
      .filter(v => v.lat && v.lng)
      .map(v => {
        const ritId     = v.ritId?.replace(/\s/g, '') ?? ''
        const numericId = ritId.split('-')[0].split('_')[0]
        const dep       = depByNumber.get(numericId) ?? depByNumber.get(ritId)
        const typeCode  = normaliseType(v.type) || dep?.type_code || ''

        return {
          id:              ritId,
          serviceNumber:   numericId,
          lat:             v.lat,
          lng:             v.lng,
          speedKmh:        Math.round(v.snelheid ?? 0),
          heading:         v.richting ?? 0,
          accuracy:        v.horizontaleNauwkeurigheid ?? 0,
          typeCode,
          operator:        dep?.operator   ?? 'NS',
          destination:     dep?.destination_actual || dep?.destination || '',
          origin:          dep?.origin     ?? dep?.station_code ?? '',
          delay:           dep?.delay      ?? 0,
          cancelled:       dep?.cancelled  ?? false,
          platform:        dep?.platform   ?? '',
          via:             dep?.via        ?? '',
          materieelNummers: v.materieel ?? [],
        } satisfies PositionedTrain
      })

    // ── Deduplicate by serviceNumber (VT API returns 1 entry per physical unit) ─
    const seenService = new Set<string>()
    const uniqueTrains = trains.filter(t => {
      if (seenService.has(t.serviceNumber)) return false
      seenService.add(t.serviceNumber)
      return true
    })

    // ── Fetch destinations from NS API for trains missing them ──────────────
    const missingDestTrain = uniqueTrains.filter(t => !t.destination)
    if (missingDestTrain.length > 0) {
      const destResults = await Promise.allSettled(
        missingDestTrain.map(t => getTrainDestination(t.serviceNumber))
      )
      
      destResults.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value) {
          const train = missingDestTrain[idx]
          const trainInList = uniqueTrains.find(t => t.serviceNumber === train.serviceNumber)
          if (trainInList && !trainInList.destination) {
            trainInList.destination = result.value
          }
        }
      })
    }

    // ── Merge NS + Belgian trains ───────────────────────────────────
    const allTrains = [
      ...uniqueTrains,
      ...belgianTrains as PositionedTrain[],
    ]

    const result = {
      trains:    allTrains,
      count:     allTrains.length,
      updatedAt: now.toISOString(),
      source:    'multi-source',
    }

    positionsCache = { data: result, timestamp: nowMs }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[positions]', err)
    return NextResponse.json({ trains: [], error: String(err) }, { status: 500 })
  }
}
