import { controlPlaneUrl } from '@/lib/services/control-plane';

export interface AccountSummary {
  accountId: string;
  name: string;
  appSlug?: string;
  ownerId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AccountMember {
  userId: string;
  email?: string;
  role: string;
  joinedAt: string;
}

function authHeaders(idToken: string, accountId: string): HeadersInit {
  return {
    Authorization: `Bearer ${idToken}`,
    'Content-Type': 'application/json',
    'X-Account-Id': accountId,
  };
}

async function request<T>(
  idToken: string,
  activeAccountId: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(controlPlaneUrl(path), {
    ...init,
    headers: {
      ...authHeaders(idToken, activeAccountId),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

/**
 * M11 A4 / m16.6.0 — create the caller's first account in `appSlug`. POST /accounts
 * is `withAuthOnly` (no account context), so it carries NO `X-Account-Id`; the
 * target app travels in the body. Authorization is the caller's `{appSlug}-app-access`
 * group (the access group authorizes; the body only says which app).
 */
export async function createAccount(
  idToken: string,
  appSlug: string,
  name: string,
): Promise<{ account: AccountSummary }> {
  const response = await fetch(controlPlaneUrl('/accounts'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, appSlug }),
  });
  if (!response.ok) {
    throw new Error(`POST /accounts failed: ${response.status}`);
  }
  return response.json() as Promise<{ account: AccountSummary }>;
}

export function getAccount(
  idToken: string,
  activeAccountId: string,
  accountId: string,
): Promise<{ account: AccountSummary; members: AccountMember[] }> {
  return request(idToken, activeAccountId, `/accounts/${encodeURIComponent(accountId)}`);
}

export function updateAccount(
  idToken: string,
  activeAccountId: string,
  accountId: string,
  name: string,
): Promise<{ account: AccountSummary }> {
  return request(idToken, activeAccountId, `/accounts/${encodeURIComponent(accountId)}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

export function deleteAccount(
  idToken: string,
  activeAccountId: string,
  accountId: string,
): Promise<void> {
  return request(idToken, activeAccountId, `/accounts/${encodeURIComponent(accountId)}`, {
    method: 'DELETE',
  });
}

export function listMembers(
  idToken: string,
  activeAccountId: string,
  accountId: string,
): Promise<{ members: AccountMember[] }> {
  return request(idToken, activeAccountId, `/accounts/${encodeURIComponent(accountId)}/members`);
}

export function removeMember(
  idToken: string,
  activeAccountId: string,
  accountId: string,
  userId: string,
): Promise<void> {
  return request(
    idToken,
    activeAccountId,
    `/accounts/${encodeURIComponent(accountId)}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
}

export function createInvitation(
  idToken: string,
  activeAccountId: string,
  accountId: string,
  email: string,
): Promise<{ invitationId: string }> {
  return request(
    idToken,
    activeAccountId,
    `/accounts/${encodeURIComponent(accountId)}/invitations`,
    {
      method: 'POST',
      body: JSON.stringify({ email }),
    },
  );
}
