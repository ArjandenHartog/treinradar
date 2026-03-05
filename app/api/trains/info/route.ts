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
    if (u.includes('STILLE') || u.includes('QUIET')) return 'stille-coupe'
    if (u === 'AIRCO' || u.includes('AIRCO') || u.includes('CLIMATE')) return 'airco'
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
  // materialType (per-part) takes priority over top-level trainType
  const trainType  = firstPart?.materialType ?? stockData?.trainType ?? null
  // Filter out invalid stock identifiers ("0", "")
  const stockIds   = stockData?.trainParts
    ?.map(p => p.stockIdentifier ?? '')
    .filter(id => id && id !== '0') ?? []

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

  infoCache.set(ritnummer, { data: detail, ts: Date.now() })
  if (infoCache.size > 400) {
    const first = infoCache.keys().next().value
    if (first) infoCache.delete(first)
  }

  return NextResponse.json(detail)
}
