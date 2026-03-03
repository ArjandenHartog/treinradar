'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Header } from '@/components/header'
import { LiveClock } from '@/components/live-clock'
import { StatCard } from '@/components/stat-card'
import { CarrierTable } from '@/components/carrier-table'
import { PunctualityChart, type PunctualityPoint } from '@/components/punctuality-chart'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { supabase, type Station } from '@/lib/supabase'
import type { TrainStats } from '@/app/api/stats/route'
import type { PositionedTrain } from '@/app/api/trains/positions/route'
import { cn } from '@/lib/utils'

const TrainMap = dynamic(() => import('@/components/train-map'), { ssr: false })

// ─── RefreshIcon ────────────────────────────────────────────────────────────

const RefreshIcon = ({ spinning }: { spinning: boolean }) => (
  <svg className={cn('h-3.5 w-3.5 transition-transform', spinning && 'animate-spin')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
  </svg>
)

// ─── Icon components for stat cards ──────────────────────────────────────────

const TrainIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 15.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V5c0-3.5-3.58-4-8-4s-8 .5-8 4v10.5zm8 1.5c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm6-7H6V5h12v5z"/>
  </svg>
)

const AlertIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
  </svg>
)

const ClockIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const XIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const ChartIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
  </svg>
)

// ─── Disruption item ──────────────────────────────────────────────────────────

interface Disruption {
  id: string
  title: string
  type: string
  impact: string
  topic: string
  expectation: string
  period: string
  additional_travel_time: {
    label: string
    shortLabel: string
    min: number
    max: number
  } | null
  start_time: string | null
  end_time: string | null
  affected_stations: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return null
  const date = new Date(dateStr)
  return date.toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

type Tab = 'radar' | 'verstoringen'

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>('radar')
  const [stations, setStations] = useState<Station[]>([])
  const [positionedTrains, setPositionedTrains] = useState<PositionedTrain[]>([])
  const [stats, setStats] = useState<TrainStats | null>(null)
  const [disruptions, setDisruptions] = useState<Disruption[]>([])
  const [punctualityHistory, setPunctualityHistory] = useState<PunctualityPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const mounted = useRef(true)

  // ── Fetchers ─────────────────────────────────────────────────────────────────

  const fetchStations = useCallback(async () => {
    const res = await fetch('/api/stations')
    if (!res.ok || !mounted.current) return
    const data: Station[] = await res.json()
    setStations(data)
  }, [])

  const fetchTrains = useCallback(async () => {
    // Refresh NS API cache in Supabase (fire-and-forget)
    fetch('/api/trains').catch(() => {})
    // Then fetch computed positions
    const res = await fetch('/api/trains/positions')
    if (!res.ok || !mounted.current) return
    const data: { trains: PositionedTrain[] } = await res.json()
    setPositionedTrains(data.trains ?? [])
  }, [])

  const fetchStats = useCallback(async () => {
    const res = await fetch('/api/stats')
    if (!res.ok || !mounted.current) return
    const data: TrainStats = await res.json()
    setStats(data)
    setLastUpdate(new Date())
    setPunctualityHistory(prev => {
      const time = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
      const point: PunctualityPoint = {
        time,
        punctuality: data.punctuality,
        onTime: Math.max(0, data.totalToday - data.delayedToday - data.cancelledToday),
        total: data.totalToday,
      }
      return [...prev, point].slice(-18)
    })
  }, [])

  const fetchDisruptions = useCallback(async () => {
    const res = await fetch('/api/disruptions')
    if (!res.ok || !mounted.current) return
    const data: { disruptions: Disruption[] } = await res.json()
    setDisruptions(data.disruptions ?? [])
  }, [])

  // Read disruptions directly from Supabase (no API call + no upsert = no realtime loop)
  const readDisruptionsFromDb = useCallback(async () => {
    if (!mounted.current) return
    const { data } = await supabase
      .from('disruptions')
      .select('id, title, type, impact, affected_stations')
    if (data && mounted.current) setDisruptions(data as Disruption[])
  }, [])

