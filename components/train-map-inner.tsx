'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer, TileLayer, Marker, Polyline,
  CircleMarker, LayersControl, Tooltip,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Wifi, Bike, Zap, Bath, Accessibility,
  Utensils, VolumeX, Wind, X,
} from 'lucide-react'
import type { Station } from '@/lib/supabase'
import type { PositionedTrain } from '@/app/api/trains/positions/route'
import type { TrainDetail, StopInfo } from '@/app/api/trains/info/route'

// ─── Facility icon map ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FACILITY_ICON: Record<string, React.ComponentType<any>> = {
  wifi:           Wifi,
  fiets:          Bike,
  stopcontact:    Zap,
  toilet:         Bath,
  toegankelijk:   Accessibility,
  restaurant:     Utensils,
  'stille-coupe': VolumeX,
  airco:          Wind,
}

// ─── Type → accent color ──────────────────────────────────────────────────────

const TYPE_BG: Record<string, string> = {
  // NS intercity familie
  IC:  '#1d4ed8', ICD: '#1e40af', ICE: '#5b21b6',
  // NS sprinter familie
  SPR: '#15803d', SNG: '#166534', SLT: '#14532d',
  // Internationaal
  INT: '#92400e', THA: '#9d174d', EUR: '#3730a3', NT: '#374151',
  // Regionale operators
  ARR: '#065f46',   // Arriva (groen)
  RNT: '#b45309',   // R-net (oranje-bruin)
  VLL: '#b45309',   // Valleilijn (zelfde als R-net)
  FLI: '#065f46',   // FLIRT (Arriva/EBS)
  GTW: '#065f46',   // GTW (Arriva diesel)
  // Overig
  QBZ: '#075985', BLN: '#164e63', DB: '#991b1b',
  RRR: '#6b21a8', STP: '#166534',
  '?': '#374151',
}
function typeColor(code: string) { return TYPE_BG[code?.toUpperCase()] ?? TYPE_BG['?'] }
function delayColor(delay: number, cancelled: boolean) {
  if (cancelled || delay >= 15) return '#ef4444'
  if (delay >= 3) return '#f59e0b'
  return '#22c55e'
}

// ─── DivIcon marker ───────────────────────────────────────────────────────────

