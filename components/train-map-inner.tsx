'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer, TileLayer, Marker, Polyline,
  CircleMarker, LayersControl,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Wifi, Bike, Plug, Bath, Accessibility,
  Utensils, VolumeX, Wind, X, ChevronRight,
} from 'lucide-react'
import type { Station } from '@/lib/supabase'
import type { PositionedTrain } from '@/app/api/trains/positions/route'
import type { TrainDetail, StopInfo } from '@/app/api/trains/info/route'

// ─── Facility icon map ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FACILITY_ICON: Record<string, React.ComponentType<any>> = {
  wifi:           Wifi,
  fiets:          Bike,
  stopcontact:    Plug,
  toilet:         Bath,
  toegankelijk:   Accessibility,
  restaurant:     Utensils,
  'stille-coupe': VolumeX,
  airco:          Wind,
}

// ─── Status + type colors ─────────────────────────────────────────────────────

function delayColor(delay: number, cancelled: boolean) {
  if (cancelled || delay >= 15) return '#ef4444'
  if (delay >= 3) return '#f59e0b'
  return '#22c55e'
}

const TYPE_BG: Record<string, string> = {
  IC: '#1d4ed8', ICD: '#1e40af', ICE: '#5b21b6',
  SPR: '#15803d', SNG: '#166534', SLT: '#14532d',
  INT: '#92400e', THA: '#9d174d', EUR: '#3730a3', NT: '#374151',
  ARR: '#065f46', RNT: '#b45309', VLL: '#b45309',
  FLI: '#065f46', GTW: '#065f46',
  QBZ: '#075985', BLN: '#164e63', DB: '#991b1b',
  RRR: '#6b21a8', STP: '#166534', '?': '#374151',
}
function typeColor(code: string) { return TYPE_BG[code?.toUpperCase()] ?? TYPE_BG['?'] }

// ─── Circle dot icon (replaces pill label) ────────────────────────────────────

function makeCircleIcon(
  delay: number,
  cancelled: boolean,
  selected: boolean,
): L.DivIcon {
  const fill = delayColor(delay, cancelled)
  const size = selected ? 14 : 10
  const ringStyle = selected
    ? `border:2.5px solid #3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.25),0 2px 8px rgba(0,0,0,.7);`
    : `border:1.5px solid rgba(255,255,255,0.55);box-shadow:0 1px 5px rgba(0,0,0,.6);`

  const total = size + 20
  return L.divIcon({
    html: `<div style="position:relative;width:${total}px;height:${total}px;display:flex;align-items:center;justify-content:center;">
      <div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:${fill};${ringStyle}
        cursor:pointer;opacity:${cancelled ? 0.55 : 1};
        transition:all .15s;flex-shrink:0;
      "></div>
    </div>`,
    className: '',
    iconSize: [total, total],
    iconAnchor: [total / 2, total / 2],
  })
}

// ─── Time formatter ───────────────────────────────────────────────────────────

