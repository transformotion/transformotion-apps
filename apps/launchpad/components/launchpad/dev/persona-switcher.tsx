/**
 * Dev Persona Switcher — Live Persona Session Control (dev-only)
 * =============================================================
 * RUNTIME of v0's prototyped surface (transformotion-apps-b8
 * components/launchpad/dev/persona-switcher.tsx @ 0fbc9e3). The SURFACE is ported
 * verbatim; the only thing that changed is the data/auth layer behind the seam.
 *
 * Picking a persona mints a REAL session (dev-only POST /api/dev/persona-token)
 * and swaps it into THIS tab (same-tab replace, via the Amplify token store) —
 * the app genuinely authenticates you AS the persona until you switch back. The
 * tester's ORIGINAL session is preserved across persona hops, so "switch back"
 * returns to the original tester (e.g. Steve), not the previous hop.
 *
 * Disabled personas (Leo) are NOT mintable and are shown non-switchable. Gated by
 * `devToolsEnabled()` — same as the Redemption Demo — so it never ships to prod.
 *
 * Differences from the mock prototype (data layer only): the name edit persists
 * live (PUT /api/user/preferences displayName); the mock-only "reset backend to
 * seed" control is dropped (no live equivalent).
 */

"use client"

import { useEffect, useState } from "react"
import {
  UserCog,
  LogOut,
  ShieldCheck,
  ShieldAlert,
  Ban,
  Check,
  X,
  Pencil,
  Eye,
  Undo2,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { authService } from "@/lib/services/auth"
import { updateDisplayName } from "@/lib/services/user-profile"
import { listPersonas } from "@/lib/dev/persona-catalog"
import { startImpersonation, stopImpersonation } from "@/lib/dev/persona-impersonation"
import { usePersonaSession, useImpersonator } from "@/hooks/use-persona-switcher"
import { devToolsEnabled } from "@/lib/dev-tools"

export function PersonaSwitcher() {
  const session = usePersonaSession()
  const impersonator = useImpersonator()
  const personas = listPersonas()
  const [open, setOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState("")
  const [switchError, setSwitchError] = useState<string | null>(null)
  // Static-export SSR guard: render nothing until mounted so the first client
  // render matches the prerendered HTML (the auth store rehydrates a persisted
  // user on the client only — without this the FAB label hydration-mismatches).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isImpersonating = impersonator !== null

  async function handleSwitch(personaId: string) {
    setSwitchError(null)
    const result = await startImpersonation(personaId)
    // On success the tab reloads as the persona; only surface failures here.
    if (!result.ok) {
      setSwitchError(result.error)
    }
  }

  function handleSwitchBack() {
    setSwitchError(null)
    stopImpersonation()
  }

  function startEditName() {
    setDraftName(session?.displayName ?? "")
    setEditingName(true)
  }
  async function saveName() {
    const idToken = await authService.getIdToken().catch(() => null)
    if (idToken) {
      try {
        await updateDisplayName(idToken, draftName)
      } catch {
        /* best-effort; the live read on next load reflects the persisted name */
      }
    }
    setEditingName(false)
  }

  // Dev/test-harness gate. Placed after all hooks (rules-of-hooks safe); the
  // flag is module-stable so this is consistent across renders. Disabled in
  // production builds (NEXT_PUBLIC_DEV_TOOLS=false) — the switcher disappears
  // from every screen it is mounted on at once.
  if (!devToolsEnabled() || !mounted) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] font-sans">
      {open ? (
        <div className="flex max-h-[calc(100vh-2rem)] w-80 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          {/* Header — stays pinned so the close (X) is always reachable */}
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface2/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <UserCog className="size-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Persona switcher (dev)
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-surface hover:text-foreground"
              aria-label="Close persona switcher"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Honesty note — this is a REAL minted session, not a pretend flip */}
          <div className="flex shrink-0 items-start gap-1.5 border-b border-border bg-surface2/30 px-4 py-2">
            <Zap className="mt-0.5 size-3 shrink-0 text-signal-amber" />
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Switching mints a <span className="font-semibold text-foreground">real session</span> for
              the persona and replaces yours in this tab. The app truly sees you as them until you switch
              back.
            </p>
          </div>

          {/* Active impersonation banner — always visible while viewing-as */}
          {isImpersonating && (
            <div className="shrink-0 border-b border-signal-amber/40 bg-signal-amber/10 px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <Eye className="size-3.5 text-signal-amber" />
                <p className="text-[11px] font-semibold text-foreground">
                  Viewing as {session?.label}
                </p>
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Your session: {impersonator?.label}
              </p>
              <button
                onClick={handleSwitchBack}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-signal-amber px-2 py-1.5 text-[11px] font-semibold text-background hover:bg-signal-amber/90"
              >
                <Undo2 className="size-3.5" />
                Switch back to {impersonator?.label}
              </button>
            </div>
          )}

          {/* Current session */}
          <div className="shrink-0 border-b border-border px-4 py-3">
            {session ? (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {isImpersonating ? "Acting as" : "Signed in as"}
                </p>
                {editingName ? (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="Display name"
                      className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-primary"
                      autoFocus
                    />
                    <button
                      onClick={saveName}
                      className="rounded-md bg-primary p-1.5 text-primary-foreground hover:bg-primary/90"
                      aria-label="Save display name"
                    >
                      <Check className="size-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingName(false)}
                      className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-surface2"
                      aria-label="Cancel"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{session.label}</span>
                    <button
                      onClick={startEditName}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                      aria-label="Edit display name"
                    >
                      <Pencil className="size-3" />
                    </button>
                    {session.siteAdmin && (
                      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                        <ShieldCheck className="size-2.5" />
                        site-admin
                      </span>
                    )}
                  </div>
                )}
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{session.email}</p>
                {session.appAdmin.length > 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    App-admin: {session.appAdmin.join(", ")}
                  </p>
                )}
                {!isImpersonating && (
                  <button
                    onClick={() => authService.signOut()}
                    className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-foreground hover:bg-surface2"
                  >
                    <LogOut className="size-3.5" />
                    Sign out
                  </button>
                )}
              </>
            ) : (
              <p className="py-1 text-sm text-muted-foreground">Signed out. Pick a persona below.</p>
            )}
          </div>

          {/* Persona list — the only scrolling region; subtle themed scrollbar */}
          <div className="scrollbar-subtle min-h-0 max-h-72 flex-1 overflow-y-auto px-2 py-2">
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Switch to persona
            </p>
            {switchError && (
              <p className="mx-2 mb-1.5 flex items-center gap-1 rounded-md bg-signal-red/10 px-2 py-1 text-[11px] text-signal-red">
                <ShieldAlert className="size-3" />
                {switchError}
              </p>
            )}
            <ul className="space-y-1">
              {personas.map((p) => {
                const active = session?.email?.toLowerCase() === p.email.toLowerCase()
                const disabled = p.status === "disabled"
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => !disabled && handleSwitch(p.id)}
                      disabled={disabled}
                      aria-disabled={disabled}
                      title={
                        disabled
                          ? "Disabled personas are not mintable — cannot impersonate"
                          : undefined
                      }
                      className={cn(
                        "w-full rounded-lg border px-2.5 py-2 text-left transition-colors",
                        disabled
                          ? "cursor-not-allowed border-transparent opacity-60"
                          : active
                            ? "border-primary bg-primary/10"
                            : "border-transparent hover:border-border hover:bg-surface2",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "truncate text-sm font-medium",
                            disabled ? "text-muted-foreground" : "text-foreground",
                          )}
                        >
                          {p.label}
                        </span>
                        {active && !disabled && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                            <Eye className="size-2.5" />
                            current
                          </span>
                        )}
                        {disabled && (
                          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-signal-red/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-signal-red">
                            <Ban className="size-2.5" />
                            disabled
                          </span>
                        )}
                        {p.siteAdmin && !disabled && (
                          <ShieldCheck className="ml-auto size-3 text-primary" />
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{p.blurb}</p>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold shadow-lg",
            isImpersonating
              ? "border-signal-amber/50 bg-signal-amber/15 text-foreground hover:bg-signal-amber/25"
              : "border-border bg-surface text-foreground hover:bg-surface2",
          )}
        >
          {isImpersonating ? (
            <Eye className="size-4 text-signal-amber" />
          ) : (
            <UserCog className="size-4 text-primary" />
          )}
          {isImpersonating
            ? `Viewing as ${session?.label}`
            : session
              ? session.label
              : "Signed out"}
        </button>
      )}
    </div>
  )
}
