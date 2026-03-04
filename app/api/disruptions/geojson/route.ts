import { NextResponse } from 'next/server'
import { getDisruptions, getDisruptionGeoJSON } from '@/lib/ns-api'
import type { SpoorkaartFeature } from '@/lib/ns-api'

interface CacheEntry { data: ReturnType<typeof buildGeoJSON>; ts: number }
let cache: CacheEntry | null = null
const CACHE_MS = 2 * 60 * 1000

function buildGeoJSON(features: SpoorkaartFeature[]) {
  return { type: 'FeatureCollection' as const, features }
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_MS) {
    return NextResponse.json(cache.data)
  }

  // Fetch active disruptions directly from NS (don't depend on Supabase being populated)
  const disruptions = await getDisruptions()
  const relevant = disruptions.filter(d => d.isActive && d.type !== 'MAINTENANCE').slice(0, 25)

  if (!relevant.length) {
    return NextResponse.json(buildGeoJSON([]))
  }

  // Fetch GeoJSON for each disruption in parallel via SpoorKaart API
  const results = await Promise.all(relevant.map(d => getDisruptionGeoJSON(d.id)))

  const features: SpoorkaartFeature[] = results.flatMap((feats, i) =>
    feats
      .filter(f => f.geometry)
      .map(f => ({
        ...f,
        properties: { ...f.properties, disruptionTitle: relevant[i].title, disruptionType: relevant[i].type },
      }))
  )

  const data = buildGeoJSON(features)
  cache = { data, ts: Date.now() }
  return NextResponse.json(data)
}
