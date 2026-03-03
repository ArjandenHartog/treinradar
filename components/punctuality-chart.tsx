'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'

export interface PunctualityPoint {
  time: string
  punctuality: number
  onTime: number
  total: number
}

interface Props {
  data: PunctualityPoint[]
  avg?: number
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; payload: PunctualityPoint }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-md border border-white/[0.08] bg-zinc-900/95 px-3 py-2 text-xs font-mono shadow-xl">
      <div className="mb-1 text-zinc-400">{label}</div>
      <div className="text-white font-bold">{d.punctuality.toFixed(1)}%</div>
      <div className="text-zinc-500">{d.onTime} op tijd / {d.total} totaal</div>
    </div>
  )
}

export function PunctualityChart({ data, avg }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-zinc-600">
        Verzamelen van data…
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={110}>
      <BarChart data={data} margin={{ top: 4, right: 0, left: -28, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 9, fill: '#52525b', fontFamily: 'var(--font-geist-mono)' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[60, 100]}
          tick={{ fontSize: 9, fill: '#52525b', fontFamily: 'var(--font-geist-mono)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        {avg && (
          <ReferenceLine
            y={avg}
            stroke="#3b82f6"
            strokeDasharray="3 3"
            strokeWidth={1}
            label={{ value: `gem. ${avg.toFixed(1)}%`, position: 'insideTopRight', fontSize: 8, fill: '#3b82f6', fontFamily: 'var(--font-geist-mono)' }}
          />
        )}
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Bar dataKey="punctuality" radius={[2, 2, 0, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={
                entry.punctuality >= 90 ? '#22c55e' :
                entry.punctuality >= 80 ? '#f59e0b' :
                '#ef4444'
              }
              opacity={0.85}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
