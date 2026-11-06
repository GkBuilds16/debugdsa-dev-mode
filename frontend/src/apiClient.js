export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && options.body !== null && !isForm && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const auth = window.DebugDSAAuth;
  const token = typeof auth?.getAccessToken === 'function' ? await auth.getAccessToken() : window.__DEBUGDSA_ACCESS_TOKEN__;
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`/api/v1${path}`, { credentials: 'same-origin', ...options, headers });
}
