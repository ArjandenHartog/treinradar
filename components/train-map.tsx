'use client'

import dynamic from 'next/dynamic'
import type { Station } from '@/lib/supabase'
import type { PositionedTrain } from '@/app/api/trains/positions/route'

const TrainMapInner = dynamic(() => import('./train-map-inner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-2">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-500" />
        <span className="font-mono text-[11px] text-zinc-600">kaart laden…</span>
      </div>
    </div>
  ),
})

interface Props {
  stations: Station[]
  trains: PositionedTrain[]
}

export default function TrainMap({ stations, trains }: Props) {
  return <TrainMapInner stations={stations} trains={trains} />
}
