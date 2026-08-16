type StoredUser = { sessionToken?: unknown };

export async function refreshCurrentUser<T extends object = Record<string, unknown>>() {
  if (typeof window === 'undefined') return null;

  let savedUser: Record<string, unknown>;
  try {
    const saved = window.localStorage.getItem('user');
    if (!saved) return null;
    savedUser = JSON.parse(saved) as Record<string, unknown>;
  } catch {
    window.localStorage.removeItem('user');
    return null;
  }

  try {
    const response = await apiFetch('/api/auth?me=true');
    const result = await response.json();
    if (response.ok && result.success && result.data) {
      const currentUser = { ...savedUser, ...result.data };
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

function sessionToken() {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem('user');
    if (!stored) return null;
    const user = JSON.parse(stored) as StoredUser;
    return typeof user.sessionToken === 'string' && user.sessionToken ? user.sessionToken : null;
  } catch {
    return null;
  }
}

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = sessionToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(input, { ...init, headers, credentials: init.credentials ?? 'include' });
}
