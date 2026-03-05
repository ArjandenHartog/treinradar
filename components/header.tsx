'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useTheme } from '@/lib/theme-provider'
import { cn } from '@/lib/utils'
import { Settings, Menu, X } from 'lucide-react'

const TrainIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 15.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V5c0-3.5-3.58-4-8-4s-8 .5-8 4v10.5zm8 1.5c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm6-7H6V5h12v5z"/>
  </svg>
)

export function Header() {
  const { theme, setTheme } = useTheme()
  const pathname = usePathname()
  const [isDark, setIsDark] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (theme === 'dark') {
      setIsDark(true)
    } else if (theme === 'light') {
      setIsDark(false)
    } else {
      setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
  }, [theme])

  const isActive = (path: string) => pathname === path

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-4 py-2.5">

        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/15 text-blue-400">
            <TrainIcon />
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-semibold leading-none text-white">Treinradar</div>
            <div className="text-[9px] uppercase tracking-widest text-zinc-600 mt-0.5">
              NS · Arriva · R-net · Valleilijn
            </div>
          </div>
        </Link>

        {/* Nav - desktop */}
        <nav className="hidden md:flex items-center gap-1 ml-2">
          <Link
            href="/"
            className={cn(
              'rounded-md px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider transition-colors',
              isActive('/') ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            Treinenradar
          </Link>
          <Link
            href="/radar"
            className={cn(
              'rounded-md px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider transition-colors',
              isActive('/radar') ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            Kaart
          </Link>
          <Link
            href="/statistieken"
            className={cn(
              'rounded-md px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider transition-colors',
              isActive('/statistieken') ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            Statistieken
          </Link>
          <Link
            href="/materieel"
            className={cn(
              'rounded-md px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider transition-colors',
              isActive('/materieel') ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            Materieel
          </Link>
          <Link
            href="/planner"
            className={cn(
              'rounded-md px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider transition-colors',
              isActive('/planner') ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            Reisinformatie
          </Link>
          <Link
            href="/zoeken"
            className={cn(
              'rounded-md px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider transition-colors',
              isActive('/zoeken') ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            Zoeken
          </Link>
        </nav>

        {/* Right - desktop */}
        <div className="hidden md:flex ml-auto items-center gap-3">
          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="flex items-center justify-center rounded-md px-2 py-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
            title={isDark ? 'Lichte modus' : 'Donkere modus'}
          >
            {isDark ? (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998z" />
              </svg>
            )}
          </button>
          <Link
            href="/settings"
            className="flex items-center justify-center rounded-md px-2 py-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Instellingen"
          >
            <Settings className="h-3.5 w-3.5" />
          </Link>
          <a
            href="https://github.com/ArjandenHartog/treinradar"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center rounded-md px-2 py-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="GitHub"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
        </div>

        {/* Mobile menu button */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="ml-auto flex items-center justify-center rounded-md p-2 text-zinc-500 hover:text-zinc-300 transition-colors md:hidden"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="absolute top-full left-0 right-0 z-50 border-b border-white/[0.06] bg-background px-4 py-3 md:hidden">
            <nav className="flex flex-col gap-1">
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'rounded-md px-3 py-2 text-[11px] font-medium uppercase tracking-wider transition-colors',
                  isActive('/') ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                Treinenradar
              </Link>
              <Link
                href="/radar"
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'rounded-md px-3 py-2 text-[11px] font-medium uppercase tracking-wider transition-colors',
                  isActive('/radar') ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                Kaart
              </Link>
              <Link
                href="/statistieken"
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'rounded-md px-3 py-2 text-[11px] font-medium uppercase tracking-wider transition-colors',
                  isActive('/statistieken') ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                Statistieken
              </Link>
              <Link
                href="/materieel"
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'rounded-md px-3 py-2 text-[11px] font-medium uppercase tracking-wider transition-colors',
                  isActive('/materieel') ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                Materieel
              </Link>
              <Link
                href="/planner"
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'rounded-md px-3 py-2 text-[11px] font-medium uppercase tracking-wider transition-colors',
                  isActive('/planner') ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                Reisinformatie
              </Link>
              <Link
                href="/zoeken"
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'rounded-md px-3 py-2 text-[11px] font-medium uppercase tracking-wider transition-colors',
                  isActive('/zoeken') ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                Zoeken
              </Link>
            </nav>
            <div className="mt-3 flex items-center gap-2 border-t border-white/[0.06] pt-3">
              <button
                onClick={() => { setTheme(isDark ? 'light' : 'dark'); setMenuOpen(false) }}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {isDark ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998z" />
                  </svg>
                )}
                <span className="text-xs">{isDark ? 'Lichte modus' : 'Donkere modus'}</span>
              </button>
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <Settings className="h-4 w-4" />
                <span className="text-xs">Instellingen</span>
              </Link>
              <a
                href="https://github.com/ArjandenHartog/treinradar"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                <span className="text-xs">GitHub</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