  const refreshAll = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([fetchTrains(), fetchStats(), fetchDisruptions()])
    setRefreshing(false)
  }, [fetchTrains, fetchStats, fetchDisruptions])

  // ── Mount ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    mounted.current = true
    const init = async () => {
      await Promise.all([fetchStations(), fetchTrains(), fetchStats(), fetchDisruptions()])
      if (mounted.current) setLoading(false)
    }
    init()
    return () => { mounted.current = false }
  }, [fetchStations, fetchTrains, fetchStats, fetchDisruptions])

  // ── Polling ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const t1 = setInterval(fetchTrains, 5_000) // Elke 5s voor supersnelle snelheid updates
    const t2 = setInterval(fetchStats, 30_000)
    const t3 = setInterval(fetchDisruptions, 90_000)
    return () => { clearInterval(t1); clearInterval(t2); clearInterval(t3) }
  }, [fetchTrains, fetchStats, fetchDisruptions])

  // ── Supabase realtime ─────────────────────────────────────────────────────────

  useEffect(() => {
    const ch = supabase
      .channel('disruptions_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'disruptions' }, readDisruptionsFromDb)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [readDisruptionsFromDb])

  // ── Derived ───────────────────────────────────────────────────────────────────

  const punctAvg = punctualityHistory.length
    ? punctualityHistory.reduce((s, p) => s + p.punctuality, 0) / punctualityHistory.length
    : stats?.punctuality ?? 0

  const allDisruptions = disruptions
  const activeDisruptions = disruptions.filter(d => d.type !== 'MAINTENANCE')
  const activeTrains = positionedTrains.filter(t => !t.cancelled)

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">

      <Header />

      {/* DASHBOARD: Refresh + Live status */}
      <div className="sticky top-0 z-40 border-b border-white/[0.06] bg-background/95 backdrop-blur-md -mt-px">
        <div className="mx-auto flex max-w-[1600px] items-center px-4 py-2.5">
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={refreshAll}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Vernieuwen"
            >
              <RefreshIcon spinning={refreshing} />
              {lastUpdate && (
                <span className="hidden font-mono text-[9px] text-zinc-700 lg:block">
                  {lastUpdate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </button>

            <div className="flex items-center gap-1.5">
              <span className="live-dot h-2 w-2 rounded-full bg-green-500" />
              <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-green-500">Live</span>
            </div>

            <Separator orientation="vertical" className="h-6 opacity-10" />
            <LiveClock />
          </div>
        </div>
      </div>

      {/* MAIN */}
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-4 py-4">

        {/* ── RADAR TAB ── */}
        {tab === 'radar' && (
          <>
            {/* STAT CARDS */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard
                label="Actieve treinen"
                value={stats?.activeTrains ?? '—'}
                sub="Treinen met GPS-positie"
                accent="blue"
                loading={loading}
                icon={<TrainIcon />}
              />
              <StatCard
                label="Vertraagd vandaag"
                value={stats?.delayedToday ?? '—'}
                sub={stats ? `${((stats.delayedToday / Math.max(stats.totalToday, 1)) * 100).toFixed(0)}% van totaal` : undefined}
                accent="amber"
                loading={loading}
                icon={<ClockIcon />}
              />
              <StatCard
                label="Geannuleerd vandaag"
                value={stats?.cancelledToday ?? '—'}
                sub="Treinen geannuleerd"
                accent="red"
                loading={loading}
                icon={<XIcon />}
              />
              <StatCard
                label="Treinen vandaag"
                value={stats?.totalToday ?? '—'}
                sub={stats ? `${stats.delayedToday} vertraagd` : undefined}
                accent="zinc"
                loading={loading}
                icon={<TrainIcon />}
              />
              <StatCard
                label="Meeste vertraging"
                value={stats?.mostDelayed ? `+${stats.mostDelayed.delay} min` : '—'}
                sub={stats?.mostDelayed ? `Trein ${stats.mostDelayed.serviceNumber}` : undefined}
                sub2={stats?.mostDelayed ? `${stats.mostDelayed.origin} → ${stats.mostDelayed.destination}` : undefined}
                accent="red"
                loading={loading}
                icon={<AlertIcon />}
              />
              <StatCard
                label="Punctualiteit NL"
                value={stats ? `${stats.punctuality.toFixed(1)}%` : '—'}
                sub="< 3 min = op tijd"
                accent={
                  !stats ? 'zinc' :
                  stats.punctuality >= 90 ? 'green' :
                  stats.punctuality >= 80 ? 'amber' : 'red'
                }
                loading={loading}
                icon={<ChartIcon />}
              />
            </div>

            {/* MAP + SIDEBAR */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]" style={{ minHeight: 520 }}>

              {/* Map */}
              <div className="relative overflow-hidden rounded-lg border border-white/[0.06]">
                {/* Legend */}
                <div className="absolute bottom-3 left-3 z-[1000] flex items-center gap-3 rounded-md border border-white/[0.08] bg-zinc-900/90 px-3 py-2 text-[10px] font-mono backdrop-blur-sm">
                  <span className="uppercase tracking-wider text-zinc-600">Status</span>
                  {[
                    { color: '#22c55e', label: 'Op tijd' },
                    { color: '#f59e0b', label: 'Vertraagd' },
                    { color: '#ef4444', label: 'Geannuleerd' },
                  ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-zinc-400">{label}</span>
                    </div>
                  ))}
                </div>

                {/* Active count */}
                <div className="absolute right-12 top-3 z-[1000] rounded-md border border-white/[0.08] bg-zinc-900/90 px-2.5 py-1.5 backdrop-blur-sm">
                  <span className="font-mono text-[11px] font-semibold tabular-nums text-blue-400">
                    {activeTrains.length}
                  </span>
                  <span className="ml-1 text-[9px] uppercase tracking-wider text-zinc-600">treinen</span>
                </div>

                <div className="h-full" style={{ minHeight: 480 }}>
                  <TrainMap stations={stations} trains={positionedTrains} />
                </div>
              </div>

              {/* Sidebar */}
              <div className="flex flex-col gap-3">

                {/* Punctuality breakdown */}
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                  <h3 className="mb-3 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                    Punctualiteit overzicht
                  </h3>
                  {stats ? (
                    <>
                      <div className="mb-3 flex items-end gap-2">
                        <span className={cn(
                          'font-mono text-3xl font-bold tabular-nums leading-none',
                          stats.punctuality >= 90 ? 'text-green-400' :
                          stats.punctuality >= 80 ? 'text-amber-400' : 'text-red-400'
                        )}>
                          {stats.punctuality.toFixed(1)}%
                        </span>
                        <span className="mb-0.5 text-[10px] text-zinc-600">punctualiteit NL</span>
                      </div>

                      {/* Tricolor bar */}
                      <div className="mb-3 h-2 overflow-hidden rounded-full bg-white/[0.04]">
                        <div className="flex h-full">
                          <div className="h-full bg-green-500 transition-all duration-700"
                            style={{ width: `${Math.max(0, stats.totalToday - stats.delayedToday - stats.cancelledToday) / Math.max(stats.totalToday, 1) * 100}%` }} />
                          <div className="h-full bg-amber-500 transition-all duration-700"
                            style={{ width: `${stats.delayedToday / Math.max(stats.totalToday, 1) * 100}%` }} />
                          <div className="h-full bg-red-500/70 transition-all duration-700"
                            style={{ width: `${stats.cancelledToday / Math.max(stats.totalToday, 1) * 100}%` }} />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        {[
                          { label: 'Op tijd', value: Math.max(0, stats.totalToday - stats.delayedToday - stats.cancelledToday), color: 'text-green-400' },
                          { label: 'Vertraagd', value: stats.delayedToday, color: 'text-amber-400' },
                          { label: 'Uitval', value: stats.cancelledToday, color: 'text-red-400' },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="rounded-md bg-white/[0.03] py-2">
                            <div className={cn('font-mono text-lg font-bold tabular-nums', color)}>{value}</div>
                            <div className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 space-y-1 border-t border-white/[0.04] pt-3 font-mono text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-zinc-600">Gem. vertraging</span>
                          <span className="tabular-nums text-zinc-400">
                            {Math.floor(stats.avgDelay)}m {Math.round((stats.avgDelay % 1) * 60)}s
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-600">Totaal geselecteerd</span>
                          <span className="tabular-nums text-zinc-400">{stats.totalToday} treinen</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-5 animate-pulse rounded bg-white/[0.04]" />
                      ))}
                    </div>
                  )}
                </div>

                {/* Disruptions */}
                <div className="flex-1 overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                  <h3 className="mb-3 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                    <span>Verstoringen & Onderhoud</span>
                    {allDisruptions.length > 0 && (
                      <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[9px] font-semibold text-red-400">
                        {allDisruptions.length}
                      </span>
                    )}
                  </h3>

                  {allDisruptions.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-6 text-center">
                      <svg className="h-7 w-7 text-green-500/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-[11px] text-zinc-600">Geen verstoringen of onderhoud</span>
                    </div>
                  ) : (
                    <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 200 }}>
                      {allDisruptions.slice(0, 6).map(d => (
                        <div key={d.id} className={cn(
                          "rounded-md border px-3 py-2",
                          d.type === 'MAINTENANCE' 
                            ? "border-blue-500/10 bg-blue-500/[0.04]" 
                            : "border-amber-500/10 bg-amber-500/[0.04]"
                        )}>
                          <div className="flex items-start gap-2">
                            <svg className={cn(
                              "mt-0.5 h-3 w-3 shrink-0",
                              d.type === 'MAINTENANCE' ? "text-blue-400" : "text-amber-400"
                            )} fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                            </svg>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge
                                  variant={d.type === 'CALAMITY' ? 'destructive' : d.type === 'MAINTENANCE' ? 'secondary' : 'outline'}
                                  className="text-[9px] px-1.5 py-0.5"
                                >
                                  {d.type}
                                </Badge>
                              </div>
                              <p className="text-[11px] font-medium leading-snug text-white/90">{d.title}</p>
                              {d.impact && <p className="mt-0.5 text-[10px] text-zinc-500">{d.impact}</p>}
                              {d.expectation && <p className="mt-0.5 text-[10px] text-zinc-500">{d.expectation}</p>}
                              {d.additional_travel_time && (
                                <p className="mt-0.5 text-[10px] text-amber-400">
                                  +{d.additional_travel_time.min}-{d.additional_travel_time.max} min extra reistijd
                                </p>
                              )}
                              {(d.start_time || d.end_time) && (
                                <p className="mt-0.5 text-[9px] text-zinc-600">
                                  {d.start_time && `Van ${formatDateTime(d.start_time)}`}
                                  {d.start_time && d.end_time && ' '}
                                  {d.end_time && `tot ${formatDateTime(d.end_time)}`}
                                </p>
                              )}
                              {d.affected_stations?.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {d.affected_stations.slice(0, 4).map((s, si) => (
                                    <span key={`${d.id}-s-${si}`} className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[9px] text-zinc-500">{s}</span>
                                  ))}
                                  {d.affected_stations.length > 4 && (
                                    <span className="text-[9px] text-zinc-700">+{d.affected_stations.length - 4}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* PUNCTUALITY CHART */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                  Punctualiteit per 5 minuten
                </h3>
                <div className="flex items-center gap-4 font-mono text-[10px]">
                  <span className="text-zinc-600">
                    Gemiddeld: <span className="text-zinc-400">{punctAvg.toFixed(1)}%</span>
                  </span>
                  {punctualityHistory.length > 1 && (
                    <>
                      <span className="text-zinc-600">
                        Laagste:{' '}
                        <span className="text-amber-400">
                          {Math.min(...punctualityHistory.map(p => p.punctuality)).toFixed(1)}%
                        </span>
                      </span>
                      <span className="font-semibold text-green-400">
                        {punctualityHistory[punctualityHistory.length - 1].punctuality.toFixed(1)}%
                      </span>
                    </>
                  )}
                  {punctualityHistory.length > 0 && stats && (
                    <span className="text-zinc-600">
                      {punctualityHistory[punctualityHistory.length - 1]?.onTime ?? 0} op tijd / {stats.totalToday} totaal
                    </span>
                  )}
                </div>
              </div>
              <PunctualityChart data={punctualityHistory} avg={punctAvg} />
              {punctualityHistory.length === 0 && (
                <p className="mt-1 text-center text-[10px] text-zinc-700">
                  Grafiek vult op zodra data binnenkomt…
                </p>
              )}
            </div>

            {/* CARRIER TABLE */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                  Punctualiteit per vervoerder
                </h3>
                <span className="text-[9px] text-zinc-700">{'< 3 min = op tijd'}</span>
              </div>
              <CarrierTable carriers={stats?.carriers ?? []} loading={loading} />
            </div>
          </>
        )}

        {/* ── VERSTORINGEN TAB ── */}
        {tab === 'verstoringen' && (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6">
            <h2 className="mb-4 text-sm font-semibold text-white">
              Actuele verstoringen & onderhoud
              {allDisruptions.length > 0 && (
                <Badge variant="destructive" className="ml-2 text-[10px]">
                  {allDisruptions.length}
                </Badge>
              )}
            </h2>
            {allDisruptions.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <svg className="h-10 w-10 text-green-500/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-zinc-500">Geen verstoringen of onderhoud op dit moment.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {allDisruptions.map(d => (
                  <div key={d.id} className={cn(
                    "rounded-lg border p-4",
                    d.type === 'MAINTENANCE' 
                      ? "border-blue-500/10 bg-blue-500/[0.02]" 
                      : "border-white/[0.06] bg-white/[0.02]"
                  )}>
                    <div className="mb-2 flex items-center gap-2">
                      <Badge
                        variant={d.type === 'CALAMITY' ? 'destructive' : d.type === 'MAINTENANCE' ? 'secondary' : 'outline'}
                        className="text-[10px]"
                      >
                        {d.type}
                      </Badge>
                      <span className="text-sm font-medium text-white">{d.title}</span>
                    </div>
                    {d.impact && <p className="mb-2 text-xs text-zinc-400">{d.impact}</p>}
                    {d.expectation && <p className="mb-1 text-xs text-zinc-400">{d.expectation}</p>}
                    {d.additional_travel_time && (
                      <p className="mb-1 text-xs text-amber-400">
                        +{d.additional_travel_time.min}-{d.additional_travel_time.max} min extra reistijd
                      </p>
                    )}
                    {(d.start_time || d.end_time) && (
                      <p className="mb-2 text-xs text-zinc-500">
                        {d.start_time && `Van ${formatDateTime(d.start_time)}`}
                        {d.start_time && d.end_time && ' '}
                        {d.end_time && `tot ${formatDateTime(d.end_time)}`}
                      </p>
                    )}
                    {d.affected_stations?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {d.affected_stations.map((s, si) => (
                          <span key={`${d.id}-vs-${si}`} className="rounded bg-white/[0.05] px-2 py-0.5 font-mono text-[10px] text-zinc-400">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}