function fmt(iso?: string | null) {
  if (!iso) return '–'
  return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

function delayMin(planned?: string | null, actual?: string | null) {
  if (!planned || !actual) return 0
  return Math.round((new Date(actual).getTime() - new Date(planned).getTime()) / 60000)
}

function compassLabel(deg: number): string {
  const dirs = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW']
  return dirs[Math.round(deg / 45) % 8]
}

// ─── Stop row ─────────────────────────────────────────────────────────────────

const CROWD_COLOR: Record<string, string> = {
  LOW: '#22c55e', MEDIUM: '#f59e0b', HIGH: '#ef4444', UNKNOWN: '#374151',
}
const CROWD_ICON: Record<string, string> = {
  LOW: '●○○', MEDIUM: '●●○', HIGH: '●●●', UNKNOWN: '○○○',
}

function StopRow({ stop, onStationClick }: {
  stop: StopInfo
  onStationClick?: (lat: number, lng: number, name: string) => void
}) {
  const planned  = stop.plannedDeparture ?? stop.plannedArrival
  const actual   = stop.actualDeparture  ?? stop.actualArrival
  const late     = delayMin(planned, actual)
  const isPassed = stop.passed
  const isCancelled = stop.cancelled

  const dotColor = isCancelled ? '#ef4444'
    : stop.current ? '#60a5fa'
    : isPassed ? '#64748b' : '#94a3b8'
  const nameColor = isCancelled ? '#ef4444'
    : stop.current ? '#f8fafc'
    : isPassed ? '#cbd5e1' : '#e2e8f0'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '4px 0',
      borderLeft: stop.current ? '2px solid #3b82f6' : '2px solid transparent',
      paddingLeft: stop.current ? 8 : 10,
      opacity: isCancelled ? 0.6 : 1,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: dotColor,
        outline: stop.current ? '2px solid #3b82f6' : 'none',
        outlineOffset: 2,
      }} />
      <span
        onClick={() => stop.lat && stop.lng && onStationClick?.(stop.lat, stop.lng, stop.name)}
        style={{
          flex: 1, fontSize: 11, color: nameColor,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          textDecoration: isCancelled ? 'line-through' : 'none',
          cursor: (stop.lat && stop.lng && !isCancelled) ? 'pointer' : 'default',
          borderRadius: 3,
        }}
      >
        {stop.name}
      </span>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {isCancelled ? (
          <span style={{ fontSize: 9, color: '#ef4444' }}>uitval</span>
        ) : planned ? (
          <>
            <span style={{ fontSize: 11, color: late > 0 ? '#f59e0b' : isPassed ? '#94a3b8' : '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>
              {late > 0 ? fmt(actual) : fmt(planned)}
            </span>
            {late > 0 && (
              <span style={{ fontSize: 9, color: '#f59e0b', marginLeft: 2 }}>+{late}</span>
            )}
          </>
        ) : (
          <span style={{ fontSize: 11, color: '#94a3b8' }}>–</span>
        )}
      </div>
      {stop.platform && !isCancelled && (
        <span style={{ fontSize: 9, color: '#cbd5e1', flexShrink: 0 }}>sp.{stop.platform}</span>
      )}
      {stop.crowdForecast && stop.crowdForecast !== 'UNKNOWN' && !isPassed && !isCancelled && (
        <span title={stop.crowdForecast}
          style={{ fontSize: 8, color: CROWD_COLOR[stop.crowdForecast] ?? '#94a3b8', letterSpacing: -1, flexShrink: 0 }}>
          {CROWD_ICON[stop.crowdForecast] ?? ''}
        </span>
      )}
    </div>
  )
}

// ─── Full Detail Panel (sidebar) ──────────────────────────────────────────────

