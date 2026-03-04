'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { Wifi, Bike, VolumeX, Plug, Toilet, Accessibility, UtensilsCrossed, Wind, type LucideIcon } from 'lucide-react'
import { Header } from '@/components/header'
import { LiveClock } from '@/components/live-clock'
import type { MaterieelData, MaterialTypeStats } from '@/app/api/materieel/route'

// ─── Facility icon mapping ───────────────────────────────────────────────────

interface FacilityDef { icon: LucideIcon; label: string }

const FACILITY_MAP: Record<string, FacilityDef> = {
  // from STOCK database labels
  'WiFi':              { icon: Wifi,             label: 'WiFi' },
  'Fiets toegestaan':  { icon: Bike,             label: 'Fiets' },
  'Stilte coupé':      { icon: VolumeX,          label: 'Stilte' },
  'Stopcontact':       { icon: Plug,             label: 'Stopcontact' },
  'Toilet':            { icon: Toilet,           label: 'Toilet' },
  'Toegankelijk':      { icon: Accessibility,    label: 'Toegankelijk' },
  'Restauratiewagen':  { icon: UtensilsCrossed,  label: 'Restaurant' },
  'Airco':             { icon: Wind,             label: 'Airco' },
  'WIFI':              { icon: Wifi,             label: 'WiFi' },
  'FIETS':             { icon: Bike,             label: 'Fiets' },
  'STILTECOUPE':       { icon: VolumeX,          label: 'Stilte' },
  'STILTEZONE':        { icon: VolumeX,          label: 'Stilte' },
  'STOPCONTACT':       { icon: Plug,             label: 'Stopcontact' },
  'TOILET':            { icon: Toilet,           label: 'Toilet' },
  'TOEGANKELIJK':      { icon: Accessibility,    label: 'Toegankelijk' },
}

function FacilityBadge({ label }: { label: string }) {
  const def = FACILITY_MAP[label]
  if (!def) return null
  const Icon = def.icon
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-zinc-400">
      <Icon className="h-3 w-3 shrink-0" />
      <span>{def.label}</span>
    </span>
  )
}

// ─── Material card ────────────────────────────────────────────────────────────

function MaterialCard({ m }: { m: MaterialTypeStats }) {
  const [imgError, setImgError] = useState(false)

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900 transition-all hover:border-white/[0.14] hover:bg-zinc-800/80">
      {/* Train image */}
      <div className="relative h-44 w-full overflow-hidden bg-zinc-950">
        {m.image && !imgError ? (
          <Image
            src={m.image}
            alt={m.displayName}
            fill
            className="object-cover object-center"
            onError={() => setImgError(true)}
            unoptimized={m.image.startsWith('http')}
          />
        ) : (
          // Placeholder
          <div className="flex h-full w-full items-center justify-center">
            <svg className="h-16 w-16 text-zinc-700" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 15.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V5c0-3.5-3.58-4-8-4s-8 .5-8 4v10.5zm8 1.5c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm6-7H6V5h12v5z"/>
            </svg>
          </div>
        )}
        {/* Type badge */}
        <div className="absolute top-2 right-2 rounded-md bg-black/70 px-2 py-0.5 text-xs font-bold text-white backdrop-blur-sm">
          {m.displayName}
        </div>
        {/* Active count badge */}
        <div className="absolute bottom-2 left-2 rounded-md bg-blue-500/20 border border-blue-500/30 px-2.5 py-0.5 text-sm font-bold text-blue-300 backdrop-blur-sm">
          {m.activeCount} actief
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="text-sm font-semibold text-white">{m.displayName}</div>
          <div className="text-xs italic text-zinc-500">{m.fullName}</div>
        </div>

        {/* Seats */}
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-zinc-950/60 p-3 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">1e klas</div>
            <div className="mt-0.5 text-sm font-semibold text-amber-400">{m.firstClassSeats}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">2e klas</div>
            <div className="mt-0.5 text-sm font-semibold text-white">{m.secondClassSeats}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Totaal</div>
            <div className="mt-0.5 text-sm font-semibold text-zinc-300">{m.totalSeats}</div>
          </div>
        </div>

        {/* Extra info row */}
        <div className="flex items-center gap-3 text-[11px] text-zinc-500">
          {m.topSpeedKmh > 0 && (
            <span className="flex items-center gap-1">
              <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
              <span>{m.topSpeedKmh} km/u</span>
            </span>
          )}
          {m.lengthM > 0 && (
            <span className="flex items-center gap-1">
              <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
              <span>{m.lengthM} m</span>
            </span>
          )}
        </div>

        {/* Facilities */}
        {m.facilities.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {m.facilities.map(f => (
              <FacilityBadge key={f} label={f} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl border border-white/[0.08] bg-zinc-900 px-6 py-3">
      <span className="text-2xl font-bold tabular-nums text-white">
        {typeof value === 'number' ? value.toLocaleString('nl-NL') : value}
      </span>
      <span className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MaterieelPage() {
  const [data, setData] = useState<MaterieelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/materieel')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5 * 60 * 1000) // refresh every 5 min
    return () => clearInterval(interval)
  }, [fetchData])

  const updatedTime = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="min-h-screen bg-background text-white">
      <Header />

      <main className="mx-auto max-w-[1600px] px-4 py-6">
        {/* Page header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Rollend Materieel</h1>
              <p className="mt-1 text-sm text-zinc-500">
                Overzicht van alle actieve treintypes die op dit moment op het Nederlandse spoor rijden.
                Data via de NS Virtual Train API.
              </p>
            </div>
            <div className="hidden sm:block text-right text-xs text-zinc-600">
              {updatedTime ? (
                <span>Laatste update: <span className="text-zinc-400">{updatedTime}</span></span>
              ) : (
                <LiveClock />
              )}
            </div>
          </div>
        </div>

        {/* Summary stats */}
        {data && (
          <div className="mb-8 flex flex-wrap gap-4">
            <StatPill label="materieel-types" value={data.totalTypes} />
            <StatPill label="actieve eenheden" value={data.totalUnits} />
            <StatPill label="totale zitplaatsen" value={data.totalSeats} />
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-24 text-zinc-600">
            <svg className="mr-3 h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            <span className="text-sm">Materieel laden...</span>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-6 text-center text-sm text-red-400">
            Kon materieel niet laden: {error}
          </div>
        )}

        {/* Grid */}
        {data && !loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {data.types.map(m => (
              <MaterialCard key={`${m.typeCode}-${m.numberOfParts}`} m={m} />
            ))}
            {data.types.length === 0 && (
              <div className="col-span-full py-16 text-center text-sm text-zinc-600">
                Geen materieel gevonden. Mogelijk zijn er geen treinen actief.
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
