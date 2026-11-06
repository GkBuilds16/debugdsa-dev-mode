import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './apiClient.js';

const originalAuth = window.DebugDSAAuth;
afterEach(() => { vi.unstubAllGlobals(); if (originalAuth === undefined) delete window.DebugDSAAuth; else window.DebugDSAAuth = originalAuth; });

describe('apiFetch', () => {
  it('attaches a platform supplied bearer token without storing authentication state', async () => {
    window.DebugDSAAuth = { getAccessToken: async () => 'session-token' };
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/progress');
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.get('Authorization')).toBe('Bearer session-token');
    expect(options.credentials).toBe('same-origin');
  });
});
