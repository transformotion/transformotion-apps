import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type AnalysisMode = 'fast' | 'live';

const STORAGE_KEY = 'ssa_mode';

interface ModeState {
  mode: AnalysisMode;
  isLive: boolean;
  setMode: (m: AnalysisMode) => void;
  toggleMode: () => void;
}

const ModeContext = createContext<ModeState | null>(null);

/** Provides the global Fast/Live analysis mode toggle, persisted to localStorage. */
export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AnalysisMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'live' ? 'live' : 'fast';
  });

  // Keep localStorage in sync on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const setMode = useCallback((m: AnalysisMode) => {
    setModeState(m);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState(prev => prev === 'fast' ? 'live' : 'fast');
  }, []);

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
