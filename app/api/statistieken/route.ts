import { NextResponse } from 'next/server'
import { getVehicles } from '@/lib/ns-api'
import { supabase } from '@/lib/supabase'

export interface SpeedRecord {
  serviceNumber: string
  speedKmh: number
  origin: string
  destination: string
}

export interface StationDelayRecord {
  stationCode: string
  avgDelay: number
  trainCount: number
}

export interface CancelledTrain {
  serviceNumber: string
  typeCode: string
  operator: string
  destination: string
  departureTime: string
  stationCode: string
  cancelReason: string
  via: string
}

export interface DelayedTrain {
  serviceNumber: string
  typeCode: string
  operator: string
  destination: string
  departureTime: string
  stationCode: string
  delay: number
}

export interface StatistiekenData {
  activeTrains: number
  highestSpeed: SpeedRecord | null
  mostDelayed: { serviceNumber: string; delay: number; destination: string; origin: string } | null
  mostDelayedStation: StationDelayRecord | null
  longestTrain: { serviceNumber: string; partsCount: number; estimatedLengthM: number; origin: string; destination: string } | null
  mostSeats: { serviceNumber: string; seats: number; origin: string; destination: string } | null
  cancelledToday: number
  delayedToday: number
  totalToday: number
  cancelledList: CancelledTrain[]
  delayedList: DelayedTrain[]
  updatedAt: string
}

// Short cache to avoid hammering both NS API and Supabase simultaneously
let cache: { data: StatistiekenData; ts: number } | null = null
const CACHE_TTL = 15_000 // 15s

