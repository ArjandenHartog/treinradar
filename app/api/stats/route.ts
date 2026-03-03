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

type Departure = {
  service_number: string
  operator: string | null
  delay: number | null
  cancelled: boolean
  destination: string | null
  station_code: string
  departure_time: string
  updated_at: string
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
  onTimeToday?: number
  cancelledPercentage?: number
}

export async function GET() {
  try {
    // Active trains - updated in last 5 minutes
    const { data: recentDepartures, error } = await supabase
      .from('train_departures')
      .select('service_number, operator, delay, cancelled, destination, station_code, departure_time, updated_at')
      .gte('updated_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())

    if (error) throw error

    // Deduplicate recent by service_number (latest record wins)
    const recentByService = new Map<string, Departure>()
    for (const d of (recentDepartures ?? [])) {
      if (!recentByService.has(d.service_number) ||
        new Date(d.updated_at) > new Date(recentByService.get(d.service_number)!.updated_at)) {
        recentByService.set(d.service_number, d)
      }
    }

    const activeTrains = Array.from(recentByService.values())

    // Total today - all unique trains since start of today
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { data: todayDepartures } = await supabase
      .from('train_departures')
      .select('service_number, operator, delay, cancelled, destination, station_code, departure_time, updated_at')
      .gte('updated_at', todayStart.toISOString())

    // Deduplicate by service_number for today's total
    const todayByService = new Map<string, Departure>()
    for (const d of (todayDepartures ?? [])) {
      if (!todayByService.has(d.service_number) ||
        new Date(d.updated_at) > new Date(todayByService.get(d.service_number)!.updated_at)) {
        todayByService.set(d.service_number, d)
      }
    }

    const trainsToday = Array.from(todayByService.values())
    const total = activeTrains.length
    const totalToday = trainsToday.length
    const cancelled = activeTrains.filter(t => t.cancelled).length
    const cancelledToday = trainsToday.filter(t => t.cancelled).length
    const delayed = activeTrains.filter(t => !t.cancelled && (t.delay ?? 0) >= 3).length
    const delayedToday = trainsToday.filter(t => !t.cancelled && (t.delay ?? 0) >= 3).length
    const onTime = activeTrains.filter(t => !t.cancelled && (t.delay ?? 0) < 3).length
    const avgDelay = total > 0
      ? Math.round(activeTrains.reduce((s, t) => s + (t.delay ?? 0), 0) / total)
      : 0
    const avgDelayToday = totalToday > 0
      ? Math.round(trainsToday.reduce((s, t) => s + (t.delay ?? 0), 0) / totalToday)
      : 0
    const punctuality = total > 0 ? Math.round((onTime / total) * 1000) / 10 : 100

    // Per-carrier stats
    const carrierMap = new Map<string, CarrierStat>()
    for (const t of activeTrains) {
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
    const nonCancelled = activeTrains.filter(t => !t.cancelled)
    const mostDelayed = nonCancelled.length > 0
      ? nonCancelled.reduce((max, t) => (t.delay ?? 0) > (max.delay ?? 0) ? t : max)
      : null

    return NextResponse.json({
      activeTrains: total,
      cancelledToday,
      totalToday,
      delayedToday,
      avgDelay: avgDelayToday,
      punctuality,
      carriers,
      mostDelayed: mostDelayed ? {
        serviceNumber: mostDelayed.service_number,
        delay: mostDelayed.delay ?? 0,
        destination: mostDelayed.destination ?? '',
        origin: mostDelayed.station_code,
      } : null,
      updatedAt: new Date().toISOString(),
      // Extra stats
      onTimeToday: Math.max(0, totalToday - delayedToday - cancelledToday),
      cancelledPercentage: totalToday > 0 ? Math.round((cancelledToday / totalToday) * 1000) / 10 : 0,
    } satisfies TrainStats)
  } catch (err) {
    console.error('Stats error:', err)
    return NextResponse.json({ error: 'Failed to compute stats' }, { status: 500 })
  }
}
