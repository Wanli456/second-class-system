type StoredUser = { sessionToken?: unknown };

function readStoredSessionToken(user: StoredUser): string | null {
  return typeof user.sessionToken === 'string' && user.sessionToken.trim()
    ? user.sessionToken
    : null;
}

export function removeSessionToken<T extends Record<string, unknown>>(user: T): Omit<T, 'sessionToken'> {
  const { sessionToken: _sessionToken, ...safeUser } = user;
  return safeUser;
}

export async function logoutCurrentUser() {
  try {
    await fetch('/api/auth', { method: 'DELETE', credentials: 'include' });
  } catch (error) {
    console.warn('服务端退出登录请求失败，已清理本地会话:', error);
  } finally {
    window.localStorage.removeItem('user');
  }
}

export async function refreshCurrentUser<T extends object = Record<string, unknown>>() {
  if (typeof window === 'undefined') return null;

  let savedUser: Record<string, unknown>;
  let sessionToken: string | null;
  try {
    const saved = window.localStorage.getItem('user');
    if (!saved) return null;
    const parsedUser = JSON.parse(saved) as Record<string, unknown>;
    savedUser = parsedUser;
    sessionToken = readStoredSessionToken(parsedUser);
  } catch {
    window.localStorage.removeItem('user');
    return null;
  }

  try {
    // Releases before the cookie session used this bearer token.  Send it only
    // to the first-party identity endpoint so a still-valid signed session can
    // be exchanged for the HttpOnly cookie, then discard it below.
    const response = await apiFetch('/api/auth?me=true', sessionToken
      ? { headers: { Authorization: `Bearer ${sessionToken}` } }
      : undefined);
    const result = await response.json();
    if (response.ok && result.success && result.data) {
      const currentUser = removeSessionToken({ ...savedUser, ...result.data });
      window.localStorage.setItem('user', JSON.stringify(currentUser));
      return currentUser as T;
    }

    // A deployment can invalidate tokens signed with an older session secret.
    // Do not let stale cached permissions masquerade as a live session.
    if (response.status === 401) {
      window.localStorage.removeItem('user');
      return null;
    }
  } catch {
    // Keep the cached user available while a transient request fails.
  }

  return removeSessionToken(savedUser) as T;
}

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  return fetch(input, { ...init, headers, credentials: init.credentials ?? 'include' });
}
