'use client'

import { useMemo } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { TrainHistoryStats } from '@/app/api/trains/[number]/history/route'

interface Props {
  history: TrainHistoryStats['history']
}

export default function TrainHistoryMap({ history }: Props) {
  const validPoints = useMemo(() =>
    history.filter(h => h.lat && h.lng),
    [history]
  )

  if (validPoints.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-600">
        Geen GPS-data beschikbaar
      </div>
    )
  }

  // Center on midpoint of history
  const lats = validPoints.map(h => h.lat)
  const lngs = validPoints.map(h => h.lng)
  const center: [number, number] = [
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lngs) + Math.max(...lngs)) / 2,
  ]

  const positions = validPoints.map(h => [h.lat, h.lng] as [number, number])

  // Color segments by speed
  const speedMax = Math.max(...validPoints.map(h => h.speedKmh), 1)
  const first = validPoints[0]
  const last  = validPoints[validPoints.length - 1]

  return (
    <MapContainer
      center={center}
      zoom={9}
      minZoom={6}
      maxZoom={16}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={19}
      />
      {/* Railway overlay */}
      <TileLayer
        url="https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png"
        maxZoom={19}
        opacity={0.45}
      />

      {/* Route polyline — full track */}
      <Polyline
        positions={positions}
        pathOptions={{ color: '#ffffff', weight: 4, opacity: 0.08 }}
      />
      <Polyline
        positions={positions}
        pathOptions={{ color: '#3b82f6', weight: 2, opacity: 0.7, lineCap: 'round', lineJoin: 'round' }}
      />

      {/* Speed-colored dots (sampled) */}
      {validPoints
        .filter((_, i) => i % Math.max(1, Math.floor(validPoints.length / 80)) === 0)
        .map((h, i) => {
          const t = h.speedKmh / speedMax
          const r = Math.round(t * 200)
          const g = Math.round((1 - t) * 200)
          const dotColor = `rgb(${r},${g},60)`
          return (
            <CircleMarker
              key={i}
              center={[h.lat, h.lng]}
              radius={3}
              pathOptions={{ fillColor: dotColor, color: 'rgba(0,0,0,0.4)', weight: 0.5, fillOpacity: 0.85 }}
            >
              <Tooltip sticky>
                <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                  {h.speedKmh} km/u · {new Date(h.recordedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                  {h.delay > 0 && ` · +${h.delay}m`}
                </span>
              </Tooltip>
            </CircleMarker>
          )
        })}

      {/* Start marker */}
      <CircleMarker
        center={[first.lat, first.lng]}
        radius={6}
        pathOptions={{ fillColor: '#22c55e', color: '#fff', weight: 2, fillOpacity: 1 }}
      >
        <Tooltip permanent direction="top" offset={[0, -8]}>
          <span style={{ fontFamily: 'monospace', fontSize: 10 }}>
            Start · {new Date(first.recordedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </Tooltip>
      </CircleMarker>

      {/* End marker */}
      {validPoints.length > 1 && (
        <CircleMarker
          center={[last.lat, last.lng]}
          radius={6}
          pathOptions={{ fillColor: '#ef4444', color: '#fff', weight: 2, fillOpacity: 1 }}
        >
          <Tooltip permanent direction="top" offset={[0, -8]}>
            <span style={{ fontFamily: 'monospace', fontSize: 10 }}>
              Laatste · {new Date(last.recordedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  )
}
