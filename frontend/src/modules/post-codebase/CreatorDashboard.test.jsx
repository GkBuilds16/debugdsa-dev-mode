import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreatorDashboard from './CreatorDashboard.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const response = (payload, status = 200) => ({ ok: status < 400, status, json: async () => payload });

describe('CreatorDashboard', () => {
  it('loads creator-owned summary and filters rows via dashboard query', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ success: true, data: [{ _id: 'a', title: 'Inventory repair', description: 'Fix the sync', state: 'DRAFT', difficulty: 'Medium', languages: ['JavaScript'], updatedAt: '2026-01-01' }], metrics: { total: 1, drafts: 1, published: 0, archived: 0 }, pagination: { pages: 1 } }))
      .mockResolvedValueOnce(response({ success: true, data: [], metrics: { total: 1, drafts: 1, published: 0, archived: 0 }, pagination: { pages: 1 } }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<CreatorDashboard onCreate={vi.fn()} onEdit={vi.fn()} onNotice={vi.fn()} />);
    expect((await screen.findAllByText('Inventory repair')).length).toBeGreaterThan(0);
    await user.selectOptions(screen.getByDisplayValue('All statuses'), 'DRAFT');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toContain('status=DRAFT');
  });
});
