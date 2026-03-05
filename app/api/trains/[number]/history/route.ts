import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export interface TrainHistoryPoint {
  lat: number
  lng: number
  speedKmh: number
  heading: number
  delay: number
  cancelled: boolean
  destination: string
  origin: string
  recordedAt: string
}

export interface TrainHistoryStats {
  serviceNumber: string
  typeCode: string
  operator: string
  totalPoints: number
  firstSeen: string
  lastSeen: string
  maxSpeedKmh: number
  avgSpeedKmh: number
  avgDelay: number
  maxDelay: number
  cancelledCount: number
  uniqueDestinations: string[]
  history: TrainHistoryPoint[]
}

/**
 * GET /api/trains/[number]/history?days=7
 * Returns position history + computed stats for a given service number.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ number: string }> }
) {
  const { number: serviceNumber } = await params
  const days = Math.min(14, parseInt(req.nextUrl.searchParams.get('days') ?? '7'))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('train_position_history')
    .select('*')
    .eq('service_number', serviceNumber)
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: true })
    .limit(2000)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Geen data gevonden' }, { status: 404 })
  }

  const history: TrainHistoryPoint[] = data.map(r => ({
    lat:         r.lat,
    lng:         r.lng,
    speedKmh:    r.speed_kmh ?? 0,
    heading:     r.heading ?? 0,
    delay:       r.delay ?? 0,
    cancelled:   r.cancelled ?? false,
    destination: r.destination ?? '',
    origin:      r.origin ?? '',
    recordedAt:  r.recorded_at,
  }))

  const speeds = history.map(h => h.speedKmh)
  const delays = history.map(h => h.delay)
  const destinations = [...new Set(history.map(h => h.destination).filter(Boolean))]

  const stats: TrainHistoryStats = {
    serviceNumber,
    typeCode:           data[data.length - 1]?.type_code ?? '',
    operator:           data[data.length - 1]?.operator ?? 'NS',
    totalPoints:        history.length,
    firstSeen:          history[0].recordedAt,
    lastSeen:           history[history.length - 1].recordedAt,
    maxSpeedKmh:        Math.max(...speeds),
    avgSpeedKmh:        Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length),
    avgDelay:           Math.round(delays.reduce((a, b) => a + b, 0) / delays.length),
    maxDelay:           Math.max(...delays),
    cancelledCount:     history.filter(h => h.cancelled).length,
    uniqueDestinations: destinations,
    history,
  }

  return NextResponse.json(stats)
}
