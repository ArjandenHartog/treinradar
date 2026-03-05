/**
 * iRail API client — Belgium (NMBS/SNCB)
 * https://api.irail.be/  —  no API key required
 */

const IRAIL_BASE = 'https://api.irail.be'

// More stations for better IC coverage across Belgium
const BELGIAN_STATIONS = [
  'Brussels-South',
  'Brussels-Central',
  'Brussels-North',
  'Antwerp-Central',
  'Ghent-Saint-Pieters',
  'Liège-Guillemins',
  'Bruges',
  'Namur',
  'Leuven',
  'Charleroi-Central',
  'Kortrijk',
  'Hasselt',
  'Aalst',
  'Mechelen',
  'Mons',
]

// ─── Raw iRail types ──────────────────────────────────────────────────────────

interface IrailStationInfo {
  locationX: string   // longitude
  locationY: string   // latitude
  name:      string
}

interface IrailStop {
  stationinfo:            IrailStationInfo
  scheduledDepartureTime: string   // Unix seconds (may be '0' at terminus)
  scheduledArrivalTime:   string   // Unix seconds (may be '0' at origin)
  departureDelay?:        string   // seconds (may be absent)
  arrivalDelay?:          string   // seconds (may be absent)
  canceled?:              string
  departureCanceled?:     string
  left?:                  string
  platform?:              string
}

interface IrailVehicleResponse {
  vehicle:     string
  vehicleinfo: { shortname: string }
  stops:       { stop: IrailStop | IrailStop[] }
}

interface IrailDeparture {
  vehicle:   string
  time:      string   // Unix seconds
  delay:     string   // seconds
  canceled:  string
}

interface IrailLiveboardResponse {
  departures?: { departure?: IrailDeparture | IrailDeparture[] }
}

// ─── In-process caches ────────────────────────────────────────────────────────

const journeyCache = new Map<string, { data: IrailVehicleResponse; ts: number }>()
const JOURNEY_TTL = 90_000

let positionsCache: { data: BelgianTrain[]; ts: number } | null = null
const POSITIONS_TTL = 15_000

// ─── Helpers ──────────────────────────────────────────────────────────────────

function si(s: string | undefined): number {
  const n = parseInt(s ?? '0', 10)
  return isNaN(n) ? 0 : n
}

async function irailFetch<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const url = new URL(`${IRAIL_BASE}/${path}`)
  url.searchParams.set('format', 'json')
  url.searchParams.set('lang', 'en')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Treinradar/1.0 (educational)' },
      next:    { revalidate: 0 },
      signal:  AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    return null
  }
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

async function fetchVehicleJourney(vehicleId: string): Promise<IrailVehicleResponse | null> {
  const now = Date.now()
  const cached = journeyCache.get(vehicleId)
  if (cached && now - cached.ts < JOURNEY_TTL) return cached.data

  const data = await irailFetch<IrailVehicleResponse>('vehicle/', { id: vehicleId })
  if (data) journeyCache.set(vehicleId, { data, ts: now })
  return data
}

/**
 * Interpolate lat/lng from iRail stops.
 *
 * Handles three cases:
 *  A) Train is moving between stop i and stop i+1 (departure from i, not yet at i+1)
 *  B) Train is stopped at station i (arrived but not yet departed)
 *  C) Falls back to station coords if none of the above match
 */
function interpolatePosition(
  stops: IrailStop[],
  nowMs: number,
): { lat: number; lng: number; heading: number } | null {
  for (let i = 0; i < stops.length; i++) {
    const stopDepS = si(stops[i].scheduledDepartureTime) + si(stops[i].departureDelay)
    const stopArrS = si(stops[i].scheduledArrivalTime)   + si(stops[i].arrivalDelay)

    const lat = parseFloat(stops[i].stationinfo.locationY)
    const lng = parseFloat(stops[i].stationinfo.locationX)
    if (!lat || !lng) continue

    // Case B: train is currently stopped at this station
    if (stopArrS && stopDepS && nowMs >= stopArrS * 1000 && nowMs <= stopDepS * 1000) {
      return { lat, lng, heading: 0 }
    }

    // Case A: moving between this stop and the next
    if (i < stops.length - 1 && stopDepS) {
      const nextStop = stops[i + 1]
      // Use scheduledArrivalTime, fall back to scheduledDepartureTime if arrival is missing
      const nextArrS = si(nextStop.scheduledArrivalTime) + si(nextStop.arrivalDelay)
                    || si(nextStop.scheduledDepartureTime) + si(nextStop.departureDelay)

      if (nextArrS && nowMs >= stopDepS * 1000 && nowMs <= nextArrS * 1000) {
        const toLat = parseFloat(nextStop.stationinfo.locationY)
        const toLng = parseFloat(nextStop.stationinfo.locationX)
        if (!toLat || !toLng) continue

        const t       = (nowMs - stopDepS * 1000) / (nextArrS * 1000 - stopDepS * 1000)
        const iLat    = lat + (toLat - lat) * t
        const iLng    = lng + (toLng - lng) * t
        const heading = (Math.atan2(toLng - lng, toLat - lat) * 180 / Math.PI + 360) % 360
        return { lat: iLat, lng: iLng, heading }
      }
    }
  }
  return null
}