function TrainDetailPanel({ train, onClose, onStationClick, onStopsLoaded }: {
  train: PositionedTrain
  onClose: () => void
  onStationClick: (lat: number, lng: number, name: string) => void
  onStopsLoaded?: (stops: Array<[number, number]>) => void
}) {
  const [detail, setDetail] = useState<TrainDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentSpeed, setCurrentSpeed] = useState(train.speedKmh)

  useEffect(() => { setCurrentSpeed(train.speedKmh) }, [train.speedKmh])

  useEffect(() => {
    setDetail(null)
    setLoading(true)
    fetch(`/api/trains/info?ritnummer=${encodeURIComponent(train.serviceNumber)}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: TrainDetail | null) => {
        setDetail(d)
        setLoading(false)
        if (d?.stops && onStopsLoaded) {
          const coords = d.stops.filter(s => s.lat && s.lng).map(s => [s.lat!, s.lng!] as [number, number])
          if (coords.length > 1) onStopsLoaded(coords)
        }
      })
      .catch(() => setLoading(false))
  }, [train.serviceNumber, onStopsLoaded])

  const mat = detail?.material ?? null
  const bg = typeColor(train.typeCode)
  const dColor = delayColor(train.delay, train.cancelled)

  const stops = useMemo<StopInfo[]>(() => {
    if (!detail?.stops.length) return []
    const firstFuture = detail.stops.findIndex(s => !s.passed)
    return detail.stops.map((s, i) => ({ ...s, current: i === firstFuture }))
  }, [detail])

  const passedCount = stops.filter(s => s.passed).length
  const progressPct = stops.length > 1 ? Math.round((passedCount / (stops.length - 1)) * 100) : 0

  return (
    <div style={{
      position: 'absolute', right: 0, top: 0, bottom: 0,
      width: 'clamp(280px, min(90vw, 28vw), 400px)',
      zIndex: 2000,
      background: 'var(--card)',
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      backdropFilter: 'blur(12px)',
      fontFamily: "'Courier New',monospace",
      boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
    }}>
      {/* Header */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        {mat?.image && (
          <div style={{ background: '#050508', padding: '10px 16px 8px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mat.image} alt={mat.fullName}
              style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }} />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 12px', paddingRight: 46 }}>
          <span style={{ background: bg, color: '#fff', padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: 800, letterSpacing: '.1em', flexShrink: 0 }}>
            {train.typeCode || '?'}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc', lineHeight: 1.2 }}>Trein {train.serviceNumber}</div>
            <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>{mat ? mat.fullName : train.operator}</div>
          </div>
        </div>
      </div>

      <button onClick={onClose}
        style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--muted-foreground)', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <X size={14} strokeWidth={2} />
      </button>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 24px' }}>
        {/* Status strip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--muted)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, border: `1px solid ${train.cancelled ? 'var(--destructive)' : train.delay >= 3 ? 'var(--chart-2)' : 'var(--chart-1)'}` }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dColor, flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: dColor }}>
            {train.cancelled ? 'Geannuleerd' : train.delay <= 0 ? 'Op tijd' : `+${train.delay} min vertraging`}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569' }}>
            {currentSpeed} km/u · {Math.round(train.heading)}° {compassLabel(train.heading)}
          </span>
        </div>

        {/* Speed */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent)', borderRadius: 12, padding: '16px', marginBottom: 14, border: '2px solid var(--ring)' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: 'var(--muted-foreground)', marginBottom: 4, fontWeight: 500 }}>Snelheid</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{currentSpeed}</div>
            <div style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 500 }}>km/u</div>
          </div>
        </div>

        {/* Info grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginBottom: 14 }}>
          {[
            { label: 'Vervoerder', value: train.operator },
            { label: 'Bestemming', value: train.destination || '–' },
            { label: 'Spoor', value: train.platform || '–' },
            { label: 'Snelheid', value: `${currentSpeed} km/u` },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'var(--muted)', borderRadius: 6, padding: '7px 10px' }}>
              <div style={{ fontSize: 8, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 12, color: 'var(--foreground)', fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>

        {train.via && (
          <div style={{ background: 'var(--muted)', borderRadius: 6, padding: '7px 10px', marginBottom: 14 }}>
            <div style={{ fontSize: 8, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 2 }}>Via</div>
            <div style={{ fontSize: 11, color: 'var(--foreground)' }}>{train.via}</div>
          </div>
        )}

        {/* Material */}
        {loading && !mat && (
          <div style={{ borderRadius: 8, background: 'var(--muted)', padding: '10px 12px', marginBottom: 14 }}>
            <div style={{ fontSize: 9, color: 'var(--muted-foreground)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.1em' }}>Materieel</div>
            {[40, 60, 50].map((w, i) => (
              <div key={i} style={{ height: 10, background: 'var(--accent)', borderRadius: 3, marginBottom: 5, width: `${w}%`, animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        )}

        {mat && (
          <div style={{ borderRadius: 8, background: 'rgba(255,255,255,0.03)', padding: '10px 12px', marginBottom: 14, border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>Materieel</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 14px', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 8, color: '#334155' }}>Type</div>
                <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{mat.code}</div>
              </div>
              {mat.numberOfParts != null && (
                <div>
                  <div style={{ fontSize: 8, color: '#334155' }}>Samenstelling</div>
                  <div style={{ fontSize: 12, color: '#e2e8f0' }}>{mat.numberOfParts}-delig{mat.lengthM ? ` · ${mat.lengthM}m` : ''}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 8, color: '#334155' }}>Zitplaatsen</div>
                <div style={{ fontSize: 12, color: '#e2e8f0' }}>
                  {mat.seats1st != null && mat.seats1st > 0 ? `1e: ${mat.seats1st} · ` : ''}
                  {mat.seats2nd != null ? `2e: ${mat.seats2nd}` : '–'}
                </div>
              </div>
              {mat.topSpeedKmh != null && (
                <div>
                  <div style={{ fontSize: 8, color: '#334155' }}>Topsnelheid</div>
                  <div style={{ fontSize: 12, color: '#e2e8f0' }}>{mat.topSpeedKmh} km/u</div>
                </div>
              )}
            </div>
            {mat.facilityLabels?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {mat.facilityLabels.map(f => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const Icon = FACILITY_ICON[(f as any).key ?? '']
                  return (
                    <span key={f.label} title={f.label}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5, padding: '3px 7px', cursor: 'default', fontSize: 10, color: '#94a3b8' }}>
                      {Icon && <Icon size={11} strokeWidth={1.75} color="#64748b" />}
                      {f.label}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Route */}
        {stops.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 600 }}>Route · {stops.length} stops</div>
              <div style={{ fontSize: 9, color: '#cbd5e1' }}>{passedCount}/{stops.length - 1} gereden</div>
            </div>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 10, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#3b82f6', width: `${progressPct}%`, borderRadius: 2, transition: 'width .5s' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {stops.map((s, i) => (
                <StopRow key={`${s.uicCode}-${i}`} stop={s} onStationClick={onStationClick} />
              ))}
            </div>
          </>
        )}

        {loading && stops.length === 0 && (
          <div style={{ color: '#334155', fontSize: 10, textAlign: 'center', padding: '16px 0' }}>Route laden…</div>
        )}

        <div style={{ marginTop: 16, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)', color: '#1e293b', fontSize: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <span>{train.operator}</span><span>·</span><span>{train.typeCode}{train.serviceNumber}</span>
          {train.materieelNummers.length > 0 && (
            <span style={{ color: '#1e293b', marginLeft: 4 }}>{train.materieelNummers.slice(0, 4).join(' · ')}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Quick Preview Popover ────────────────────────────────────────────────────

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 500, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: valueColor ?? '#f1f5f9', fontWeight: 600, textAlign: 'right', marginLeft: 8 }}>{value}</span>
    </div>
  )
}

function QuickPreviewPopover({
  train,
  position,
  onClose,
  onViewDetails,
}: {
  train: PositionedTrain
  position: { x: number; y: number }
  onClose: () => void
  onViewDetails: () => void
}) {
  const [detail, setDetail] = useState<TrainDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setDetail(null)
    setLoading(true)
    fetch(`/api/trains/info?ritnummer=${encodeURIComponent(train.serviceNumber)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setDetail(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [train.serviceNumber])

  const mat = detail?.material ?? null
  const dColor = delayColor(train.delay, train.cancelled)
  const delayText = train.cancelled ? 'Uitval' : train.delay <= 0 ? 'Op tijd' : `+${train.delay} min`

  // Smart positioning: keep within viewport
  const W = 280
  let top = position.y - 20
  let left = position.x + 16
  if (typeof window !== 'undefined') {
    if (left + W > window.innerWidth - 8) left = position.x - W - 16
    if (top + 460 > window.innerHeight - 8) top = Math.max(8, window.innerHeight - 468)
    if (top < 8) top = 8
  }

  return (
    <>
      {/* Invisible backdrop to close on outside click */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 2999 }}
        onClick={onClose}
      />

      {/* Card */}
      <div
        style={{
          position: 'fixed', top, left,
          zIndex: 3001,
          width: W,
          background: '#18181b',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 4px 16px rgba(0,0,0,0.4)',
          overflow: 'hidden',
          fontFamily: 'system-ui, sans-serif',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Title bar ── */}
        <div style={{ padding: '14px 40px 10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {train.serviceNumber}
            </span>
            <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 400 }}>
              {mat?.fullName || train.typeCode || train.operator}
            </span>
          </div>
        </div>

        {/* Close btn */}
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 10, right: 10, zIndex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7280', width: 26, height: 26, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={13} strokeWidth={2} />
        </button>

        {/* ── Info rows ── */}
        <div style={{ padding: '10px 16px 6px' }}>
          <InfoRow label="Vervoerder" value={train.operator} />
          <InfoRow label="Bestemming" value={train.destination || '—'} />
          <InfoRow label="Snelheid" value={`${train.speedKmh} km/u`} />
          <InfoRow label="Spoor" value={train.platform || '—'} />
          <InfoRow label="Vertraging" value={delayText} valueColor={dColor} />
        </div>

        {/* ── Train image ── */}
        {(mat?.image || loading) && (
          <div style={{ background: '#09090b', marginTop: 6, minHeight: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {mat?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mat.image}
                alt={mat.fullName}
                style={{ width: '100%', height: 80, objectFit: 'contain', display: 'block', padding: '6px 12px' }}
              />
            ) : loading ? (
              <div style={{ width: '60%', height: 12, background: 'rgba(255,255,255,0.06)', borderRadius: 4, margin: '16px auto', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ) : null}
          </div>
        )}

        {/* ── Material section ── */}
        <div style={{ padding: '10px 16px 4px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          {loading && !mat ? (
            <div style={{ display: 'flex', gap: 6 }}>
              {[50, 70, 55].map((w, i) => (
                <div key={i} style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 3, flex: 1, animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))}
            </div>
          ) : mat ? (
            <>
              <InfoRow label="Materieel" value={mat.code} />
              {mat.numberOfParts != null && (
                <InfoRow
                  label="Lengte"
                  value={[mat.lengthM ? `${mat.lengthM}m` : null, `${mat.numberOfParts} delen`].filter(Boolean).join(' · ')}
                />
              )}
              {mat.seats2nd != null && (
                <InfoRow
                  label="Zitplaatsen"
                  value={[mat.seats1st && mat.seats1st > 0 ? `1e: ${mat.seats1st}` : null, `2e: ${mat.seats2nd}`].filter(Boolean).join(' · ')}
                />
              )}

              {/* Facility icons */}
              {mat.facilityLabels?.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 500, flexShrink: 0 }}>Voorzieningen</span>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {mat.facilityLabels.map(f => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const Icon = FACILITY_ICON[(f as any).key ?? '']
                      return Icon ? (
                        <span key={f.label} title={f.label}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 5, padding: '4px', cursor: 'default' }}>
                          <Icon size={12} strokeWidth={1.75} color="#94a3b8" />
                        </span>
                      ) : null
                    })}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* ── Details button ── */}
        <button
          onClick={onViewDetails}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            padding: '11px 16px',
            marginTop: 8,
            background: 'transparent',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            border: 'none',
            borderTopWidth: 1,
            borderTopStyle: 'solid',
            borderTopColor: 'rgba(255,255,255,0.07)',
            color: '#3b82f6',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          Bekijk details
          <ChevronRight size={15} strokeWidth={2.5} />
        </button>
      </div>
    </>
  )
}

// ─── Animated Circle Marker ───────────────────────────────────────────────────

function AnimatedCircleMarker({
  train,
  selected,
  inPopover,
  onSelect,
}: {
  train: PositionedTrain
  selected: boolean
  inPopover: boolean
  onSelect: (clientX: number, clientY: number) => void
}) {
  const [animPos, setAnimPos] = useState({ lat: train.lat, lng: train.lng })
  const prevPosRef = useRef({ lat: train.lat, lng: train.lng })
  const startTimeRef = useRef(0)
  const rafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const prev = prevPosRef.current
    if (prev.lat !== train.lat || prev.lng !== train.lng) {
      prevPosRef.current = { lat: train.lat, lng: train.lng }
      startTimeRef.current = Date.now()
      const animate = () => {
        const elapsed = Date.now() - startTimeRef.current
        const progress = Math.min(elapsed / 1000, 1)
        const ease = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2
        setAnimPos({
          lat: prev.lat + (train.lat - prev.lat) * ease,
          lng: prev.lng + (train.lng - prev.lng) * ease,
        })
        if (progress < 1) rafRef.current = requestAnimationFrame(animate)
      }
      rafRef.current = requestAnimationFrame(animate)
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [train.lat, train.lng])

  return (
    <Marker
      position={[animPos.lat, animPos.lng]}
      icon={makeCircleIcon(train.delay, train.cancelled, selected || inPopover)}
      zIndexOffset={selected ? 2000 : inPopover ? 1000 : train.delay > 0 ? 100 : 0}
      eventHandlers={{
        click: (e) => {
          e.originalEvent.stopPropagation()
          onSelect(e.originalEvent.clientX, e.originalEvent.clientY)
        },
      }}
    />
  )
}

// ─── Main map ─────────────────────────────────────────────────────────────────

interface Props {
  stations: Station[]
  trains: PositionedTrain[]
}

interface PopoverState {
  trainId: string
  pos: { x: number; y: number }
}

export default function TrainMapInner({ stations, trains }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const [routeStops, setRouteStops] = useState<Array<[number, number]>>([])
  const mapRef = useRef<L.Map | null>(null)

  const selected = useMemo(() => trains.find(t => t.id === selectedId) ?? null, [trains, selectedId])
  const popoverTrain = useMemo(() => popover ? trains.find(t => t.id === popover.trainId) ?? null : null, [trains, popover])

  const handleMarkerClick = useCallback((trainId: string, clientX: number, clientY: number) => {
    // If clicking the already-popovered train, close it
    if (popover?.trainId === trainId) {
      setPopover(null)
      return
    }
    // Close sidebar when clicking a new train
    setSelectedId(null)
    setRouteStops([])
    setPopover({ trainId, pos: { x: clientX, y: clientY } })
  }, [popover])

  const handleViewDetails = useCallback(() => {
    if (!popover) return
    setSelectedId(popover.trainId)
    setPopover(null)
  }, [popover])

  const handleClosePanel = useCallback(() => {
    setSelectedId(null)
    setRouteStops([])
  }, [])

  const handleStopsLoaded = useCallback((stops: Array<[number, number]>) => {
    setRouteStops(stops)
  }, [])

  const flyToStation = useCallback((lat: number, lng: number) => {
    mapRef.current?.flyTo([lat, lng], 14, { animate: true, duration: 0.8 })
  }, [])

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer
        ref={mapRef}
        center={[52.18, 5.38]} zoom={8} minZoom={7} maxZoom={16}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Kaart">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' maxZoom={19} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Dark">
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              subdomains="abcd" maxZoom={19} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satelliet">
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution='Tiles &copy; Esri' maxZoom={18} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Terrein">
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
              attribution='Tiles &copy; Esri' maxZoom={18} />
          </LayersControl.BaseLayer>
          <LayersControl.Overlay checked name="Spoorwegen">
            <TileLayer url="https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png"
              attribution='Map style: &copy; <a href="https://www.OpenRailwayMap.org">OpenRailwayMap</a> (CC-BY-SA)'
              maxZoom={19} opacity={0.8} />
          </LayersControl.Overlay>
          <LayersControl.Overlay name="Maxsnelheid">
            <TileLayer url="https://{s}.tiles.openrailwaymap.org/maxspeed/{z}/{x}/{y}.png"
              attribution='Map style: &copy; <a href="https://www.OpenRailwayMap.org">OpenRailwayMap</a> (CC-BY-SA)'
              maxZoom={19} opacity={0.8} />
          </LayersControl.Overlay>
        </LayersControl>

        {/* Station dots */}
        {stations.map(s => (
          <CircleMarker
            key={`st-${s.abbreviation}`}
            center={[s.lat, s.lng]}
            radius={2}
            pathOptions={{ fillColor: '#fff', color: 'transparent', fillOpacity: 0.18 }}
          />
        ))}

        {/* Train circle markers */}
        {trains.map(train => (
          <AnimatedCircleMarker
            key={train.id}
            train={train}
            selected={train.id === selectedId}
            inPopover={train.id === popover?.trainId}
            onSelect={(x, y) => handleMarkerClick(train.id, x, y)}
          />
        ))}

        {/* Route line */}
        {selected && routeStops.length > 1 && (
          <Polyline
            positions={routeStops}
            pathOptions={{ color: '#3b82f6', weight: 2.5, opacity: 0.55, dashArray: '6 5' }}
          />
        )}
      </MapContainer>

      {/* Quick preview popover */}
      {popoverTrain && popover && (
        <QuickPreviewPopover
          train={popoverTrain}
          position={popover.pos}
          onClose={() => setPopover(null)}
          onViewDetails={handleViewDetails}
        />
      )}

      {/* Full detail sidebar */}
      {selected && (
        <TrainDetailPanel
          key={selected.id}
          train={selected}
          onClose={handleClosePanel}
          onStationClick={flyToStation}
          onStopsLoaded={handleStopsLoaded}
        />
      )}
    </div>
  )
}
