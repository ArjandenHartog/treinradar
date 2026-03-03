const NS_BASE = process.env.NS_API_BASE || 'https://gateway.apiportal.ns.nl/reisinformatie-api'
const NS_KEY = process.env.NS_API_KEY!

async function nsGet<T>(path: string): Promise<T> {
  const res = await fetch(`${NS_BASE}${path}`, {
    headers: {
      'Ocp-Apim-Subscription-Key': NS_KEY,
      'Accept': 'application/json',
    },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`NS API ${path} → ${res.status}`)
  return res.json()
}

// ─── Stations ────────────────────────────────────────────────────────────────

export interface NSStation {
  UICCode: string
  stationType: string
  EVACode: string
  code: string
  namen: { lang: string; middel: string; kort: string }
  land: string
  lat: number
  lng: number
  heeftFaciliteiten: boolean
  heeftVertrektijden: boolean
  heeftReisassistentie: boolean
  synoniemen: string[]
}

export async function getStations(): Promise<NSStation[]> {
  const data = await nsGet<{ payload: NSStation[] }>('/api/v2/stations')
  return data.payload ?? []
}

// ─── Departures ──────────────────────────────────────────────────────────────

export interface NSDeparture {
  direction: string
  name: string
  plannedDateTime: string
  plannedTimeZoneOffset: number
  actualDateTime: string
  actualTimeZoneOffset: number
  plannedTrack: string
  actualTrack: string
  product: {
    number: string
    categoryCode: string
    shortCategoryName: string
    longCategoryName: string
    operatorCode: string
    operatorName: string
    type: string
  }
  trainCategory: string
  cancelled: boolean
  routeStations: Array<{ uicCode: string; mediumName: string }>
  messages: unknown[]
  departureStatus: string
  journeyDetailRef: string
}

export async function getDepartures(stationCode: string, max = 40): Promise<NSDeparture[]> {
  try {
    const data = await nsGet<{ payload: { departures: NSDeparture[] } }>(
      `/api/v2/departures?station=${stationCode}&maxJourneys=${max}&lang=nl`
    )
    return data.payload?.departures ?? []
  } catch {
    return []
  }
}

// ─── Arrivals ─────────────────────────────────────────────────────────────────

export interface NSArrival {
  origin: string
  name: string
  plannedDateTime: string
  actualDateTime: string
  plannedTrack: string
  actualTrack: string
  product: {
    number: string
    categoryCode: string
    shortCategoryName: string
    longCategoryName: string
    operatorCode: string
    operatorName: string
  }
  trainCategory: string
  cancelled: boolean
  arrivalStatus: string
}

export async function getArrivals(stationCode: string, max = 20): Promise<NSArrival[]> {
  try {
    const data = await nsGet<{ payload: { arrivals: NSArrival[] } }>(
      `/api/v2/arrivals?station=${stationCode}&maxJourneys=${max}&lang=nl`
    )
    return data.payload?.arrivals ?? []
  } catch {
    return []
  }
}

// ─── Disruptions ─────────────────────────────────────────────────────────────

export interface NSDisruption {
  id: string
  type: string
  isActive: boolean
  start: string
  end: string
  title: string
  topic: string
  impact?: { value: number; description: string }
  expectation?: { description: string }
  period?: string
  summaryAdditionalTravelTime?: { label: string; shortLabel: string; minimumDurationInMinutes: number; maximumDurationInMinutes: number }
  publicationSections?: Array<{ section: { stations: Array<{ name: string; uicCode: string }> } }>
}

export async function getDisruptions(): Promise<NSDisruption[]> {
  try {
    const data = await nsGet<NSDisruption[]>('/api/v3/disruptions?isActive=true&lang=nl')
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

// ─── Journey ─────────────────────────────────────────────────────────────────

export interface NSJourneyStopEvent {
  plannedTime?: string
  actualTime?: string
  delayInSeconds?: number
  plannedTrack?: string
  actualTrack?: string
  cancelled?: boolean
  crowdForecast?: string
}

export interface NSJourneyStopStock {
  trainType?: string
  numberOfSeats?: number
  numberOfParts?: number
  trainParts?: Array<{
    stockIdentifier?: string
    facilities?: string[]
    image?: { uri?: string }
  }>
}

export interface NSJourneyStop {
  id?: string
  status?: string       // 'ORIGIN' | 'STOP' | 'DESTINATION' | 'PASSING'
  stop: {
    uicCode: string
    name: string
    lat?: number
    lng?: number
    countryCode?: string
  }
  departures: NSJourneyStopEvent[]
  arrivals: NSJourneyStopEvent[]
  actualStock?: NSJourneyStopStock
  plannedStock?: NSJourneyStopStock
}

// Full journey payload – includes stops AND material/stock metadata
export interface NSJourneyPayload {
  stops: NSJourneyStop[]
  crowdForecast?: string
  punctuality?: number
  actualDurationInMinutes?: number
  allowCyclesOnboard?: boolean
  trainType?: string
  // Material / rolling stock
  trainTypes?: Array<{ key: string; numberOfParts: number; numberOfSeats?: number }>
  stockIdentifiers?: string[]
  // Free-form extra fields the NS API may return
  [key: string]: unknown
}

export async function getJourney(trainNumber: string, date: string): Promise<NSJourneyStop[]> {
  try {
    const data = await nsGet<{ payload: NSJourneyPayload }>(
      `/api/v2/journey?train=${trainNumber}&date=${date}`
    )
    return data.payload?.stops ?? []
  } catch {
    return []
  }
}

export async function getJourneyPayload(trainNumber: string, date: string): Promise<NSJourneyPayload> {
  try {
    const data = await nsGet<{ payload: NSJourneyPayload }>(
      `/api/v2/journey?train=${trainNumber}&date=${date}`
    )
    return data.payload ?? { stops: [] }
  } catch {
    return { stops: [] }
  }
}

// ─── Virtual Train API ────────────────────────────────────────────────────────
// Real-time GPS positions, speed, heading, and material numbers for all trains

const VT_BASE = 'https://gateway.apiportal.ns.nl/virtual-train-api'

async function vtGet<T>(path: string): Promise<T> {
  const res = await fetch(`${VT_BASE}${path}`, {
    headers: { 'Ocp-Apim-Subscription-Key': NS_KEY, 'Accept': 'application/json' },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`VT API ${path} → ${res.status}`)
  return res.json()
}

export interface NSMaterieelDeel {
  materieelDeel: number    // material part number (e.g. 94847494)
  lat?: number
  lng?: number
  snelheid?: number
  richting?: number
}

export interface NSTrein {
  ritId: string            // journey/service number
  lat: number
  lng: number
  snelheid: number         // speed in km/h
  richting: number         // heading in degrees (0=N, 90=E, 180=S, 270=W)
  horizontaleNauwkeurigheid?: number  // GPS accuracy in metres
  type?: string            // e.g. "SPR", "IC", "Sprinter", "Intercity"
  materieel?: number[]     // material part numbers (e.g. [2010, 2011])
  treinCloneWithMaterieel?: NSTrein
}

/** Get all active vehicles with real GPS positions */
export async function getVehicles(opts?: {
  lat?: number; lng?: number; radius?: number
  limit?: number; features?: string
}): Promise<NSTrein[]> {
  try {
    const p = new URLSearchParams()
    if (opts?.lat != null)    p.set('lat',      String(opts.lat))
    if (opts?.lng != null)    p.set('lng',      String(opts.lng))
    if (opts?.radius != null) p.set('radius',   String(opts.radius))
    if (opts?.limit != null)  p.set('limit',    String(opts.limit))
    if (opts?.features)       p.set('features', opts.features)
    const qs = p.toString()
    const data = await vtGet<{ payload: { treinen: NSTrein[] } }>(`/vehicle${qs ? '?' + qs : ''}`)
    return data.payload?.treinen ?? []
  } catch {
    return []
  }
}

/** Detailed material / composition info for a single rit (train journey) */
export interface NSMaterieelDeelInfo {
  materieelNummer?: number
  type?: string            // SNG, VIRM, SLT, ICM, etc.
  eindbestemming?: string
  ingekort?: boolean
  zitplaatsen?: {
    zitplaatsEersteKlas: number
    zitplaatsTweedeKlas: number
  }
  facilities?: string[]    // e.g. ["WIFI", "STILTECOUPE", "FIETS"]
  afbeelding?: string      // NS image URL if available
  lengteInMeters?: number
  bakken?: number          // number of carriages
}

export interface NSTrainInformation {
  ritId?: string
  type?: string
  eindbestemming?: string
  materieelDelen?: NSMaterieelDeelInfo[]
  // Some NS API versions wrap in different keys
  trainParts?: NSMaterieelDeelInfo[]
  [key: string]: unknown
}

export async function getTrainInformationForRitnummer(ritnummer: string): Promise<NSTrainInformation | null> {
  try {
    // Try the two URL patterns NS uses
    const data = await vtGet<NSTrainInformation>(`/trainInformation?ritnummer=${ritnummer}`)
    return data
  } catch {
    try {
      const data = await vtGet<NSTrainInformation>(`/trainInformation/${ritnummer}`)
      return data
    } catch {
      return null
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getDelayMinutes(planned: string, actual: string): number {
  if (!planned || !actual) return 0
  return Math.round((new Date(actual).getTime() - new Date(planned).getTime()) / 60000)
}
