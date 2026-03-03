// Static rolling stock database for Dutch trains
// Images live in /public — paths are relative to the domain root

export interface MaterialSpec {
  code: string
  fullName: string
  /** Image path(s) keyed by number of parts (or 'default') */
  images: Record<string | number, string>
  /** Seats per unit/configuration */
  seats: Record<string | number, { first: number; second: number }>
  /** Length in metres per unit/configuration */
  lengths: Record<string | number, number>
  topSpeedKmh: number
  facilities: Facility[]
  wikiSlug?: string
}

export type Facility =
  | 'wifi'
  | 'stille-coupe'
  | 'fiets'
  | 'toegankelijk'
  | 'restaurant'
  | 'stopcontact'
  | 'toilet'
  | 'airco'

export const FACILITY_LABEL: Record<Facility, { icon: string; label: string }> = {
  wifi:         { icon: '📶', label: 'WiFi' },
  'stille-coupe': { icon: '🔇', label: 'Stilte coupé' },
  fiets:        { icon: '🚲', label: 'Fiets toegestaan' },
  toegankelijk: { icon: '♿', label: 'Toegankelijk' },
  restaurant:   { icon: '🍽️', label: 'Restauratiewagen' },
  stopcontact:  { icon: '🔌', label: 'Stopcontact' },
  toilet:       { icon: '🚽', label: 'Toilet' },
  airco:        { icon: '❄️', label: 'Airco' },
}

// ─── Material database ────────────────────────────────────────────────────────

