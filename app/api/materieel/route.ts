import { NextResponse } from 'next/server'
import { getTrainInfo } from '@/lib/ns-api'
import { getStockInfo, FACILITY_LABEL } from '@/lib/rolling-stock'

export interface MaterialTypeStats {
  typeCode: string
  displayName: string
  fullName: string
  activeCount: number
  numberOfParts: number
  firstClassSeats: number
  secondClassSeats: number
  totalSeats: number
  image: string | null
  topSpeedKmh: number
  facilities: string[]
  lengthM: number
}

export interface MaterieelData {
  types: MaterialTypeStats[]
  totalTypes: number
  totalUnits: number
  totalSeats: number
  updatedAt: string
}

const CACHE_TTL = 5 * 60 * 1000

let cache: { data: MaterieelData; ts: number } | null = null

function toRoman(n: number): string {
  const MAP: Record<number, string> = { 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX' }
  return MAP[n] ?? String(n)
}

function formatDisplayName(typeCode: string, parts: number): string {
  const upper = typeCode.toUpperCase()
  if (upper.startsWith('VIRM') || upper === 'DDZ') {
    return `${typeCode} ${toRoman(parts)}`
  }
  return `${typeCode} ${parts}`
}

function normaliseTypeCode(raw: string | undefined): string {
  if (!raw) return 'Unknown'
  const u = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const MAP: Record<string, string> = {
    'VIRMM1': 'VIRMm1',
    'VIRMM2': 'VIRMm2',
    'NSRFLIRT': 'Flirt',
    'NSRFLIRT3': 'Flirt',
    'FLIRT2': 'Flirt',
    'FLIRT3': 'Flirt',
    'FLIRT4': 'Flirt',
    'ICNGB': 'ICNG',
    'SNG4': 'SNG',
    'SNG3': 'SNG',
    'SNG6': 'SNG',
  }
  return MAP[u] ?? raw
}

export async function GET() {
  try {
    const now = Date.now()
    
    if (cache && now - cache.ts < CACHE_TTL) {
      return NextResponse.json(cache.data)
    }
    
    const trainData = await getTrainInfo()
    
    // Track unique trains by their treinnummer + a representative materieelnummer
    const seenTrains = new Set<string>()
    const typeCounts = new Map<string, {
      typeCode: string
      parts: number
      count: number
      lengthM: number
    }>()
    
    for (const stationTrains of Object.values(trainData)) {
      for (const trainInfo of Object.values(stationTrains)) {
        const treinnummer = trainInfo.treinnummer
        if (!treinnummer) continue
        
        // Use treinnummer as unique train identifier
        const trainKey = `train_${treinnummer}`
        if (seenTrains.has(trainKey)) continue
        seenTrains.add(trainKey)
        
        const delen = trainInfo.treindelen ?? []
        if (delen.length === 0) continue
        
        // Use the first materieel type for this train
        const typeCode = normaliseTypeCode(delen[0].type)
        const parts = delen.length
        const key = `${typeCode}_${parts}`
        
        if (!typeCounts.has(key)) {
          typeCounts.set(key, {
            typeCode,
            parts,
            count: 0,
            lengthM: trainInfo.lengteInMeters ?? 0,
          })
        }
        
        typeCounts.get(key)!.count++
      }
    }

    const types: MaterialTypeStats[] = []

    for (const [, g] of typeCounts) {
      if (g.count === 0) continue
      
      const stockInfo = getStockInfo(g.typeCode, g.parts)

      types.push({
        typeCode: g.typeCode,
        displayName: formatDisplayName(g.typeCode, g.parts),
        fullName: stockInfo?.spec.fullName ?? g.typeCode,
        activeCount: g.count,
        numberOfParts: g.parts,
        firstClassSeats: stockInfo?.seats.first ?? 0,
        secondClassSeats: stockInfo?.seats.second ?? 0,
        totalSeats: (stockInfo?.seats.first ?? 0) + (stockInfo?.seats.second ?? 0),
        image: stockInfo?.image ?? null,
        topSpeedKmh: stockInfo?.spec.topSpeedKmh ?? 0,
        facilities: stockInfo?.spec.facilities?.map(f => FACILITY_LABEL[f]?.label ?? f) ?? [],
        lengthM: g.lengthM || (stockInfo?.lengthM ?? 0),
      })
    }

    types.sort((a, b) => b.activeCount - a.activeCount)

    const data: MaterieelData = {
      types,
      totalTypes: types.length,
      totalUnits: types.reduce((s, t) => s + t.activeCount, 0),
      totalSeats: types.reduce((s, t) => s + t.activeCount * t.totalSeats, 0),
      updatedAt: new Date().toISOString(),
    }

    cache = { data, ts: now }
    return NextResponse.json(data)
  } catch (err) {
    console.error('[materieel]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
