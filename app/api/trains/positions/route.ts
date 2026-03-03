import { NextResponse } from 'next/server'
import { getVehicles } from '@/lib/ns-api'
import { supabase } from '@/lib/supabase'

// ─── In-memory cache for positions (500ms TTL for real-time updates) ─────────────────────────────
let positionsCache: { data: any; timestamp: number } | null = null
const CACHE_TTL = 500 // 500ms for smooth 1-second refresh

/**
 * Lightweight positioned train — returned on every 30s poll.
 * Heavy details (stops, material specs) come from /api/trains/info on click.
 */
export interface PositionedTrain {
  id: string           // ritId from Virtual Train API
  serviceNumber: string
  lat: number
  lng: number
  speedKmh: number
  heading: number      // degrees 0-360 (0=N, 90=E, 180=S, 270=W)
  accuracy: number     // GPS accuracy metres
  typeCode: string     // SPR, IC, ICE, etc.
  operator: string
  destination: string
  origin: string
  delay: number
  cancelled: boolean
  platform: string
  via: string
  /** Material part numbers from GPS layer */
  materieelNummers: number[]
}

// ─── Normalise type string from VT API ───────────────────────────────────────

function normaliseType(raw?: string): string {
  if (!raw) return ''
  const u = raw.toUpperCase().trim()
  const MAP: Record<string, string> = {
    // NS
    SPRINTER: 'SPR', INTERCITY: 'IC', 'INTERCITY DIRECT': 'ICD',
    'INTERCITY-DIRECT': 'ICD', INTERCITYEXPRESS: 'ICE', 'INTER CITY EXPRESS': 'ICE',
    THALYS: 'THA', EUROSTAR: 'EUR', INTERNATIONAL: 'INT', NACHTTREIN: 'NT',
    // RNet / regionale operators
    'R-NET': 'RNT', RNET: 'RNT', 'R NET': 'RNT',
    VALLEILIJN: 'VLL', 'VALLEI LIJN': 'VLL',
    // Arriva
    ARRIVA: 'ARR', 'STOPTREIN': 'STP',
    // Diverse andere
    LIGHTRAIL: 'LR', 'LIGHT RAIL': 'LR',
    FLIRT: 'FLI', FLIRT3: 'FLI',
    GTW: 'GTW',
    ICM: 'ICM',
    SNG: 'SPR', // SNG is een Sprinter
    // DB
    'INTERCITY EXPRESS': 'ICE',
  }
  return MAP[u] ?? u.slice(0, 4) // cap at 4 chars for display
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const now = new Date()

    // Check cache first
    if (positionsCache && (now.getTime() - positionsCache.timestamp) < CACHE_TTL) {
      return NextResponse.json(positionsCache.data)
    }

    const vehicles = await getVehicles({ features: 'materieel' })

    if (!vehicles.length) {
      return NextResponse.json({ trains: [], count: 0, source: 'virtual-train-api-empty' })
    }

    // ── 2. Supabase departure data for metadata (delay, destination, operator) ─
    const { data: departures } = await supabase
      .from('train_departures')
      .select('service_number, station_code, origin, destination, destination_actual, type_code, operator, delay, cancelled, platform, via')
      .gte('updated_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())

    // Index by service_number for fast lookup
    const depByNumber = new Map<string, typeof departures extends (infer T)[] | null ? T : never>()
    for (const d of departures ?? []) {
      if (!depByNumber.has(d.service_number)) depByNumber.set(d.service_number, d)
    }

    // ── 3. Build positioned trains ────────────────────────────────────────────
    const trains: PositionedTrain[] = vehicles
      .filter(v => v.lat && v.lng)
      .map(v => {
        // ritId may be "9049" or "9049-2" — normalise to just the number
        const ritId     = v.ritId?.replace(/\s/g, '') ?? ''
        const numericId = ritId.split('-')[0].split('_')[0]

        const dep = depByNumber.get(numericId) ?? depByNumber.get(ritId)
        const typeCode = normaliseType(v.type) || dep?.type_code || ''

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

    const result = {
      trains,
      count: trains.length,
      updatedAt: now.toISOString(),
      source: 'virtual-train-api',
    }

    // Cache the result
    positionsCache = { data: result, timestamp: now.getTime() }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[positions]', err)
    return NextResponse.json({ trains: [], error: String(err) }, { status: 500 })
  }
}
