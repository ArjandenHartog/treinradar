import { cn } from '@/lib/utils'

type Accent = 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'zinc'

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  sub2?: string
  accent?: Accent
  icon?: React.ReactNode
  loading?: boolean
  className?: string
}

const accentGradient: Record<Accent, string> = {
  blue:   'from-blue-500/80',
  green:  'from-green-500/80',
  amber:  'from-amber-500/80',
  red:    'from-red-500/80',
  purple: 'from-purple-500/80',
  zinc:   'from-zinc-500/50',
}

const accentText: Record<Accent, string> = {
  blue:   'text-blue-400',
  green:  'text-green-400',
  amber:  'text-amber-400',
  red:    'text-red-400',
  purple: 'text-purple-400',
  zinc:   'text-zinc-400',
}

export function StatCard({ label, value, sub, sub2, accent = 'blue', icon, loading, className }: StatCardProps) {
  return (
    <div className={cn(
      'relative overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.03] p-4 stat-card-hover',
      className
    )}>
      {/* Accent bar */}
      <div className={cn(
        'absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r to-transparent',
        accentGradient[accent]
      )} />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500 mb-1.5">
            {label}
          </p>
          {loading ? (
            <div className="h-7 w-24 animate-pulse rounded bg-white/5" />
          ) : (
            <p className={cn('font-mono text-2xl font-bold leading-none tabular-nums', accentText[accent])}>
              {value}
            </p>
          )}
          {sub && (
            <p className="mt-1.5 text-[11px] leading-tight text-zinc-400 truncate">{sub}</p>
          )}
          {sub2 && (
            <p className="mt-0.5 text-[10px] leading-tight text-zinc-600 truncate">{sub2}</p>
          )}
        </div>
        {icon && (
          <div className="shrink-0 text-zinc-600">{icon}</div>
        )}
      </div>
    </div>
  )
}
