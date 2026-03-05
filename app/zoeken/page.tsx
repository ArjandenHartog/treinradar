'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Header } from '@/components/header'
import {
  Search, MapPin, Zap, Clock, ChevronRight,
  Radio, X, Train,
} from 'lucide-react'
import type { SearchResult } from '@/app/api/trains/search/route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_BG: Record<string, string> = {
  IC: '#1d4ed8', ICD: '#1e40af', ICE: '#5b21b6',
  SPR: '#15803d', SNG: '#166534', SLT: '#14532d',
  INT: '#92400e', THA: '#9d174d', EUR: '#3730a3', NT: '#374151',
  ARR: '#065f46', RNT: '#b45309', VLL: '#b45309',
  FLI: '#065f46', GTW: '#065f46', STP: '#166534', '?': '#374151',
}
const typeColor = (code: string) => TYPE_BG[code?.toUpperCase()] ?? TYPE_BG['?']

function fmtLastSeen(iso: string) {
  if (!iso) return '–'
  try {
    const d = new Date(iso)
    const diffH = (Date.now() - d.getTime()) / 3600000
    if (diffH < 1)   return `${Math.round(diffH * 60)} min geleden`
    if (diffH < 24)  return `${Math.round(diffH)} uur geleden`
    if (diffH < 168) return `${Math.round(diffH / 24)} dag${Math.round(diffH / 24) > 1 ? 'en' : ''} geleden`
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
  } catch { return '–' }
}

function highlight(text: string, q: string) {
  if (!q || !text) return <>{text}</>
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-blue-500/30 text-blue-300 px-px">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  )
}

// ─── Result card ──────────────────────────────────────────────────────────────

