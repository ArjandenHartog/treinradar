import { NextRequest, NextResponse } from 'next/server'
import { getVehicles } from '@/lib/ns-api'
import { supabase } from '@/lib/supabase'

// Called by Vercel Cron every 2 minutes (see vercel.json)
// Records a position snapshot for every moving train.
export async function GET(req: NextRequest) {
  // Protect against accidental public access
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const vehicles = await getVehicles({ features: 'materieel' })
    const moving = vehicles.filter(v => v.lat && v.lng && (v.snelheid ?? 0) > 0)

    if (!moving.length) {
      return NextResponse.json({ inserted: 0, note: 'no moving trains' })
    }

    const now = new Date().toISOString()
    const BATCH = 50
    let inserted = 0

    const rows = moving.map(v => ({
      service_number:    v.ritId?.replace(/\s/g, '').split('-')[0].split('_')[0] ?? '',
      lat:               v.lat,
      lng:               v.lng,
      speed_kmh:         Math.round(v.snelheid ?? 0),
      heading:           v.richting ?? 0,
      recorded_at:       now,
    }))

    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase
        .from('train_position_history')
        .insert(rows.slice(i, i + BATCH))
      if (error) console.warn('[cron/positions-snapshot] insert error:', error.message)
      else inserted += Math.min(BATCH, rows.length - i)
    }

    return NextResponse.json({ inserted, trains: moving.length })
  } catch (err) {
    console.error('[cron/positions-snapshot]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
