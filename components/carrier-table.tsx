'use client'

import { cn } from '@/lib/utils'
import type { CarrierStat } from '@/app/api/stats/route'

function PunctualityBar({ value }: { value: number }) {
  const color =
    value >= 90 ? '#22c55e' :
    value >= 80 ? '#f59e0b' :
    '#ef4444'

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="relative flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }}
        />
      </div>
      <span
        className="font-mono text-[11px] tabular-nums font-semibold w-12 text-right"
        style={{ color }}
      >
        {value.toFixed(1)}%
      </span>
    </div>
  )
}

function formatAvgDelay(seconds: number): string {
  if (seconds <= 0) return '0s'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  return `${m}m ${s > 0 ? s + 's' : ''}`.trim()
}

interface Props {
  carriers: CarrierStat[]
  loading?: boolean
}

export function CarrierTable({ carriers, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-2 p-1">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-white/[0.04]" />
        ))}
      </div>
    )
  }

  if (!carriers.length) {
    return (
      <div className="py-8 text-center font-mono text-xs text-zinc-600">
        Geen data beschikbaar
      </div>
    )
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/[0.05]">
            {['Vervoerder', 'Totaal', 'Op tijd', 'Vertraagd', 'Uitval', 'Gem. vertraging', 'Punctualiteit'].map(h => (
              <th
                key={h}
                className="pb-2 pr-4 text-left font-medium uppercase tracking-[0.1em] text-zinc-600 text-[10px] last:pr-0"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.03]">
          {carriers.map((c) => {
            const active = c.total - c.cancelled
            return (
              <tr
                key={c.operator}
                className="group transition-colors hover:bg-white/[0.02]"
              >
                <td className="py-2 pr-4 font-semibold text-white/90">
                  {c.operator}
                </td>
                <td className="py-2 pr-4 font-mono text-zinc-300 tabular-nums">
                  {c.total}
                </td>
                <td className="py-2 pr-4 font-mono text-green-400 tabular-nums">
                  {c.onTime}
                </td>
                <td className="py-2 pr-4 font-mono tabular-nums">
                  <span className={cn(c.delayed > 0 ? 'text-amber-400' : 'text-zinc-600')}>
                    {c.delayed}
                  </span>
                </td>
                <td className="py-2 pr-4 font-mono tabular-nums">
                  <span className={cn(c.cancelled > 0 ? 'text-red-400' : 'text-zinc-600')}>
                    {c.cancelled}
                  </span>
                </td>
                <td className="py-2 pr-4 font-mono tabular-nums text-zinc-400">
                  {formatAvgDelay(c.avgDelay * 60)}
                </td>
                <td className="py-2">
                  <PunctualityBar value={active > 0 ? (c.onTime / active) * 100 : 100} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
