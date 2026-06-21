'use client'

import { useState } from 'react'
import { Bell, BellOff, Check, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { authService } from '@/lib/services/auth'
import { saveUserProfile, type UserProfile } from '@/lib/services/user-profile'

/**
 * Profile setup/edit form, backed by the live control-plane.
 *
 * Ported verbatim from the v0 prototype (`components/launchpad/profile-form.tsx`);
 * only the data layer changes. Display name and the notifications preference are
 * saved TOGETHER via the contracted `UpdateUserPreferencesRequest` (m16.8.0 typed
 * `displayName` + `notificationsEnabled`) → PUT /api/user/preferences.
 *
 * The display name field is seeded with the correctly-RESOLVED current name
 * (#494 precedence: explicit displayName → token given_name → email local part),
 * computed by the caller via the same chain the launchpad greeting uses.
 *
 * Notifications: CONTRACT-BACKED and persists a real preference. Nothing consumes
 * `notificationsEnabled` yet (no delivery system) — that is a future seam; the
 * toggle correctly persists the preference today.
 */
export function ProfileForm({
  email,
  initialDisplayName,
  initialNotificationsEnabled,
  heading,
  description,
  submitLabel = 'Save profile',
  onSaved,
}: {
  email: string
  initialDisplayName: string
  initialNotificationsEnabled: boolean
  heading: string
  description: string
  submitLabel?: string
  onSaved?: (profile: UserProfile) => void
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [notificationsEnabled, setNotificationsEnabled] = useState(initialNotificationsEnabled)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const name = displayName.trim()
    if (!name) {
      setError('Display name is required.')
      return
    }
    setSaving(true)
    try {
      const idToken = await authService.getIdToken()
      if (!idToken) throw new Error('Not signed in')
      // displayName + notificationsEnabled save together (contracted request).
      const profile = await saveUserProfile(idToken, { displayName: name, notificationsEnabled })
      setSaved(true)
      onSaved?.(profile)
    } catch (err) {
      console.error('[launchpad] profile save failed:', err)
      setError('Could not save your profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <Check className="size-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Profile saved</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            You&apos;re all set, {displayName.trim()}. Your name and preferences now apply across
            every Transformotion app.
          </p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-surface/40 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <UserRound className="size-4 text-primary" />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-foreground">{heading}</h4>
          <p className="mt-0.5 text-sm text-pretty text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Display name
          </span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How should we address you?"
            required
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <span className="text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{email}</span>
          </span>
        </label>

        <button
          type="button"
          role="switch"
          aria-checked={notificationsEnabled}
          onClick={() => setNotificationsEnabled((v) => !v)}
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/30"
        >
          <span className="flex items-center gap-2.5">
            {notificationsEnabled ? (
              <Bell className="size-4 text-primary" />
            ) : (
              <BellOff className="size-4 text-muted-foreground" />
            )}
            <span>
              <span className="block text-sm font-medium text-foreground">Notifications</span>
              <span className="block text-xs text-muted-foreground">
                Account activity and invitation updates
              </span>
            </span>
          </span>
          <span
            className={cn(
              'relative h-5 w-9 shrink-0 rounded-full transition-colors',
              notificationsEnabled ? 'bg-primary' : 'bg-surface2',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 size-4 rounded-full bg-background shadow transition-all',
                notificationsEnabled ? 'left-[18px]' : 'left-0.5',
              )}
            />
          </span>
        </button>

        {error && <p className="text-sm text-signal-red">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          <Check className="size-4" />
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
