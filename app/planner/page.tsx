'use client'

import { useState, useMemo, useEffect } from 'react'
import { ChevronRight, Loader2, MapPin, Clock, Zap, AlertCircle, TriangleAlert } from 'lucide-react'
import { Header } from '@/components/header'
import type { Station } from '@/lib/supabase'

interface StationDisruption {
  id: string
  type: string
  isActive: boolean
  title: string
  topic?: string
}

interface TripLeg {
  idx: string
  origin: { name: string; plannedDateTime: string; actualDateTime?: string; plannedTrack?: string }
  destination: { name: string; plannedDateTime: string; actualDateTime?: string; plannedTrack?: string }
  product: { displayName: string; operatorName?: string; number: string }
  stops?: Array<{ name: string }>
  cancelled: boolean
  reachable: boolean
}

interface Trip {
  uid: string
  plannedDurationInMinutes: number
  actualDurationInMinutes?: number
  transfers: number
  legs: TripLeg[]
  status: string
  crowdForecast?: string
  punctuality?: number
}

interface TravelAdvice {
  source: string
  trips: Trip[]
}

function formatTime(iso?: string) {
  if (!iso) return '–'
  return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso?: string) {
  if (!iso) return '–'
  return new Date(iso).toLocaleDateString('nl-NL', { month: 'short', day: 'numeric' })
}

function getDelayMinutes(planned?: string, actual?: string) {
  if (!planned || !actual) return 0
  return Math.round((new Date(actual).getTime() - new Date(planned).getTime()) / 60000)
}

