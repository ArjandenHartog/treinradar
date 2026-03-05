/**
 * Deutsche Bahn API client — via transport.rest (community HAFAS wrapper)
 * https://v6.db.transport.rest/  —  no API key required
 *
 * Uses the /radar endpoint: one bbox call returns ALL running trains
 * in Germany with live GPS positions — no per-station polling needed.
 */

const DB_BASE = 'https://v6.db.transport.rest'

// Bounding box covering all of Germany + nearby border areas
const BBOX = {
  north: '55.2',   // Flensburg (DK border)
  south: '47.2',   // Bavaria / Alps
  west:  '5.8',    // Aachen area (NL/BE border)
  east:  '15.2',   // Görlitz (PL border)
}

// ─── Raw transport.rest radar types ──────────────────────────────────────────

interface DBLocation {
  latitude:  number
  longitude: number
}

interface DBLine {
  name?:     string
  product?:  string
  operator?: { name?: string }
}

interface DBRadarFrame {
  t:        number      // seconds offset from request time
  location: DBLocation
}

interface DBMovement {
  tripId:          string
  direction?:      string
  line?:           DBLine
  location?:       DBLocation
  delay?:          number    // seconds
  frames?:         DBRadarFrame[]
  nextStopovers?:  Array<{
    stop?:             { name?: string }
    departure?:        string
    plannedDeparture?: string
    departureDelay?:   number
    arrival?:          string
    plannedArrival?:   string
  }>
}

interface DBRadarResponse {
  movements?: DBMovement[]
}

// ─── Trip detail types (for info panel) ──────────────────────────────────────

interface DBStop {
  stop?:             { location?: DBLocation; name?: string }
  plannedDeparture?: string
  plannedArrival?:   string
  departure?:        string
  arrival?:          string
  departureDelay?:   number
  arrivalDelay?:     number
  cancelled?:        boolean
}

interface DBTripResponse {
  trip: {
    id:         string
    line?:      DBLine
    direction?: string
    stopovers:  DBStop[]
  }
}

// ─── In-process caches ────────────────────────────────────────────────────────

const tripCache = new Map<string, { data: DBTripResponse['trip']; ts: number }>()
const TRIP_TTL  = 90_000

let positionsCache: { data: GermanTrain[]; ts: number } | null = null
const POSITIONS_TTL = 15_000

// serviceNumber → tripId (for detail panel lookups)
export const activeTripIds = new Map<string, string>()

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function dbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const url = new URL(`${DB_BASE}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Treinradar/1.0 (educational)' },
      next:    { revalidate: 0 },
      signal:  AbortSignal.timeout(12_000),
    })
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    return null
  }
}

export async function fetchTrip(tripId: string): Promise<DBTripResponse['trip'] | null> {
  const now = Date.now()
  const cached = tripCache.get(tripId)
  if (cached && now - cached.ts < TRIP_TTL) return cached.data

  const data = await dbFetch<DBTripResponse>(`/trips/${encodeURIComponent(tripId)}`, {
    stopovers: 'true',
    polyline:  'false',
    language:  'de',
  })
  if (data?.trip) tripCache.set(tripId, { data: data.trip, ts: now })
  return data?.trip ?? null
}

function normaliseDbType(product: string | undefined, lineName: string | undefined): string {
  const p = (product  ?? '').toUpperCase()
  const n = (lineName ?? '').toUpperCase().replace(/\s+/g, '')
  if (p === 'NATIONALEXPRESS' || p === 'NATIONAL_EXP' || n.startsWith('ICE')) return 'ICE'
  if (n.startsWith('THA')) return 'THA'
  if (n.startsWith('EUR')) return 'EUR'
  if (p === 'NATIONAL' || n.startsWith('IC') || n.startsWith('EC')) return 'IC'
  return 'RE'
}

/**
 * Compute heading (degrees) from two frames.
 * Returns 0 if there are fewer than 2 frames or positions are identical.
 */
function headingFromFrames(frames: DBRadarFrame[] | undefined): number {
  if (!frames || frames.length < 2) return 0
  const f0 = frames[0].location
  const f1 = frames[frames.length - 1].location
  if (!f0 || !f1) return 0
  const dLat = f1.latitude  - f0.latitude
  const dLng = f1.longitude - f0.longitude
  if (Math.abs(dLat) < 1e-6 && Math.abs(dLng) < 1e-6) return 0
  return (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360
}

// ─── Public export ────────────────────────────────────────────────────────────

export interface GermanTrain {
  id:              string
  serviceNumber:   string
  lat:             number
  lng:             number
  speedKmh:        number
  heading:         number
  accuracy:        number
  typeCode:        string
  operator:        string
  destination:     string
  origin:          string
  delay:           number
  cancelled:       boolean
  platform:        string
  via:             string
  materieelNummers: number[]
}

/**
 * Returns cached German positions immediately; triggers a background refresh if stale.
 * Use this in the positions route so Germany never blocks the NS response.
 */
export function getGermanPositionsImmediate(): GermanTrain[] {
  const now = Date.now()
  if (!positionsCache || now - positionsCache.ts >= POSITIONS_TTL) {
    getGermanPositions().catch(() => {})
  }
  return positionsCache?.data ?? []
}

export async function getGermanPositions(): Promise<GermanTrain[]> {
  const now = Date.now()
  if (positionsCache && now - positionsCache.ts < POSITIONS_TTL) {
    return positionsCache.data
  }

  try {
    // Single bbox call — returns all running trains in Germany with live positions
    const data = await dbFetch<DBRadarResponse>('/radar', {
      ...BBOX,
      results:          '512',   // max vehicles
      duration:         '2',     // 2-minute lookahead for heading calc
      frames:           '2',     // current + 2-min-future position → heading
      nationalExpress:  'true',
      national:         'true',
      regional:         'true',
      regionalExp:      'true',
      suburban:         'false',  // S-Bahn: too many local trains
      subway:           'false',
      bus:              'false',
      ferry:            'false',
      tram:             'false',
    })

    const movements = data?.movements ?? []
    const trains: GermanTrain[] = []

    for (const m of movements) {
      if (!m.location || !m.tripId) continue

      const lineName     = m.line?.name    ?? ''
      const product      = m.line?.product ?? ''
      const typeCode     = normaliseDbType(product, lineName)
      const serviceNumber = lineName.replace(/\s+/g, '') || m.tripId.split('|')[0]
      const heading      = headingFromFrames(m.frames)
      const delayMin     = m.delay != null ? Math.round(m.delay / 60) : 0

      activeTripIds.set(serviceNumber, m.tripId)

      trains.push({
        id:              `DE_${serviceNumber}_${m.tripId.slice(-6)}`,
        serviceNumber,
        lat:             m.location.latitude,
        lng:             m.location.longitude,
        speedKmh:        0,
        heading,
        accuracy:        50,   // radar gives better accuracy than interpolation
        typeCode,
        operator:        m.line?.operator?.name ?? 'DB',
        destination:     m.direction ?? '',
        origin:          '',
        delay:           delayMin,
        cancelled:       false,
        platform:        '',
        via:             '',
        materieelNummers: [],
      })
    }

    positionsCache = { data: trains, ts: now }
    return trains
  } catch {
    return positionsCache?.data ?? []
  }
}
