import { NextResponse } from 'next/server'
import { getDisruptions } from '@/lib/ns-api'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    const disruptions = await getDisruptions()

    const rows = disruptions.map(d => ({
      id: d.id,
      title: d.title ?? '',
      type: d.type ?? '',
      is_active: d.isActive ?? true,
      impact: d.impact?.description ?? '',
      start_time: d.start ?? null,
      end_time: d.end ?? null,
      affected_stations: d.publicationSections?.flatMap(
        s => s.section?.stations?.map(st => st.name) ?? []
      ) ?? [],
      updated_at: new Date().toISOString(),
    }))

    if (rows.length > 0) {
      await supabase.from('disruptions').upsert(rows, { onConflict: 'id' })
    }

    return NextResponse.json({ disruptions: rows, count: rows.length })
  } catch (err) {
    console.error('Disruptions error:', err)
    return NextResponse.json({ error: 'Failed to fetch disruptions' }, { status: 500 })
  }
}
