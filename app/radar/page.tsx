'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Header } from '@/components/header'
import { supabase, type Station } from '@/lib/supabase'
import type { PositionedTrain } from '@/app/api/trains/positions/route'
import type { TrainStats } from '@/app/api/stats/route'
import { cn } from '@/lib/utils'

const TrainMap = dynamic(() => import('@/components/train-map'), { ssr: false })

interface Disruption {
  id: string
  title: string
  type: string
  impact: string
  affected_stations: string[]
}

// ─── Tiny overlay card ────────────────────────────────────────────────────────

function OverlayCard({ trains, stats, disruptions, lastUpdate, refreshing, onRefresh }: {
  trains: PositionedTrain[]
  stats: TrainStats | null
  disruptions: Disruption[]
  lastUpdate: Date | null
  refreshing: boolean
  onRefresh: () => void
}) {
  const active = trains.filter(t => !t.cancelled)
  const activeDisruptions = disruptions.filter(d => d.type !== 'MAINTENANCE')

  return (
    <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 sm:gap-3 rounded-lg sm:rounded-xl border border-white/[0.08] bg-zinc-950/90 px-2.5 sm:px-3 py-1.5 sm:py-2 shadow-2xl backdrop-blur-md max-w-4xl">
    

      {/* Brand */}
      <div className="hidden sm:flex shrink-0 items-center gap-1.5">
        <svg className="h-3 w-3 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 15.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V5c0-3.5-3.58-4-8-4s-8 .5-8 4v10.5zm8 1.5c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm6-7H6V5h12v5z"/>
        </svg>
        <span className="text-[10px] font-semibold tracking-wide text-white">Treinradar</span>
      </div>

      <div className="hidden sm:block h-4 w-px shrink-0 bg-white/[0.08]" />

      {/* Stats */}
      <div className="flex flex-wrap gap-1.5 sm:gap-1 justify-center sm:justify-start">
        <Metric label="Treinen" value={active.length} color="blue" />
        <Metric label="Punctualiteit"
          value={stats ? `${stats.punctuality.toFixed(0)}%` : '—'}
          color={!stats ? 'zinc' : stats.punctuality >= 90 ? 'green' : stats.punctuality >= 80 ? 'amber' : 'red'} />
        <Metric label="Vertraagd" value={stats?.delayedToday ?? '—'} color="amber" />
        <Metric label="Verstoringen"
          value={activeDisruptions.length}
          color={activeDisruptions.length > 0 ? 'red' : 'green'} />
      </div>

      <div className="hidden sm:block h-4 w-px shrink-0 bg-white/[0.08]" />

      {/* Live + refresh */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <div className="flex items-center gap-1">
          <span className="live-dot h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full bg-green-500" />
          <span className="hidden sm:inline font-mono text-[9px] font-semibold uppercase tracking-widest text-green-500">Live</span>
        </div>
        <button onClick={onRefresh} disabled={refreshing}
          className="flex items-center gap-0.5 sm:gap-1 rounded px-1 sm:px-1.5 py-0.5 text-zinc-600 hover:text-zinc-300 transition-colors"
          title="Vernieuwen">
          <svg className={cn('h-2.5 w-2.5 sm:h-3 sm:w-3', refreshing && 'animate-spin')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          {lastUpdate && (
            <span className="hidden sm:inline font-mono text-[8px] text-zinc-700">
              {lastUpdate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </button>
      </div>

      {/* Active disruptions (compact inline, hidden on mobile) */}
      {activeDisruptions.length > 0 && (
        <>
          <div className="hidden sm:block h-4 w-px shrink-0 bg-white/[0.08]" />
          <div className="hidden sm:flex min-w-0 items-center gap-1.5 overflow-hidden">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
            <p className="truncate text-[9px] text-zinc-400">
              {activeDisruptions[0].title}
              {activeDisruptions.length > 1 && (
                <span className="ml-1 text-zinc-600">+{activeDisruptions.length - 1}</span>
              )}
            </p>
          </div>
        </>
      )}

      {/* Back link - on mobile take full width bottom row */}
      <Link href="/"
        className="rounded px-2 py-0.5 text-[8px] sm:text-[9px] uppercase tracking-wider text-zinc-600 hover:text-zinc-300 transition-colors ml-auto">
        ← terug
      </Link>
    </div>
  )
}

function Metric({ label, value, color, hideLabel }: { label: string; value: string | number; color: string; hideLabel?: boolean }) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-400', green: 'text-green-400', amber: 'text-amber-400',
    red: 'text-red-400', zinc: 'text-zinc-400',
  }
  return (
    <div className="rounded-md bg-white/[0.03] px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-center">
      <div className={cn('font-mono text-xs sm:text-sm font-bold tabular-nums leading-none', colorMap[color] ?? 'text-zinc-400')}>
        {value}
      </div>
      {!hideLabel && <div className="mt-0.5 text-[7px] sm:text-[8px] uppercase tracking-wider text-zinc-600">{label}</div>}
    </div>
  )
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="pointer-events-none flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 sm:gap-3 rounded-lg sm:rounded-lg border border-white/[0.06] bg-zinc-950/85 px-2 sm:px-3 py-1.5 sm:py-2 text-[8px] sm:text-[9px] sm:text-[10px] font-mono backdrop-blur-sm">
      <span className="uppercase tracking-wider text-zinc-600 w-full sm:w-auto text-center sm:text-left">Status</span>
      {[
        { color: '#22c55e', label: 'Op tijd' },
        { color: '#f59e0b', label: 'Vertraagd' },
        { color: '#ef4444', label: 'Geannuleerd' },
      ].map(({ color, label }) => (
        <div key={label} className="flex items-center gap-1 sm:gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-zinc-400">{label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RadarPage() {
  const [stations, setStations] = useState<Station[]>([])
  const [trains, setTrains] = useState<PositionedTrain[]>([])
  const [stats, setStats] = useState<TrainStats | null>(null)
  const [disruptions, setDisruptions] = useState<Disruption[]>([])
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const mounted = useRef(true)
  // Cache: treinen blijven 10s zichtbaar ook als de API ze een poll mist
  const trainCache = useRef(new Map<string, { train: PositionedTrain; lastSeen: number }>())
  const TRAIN_TTL = 10_000

  const fetchStations = useCallback(async () => {
    const res = await fetch('/api/stations')
    if (!res.ok || !mounted.current) return
    setStations(await res.json())
  }, [])

  const fetchTrains = useCallback(async () => {
    fetch('/api/trains').catch(() => {})
    const res = await fetch('/api/trains/positions')
    if (!res.ok || !mounted.current) return
    const d: { trains: PositionedTrain[] } = await res.json()
    if (!mounted.current) return
    const now = Date.now()
    // Update cache met verse data
    for (const t of d.trains ?? []) {
      trainCache.current.set(t.id, { train: t, lastSeen: now })
    }
    // Verwijder treinen die >10s niet meer gezien zijn
    for (const [id, entry] of trainCache.current) {
      if (now - entry.lastSeen > TRAIN_TTL) trainCache.current.delete(id)
    }
    setTrains([...trainCache.current.values()].map(e => e.train))
    setLastUpdate(new Date())
  }, [])

  const fetchStats = useCallback(async () => {
    const res = await fetch('/api/stats')
    if (!res.ok || !mounted.current) return
    setStats(await res.json())
  }, [])

  const fetchDisruptions = useCallback(async () => {
    const res = await fetch('/api/disruptions')
    if (!res.ok || !mounted.current) return
    const d: { disruptions: Disruption[] } = await res.json()
    setDisruptions(d.disruptions ?? [])
  }, [])

  // Read disruptions directly from Supabase (no API call, avoids upsert loop)
  const readDisruptionsFromDb = useCallback(async () => {
    if (!mounted.current) return
    const { data } = await supabase
      .from('disruptions')
      .select('id, title, type, impact, affected_stations')
      .eq('is_active', true)
    if (data && mounted.current) setDisruptions(data)
  }, [])

  const refreshAll = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([fetchTrains(), fetchStats(), fetchDisruptions()])
    setRefreshing(false)
  }, [fetchTrains, fetchStats, fetchDisruptions])

  useEffect(() => {
    mounted.current = true
    Promise.all([fetchStations(), fetchTrains(), fetchStats(), fetchDisruptions()])
    return () => { mounted.current = false }
  }, [fetchStations, fetchTrains, fetchStats, fetchDisruptions])

  useEffect(() => {
    const t1 = setInterval(fetchTrains, 3_000) // Elke 3s — icon memoization maakt 1s overbodig
    const t2 = setInterval(fetchStats, 30_000)
    const t3 = setInterval(fetchDisruptions, 90_000)
    return () => { clearInterval(t1); clearInterval(t2); clearInterval(t3) }
  }, [fetchTrains, fetchStats, fetchDisruptions])

  // Realtime: read from DB (no API call) to avoid upsert feedback loop
  useEffect(() => {
    const ch = supabase
      .channel('radar_disruptions_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'disruptions' }, readDisruptionsFromDb)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [readDisruptionsFromDb])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-zinc-950">
      {/* Header */}
      <Header />

      {/* Map container */}
      <div className="relative z-0 flex-1 overflow-hidden">
        {/* Full-screen map */}
        <div className="absolute inset-0">
          <TrainMap stations={stations} trains={trains} />
        </div>

        {/* Overlays */}
        <div className="pointer-events-none absolute inset-0 z-[1000] flex flex-col justify-between p-2 sm:p-4">
          {/* Top-center: info card */}
          <div className="flex justify-center">
            <OverlayCard
              trains={trains}
              stats={stats}
              disruptions={disruptions}
              lastUpdate={lastUpdate}
              refreshing={refreshing}
              onRefresh={refreshAll}
            />
          </div>

          {/* Bottom-left: legend */}
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-2 sm:gap-3 w-full sm:w-auto">
            <Legend />
          </div>
        </div>
      </div>
    </div>
  )
}
