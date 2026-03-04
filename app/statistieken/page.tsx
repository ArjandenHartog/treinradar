'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Zap, AlertTriangle, MapPin, Ruler, Users, Ban, Train, Clock,
  TrendingUp, ArrowUp, ChevronRight,
} from 'lucide-react'
import { Header } from '@/components/header'
import { LiveClock } from '@/components/live-clock'
import type { StatistiekenData, CancelledTrain, DelayedTrain } from '@/app/api/statistieken/route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

function formatDateTime(iso: string) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const today = new Date()
    const isToday = d.toDateString() === today.toDateString()
    if (isToday) return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

// ─── Big stat card ────────────────────────────────────────────────────────────

interface StatHeroProps {
  icon: React.ElementType
  iconColor: string
  label: string
  value: string
  sub?: string
  sub2?: string
}

function StatHero({ icon: Icon, iconColor, label, value, sub, sub2 }: StatHeroProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-zinc-900 p-4">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-md ${iconColor}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums text-white leading-none">{value}</div>
      {sub && <div className="text-xs text-zinc-400 leading-snug">{sub}</div>}
      {sub2 && <div className="text-[11px] text-zinc-600">{sub2}</div>}
    </div>
  )
}

// ─── Cancelled table ──────────────────────────────────────────────────────────

