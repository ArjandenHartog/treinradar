'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import {
  Zap, TrendingUp, Clock, AlertTriangle, Ban, Train,
  MapPin, Radio, ArrowLeft, Calendar,
  Wifi, Bike, Plug, Bath, Accessibility, Utensils, VolumeX, Wind,
  Ruler, Users, ChevronRight, Search,
} from 'lucide-react'
import { Header } from '@/components/header'
import type { TrainHistoryStats } from '@/app/api/trains/[number]/history/route'
import type { TrainDetail } from '@/app/api/trains/info/route'

// ─── Lazy-loaded mini map (SSR off) ───────────────────────────────────────────
const TrainHistoryMap = dynamic(() => import('@/components/train-history-map'), { ssr: false })

// ─── Constants ────────────────────────────────────────────────────────────────
const TYPE_BG: Record<string, string> = {
  IC: '#1d4ed8', ICD: '#1e40af', ICE: '#5b21b6',
  SPR: '#15803d', SNG: '#166534', SLT: '#14532d',
  INT: '#92400e', THA: '#9d174d', EUR: '#3730a3', NT: '#374151',
  ARR: '#065f46', RNT: '#b45309', VLL: '#b45309',
  FLI: '#065f46', GTW: '#065f46', STP: '#166534', '?': '#374151',
}
const typeColor = (code: string) => TYPE_BG[code?.toUpperCase()] ?? TYPE_BG['?']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FACILITY_ICON: Record<string, React.ComponentType<any>> = {
  wifi: Wifi, fiets: Bike, stopcontact: Plug, toilet: Bath,
  toegankelijk: Accessibility, restaurant: Utensils,
  'stille-coupe': VolumeX, airco: Wind,
}
const CROWD_COLOR: Record<string, string> = {
  LOW: '#22c55e', MEDIUM: '#f59e0b', HIGH: '#ef4444', UNKNOWN: '#374151',
}
const CROWD_LABEL: Record<string, string> = {
  LOW: 'Rustig', MEDIUM: 'Gemiddeld', HIGH: 'Druk', UNKNOWN: 'Onbekend',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTime(iso: string) {
  if (!iso) return '–'
  try { return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) }
  catch { return '–' }
}
function fmtDateTime(iso: string) {
  if (!iso) return '–'
  try {
    const d = new Date(iso)
    const now = new Date()
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch { return '–' }
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/[0.07] bg-zinc-900 p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.05]">
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </div>
        <span className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</span>
      </div>
      <div className="text-xl font-bold tabular-nums text-white leading-none">{value}</div>
      {sub && <div className="text-[10px] text-zinc-600 leading-tight">{sub}</div>}
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, sub, color = '#6b7280' }: {
  icon: React.ElementType; title: string; sub?: string; color?: string
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</span>
      {sub && <span className="ml-auto text-[10px] text-zinc-700">{sub}</span>}
    </div>
  )
}

// ─── Custom tooltips ──────────────────────────────────────────────────────────
function SpeedTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { time: string } }> }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-white/[0.1] bg-zinc-900 px-3 py-2 text-xs font-mono shadow-2xl">
      <div className="text-zinc-500">{payload[0].payload.time}</div>
      <div className="font-bold text-blue-400">{payload[0].value} km/u</div>
    </div>
  )
}
function DelayTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { time: string } }> }) {
  if (!active || !payload?.length) return null
  const v = payload[0].value
  return (
    <div className="rounded-lg border border-white/[0.1] bg-zinc-900 px-3 py-2 text-xs font-mono shadow-2xl">
      <div className="text-zinc-500">{payload[0].payload.time}</div>
      <div className={`font-bold ${v > 5 ? 'text-red-400' : v > 0 ? 'text-amber-400' : 'text-green-400'}`}>
        {v <= 0 ? 'Op tijd' : `+${v} min`}
      </div>
    </div>
  )
}

