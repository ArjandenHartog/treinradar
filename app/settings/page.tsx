'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTheme } from '@/lib/theme-provider'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { Settings, Sun, Moon, Monitor, Layout, ArrowLeft } from 'lucide-react'

// ─── Icons ────────────────────────────────────────────────────────────────────

const SettingsIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 1.143c.214.2.534.1.634-.18l.44-1.286c.151-.443.525-.768.97-.807l1.39-.153c.445-.049.85.195 1.002.587.049.195.078.39.078.581v2.195c0 .272-.047.54-.134.792l-.44 1.286c-.151.443-.525.768-.97.807l-1.39.153c-.445.049-.85-.195-1.002-.587a2.104 2.104 0 01-.078-.581v-.222c0-.834-.605-1.53-1.378-1.676l-1.217-.456a1.125 1.125 0 01-.634-1.111l-.213-1.281c-.09-.542-.56-.94-1.11-.94h-2.593c-.55 0-1.02.398-1.11.94l-.213 1.281c-.063.374-.313.686-.645.87a6.084 6.084 0 01-.22.127c-.325.196-.72.257-1.075.124l-1.217.456a1.125 1.125 0 01-1.37-.49l-1.296-1.143c-.214-.2-.534-.1-.634.18l-.44 1.286c-.151.443-.525.768-.97.807l-1.39.153c-.445.049-.85-.195-1.002-.587-.049-.195-.078-.39-.078-.581v-2.195c0-.272.047-.54.134-.792l.44-1.286c.151-.443.525-.768.97-.807l1.39-.153c.445-.049.85.195 1.002.587.049.195.078.39.078.581v.222c0 .834.605 1.53 1.378 1.676l1.217.456c.556.21.884.85.634 1.111l.213 1.281z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const ThemeIcon = ({ theme }: { theme: string }) => {
  if (theme === 'light') {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
      </svg>
    )
  }
  if (theme === 'dark') {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
      </svg>
    )
  }
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
    </svg>
  )
}

const LayoutIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
  </svg>
)

const ArrowLeftIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
  </svg>
)

