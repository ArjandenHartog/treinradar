import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type Station = {
  abbreviation: string
  uic_code: string
  name: string
  short_name: string
  lat: number
  lng: number
  country: string
  has_facilities: boolean
  updated_at: string
}

export type TrainDeparture = {
  id: string
  service_number: string
  station_code: string
  origin: string
  destination: string
  destination_actual: string
  type: string
  type_code: string
  operator: string
  delay: number
  cancelled: boolean
  cancel_reason: string | null
  departure_time: string
  platform: string
  via: string
  updated_at: string
}

export type PunctualitySnapshot = {
  recorded_at: string   // 'YYYY-MM-DDTHH:MM' (minute bucket)
  punctuality: number
  avg_delay: number
  active_trains: number
  on_time: number
  delayed: number
  cancelled: number
  created_at: string
}

export type Disruption = {
  id: string
  title: string
  type: string
  is_active: boolean
  impact: string
  start_time: string
  end_time: string
  affected_stations: string[]
  updated_at: string
}
