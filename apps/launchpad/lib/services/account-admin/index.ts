import { controlPlaneUrl } from '@/lib/services/control-plane';

export interface AccountSummary {
  accountId: string;
  name: string;
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

export function createAccount(
  idToken: string,
  activeAccountId: string,
  name: string,
): Promise<{ account: AccountSummary }> {
  return request(idToken, activeAccountId, '/accounts', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
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
