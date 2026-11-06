import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Clock3, LoaderCircle, RefreshCw, Search, Send, Swords, Users, X } from 'lucide-react';
import { apiFetch } from '../../apiClient.js';

const request = async (path, options = {}) => {
  const response = await apiFetch(`/codebase-battles${path}`, options);
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error?.message || 'Battle request failed.');
  return body;
};
const mins = value => `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;

export default function BattlesPage({ onNotice, onDirtyChange }) {
  const [section, setSection] = useState('discover'), [status, setStatus] = useState('upcoming'), [difficulty, setDifficulty] = useState(''), [language, setLanguage] = useState(''), [query, setQuery] = useState(''), [page, setPage] = useState(1), [sort, setSort] = useState('soonest');
  const [battles, setBattles] = useState([]), [history, setHistory] = useState([]), [mine, setMine] = useState([]), [selected, setSelected] = useState(null), [workspace, setWorkspace] = useState(null), [submission, setSubmission] = useState(null), [participants, setParticipants] = useState([]), [organizerSubmission, setOrganizerSubmission] = useState(null), [pages, setPages] = useState(1);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saveState, setSaveState] = useState('saved'), [unsaved, setUnsaved] = useState(false), [submitting, setSubmitting] = useState(false), [now, setNow] = useState(Date.now()), [serverOffset, setServerOffset] = useState(0), [formOpen, setFormOpen] = useState(false), [codebases, setCodebases] = useState([]), [versions, setVersions] = useState([]), [editing, setEditing] = useState(null);
  const saveQueue = useRef(Promise.resolve()), workspaceRef = useRef(null), activeBattleRef = useRef(null), savedFiles = useRef({}), autosaveTimer = useRef(null);
  const [form, setForm] = useState({ title: '', description: '', instructions: '', rules: '', codebaseId: '', codebaseVersion: '', startsAt: '', registrationDeadline: '', durationMinutes: 60, capacity: 100, allowedLanguages: '', eligibleUserIds: '' });

  const loadDiscover = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '12', sort, status });
      if (query.trim()) params.set('q', query.trim()); if (difficulty) params.set('difficulty', difficulty); if (language.trim()) params.set('language', language.trim());
      const result = await request(`/?${params}`); setBattles(result.data || []); setPages(Math.max(1, result.pagination?.pages || 1));
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }, [page, status, query, difficulty, language, sort]);
  useEffect(() => { const timer = setTimeout(loadDiscover, query ? 250 : 0); return () => clearTimeout(timer); }, [loadDiscover]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!selected || !['detail', 'lobby'].includes(section)) return undefined; const timer = setInterval(() => openBattle(selected.id, section === 'lobby'), 5000); return () => clearInterval(timer); }, [selected?.id, section]);
  useEffect(() => { if (!selected || section !== 'workspace') return undefined; const timer = setInterval(async () => { try { const result = await request(`/${selected.id}`); setSelected(result.data); setServerOffset(new Date(result.data.serverTime).getTime() - Date.now()); } catch { /* REST retries on the next poll; save/submit remain server-checked. */ } }, 5000); return () => clearInterval(timer); }, [selected?.id, section]);
  useEffect(() => { activeBattleRef.current = selected; workspaceRef.current = workspace; }, [selected, workspace]);
  useEffect(() => { onDirtyChange?.(section === 'workspace' && unsaved); }, [section, unsaved, onDirtyChange]);
  useEffect(() => { if (!unsaved || section !== 'workspace') return undefined; const handler = event => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, [unsaved, section]);

  const loadHistory = async () => { try { const result = await request('/history'); setHistory(result.data || []); setSection('history'); } catch (err) { setError(err.message); } };
  const loadMine = async () => { try { const result = await request('/mine'); setMine(result.data || []); setSection('manage'); setError(''); } catch (err) { setError(err.message); } };
  const loadOrganizerOptions = async () => {
    try { const result = await apiFetch('/api/v1/creator/dashboard?status=PUBLISHED&limit=50'); const body = await result.json(); if (!result.ok) throw new Error(body?.error?.message || 'Could not load your published codebases.'); setCodebases(body.data || []); }
    catch (err) { setError(err.message); }
  };
  const openBattle = async (battleId, lobby = false) => {
    try { const result = await request(`/${battleId}${lobby ? '/lobby' : ''}`); setSelected(result.data); setServerOffset(new Date(result.data.serverTime).getTime() - Date.now()); setSection(lobby ? 'lobby' : 'detail'); setError(''); }
    catch (err) { setError(err.message); }
  };
  const actOnRegistration = async () => {
    if (!selected) return;
    try {
      const isRegistered = selected.registration?.status === 'REGISTERED';
      const result = await request(`/${selected.id}/register`, { method: isRegistered ? 'DELETE' : 'POST', body: isRegistered ? undefined : '{}' });
      setSelected(value => ({ ...value, registration: result.data })); await openBattle(selected.id, !isRegistered);
    } catch (err) { setError(err.message); }
  };
  const enterWorkspace = async () => {
    try { const result = await request(`/${selected.id}/workspace`, { method: 'POST', body: '{}' }); setWorkspace(result.data); workspaceRef.current = result.data; savedFiles.current = Object.fromEntries(result.data.files.map(file => [file.path, file.content])); setUnsaved(false); setSection('workspace'); setSaveState('saved'); }
    catch (err) { setError(err.message); }
  };
  const saveFiles = useCallback((files, resetPaths = []) => {
    const task = saveQueue.current.then(async () => {
      const battle = activeBattleRef.current, current = workspaceRef.current;
      if (!battle || !current) return;
      setSaveState('saving');
      const result = await request(`/${battle.id}/workspace/${current.id}`, { method: 'PATCH', body: JSON.stringify({ revision: current.revision, files, resetPaths }) });
      for (const file of files) savedFiles.current[file.path] = file.content;
      const base = new Map((current.challenge?.files || []).map(file => [file.path, file.content])); for (const path of resetPaths) savedFiles.current[path] = base.get(path);
      current.revision = result.data.revision; current.updatedAt = result.data.updatedAt; workspaceRef.current = current; setWorkspace({ ...current }); setSaveState('saved');
      const latest = workspaceRef.current; const differs = latest.files.some(file => file.content !== savedFiles.current[file.path]); setUnsaved(differs);
    });
    saveQueue.current = task.catch(err => { setSaveState(err.message.includes('changed in another session') ? 'conflict' : 'error'); setError(err.message); });
    return task;
  }, []);
  const flushWorkspace = async () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const current = workspaceRef.current;
      if (!current) return;
      const base = new Map((current.challenge?.files || []).map(file => [file.path, file.content]));
      const changed = current.files.filter(file => file.content !== savedFiles.current[file.path]);
      if (!changed.length) { await saveQueue.current; return; }
      const resetPaths = changed.filter(file => file.content === base.get(file.path)).map(file => file.path);
      const updates = changed.filter(file => file.content !== base.get(file.path)).map(({ path, content }) => ({ path, content }));
      await saveFiles(updates, resetPaths);
      await saveQueue.current;
    }
    throw new Error('Workspace is still changing. Wait for autosave and retry.');
  };
  const leaveWorkspace = async () => { try { await flushWorkspace(); setSection('lobby'); } catch (err) { setError(err.message); } };
  const changeFile = (path, content) => {
    const value = workspaceRef.current;
    const updated = { ...value, files: value.files.map(file => file.path === path ? { ...file, content } : file) };
    workspaceRef.current = updated; setWorkspace(updated); setUnsaved(true);
  };
  useEffect(() => {
    if (section !== 'workspace' || !workspace) return undefined;
    autosaveTimer.current = setTimeout(() => {
      const base = new Map((workspace.challenge?.files || []).map(file => [file.path, file.content]));
      const changed = workspace.files.filter(file => file.content !== savedFiles.current[file.path]);
      const resetPaths = changed.filter(file => file.content === base.get(file.path)).map(file => file.path);
      const updates = changed.filter(file => file.content !== base.get(file.path)).map(({ path, content }) => ({ path, content }));
      if (changed.length) saveFiles(updates, resetPaths).catch(() => {});
    }, 650);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [workspace?.files, section, saveFiles]);
  const reloadWorkspace = async () => { try { const result = await request(`/${selected.id}/workspace`); setWorkspace(result.data); workspaceRef.current = result.data; savedFiles.current = Object.fromEntries(result.data.files.map(file => [file.path, file.content])); setUnsaved(false); setSaveState('saved'); setError(''); } catch (err) { setError(err.message); } };
  const submitWorkspace = async () => {
    setSubmitting(true);
    try { await flushWorkspace(); const result = await request(`/${selected.id}/submit`, { method: 'POST', body: JSON.stringify({ workspaceId: workspaceRef.current.id }) }); setSubmission(result.data); setUnsaved(false); setSection('results'); }
    catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  const openCreate = async battle => {
    await loadOrganizerOptions(); setEditing(battle || null);
    if (battle) {
      try {
        const result = await apiFetch(`/api/v1/creator/codebases/${battle.codebaseId}/versions`), body = await result.json(); setVersions(body.data || []);
        setForm({ title: battle.title, description: battle.description || '', instructions: battle.instructions || '', rules: battle.rules || '', codebaseId: battle.codebaseId, codebaseVersion: String(battle.codebaseVersion), startsAt: new Date(battle.startsAt).toISOString().slice(0, 16), registrationDeadline: new Date(battle.registrationDeadline).toISOString().slice(0, 16), durationMinutes: battle.durationMinutes, capacity: battle.capacity, allowedLanguages: (battle.allowedLanguages || []).join(', '), eligibleUserIds: (battle.eligibleUserIds || []).join(', ') });
      } catch (err) { setError(err.message); }
    } else setForm({ title: '', description: '', instructions: '', rules: '', codebaseId: '', codebaseVersion: '', startsAt: '', registrationDeadline: '', durationMinutes: 60, capacity: 100, allowedLanguages: '', eligibleUserIds: '' });
    setFormOpen(true);
  };
  const onCodebaseChange = async id => {
    setForm(value => ({ ...value, codebaseId: id, codebaseVersion: '' })); setVersions([]);
    if (!id) return;
    try { const response = await apiFetch(`/api/v1/creator/codebases/${id}/versions`), body = await response.json(); if (!response.ok) throw new Error(body?.error?.message || 'Could not load published versions.'); setVersions(body.data || []); }
    catch (err) { setError(err.message); }
  };
  const saveBattle = async event => {
    event.preventDefault(); setBusy(true);
    const body = { ...form, startsAt: new Date(form.startsAt).toISOString(), registrationDeadline: new Date(form.registrationDeadline).toISOString(), allowedLanguages: form.allowedLanguages.split(',').map(value => value.trim()).filter(Boolean), eligibleUserIds: form.eligibleUserIds.split(',').map(value => value.trim()).filter(Boolean) };
    try {
      let result;
      if (editing) result = await request(`/manage/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else result = await request('/', { method: 'POST', body: JSON.stringify(body) });
      const draft = result.data;
      if (draft.status === 'DRAFT') await request(`/manage/${draft.id}/publish`, { method: 'POST', body: '{}' });
      setFormOpen(false); await loadMine();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const manageAction = async (battle, action) => {
    try { await request(`/manage/${battle.id}/${action}`, { method: 'POST', body: '{}' }); await loadMine(); }
    catch (err) { setError(err.message); }
  };
  const openParticipants = async battle => {
    try { const [people, submissions] = await Promise.all([request(`/manage/${battle.id}/participants`), request(`/manage/${battle.id}/submissions`).catch(() => ({ data: [] }))]); setParticipants(people.data || []); setOrganizerSubmission(null); setSelected({ ...battle, organizerSubmissions: submissions.data || [] }); setSection('participants'); }
    catch (err) { setError(err.message); }
  };
  const openOrganizerSubmission = async row => { try { const result = await request(`/manage/${selected.id}/submissions/${row.id}`); setOrganizerSubmission(result.data); } catch (err) { setError(err.message); } };
  const remaining = selected?.endsAt ? Math.max(0, Math.floor((new Date(selected.endsAt).getTime() - (now + serverOffset)) / 1000)) : 0;

  return <section className="battle-module">
    <header className="battle-header"><div><div className="eyebrow">COMPETITIVE DEBUGGING</div><h1>{section === 'workspace' ? selected?.title : section === 'manage' ? 'Manage battles' : section === 'history' ? 'Battle history' : section === 'participants' ? 'Battle participants' : section === 'results' ? 'Battle results' : 'Codebase battles'}</h1><p>{section === 'workspace' ? 'Your isolated workspace is saved privately to your registration.' : 'Compete on a published challenge version. The server controls registration and battle timing.'}</p></div><div className="battle-actions"><button className="small-quiet" onClick={loadHistory}>History</button><button className="small-quiet" onClick={loadMine}>Organizer</button>{section === 'manage' && <button className="small-primary" onClick={() => openCreate()}>Create battle</button>}</div></header>
    {error && <div className="candidate-alert" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
    {section === 'discover' && <><div className="battle-filters"><label><Search size={14}/><input aria-label="Search battles" placeholder="Search battles" value={query} onChange={event => { setPage(1); setQuery(event.target.value); }}/></label><select aria-label="Battle status" value={status} onChange={event => { setPage(1); setStatus(event.target.value); }}><option value="upcoming">Upcoming</option><option value="live">Live</option><option value="completed">Completed</option></select><select aria-label="Battle difficulty" value={difficulty} onChange={event => { setPage(1); setDifficulty(event.target.value); }}><option value="">Any difficulty</option><option>Easy</option><option>Medium</option><option>Hard</option></select><input aria-label="Battle language" placeholder="Language" value={language} onChange={event => { setPage(1); setLanguage(event.target.value); }}/><select aria-label="Sort battles" value={sort} onChange={event => setSort(event.target.value)}><option value="soonest">Soonest</option><option value="newest">Recently added</option><option value="capacity">Capacity</option></select></div>
      {busy ? <div className="candidate-empty"><LoaderCircle className="spin"/>Loading battles…</div> : battles.length ? <div className="battle-grid">{battles.map(battle => <article className="battle-card battle-tile" key={battle.id}><div className="battle-symbol"><Swords/></div><div className="project-main"><div className="project-title">{battle.title}<span className={`badge ${battle.status.toLowerCase()}`}>{battle.status}</span></div><p>{battle.description || 'Competitive debugging challenge.'}</p><div className="meta"><span>Challenge: {battle.challengeTitle}</span><span>·</span><span>{battle.difficulty}</span><span>·</span><span>{(battle.languages || []).join(', ') || 'Any language'}</span></div><div className="meta"><span>{new Date(battle.startsAt).toLocaleString()}</span><span>·</span><span>{battle.durationMinutes} min</span><span>·</span><span><Users size={13}/> {battle.registrationCount}/{battle.capacity}</span></div><small>Registration closes {new Date(battle.registrationDeadline).toLocaleString()}</small></div><button className="small-primary" onClick={() => openBattle(battle.id)}>Details</button></article>)}</div> : <div className="candidate-empty"><Swords/><b>No eligible battles found</b><span>Try changing your filters or check back later.</span></div>}
      {pages > 1 && <div className="pagination"><span>Page {page} of {pages}</span><div><button className="small-quiet" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><button className="small-quiet" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>Next</button></div></div>}
    </>}
    {section === 'detail' && selected && <><button className="small-quiet" onClick={() => setSection('discover')}><ArrowLeft size={14}/> Battles</button><div className="battle-detail"><article><span className="badge">{selected.status}</span><h2>{selected.title}</h2><p>{selected.description}</p><div className="meta">Challenge: {selected.challenge?.title} · {selected.challenge?.difficulty} · v{selected.codebaseVersion}</div><p>Starts {new Date(selected.startsAt).toLocaleString()} · {selected.durationMinutes} minutes · Registration closes {new Date(selected.registrationDeadline).toLocaleString()}</p><p>Participants {selected.registrationCount}/{selected.capacity} · Languages {(selected.allowedLanguages || []).join(', ') || (selected.challenge?.languages || []).join(', ') || 'Any'}</p><h3>Challenge preview</h3><p>{selected.challenge?.bugDescription || selected.challenge?.problemStatement}</p><p>Evaluation is disabled. Submissions will not receive scores or rankings.</p></article><aside><h3>Registration</h3><p>{selected.registration?.status === 'REGISTERED' ? 'You are registered.' : selected.registration?.status === 'CANCELLED' ? 'Your registration was cancelled.' : 'Register before the deadline to enter the lobby.'}</p>{selected.status === 'SCHEDULED' && selected.registration?.status !== 'CANCELLED' && <button className="small-primary" onClick={actOnRegistration}>{selected.registration?.status === 'REGISTERED' ? 'Cancel registration' : 'Register'}</button>}<button className="small-quiet" onClick={() => openBattle(selected.id, true)}>Open lobby</button></aside></div></>}
    {section === 'lobby' && selected && <><button className="small-quiet" onClick={() => setSection('detail')}><ArrowLeft size={14}/> Details</button><div className="battle-lobby"><div className="eyebrow">SERVER STATUS · {selected.status}</div><h2>{selected.title}</h2><p>{selected.challenge?.bugDescription || selected.description}</p><div className="battle-countdown">{selected.status === 'LIVE' ? mins(remaining) : selected.status === 'COMPLETED' ? '00:00' : mins(Math.max(0, Math.floor((new Date(selected.startsAt).getTime() - now) / 1000)))}</div><span>{selected.status === 'LIVE' ? 'Time remaining' : selected.status === 'COMPLETED' ? 'Battle ended' : 'Time until start'} · {new Date(selected.startsAt).toLocaleString()}</span><p>{selected.instructions || 'Join the workspace when the server marks the battle live.'}</p><p>Allowed languages: {(selected.allowedLanguages || selected.challenge?.languages || []).join(', ') || 'Any'}</p>{selected.registration?.status !== 'REGISTERED' ? <button className="small-primary" onClick={actOnRegistration}>Register</button> : selected.status === 'LIVE' ? <button className="small-primary" onClick={enterWorkspace}>Enter battle workspace</button> : <button className="small-quiet" onClick={() => openBattle(selected.id, true)}><RefreshCw size={13}/> Refresh status</button>}</div></>}
    {section === 'workspace' && workspace && <div className="battle-workspace"><div className="battle-workbar"><button className="small-quiet" disabled={submitting} onClick={leaveWorkspace}><ArrowLeft size={13}/> Lobby</button><b>{selected.title} · v{selected.codebaseVersion}</b><span className={`candidate-save ${saveState}`}>{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState}</span><strong>{mins(remaining)}</strong><button className="small-primary" disabled={submitting || remaining <= 0 || selected.status !== 'LIVE' || workspace.status !== 'ACTIVE'} onClick={submitWorkspace}><Send size={13}/> {submitting ? 'Submitting…' : 'Submit'}</button></div>{(saveState === 'conflict' || saveState === 'error') && <div className="candidate-alert" role="alert">Workspace save failed. <button onClick={() => flushWorkspace().catch(err => setError(err.message))}>Retry save</button><button onClick={reloadWorkspace}>Reload latest</button></div>}{(selected.status !== 'LIVE' || workspace.status !== 'ACTIVE') && <div className="candidate-alert" role="status">This workspace is read-only because the battle has ended or your submission is final.</div>}<div className="battle-editor-layout"><nav aria-label="Battle files">{workspace.files.map(file => <button key={file.path} className="battle-file" onClick={() => setWorkspace(value => ({ ...value, activePath: file.path }))}>{file.path}</button>)}</nav><section><h3>{workspace.activePath || workspace.files[0]?.path || 'Project files'}</h3>{workspace.files.map(file => <div key={file.path} hidden={(workspace.activePath || workspace.files[0]?.path) !== file.path}><textarea aria-label={`Edit ${file.path}`} disabled={submitting || selected.status !== 'LIVE' || workspace.status !== 'ACTIVE' || remaining <= 0} value={file.content} onChange={event => changeFile(file.path, event.target.value)}/></div>)}{!workspace.files.length && <p>No project files are available.</p>}</section><aside><h3>Challenge</h3><p>{workspace.challenge?.bugDescription || workspace.challenge?.problemStatement}</p><h4>Expected behavior</h4><p>{workspace.challenge?.expectedBehavior}</p><h4>Rules</h4><p>{selected.rules || 'Submit before time expires. Candidate code is not executed.'}</p></aside></div></div>}
    {section === 'results' && <div className="battle-lobby"><Check/>{submission ? <h2>Submission received</h2> : <h2>Battle complete</h2>}{submission ? <p>Submitted {submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : ''}. Status: {submission.evaluationStatus || 'NOT_EVALUATED'}.</p> : <p>No submission was recorded for your registration.</p>}<p>Evaluation is disabled. No scores or rankings are available.</p><button className="small-quiet" onClick={loadHistory}>View battle history</button></div>}
    {section === 'history' && <div className="battle-grid">{history.length ? history.map(item => <article className="battle-card battle-tile" key={item.registration.id}><div className="project-main"><b>{item.battle.title}</b><p>{new Date(item.battle.startsAt).toLocaleString()} · {item.battle.durationMinutes} minutes</p><small>Registration: {item.registration.status} · Submission: {item.submission?.evaluationStatus || 'NOT SUBMITTED'}</small></div>{item.submission && <button className="small-quiet" onClick={async () => { const result = await request(`/submissions/${item.submission.id}`); setOrganizerSubmission(result.data); setSection('my-submission'); }}>View my snapshot</button>}<button className="small-quiet" onClick={() => request(`/${item.battle.id}/results`).then(result => { setSubmission(result.data.submission); setSection('results'); }).catch(err => setError(err.message))}>Results</button></article>) : <div className="candidate-empty"><b>No battle history yet</b></div>}</div>}
    {section === 'my-submission' && organizerSubmission && <div className="battle-lobby"><button className="small-quiet" onClick={loadHistory}>Back to history</button><h2>My submitted snapshot</h2><p>{organizerSubmission.evaluationStatus} · {new Date(organizerSubmission.submittedAt).toLocaleString()}</p>{organizerSubmission.files?.map(file => <details key={file.path}><summary>{file.path}</summary><pre>{file.content}</pre></details>)}</div>}
    {section === 'manage' && <div className="battle-grid">{mine.map(battle => <article className="battle-card battle-tile" key={battle.id}><div className="project-main"><div className="project-title">{battle.title}<span className="badge">{battle.status}</span></div><p>{new Date(battle.startsAt).toLocaleString()} · {battle.durationMinutes} min · {battle.registrationCount}/{battle.capacity}</p><small>Published challenge version {battle.codebaseVersion}</small></div>{['DRAFT', 'SCHEDULED', 'REGISTRATION_CLOSED'].includes(battle.status) && <button className="small-quiet" onClick={() => openCreate(battle)}>Edit</button>}<button className="small-quiet" onClick={() => openParticipants(battle)}>Participants</button>{battle.status !== 'CANCELLED' && !['COMPLETED', 'LIVE'].includes(battle.status) && <button className="small-quiet" onClick={() => { if (window.confirm('Cancel this battle? Registered candidates will no longer be able to enter.')) manageAction(battle, 'cancel'); }}>Cancel</button>}{battle.status === 'COMPLETED' && <button className="small-quiet" onClick={() => manageAction(battle, 'results/publish')}>Publish results</button>}</article>)}</div>}
    {section === 'participants' && selected && <><button className="small-quiet" onClick={loadMine}><ArrowLeft size={14}/> Manage battles</button><h2>{selected.title}</h2><div className="battle-grid">{participants.map(person => <article className="battle-card battle-tile" key={person.registrationId}><div className="project-main"><b>Candidate {person.candidateId}</b><small>Registered {new Date(person.registeredAt).toLocaleString()}</small><small>{person.submission?.evaluationStatus || 'No submission'}</small></div></article>)}</div><h3>Submissions</h3>{(selected.organizerSubmissions || []).map(row => <article className="battle-card battle-tile" key={row.id}><span>Candidate {row.candidateId} · {row.evaluationStatus}</span><button className="small-quiet" onClick={() => openOrganizerSubmission(row)}>View snapshot</button></article>)}{organizerSubmission && <div className="battle-lobby"><button className="small-quiet" onClick={() => setOrganizerSubmission(null)}>Close snapshot</button><h3>Candidate {organizerSubmission.candidateId} · {organizerSubmission.evaluationStatus}</h3>{organizerSubmission.files?.map(file => <details key={file.path}><summary>{file.path}</summary><pre>{file.content}</pre></details>)}</div>}</>}
    {formOpen && <div className="detail-backdrop"><form className="detail-dialog battle-form" onSubmit={saveBattle}><div className="detail-top"><span className="eyebrow">BATTLE CONFIGURATION</span><button type="button" className="small-quiet" onClick={() => setFormOpen(false)}><X size={14}/> Close</button></div><h2>{editing ? 'Edit battle' : 'Create battle'}</h2><label>Battle title<input required maxLength="100" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })}/></label><label>Description<textarea maxLength="2000" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })}/></label><label>Published codebase<select required value={form.codebaseId} onChange={event => onCodebaseChange(event.target.value)}><option value="">Choose a codebase</option>{codebases.map(item => <option key={item._id} value={item._id}>{item.title}</option>)}</select></label><label>Published version<select required value={form.codebaseVersion} onChange={event => setForm({ ...form, codebaseVersion: event.target.value })}><option value="">Choose a version</option>{versions.map(item => <option key={item.version} value={item.version}>Version {item.version}</option>)}</select></label><div className="battle-form-grid"><label>Starts at (local time)<input type="datetime-local" required value={form.startsAt} onChange={event => setForm({ ...form, startsAt: event.target.value })}/></label><label>Registration deadline<input type="datetime-local" required value={form.registrationDeadline} onChange={event => setForm({ ...form, registrationDeadline: event.target.value })}/></label><label>Duration in minutes<input type="number" min="5" max="360" required value={form.durationMinutes} onChange={event => setForm({ ...form, durationMinutes: event.target.value })}/></label><label>Maximum participants<input type="number" min="2" max="10000" required value={form.capacity} onChange={event => setForm({ ...form, capacity: event.target.value })}/></label></div><label>Allowed languages (comma separated)<input value={form.allowedLanguages} onChange={event => setForm({ ...form, allowedLanguages: event.target.value })}/></label><label>Eligible candidate IDs (optional, comma separated)<input value={form.eligibleUserIds} onChange={event => setForm({ ...form, eligibleUserIds: event.target.value })}/></label><label>Instructions<textarea value={form.instructions} onChange={event => setForm({ ...form, instructions: event.target.value })}/></label><label>Rules<textarea value={form.rules} onChange={event => setForm({ ...form, rules: event.target.value })}/></label><button className="small-primary" disabled={busy}><Check size={14}/> Save and publish</button></form></div>}
  </section>;
}