function normaliseBeType(shortname: string): string {
  const s = shortname.toUpperCase().replace(/\s+/g, '')
  if (s.startsWith('THA'))     return 'THA'
  if (s.startsWith('ICE'))     return 'ICE'
  if (s.startsWith('EUR'))     return 'EUR'
  if (s.startsWith('IC'))      return 'IC'
  if (s.startsWith('S'))  return 'S'    // Brussels S-net (S1–S10)
  if (s.startsWith('P'))  return 'P'    // Piek/peak trains
  if (s.startsWith('L'))  return 'L'    // Lokaal (toon 'L' label)
  if (s.startsWith('RE')) return 'RE'   // Regionaal Expr.
  if (s.startsWith('R'))  return 'RE'   // Regionaal
  return 'SPR'
}

// ─── Public export ────────────────────────────────────────────────────────────

export interface BelgianTrain {
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
 * Returns cached Belgian positions immediately; triggers a background refresh if stale.
 * Use this in the positions route so Belgium never blocks the NS response.
 */
export function getBelgianPositionsImmediate(): BelgianTrain[] {
  const now = Date.now()
  if (!positionsCache || now - positionsCache.ts >= POSITIONS_TTL) {
    getBelgianPositions().catch(() => {})
  }
  return positionsCache?.data ?? []
}

export async function getBelgianPositions(): Promise<BelgianTrain[]> {
  const now = Date.now()
  if (positionsCache && now - positionsCache.ts < POSITIONS_TTL) {
    return positionsCache.data
  }

  // 1. Fetch liveboards from all Belgian stations in parallel
  const liveboardResults = await Promise.allSettled(
    BELGIAN_STATIONS.map(s =>
      irailFetch<IrailLiveboardResponse>('liveboard/', { station: s, results: '30', arrdep: 'DEP' })
    )
  )

  // 2. Collect unique vehicle IDs — deduplicate so IC trains aren't crowded out
  const vehicleIds = new Set<string>()
  for (const r of liveboardResults) {
    if (r.status !== 'fulfilled' || !r.value) continue
    for (const d of toArray(r.value.departures?.departure)) {
      if (d.canceled !== '1') vehicleIds.add(d.vehicle)
    }
  }

  // 3. Fetch journeys — increased limit so IC trains aren't dropped
  const ids = [...vehicleIds].slice(0, 120)
  const journeyResults = await Promise.allSettled(ids.map(fetchVehicleJourney))

  // 4. Interpolate positions
  const trains: BelgianTrain[] = []
  for (let i = 0; i < ids.length; i++) {
    const r = journeyResults[i]
    if (r.status !== 'fulfilled' || !r.value) continue

    const v     = r.value
    const stops = toArray(v.stops.stop)
    if (stops.length < 2) continue

    const pos = interpolatePosition(stops, now)
    if (!pos) continue

    const shortname = v.vehicleinfo?.shortname ?? v.vehicle.split('.').pop() ?? v.vehicle

    // Delay from most recent passed stop
    const passedStop = [...stops].reverse().find(s => si(s.scheduledDepartureTime) * 1000 <= now && si(s.scheduledDepartureTime) > 0)
    const delayMin   = Math.round(si(passedStop?.departureDelay) / 60)

    trains.push({
      id:              `BE_${shortname}`,
      serviceNumber:   shortname,
      lat:             pos.lat,
      lng:             pos.lng,
      speedKmh:        0,
      heading:         pos.heading,
      accuracy:        500,
      typeCode:        normaliseBeType(shortname),
      operator:        'NMBS',
      destination:     stops[stops.length - 1].stationinfo.name,
      origin:          stops[0].stationinfo.name,
      delay:           delayMin,
      cancelled:       false,
      platform:        '',
      via:             '',
      materieelNummers: [],
    })
  }

  positionsCache = { data: trains, ts: now }
  return trains
}