function CancelledTable({ rows }: { rows: CancelledTrain[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] bg-zinc-900">
            <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Trein</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Type</th>
            <th className="hidden px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500 sm:table-cell">Vervoerder</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Richting</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Vertrek</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Station</th>
            <th className="hidden px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500 md:table-cell">Reden</th>
            <th className="hidden px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500 lg:table-cell">Via</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04] bg-zinc-950">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-white/[0.02] transition-colors">
              <td className="px-3 py-2 font-mono text-xs text-zinc-300">{r.serviceNumber}</td>
              <td className="px-3 py-2">
                <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
                  {r.typeCode || '—'}
                </span>
              </td>
              <td className="hidden px-3 py-2 text-xs text-zinc-500 sm:table-cell">{r.operator}</td>
              <td className="px-3 py-2 text-xs text-zinc-300">{r.destination || '—'}</td>
              <td className="px-3 py-2 font-mono text-xs text-zinc-400">{formatDateTime(r.departureTime)}</td>
              <td className="px-3 py-2 text-xs text-zinc-400">{r.stationCode}</td>
              <td className="hidden px-3 py-2 text-xs text-zinc-500 md:table-cell max-w-[220px] truncate">
                {r.cancelReason || '—'}
              </td>
              <td className="hidden px-3 py-2 text-xs text-zinc-600 lg:table-cell">{r.via || '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-8 text-center text-sm text-zinc-600">
                Geen geannuleerde treinen gevonden.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ─── Delayed table ────────────────────────────────────────────────────────────

function DelayedTable({ rows }: { rows: DelayedTrain[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] bg-zinc-900">
            <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Trein</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Type</th>
            <th className="hidden px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500 sm:table-cell">Vervoerder</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Richting</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Vertrek (gepland)</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Station</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Vertraging</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04] bg-zinc-950">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-white/[0.02] transition-colors">
              <td className="px-3 py-2 font-mono text-xs text-zinc-300">{r.serviceNumber}</td>
              <td className="px-3 py-2">
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                  {r.typeCode || '—'}
                </span>
              </td>
              <td className="hidden px-3 py-2 text-xs text-zinc-500 sm:table-cell">{r.operator}</td>
              <td className="px-3 py-2 text-xs text-zinc-300">{r.destination || '—'}</td>
              <td className="px-3 py-2 font-mono text-xs text-zinc-400">{formatDateTime(r.departureTime)}</td>
              <td className="px-3 py-2 text-xs text-zinc-400">{r.stationCode}</td>
              <td className="px-3 py-2">
                <span className={`font-mono text-xs font-semibold ${r.delay >= 15 ? 'text-red-400' : r.delay >= 5 ? 'text-amber-400' : 'text-yellow-500'}`}>
                  +{r.delay} min
                </span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-sm text-zinc-600">
                Geen vertraagde treinen gevonden.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StatistiekenPage() {
  const [data, setData] = useState<StatistiekenData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'cancelled' | 'delayed'>('cancelled')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/statistieken')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const iv = setInterval(fetchData, 30_000)
    return () => clearInterval(iv)
  }, [fetchData])

  const d = data

  return (
    <div className="min-h-screen bg-background text-white">
      <Header />

      <main className="mx-auto max-w-[1600px] px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Statistieken</h1>
            <p className="mt-1 text-sm text-zinc-500">Realtime overzicht van het Nederlandse spoorwegnet</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-600">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
            <LiveClock />
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24 text-zinc-600">
            <svg className="mr-3 h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            <span className="text-sm">Statistieken laden...</span>
          </div>
        )}

        {d && (
          <>
            {/* Hero stat grid */}
            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <StatHero
                icon={Train}
                iconColor="bg-blue-500/15 text-blue-400"
                label="Actieve treinen"
                value={d.activeTrains.toLocaleString('nl-NL')}
                sub="Treinen met GPS-positie"
              />

              {d.highestSpeed && (
                <StatHero
                  icon={Zap}
                  iconColor="bg-yellow-500/15 text-yellow-400"
                  label="Hoogste snelheid"
                  value={`${d.highestSpeed.speedKmh} km/u`}
                  sub={`Trein ${d.highestSpeed.serviceNumber}`}
                  sub2={d.highestSpeed.origin && d.highestSpeed.destination ? `${d.highestSpeed.origin} → ${d.highestSpeed.destination}` : undefined}
                />
              )}

              {d.mostDelayed && (
                <StatHero
                  icon={AlertTriangle}
                  iconColor="bg-red-500/15 text-red-400"
                  label="Meeste vertraging"
                  value={`+${d.mostDelayed.delay} min`}
                  sub={`Trein ${d.mostDelayed.serviceNumber}`}
                  sub2={d.mostDelayed.origin && d.mostDelayed.destination ? `${d.mostDelayed.origin} → ${d.mostDelayed.destination}` : undefined}
                />
              )}

              {d.mostDelayedStation && (
                <StatHero
                  icon={MapPin}
                  iconColor="bg-orange-500/15 text-orange-400"
                  label="Meeste vertraging (station)"
                  value={d.mostDelayedStation.stationCode}
                  sub={`Gem. +${d.mostDelayedStation.avgDelay} min`}
                  sub2={`${d.mostDelayedStation.trainCount} treinen`}
                />
              )}

              {d.longestTrain && (
                <StatHero
                  icon={Ruler}
                  iconColor="bg-purple-500/15 text-purple-400"
                  label="Langste trein"
                  value={`~${d.longestTrain.estimatedLengthM} m`}
                  sub={`Trein ${d.longestTrain.serviceNumber} · ${d.longestTrain.partsCount} delen`}
                  sub2={d.longestTrain.origin && d.longestTrain.destination ? `${d.longestTrain.origin} → ${d.longestTrain.destination}` : undefined}
                />
              )}

              {d.mostSeats && (
                <StatHero
                  icon={Users}
                  iconColor="bg-teal-500/15 text-teal-400"
                  label="Meeste zitplaatsen"
                  value={`~${d.mostSeats.seats.toLocaleString('nl-NL')}`}
                  sub={`Trein ${d.mostSeats.serviceNumber}`}
                  sub2={d.mostSeats.origin && d.mostSeats.destination ? `${d.mostSeats.origin} → ${d.mostSeats.destination}` : undefined}
                />
              )}

              <StatHero
                icon={Ban}
                iconColor="bg-red-500/15 text-red-400"
                label="Geannuleerd"
                value={d.cancelledToday.toLocaleString('nl-NL')}
                sub="Treinen geannuleerd vandaag"
              />

              <StatHero
                icon={Clock}
                iconColor="bg-zinc-500/15 text-zinc-400"
                label="Treinen vandaag"
                value={d.totalToday.toLocaleString('nl-NL')}
                sub={`${d.delayedToday} vertraagd vandaag`}
              />
            </div>

            {/* Tables */}
            <div className="space-y-4">
              {/* Tab switcher */}
              <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-zinc-900 p-1 w-fit">
                <button
                  onClick={() => setTab('cancelled')}
                  className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${tab === 'cancelled' ? 'bg-red-500/20 text-red-300' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Geannuleerd ({d.cancelledList.length})
                </button>
                <button
                  onClick={() => setTab('delayed')}
                  className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${tab === 'delayed' ? 'bg-amber-500/20 text-amber-300' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Vertraagd +3 min ({d.delayedList.length})
                </button>
              </div>

              {tab === 'cancelled' && (
                <div>
                  <p className="mb-2 text-xs text-zinc-600">Laatste {d.cancelledList.length} geannuleerde treinen</p>
                  <CancelledTable rows={d.cancelledList} />
                </div>
              )}

              {tab === 'delayed' && (
                <div>
                  <p className="mb-2 text-xs text-zinc-600">Laatste {d.delayedList.length} treinen met 3+ minuten vertraging</p>
                  <DelayedTable rows={d.delayedList} />
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
