import { NextRequest, NextResponse } from 'next/server'
import { getJourneyPayload, getTrainInformationForRitnummer } from '@/lib/ns-api'
import { supabase } from '@/lib/supabase'
import { getStockInfo, extractMaterialCode, extractNumberOfParts, FACILITY_LABEL, type Facility } from '@/lib/rolling-stock'

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
}

export interface TrainDetail {
  serviceNumber: string
  material: MaterialInfo | null
  stops: StopInfo[]
  allowBikes: boolean
  crowdForecast: string | null
}

// ─── Per-process cache (5 min TTL — material rarely changes mid-journey) ──────

const infoCache = new Map<string, { data: TrainDetail; ts: number }>()
const CACHE_TTL = 5 * 60_000

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ritnummer = req.nextUrl.searchParams.get('ritnummer')
  if (!ritnummer) return NextResponse.json({ error: 'ritnummer required' }, { status: 400 })

  const hit = infoCache.get(ritnummer)
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return NextResponse.json(hit.data)
  }

  const now  = new Date()
  const today = now.toISOString().slice(0, 10)

  // Load station coords for fallback
  const { data: stations } = await supabase
    .from('stations')
    .select('uic_code, name, lat, lng')

  const byUic  = new Map(stations?.map(s => [s.uic_code, s]) ?? [])
  const byName = new Map(stations?.map(s => [s.name.toLowerCase(), s]) ?? [])

  function resolveCoords(stop: { uicCode?: string; stop?: { uicCode?: string; name?: string; lat?: number; lng?: number } }) {
    if (stop.stop?.lat && stop.stop?.lng) return { lat: stop.stop.lat, lng: stop.stop.lng }
    const uic = stop.stop?.uicCode ?? stop.uicCode
    if (uic) { const s = byUic.get(uic); if (s?.lat) return { lat: s.lat, lng: s.lng } }
    const name = stop.stop?.name
    if (name) { const s = byName.get(name.toLowerCase()); if (s?.lat) return { lat: s.lat, lng: s.lng } }
    return null
  }

  // ── Fetch journey + material in parallel ──────────────────────────────────
  const [journeyPayload, trainInfo] = await Promise.all([
    getJourneyPayload(ritnummer, today),
    getTrainInformationForRitnummer(ritnummer),
  ])

  // ── Build stop list ───────────────────────────────────────────────────────
  const stops: StopInfo[] = journeyPayload.stops.map(s => {
    const coords  = resolveCoords(s)
    const depTime = s.actualDepartureDateTime ?? s.plannedDepartureDateTime
    return {
      name:             s.stop?.name ?? '',
      uicCode:          s.stop?.uicCode ?? '',
      lat:              coords?.lat ?? null,
      lng:              coords?.lng ?? null,
      plannedDeparture: s.plannedDepartureDateTime ?? null,
      actualDeparture:  s.actualDepartureDateTime  ?? null,
      plannedArrival:   s.plannedArrivalDateTime   ?? null,
      actualArrival:    s.actualArrivalDateTime    ?? null,
      platform:         s.actualDepartureTrack ?? s.plannedDepartureTrack ?? null,
      passed:           depTime ? new Date(depTime) < now : false,
      current:          false, // determined client-side via GPS position
    }
  })

  // ── Build material info ───────────────────────────────────────────────────
  let material: MaterialInfo | null = null

  // Priority 1: trainInformation endpoint (most accurate)
  const parts = trainInfo?.materieelDelen ?? trainInfo?.trainParts
  if (parts?.length) {
    const firstPart = parts[0]
    const code = firstPart.type
    if (code) {
      const stockResult = getStockInfo(code, parts.length)
      if (stockResult) {
        // Merge static DB with live API data (live wins for seats/length)
        const liveFacilities: Facility[] = (firstPart.facilities ?? []).map(f => {
          const lower = f.toLowerCase().replace(/[^a-z]/g, '-')
          if (lower.includes('wifi'))   return 'wifi'
          if (lower.includes('stilt'))  return 'stille-coupe'
          if (lower.includes('fiets'))  return 'fiets'
          if (lower.includes('toeg') || lower.includes('access')) return 'toegankelijk'
          if (lower.includes('rest') || lower.includes('buffet')) return 'restaurant'
          if (lower.includes('stop') || lower.includes('socket')) return 'stopcontact'
          if (lower.includes('toilet')) return 'toilet'
          if (lower.includes('airco'))  return 'airco'
          return null
        }).filter((f): f is Facility => f !== null)

        const facilities = liveFacilities.length > 0 ? liveFacilities : stockResult.spec.facilities

        material = {
          code:           stockResult.spec.code,
          fullName:       stockResult.spec.fullName,
          image:          stockResult.image,
          numberOfParts:  parts.length,
          lengthM:        firstPart.lengteInMeters
            ? firstPart.lengteInMeters * parts.length
            : stockResult.lengthM,
          seats1st:       parts.reduce((s, p) => s + (p.zitplaatsen?.zitplaatsEersteKlas ?? stockResult.seats.first), 0),
          seats2nd:       parts.reduce((s, p) => s + (p.zitplaatsen?.zitplaatsTweedeKlas ?? stockResult.seats.second), 0),
          topSpeedKmh:    stockResult.spec.topSpeedKmh,
          facilities,
          facilityLabels: facilities.map(f => FACILITY_LABEL[f]),
          allowBikes:     facilities.includes('fiets') || (journeyPayload.allowCyclesOnboard ?? false),
        }
      }
    }
  }

  // Priority 2: journey payload meta (fallback)
  if (!material) {
    const matCode  = extractMaterialCode(journeyPayload as Record<string, unknown>)
    const numParts = extractNumberOfParts(journeyPayload as Record<string, unknown>)
    if (matCode) {
      const stockResult = getStockInfo(matCode, numParts)
      if (stockResult) {
        const facilities = stockResult.spec.facilities
        material = {
          code:           stockResult.spec.code,
          fullName:       stockResult.spec.fullName,
          image:          stockResult.image,
          numberOfParts:  numParts ?? null,
          lengthM:        stockResult.lengthM,
          seats1st:       stockResult.seats.first,
          seats2nd:       stockResult.seats.second,
          topSpeedKmh:    stockResult.spec.topSpeedKmh,
          facilities,
          facilityLabels: facilities.map(f => FACILITY_LABEL[f]),
          allowBikes:     facilities.includes('fiets') || (journeyPayload.allowCyclesOnboard ?? false),
        }
      }
    }
  }

  const detail: TrainDetail = {
    serviceNumber:  ritnummer,
    material,
    stops,
    allowBikes:     journeyPayload.allowCyclesOnboard ?? false,
    crowdForecast:  journeyPayload.crowdForecast ?? null,
  }

  infoCache.set(ritnummer, { data: detail, ts: Date.now() })
  if (infoCache.size > 400) {
    const first = infoCache.keys().next().value
    if (first) infoCache.delete(first)
  }

  return NextResponse.json(detail)
}
