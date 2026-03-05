import { NextRequest, NextResponse } from 'next/server'
import { getJourneyPayload } from '@/lib/ns-api'
import { supabase } from '@/lib/supabase'
import { getStockInfo, FACILITY_LABEL, type Facility } from '@/lib/rolling-stock'
import { activeTripIds, fetchTrip } from '@/lib/db-api'

export interface StopInfo {
  name: string
  uicCode: string
  lat: number | null
  lng: number | null
  plannedDeparture: string | null
  actualDeparture: string | null
  plannedArrival: string | null
  actualArrival: string | null
  platform: string | null
  passed: boolean
  current: boolean
  cancelled: boolean
  crowdForecast: string | null
  delaySeconds: number
}

export interface MaterialInfo {
  code: string
  fullName: string
  image: string | null
  numberOfParts: number | null
  lengthM: number | null
  seats1st: number | null
  seats2nd: number | null
  topSpeedKmh: number | null
  facilities: Facility[]
  facilityLabels: { key: string; icon: string; label: string }[]
  allowBikes: boolean
  totalSeats: number | null
  stockIdentifiers: string[]
  parts: Array<{
    number: string
    type: string | null
    facilities: string[]
  }>
}

export interface TrainDetail {
  serviceNumber: string
  material: MaterialInfo | null
  stops: StopInfo[]
  allowBikes: boolean
  crowdForecast: string | null
}

// ─── Per-process cache (5 min TTL) ───────────────────────────────────────────

const infoCache = new Map<string, { data: TrainDetail; ts: number }>()
const CACHE_TTL = 90_000 // 90 seconden — stops en vertraging veranderen frequent

// ─── Image URI → material type code ──────────────────────────────────────────
// NS image filenames encode the exact type, e.g. virmm1_6.png, rnet_flirt_2.png
const IMAGE_TYPE_MAP: Record<string, string> = {
  sng: 'SNG', slt: 'SLT', virm: 'VIRM', virmm1: 'VIRMM1', virmm2: 'VIRMM2',
  icm: 'ICM', icmm1: 'ICM', ddz: 'DDZ',
  icng: 'ICNG', icng_b: 'ICNG',
  nsr_flirt: 'FLIRT', rnet_flirt: 'FLIRT',
  sgm: 'SGM', talent: 'TALENT',
}

function typeFromImageUri(uri: string | null | undefined): string | null {
  if (!uri) return null
  // Extract filename without extension and trailing _N (e.g. "virmm1_6" → "virmm1")
  const filename = uri.split('/').pop() ?? ''
  const base = filename.replace(/\.png$/i, '').replace(/_\d+$/, '').toLowerCase()
  return IMAGE_TYPE_MAP[base] ?? null
}

// ─── Facility mapping ─────────────────────────────────────────────────────────

function mapFacilities(raw: string[]): Facility[] {
  return raw.map(f => {
    const u = f.toUpperCase().replace(/[_\-\s]/g, '')
    if (u === 'WIFI' || u.includes('WIFI'))         return 'wifi'
    if (u === 'FIETS' || u.includes('FIETS'))       return 'fiets'
    if (u === 'STROOM' || u === 'STOPCONTACT' || u.includes('STROOM')) return 'stopcontact'
    if (u === 'TOILET' || u === 'WC')               return 'toilet'
    if (u === 'TOEGANKELIJK' || u.includes('ACCESS')) return 'toegankelijk'
    if (u === 'RESTAURANT' || u === 'BISTRO' || u === 'RESTAURATIE') return 'restaurant'
    if (u.includes('STILLE') || u.includes('STILTE') || u.includes('QUIET')) return 'stille-coupe'
    if (u === 'AIRCO' || u.includes('AIRCO') || u.includes('CLIMATE')) return 'airco'
    return null
  }).filter((f): f is Facility => f !== null)
}

// ─── Route handler ────────────────────────────────────────────────────────────

// ─── Belgian (iRail) detail handler ──────────────────────────────────────────

