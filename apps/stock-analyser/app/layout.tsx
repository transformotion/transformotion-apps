import type { Metadata, Viewport } from 'next'
import { Inter, Geist_Mono, Bebas_Neue, Oswald } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { AmplifyProvider } from '@/components/providers/amplify-provider'
import { BUILD_COMMIT_HASH, APP_IDENTITY } from '@/lib/build-info'
import { ThemeProvider } from '@/components/theme-provider'
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
const oswald = Oswald({
  subsets: ["latin"],
  variable: '--font-oswald',
});

export const metadata: Metadata = {
  title: 'Transformotion - Stock Signal Analyser',
  description: 'Market Analysis, sector rotation signals, and enter/exit calls for informed trading decisions',
  generator: 'v0.app',
  manifest: '/stock-analyser/manifest.json',
  icons: {
    icon: [
      {
        url: '/stock-analyser/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/stock-analyser/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/stock-analyser/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/stock-analyser/apple-icon.png',
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
    <html lang="en" data-commit={BUILD_COMMIT_HASH} data-app={APP_IDENTITY} className={`${inter.variable} ${geistMono.variable} ${bebasNeue.variable} ${oswald.variable} bg-background`} suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
          storageKey="transformotion-theme"
        >
          <AmplifyProvider>
            {children}
          </AmplifyProvider>
        </ThemeProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