const STOCK: Record<string, MaterialSpec> = {
  SNG: {
    code: 'SNG',
    fullName: 'Sprinter Nieuwe Generatie',
    images: { default: '/sng_4.png', 1: '/sng_4.png', 2: '/sng_4.png', 3: '/sng_4.png', 4: '/sng_4.png' },
    seats: {
      1: { first: 38,  second: 163 },
      2: { first: 76,  second: 326 },
      3: { first: 114, second: 489 },
      4: { first: 152, second: 652 },
      default: { first: 38, second: 163 },
    },
    lengths: { 1: 75, 2: 150, 3: 225, 4: 300, default: 75 },
    topSpeedKmh: 160,
    facilities: ['wifi', 'stille-coupe', 'fiets', 'toegankelijk', 'stopcontact', 'toilet', 'airco'],
  },

  SLT: {
    code: 'SLT',
    fullName: 'Sprinter Lighttrain',
    images: { default: '/slt_4.png', 4: '/slt_4.png', 5: '/slt_4.png', 6: '/slt_6.png' },
    seats: {
      4: { first: 0, second: 228 },
      6: { first: 0, second: 360 },
      default: { first: 0, second: 228 },
    },
    lengths: { 4: 68, 6: 103, default: 68 },
    topSpeedKmh: 160,
    facilities: ['stille-coupe', 'toegankelijk', 'toilet', 'airco'],
  },

  VIRM: {
    code: 'VIRM',
    fullName: 'Verlengd InterRegio Materieel',
    images: { default: '/virm_4.png', 4: '/virm_4.png', 5: '/virm_4.png', 6: '/virmm1_6.png' },
    seats: {
      4: { first: 97,  second: 322 },
      6: { first: 145, second: 483 },
      default: { first: 97, second: 322 },
    },
    lengths: { 4: 104, 6: 158, default: 104 },
    topSpeedKmh: 160,
    facilities: ['stille-coupe', 'fiets', 'toegankelijk', 'toilet', 'airco'],
  },

  ICM: {
    code: 'ICM',
    fullName: 'InterCity Materieel (Koploper)',
    images: { default: '/icm_3.png', 3: '/icm_3.png', 4: '/icm_3.png' },
    seats: {
      3: { first: 64, second: 185 },
      4: { first: 92, second: 260 },
      default: { first: 64, second: 185 },
    },
    lengths: { 3: 83, 4: 110, default: 83 },
    topSpeedKmh: 200,
    facilities: ['stille-coupe', 'toegankelijk', 'toilet', 'airco'],
  },

  DDZ: {
    code: 'DDZ',
    fullName: 'Dubbeldekker Sprinter',
    images: { default: '/virm_4.png' },
    seats: {
      4: { first: 0, second: 342 },
      6: { first: 0, second: 516 },
      default: { first: 0, second: 342 },
    },
    lengths: { 4: 104, 6: 158, default: 104 },
    topSpeedKmh: 140,
    facilities: ['toegankelijk', 'toilet', 'airco'],
  },

  SGM: {
    code: 'SGM',
    fullName: 'Sprinter Elektrisch Materieel',
    images: { default: '/slt_4.png' },
    seats: {
      2: { first: 0, second: 128 },
      3: { first: 0, second: 196 },
      default: { first: 0, second: 128 },
    },
    lengths: { 2: 52, 3: 78, default: 52 },
    topSpeedKmh: 140,
    facilities: ['toegankelijk'],
  },

  ICE: {
    code: 'ICE',
    fullName: 'InterCityExpress (DB)',
    images: { default: '/virm_4.png' },
    seats: { default: { first: 205, second: 616 } },
    lengths: { default: 401 },
    topSpeedKmh: 300,
    facilities: ['wifi', 'restaurant', 'stille-coupe', 'toegankelijk', 'stopcontact', 'toilet', 'airco'],
  },

  FLIRT: {
    code: 'FLIRT',
    fullName: 'Stadler FLIRT',
    images: { default: '/slt_4.png' },
    seats: { default: { first: 0, second: 200 } },
    lengths: { default: 75 },
    topSpeedKmh: 160,
    facilities: ['toegankelijk', 'toilet', 'airco'],
  },

  // EBS Valleilijn FLIRT3 diesel treinstellen
  FLIRT3: {
    code: 'FLIRT3',
    fullName: 'Stadler FLIRT3 (Valleilijn)',
    images: { default: '/slt_4.png' },
    seats: {
      3: { first: 0, second: 186 },
      default: { first: 0, second: 186 },
    },
    lengths: { 3: 74, default: 74 },
    topSpeedKmh: 160,
    facilities: ['toegankelijk', 'toilet', 'airco', 'fiets'],
  },

  // Arriva GTW diesel
  GTW: {
    code: 'GTW',
    fullName: 'Bombardier GTW 2/6',
    images: { default: '/slt_4.png' },
    seats: {
      2: { first: 0, second: 122 },
      default: { first: 0, second: 122 },
    },
    lengths: { 2: 55, default: 55 },
    topSpeedKmh: 140,
    facilities: ['toegankelijk', 'airco'],
  },

  // Arriva CAF Civity
  CIVITY: {
    code: 'CIVITY',
    fullName: 'CAF Civity (Arriva)',
    images: { default: '/slt_4.png' },
    seats: {
      3: { first: 0, second: 212 },
      default: { first: 0, second: 212 },
    },
    lengths: { 3: 80, default: 80 },
    topSpeedKmh: 160,
    facilities: ['wifi', 'toegankelijk', 'toilet', 'airco', 'fiets'],
  },

  // Connexxion/EBS Talent
  TALENT: {
    code: 'TALENT',
    fullName: 'Bombardier Talent',
    images: { default: '/slt_4.png' },
    seats: {
      2: { first: 0, second: 148 },
      default: { first: 0, second: 148 },
    },
    lengths: { 2: 55, default: 55 },
    topSpeedKmh: 140,
    facilities: ['toegankelijk', 'airco'],
  },

  // Siemens Desiro (Arriva)
  DESIRO: {
    code: 'DESIRO',
    fullName: 'Siemens Desiro Classic',
    images: { default: '/slt_4.png' },
    seats: {
      2: { first: 0, second: 142 },
      default: { first: 0, second: 142 },
    },
    lengths: { 2: 52, default: 52 },
    topSpeedKmh: 140,
    facilities: ['toegankelijk', 'airco'],
  },

  // Thalys (Fyra opvolger)
  THA: {
    code: 'THA',
    fullName: 'Thalys (PBKA)',
    images: { default: '/virm_4.png' },
    seats: { default: { first: 113, second: 264 } },
    lengths: { default: 200 },
    topSpeedKmh: 300,
    facilities: ['wifi', 'restaurant', 'stille-coupe', 'toegankelijk', 'stopcontact', 'toilet', 'airco'],
  },

  // Eurostar
  EUR: {
    code: 'EUR',
    fullName: 'Eurostar e320',
    images: { default: '/virm_4.png' },
    seats: { default: { first: 206, second: 694 } },
    lengths: { default: 400 },
    topSpeedKmh: 320,
    facilities: ['wifi', 'restaurant', 'stille-coupe', 'toegankelijk', 'stopcontact', 'toilet', 'airco'],
  },
}

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/** Normalise various codes the NS API might return */
function normalise(raw: string): string {
  const u = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  // Known aliases
  const MAP: Record<string, string> = {
    'SNGDOORSERIES':  'SNG',
    'SNGFLIRT3':      'SNG',
    'VIRMM1':         'VIRM',
    'ICMM1':          'ICM',
    'ICMM1KOPLOPER':  'ICM',
    'SLTSTADLER':     'SLT',
    'SLTCORADIA':     'SLT',
    // FLIRT varianten voor Valleilijn
    'FLIRT3DIESEL':   'FLIRT3',
    'STADLERFLIRT3':  'FLIRT3',
    'FLIRT3EBS':      'FLIRT3',
    'EBSFLIRT3':      'FLIRT3',
    // GTW varianten
    'GTW26':          'GTW',
    'GTW28':          'GTW',
    'BOMBARDIERGTW':  'GTW',
    // Arriva
    'CAFCIVITY':      'CIVITY',
    'ARRIVAFLIRT':    'FLIRT',
    'ARRIVADESIRO':   'DESIRO',
    // Thalys / Eurostar aliassen
    'THALYS':         'THA',
    'PBKA':           'THA',
    'EUROSTAR':       'EUR',
    'E320':           'EUR',
    'E300':           'EUR',
  }
  return MAP[u] ?? u
}