async function getBelgianDetail(serviceNumber: string): Promise<TrainDetail> {
  const vehicleId = `BE.NMBS.${serviceNumber}`
  const url = `https://api.irail.be/vehicle/?id=${encodeURIComponent(vehicleId)}&format=json&lang=en`
  const now = new Date()

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Treinradar/1.0' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`iRail ${res.status}`)

    const data = await res.json()
    const rawStops = data.stops?.stop ?? []
    const stopsArr: Array<Record<string, string>> = Array.isArray(rawStops) ? rawStops : [rawStops]

    const stops: StopInfo[] = stopsArr.map((s, idx) => {
      const depSec  = parseInt(s.scheduledDepartureTime ?? '0')
      const arrSec  = parseInt(s.scheduledArrivalTime  ?? '0')
      const depDelay = parseInt(s.departureDelay ?? '0')
      const arrDelay = parseInt(s.arrivalDelay   ?? '0')

      const plannedDep = depSec ? new Date(depSec * 1000).toISOString() : null
      const plannedArr = arrSec ? new Date(arrSec * 1000).toISOString() : null
      const actualDep  = depSec ? new Date((depSec + depDelay) * 1000).toISOString() : null
      const actualArr  = arrSec ? new Date((arrSec + arrDelay) * 1000).toISOString() : null

      const passTime = actualDep ?? plannedDep ?? actualArr ?? plannedArr
      const passed   = s.left === '1' || (passTime ? new Date(passTime) < now : false)

      return {
        name:             s.station ?? '',
        uicCode:          '',
        lat:              parseFloat(s.stationinfo?.locationY ?? '0') || null,
        lng:              parseFloat(s.stationinfo?.locationX ?? '0') || null,
        plannedDeparture: idx < stopsArr.length - 1 ? plannedDep : null,
        actualDeparture:  idx < stopsArr.length - 1 ? actualDep  : null,
        plannedArrival:   idx > 0 ? plannedArr : null,
        actualArrival:    idx > 0 ? actualArr  : null,
        platform:         s.platform || null,
        passed,
        current:          false,
        cancelled:        s.canceled === '1' || s.departureCanceled === '1',
        crowdForecast:    null,
        delaySeconds:     depDelay || arrDelay,
      }
    })

    return { serviceNumber, material: null, stops, allowBikes: false, crowdForecast: null }
  } catch {
    return { serviceNumber, material: null, stops: [], allowBikes: false, crowdForecast: null }
  }
}

// ─── German (transport.rest) detail handler ───────────────────────────────────

async function getGermanDetail(serviceNumber: string): Promise<TrainDetail> {
  const tripId = activeTripIds.get(serviceNumber)
  if (!tripId) return { serviceNumber, material: null, stops: [], allowBikes: false, crowdForecast: null }

  const now = new Date()
  try {
    const trip = await fetchTrip(tripId)
    if (!trip) return { serviceNumber, material: null, stops: [], allowBikes: false, crowdForecast: null }

    const stops: StopInfo[] = (trip.stopovers ?? []).map((s, idx) => {
      const depMs = s.departure ? new Date(s.departure).getTime()
                  : s.plannedDeparture ? new Date(s.plannedDeparture).getTime() : 0
      const passed = depMs > 0 && depMs < now.getTime()

      return {
        name:             s.stop?.name ?? '',
        uicCode:          '',
        lat:              s.stop?.location?.latitude  ?? null,
        lng:              s.stop?.location?.longitude ?? null,
        plannedDeparture: idx < (trip.stopovers?.length ?? 0) - 1 ? (s.plannedDeparture ?? null) : null,
        actualDeparture:  idx < (trip.stopovers?.length ?? 0) - 1 ? (s.departure        ?? null) : null,
        plannedArrival:   idx > 0 ? (s.plannedArrival ?? null) : null,
        actualArrival:    idx > 0 ? (s.arrival        ?? null) : null,
        platform:         null,
        passed,
        current:          false,
        cancelled:        s.cancelled ?? false,
        crowdForecast:    null,
        delaySeconds:     s.departureDelay ?? s.arrivalDelay ?? 0,
      }
    })

    return { serviceNumber, material: null, stops, allowBikes: false, crowdForecast: null }
  } catch {
    return { serviceNumber, material: null, stops: [], allowBikes: false, crowdForecast: null }
  }
}

