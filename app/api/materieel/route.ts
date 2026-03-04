import { NextResponse } from 'next/server'
import { getVehicles, getTrainInformationForRitnummer } from '@/lib/ns-api'
import { getStockInfo, FACILITY_LABEL, type Facility } from '@/lib/rolling-stock'

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

// 5-minute in-process cache
let cache: { data: MaterieelData; ts: number } | null = null
const CACHE_TTL = 5 * 60 * 1000

/** Roman numeral suffix for VIRM/DDZ naming convention */
function toRoman(n: number): string {
  const MAP: Record<number, string> = { 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX' }
  return MAP[n] ?? String(n)
}

/** Format display name matching NS naming convention */
function formatDisplayName(typeCode: string, parts: number): string {
  const upper = typeCode.toUpperCase()
  // VIRM/DDZ use Roman numerals
  if (upper.startsWith('VIRM') || upper === 'DDZ') {
    return `${typeCode} ${toRoman(parts)}`
  }
  // ICNG keeps Arabic numerals
  return `${typeCode} ${parts}`
}

/** Normalise raw material type code from NS API */
function normaliseTypeCode(raw: string): string {
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
  }
  return MAP[u] ?? raw
}

export async function GET() {
  try {
    const now = Date.now()
    if (cache && now - cache.ts < CACHE_TTL) {
      return NextResponse.json(cache.data)
    }

    // 1. Get all active vehicles
    const vehicles = await getVehicles({ features: 'materieel' })

    // Deduplicate by ritId, track number of material parts
    const trainMap = new Map<string, number>()
    for (const v of vehicles) {
      if (!v.ritId) continue
      const id = v.ritId.split('-')[0].split('_')[0].replace(/\s/g, '')
      const parts = v.materieel?.length ?? 0
      const existing = trainMap.get(id) ?? 0
      if (parts > existing) trainMap.set(id, parts)
    }

    const allRitIds = Array.from(trainMap.keys())
    const totalVehicles = allRitIds.length

    // 2. Sample up to 150 trains for type detection
    const sampleIds = allRitIds.slice(0, 150)

    // Parallel fetch train information
    const infoResults = await Promise.allSettled(
      sampleIds.map(id => getTrainInformationForRitnummer(id))
    )

    // 3. Group by typeCode + numberOfParts
    // Key: "${typeCode}_${parts}" → aggregated stats
    const groups = new Map<string, {
      typeCode: string
      parts: number
      count: number
      firstClass: number
      secondClass: number
      image: string | null
      lengthM: number
      facilities: string[]
    }>()

    for (let i = 0; i < sampleIds.length; i++) {
      const result = infoResults[i]
      if (result.status !== 'fulfilled' || !result.value) continue

      const info = result.value
      const delen = (info.materieelDelen ?? info.trainParts ?? []) as Array<{
        type?: string
        zitplaatsen?: { zitplaatsEersteKlas: number; zitplaatsTweedeKlas: number }
        facilities?: string[]
        afbeelding?: string
        lengteInMeters?: number
      }>
      if (!delen.length) continue

      const rawType = delen[0].type
      if (!rawType) continue

      const typeCode = normaliseTypeCode(rawType)
      const parts = delen.length
      const key = `${typeCode}_${parts}`

      if (!groups.has(key)) {
        const firstClass = delen.reduce((s, p) => s + (p.zitplaatsen?.zitplaatsEersteKlas ?? 0), 0)
        const secondClass = delen.reduce((s, p) => s + (p.zitplaatsen?.zitplaatsTweedeKlas ?? 0), 0)
        const image = delen[0].afbeelding ?? null
        const lengthM = delen.reduce((s, p) => s + (p.lengteInMeters ?? 0), 0)

        // Build facilities from NS API data
        const facilitySet = new Set<string>()
        for (const deel of delen) {
          for (const f of (deel.facilities ?? [])) {
            facilitySet.add(f)
          }
        }
        const facilityLabels = Array.from(facilitySet).map(f => {
          const fLower = f.toLowerCase().replace('_', '-') as Facility
          return FACILITY_LABEL[fLower]?.label ?? f
        })

        groups.set(key, { typeCode, parts, count: 0, firstClass, secondClass, image, lengthM, facilities: facilityLabels })
      }

      groups.get(key)!.count++
    }

    // 4. Scale counts to full fleet size
    const sampledCount = sampleIds.length
    const scaleFactor = sampledCount > 0 ? totalVehicles / sampledCount : 1

    // 5. Build output types, enriching with STOCK database for missing data
    const types: MaterialTypeStats[] = []

    for (const [, g] of groups) {
      const stockInfo = getStockInfo(g.typeCode, g.parts)

      // Prefer API data, fall back to STOCK database
      const firstClass = g.firstClass || (stockInfo?.seats.first ?? 0)
      const secondClass = g.secondClass || (stockInfo?.seats.second ?? 0)
      const image = g.image || stockInfo?.image || null
      const lengthM = g.lengthM || (stockInfo?.lengthM ?? 0)
      const facilities = g.facilities.length ? g.facilities : (stockInfo?.spec.facilities?.map(f => FACILITY_LABEL[f]?.label ?? f) ?? [])

      types.push({
        typeCode: g.typeCode,
        displayName: formatDisplayName(g.typeCode, g.parts),
        fullName: stockInfo?.spec.fullName ?? g.typeCode,
        activeCount: Math.max(1, Math.round(g.count * scaleFactor)),
        numberOfParts: g.parts,
        firstClassSeats: firstClass,
        secondClassSeats: secondClass,
        totalSeats: firstClass + secondClass,
        image,
        topSpeedKmh: stockInfo?.spec.topSpeedKmh ?? 0,
        facilities,
        lengthM,
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