export default function TravelPlannerPage() {
  const [stations, setStations] = useState<Station[]>([])
  const [fromStation, setFromStation] = useState('')
  const [toStation, setToStation] = useState('')
  const [dateTime, setDateTime] = useState(new Date().toISOString().slice(0, 16))
  const [searchForArrival, setSearchForArrival] = useState(false)
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [disruptions, setDisruptions] = useState<StationDisruption[]>([])

  // Load stations
  useEffect(() => {
    fetch('/api/stations')
      .then(r => r.json())
      .then(data => setStations(data))
      .catch(err => console.error('Failed to load stations:', err))
  }, [])

  const fromStationObj = useMemo(
    () => stations.find(s => s.abbreviation === fromStation),
    [stations, fromStation]
  )
  const toStationObj = useMemo(
    () => stations.find(s => s.abbreviation === toStation),
    [stations, toStation]
  )

  const filteredFromStations = useMemo(
    () => {
      const q = fromStation.toLowerCase()
      return stations.filter(s =>
        s?.abbreviation?.toLowerCase().includes(q) ||
        s?.name?.toLowerCase().includes(q) ||
        s?.short_name?.toLowerCase().includes(q)
      ).slice(0, 8)
    },
    [stations, fromStation]
  )
  const filteredToStations = useMemo(
    () => {
      const q = toStation.toLowerCase()
      return stations.filter(s =>
        s?.abbreviation?.toLowerCase().includes(q) ||
        s?.name?.toLowerCase().includes(q) ||
        s?.short_name?.toLowerCase().includes(q)
      ).slice(0, 8)
    },
    [stations, toStation]
  )

  const handleSearch = async () => {
    if (!fromStationObj || !toStationObj) {
      setError('Selecteer beide stations uit de keuzelijst')
      return
    }

    setLoading(true)
    setError('')
    setTrips([])

    try {
      const params = new URLSearchParams({
        fromStation: fromStationObj!.abbreviation,
        toStation: toStationObj!.abbreviation,
        dateTime,
        searchForArrival: searchForArrival.toString(),
      })

      const response = await fetch(`/api/trips?${params}`)
      if (!response.ok) throw new Error('Zoeking mislukt')

      const data = await response.json()

      // NS API v3/trips geeft een object met { trips: [...] }
      let fetchedTrips: Trip[] = []
      if (Array.isArray(data)) {
        fetchedTrips = data.flatMap((advice: TravelAdvice) => advice.trips ?? [])
      } else if (data.trips && Array.isArray(data.trips)) {
        fetchedTrips = data.trips
      }

      setTrips(fetchedTrips)
      if (!fetchedTrips.length) {
        setError('Geen verbindingen gevonden voor deze zoekopdracht')
      }

      // Fetch disruptions for from + to station
      setDisruptions([])
      const codes = [fromStationObj!.abbreviation, toStationObj!.abbreviation]
      const disruptionResults = await Promise.all(
        codes.map(code =>
          fetch(`/api/disruptions/station?code=${encodeURIComponent(code)}`)
            .then(r => r.ok ? r.json() as Promise<StationDisruption[]> : [])
            .catch(() => [] as StationDisruption[])
        )
      )
      const allDisruptions = disruptionResults.flat()
      // Deduplicate by id
      const seen = new Set<string>()
      setDisruptions(allDisruptions.filter(d => d.isActive && !seen.has(d.id) && seen.add(d.id) && true))
    } catch (err) {
      setError('Er is een fout opgetreden bij het zoeken naar verbindingen')
      console.error('Trip search error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSwapStations = () => {
    const temp = fromStation
    setFromStation(toStation)
    setToStation(temp)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', color: 'var(--foreground)' }}>
      <Header />
      <div style={{ padding: '24px 16px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8, letterSpacing: '-0.02em' }}>Reisinformatie</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: 14 }}>Vind de beste verbinding tussen twee stations</p>
        </div>

        {/* Search Panel */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 24,
          marginBottom: 32,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16, marginBottom: 16 }}>
            {/* From Station */}
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                <MapPin size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                Van
              </label>
              <input
                type="text"
                placeholder="Zoek station (naam of code)..."
                value={fromStationObj ? `${fromStationObj.name} (${fromStationObj.abbreviation})` : fromStation}
                onChange={e => { setFromStation(e.target.value) }}
                onFocus={e => { if (fromStationObj) { setFromStation(''); e.target.select() } }}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: fromStationObj ? 'rgba(59,130,246,0.1)' : 'var(--muted)',
                  border: fromStationObj ? '1px solid rgba(59,130,246,0.4)' : '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--foreground)',
                  fontSize: 14,
                }}
              />
              {fromStation && !fromStationObj && filteredFromStations.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderTop: 'none',
                  borderRadius: '0 0 6px 6px',
                  maxHeight: 200,
                  overflowY: 'auto',
                  zIndex: 10,
                }}>
                  {filteredFromStations.map(s => (
                    <button
                      key={s.abbreviation}
                      onClick={() => setFromStation(s.abbreviation)}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '10px 12px',
                        background: 'transparent',
                        border: 'none',
                        textAlign: 'left',
                        color: 'var(--foreground)',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border)',
                        fontSize: 14,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {s.name} <span style={{ color: 'var(--muted-foreground)' }}>({s.abbreviation})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* To Station */}
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                <MapPin size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                Naar
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Zoek station (naam of code)..."
                  value={toStationObj ? `${toStationObj.name} (${toStationObj.abbreviation})` : toStation}
                  onChange={e => { setToStation(e.target.value) }}
                  onFocus={e => { if (toStationObj) { setToStation(''); e.target.select() } }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: toStationObj ? 'rgba(59,130,246,0.1)' : 'var(--muted)',
                    border: toStationObj ? '1px solid rgba(59,130,246,0.4)' : '1px solid var(--border)',
                    borderRadius: 6,
                    color: 'var(--foreground)',
                    fontSize: 14,
                  }}
                />
                {toStation && (
                  <button
                    onClick={handleSwapStations}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--muted-foreground)',
                      cursor: 'pointer',
                      padding: 4,
                    }}
                    title="Stations omwisselen"
                  >
                    <Zap size={16} />
                  </button>
                )}
              </div>
              {toStation && !toStationObj && filteredToStations.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderTop: 'none',
                  borderRadius: '0 0 6px 6px',
                  maxHeight: 200,
                  overflowY: 'auto',
                  zIndex: 10,
                }}>
                  {filteredToStations.map(s => (
                    <button
                      key={s.abbreviation}
                      onClick={() => setToStation(s.abbreviation)}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '10px 12px',
                        background: 'transparent',
                        border: 'none',
                        textAlign: 'left',
                        color: 'var(--foreground)',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border)',
                        fontSize: 14,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {s.name} <span style={{ color: 'var(--muted-foreground)' }}>({s.abbreviation})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Date & Time */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                <Clock size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                Datum & Tijd
              </label>
              <input
                type="datetime-local"
                value={dateTime}
                onChange={e => setDateTime(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--foreground)',
                  fontSize: 14,
                }}
              />
            </div>
          </div>

          {/* Search Options */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input
                type="checkbox"
                checked={searchForArrival}
                onChange={e => setSearchForArrival(e.target.checked)}
                style={{ cursor: 'pointer', width: 16, height: 16 }}
              />
              <span>Zoeken op aankomsttijd (in plaats van vertrektijd)</span>
            </label>
          </div>

          {/* Search Button */}
          <button
            onClick={handleSearch}
            disabled={loading || !fromStationObj || !toStationObj}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: fromStationObj && toStationObj ? '#3b82f6' : '#6b7280',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: fromStationObj && toStationObj ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {loading ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Zoeken...
              </>
            ) : (
              <>
                Zoeken
                <ChevronRight size={16} />
              </>
            )}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #ef4444',
            borderRadius: 8,
            padding: 16,
            marginBottom: 24,
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
          }}>
            <AlertCircle size={20} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ color: '#fecaca', fontSize: 14 }}>{error}</p>
          </div>
        )}

        {/* Disruption warnings */}
        {disruptions.length > 0 && (
          <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {disruptions.map(d => (
              <div
                key={d.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  background: d.type === 'CALAMITY' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                  border: `1px solid ${d.type === 'CALAMITY' ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.35)'}`,
                  borderRadius: 8,
                  padding: '12px 14px',
                }}
              >
                <TriangleAlert
                  size={16}
                  color={d.type === 'CALAMITY' ? '#ef4444' : '#f59e0b'}
                  style={{ flexShrink: 0, marginTop: 1 }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: d.type === 'CALAMITY' ? '#fca5a5' : '#fcd34d', marginBottom: 2 }}>
                    {d.title}
                  </div>
                  {d.topic && (
                    <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{d.topic}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        <div>
          {trips.length > 0 && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
                {trips.length} verbinding{trips.length !== 1 ? 'en' : ''} gevonden
              </h2>
              <div style={{ display: 'grid', gap: 12 }}>
                {trips.map(trip => (
                  <div
                    key={trip.uid}
                    style={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Trip Header */}
                    <button
                      onClick={() => setExpanded(expanded === trip.uid ? null : trip.uid)}
                      style={{
                        width: '100%',
                        padding: '16px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Time */}
                      <div style={{ minWidth: 80 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>
                          {formatTime(trip.legs[0]?.origin.plannedDateTime)}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                          {formatDate(trip.legs[0]?.origin.plannedDateTime)}
                        </div>
                      </div>

                      {/* Duration */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginBottom: 4,
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                            {Math.floor(trip.plannedDurationInMinutes / 60)}u {trip.plannedDurationInMinutes % 60}m
                          </div>
                          {trip.transfers > 0 && (
                            <span style={{
                              fontSize: 11,
                              color: 'var(--muted-foreground)',
                              background: 'var(--muted)',
                              padding: '3px 8px',
                              borderRadius: 4,
                            }}>
                              {trip.transfers} overstap{trip.transfers !== 1 ? 'pen' : ''}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {trip.legs.map((leg, i) => (
                            <span key={i}>
                              {leg.product.displayName}
                              {i < trip.legs.length - 1 ? ' · ' : ''}
                            </span>
                          ))}
                        </div>
                        {trip.punctuality !== undefined && (
                          <div style={{ fontSize: 11, color: '#22c55e', marginTop: 2 }}>
                            {Math.round(trip.punctuality)}% stiptheid
                          </div>
                        )}
                      </div>

                      {/* Arrival Time */}
                      <div style={{ minWidth: 80, textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>
                          {formatTime(trip.legs[trip.legs.length - 1]?.destination.plannedDateTime)}
                        </div>
                        <ChevronRight
                          size={20}
                          style={{
                            transform: expanded === trip.uid ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 200ms',
                            color: 'var(--muted-foreground)',
                            marginTop: 4,
                          }}
                        />
                      </div>
                    </button>

                    {/* Expanded Details */}
                    {expanded === trip.uid && (
                      <div style={{ borderTop: '1px solid var(--border)', padding: '16px', background: 'var(--muted)' }}>
                        {trip.legs.map((leg, i) => (
                          <div key={`leg-${i}`} style={{ marginBottom: i < trip.legs.length - 1 ? 16 : 0 }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              marginBottom: 8,
                            }}>
                              <div style={{
                                padding: '4px 8px',
                                background: '#3b82f6',
                                color: '#fff',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                              }}>
                                {leg.product.displayName}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                                {leg.product.operatorName}
                              </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                              {/* From */}
                              <div>
                                <div style={{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Van</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                                  {leg.origin.name}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--foreground)' }}>
                                  {formatTime(leg.origin.plannedDateTime)}
                                  {leg.origin.plannedTrack && ` · Spoor ${leg.origin.plannedTrack}`}
                                </div>
                              </div>

                              {/* To */}
                              <div>
                                <div style={{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Naar</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                                  {leg.destination.name}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--foreground)' }}>
                                  {formatTime(leg.destination.plannedDateTime)}
                                  {leg.destination.plannedTrack && ` · Spoor ${leg.destination.plannedTrack}`}
                                </div>
                              </div>
                            </div>

                            {/* Intermediate stops */}
                            {leg.stops && leg.stops.length > 0 && (
                              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                                  Via {leg.stops.length} stop{leg.stops.length !== 1 ? 'pen' : ''}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                  {leg.stops.slice(0, 5).map((stop, j) => (
                                    <span key={j} style={{
                                      fontSize: 11,
                                      color: 'var(--muted-foreground)',
                                      background: 'var(--card)',
                                      padding: '4px 8px',
                                      borderRadius: 4,
                                    }}>
                                      {stop.name}
                                    </span>
                                  ))}
                                  {leg.stops.length > 5 && (
                                    <span style={{
                                      fontSize: 11,
                                      color: 'var(--muted-foreground)',
                                      padding: '4px 8px',
                                    }}>
                                      +{leg.stops.length - 5} meer
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {!loading && trips.length === 0 && !error && fromStation && toStation && (
            <div style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 32,
              textAlign: 'center',
            }}>
              <p style={{ color: 'var(--muted-foreground)', fontSize: 14 }}>
                Voer je zoekcriteria in en klik op "Zoeken" om verbindingen te vinden
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      </div>
    </div>
  )
}