function ResultCard({ result, query }: { result: SearchResult; query: string }) {
  const router = useRouter()
  const bg     = typeColor(result.typeCode)
  const dColor = result.cancelled ? '#ef4444' : result.delay >= 15 ? '#ef4444' : result.delay >= 3 ? '#f59e0b' : '#22c55e'
  const delayLabel = result.cancelled ? 'Uitval' : result.delay <= 0 ? 'Op tijd' : `+${result.delay} min`

  return (
    <div
      className="group relative flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.07] bg-zinc-900 p-4 transition-all hover:border-white/[0.14] hover:bg-zinc-800/70 active:scale-[0.99]"
      onClick={() => router.push(`/trein/${result.serviceNumber}`)}
    >
      {/* Type badge */}
      <span
        className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-black tracking-widest text-white font-mono"
        style={{ background: bg }}
      >
        {result.typeCode || '?'}
      </span>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-bold tabular-nums text-white">
            {highlight(result.serviceNumber, query)}
          </span>
          <span className="text-[11px] text-zinc-500">{result.operator}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {result.destination && (
            <span className="flex items-center gap-1 text-[11px] text-zinc-400">
              <MapPin className="h-2.5 w-2.5 text-zinc-600 shrink-0" />
              {highlight(result.destination, query)}
            </span>
          )}
          {result.matchedMaterialNumbers && result.matchedMaterialNumbers.length > 0 && (
            <span className="flex items-center gap-1 text-[10px]">
              <Train className="h-2.5 w-2.5 text-zinc-600 shrink-0" />
              {result.matchedMaterialNumbers.slice(0, 3).map(n => (
                <span key={n} className="rounded bg-blue-500/10 border border-blue-500/20 px-1 text-blue-300 font-mono">
                  {highlight(String(n), query)}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 text-right">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: dColor }} />
          <span className="text-[11px] font-semibold" style={{ color: dColor }}>{delayLabel}</span>
        </span>
        {result.maxSpeedKmh != null && (
          <span className="flex items-center gap-1 text-[10px] text-zinc-600">
            <Zap className="h-2.5 w-2.5" />
            max {result.maxSpeedKmh} km/u
          </span>
        )}
        <span className="text-[10px] text-zinc-700">{fmtLastSeen(result.lastSeen)}</span>
      </div>

      {/* Quick action buttons */}
      <div className="hidden shrink-0 items-center gap-1 sm:flex">
        <button
          onClick={e => { e.stopPropagation(); window.open(`/radar?trein=${result.serviceNumber}`, '_self') }}
          title="Live op kaart"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-blue-500/20 bg-blue-500/8 text-blue-500 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-blue-500/20"
        >
          <Radio className="h-3 w-3" />
        </button>
        <ChevronRight className="h-4 w-4 text-zinc-700 transition-colors group-hover:text-zinc-500" />
      </div>

      {/* Mobile arrow */}
      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-700 sm:hidden" />
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

function ZoekenPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [query, setQuery]     = useState(searchParams.get('q') ?? '')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { inputRef.current?.focus() }, [])

  const search = useCallback((q: string) => {
    abortRef.current?.abort()
    if (!q) { setResults([]); setLoading(false); return }
    setLoading(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/trains/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        if (r.ok) setResults((await r.json()).results ?? [])
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setResults([])
      } finally {
        setLoading(false)
      }
    }, 120)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => { const c = search(query); return c }, [query, search])

  const SUGGESTIONS = ['IC', 'SPR', 'ICE', 'Arriva', 'Amsterdam', '1700', '2301']

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Header />

      <main className="mx-auto max-w-2xl px-4 pb-20 pt-8">

        {/* Title */}
        <div className="mb-7">
          <h1 className="text-2xl font-extrabold tracking-tight">Trein zoeken</h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            Treinnummer, treinstel, bestemming of vervoerder — resultaten verschijnen direct.
          </p>
        </div>

        {/* Search input */}
        <div className="relative mb-6">
          <div className="flex items-center gap-3 rounded-2xl border border-white/[0.12] bg-zinc-900 px-4 shadow-xl focus-within:border-blue-500/50 transition-colors">
            <Search className={`h-4 w-4 shrink-0 transition-colors ${loading ? 'text-blue-400' : 'text-zinc-600'}`} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Bijv. 2315, 2301, Amsterdam, IC…"
              className="flex-1 bg-transparent py-4 text-[15px] text-white placeholder-zinc-700 outline-none"
            />
            {query && (
              <button onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus() }}
                className="text-zinc-600 hover:text-zinc-400 transition-colors">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Suggestion chips */}
          {!query && (
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => setQuery(s)}
                  className="rounded-full border border-white/[0.08] bg-zinc-900 px-3 py-1 text-[11px] text-zinc-500 transition-all hover:border-white/[0.18] hover:text-zinc-300">
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <p className="mb-3 text-[11px] text-zinc-600">
            {results.length} resultaten voor <strong className="text-zinc-500">"{query}"</strong>
            <span className="ml-1.5 text-zinc-700">— klik voor volledige statistieken</span>
          </p>
        )}

        {/* Skeletons */}
        {loading && results.length === 0 && (
          <div className="space-y-2.5">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-[68px] animate-pulse rounded-xl border border-white/[0.05] bg-zinc-900" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && query.length > 0 && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="mb-3 h-8 w-8 text-zinc-800" />
            <p className="text-sm font-semibold text-zinc-500">Geen resultaten voor "{query}"</p>
            <p className="mt-1 text-xs text-zinc-700">Probeer een ander treinnummer, treinstel of bestemming.</p>
          </div>
        )}

        {/* Cards */}
        <div className="space-y-2.5">
          {results.map(r => (
            <ResultCard key={r.serviceNumber} result={r} query={query} />
          ))}
        </div>

        {/* Hint when empty */}
        {!query && (
          <div className="mt-12 flex flex-col items-center gap-3 text-center">
            <Train className="h-10 w-10 text-zinc-800" />
            <p className="text-sm text-zinc-600">Begin te typen om treinen te zoeken</p>
            <p className="text-xs text-zinc-700">
              Zoek op treinnummer (bijv. <span className="font-mono text-zinc-600">2315</span>),
              treinstel (bijv. <span className="font-mono text-zinc-600">2301</span>),
              bestemming of vervoerder
            </p>
          </div>
        )}

      </main>
    </div>
  )
}

export default function ZoekenPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <ZoekenPageInner />
    </Suspense>
  )
}
