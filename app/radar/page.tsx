'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Header } from '@/components/header'
import { type Station } from '@/lib/supabase'
import type { PositionedTrain } from '@/app/api/trains/positions/route'

const TrainMap = dynamic(() => import('@/components/train-map'), { ssr: false })

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
  }, [])

  useEffect(() => {
    mounted.current = true
    Promise.all([fetchStations(), fetchTrains()])
    return () => { mounted.current = false }
  }, [fetchStations, fetchTrains])

  useEffect(() => {
    const t1 = setInterval(fetchTrains, 3_000)
    return () => { clearInterval(t1) }
  }, [fetchTrains])

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
        <div className="pointer-events-none absolute inset-0 z-[1000] flex flex-col justify-end p-2 sm:p-4">
          {/* Bottom-left: legend */}
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-2 sm:gap-3 w-full sm:w-auto">
            <Legend />
          </div>
        </div>
      </div>
    </div>
  )
}
