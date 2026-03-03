'use client'

import { useEffect, useState } from 'react'

export function LiveClock() {
  const [time, setTime] = useState('--:--:--')
  const [date, setDate] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      setDate(now.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex flex-col items-end select-none">
      <span className="font-mono text-xl font-semibold text-white tabular-nums tracking-tight leading-none">
        {time}
      </span>
      <span className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider">{date}</span>
    </div>
  )
}
