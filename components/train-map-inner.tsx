'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  MapContainer, TileLayer, Marker, Popup,
  Polyline, CircleMarker, LayersControl,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Station } from '@/lib/supabase'
import type { PositionedTrain } from '@/app/api/trains/positions/route'
import type { TrainDetail } from '@/app/api/trains/info/route'

// ─── Type → accent color ──────────────────────────────────────────────────────

const TYPE_BG: Record<string, string> = {
  IC: '#1d4ed8', ICD: '#1e40af', ICE: '#5b21b6', SPR: '#15803d',
  INT: '#92400e', THA: '#9d174d', EUR: '#3730a3', NT: '#374151',
  ARR: '#065f46', QBZ: '#075985', BLN: '#164e63', DB: '#991b1b',
  RRR: '#6b21a8', '?': '#374151',
}
function typeColor(code: string) { return TYPE_BG[code?.toUpperCase()] ?? TYPE_BG['?'] }

// ─── Heading-aware DivIcon ────────────────────────────────────────────────────

function makeTrainIcon(
  typeCode: string, delay: number, cancelled: boolean,
  heading: number, selected: boolean
): L.DivIcon {
  const bg       = typeColor(typeCode)
  const ring     = cancelled ? '#ef4444' : delay >= 15 ? '#ef4444' : delay >= 3 ? '#f59e0b' : 'transparent'
  const ringW    = (cancelled || delay >= 3) ? 2 : 0
  const scale    = selected ? 1.4 : 1
  const shadow   = selected
    ? '0 0 0 3px rgba(59,130,246,.65),0 3px 12px rgba(0,0,0,.7)'
    : '0 1px 6px rgba(0,0,0,.6)'
  // Arrow rotated to heading (▶ points East = 90°, so offset by -90)
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
    iconSize:   undefined,
    iconAnchor: [20, 12],
    popupAnchor: [0, -16],
  })
}

// ─── Time formatter ───────────────────────────────────────────────────────────

