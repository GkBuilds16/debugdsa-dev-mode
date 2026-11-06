import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CandidateWorkspace from './CandidateWorkspace.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = data => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });
const challenge = { _id: 'challenge-1', title: 'Cache repair', description: 'Fix the stale cache', detailedDescription: 'A public project', state: 'PUBLISHED', difficulty: 'Medium', languages: ['JavaScript'], frameworks: ['React'], technologies: ['Node'], estimatedMinutes: 45, tags: ['cache'], bugTitle: 'Stale results', bugDescription: 'Results do not refresh.', expectedBehavior: 'Refresh promptly', actualBehavior: 'Remain stale', reproductionSteps: ['Open the list', 'Update one record'], relevantFiles: ['src/main.js'], publicHints: ['Check the invalidation branch'], acceptanceCriteria: ['Updated results appear'], prerequisites: ['JavaScript'], dependencies: ['react'], runtimeVersions: { node: '20' }, commands: { test: 'npm test' }, instructions: 'Install dependencies', files: [{ path: 'src/main.js', size: 24, contentType: 'text/plain' }], privateNotes: 'SECRET_INTERVIEW_NOTE', hiddenTests: [{ secret: true }] };

describe('CandidateWorkspace', () => {
  it('shows actual published challenge information, edits a private workspace, autosaves, and submits without evaluation', async () => {
    const calls = [];
    const fetchMock = vi.fn(async (url, options = {}) => {
      calls.push({ url: String(url), options });
      const path = String(url);
      if (path.includes('/progress')) return ok({ progress: {}, bookmarks: [] });
      if (path.startsWith('/api/v1/codebases?')) return ok([challenge]);
      if (path.endsWith('/codebases/challenge-1') && !path.includes('/workspace')) return ok(challenge);
      if (path.endsWith('/codebases/challenge-1/files')) return ok({ files: challenge.files, directories: ['src'] });
      if (path.endsWith('/codebases/challenge-1/workspace') && options.method === 'POST') return { ok: true, status: 201, json: async () => ({ success: true, data: { id: 'attempt-1', codebaseId: 'challenge-1', publishedVersion: 1, status: 'IN_PROGRESS', revision: 0, files: [{ path: 'src/main.js', size: 24, content: 'export const stale = true;' }] } }) };
      if (path.includes('/codebases/challenge-1/file?')) return ok({ path: 'src/main.js', size: 24, content: 'export const stale = true;' });
      if (path.includes('/workspace/attempt-1') && options.method === 'PATCH') return ok({ id: 'attempt-1', revision: 1, status: 'IN_PROGRESS', updatedAt: new Date().toISOString() });
      if (path.endsWith('/codebases/challenge-1/submissions')) return { ok: true, status: 201, json: async () => ({ success: true, data: { id: 'submission-1', attemptId: 'attempt-1', codebaseId: 'challenge-1', publishedVersion: 1, evaluationStatus: 'NOT_EVALUATED', createdAt: '2026-01-01T00:00:00Z', fileCount: 1 } }) };
      throw new Error(`Unexpected API call: ${options.method || 'GET'} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn(() => true));
    const user = userEvent.setup();
    render(<CandidateWorkspace onNotice={vi.fn()}/>);
    await user.click(await screen.findByRole('button', { name: 'Cache repair' }));
    expect(await screen.findByText('Results do not refresh.')).toBeTruthy();
    expect(screen.queryByText('SECRET_INTERVIEW_NOTE')).toBeNull();
    expect(screen.queryByText(/hiddenTests/i)).toBeNull();
    await user.click(screen.getByRole('button', { name: /Start debugging/i }));
    await user.click(await screen.findByRole('button', { name: 'main.js' }));
    const editor = await screen.findByRole('textbox', { name: 'Edit src/main.js' });
    await user.clear(editor);
    await user.type(editor, 'export const fixed = true;');
    await waitFor(() => expect(calls.some(call => call.options.method === 'PATCH' && call.url.includes('/workspace/attempt-1'))).toBe(true), { timeout: 4000 });
    await user.click(screen.getByRole('button', { name: /Review and submit/i }));
    await user.click(screen.getByRole('button', { name: /Submit snapshot/i }));
    expect(await screen.findByText('Submission saved')).toBeTruthy();
    expect(screen.getByText(/NOT_EVALUATED/)).toBeTruthy();
    const saveCall = calls.find(call => call.options.method === 'PATCH');
    expect(JSON.parse(saveCall.options.body).files[0].path).toBe('src/main.js');
    const submitCall = calls.find(call => call.url.endsWith('/submissions') && call.options.method === 'POST');
    expect(JSON.parse(submitCall.options.body).revision).toBe(1);
  });

  it('sends discovery filters to the real listing API and renders API errors', async () => {
    const fetchMock = vi.fn(async url => String(url).includes('/progress') ? ok({ progress: {}, bookmarks: [] }) : String(url).includes('difficulty=Hard') ? { ok: false, status: 503, json: async () => ({ error: { message: 'Discovery unavailable' } }) } : ok([]));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<CandidateWorkspace onNotice={vi.fn()}/>);
    await screen.findByText('No published challenges found');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter difficulty' }), 'Hard');
    expect(await screen.findByText('Discovery unavailable')).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('difficulty=Hard'))).toBe(true);
  });

  it('saves candidate changes, resets them to the published source, and reopens the recovered workspace', async () => {
    const originalText = 'export const stale = true;';
    const workspace = revision => ({ id: 'attempt-1', codebaseId: 'challenge-1', publishedVersion: 1, status: 'IN_PROGRESS', revision, files: [{ path: 'src/main.js', size: originalText.length, content: originalText }] });
    const calls = []; let currentWorkspace = workspace(0), reopenedRevision;
    const fetchMock = vi.fn(async (url, options = {}) => {
      const path = String(url); calls.push({ path, options });
      if (path.includes('/progress')) return ok({ progress: {}, bookmarks: [] });
      if (path.startsWith('/api/v1/codebases?')) return ok([challenge]);
      if (path.endsWith('/codebases/challenge-1') && !path.includes('/workspace')) return ok(challenge);
      if (path.endsWith('/codebases/challenge-1/files')) return ok({ files: challenge.files, directories: ['src'] });
      if (path.endsWith('/codebases/challenge-1/workspace') && options.method === 'POST') { if (calls.filter(call => call.options.method === 'POST' && call.path.endsWith('/workspace')).length > 1) reopenedRevision = currentWorkspace.revision; return { ok: true, status: 201, json: async () => ({ success: true, data: currentWorkspace }) }; }
      if (path.includes('/codebases/challenge-1/file?')) return ok({ path: 'src/main.js', content: originalText, size: originalText.length });
      if (path.includes('/workspace/attempt-1') && options.method === 'PATCH') { currentWorkspace = workspace(1); return ok({ id: 'attempt-1', revision: 1, status: 'IN_PROGRESS', updatedAt: new Date().toISOString() }); }
      if (path.endsWith('/workspace/attempt-1/reset')) { currentWorkspace = workspace(2); return ok(currentWorkspace); }
      if (path.endsWith('/codebases/challenge-1/workspace')) return ok(currentWorkspace);
      throw new Error(`Unexpected API call: ${options.method || 'GET'} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn(() => true));
    const user = userEvent.setup();
    render(<CandidateWorkspace onNotice={vi.fn()}/>);
    await user.click(await screen.findByRole('button', { name: 'Cache repair' }));
    await user.click(await screen.findByRole('button', { name: /Start debugging/i }));
    await user.click(await screen.findByRole('button', { name: 'main.js' }));
    const editor = await screen.findByRole('textbox', { name: 'Edit src/main.js' });
    await user.clear(editor); await user.type(editor, 'export const changed = true;');
    await waitFor(() => expect(calls.some(call => call.options.method === 'PATCH')).toBe(true), { timeout: 4000 });
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(calls.some(call => call.path.endsWith('/workspace/attempt-1/reset'))).toBe(true));
    await user.click(await screen.findByRole('button', { name: 'main.js' }));
    expect(await screen.findByRole('textbox', { name: 'Edit src/main.js' })).toHaveProperty('value', originalText);
    await user.click(screen.getByRole('button', { name: 'Challenge' }));
    await user.click(await screen.findByRole('button', { name: /Start debugging/i }));
    expect(await screen.findByRole('button', { name: 'main.js' })).toBeTruthy();
    expect(reopenedRevision).toBe(2);
  });
});