// ─── Main route handler ───────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ritnummer = req.nextUrl.searchParams.get('ritnummer')
  const operator  = req.nextUrl.searchParams.get('operator') ?? ''
  if (!ritnummer) return NextResponse.json({ error: 'ritnummer required' }, { status: 400 })

  const cacheKey = `${operator}_${ritnummer}`
  const hit = infoCache.get(cacheKey)
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return NextResponse.json(hit.data)
  }

  // ── Route to Belgian or German handler ────────────────────────────────────
  if (operator === 'NMBS') {
    const detail = await getBelgianDetail(ritnummer)
    infoCache.set(cacheKey, { data: detail, ts: Date.now() })
    return NextResponse.json(detail)
  }
  if (operator === 'DB' || operator.startsWith('DB ') || ritnummer.startsWith('DE_')) {
    const detail = await getGermanDetail(ritnummer)
    infoCache.set(cacheKey, { data: detail, ts: Date.now() })
    return NextResponse.json(detail)
  }

  const now   = new Date()
  const today = now.toISOString().slice(0, 10)

  // Load station coords for fallback
  const { data: stations } = await supabase
    .from('stations')
    .select('uic_code, name, lat, lng')

  const byUic  = new Map(stations?.map(s => [s.uic_code, s]) ?? [])
  const byName = new Map(stations?.map(s => [s.name.toLowerCase(), s]) ?? [])

  function resolveCoords(stop: { uicCode?: string; name?: string; lat?: number; lng?: number }) {
    if (stop.lat && stop.lng) return { lat: stop.lat, lng: stop.lng }
    if (stop.uicCode) {
      const s = byUic.get(stop.uicCode)
      if (s?.lat) return { lat: s.lat, lng: s.lng }
    }
    if (stop.name) {
      const s = byName.get(stop.name.toLowerCase())
      if (s?.lat) return { lat: s.lat, lng: s.lng }
    }
    return null
  }

  // ── Fetch journey payload + most recent position history in parallel ──────
  const [journeyPayload, { data: recentHistory }] = await Promise.all([
    getJourneyPayload(ritnummer, today),
    supabase
      .from('train_position_history')
      .select('materieel_nummers, type_code')
      .eq('service_number', ritnummer)
      .not('materieel_nummers', 'is', null)
      .order('recorded_at', { ascending: false })
      .limit(1),
  ])

  // Materieel numbers from VT API (stored by cron) — more reliable than journey API "0"
  const historicMaterieelNummers: number[] = recentHistory?.[0]?.materieel_nummers ?? []

  // ── Build stop list ───────────────────────────────────────────────────────
  const stops: StopInfo[] = journeyPayload.stops.map(s => {
    const dep    = s.departures?.[0]
    const arr    = s.arrivals?.[0]
    const coords = resolveCoords({ ...s.stop })

    const plannedDep = dep?.plannedTime ?? null
    const actualDep  = dep?.actualTime  ?? null
    const plannedArr = arr?.plannedTime ?? null
    const actualArr  = arr?.actualTime  ?? null

    // A stop is "passed" if actual departure/arrival time is in the past
    const passTime = actualDep ?? plannedDep ?? actualArr ?? plannedArr
    const passed   = passTime ? new Date(passTime) < now : false

    return {
      name:             s.stop?.name ?? '',
      uicCode:          s.stop?.uicCode ?? '',
      lat:              coords?.lat ?? null,
      lng:              coords?.lng ?? null,
      plannedDeparture: plannedDep,
      actualDeparture:  actualDep,
      plannedArrival:   plannedArr,
      actualArrival:    actualArr,
      platform:         dep?.actualTrack ?? dep?.plannedTrack ?? arr?.actualTrack ?? arr?.plannedTrack ?? null,
      passed,
      current:          false,
      cancelled:        dep?.cancelled ?? arr?.cancelled ?? false,
      crowdForecast:    dep?.crowdForecast ?? arr?.crowdForecast ?? null,
      delaySeconds:     dep?.delayInSeconds ?? arr?.delayInSeconds ?? 0,
    }
  })

  // ── Extract material from actualStock (with plannedStock fallback) ────────
  const stockStop  = journeyPayload.stops.find(s => s.actualStock?.trainParts?.length)
                  ?? journeyPayload.stops.find(s => s.plannedStock?.trainParts?.length)
  const stockData  = stockStop?.actualStock ?? stockStop?.plannedStock
  const firstPart  = stockData?.trainParts?.[0]

  const imageUri   = firstPart?.image?.uri ?? null
  const rawFac     = firstPart?.facilities ?? []
  const facilities = mapFacilities(rawFac)
  const numParts   = stockData?.numberOfParts ?? null
  const totalSeats = stockData?.numberOfSeats ?? null
  // Priority: per-part materialType > image URI type > top-level trainType
  // Image URI encodes exact type (e.g. virmm1_6.png → VIRMM1) — most reliable for variants
  const trainType  = firstPart?.materialType ?? typeFromImageUri(imageUri) ?? stockData?.trainType ?? null

  // Build train parts from journey API; fall back to VT API materieel numbers for "0" identifiers
  let trainParts = stockData?.trainParts?.map(p => {
    const num = p.stockIdentifier && p.stockIdentifier !== '0' ? p.stockIdentifier : ''
    return {
      number: num,
      type: p.materialType ?? trainType,
      facilities: p.facilities ?? [],
    }
  }) ?? []

  // If journey API gave us only "0" identifiers, enrich with VT API numbers from position history
  if (trainParts.length > 0 && trainParts.every(p => !p.number) && historicMaterieelNummers.length > 0) {
    trainParts = historicMaterieelNummers.map(n => ({
      number: String(n),
      type: trainType,
      facilities: [],
    }))
  }

  const effectiveStockIds = trainParts.map(p => p.number).filter(Boolean)

  let material: MaterialInfo | null = null

  if (trainType) {
    const stockResult = getStockInfo(trainType, numParts ?? 1)
    if (stockResult) {
      const mergedFac = facilities.length > 0 ? facilities : stockResult.spec.facilities
      material = {
        code:          stockResult.spec.code,
        fullName:      stockResult.spec.fullName,
        image:         imageUri ?? stockResult.image,        // live URL takes priority
        numberOfParts: numParts ?? null,
        lengthM:       stockResult.lengthM,
        seats1st:      stockResult.seats.first,
        seats2nd:      stockResult.seats.second,
        topSpeedKmh:   stockResult.spec.topSpeedKmh,
        facilities:    mergedFac,
        facilityLabels: mergedFac.map(f => ({ key: f, ...FACILITY_LABEL[f] })),
        allowBikes:    mergedFac.includes('fiets'),
        totalSeats,
        stockIdentifiers: effectiveStockIds,
        parts: trainParts,
      }
    } else if (imageUri) {
      // We have an image but no static DB entry — build minimal material
      material = {
        code:          trainType,
        fullName:      trainType,
        image:         imageUri,
        numberOfParts: numParts,
        lengthM:       null,
        seats1st:      null,
        seats2nd:      totalSeats,
        topSpeedKmh:   null,
        facilities,
        facilityLabels: facilities.map(f => ({ key: f, ...FACILITY_LABEL[f] })),
        allowBikes:    facilities.includes('fiets'),
        totalSeats,
        stockIdentifiers: effectiveStockIds,
        parts: trainParts,
      }
    }
  }

  // Crowd forecast from first departure
  const crowdForecast = journeyPayload.stops[0]?.departures?.[0]?.crowdForecast
    ?? journeyPayload.stops[0]?.arrivals?.[0]?.crowdForecast
    ?? null

  const detail: TrainDetail = {
    serviceNumber:  ritnummer,
    material,
    stops,
    allowBikes:     facilities.includes('fiets'),
    crowdForecast,
  }

  infoCache.set(cacheKey, { data: detail, ts: Date.now() })
  if (infoCache.size > 400) {
    const first = infoCache.keys().next().value
    if (first) infoCache.delete(first)
  }

  return NextResponse.json(detail)
}
