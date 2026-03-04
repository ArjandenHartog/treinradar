import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/react'
import './globals.css'
import { ThemeProvider } from '@/lib/theme-provider'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Treinradar Nederland | Realtime Treinposities & Vertragingen',
  description: 'Treinradar: realtime spoorwegnet Nederland met live treinposities, vertragingen, verstoringen en statistieken. Inclusief NS, Arriva, R-net en Valleilijn.',
  keywords: ['treinen', 'NS', 'Nederlandse Spoorwegen', 'vertraging', 'realtime', 'spoorwegen', 'treinkaart', 'vervoer', 'Arriva', 'R-net', 'Valleilijn', 'EBS'],
  authors: [{ name: 'Arjan' }],
  creator: 'Arjan',
  metadataBase: new URL('https://radar.arjandenhartog.com'),
  
  manifest: '/favicon/site.webmanifest',
  
  openGraph: {
    type: 'website',
    locale: 'nl_NL',
    url: 'https://radar.arjandenhartog.com',
    siteName: 'Treinradar',
    title: 'Treinradar Nederland | Realtime Treinposities',
    description: 'Volg alle treinen in Nederland in realtime met live posities, vertragingen en verstoringen.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Treinradar - Realtime treinposities Nederland',
      },
    ],
  },
  
  twitter: {
    card: 'summary_large_image',
    title: 'Treinradar Nederland',
    description: 'Realtime treinposities, vertragingen en verstoringen in Nederland',
  },
  
  icons: {
    icon: [
      { url: '/favicon/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon/favicon.ico', sizes: 'any' },
    ],
    apple: [
      { url: '/favicon/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      { url: '/favicon/android-chrome-192x192.png', sizes: '192x192', type: 'image/png', rel: 'icon' },
      { url: '/favicon/android-chrome-512x512.png', sizes: '512x512', type: 'image/png', rel: 'icon' },
    ],
  },
  
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <head>
        {/* Preconnect to external resources */}
        <link rel="preconnect" href="https://tile.openstreetmap.org" />
        <link rel="preconnect" href="https://basemaps.cartocdn.com" />
        
        {/* Structured data (JSON-LD) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'Treinradar',
              description: 'Realtime spoorwegnet visualisatie van Nederland',
              url: 'https://radar.arjandenhartog.com',
              applicationCategory: 'Utility',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'EUR',
              },
            }),
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider defaultTheme="dark" storageKey="treinradar-theme">
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
