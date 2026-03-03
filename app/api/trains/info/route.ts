import { NextRequest, NextResponse } from 'next/server'
import { getJourneyPayload } from '@/lib/ns-api'
import { supabase } from '@/lib/supabase'
import { getStockInfo, FACILITY_LABEL, type Facility } from '@/lib/rolling-stock'

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
  facilityLabels: { icon: string; label: string }[]
  allowBikes: boolean
  totalSeats: number | null
  stockIdentifiers: string[]
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
const CACHE_TTL = 5 * 60_000

// ─── Facility mapping ─────────────────────────────────────────────────────────

function mapFacilities(raw: string[]): Facility[] {
  return raw.map(f => {
    const u = f.toUpperCase()
    if (u === 'WIFI')        return 'wifi'
    if (u === 'FIETS')       return 'fiets'
    if (u === 'STROOM')      return 'stopcontact'
    if (u === 'TOILET')      return 'toilet'
    if (u === 'TOEGANKELIJK') return 'toegankelijk'
    if (u === 'RESTAURANT' || u === 'BISTRO') return 'restaurant'
    if (u === 'STILLE_COUPE' || u.includes('STILT')) return 'stille-coupe'
    if (u === 'AIRCO')       return 'airco'
    return null
  }).filter((f): f is Facility => f !== null)
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ritnummer = req.nextUrl.searchParams.get('ritnummer')
  if (!ritnummer) return NextResponse.json({ error: 'ritnummer required' }, { status: 400 })

  const hit = infoCache.get(ritnummer)
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return NextResponse.json(hit.data)
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

  // ── Fetch journey payload ─────────────────────────────────────────────────
  const journeyPayload = await getJourneyPayload(ritnummer, today)

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

  // ── Extract material from actualStock (first stop that has it) ────────────
  const stockStop  = journeyPayload.stops.find(s => s.actualStock?.trainParts?.length)
  const stockData  = stockStop?.actualStock
  const firstPart  = stockData?.trainParts?.[0]

  const imageUri   = firstPart?.image?.uri ?? null
  const rawFac     = firstPart?.facilities ?? []
  const facilities = mapFacilities(rawFac)
  const numParts   = stockData?.numberOfParts ?? null
  const totalSeats = stockData?.numberOfSeats ?? null
  const trainType  = stockData?.trainType ?? null
  const stockIds   = stockData?.trainParts?.map(p => p.stockIdentifier ?? '').filter(Boolean) ?? []

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
        facilityLabels: mergedFac.map(f => FACILITY_LABEL[f]),
        allowBikes:    mergedFac.includes('fiets'),
        totalSeats,
        stockIdentifiers: stockIds,
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
        facilityLabels: facilities.map(f => FACILITY_LABEL[f]),
        allowBikes:    facilities.includes('fiets'),
        totalSeats,
        stockIdentifiers: stockIds,
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

  infoCache.set(ritnummer, { data: detail, ts: Date.now() })
  if (infoCache.size > 400) {
    const first = infoCache.keys().next().value
    if (first) infoCache.delete(first)
  }

  return NextResponse.json(detail)
}