function fmt(iso?: string | null) {
  if (!iso) return '–'
  return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

function delayColor(delay: number, cancelled: boolean) {
  if (cancelled || delay >= 15) return '#ef4444'
  if (delay >= 3)                return '#f59e0b'
  return '#22c55e'
}

// ─── Popup content: split into skeleton + detail ─────────────────────────────

function TrainPopupContent({ train, detail }: { train: PositionedTrain; detail: TrainDetail | null }) {
  const bg   = typeColor(train.typeCode)
  const dCol = delayColor(train.delay, train.cancelled)
  const mat  = detail?.material ?? null
  const now  = new Date()

  return (
    <div style={{ fontFamily: "'Courier New',monospace", fontSize: 11, minWidth: 230, maxWidth: 280 }}>

      {/* ── Rolling stock image ── */}
      {mat?.image && (
        <div style={{ margin: '-12px -20px 10px', overflow: 'hidden', borderRadius: '8px 8px 0 0', background: '#0f172a', position: 'relative' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mat.image} alt={mat.fullName}
            style={{ width: '100%', height: 88, objectFit: 'cover', opacity: .92, display: 'block' }} />
          <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,.65)', borderRadius: 3, padding: '1px 6px', color: '#fff', fontSize: 9, fontWeight: 700, letterSpacing: '.08em' }}>
            {mat.code}
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <span style={{ background: bg, color: '#fff', padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 800, letterSpacing: '.1em', flexShrink: 0 }}>
          {train.typeCode || '?'}
        </span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#f8fafc' }}>
            Trein {train.serviceNumber}
          </div>
          {mat && <div style={{ color: '#475569', fontSize: 10 }}>{mat.fullName}</div>}
        </div>
      </div>

      {/* ── Info grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 14px', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        {[
          { label: 'Vervoerder',  value: train.operator },
          { label: 'Bestemming', value: train.destination || '–' },
          { label: 'Spoor',      value: train.platform   || '–' },
          { label: 'Vertraging', value: train.cancelled ? 'Geannuleerd' : train.delay <= 0 ? 'Op tijd' : `+${train.delay} min`, col: dCol },
          { label: 'Snelheid',   value: `${train.speedKmh} km/u` },
          { label: 'Richting',   value: `${Math.round(train.heading)}°` },
        ].map(({ label, value, col }) => (
          <div key={label}>
            <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</div>
            <div style={{ color: col ?? '#e2e8f0', fontWeight: col ? 700 : 400 }}>{value}</div>
          </div>
        ))}
        {train.via && (
          <div style={{ gridColumn: '1/-1' }}>
            <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: '.08em' }}>Via</div>
            <div style={{ color: '#94a3b8' }}>{train.via}</div>
          </div>
        )}
      </div>

      {/* ── Material specs (shown once detail loads) ── */}
      {!detail && (
        <div style={{ color: '#334155', fontSize: 10, marginBottom: 10 }}>Materieel laden…</div>
      )}
      {mat && (
        <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 5 }}>Materieel</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 14px' }}>
            <div>
              <div style={{ fontSize: 9, color: '#475569' }}>Type</div>
              <div style={{ color: '#e2e8f0' }}>{mat.code}</div>
            </div>
            {mat.lengthM != null && (
              <div>
                <div style={{ fontSize: 9, color: '#475569' }}>Lengte</div>
                <div style={{ color: '#e2e8f0' }}>
                  {mat.lengthM}m{mat.numberOfParts ? ` · ${mat.numberOfParts} ${mat.numberOfParts === 1 ? 'deel' : 'delen'}` : ''}
                </div>
              </div>
            )}
            <div style={{ gridColumn: '1/-1' }}>
              <div style={{ fontSize: 9, color: '#475569' }}>Zitplaatsen</div>
              <div style={{ color: '#e2e8f0' }}>
                {mat.seats1st != null && mat.seats1st > 0 ? `1e: ${mat.seats1st} · ` : ''}
                {mat.seats2nd != null ? `2e: ${mat.seats2nd}` : '–'}
              </div>
            </div>
          </div>

          {mat.facilityLabels?.length > 0 && (
            <div style={{ marginTop: 5 }}>
              <div style={{ fontSize: 9, color: '#475569', marginBottom: 3 }}>Voorzieningen</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {mat.facilityLabels.map(f => (
                  <span key={f.label} title={f.label}
                    style={{ background: 'rgba(255,255,255,.07)', borderRadius: 3, padding: '1px 5px', fontSize: 12, cursor: 'default' }}>
                    {f.icon}
                  </span>
                ))}
              </div>
            </div>
          )}

          <a href={`https://www.ns.nl/reisinformatie/treinen/${mat.code.toLowerCase()}.html`}
            target="_blank" rel="noopener noreferrer"
            style={{ display: 'block', marginTop: 5, color: '#60a5fa', fontSize: 10, textDecoration: 'none' }}>
            Bekijk details →
          </a>
        </div>
      )}

      {/* ── Stop list ── */}
      {detail && detail.stops.length > 0 && (
        <>
          <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>
            Route · {detail.stops.length} stops
          </div>
          <div style={{ maxHeight: 150, overflowY: 'auto' }}>
            {detail.stops.map((s, i) => {
              const depTime = s.actualDeparture ?? s.plannedDeparture
              const isPast  = depTime ? new Date(depTime) < now : false
              const late    = s.plannedDeparture && s.actualDeparture &&
                new Date(s.actualDeparture) > new Date(s.plannedDeparture)
              const time    = fmt(s.plannedDeparture ?? s.plannedArrival)
              const actual  = fmt(s.actualDeparture  ?? s.actualArrival)
              return (
                <div key={`${s.uicCode}-${i}`} style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '2.5px 0 2.5px 8px', marginLeft: -8,
                  borderLeft: '2px solid transparent',
                  color: isPast ? '#334155' : '#94a3b8',
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: isPast ? '#1e293b' : '#334155' }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  <span style={{ color: late ? '#f59e0b' : '#334155', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {late ? actual : time}
                  </span>
                  {s.platform && <span style={{ color: '#1e293b', fontSize: 9 }}>sp.{s.platform}</span>}
                </div>
              )
            })}
          </div>
        </>
      )}

      <div style={{ marginTop: 7, paddingTop: 7, borderTop: '1px solid rgba(255,255,255,.05)', color: '#334155', fontSize: 10 }}>
        {train.operator} · {train.typeCode}
        {train.materieelNummers.length > 0 && (
          <span style={{ marginLeft: 8, color: '#1e293b' }}>
            {train.materieelNummers.slice(0, 3).join(' · ')}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Popup with lazy-loading ──────────────────────────────────────────────────

function LazyPopup({ train, onClose }: { train: PositionedTrain; onClose: () => void }) {
  const [detail, setDetail] = useState<TrainDetail | null>(null)

  // Fetch detail when popup opens
  const fetchDetail = useCallback(() => {
    fetch(`/api/trains/info?ritnummer=${encodeURIComponent(train.serviceNumber)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setDetail(d) })
      .catch(() => {})
  }, [train.serviceNumber])

  return (
    <Popup autoPan={false} minWidth={230} maxWidth={290}
      eventHandlers={{ add: fetchDetail, remove: onClose }}>
      <TrainPopupContent train={train} detail={detail} />
    </Popup>
  )
}

// ─── Main map ─────────────────────────────────────────────────────────────────

interface Props {
  stations: Station[]
  trains: PositionedTrain[]
}

export default function TrainMapInner({ stations, trains }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = useMemo(() => trains.find(t => t.id === selectedId) ?? null, [trains, selectedId])

  return (
    <MapContainer center={[52.18, 5.38]} zoom={8} minZoom={7} maxZoom={16}
      style={{ height: '100%', width: '100%' }}>

      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="OSM Carto">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={19} />
        </LayersControl.BaseLayer>
        <LayersControl.Overlay checked name="OpenRailwayMap">
          <TileLayer
            url="https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png"
            attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | Map style: &copy; <a href="https://www.OpenRailwayMap.org">OpenRailwayMap</a> (<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>)'
            maxZoom={19} opacity={0.8} />
        </LayersControl.Overlay>
      </LayersControl>

      {/* Station background dots */}
      {stations.map(s => (
        <CircleMarker key={`st-${s.abbreviation}`} center={[s.lat, s.lng]} radius={2}
          pathOptions={{ fillColor: '#fff', color: 'transparent', fillOpacity: 0.18 }} />
      ))}

      {/* Train markers */}
      {trains.map(train => (
        <Marker
          key={train.id}
          position={[train.lat, train.lng]}
          icon={makeTrainIcon(train.typeCode, train.delay, train.cancelled, train.heading, train.id === selectedId)}
          zIndexOffset={train.id === selectedId ? 2000 : train.delay > 0 ? 100 : 0}
          eventHandlers={{ click: () => setSelectedId(id => id === train.id ? null : train.id) }}
        >
          <LazyPopup train={train} onClose={() => setSelectedId(null)} />
        </Marker>
      ))}
    </MapContainer>
  )
}
