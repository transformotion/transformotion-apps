import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useApiClient } from '../../hooks/useApiClient';

interface AccountOption {
  accountId: string;
  name: string;
}

/**
 * AccountSwitcher — header dropdown for switching the active account.
 *
 * Shown only when the user belongs to more than one account.
 * Fetches account names from GET /accounts/{id} for each ID in custom:accounts.
 * On selection, calls switchAccount() in AuthContext (POST /auth/switch + session refresh).
 */
export function AccountSwitcher() {
  const { user, switchAccount } = useAuth();
  const api = useApiClient();

  const [accounts,  setAccounts]  = useState<AccountOption[]>([]);
  const [open,      setOpen]      = useState(false);
  const [switching, setSwitching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch account names whenever the user's account list changes
  useEffect(() => {
    if (!user?.accountIds.length) return;

    async function fetchNames() {
      if (!user) return;
      const results = await Promise.allSettled(
        user.accountIds.map(id => api.getAccount(id)),
      );
      const options: AccountOption[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') {
          options.push({ accountId: r.value.account.accountId, name: r.value.account.name });
        }
      }
      setAccounts(options);
    }

    void fetchNames();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.accountIds.join(',')]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Only render when the user has more than one account
  if (!user?.activeAccountId || accounts.length <= 1) return null;

  const activeAccount = accounts.find(a => a.accountId === user.activeAccountId);

  async function handleSwitch(accountId: string) {
    if (accountId === user?.activeAccountId || switching) return;
    setSwitching(true);
    setOpen(false);
    try {
      await switchAccount(accountId);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={switching}
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          '0.375rem',
          padding:      '0.25rem 0.625rem',
          background:   'rgba(77,159,255,0.12)',
          border:       '1px solid rgba(77,159,255,0.3)',
          borderRadius: '6px',
          color:        '#94a3b8',
          fontSize:     '0.75rem',
          cursor:       switching ? 'not-allowed' : 'pointer',
          whiteSpace:   'nowrap',
          maxWidth:     '140px',
          overflow:     'hidden',
          textOverflow: 'ellipsis',
        }}
        title={activeAccount?.name}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {switching ? 'Switching…' : (activeAccount?.name ?? 'Account')}
        </span>
        <span style={{ flexShrink: 0, opacity: 0.6 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position:     'absolute',
          top:          'calc(100% + 0.375rem)',
          right:        0,
          minWidth:     '180px',
          background:   '#0d1b2a',
          border:       '1px solid #1e3a5f',
          borderRadius: '8px',
          boxShadow:    '0 8px 24px rgba(0,0,0,0.5)',
          overflow:     'hidden',
          zIndex:       100,
        }}>
          {accounts.map(a => (
            <button
              key={a.accountId}
              onClick={() => handleSwitch(a.accountId)}
              style={{
                display:    'block',
                width:      '100%',
                padding:    '0.625rem 1rem',
                textAlign:  'left',
                background: a.accountId === user.activeAccountId ? 'rgba(77,159,255,0.12)' : 'transparent',
                border:     'none',
                color:      a.accountId === user.activeAccountId ? '#4d9fff' : '#94a3b8',
                fontSize:   '0.875rem',
                cursor:     a.accountId === user.activeAccountId ? 'default' : 'pointer',
                whiteSpace: 'nowrap',
                overflow:   'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {a.name}
              {a.accountId === user.activeAccountId && (
                <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', opacity: 0.6 }}>✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
