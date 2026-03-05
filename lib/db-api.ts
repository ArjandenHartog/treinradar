/**
 * German train positions — via hafas-client with VBB profile
 * https://github.com/public-transport/hafas-client
 *
 * Since DB HAFAS API is permanently shut down, we use VBB (Berlin/Brandenburg)
 * which provides live GPS positions for trains in the Berlin area.
 * This covers major routes like Berlin-Hamburg, Berlin-Hannover, etc.
 *
 * For comprehensive Germany-wide coverage, a different approach would be needed.
 */

import { createClient } from 'hafas-client'
import { profile as vbbProfile } from 'hafas-client/p/vbb/index.js'
import { profile as rmvProfile } from 'hafas-client/p/rmv/index.js'
import { profile as nvvProfile } from 'hafas-client/p/nvv/index.js'
import { profile as vbnProfile } from 'hafas-client/p/vbn/index.js'

const DB_BASE = 'https://fahrinfo.vbb.de/bin/'

// Create multiple HAFAS clients for broader German coverage
const germanClients = [
  { name: 'VBB', client: createClient(vbbProfile, 'Treinradar/1.0 (educational)'), bbox: { north: 53.5, south: 51.8, west: 11.5, east: 15.0 } }, // Berlin/Brandenburg
  { name: 'RMV', client: createClient(rmvProfile, 'Treinradar/1.0 (educational)'), bbox: { north: 50.5, south: 49.5, west: 7.5, east: 9.5 } },   // Frankfurt/Rhein-Main
  { name: 'NVV', client: createClient(nvvProfile, 'Treinradar/1.0 (educational)'), bbox: { north: 51.5, south: 50.5, west: 8.5, east: 10.5 } }, // Nordhessen/Kassel
  { name: 'VBN', client: createClient(vbnProfile, 'Treinradar/1.0 (educational)'), bbox: { north: 53.5, south: 52.5, west: 7.5, east: 9.5 } }, // Bremen/Niedersachsen
]

// ─── HAFAS radar types ──────────────────────────────────────────

interface HAFASLocation {
  latitude:  number
  longitude: number
}

interface HAFASLine {
  name?:     string
  product?:  string
  operator?: { name?: string }
}

interface HAFASMovement {
  tripId:          string
  direction?:      string
  line?:           HAFASLine
  location?:       HAFASLocation
  delay?:          number
  frames?:         Array<{
    t:        number
    location: HAFASLocation
  }>
  nextStopovers?:  Array<{
    stop?:             { name?: string }
    departure?:        string
    plannedDeparture?: string
    departureDelay?:   number
    arrival?:          string
    plannedArrival?:   string
  }>
}

// ─── Trip detail types (for info panel) ──────────────────────────────────────

interface DBStop {
  stop?:             { location?: HAFASLocation; name?: string }
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
    line?:      HAFASLine
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
  // This function is kept for compatibility but not used with hafas-client
  return null
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
function headingFromFrames(frames: Array<{ t: number; location: HAFASLocation }> | undefined): number {
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
    getGermanPositions().catch((error) => {
      console.error('Background German positions refresh failed:', error)
    })
  }
  return positionsCache?.data ?? []
}

export async function getGermanPositions(): Promise<GermanTrain[]> {
  const now = Date.now()
  if (positionsCache && now - positionsCache.ts < POSITIONS_TTL) {
    return positionsCache.data
  }

  try {
    // Check if radar is supported
    if (!dbClient.radar) {
      console.warn('German radar API not supported by current HAFAS client')
      return positionsCache?.data ?? []
    }

    // Single bbox call — returns all running trains in Germany with live positions
    const { movements } = await dbClient.radar({
      north: parseFloat(BBOX.north),
      west:  parseFloat(BBOX.west),
      south: parseFloat(BBOX.south),
      east:  parseFloat(BBOX.east)
    }, {
      results: 512,   // max vehicles
      duration: 30,   // compute frames for the next 30 seconds
      frames: 3,      // nr of frames to compute
    })

    const trains: GermanTrain[] = []

    for (const m of movements as HAFASMovement[]) {
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
  } catch (error) {
    console.error('German radar API error:', error)
    return positionsCache?.data ?? []
  }
}