export function getStockInfo(
  materialCode: string,
  numberOfParts?: number
): { spec: MaterialSpec; image: string | null; seats: { first: number; second: number }; lengthM: number } | null {
  const key = normalise(materialCode)
  const spec = STOCK[key]
  if (!spec) return null

  const parts = numberOfParts ?? 'default'
  const image = spec.images[parts] ?? spec.images.default ?? null
  const seats = (spec.seats[parts] ?? spec.seats.default) as { first: number; second: number }
  const lengthM = (spec.lengths[parts] ?? spec.lengths.default) as number

  return { spec, image, seats, lengthM }
}

/** Try to extract a material code from various NS API field names */
export function extractMaterialCode(payload: Record<string, unknown>): string | null {
  // Try trainTypes array first (most detailed)
  const tt = payload.trainTypes
  if (Array.isArray(tt) && tt.length > 0) {
    const k = (tt[0] as Record<string, unknown>).key
    if (typeof k === 'string') return k
  }
  // Try direct trainType field
  if (typeof payload.trainType === 'string') return payload.trainType
  // Try stockIdentifiers (free text like "SNG")
  const si = payload.stockIdentifiers
  if (Array.isArray(si) && si.length > 0 && typeof si[0] === 'string') {
    const m = (si[0] as string).match(/^[A-Z]+/)
    if (m) return m[0]
  }
  return null
}

export function extractNumberOfParts(payload: Record<string, unknown>): number | undefined {
  const tt = payload.trainTypes
  if (Array.isArray(tt) && tt.length > 0) {
    const n = (tt[0] as Record<string, unknown>).numberOfParts
    if (typeof n === 'number') return n
  }
  return undefined
}
