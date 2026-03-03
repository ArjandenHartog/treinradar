import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export interface CarrierStat {
  operator: string
  total: number
  onTime: number
  delayed: number
  cancelled: number
  avgDelay: number
  punctuality: number
}

export interface TrainStats {
  activeTrains: number
  cancelledToday: number
  totalToday: number
  delayedToday: number
  avgDelay: number
  punctuality: number
  carriers: CarrierStat[]
  mostDelayed: { serviceNumber: string; delay: number; destination: string; origin: string } | null
  updatedAt: string
}

export async function GET() {
  try {
    const { data: departures, error } = await supabase
      .from('train_departures')
      .select('service_number, operator, delay, cancelled, destination, station_code, departure_time, updated_at')
      .gte('updated_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()) // last 5 min

    if (error) throw error

    // Deduplicate by service_number (latest record wins)
    const byService = new Map<string, typeof departures[0]>()
    for (const d of (departures ?? [])) {
      if (!byService.has(d.service_number) ||
        new Date(d.updated_at) > new Date(byService.get(d.service_number)!.updated_at)) {
        byService.set(d.service_number, d)
      }
    }

    const trains = Array.from(byService.values())
    const total = trains.length
    const cancelled = trains.filter(t => t.cancelled).length
    const delayed = trains.filter(t => !t.cancelled && (t.delay ?? 0) >= 3).length
    const onTime = trains.filter(t => !t.cancelled && (t.delay ?? 0) < 3).length
    const avgDelay = total > 0
      ? Math.round(trains.reduce((s, t) => s + (t.delay ?? 0), 0) / total)
      : 0
    const punctuality = total > 0 ? Math.round((onTime / total) * 1000) / 10 : 100

    // Per-carrier stats
    const carrierMap = new Map<string, CarrierStat>()
    for (const t of trains) {
      const op = t.operator || 'NS'
      if (!carrierMap.has(op)) {
        carrierMap.set(op, { operator: op, total: 0, onTime: 0, delayed: 0, cancelled: 0, avgDelay: 0, punctuality: 0 })
      }
      const c = carrierMap.get(op)!
      c.total++
      if (t.cancelled) c.cancelled++
      else if ((t.delay ?? 0) >= 3) c.delayed++
      else c.onTime++
      c.avgDelay += t.delay ?? 0
    }
    const carriers: CarrierStat[] = Array.from(carrierMap.values()).map(c => ({
      ...c,
      avgDelay: c.total > 0 ? Math.round(c.avgDelay / c.total) : 0,
      punctuality: c.total > 0 ? Math.round((c.onTime / (c.total - c.cancelled || 1)) * 1000) / 10 : 100,
    })).sort((a, b) => b.total - a.total)

    // Most delayed train
    const nonCancelled = trains.filter(t => !t.cancelled)
    const mostDelayed = nonCancelled.length > 0
      ? nonCancelled.reduce((max, t) => (t.delay ?? 0) > (max.delay ?? 0) ? t : max)
      : null

    return NextResponse.json({
      activeTrains: total,
      cancelledToday: cancelled,
      totalToday: total,
      delayedToday: delayed,
      avgDelay,
      punctuality,
      carriers,
      mostDelayed: mostDelayed ? {
        serviceNumber: mostDelayed.service_number,
        delay: mostDelayed.delay,
        destination: mostDelayed.destination,
        origin: mostDelayed.station_code,
      } : null,
      updatedAt: new Date().toISOString(),
    } satisfies TrainStats)
  } catch (err) {
    console.error('Stats error:', err)
    return NextResponse.json({ error: 'Failed to compute stats' }, { status: 500 })
  }
}
