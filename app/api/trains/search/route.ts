import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export interface SearchResult {
  serviceNumber: string
  typeCode: string
  operator: string
  destination: string
  lastSeen: string
  delay: number
  cancelled: boolean
  /** materieel nummers die overeenkomen met de zoekopdracht */
  matchedMaterialNumbers?: number[]
  /** stats uit history (indien beschikbaar) */
  maxSpeedKmh?: number
  avgSpeedKmh?: number
  avgDelay?: number
}

/**
 * GET /api/trains/search?q=<query>
 * Lightning-fast type-ahead search over train service numbers,
 * material numbers, destinations, operators and train types.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 1) return NextResponse.json({ results: [] })

  const isNum = /^\d+$/.test(q)

  // ── 1. Search train_departures ────────────────────────────────────────────
  let depResults: Array<{
    service_number: string
    type_code: string | null
    operator: string | null
    destination: string
    departure_time: string | null
    delay: number | null
    cancelled: boolean | null
  }> = []

  if (isNum) {
    // Numeric: search by service number prefix
    const { data } = await supabase
      .from('train_departures')
      .select('service_number, type_code, operator, destination, departure_time, delay, cancelled')
      .ilike('service_number', `${q}%`)
      .order('departure_time', { ascending: false })
      .limit(30)
    depResults = data ?? []
  } else {
    // Text: search by destination OR operator OR type
    const { data } = await supabase
      .from('train_departures')
      .select('service_number, type_code, operator, destination, departure_time, delay, cancelled')
      .or(`destination.ilike.%${q}%,operator.ilike.%${q}%,type_code.ilike.%${q}%`)
      .order('departure_time', { ascending: false })
      .limit(40)
    depResults = data ?? []
  }

  // ── 2. Search position_history for materieel nummer (numeric only) ────────
  let materialMatches: Array<{
    service_number: string
    type_code: string | null
    operator: string | null
    destination: string | null
    recorded_at: string
    materieel_nummers: number[] | null
  }> = []

  if (isNum) {
    const numVal = parseInt(q)
    // Search for any materieel nummer that contains q as substring
    // We use the history table's GIN index for exact match,
    // and a fallback text search for partial matches
    const { data: exactMatch } = await supabase
      .from('train_position_history')
      .select('service_number, type_code, operator, destination, recorded_at, materieel_nummers')
      .contains('materieel_nummers', [numVal])
      .order('recorded_at', { ascending: false })
      .limit(20)
    materialMatches = exactMatch ?? []

    // Also partial match: numbers that start with q (e.g. "23" matches 2301, 2356)
    if (q.length <= 4 && materialMatches.length < 10) {
      const lo = parseInt(q) * Math.pow(10, Math.max(0, 4 - q.length))
      const hi = (parseInt(q) + 1) * Math.pow(10, Math.max(0, 4 - q.length)) - 1
      const { data: rangeMatch } = await supabase
        .from('train_position_history')
        .select('service_number, type_code, operator, destination, recorded_at, materieel_nummers')
        .gte('id', 0) // placeholder to allow .or chaining
        .order('recorded_at', { ascending: false })
        .limit(20)
      // filter client-side for range
      const filtered = (rangeMatch ?? []).filter(r =>
        r.materieel_nummers?.some((n: number) => n >= lo && n <= hi)
      )
      for (const m of filtered) {
        if (!materialMatches.find(x => x.service_number === m.service_number)) {
          materialMatches.push(m)
        }
      }
    }
  }

  // ── 3. Merge + deduplicate ────────────────────────────────────────────────
  const seen = new Map<string, SearchResult>()

  for (const d of depResults) {
    if (seen.has(d.service_number)) continue
    seen.set(d.service_number, {
      serviceNumber: d.service_number,
      typeCode:      d.type_code ?? '',
      operator:      d.operator ?? 'NS',
      destination:   d.destination ?? '',
      lastSeen:      d.departure_time ?? '',
      delay:         d.delay ?? 0,
      cancelled:     d.cancelled ?? false,
    })
  }

  for (const m of materialMatches) {
    const existing = seen.get(m.service_number)
    const matchedNums = m.materieel_nummers?.filter(n =>
      String(n).includes(q)
    ) ?? []
    if (existing) {
      existing.matchedMaterialNumbers = matchedNums
    } else {
      seen.set(m.service_number, {
        serviceNumber:        m.service_number,
        typeCode:             m.type_code ?? '',
        operator:             m.operator ?? 'NS',
        destination:          m.destination ?? '',
        lastSeen:             m.recorded_at,
        delay:                0,
        cancelled:            false,
        matchedMaterialNumbers: matchedNums,
      })
    }
  }

  // ── 4. Enrich with speed stats from history ───────────────────────────────
  const serviceNumbers = [...seen.keys()].slice(0, 15)
  if (serviceNumbers.length > 0) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: histStats } = await supabase
      .from('train_position_history')
      .select('service_number, speed_kmh, delay')
      .in('service_number', serviceNumbers)
      .gte('recorded_at', since)
      .gt('speed_kmh', 0)

    if (histStats && histStats.length > 0) {
      // Group by service_number
      const byService = new Map<string, { speeds: number[]; delays: number[] }>()
      for (const h of histStats) {
        if (!byService.has(h.service_number)) byService.set(h.service_number, { speeds: [], delays: [] })
        byService.get(h.service_number)!.speeds.push(h.speed_kmh ?? 0)
        byService.get(h.service_number)!.delays.push(h.delay ?? 0)
      }
      for (const [sn, stats] of byService) {
        const result = seen.get(sn)
        if (!result) continue
        result.maxSpeedKmh = Math.max(...stats.speeds)
        result.avgSpeedKmh = Math.round(stats.speeds.reduce((a, b) => a + b, 0) / stats.speeds.length)
        result.avgDelay    = Math.round(stats.delays.reduce((a, b) => a + b, 0) / stats.delays.length)
      }
    }
  }

  const results = [...seen.values()].slice(0, 20)
  return NextResponse.json({ results })
}