function makeTrainIcon(
  typeCode: string, delay: number, cancelled: boolean,
  selected: boolean, heading?: number
): L.DivIcon {
  const bg     = typeColor(typeCode)
  const ring   = cancelled ? '#ef4444' : delay >= 15 ? '#ef4444' : delay >= 3 ? '#f59e0b' : 'transparent'
  const ringW  = (cancelled || delay >= 3) ? 2 : 0
  const scale  = selected ? 1.4 : 1
  const shadow = selected
    ? '0 0 0 3px rgba(59,130,246,.65),0 3px 12px rgba(0,0,0,.7)'
    : '0 1px 6px rgba(0,0,0,.6)'

  // Kleine richtingspijl boven het label
  const arrowHtml = (heading != null && heading >= 0)
    ? `<div style="
        position:absolute;top:-7px;left:50%;transform:translateX(-50%) rotate(${heading}deg);
        width:0;height:0;
        border-left:4px solid transparent;border-right:4px solid transparent;
        border-bottom:7px solid ${bg};
        filter:drop-shadow(0 1px 2px rgba(0,0,0,.5));
      "></div>`
    : ''

  return L.divIcon({
    html: `<div style="position:relative;display:inline-block;">
      ${arrowHtml}
      <div style="
        display:inline-flex;align-items:center;gap:3px;
        background:${bg};color:#fff;
        font-family:'Courier New',monospace;font-size:9px;font-weight:800;
        padding:2px 6px 2px 4px;border-radius:4px;
        border:${ringW}px solid ${ring};
        box-shadow:${shadow};
        opacity:${cancelled ? .55 : 1};letter-spacing:.08em;line-height:1.6;
        white-space:nowrap;transform:scale(${scale});transform-origin:center;
        transition:transform .15s;cursor:pointer;
      ">
        ${typeCode || '?'}
      </div>
    </div>`,
    className: '',
    iconSize: undefined,
    iconAnchor: [20, 18],
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

// ─── Compass heading label ────────────────────────────────────────────────────

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
        title={stop.lat && stop.lng ? `Zoom naar ${stop.name}` : undefined}
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

// ─── Detail panel ─────────────────────────────────────────────────────────────

function TrainDetailPanel({ train, onClose, onStationClick, onStopsLoaded }: {
  train: PositionedTrain
  onClose: () => void
  onStationClick: (lat: number, lng: number, name: string) => void
  onStopsLoaded?: (stops: Array<[number, number]>) => void
}) {
  const [detail, setDetail] = useState<TrainDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentSpeed, setCurrentSpeed] = useState(train.speedKmh)

  // Update speed whenever train prop changes
  useEffect(() => {
    setCurrentSpeed(train.speedKmh)
  }, [train.speedKmh])

  useEffect(() => {
    setDetail(null)
    setLoading(true)
    fetch(`/api/trains/info?ritnummer=${encodeURIComponent(train.serviceNumber)}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: TrainDetail | null) => {
        setDetail(d)
        setLoading(false)
        if (d?.stops && onStopsLoaded) {
          const coords = d.stops
            .filter(s => s.lat && s.lng)
            .map(s => [s.lat!, s.lng!] as [number, number])
          if (coords.length > 1) onStopsLoaded(coords)
        }
      })
      .catch(() => setLoading(false))
  }, [train.serviceNumber, onStopsLoaded])

  const mat    = detail?.material ?? null
  const bg     = typeColor(train.typeCode)
  const dColor = delayColor(train.delay, train.cancelled)

  // Mark "current" stop — first unpassed stop
  const stops = useMemo<StopInfo[]>(() => {
    if (!detail?.stops.length) return []
    const firstFuture = detail.stops.findIndex(s => !s.passed)
    return detail.stops.map((s, i) => ({ ...s, current: i === firstFuture }))
  }, [detail])

  const passedCount  = stops.filter(s => s.passed).length
  const progressPct  = stops.length > 1 ? Math.round((passedCount / (stops.length - 1)) * 100) : 0

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

      {/* ── Header ── */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)' }}>

        {/* Train image — natural aspect ratio, dark bg, full width */}
        {mat?.image && (
          <div style={{ background: '#050508', padding: '10px 16px 8px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mat.image} alt={mat.fullName}
              style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }} />
          </div>
        )}

        {/* Type badge + train number */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 12px', paddingRight: 46 }}>
          <span style={{ background: bg, color: '#fff', padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: 800, letterSpacing: '.1em', flexShrink: 0 }}>
            {train.typeCode || '?'}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc', lineHeight: 1.2 }}>
              Trein {train.serviceNumber}
            </div>
            <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>
              {mat ? mat.fullName : train.operator}
            </div>
          </div>
        </div>
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 10, right: 10, zIndex: 10,
          background: 'var(--muted)', border: '1px solid var(--border)',
          color: 'var(--muted-foreground)', width: 28, height: 28, borderRadius: 6,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <X size={14} strokeWidth={2} />
      </button>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 24px' }}>

        {/* Status strip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--muted)', borderRadius: 8,
          padding: '8px 12px', marginBottom: 14,
          border: `1px solid ${train.cancelled ? 'var(--destructive)' : train.delay >= 3 ? 'var(--chart-2)' : 'var(--chart-1)'}`,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dColor, flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: dColor }}>
            {train.cancelled ? 'Geannuleerd' : train.delay <= 0 ? 'Op tijd' : `+${train.delay} min vertraging`}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569' }}>
            {train.speedKmh} km/u · {Math.round(train.heading)}° {compassLabel(train.heading)}
          </span>
        </div>

        {/* Speed Display */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--accent)', borderRadius: 12,
          padding: '16px', marginBottom: 14,
          border: '2px solid var(--ring)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: 'var(--muted-foreground)', marginBottom: 4, fontWeight: 500 }}>
              Snelheid
            </div>
            <div style={{
              fontSize: 32, fontWeight: 800, color: 'var(--foreground)',
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em'
            }}>
              {currentSpeed}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 500 }}>
              km/u
            </div>
          </div>
        </div>

        {/* Info grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginBottom: 14 }}>
          {[
            { label: 'Vervoerder',  value: train.operator },
            { label: 'Bestemming', value: train.destination || '–' },
            { label: 'Spoor',      value: train.platform || '–' },
            { label: 'Snelheid',   value: `${currentSpeed} km/u` },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'var(--muted)', borderRadius: 6, padding: '7px 10px' }}>
              <div style={{ fontSize: 8, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 12, color: 'var(--foreground)', fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Via */}
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
              <div key={i} style={{ height: 10, background: 'var(--accent)', borderRadius: 3, marginBottom: 5, width: `${w}%`,
                animation: 'pulse 1.5s ease-in-out infinite' }} />
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                {mat.facilityLabels.map(f => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const Icon = FACILITY_ICON[(f as any).key ?? '']
                  return (
                    <span key={f.label} title={f.label}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: 5, padding: '3px 7px', cursor: 'default',
                        fontSize: 10, color: '#94a3b8',
                      }}>
                      {Icon && <Icon size={11} strokeWidth={1.75} color="#64748b" />}
                      {f.label}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Route progress */}
        {stops.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 600 }}>
                Route · {stops.length} stops
              </div>
              <div style={{ fontSize: 9, color: '#cbd5e1' }}>{passedCount}/{stops.length - 1} gereden</div>
            </div>

            {/* Progress bar */}
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
          <div style={{ color: '#334155', fontSize: 10, textAlign: 'center', padding: '16px 0' }}>
            Route laden…
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 16, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)', color: '#1e293b', fontSize: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <span>{train.operator}</span>
          <span>·</span>
          <span>{train.typeCode}{train.serviceNumber}</span>
          {train.materieelNummers.length > 0 && (
            <span style={{ color: '#1e293b', marginLeft: 4 }}>
              {train.materieelNummers.slice(0, 4).join(' · ')}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Quick Preview Popover ────────────────────────────────────────────────────

interface PopoverPosition {
  x: number
  y: number
}

function QuickPreviewPopover({
  train,
  position,
  onClose,
  onViewDetails,
}: {
  train: PositionedTrain
  position: PopoverPosition
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

  const bg = typeColor(train.typeCode)
  const dColor = delayColor(train.delay, train.cancelled)
  const mat = detail?.material ?? null

  // Adjust position to not go off-screen
  let top = position.y - 240
  let left = position.x - 115
  
  if (typeof window !== 'undefined') {
    if (top < 10) top = position.y + 10
    if (left < 10) left = 10
    if (left + 260 > window.innerWidth) left = window.innerWidth - 270
  }

  return (
    <>
      {/* Close backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2999,
        }}
        onClick={onClose}
      />

      {/* Popover */}
      <div
        style={{
          position: 'fixed',
          top,
          left,
          zIndex: 3001,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          width: 240,
          overflow: 'hidden',
          fontFamily: "'Courier New',monospace",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Train image */}
        {mat?.image && (
          <div style={{ background: '#050508', padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mat.image} alt={mat.fullName}
              style={{ height: 40, objectFit: 'contain', display: 'block' }} />
          </div>
        )}

        {/* Header */}
        <div style={{ padding: '10px 10px 6px', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span
              style={{
                background: bg,
                color: '#fff',
                padding: '2px 6px',
                borderRadius: 3,
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '.08em',
                minWidth: 36,
                textAlign: 'center',
                flexShrink: 0,
              }}
            >
              {train.typeCode || '?'}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--foreground)', lineHeight: 1.1 }}>
                Trein {train.serviceNumber}
              </div>
              <div style={{ fontSize: 8, color: 'var(--muted-foreground)' }}>
                {mat?.fullName || train.operator}
              </div>
            </div>
          </div>

          {/* Status */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'var(--muted)',
              borderRadius: 4,
              padding: '5px 7px',
              border: `1px solid ${train.cancelled ? 'var(--destructive)' : train.delay >= 3 ? '#f59e0b' : '#22c55e'}`,
              fontSize: 8,
            }}
          >
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: dColor, flexShrink: 0 }} />
            <span style={{ fontWeight: 700, color: dColor, flex: 1 }}>
              {train.cancelled ? 'Uitval' : train.delay <= 0 ? 'Op tijd' : `+${train.delay}min`}
            </span>
            <span style={{ color: 'var(--muted-foreground)' }}>
              {train.speedKmh}km/u
            </span>
          </div>
        </div>

        {/* Details grid */}
        <div style={{ padding: '8px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginBottom: 6 }}>
          <div style={{ background: 'var(--muted)', borderRadius: 3, padding: '4px 6px' }}>
            <div style={{ fontSize: 6, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 1 }}>Bestemming</div>
            <div style={{ fontSize: 9, color: 'var(--foreground)', fontWeight: 600, lineHeight: 1.2 }}>
              {train.destination || '–'}
            </div>
          </div>
          <div style={{ background: 'var(--muted)', borderRadius: 3, padding: '4px 6px' }}>
            <div style={{ fontSize: 6, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 1 }}>Perron</div>
            <div style={{ fontSize: 9, color: 'var(--foreground)', fontWeight: 600 }}>
              {train.platform || '–'}
            </div>
          </div>
          <div style={{ background: 'var(--muted)', borderRadius: 3, padding: '4px 6px' }}>
            <div style={{ fontSize: 6, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 1 }}>Vervoerder</div>
            <div style={{ fontSize: 9, color: 'var(--foreground)', fontWeight: 600 }}>
              {train.operator}
            </div>
          </div>
          {mat?.code && (
            <div style={{ background: 'var(--muted)', borderRadius: 3, padding: '4px 6px' }}>
              <div style={{ fontSize: 6, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 1 }}>Type</div>
              <div style={{ fontSize: 9, color: 'var(--foreground)', fontWeight: 600 }}>
                {mat.code}
              </div>
            </div>
          )}
        </div>

        {/* Material specs */}
        {mat && (
          <div style={{ padding: '0 10px 8px', fontSize: 7, color: 'var(--muted-foreground)', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {mat.numberOfParts != null && (
              <span style={{ background: 'rgba(59,130,246,0.1)', padding: '1px 4px', borderRadius: 2 }}>
                {mat.numberOfParts}-delig
              </span>
            )}
            {mat.seats2nd != null && (
              <span style={{ background: 'rgba(59,130,246,0.1)', padding: '1px 4px', borderRadius: 2 }}>
                {mat.seats1st && mat.seats1st > 0 ? `1e:${mat.seats1st}` : ''}2e:{mat.seats2nd}
              </span>
            )}
            {mat.topSpeedKmh != null && (
              <span style={{ background: 'rgba(59,130,246,0.1)', padding: '1px 4px', borderRadius: 2 }}>
                max {mat.topSpeedKmh}km/u
              </span>
            )}
          </div>
        )}

        {/* Button */}
        <div style={{ padding: '0 10px 10px' }}>
          <button
            onClick={onViewDetails}
            style={{
              width: '100%',
              background: '#3b82f6',
              border: 'none',
              color: '#fff',
              padding: '6px 8px',
              borderRadius: 4,
              fontSize: 9,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLButtonElement).style.background = '#2563eb'
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.background = '#3b82f6'
            }}
          >
            Details →
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Animated Marker Component ────────────────────────────────────────────────

function AnimatedTrainMarker({
  train,
  selected,
  onSelect,
}: {
  train: PositionedTrain
  selected: boolean
  onSelect: (e: any) => void
}) {
  const [animPos, setAnimPos] = useState({ lat: train.lat, lng: train.lng })
  const prevPosRef = useRef({ lat: train.lat, lng: train.lng })
  const startTimeRef = useRef(0)
  const rafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    // If position changed, animate from previous to current
    const prev = prevPosRef.current
    if (prev.lat !== train.lat || prev.lng !== train.lng) {
      prevPosRef.current = { lat: train.lat, lng: train.lng }
      startTimeRef.current = Date.now()

      const animate = () => {
        const elapsed = Date.now() - startTimeRef.current
        const duration = 1000 // 1 second animation to match our 1s update interval
        const progress = Math.min(elapsed / duration, 1)

        // Easing function (easeInOutCubic)
        const easeProgress = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2

        setAnimPos({
          lat: prev.lat + (train.lat - prev.lat) * easeProgress,
          lng: prev.lng + (train.lng - prev.lng) * easeProgress,
        })

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate)
        }
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [train.lat, train.lng])

  const bg = typeColor(train.typeCode)
  const dColor = delayColor(train.delay, train.cancelled)

  return (
    <Marker
      position={[animPos.lat, animPos.lng]}
      icon={makeTrainIcon(train.typeCode, train.delay, train.cancelled, selected, train.heading)}
      zIndexOffset={selected ? 2000 : train.delay > 0 ? 100 : 0}
      eventHandlers={{ click: (e) => onSelect(e.originalEvent) }}
    >
      <Tooltip
        direction="top"
        offset={[0, -12]}
        opacity={1}
        permanent={selected}
        className="train-preview-tooltip"
        sticky={true}
      >
        <div style={{
          fontSize: 10,
          fontFamily: "'Courier New',monospace",
          whiteSpace: 'nowrap',
          padding: '4px 6px',
          minWidth: 140,
        }}>
          <div style={{ fontWeight: 800, color: bg, fontSize: 11, marginBottom: 2 }}>
            {train.typeCode} {train.serviceNumber}
          </div>
          <div style={{ fontSize: 9, color: 'var(--foreground)', marginBottom: 2 }}>
            {train.operator}
          </div>
          <div style={{ 
            fontSize: 9, 
            color: train.cancelled ? '#ef4444' : train.delay >= 3 ? '#f59e0b' : '#22c55e',
            fontWeight: 700,
            marginBottom: 2,
          }}>
            {train.cancelled ? 'Uitval' : train.delay <= 0 ? 'Op tijd' : `+${train.delay}min`}
          </div>
          <div style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>
            {train.speedKmh}km/u
          </div>
          {train.destination && (
            <div style={{ fontSize: 9, color: 'var(--muted-foreground)', marginTop: 2, borderTop: '1px solid var(--border)', paddingTop: 2 }}>
              → {train.destination}
            </div>
          )}
          {train.platform && (
            <div style={{ fontSize: 8, color: 'var(--muted-foreground)' }}>
              Perron {train.platform}
            </div>
          )}
        </div>
      </Tooltip>
    </Marker>
  )
}

// ─── Main map ─────────────────────────────────────────────────────────────────

interface Props {
  stations: Station[]
  trains: PositionedTrain[]
}

export default function TrainMapInner({ stations, trains }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [routeStops, setRouteStops] = useState<Array<[number, number]>>([])
  const mapRef = useRef<L.Map | null>(null)

  const selected = useMemo(
    () => trains.find(t => t.id === selectedId) ?? null,
    [trains, selectedId]
  )

  const handleMarkerClick = (trainId: string, _e: any) => {
    setSelectedId(id => {
      if (id === trainId) { setRouteStops([]); return null }
      return trainId
    })
  }

  const handleStopsLoaded = useCallback((stops: Array<[number, number]>) => {
    setRouteStops(stops)
  }, [])

  const flyToStation = useCallback((lat: number, lng: number, _name: string) => {
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

          {/* ── Base layers ── */}
          <LayersControl.BaseLayer checked name="Kaart">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              maxZoom={19}
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="Dark">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              subdomains="abcd"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="Satelliet">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution='Tiles &copy; Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
              maxZoom={18}
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="Terrein">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
              attribution='Tiles &copy; Esri'
              maxZoom={18}
            />
          </LayersControl.BaseLayer>

          {/* ── Overlays ── */}
          <LayersControl.Overlay checked name="Spoorwegen">
            <TileLayer
              url="https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png"
              attribution='Map style: &copy; <a href="https://www.OpenRailwayMap.org">OpenRailwayMap</a> (CC-BY-SA)'
              maxZoom={19}
              opacity={0.8}
            />
          </LayersControl.Overlay>

          <LayersControl.Overlay name="Maxsnelheid">
            <TileLayer
              url="https://{s}.tiles.openrailwaymap.org/maxspeed/{z}/{x}/{y}.png"
              attribution='Map style: &copy; <a href="https://www.OpenRailwayMap.org">OpenRailwayMap</a> (CC-BY-SA)'
              maxZoom={19}
              opacity={0.8}
            />
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

        {/* Train markers */}
        {trains.map(train => (
          <AnimatedTrainMarker
            key={train.id}
            train={train}
            selected={train.id === selectedId}
            onSelect={(e) => handleMarkerClick(train.id, e)}
          />
        ))}

        {/* Route line for selected train — trekt door alle stops */}
        {selected && routeStops.length > 1 && (
          <Polyline
            positions={routeStops}
            pathOptions={{ color: '#3b82f6', weight: 2.5, opacity: 0.55, dashArray: '6 5' }}
          />
        )}
      </MapContainer>

      {/* Detail panel — outside Leaflet, overlays on right */}
      {selected && (
        <TrainDetailPanel
          key={selected.id}
          train={selected}
          onClose={() => { setSelectedId(null); setRouteStops([]) }}
          onStationClick={flyToStation}
          onStopsLoaded={handleStopsLoaded}
        />
      )}
    </div>
  )
}
