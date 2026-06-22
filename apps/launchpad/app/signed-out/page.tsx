import Link from 'next/link'
import { BrandLogo } from '@/components/brand/brand-logo'

export default function SignedOutPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <BrandLogo surface="page" priority imgClassName="h-10 w-auto sm:h-12" />

        <p className="mt-8 text-muted-foreground">You have been signed out.</p>
        <Link
          href="/sign-in"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-8 py-2.5 font-display text-base font-semibold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Sign in
        </Link>
      </main>

      <footer className="py-6 text-center">
        <p className="text-xs text-muted-foreground">
          Putting your business transformation into motion
        </p>
      </footer>
    </div>
  )
}
