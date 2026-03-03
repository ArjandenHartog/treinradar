'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  MapContainer, TileLayer, Marker, Polyline,
  CircleMarker, LayersControl,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Station } from '@/lib/supabase'
import type { PositionedTrain } from '@/app/api/trains/positions/route'
import type { TrainDetail, StopInfo } from '@/app/api/trains/info/route'

// ─── Type → accent color ──────────────────────────────────────────────────────

const TYPE_BG: Record<string, string> = {
  IC: '#1d4ed8', ICD: '#1e40af', ICE: '#5b21b6', SPR: '#15803d',
  INT: '#92400e', THA: '#9d174d', EUR: '#3730a3', NT: '#374151',
  ARR: '#065f46', QBZ: '#075985', BLN: '#164e63', DB: '#991b1b',
  RRR: '#6b21a8', '?': '#374151',
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
  heading: number, selected: boolean
): L.DivIcon {
  const bg     = typeColor(typeCode)
  const ring   = cancelled ? '#ef4444' : delay >= 15 ? '#ef4444' : delay >= 3 ? '#f59e0b' : 'transparent'
  const ringW  = (cancelled || delay >= 3) ? 2 : 0
  const scale  = selected ? 1.4 : 1
  const shadow = selected
    ? '0 0 0 3px rgba(59,130,246,.65),0 3px 12px rgba(0,0,0,.7)'
    : '0 1px 6px rgba(0,0,0,.6)'
  const arrowDeg = heading - 90

  return L.divIcon({
    html: `<div style="
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
      <span style="font-size:8px;display:inline-block;transform:rotate(${arrowDeg}deg);transform-origin:center">▶</span>
      ${typeCode || '?'}
    </div>`,
    className: '',
    iconSize: undefined,
    iconAnchor: [20, 12],
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

function StopRow({ stop }: { stop: StopInfo }) {
  const planned  = stop.plannedDeparture ?? stop.plannedArrival
  const actual   = stop.actualDeparture  ?? stop.actualArrival
  const late     = delayMin(planned, actual)
  const isPassed = stop.passed
  const isCancelled = stop.cancelled

  const dotColor = isCancelled ? '#ef4444'
    : stop.current ? '#60a5fa'
    : isPassed ? '#1e293b' : '#334155'
  const nameColor = isCancelled ? '#ef4444'
    : stop.current ? '#f8fafc'
    : isPassed ? '#334155' : '#94a3b8'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '4px 0',
      borderLeft: stop.current ? '2px solid #3b82f6' : '2px solid transparent',
      paddingLeft: stop.current ? 8 : 10,
      opacity: isCancelled ? 0.5 : 1,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: dotColor,
        outline: stop.current ? '2px solid #3b82f6' : 'none',
        outlineOffset: 2,
      }} />
      <span style={{
        flex: 1, fontSize: 11, color: nameColor,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        textDecoration: isCancelled ? 'line-through' : 'none',
      }}>
        {stop.name}
      </span>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {isCancelled ? (
          <span style={{ fontSize: 9, color: '#ef4444' }}>uitval</span>
        ) : planned ? (
          <>
            <span style={{ fontSize: 11, color: late > 0 ? '#f59e0b' : isPassed ? '#334155' : '#64748b', fontVariantNumeric: 'tabular-nums' }}>
              {late > 0 ? fmt(actual) : fmt(planned)}
            </span>
            {late > 0 && (
              <span style={{ fontSize: 9, color: '#f59e0b', marginLeft: 2 }}>+{late}</span>
            )}
          </>
        ) : (
          <span style={{ fontSize: 11, color: '#1e293b' }}>–</span>
        )}
      </div>
      {stop.platform && !isCancelled && (
        <span style={{ fontSize: 9, color: '#1e293b', flexShrink: 0 }}>sp.{stop.platform}</span>
      )}
      {stop.crowdForecast && stop.crowdForecast !== 'UNKNOWN' && !isPassed && !isCancelled && (
        <span title={stop.crowdForecast}
          style={{ fontSize: 8, color: CROWD_COLOR[stop.crowdForecast] ?? '#475569', letterSpacing: -1, flexShrink: 0 }}>
          {CROWD_ICON[stop.crowdForecast] ?? ''}
        </span>
      )}
    </div>
  )
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function TrainDetailPanel({ train, onClose }: { train: PositionedTrain; onClose: () => void }) {
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
      width: 'clamp(300px, 28vw, 380px)',
      zIndex: 2000,
      background: 'rgba(9,9,11,0.97)',
      borderLeft: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', flexDirection: 'column',
      backdropFilter: 'blur(12px)',
      fontFamily: "'Courier New',monospace",
      boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
    }}>

      {/* ── Hero image ── */}
      {mat?.image && (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mat.image} alt={mat.fullName}
            style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block', opacity: 0.88 }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(9,9,11,0.95))' }} />
          <div style={{ position: 'absolute', bottom: 8, left: 12, right: 48 }}>
            <span style={{ background: bg, color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 800, letterSpacing: '.1em' }}>
              {train.typeCode || '?'}
            </span>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc', marginTop: 4, lineHeight: 1.2 }}>
              Trein {train.serviceNumber}
            </div>
            {mat && <div style={{ fontSize: 10, color: '#64748b' }}>{mat.fullName}</div>}
          </div>
        </div>
      )}

      {/* ── Header (when no image) ── */}
      {!mat?.image && (
        <div style={{ padding: '14px 16px 10px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: bg, color: '#fff', padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: 800, letterSpacing: '.1em' }}>
              {train.typeCode || '?'}
            </span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc' }}>Trein {train.serviceNumber}</div>
              <div style={{ fontSize: 10, color: '#475569' }}>{train.operator}</div>
            </div>
          </div>
        </div>
      )}

      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 10, right: 10, zIndex: 10,
          background: 'rgba(255,255,255,0.06)', border: 'none',
          color: '#94a3b8', width: 28, height: 28, borderRadius: 6,
          cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >✕</button>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 24px' }}>

        {/* Status strip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.03)', borderRadius: 8,
          padding: '8px 12px', marginBottom: 14,
          border: `1px solid ${train.cancelled ? 'rgba(239,68,68,.2)' : train.delay >= 3 ? 'rgba(245,158,11,.15)' : 'rgba(34,197,94,.12)'}`,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dColor, flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: dColor }}>
            {train.cancelled ? 'Geannuleerd' : train.delay <= 0 ? 'Op tijd' : `+${train.delay} min vertraging`}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569' }}>
            {train.speedKmh} km/u · {Math.round(train.heading)}° {compassLabel(train.heading)}
          </span>
        </div>

        {/* Info grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginBottom: 14 }}>
          {[
            { label: 'Vervoerder',  value: train.operator },
            { label: 'Bestemming', value: train.destination || '–' },
            { label: 'Spoor',      value: train.platform || '–' },
            { label: 'Snelheid',   value: `${train.speedKmh} km/u` },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '7px 10px' }}>
              <div style={{ fontSize: 8, color: '#334155', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Via */}
        {train.via && (
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '7px 10px', marginBottom: 14 }}>
            <div style={{ fontSize: 8, color: '#334155', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 2 }}>Via</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{train.via}</div>
          </div>
        )}

        {/* Material */}
        {loading && !mat && (
          <div style={{ borderRadius: 8, background: 'rgba(255,255,255,0.02)', padding: '10px 12px', marginBottom: 14 }}>
            <div style={{ fontSize: 9, color: '#334155', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.1em' }}>Materieel</div>
            {[40, 60, 50].map((w, i) => (
              <div key={i} style={{ height: 10, background: 'rgba(255,255,255,0.04)', borderRadius: 3, marginBottom: 5, width: `${w}%`,
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {mat.facilityLabels.map(f => (
                  <span key={f.label} title={f.label}
                    style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '2px 7px', fontSize: 13, cursor: 'default' }}>
                    {f.icon}
                  </span>
                ))}
              </div>
            )}

            <a href={`https://www.ns.nl/reisinformatie/treinen/${mat.code.toLowerCase()}.html`}
              target="_blank" rel="noopener noreferrer"
              style={{ color: '#60a5fa', fontSize: 10, textDecoration: 'none' }}>
              Meer info over {mat.code} →
            </a>
          </div>
        )}

        {/* Route progress */}
        {stops.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: '.1em' }}>
                Route · {stops.length} stops
              </div>
              <div style={{ fontSize: 9, color: '#334155' }}>{passedCount}/{stops.length - 1} gereden</div>
            </div>

            {/* Progress bar */}
            <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 10, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#3b82f6', width: `${progressPct}%`, borderRadius: 2, transition: 'width .5s' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {stops.map((s, i) => <StopRow key={`${s.uicCode}-${i}`} stop={s} />)}
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

// ─── Main map ─────────────────────────────────────────────────────────────────

interface Props {
  stations: Station[]
  trains: PositionedTrain[]
}

export default function TrainMapInner({ stations, trains }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = useMemo(
    () => trains.find(t => t.id === selectedId) ?? null,
    [trains, selectedId]
  )

  // Polyline for selected train route (uses stop coords from detail panel)
  // We just show the marker highlight + panel; full route polyline shown if detail loads

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>

      <MapContainer
        center={[52.18, 5.38]} zoom={8} minZoom={7} maxZoom={16}
        style={{ height: '100%', width: '100%' }}
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
          <Marker
            key={train.id}
            position={[train.lat, train.lng]}
            icon={makeTrainIcon(train.typeCode, train.delay, train.cancelled, train.heading, train.id === selectedId)}
            zIndexOffset={train.id === selectedId ? 2000 : train.delay > 0 ? 100 : 0}
            eventHandlers={{ click: () => setSelectedId(id => id === train.id ? null : train.id) }}
          />
        ))}

        {/* Route line for selected train — thin blue trace through station dots */}
        {selected && (
          <Polyline
            positions={[[selected.lat, selected.lng]]}
            pathOptions={{ color: '#3b82f6', weight: 2, opacity: 0.4, dashArray: '4 6' }}
          />
        )}
      </MapContainer>

      {/* Detail panel — outside Leaflet, overlays on right */}
      {selected && (
        <TrainDetailPanel
          train={selected}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}
