import { NextRequest, NextResponse } from 'next/server'
import { getVehicles, getTrainDestination } from '@/lib/ns-api'
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
    const [vehicles, { data: departures }] = await Promise.all([
      getVehicles({ features: 'materieel' }),
      supabase
        .from('train_departures')
        .select('service_number, destination, destination_actual, type_code, operator, delay, cancelled, origin, station_code')
        .gte('updated_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()),
    ])

    const depByNumber = new Map<string, NonNullable<typeof departures>[number]>()
    for (const d of departures ?? []) {
      if (!depByNumber.has(d.service_number)) depByNumber.set(d.service_number, d)
    }

    const moving = vehicles.filter(v => v.lat && v.lng && (v.snelheid ?? 0) > 0)

    if (!moving.length) {
      return NextResponse.json({ inserted: 0, note: 'no moving trains' })
    }

    const now = new Date().toISOString()
    const BATCH = 50
    let inserted = 0

    // Build initial rows from VT API + Supabase departure data
    const trainRows = moving.map(v => {
      const ritId = v.ritId?.replace(/\s/g, '').split('-')[0].split('_')[0] ?? ''
      const dep   = depByNumber.get(ritId)
      return {
        ritId,
        service_number:    ritId,
        lat:               v.lat,
        lng:               v.lng,
        speed_kmh:         Math.round(v.snelheid ?? 0),
        heading:           v.richting ?? 0,
        recorded_at:       now,
        type_code:         dep?.type_code ?? null,
        operator:          dep?.operator ?? null,
        destination:       dep?.destination_actual || dep?.destination || null,
        origin:            dep?.origin ?? dep?.station_code ?? null,
        delay:             dep?.delay ?? 0,
        cancelled:         dep?.cancelled ?? false,
        materieel_nummers: v.materieel?.length ? v.materieel : null,
      }
    })

    // Fetch destinations via NS journey API for trains still missing one
    // Limit concurrency to 10 at a time to avoid NS rate limiting
    const missingDest = trainRows.filter(r => !r.destination).slice(0, 60)
    if (missingDest.length > 0) {
      const CONC = 10
      for (let i = 0; i < missingDest.length; i += CONC) {
        const batch = missingDest.slice(i, i + CONC)
        const results = await Promise.allSettled(batch.map(r => getTrainDestination(r.ritId)))
        results.forEach((res, j) => {
          if (res.status === 'fulfilled' && res.value) {
            batch[j].destination = res.value
          }
        })
      }
    }

    // Strip helper field before insert
    const rows = trainRows.map(({ ritId: _ritId, ...r }) => r)

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
