import type { Metadata, Viewport } from 'next'
import { Inter, Geist_Mono, Oswald } from 'next/font/google'
import { BUILD_COMMIT_HASH, APP_IDENTITY } from '@/lib/build-info'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const inter = Inter({
  subsets: ["latin"],
  variable: '--font-inter',
})
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: '--font-geist-mono',
})
const oswald = Oswald({
  subsets: ["latin"],
  variable: '--font-oswald',
})

export const metadata: Metadata = {
  title: 'Transformotion — Budget Tracker',
  description: 'Household budget tracking with AI-assisted categorisation',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png',  media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-commit={BUILD_COMMIT_HASH} data-app={APP_IDENTITY} className={`${inter.variable} ${geistMono.variable} ${oswald.variable} bg-background`} suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
          storageKey="transformotion-theme"
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