// ─── Settings Page ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [layoutDensity, setLayoutDensity] = useState<'compact' | 'comfortable' | 'spacious'>('comfortable')
  const [animationsEnabled, setAnimationsEnabled] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [showDebugInfo, setShowDebugInfo] = useState(false)

  const themeOptions = [
    { value: 'light', label: 'Licht', description: 'Heldere interface voor daglicht', icon: Sun },
    { value: 'dark', label: 'Donker', description: 'Minder vermoeiend voor de ogen', icon: Moon },
    { value: 'system', label: 'Systeem', description: 'Volg systeemvoorkeur', icon: Monitor },
  ] as const

  const layoutOptions = [
    { value: 'compact', label: 'Compact', description: 'Meer informatie per scherm' },
    { value: 'comfortable', label: 'Comfortabel', description: 'Gebalanceerde spacing' },
    { value: 'spacious', label: 'Ruim', description: 'Meer ademruimte' },
  ] as const

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-2.5">
          {/* Back button */}
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-[11px] font-medium uppercase tracking-wider">Terug</span>
          </Link>

          {/* Title */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold leading-none text-foreground">Instellingen</div>
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">
                Layout & Voorkeuren
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="space-y-8">

          {/* THEME SETTINGS */}
          <Card className="border-border bg-card p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
                <Monitor className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-card-foreground">Thema</h2>
                <p className="text-sm text-muted-foreground">Kies hoe de app eruit ziet</p>
              </div>
            </div>

            <div className="grid gap-3">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    'flex items-center gap-4 rounded-lg border p-4 text-left transition-all',
                    theme === option.value
                      ? 'border-primary/50 bg-primary/10 text-card-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                    <option.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-card-foreground">{option.label}</div>
                    <div className="text-sm text-muted-foreground">{option.description}</div>
                  </div>
                  {theme === option.value && (
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>
          </Card>

          {/* LAYOUT SETTINGS */}
          <Card className="border-border bg-card p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
                <Layout className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-card-foreground">Layout</h2>
                <p className="text-sm text-muted-foreground">Pas de spacing en dichtheid aan</p>
              </div>
            </div>

            <div className="grid gap-3">
              {layoutOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setLayoutDensity(option.value)}
                  className={cn(
                    'flex items-center gap-4 rounded-lg border p-4 text-left transition-all',
                    layoutDensity === option.value
                      ? 'border-primary/50 bg-primary/10 text-card-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <div className="flex-1">
                    <div className="font-medium text-card-foreground">{option.label}</div>
                    <div className="text-sm text-muted-foreground">{option.description}</div>
                  </div>
                  {layoutDensity === option.value && (
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>
          </Card>

          {/* BEHAVIOR SETTINGS */}
          <Card className="border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-card-foreground mb-6">Gedrag</h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-card-foreground">Animaties</div>
                  <div className="text-sm text-muted-foreground">Vloeiende overgangen en effecten</div>
                </div>
                <button
                  onClick={() => setAnimationsEnabled(!animationsEnabled)}
                  className={cn(
                    'relative h-6 w-11 rounded-full transition-colors',
                    animationsEnabled ? 'bg-primary' : 'bg-muted'
                  )}
                >
                  <div
                    className={cn(
                      'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                      animationsEnabled ? 'translate-x-6' : 'translate-x-0.5'
                    )}
                  />
                </button>
              </div>

              <Separator className="opacity-10" />

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-white">Automatisch vernieuwen</div>
                  <div className="text-sm text-zinc-500">Data elke 5-90 seconden verversen</div>
                </div>
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={cn(
                    'relative h-6 w-11 rounded-full transition-colors',
                    autoRefresh ? 'bg-green-500' : 'bg-zinc-600'
                  )}
                >
                  <div
                    className={cn(
                      'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                      autoRefresh ? 'translate-x-6' : 'translate-x-0.5'
                    )}
                  />
                </button>
              </div>

              <Separator className="opacity-10" />

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-white">Debug informatie</div>
                  <div className="text-sm text-zinc-500">Technische details tonen</div>
                </div>
                <button
                  onClick={() => setShowDebugInfo(!showDebugInfo)}
                  className={cn(
                    'relative h-6 w-11 rounded-full transition-colors',
                    showDebugInfo ? 'bg-amber-500' : 'bg-zinc-600'
                  )}
                >
                  <div
                    className={cn(
                      'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                      showDebugInfo ? 'translate-x-6' : 'translate-x-0.5'
                    )}
                  />
                </button>
              </div>
            </div>
          </Card>

          {/* DEBUG INFO */}
          {showDebugInfo && (
            <Card className="border-white/[0.06] bg-white/[0.02] p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Debug Informatie</h2>
              <div className="space-y-2 font-mono text-sm">
                <div>Thema: <Badge variant="secondary">{theme}</Badge></div>
                <div>Layout dichtheid: <Badge variant="secondary">{layoutDensity}</Badge></div>
                <div>Animaties: <Badge variant="secondary">{animationsEnabled ? 'Aan' : 'Uit'}</Badge></div>
                <div>Auto refresh: <Badge variant="secondary">{autoRefresh ? 'Aan' : 'Uit'}</Badge></div>
                <div>User Agent: <Badge variant="secondary" className="text-xs">{typeof window !== 'undefined' ? navigator.userAgent.slice(0, 50) + '...' : 'SSR'}</Badge></div>
              </div>
            </Card>
          )}

        </div>
      </main>

      {/* FOOTER / ATTRIBUTION */}
      <footer className="border-t border-border bg-muted/30 mt-16 py-8">
        <div className="mx-auto max-w-4xl px-4">
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Over Treinradar</h3>
              <p className="text-sm text-muted-foreground max-w-prose">
                Treinradar is een onafhankelijke applicatie voor realtime monitoring van treinen in Nederland, inclusief NS, Arriva, R-net en de Valleilijn.
              </p>
            </div>

            <Separator className="opacity-20" />

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Gegevensbronnen & Attributies</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong>Nederlandse Spoorwegen (NS)</strong> — Reistijden, stations, GPS-posities en routegegevens afkomstig uit NS-API en Virtual Train API.
                </p>
                <p>
                  <strong>OVAPI / NDOV</strong> — Realtime rij-informatie voor regionale operators zoals EBS (Valleilijn / R-net).
                </p>
                <p>
                  <strong>OpenStreetMap</strong> — Kaarten en geografische gegevens via OSM en aanverwante providers (CartoDB, Esri).
                </p>
                <p>
                  <strong>OpenRailwayMap</strong> — Spoorweginformatie zoals baanvakken en maximumsnelheden.
                </p>
                <p className="pt-2 italic text-xs">
                  Treinradar is niet officieel verbonden aan of goedgekeurd door Nederlandse Spoorwegen of EBS. Alle data is publiek beschikbaar via openbare API's. Voor officiële trein­informatie, zie{' '}
                  <a href="https://www.ns.nl" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">
                    ns.nl
                  </a>
                  {' '}of{' '}
                  <a href="https://www.rnet.nl" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">
                    rnet.nl
                  </a>
                </p>
              </div>
            </div>

            <Separator className="opacity-20" />

            <div className="text-xs text-muted-foreground">
              <p>© 2026 Treinradar. Gemaakt met ❤️ voor railfans en reizigers.</p>
              <p className="mt-1">Data wordt in realtime bijgewerkt. Accuratesse kan variëren.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}