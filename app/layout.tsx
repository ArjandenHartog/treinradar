import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/react'
import './globals.css'
import { ThemeProvider } from '@/lib/theme-provider'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Treinradar Nederland | Realtime Treinposities & Vertragingen',
  description: 'Treinradar, Realtime spoorwegnet Nederland met live treinposities, vertragingen, verstoringen en NS statistieken. Monitor alle treinen in Nederland op één kaart.',
  keywords: ['treinen', 'NS', 'Nederlandse Spoorwegen', 'vertraging', 'realtime', 'spoorwegen', 'treinkaart', 'vervoer'],
  authors: [{ name: 'Arjan' }],
  creator: 'Arjan',
  metadataBase: new URL('https://radar.arjandenhartog.com'),
  
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
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
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
