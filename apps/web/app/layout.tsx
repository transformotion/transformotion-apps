import type { Metadata, Viewport } from 'next'
import { Inter, Geist_Mono, Bebas_Neue } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { AmplifyProvider } from '@/components/providers/amplify-provider'
import './globals.css'

const inter = Inter({ 
  subsets: ["latin"],
  variable: '--font-inter',
});
const geistMono = Geist_Mono({ 
  subsets: ["latin"],
  variable: '--font-geist-mono',
});
const bebasNeue = Bebas_Neue({
  weight: '400',
  subsets: ["latin"],
  variable: '--font-bebas-neue',
});

export const metadata: Metadata = {
  title: 'Transformotion - Stock Signal Analyser',
  description: 'Market Analysis, sector rotation signals, and enter/exit calls for informed trading decisions',
  generator: 'v0.app',
  manifest: '/manifest.json',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0D1B2A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} ${bebasNeue.variable} bg-background`}>
      <body className="font-sans antialiased min-h-screen bg-background text-foreground">
        <AmplifyProvider>
          {children}
        </AmplifyProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
