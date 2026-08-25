type StoredUser = { sessionToken?: unknown };

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
  try {
    const saved = window.localStorage.getItem('user');
    if (!saved) return null;
    savedUser = removeSessionToken(JSON.parse(saved) as Record<string, unknown>);
    window.localStorage.setItem('user', JSON.stringify(savedUser));
  } catch {
    window.localStorage.removeItem('user');
    return null;
  }

  try {
    const response = await apiFetch('/api/auth?me=true');
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

  return savedUser as T;
}

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  return fetch(input, { ...init, headers, credentials: init.credentials ?? 'include' });
}
