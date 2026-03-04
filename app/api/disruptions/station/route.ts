import { NextRequest, NextResponse } from 'next/server'
import { getStationDisruptions } from '@/lib/ns-api'

const cache = new Map<string, { data: unknown; ts: number }>()
const CACHE_MS = 60_000

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json([], { status: 400 })

  const cached = cache.get(code)
  if (cached && Date.now() - cached.ts < CACHE_MS) {
    return NextResponse.json(cached.data)
  }

  const disruptions = await getStationDisruptions(code)
  cache.set(code, { data: disruptions, ts: Date.now() })
  return NextResponse.json(disruptions)
}
