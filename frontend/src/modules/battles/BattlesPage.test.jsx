import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BattlesPage from './BattlesPage.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const battle = { id: 'battle-1', title: 'Cache sprint', description: 'Repair a stale cache', startsAt: new Date(Date.now() + 120000).toISOString(), registrationDeadline: new Date(Date.now() + 60000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), durationMinutes: 60, capacity: 12, registrationCount: 4, status: 'SCHEDULED', difficulty: 'Medium', languages: ['JavaScript'], codebaseVersion: 2, allowedLanguages: ['JavaScript'], challenge: { title: 'Cache repair', difficulty: 'Medium', bugDescription: 'Stale result handling' }, registration: null };
const ok = data => ({ ok: true, status: 200, json: async () => ({ success: true, data, pagination: { page: 1, pages: 1 } }) });

describe('BattlesPage', () => {
  it('filters discovery, opens a lobby, registers, and displays server-provided battle state', async () => {
    const calls = []; let registration = null;
    const fetchMock = vi.fn(async (url, options = {}) => {
      const path = String(url); calls.push({ path, options });
      if (path.includes('/codebase-battles/?')) return ok([battle]);
      if (path.endsWith('/battle-1/register') && options.method === 'POST') { registration = { id: 'registration-1', battleId: 'battle-1', status: 'REGISTERED' }; return ok(registration); }
      if (path.endsWith('/battle-1/lobby')) return ok({ ...battle, registration });
      if (path.endsWith('/battle-1')) return ok({ ...battle, registration });
      throw new Error(`Unexpected request ${options.method || 'GET'} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup(); render(<BattlesPage/>);
    await user.type(await screen.findByRole('textbox', { name: 'Search battles' }), 'Cache');
    await waitFor(() => expect(calls.some(call => call.path.includes('q=Cache'))).toBe(true));
    await user.click(await screen.findByRole('button', { name: 'Details' }));
    expect(await screen.findByText('Stale result handling')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Register' }));
    expect(await screen.findByText(/server status/i)).toBeTruthy();
    expect(screen.getByText(/Time until start/)).toBeTruthy();
    expect(calls.some(call => call.options.method === 'POST' && call.path.endsWith('/register'))).toBe(true);
    expect(calls.some(call => call.path.endsWith('/lobby'))).toBe(true);
  });

  it('renders discovery API errors and provides a working retry action', async () => {
    let fail = true;
    const fetchMock = vi.fn(async url => {
      if (String(url).includes('/codebase-battles/')) return fail ? { ok: false, status: 503, json: async () => ({ error: { message: 'Battle service unavailable' } }) } : ok([]);
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup(); render(<BattlesPage/>);
    expect(await screen.findByText('Battle service unavailable')).toBeTruthy();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Battle status' }), 'live');
    expect(await screen.findByText('No eligible battles found')).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('status=live'))).toBe(true);
  });
});