export async function GET() {
  try {
    const now = Date.now()
    if (cache && now - cache.ts < CACHE_TTL) {
      return NextResponse.json(cache.data)
    }

    // ── Parallel: VT API + Supabase queries ──────────────────────────────────
    const [vehicles, recentResult, todayResult, cancelledResult, delayedResult] = await Promise.allSettled([
      getVehicles({ features: 'materieel' }),
      supabase
        .from('train_departures')
        .select('service_number, operator, delay, cancelled, destination, destination_actual, station_code, origin, type_code, departure_time, cancel_reason, via, updated_at')
        .gte('updated_at', new Date(now - 5 * 60 * 1000).toISOString()),
      supabase
        .from('train_departures')
        .select('service_number, operator, delay, cancelled, updated_at')
        .gte('updated_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
      supabase
        .from('train_departures')
        .select('service_number, type_code, operator, destination, destination_actual, departure_time, station_code, cancel_reason, via')
        .eq('cancelled', true)
        .order('departure_time', { ascending: false })
        .limit(50),
      supabase
        .from('train_departures')
        .select('service_number, type_code, operator, destination, destination_actual, departure_time, station_code, delay')
        .eq('cancelled', false)
        .gte('delay', 3)
        .order('departure_time', { ascending: false })
        .limit(50),
    ])

    const trainList = vehicles.status === 'fulfilled' ? vehicles.value : []
    const recentDeps = recentResult.status === 'fulfilled' ? (recentResult.value.data ?? []) : []
    const todayDeps  = todayResult.status === 'fulfilled'  ? (todayResult.value.data  ?? []) : []
    const cancelledRows = cancelledResult.status === 'fulfilled' ? (cancelledResult.value.data ?? []) : []
    const delayedRows   = delayedResult.status === 'fulfilled'   ? (delayedResult.value.data   ?? []) : []

    // ── Deduplicate recent by service_number (latest wins) ───────────────────
    const recentByService = new Map<string, typeof recentDeps[number]>()
    for (const d of recentDeps) {
      if (!recentByService.has(d.service_number) ||
          new Date(d.updated_at) > new Date(recentByService.get(d.service_number)!.updated_at)) {
        recentByService.set(d.service_number, d)
      }
    }
    const activeArr = Array.from(recentByService.values())

    // ── Highest speed from VT API ─────────────────────────────────────────────
    let highestSpeed: SpeedRecord | null = null
    if (trainList.length) {
      const fastest = trainList.reduce((best, v) => (v.snelheid ?? 0) > (best.snelheid ?? 0) ? v : best, trainList[0])
      if (fastest && (fastest.snelheid ?? 0) > 0) {
        const id = fastest.ritId?.split('-')[0].split('_')[0] ?? ''
        const dep = recentByService.get(id)
        highestSpeed = {
          serviceNumber: id,
          speedKmh: Math.round(fastest.snelheid ?? 0),
          origin: dep?.origin ?? dep?.station_code ?? '',
          destination: dep?.destination_actual || dep?.destination || '',
        }
      }
    }

    // ── Most delayed ─────────────────────────────────────────────────────────
    const nonCancelled = activeArr.filter(t => !t.cancelled)
    const mostDelayedDep = nonCancelled.length
      ? nonCancelled.reduce((m, t) => (t.delay ?? 0) > (m.delay ?? 0) ? t : m)
      : null
    const mostDelayed = mostDelayedDep ? {
      serviceNumber: mostDelayedDep.service_number,
      delay: mostDelayedDep.delay ?? 0,
      destination: mostDelayedDep.destination_actual || mostDelayedDep.destination || '',
      origin: mostDelayedDep.origin || mostDelayedDep.station_code,
    } : null

    // ── Most delayed station ──────────────────────────────────────────────────
    const stationMap = new Map<string, { totalDelay: number; count: number }>()
    for (const t of nonCancelled) {
      if ((t.delay ?? 0) >= 3) {
        const s = t.station_code
        const prev = stationMap.get(s) ?? { totalDelay: 0, count: 0 }
        stationMap.set(s, { totalDelay: prev.totalDelay + (t.delay ?? 0), count: prev.count + 1 })
      }
    }
    let mostDelayedStation: StationDelayRecord | null = null
    for (const [code, val] of stationMap) {
      const avg = Math.round(val.totalDelay / val.count)
      if (!mostDelayedStation || avg > mostDelayedStation.avgDelay) {
        mostDelayedStation = { stationCode: code, avgDelay: avg, trainCount: val.count }
      }
    }

    // ── Longest train & most seats (from VT API materieel array) ─────────────
    let longestTrain: StatistiekenData['longestTrain'] = null
    let mostSeats: StatistiekenData['mostSeats'] = null

    for (const v of trainList) {
      const parts = v.materieel?.length ?? 0
      if (parts < 1) continue
      const id = v.ritId?.split('-')[0].split('_')[0] ?? ''
      const dep = recentByService.get(id)

      // Estimate length: ~75m per unit (average across fleet)
      const estLength = parts * 75
      if (!longestTrain || estLength > longestTrain.estimatedLengthM) {
        longestTrain = {
          serviceNumber: id,
          partsCount: parts,
          estimatedLengthM: estLength,
          origin: dep?.origin ?? dep?.station_code ?? '',
          destination: dep?.destination_actual || dep?.destination || '',
        }
      }

      // Estimate seats: ~180 seats per unit
      const estSeats = parts * 180
      if (!mostSeats || estSeats > mostSeats.seats) {
        mostSeats = {
          serviceNumber: id,
          seats: estSeats,
          origin: dep?.origin ?? dep?.station_code ?? '',
          destination: dep?.destination_actual || dep?.destination || '',
        }
      }
    }

    // ── Today totals ──────────────────────────────────────────────────────────
    const todayByService = new Map<string, typeof todayDeps[number]>()
    for (const d of todayDeps) {
      if (!todayByService.has(d.service_number) ||
          new Date(d.updated_at) > new Date(todayByService.get(d.service_number)!.updated_at)) {
        todayByService.set(d.service_number, d)
      }
    }
    const todayArr = Array.from(todayByService.values())
    const cancelledToday = todayArr.filter(t => t.cancelled).length
    const delayedToday   = todayArr.filter(t => !t.cancelled && (t.delay ?? 0) >= 3).length
    const totalToday     = todayArr.length

    // ── Format lists ──────────────────────────────────────────────────────────
    const cancelledList: CancelledTrain[] = cancelledRows.map(r => ({
      serviceNumber: r.service_number,
      typeCode: r.type_code ?? '',
      operator: r.operator ?? 'NS',
      destination: r.destination_actual || r.destination || '',
      departureTime: r.departure_time ?? '',
      stationCode: r.station_code,
      cancelReason: (r.cancel_reason as string | null) ?? '',
      via: r.via ?? '',
    }))

    const delayedList: DelayedTrain[] = delayedRows.map(r => ({
      serviceNumber: r.service_number,
      typeCode: r.type_code ?? '',
      operator: r.operator ?? 'NS',
      destination: r.destination_actual || r.destination || '',
      departureTime: r.departure_time ?? '',
      stationCode: r.station_code,
      delay: r.delay ?? 0,
    }))

    const data: StatistiekenData = {
      activeTrains: trainList.length,
      highestSpeed,
      mostDelayed,
      mostDelayedStation,
      longestTrain,
      mostSeats,
      cancelledToday,
      delayedToday,
      totalToday,
      cancelledList,
      delayedList,
      updatedAt: new Date().toISOString(),
    }

    cache = { data, ts: now }
    return NextResponse.json(data)
  } catch (err) {
    console.error('[statistieken]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
