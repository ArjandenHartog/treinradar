import { NextResponse } from 'next/server'
import { getStations } from '@/lib/ns-api'
import { supabase } from '@/lib/supabase'

// Cache stations – refresh only when > 1 hour old
export async function GET() {
  try {
    // Try Supabase cache first
    const { data: cached } = await supabase
      .from('stations')
      .select('*')
      .eq('country', 'NL')
      .limit(500)

    if (cached && cached.length > 100) {
      return NextResponse.json(cached)
    }

    // Fetch from NS API
    const stations = await getStations()
    const nlStations = stations
      .filter(s => s.land === 'NL' && s.lat && s.lng)
      .map(s => ({
        abbreviation: s.code,
        uic_code: s.UICCode,
        name: s.namen.lang,
        short_name: s.namen.kort,
        lat: s.lat,
        lng: s.lng,
        country: s.land,
        has_facilities: s.heeftFaciliteiten,
        updated_at: new Date().toISOString(),
      }))

    // Upsert to Supabase
    if (nlStations.length > 0) {
      await supabase.from('stations').upsert(nlStations, { onConflict: 'abbreviation' })
    }

    return NextResponse.json(nlStations)
  } catch (err) {
    console.error('Stations error:', err)
    return NextResponse.json({ error: 'Failed to fetch stations' }, { status: 500 })
  }
}
