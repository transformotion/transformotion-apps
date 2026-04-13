import { useEffect, useState } from 'react';
import { useApiClient } from '../hooks/useApiClient';
import { useAuth } from '../contexts/AuthContext';
import type { PortfolioHolding, WatchlistItem } from '@transformotion/api-client';

// localStorage keys used by the old stock-signal-analyser.html app
const LS_PORTFOLIO = 'ssa_portfolio_v1';
const LS_WATCHLIST = 'ssa_watchlist_v1';

type MigrationState = 'idle' | 'migrating' | 'done' | 'error';

/**
 * MigrationBanner — detects old localStorage data from the HTML app and offers
 * to migrate it to the cloud API.
 *
 * Shown only when:
 *   1. The user is authenticated and has an active account (first-login complete)
 *   2. Old portfolio or watchlist data exists in localStorage
 *
 * On confirmation, calls PUT /portfolio and PUT /watchlist, then removes the
 * old localStorage keys so the banner doesn't reappear.
 */
export function MigrationBanner() {
  const { user } = useAuth();
  const api = useApiClient();

  const [hasOldData,    setHasOldData]    = useState(false);
  const [migrationState, setMigrationState] = useState<MigrationState>('idle');
  const [errorMsg,      setErrorMsg]      = useState<string | null>(null);

  useEffect(() => {
    if (!user?.activeAccountId) return;

    const hasPortfolio = !!localStorage.getItem(LS_PORTFOLIO);
    const hasWatchlist = !!localStorage.getItem(LS_WATCHLIST);
    setHasOldData(hasPortfolio || hasWatchlist);
  }, [user?.activeAccountId]);

  if (!hasOldData || !user?.activeAccountId) return null;
  if (migrationState === 'done') return null;

  async function handleMigrate() {
    setMigrationState('migrating');
    setErrorMsg(null);

    try {
      // ── Portfolio ─────────────────────────────────────────────────────────
      const rawPortfolio = localStorage.getItem(LS_PORTFOLIO);
      if (rawPortfolio) {
        const holdings = JSON.parse(rawPortfolio) as PortfolioHolding[];
        await api.putPortfolio({ holdings });
        localStorage.removeItem(LS_PORTFOLIO);
      }

      // ── Watchlist ─────────────────────────────────────────────────────────
      const rawWatchlist = localStorage.getItem(LS_WATCHLIST);
      if (rawWatchlist) {
        const items = JSON.parse(rawWatchlist) as WatchlistItem[];
        await api.putWatchlist({ items });
        localStorage.removeItem(LS_WATCHLIST);
      }

      setMigrationState('done');
      setHasOldData(false);
    } catch (err) {
      setMigrationState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Migration failed');
    }
  }

  function handleDismiss() {
    // Remove old keys without migrating — user chose not to keep the data
    localStorage.removeItem(LS_PORTFOLIO);
    localStorage.removeItem(LS_WATCHLIST);
    setHasOldData(false);
  }

  return (
    <div style={{
      position:        'fixed',
      bottom:          '1.5rem',
      left:            '50%',
      transform:       'translateX(-50%)',
      zIndex:          1000,
      background:      '#1e3a5f',
      border:          '1px solid #4d9fff',
      borderRadius:    '8px',
      padding:         '1rem 1.5rem',
      maxWidth:        '480px',
      width:           'calc(100% - 3rem)',
      color:           '#e2e8f0',
      boxShadow:       '0 4px 24px rgba(0,0,0,0.5)',
    }}>
      <p style={{ margin: '0 0 0.75rem', fontWeight: 600 }}>
        Import your saved data
      </p>
      <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#94a3b8' }}>
        We found a portfolio and/or watchlist saved locally from the previous app.
        Import it to your cloud account now?
      </p>

      {migrationState === 'error' && (
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', color: '#f87171' }}>
          {errorMsg}
        </p>
      )}

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          onClick={handleMigrate}
          disabled={migrationState === 'migrating'}
          style={{
            flex:          1,
            padding:       '0.5rem 1rem',
            background:    '#4d9fff',
            color:         '#fff',
            border:        'none',
            borderRadius:  '6px',
            cursor:        migrationState === 'migrating' ? 'not-allowed' : 'pointer',
            fontWeight:    600,
            opacity:       migrationState === 'migrating' ? 0.7 : 1,
          }}
        >
          {migrationState === 'migrating' ? 'Importing...' : 'Import'}
        </button>
        <button
          onClick={handleDismiss}
          disabled={migrationState === 'migrating'}
          style={{
            padding:      '0.5rem 1rem',
            background:   'transparent',
            color:        '#94a3b8',
            border:       '1px solid #475569',
            borderRadius: '6px',
            cursor:       migrationState === 'migrating' ? 'not-allowed' : 'pointer',
          }}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
