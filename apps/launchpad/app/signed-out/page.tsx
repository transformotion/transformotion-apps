import Link from 'next/link'
import { Wordmark } from '@/components/brand/wordmark'

export default function SignedOutPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="flex justify-center mb-10">
            <Wordmark size="xl" />
          </div>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">You have been signed out.</p>
            <Link
              href="/sign-in"
              className="inline-flex items-center justify-center px-6 h-10 rounded-xl font-medium text-sm transition-all bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Sign in
            </Link>
          </div>
        </div>
      </main>

      <footer className="py-6 text-center">
        <p className="text-xs text-muted-foreground">
          Putting your business transformation into motion
        </p>
      </footer>
    </div>
  )
}
