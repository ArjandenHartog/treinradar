/**
 * Deutsche Bahn API client — via transport.rest (community HAFAS wrapper)
 * https://v6.db.transport.rest/  —  no API key required
 *
 * NOTE: The /radar endpoint was removed in v6 API. German train positions are
 * temporarily unavailable until an alternative data source is found.
 * Currently returns empty array to prevent API failures.
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
  // TEMPORARY: German radar endpoint removed from transport.rest v6 API
  // TODO: Find alternative data source for German train positions
  return []
}

export async function getGermanPositions(): Promise<GermanTrain[]> {
  // TEMPORARY: German radar endpoint removed from transport.rest v6 API
  // TODO: Find alternative data source for German train positions
  // For now, return empty array to prevent API failures
  return []
}