// ─── Material card ────────────────────────────────────────────────────────────
function MaterialCard({ mat, onSearchUnit }: { mat: TrainDetail['material']; onSearchUnit: (n: string) => void }) {
  if (!mat) return null
  return (
    <div className="rounded-xl border border-white/[0.07] bg-zinc-900 overflow-hidden">
      {/* Image */}
      {mat.image && (
        <div className="bg-zinc-950 px-6 pt-5 pb-3 flex items-center justify-center" style={{ minHeight: 100 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mat.image} alt={mat.fullName}
            className="max-h-28 w-full object-contain drop-shadow-lg" />
        </div>
      )}

      <div className="p-4">
        {/* Name + code */}
        <div className="mb-4 flex items-start gap-3">
          <span className="shrink-0 rounded-md bg-white/[0.07] px-2.5 py-1 font-mono text-xs font-bold text-zinc-300">
            {mat.code}
          </span>
          <div>
            <div className="text-sm font-bold text-white leading-snug">{mat.fullName}</div>
            {mat.numberOfParts != null && (
              <div className="text-[11px] text-zinc-500 mt-0.5">
                {mat.numberOfParts}-delig
                {mat.lengthM ? ` · ${mat.lengthM} m lang` : ''}
              </div>
            )}
          </div>
        </div>

        {/* Specs grid */}
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: '1e klas', value: mat.seats1st != null && mat.seats1st > 0 ? `${mat.seats1st} pl.` : '–', icon: '🟡' },
            { label: '2e klas', value: mat.seats2nd != null ? `${mat.seats2nd} pl.` : '–', icon: '🔵' },
            { label: 'Topsnelheid', value: mat.topSpeedKmh ? `${mat.topSpeedKmh} km/u` : '–', icon: '⚡' },
            { label: 'Lengte', value: mat.lengthM ? `${mat.lengthM} m` : '–', icon: '📏' },
          ].map(({ label, value, icon }) => (
            <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
              <div className="mb-1 text-[10px] text-zinc-600 uppercase tracking-wider">{label}</div>
              <div className="text-sm font-bold text-white">{value}</div>
            </div>
          ))}
        </div>

        {/* Facilities */}
        {mat.facilityLabels && mat.facilityLabels.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-600">Voorzieningen</div>
            <div className="flex flex-wrap gap-1.5">
              {mat.facilityLabels.map(f => {
                const Icon = FACILITY_ICON[f.key ?? '']
                return (
                  <span key={f.label}
                    className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] text-zinc-300">
                    {Icon ? <Icon className="h-3 w-3 text-zinc-500" /> : <span>{f.icon}</span>}
                    {f.label}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Treindelen (individual stock numbers) */}
        {mat.parts && mat.parts.length > 0 && (
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-600">
              Treindelen ({mat.parts.length} stuks)
            </div>
            <div className="flex flex-wrap gap-2">
              {mat.parts.map((p, i) => (
                <button
                  key={i}
                  onClick={() => p.number && onSearchUnit(p.number)}
                  title={p.number ? `Zoek treinstel ${p.number}` : undefined}
                  className="group flex items-center gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/8 px-3 py-1.5 font-mono text-xs text-blue-300 transition-all hover:border-blue-500/40 hover:bg-blue-500/15"
                >
                  <span className="font-bold">{p.number || '–'}</span>
                  {p.type && <span className="text-blue-500/70">{p.type}</span>}
                  <Search className="h-2.5 w-2.5 text-blue-500/40 transition-opacity group-hover:text-blue-400" />
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-zinc-700">Klik op een treinstel voor zijn volledige geschiedenis</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Route stops (today's journey) ───────────────────────────────────────────
function RouteStops({ stops }: { stops: TrainDetail['stops'] }) {
  if (!stops.length) return null
  const firstFuture = stops.findIndex(s => !s.passed)
  return (
    <div className="rounded-xl border border-white/[0.07] bg-zinc-900 overflow-hidden">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <SectionHeader icon={MapPin} title={`Route vandaag · ${stops.length} stops`}
          sub={`${stops.filter(s => s.passed).length} gereden`} />
        {/* Progress bar */}
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${stops.length > 1 ? Math.round((stops.filter(s => s.passed).length / (stops.length - 1)) * 100) : 0}%` }}
          />
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto p-3">
        {stops.map((s, i) => {
          const isCurrent = i === firstFuture
          const planned   = s.plannedDeparture ?? s.plannedArrival
          const actual    = s.actualDeparture  ?? s.actualArrival
          const late      = planned && actual
            ? Math.max(0, Math.round((new Date(actual).getTime() - new Date(planned).getTime()) / 60000))
            : 0
          return (
            <div key={i} className={`flex items-center gap-2.5 py-1.5 px-2 rounded-lg transition-colors ${isCurrent ? 'bg-blue-950/30' : ''}`}>
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                s.cancelled ? 'bg-red-500' : isCurrent ? 'bg-blue-400' : s.passed ? 'bg-zinc-700' : 'bg-zinc-600'
              }`} />
              <span className={`flex-1 text-xs truncate ${
                s.cancelled ? 'text-red-400 line-through' : isCurrent ? 'text-white font-semibold' : s.passed ? 'text-zinc-600' : 'text-zinc-400'
              }`}>
                {s.name}
              </span>
              {s.platform && !s.cancelled && (
                <span className="shrink-0 text-[10px] text-zinc-700">sp.{s.platform}</span>
              )}
              {planned && !s.cancelled && (
                <span className={`shrink-0 font-mono text-[11px] tabular-nums ${late > 0 ? 'text-amber-400' : s.passed ? 'text-zinc-700' : 'text-zinc-500'}`}>
                  {late > 0 ? fmtTime(actual ?? '') : fmtTime(planned)}
                  {late > 0 && <span className="text-amber-500"> +{late}</span>}
                </span>
              )}
              {s.crowdForecast && s.crowdForecast !== 'UNKNOWN' && !s.passed && !s.cancelled && (
                <span className="shrink-0 text-[9px] font-semibold" style={{ color: CROWD_COLOR[s.crowdForecast] }}>
                  {CROWD_LABEL[s.crowdForecast]}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TrainDetailPage({ params }: { params: Promise<{ number: string }> }) {
  const { number: serviceNumber } = use(params)
  const router = useRouter()
  const [days, setDays]       = useState(7)
  const [data, setData]       = useState<TrainHistoryStats | null>(null)
  const [detail, setDetail]   = useState<TrainDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // Fetch history
  useEffect(() => {
    setLoading(true); setError(null)
    fetch(`/api/trains/${encodeURIComponent(serviceNumber)}/history?days=${days}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: TrainHistoryStats) => { setData(d); setLoading(false) })
      .catch(e => { setError(e === 404 ? 'Geen data' : 'Fout'); setLoading(false) })
  }, [serviceNumber, days])

  // Fetch live info (material + stops) — independent of days
  useEffect(() => {
    fetch(`/api/trains/info?ritnummer=${encodeURIComponent(serviceNumber)}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: TrainDetail | null) => setDetail(d))
      .catch(() => {})
  }, [serviceNumber])

  // Downsample for charts
  const sample = (arr: TrainHistoryStats['history']) => {
    if (arr.length <= 200) return arr
    const step = Math.ceil(arr.length / 200)
    return arr.filter((_, i) => i % step === 0)
  }
  const speedData = data ? sample(data.history).map(h => ({ time: fmtTime(h.recordedAt), kmh: h.speedKmh })) : []
  const delayData = data ? sample(data.history).map(h => ({ time: fmtTime(h.recordedAt), delay: h.delay })) : []
  const hasDelay  = delayData.some(d => d.delay > 0)

  // All unique materieel numbers seen in history
  const historicUnits = data
    ? [...new Set(data.history.flatMap(h => []))] // populated below
    : []

  const bg = typeColor(data?.typeCode ?? detail?.material?.code ?? '?')
  const typeCode = data?.typeCode || detail?.material?.code || '?'

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Header />

      <main className="mx-auto max-w-5xl px-4 pb-20 pt-6">

        {/* Back */}
        <button onClick={() => router.back()}
          className="mb-5 flex items-center gap-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />
          Terug
        </button>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <div className="mb-6 flex flex-wrap items-start gap-4">
          <div className="flex items-center gap-3">
            <span className="shrink-0 rounded-lg px-3 py-1.5 font-mono text-sm font-black tracking-widest text-white"
              style={{ background: bg }}>
              {typeCode}
            </span>
            <div>
              <h1 className="text-2xl font-extrabold leading-none tracking-tight">
                Trein {serviceNumber}
              </h1>
              <p className="mt-0.5 text-xs text-zinc-500">
                {data?.operator ?? detail?.material?.fullName ?? '…'}
                {data && <span className="ml-2 text-zinc-700">· {data.totalPoints} metingen</span>}
              </p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* Days selector */}
            <div className="flex overflow-hidden rounded-lg border border-white/[0.1]">
              {[1, 3, 7, 14].map(d => (
                <button key={d} onClick={() => setDays(d)}
                  className={`px-3 py-1.5 text-[11px] font-bold transition-colors ${
                    days === d ? 'bg-blue-700 text-white' : 'bg-zinc-900 text-zinc-600 hover:text-zinc-300'
                  }`}>
                  {d}d
                </button>
              ))}
            </div>
            <button onClick={() => router.push(`/radar?trein=${serviceNumber}`)}
              className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-[11px] font-bold text-blue-400 transition-all hover:bg-blue-500/20">
              <Radio className="h-3 w-3" />
              Live op kaart
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-900" />
              ))}
            </div>
            {[280, 160, 200].map((h, i) => (
              <div key={i} className="animate-pulse rounded-xl bg-zinc-900" style={{ height: h }} />
            ))}
          </div>
        )}

        {/* No data */}
        {!loading && (error || !data) && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-zinc-900 py-20 text-center">
            <Train className="mb-4 h-10 w-10 text-zinc-700" />
            <h2 className="text-base font-semibold text-zinc-400">Geen historische data</h2>
            <p className="mt-2 max-w-xs text-xs text-zinc-600">
              Posities worden opgeslagen zodra de trein actief is. Kom later terug.
            </p>
            <button onClick={() => router.push(`/radar?trein=${serviceNumber}`)}
              className="mt-6 flex items-center gap-2 rounded-lg bg-blue-700/20 px-4 py-2 text-sm font-semibold text-blue-400 hover:bg-blue-700/30 transition-colors">
              <Radio className="h-4 w-4" />
              Zoek live op kaart
            </button>
          </div>
        )}

        {/* ── Data ──────────────────────────────────────────────────────── */}
        {!loading && data && (
          <div className="space-y-5">

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard icon={Zap}           label="Topsnelheid"    value={`${data.maxSpeedKmh} km/u`}    color="#f59e0b" />
              <StatCard icon={TrendingUp}    label="Gem. snelheid"  value={`${data.avgSpeedKmh} km/u`}    color="#22c55e" />
              <StatCard icon={Clock}         label="Gem. vertraging"
                value={data.avgDelay <= 0 ? 'Op tijd' : `+${data.avgDelay} min`}
                color={data.avgDelay > 3 ? '#f59e0b' : '#22c55e'} />
              <StatCard icon={AlertTriangle} label="Max vertraging"
                value={data.maxDelay <= 0 ? '0 min' : `+${data.maxDelay} min`}
                color={data.maxDelay > 5 ? '#ef4444' : '#64748b'} />
              <StatCard icon={Calendar}      label={`Metingen (${days}d)`} value={String(data.totalPoints)}   color="#3b82f6"
                sub={`${fmtDateTime(data.firstSeen)} → ${fmtDateTime(data.lastSeen)}`} />
              <StatCard icon={Ban}           label="Uitval"
                value={data.cancelledCount > 0 ? `${data.cancelledCount}×` : 'Geen'}
                color={data.cancelledCount > 0 ? '#ef4444' : '#22c55e'} />
            </div>

            {/* ── Materieel + Route (2 cols on wide) ─────────────────────── */}
            {(detail?.material || detail?.stops?.length) && (
              <div className="grid gap-5 lg:grid-cols-2">
                {detail.material && (
                  <MaterialCard
                    mat={detail.material}
                    onSearchUnit={n => router.push(`/zoeken?q=${encodeURIComponent(n)}`)}
                  />
                )}
                {detail.stops && detail.stops.length > 0 && (
                  <RouteStops stops={detail.stops} />
                )}
              </div>
            )}

            {/* ── Speed chart ──────────────────────────────────────────────── */}
            <div className="rounded-xl border border-white/[0.07] bg-zinc-900 p-4">
              <SectionHeader icon={Zap} title="Snelheid (km/u)" sub={`max ${data.maxSpeedKmh} km/u`} color="#3b82f6" />
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={speedData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="time"
                    tick={{ fontSize: 9, fill: '#3f3f46', fontFamily: 'monospace' }}
                    tickLine={false} axisLine={false}
                    interval={Math.max(1, Math.floor(speedData.length / 8))} />
                  <YAxis domain={[0, Math.max(data.maxSpeedKmh + 10, 50)]}
                    tick={{ fontSize: 9, fill: '#3f3f46', fontFamily: 'monospace' }}
                    tickLine={false} axisLine={false} />
                  <Tooltip content={<SpeedTooltip />} cursor={{ stroke: 'rgba(59,130,246,0.2)', strokeWidth: 1 }} />
                  <ReferenceLine y={data.avgSpeedKmh} stroke="#3b82f6" strokeDasharray="3 3" strokeOpacity={0.4} />
                  <Line type="monotone" dataKey="kmh" stroke="#3b82f6" strokeWidth={1.5} dot={false}
                    activeDot={{ r: 3, fill: '#3b82f6' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* ── Delay chart ──────────────────────────────────────────────── */}
            {hasDelay && (
              <div className="rounded-xl border border-white/[0.07] bg-zinc-900 p-4">
                <SectionHeader icon={Clock} title="Vertraging (min)" sub={`max +${data.maxDelay} min`} color="#f59e0b" />
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={delayData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barCategoryGap="15%">
                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="time"
                      tick={{ fontSize: 9, fill: '#3f3f46', fontFamily: 'monospace' }}
                      tickLine={false} axisLine={false}
                      interval={Math.max(1, Math.floor(delayData.length / 8))} />
                    <YAxis tick={{ fontSize: 9, fill: '#3f3f46', fontFamily: 'monospace' }} tickLine={false} axisLine={false} />
                    <Tooltip content={<DelayTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="delay" radius={[2, 2, 0, 0]}>
                      {delayData.map((e, i) => (
                        <Cell key={i}
                          fill={e.delay >= 15 ? '#ef4444' : e.delay >= 3 ? '#f59e0b' : '#22c55e'}
                          opacity={0.8} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Map + Destinations ──────────────────────────────────────── */}
            <div className="grid gap-5 lg:grid-cols-[1fr_260px]">

              {/* History map */}
              <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-zinc-900">
                <div className="border-b border-white/[0.06] px-4 py-3">
                  <SectionHeader icon={MapPin} title={`Rijroute (${days}d)`} />
                </div>
                <div style={{ height: 280 }}>
                  <TrainHistoryMap history={data.history} />
                </div>
              </div>

              {/* Destinations */}
              <div className="rounded-xl border border-white/[0.07] bg-zinc-900 p-4">
                <SectionHeader icon={MapPin} title={`Bestemmingen (${days}d)`} />
                {data.uniqueDestinations.length === 0 ? (
                  <p className="text-xs text-zinc-700">Geen bestemmingen bekend</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {data.uniqueDestinations.map(d => (
                      <div key={d} className="flex items-center gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                        <MapPin className="h-3 w-3 shrink-0 text-zinc-600" />
                        <span className="text-xs text-zinc-300">{d}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Recent measurements table ────────────────────────────────── */}
            <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-zinc-900">
              <div className="border-b border-white/[0.06] px-4 py-3">
                <SectionHeader icon={Clock} title="Recente metingen" sub={`${data.history.length} totaal`} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/[0.04] bg-zinc-950/50">
                      {['Tijd', 'Bestemming', 'Snelheid', 'Vertraging', 'Status'].map(h => (
                        <th key={h} className="px-4 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {data.history.slice(-60).reverse().map((h, i) => (
                      <tr key={i} className={`transition-colors ${i === 0 ? 'bg-blue-950/20' : 'hover:bg-white/[0.01]'}`}>
                        <td className="px-4 py-2.5 font-mono text-[11px] tabular-nums text-zinc-500 whitespace-nowrap">
                          {fmtDateTime(h.recordedAt)}
                        </td>
                        <td className="max-w-[140px] truncate px-4 py-2.5 text-xs text-zinc-300">
                          {h.destination || '–'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-blue-400 whitespace-nowrap">
                          {h.speedKmh} km/u
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs tabular-nums whitespace-nowrap">
                          <span className={h.delay >= 15 ? 'text-red-400' : h.delay > 0 ? 'text-amber-400' : 'text-zinc-700'}>
                            {h.delay > 0 ? `+${h.delay} min` : '–'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {h.cancelled
                            ? <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400">Uitval</span>
                            : <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400">Rijdt</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  )
}
