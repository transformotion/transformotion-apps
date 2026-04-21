import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useApiClient } from '../hooks/useApiClient';

export type AnalysisMode = 'fast' | 'live';

interface ModeState {
  mode: AnalysisMode;
  isLive: boolean;
  setMode: (m: AnalysisMode) => void;
  toggleMode: () => void;
}

const ModeContext = createContext<ModeState | null>(null);

/**
 * Provides the global Fast/Live analysis mode toggle.
 *
 * Persistence: reads preferences.defaultMode from GET /api/user/profile on
 * login, and fire-and-forgets PUT /api/user/preferences on every change.
 * Defaults to 'fast' until the profile loads.
 */
export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AnalysisMode>('fast');
  const { user }             = useAuth();
  const api                  = useApiClient();

  // Load saved preference once the user is authenticated
  useEffect(() => {
    if (!user?.userId) return;
    api.getUserProfile()
      .then(profile => {
        if (profile.preferences.defaultMode) {
          setModeState(profile.preferences.defaultMode);
        }
      })
      .catch(() => { /* silently keep 'fast' default */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId]);

  const setMode = useCallback((m: AnalysisMode) => {
    setModeState(m);
    if (user?.userId) {
      void api.putUserPreferences({ defaultMode: m }).catch(() => {});
    }
  }, [api, user?.userId]);

  const toggleMode = useCallback(() => {
    setModeState(prev => {
      const next = prev === 'fast' ? 'live' : 'fast';
      if (user?.userId) {
        void api.putUserPreferences({ defaultMode: next }).catch(() => {});
      }
      return next;
    });
  }, [api, user?.userId]);

  return (
    <ModeContext.Provider value={{ mode, isLive: mode === 'live', setMode, toggleMode }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode(): ModeState {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error('useMode must be used inside <ModeProvider>');
  return ctx;
}
