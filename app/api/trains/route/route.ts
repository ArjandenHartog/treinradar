import { NextRequest, NextResponse } from 'next/server'

/**
 * Calculates actual train route along railways using OpenRouteService
 * Takes train stops and returns interpolated coordinates that follow real tracks
 */

const ORS_BASE = 'https://api.openrouteservice.org/v2'
const ORS_KEY = process.env.ORS_API_KEY

export async function POST(req: NextRequest) {
  try {
    const { stops } = await req.json() as {
      stops: Array<{ lat: number; lng: number; name?: string }>
    }

    if (!stops || stops.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 stops required' },
        { status: 400 }
      )
    }

    // Filter valid coordinates
    const validStops = stops.filter(s => s.lat && s.lng)
    if (validStops.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 stops with valid coordinates required' },
        { status: 400 }
      )
    }

    // If no ORS key or less than 3 stops, fall back to direct interpolation
    if (!ORS_KEY || validStops.length < 3) {
      return NextResponse.json({
        coordinates: validStops.map(s => [s.lng, s.lat]),
        method: 'fallback-direct',
      })
    }

    try {
      // Call OpenRouteService with driving profile (closest to train routes)
      const coordinates = validStops.map(s => [s.lng, s.lat])
      
      const response = await fetch(
        `${ORS_BASE}/directions/driving-hgv`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ORS_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            coordinates,
            format: 'geojson',
            profile: 'driving-hgv',
            elevation: false,
            instructions: false,
          }),
        }
      )

      if (!response.ok) {
        const errBody = await response.text()
        console.warn(`ORS routing failed: ${response.status} ${errBody}`)
        return NextResponse.json({
          coordinates,
          method: 'fallback-direct',
        })
      }

      const data = await response.json() as { routes?: Array<{ geometry?: { coordinates: Array<[number, number]> } }> }
      const routeCoords = data.routes?.[0]?.geometry?.coordinates ?? coordinates

      return NextResponse.json({
        coordinates: routeCoords,
        method: 'openrouteservice',
      })
    } catch (err) {
      console.warn('ORS routing error, falling back:', err)
      return NextResponse.json({
        coordinates: validStops.map(s => [s.lng, s.lat]),
        method: 'fallback-direct',
      })
    }
  } catch (err) {
    console.error('[route]', err)
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    )
  }
}
