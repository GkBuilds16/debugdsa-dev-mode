import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, Check, ChevronDown, ChevronRight, Clock3, Code2, FileCode2, History, LoaderCircle, Play, RotateCcw, Search, Send, X } from 'lucide-react';
import { apiFetch } from '../../apiClient.js';

const api = async (path, options = {}) => {
  const response = await apiFetch(path, options);
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error?.message || 'Request failed');
  return body;
};

function TreeBranch({ label, children, onSelect, selected, depth = 0 }) {
  const [expanded, setExpanded] = useState(true);
  return <div className="candidate-tree-branch"><button className="candidate-tree-folder" style={{ paddingLeft: 9 + depth * 12 }} onClick={() => setExpanded(value => !value)}>{expanded ? <ChevronDown size={13}/> : <ChevronRight size={13}/>} {label}</button>{expanded && children.map(child => child.type === 'folder' ? <TreeBranch key={child.path} label={child.name} depth={depth + 1} children={child.children} onSelect={onSelect} selected={selected}/> : <button key={child.path} className={`candidate-tree-file ${selected === child.path ? 'active' : ''}`} style={{ paddingLeft: 24 + depth * 12 }} onClick={() => onSelect(child.path)} title={child.path}><FileCode2 size={13}/><span>{child.name}</span></button>)}</div>;
}

function makeTree(files, directories = []) {
  const root = { name: 'project', path: '', type: 'folder', children: [] };
  for (const directory of directories) {
    let parent = root;
    directory.split('/').forEach((part, index, parts) => {
      let item = parent.children.find(child => child.name === part);
      if (!item) { item = { name: part, path: parts.slice(0,index + 1).join('/'), type: 'folder', children: [] }; parent.children.push(item); }
      parent = item;
    });
  }
  for (const file of files) {
    let parent = root;
    const parts = file.path.split('/');
    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      let item = parent.children.find(child => child.name === part);
      if (!item) { item = { name: part, path: parts.slice(0, index + 1).join('/'), type: isFile ? 'file' : 'folder', children: [] }; parent.children.push(item); }
      if (!isFile) parent = item;
    });
  }
  const sort = items => items.sort((a,b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1).forEach(item => item.children?.length && sort(item.children));
  sort(root.children); return root.children;
}

const bytesLabel = bytes => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

export default function CandidateWorkspace({ onNotice, onDirtyChange }) {
  const [screen, setScreen] = useState('discover');
  const [rows, setRows] = useState([]), [page, setPage] = useState(1), [pages, setPages] = useState(1), [progress, setProgress] = useState({}), [progressAvailable, setProgressAvailable] = useState(false), [bookmarks, setBookmarks] = useState([]);
  const [query, setQuery] = useState(''), [difficulty, setDifficulty] = useState(''), [language, setLanguage] = useState(''), [framework, setFramework] = useState(''), [tag, setTag] = useState(''), [sort, setSort] = useState('newest');
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState(''), [codebase, setCodebase] = useState(null), [treeFiles, setTreeFiles] = useState([]), [treeDirectories, setTreeDirectories] = useState([]), [selectedPath, setSelectedPath] = useState(''), [sourceText, setSourceText] = useState(''), [fileBusy, setFileBusy] = useState(false), [fileError, setFileError] = useState(''), [fileQuery, setFileQuery] = useState('');
  const [workspace, setWorkspace] = useState(null), [workFiles, setWorkFiles] = useState([]), [originals, setOriginals] = useState({}), [savedSnapshot, setSavedSnapshot] = useState({}), [openPaths, setOpenPaths] = useState([]), [activeTab, setActiveTab] = useState(''), [saveState, setSaveState] = useState('saved'), [attempts, setAttempts] = useState([]), [submissions, setSubmissions] = useState([]), [review, setReview] = useState(false), [submissionDetails, setSubmissionDetails] = useState(null);
  const workRef = useRef([]), savedRef = useRef({}), originalRef = useRef({}), workspaceRef = useRef(null), saveQueue = useRef(Promise.resolve()), currentCodebase = useRef(null);
  const modified = useMemo(() => workFiles.filter(file => Object.hasOwn(originals, file.path) && file.content !== originals[file.path]), [workFiles, originals]);
  const unsavedFiles = useMemo(() => workFiles.filter(file => Object.hasOwn(originals, file.path) && file.content !== savedSnapshot[file.path]), [workFiles, originals, savedSnapshot]);
  workRef.current = workFiles; workspaceRef.current = workspace; originalRef.current = originals; currentCodebase.current = codebase;

  const loadProgress = useCallback(async () => {
    try { const result = await api('/progress'); setProgress(result.data.progress || {}); setBookmarks(result.data.bookmarks || []); setProgressAvailable(true); }
    catch { setProgressAvailable(false); }
  }, []);
  const loadRows = useCallback(async () => {
    setBusy(true); setProblem('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '12', sort });
      if (query.trim()) params.set('q', query.trim()); if (difficulty) params.set('difficulty', difficulty); if (language.trim()) params.set('language', language.trim()); if (framework.trim()) params.set('framework', framework.trim()); if (tag.trim()) params.set('tag', tag.trim());
      const result = await api(`/codebases?${params}`); setRows(result.data || []); setPages(Math.max(1, result.pagination?.pages || 1));
    } catch (error) { setProblem(error.message); } finally { setBusy(false); }
  }, [page, sort, query, difficulty, language, framework, tag]);
  useEffect(() => { const timer = setTimeout(loadRows, query ? 300 : 0); return () => clearTimeout(timer); }, [loadRows]);
  useEffect(() => { loadProgress(); }, [loadProgress]);
  useEffect(() => { const timer = setTimeout(() => loadProgress(), 250); return () => clearTimeout(timer); }, [rows.length, loadProgress]);

  const visibleRows = screen === 'bookmarks' ? rows.filter(row => bookmarks.includes(String(row._id))) : rows;
  const loadDetail = async id => {
    setBusy(true); setProblem('');
    try { const [detail, files] = await Promise.all([api(`/codebases/${id}`), api(`/codebases/${id}/files`)]); setCodebase(detail.data); setTreeFiles(files.data.files || []); setTreeDirectories(files.data.directories || []); setScreen('detail'); setSelectedPath(''); setFileQuery(''); }
    catch (error) { setProblem(error.message); }
    finally { setBusy(false); }
  };
  const toggleBookmark = async item => {
    const id = String(item._id), saved = bookmarks.includes(id);
    try { await api(`/codebases/${id}/bookmark`, { method: saved ? 'DELETE' : 'POST', body: saved ? undefined : '{}' }); setBookmarks(value => saved ? value.filter(x => x !== id) : [...value, id]); onNotice?.(saved ? 'Bookmark removed.' : 'Codebase bookmarked.'); }
    catch (error) { onNotice?.(error.message); }
  };
  const openFile = async path => {
    setSelectedPath(path); setFileBusy(true); setFileError('');
    try { const result = await api(`/codebases/${codebase._id}/file?path=${encodeURIComponent(path)}`); setSourceText(result.data.content); }
    catch (error) { setFileError(error.message); setSourceText(''); }
    finally { setFileBusy(false); }
  };
  const openBookmarks = async () => {
    setBusy(true); setProblem('');
    try { const result = await api('/bookmarks'); const items = result.data || []; setBookmarks(items.map(row => String(row.codebase._id || row.codebase.id))); setRows(items.map(row => ({ ...row.codebase, _id: row.codebase._id || row.codebase.id, bookmarked: true }))); setScreen('bookmarks'); }
    catch (error) { setProblem(error.message); }
    finally { setBusy(false); }
  };
  const openHistory = async (scope = 'current') => {
    try { if (screen === 'workspace' && unsavedFiles.length) { await saveWorkspace(); await saveQueue.current; } const selectedCodebase = scope === 'all' ? null : codebase; const [attemptResult, submissionResult] = selectedCodebase ? await Promise.all([api(`/codebases/${selectedCodebase._id}/attempts`), api(`/codebases/${selectedCodebase._id}/submissions`)]) : [await api('/attempts'), await api('/submissions')]; const attemptsData = attemptResult.data || []; setAttempts(Array.isArray(attemptsData) ? attemptsData : attemptsData.attempts || []); setSubmissions(submissionResult.data?.submissions || submissionResult.data || []); if (scope === 'all') setCodebase(null); setScreen('history'); }
    catch (error) { onNotice?.(error.message); }
  };

  const startWorkspace = async () => {
    try {
      const result = await api(`/codebases/${codebase._id}/workspace`, { method: 'POST', body: '{}' });
      const ws = result.data; setWorkspace(ws); workspaceRef.current = ws; setWorkFiles(ws.files || []); setOpenPaths([]); setActiveTab(''); setOriginals({}); const snapshot = Object.fromEntries((ws.files || []).map(file => [file.path, file.content])); setSavedSnapshot(snapshot); setSaveState('saved'); savedRef.current = snapshot; setScreen('workspace');
    } catch (error) { onNotice?.(error.message); }
  };

  const saveWorkspace = useCallback(() => {
    const task = saveQueue.current.then(async () => {
      const current = workRef.current, base = originalRef.current, ws = workspaceRef.current, active = currentCodebase.current;
      if (!ws || !active) return;
      for (const file of current) {
        const oldSaved = savedRef.current[file.path];
        if (file.content === oldSaved) continue;
        if (!Object.hasOwn(base, file.path)) continue;
        const body = { files: file.content === base[file.path] ? [] : [{ path: file.path, content: file.content }], resetPaths: file.content === base[file.path] ? [file.path] : [], revision: workspaceRef.current.revision };
        setSaveState('saving');
        const result = await api(`/codebases/${active._id}/workspace/${ws.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        savedRef.current = { ...savedRef.current, [file.path]: file.content };
        setSavedSnapshot(value => ({ ...value, [file.path]: file.content }));
        workspaceRef.current = { ...workspaceRef.current, revision: result.data.revision, updatedAt: result.data.updatedAt };
        setWorkspace(workspaceRef.current);
      }
      setSaveState('saved');
    });
    saveQueue.current = task.catch(error => { setSaveState(error.message.includes('another session') ? 'conflict' : 'error'); onNotice?.(error.message); });
    return task;
  }, [onNotice]);
  useEffect(() => {
    if (screen !== 'workspace' || unsavedFiles.length === 0) return undefined;
    setSaveState('pending'); const timer = setTimeout(() => saveWorkspace().catch(() => {}), 750); return () => clearTimeout(timer);
  }, [workFiles, originals, savedSnapshot, screen, saveWorkspace]);
  useEffect(() => {
    if (screen !== 'workspace' || !unsavedFiles.length) return undefined;
    const beforeUnload = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload); return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [screen, unsavedFiles.length]);
  useEffect(() => { onDirtyChange?.(screen === 'workspace' && unsavedFiles.length > 0); }, [screen, unsavedFiles.length, onDirtyChange]);

  const selectWorkspaceFile = async path => {
    if (!originals[path]) {
      try { const result = await api(`/codebases/${codebase._id}/file?path=${encodeURIComponent(path)}`); setOriginals(value => ({ ...value, [path]: result.data.content })); }
      catch (error) { onNotice?.(error.message); return; }
    }
    const file = workFiles.find(item => item.path === path);
    if (!file) return;
    if (!workFiles.some(item => item.path === path)) setWorkFiles(value => [...value, { path, content: originals[path] }]);
    setOpenPaths(value => value.includes(path) ? value : [...value, path]); setActiveTab(path);
  };
  const leaveWorkspace = async target => {
    if (unsavedFiles.length) {
      try { await saveWorkspace(); await saveQueue.current; }
      catch { onNotice?.('Save is still pending or failed. Stay here and retry before leaving.'); return; }
      if (saveState === 'error' || saveState === 'conflict') return;
    }
    setScreen(target);
  };
  const changeActiveFile = content => setWorkFiles(value => value.map(file => file.path === activeTab ? { ...file, content } : file));
  const resetWorkspace = async () => {
    if (!window.confirm('Reset all candidate changes to the published source? This cannot be undone.')) return;
    try {
      if (unsavedFiles.length) { await saveWorkspace(); await saveQueue.current; }
      const result = await api(`/codebases/${codebase._id}/workspace/${workspace.id}/reset`, { method: 'POST', body: JSON.stringify({ revision: workspaceRef.current.revision }) });
      setWorkspace(result.data); workspaceRef.current = result.data; setWorkFiles(result.data.files); const snapshot = Object.fromEntries(result.data.files.map(file => [file.path, file.content])); savedRef.current = snapshot; setSavedSnapshot(snapshot); setOriginals({}); setOpenPaths([]); setActiveTab(''); setSaveState('saved');
    } catch (error) { onNotice?.(error.message); }
  };
  const reloadWorkspace = async () => {
    if (!window.confirm('Reload the latest server workspace? Your unsaved local edits will be discarded.')) return;
    try { const result = await api(`/codebases/${codebase._id}/workspace`); if (!result.data) { onNotice?.('No active workspace is available.'); return; } setWorkspace(result.data); workspaceRef.current = result.data; setWorkFiles(result.data.files); const snapshot = Object.fromEntries(result.data.files.map(file => [file.path, file.content])); savedRef.current = snapshot; setSavedSnapshot(snapshot); setOriginals({}); setOpenPaths([]); setActiveTab(''); setSaveState('saved'); }
    catch (error) { onNotice?.(error.message); }
  };
  const submitWorkspace = () => setReview(true);
  const confirmSubmission = async () => {
    try { await saveWorkspace(); await saveQueue.current; const result = await api(`/codebases/${codebase._id}/submissions`, { method: 'POST', body: JSON.stringify({ attemptId: workspace.id, revision: workspaceRef.current.revision }) }); setSubmissionDetails(result.data); setReview(false); setScreen('submitted'); setProgress(value => ({ ...value, [codebase._id]: 'SUBMITTED' })); }
    catch (error) { onNotice?.(error.message); }
  };
  const showSubmission = async submission => { try { const result = await api(`/submissions/${submission.id}`); setSubmissionDetails(result.data); } catch (error) { onNotice?.(error.message); } };
  const filteredFiles = treeFiles.filter(file => file.path.toLowerCase().includes(fileQuery.toLowerCase()));
  const filteredDirs = treeDirectories.filter(dir => dir.toLowerCase().includes(fileQuery.toLowerCase()));
  const tree = makeTree(filteredFiles, filteredDirs);

  if (screen === 'workspace' && workspace && codebase) {
    const active = workFiles.find(file => file.path === activeTab);
    const statusLabel = { saved: 'Saved', pending: 'Unsaved changes', saving: 'Saving…', error: 'Save failed', conflict: 'Save conflict' }[saveState];
    return <div className="candidate-workspace">
      <div className="candidate-workbar"><button className="small-quiet" onClick={() => leaveWorkspace('detail')}><ArrowLeft size={14}/> Challenge</button><div><b>{codebase.title}</b><span>Published v{workspace.publishedVersion}</span></div><div className={`candidate-save ${saveState}`} aria-live="polite">{saveState === 'saving' ? <LoaderCircle size={14}/> : <Check size={14}/>} {statusLabel}</div><button className="small-quiet" onClick={openHistory}><History size={14}/> Attempts</button><button className="small-quiet" onClick={resetWorkspace}><RotateCcw size={14}/> Reset</button><button className="small-primary" onClick={submitWorkspace}><Send size={14}/> Submit</button></div>
      {saveState === 'conflict' && <div className="candidate-alert" role="alert">This workspace changed elsewhere. Your edits are preserved in this editor. <button onClick={reloadWorkspace}>Reload latest (discard local edits)</button></div>}{saveState === 'error' && <div className="candidate-alert" role="alert">Autosave failed. Your edits remain here. <button onClick={() => saveWorkspace()}>Retry save</button></div>}
      <div className="candidate-work-grid"><aside className="candidate-explorer"><div className="candidate-panel-title"><b>Explorer</b><span>{treeFiles.length} files</span></div><div className="candidate-file-search"><Search size={14}/><input value={fileQuery} onChange={event => setFileQuery(event.target.value)} placeholder="Find a file" aria-label="Find a project file"/></div><div className="candidate-tree">{tree.length ? tree.map(node => node.type === 'folder' ? <TreeBranch key={node.path} label={node.name} children={node.children} selected={activeTab} onSelect={selectWorkspaceFile}/> : <button key={node.path} className={`candidate-tree-file ${activeTab === node.path ? 'active' : ''}`} onClick={() => selectWorkspaceFile(node.path)}><FileCode2 size={13}/><span>{node.name}</span></button>) : <p className="candidate-muted">No matching files.</p>}</div></aside>
        <section className="candidate-editor"><div className="candidate-tabs">{openPaths.map(path => <div key={path} className={path === activeTab ? 'active' : ''}><button onClick={() => setActiveTab(path)}>{path.split('/').at(-1)}{modified.some(file => file.path === path) ? ' •' : ''}</button><button aria-label={`Close ${path}`} onClick={() => { setOpenPaths(value => value.filter(item => item !== path)); if (activeTab === path) setActiveTab(openPaths.find(item => item !== path) || ''); }}><X size={12}/></button></div>)}</div>{active ? <><div className="candidate-editor-meta"><span>{active.path}</span><span>{bytesLabel(new TextEncoder().encode(active.content).length)} · {modified.some(file => file.path === active.path) ? 'Modified' : 'Original'}</span></div><textarea className="candidate-code-editor" aria-label={`Edit ${active.path}`} spellCheck="false" value={active.content} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveWorkspace(); } if (event.key === 'Tab') { event.preventDefault(); const target = event.currentTarget; const start = target.selectionStart, end = target.selectionEnd; const next = `${active.content.slice(0,start)}  ${active.content.slice(end)}`; changeActiveFile(next); requestAnimationFrame(() => { target.selectionStart = target.selectionEnd = start + 2; }); } }} onChange={event => changeActiveFile(event.target.value)}/></> : <div className="candidate-editor-empty"><Code2 size={22}/><b>Choose a file to start</b><span>Open files stay in tabs while you work.</span></div>}<div className="candidate-bottom"><span><Play size={13}/> No code execution configured</span><span>{modified.length} modified files</span></div></section>
        <aside className="candidate-challenge-rail"><div className="candidate-panel-title"><b>Challenge</b><span>v{workspace.publishedVersion}</span></div><div className="candidate-challenge-scroll"><h3>{codebase.bugTitle || codebase.title}</h3><p>{codebase.bugDescription || codebase.problemStatement}</p><h4>Expected behavior</h4><p>{codebase.expectedBehavior}</p><h4>Reproduction steps</h4><ol>{(codebase.reproductionSteps || []).map(step => <li key={step}>{step}</li>)}</ol><h4>Acceptance criteria</h4><ul>{(codebase.acceptanceCriteria || []).map(item => <li key={item}>{item}</li>)}</ul>{codebase.publicHints?.length > 0 && <><h4>Hints</h4><ul>{codebase.publicHints.map(item => <li key={item}>{item}</li>)}</ul></>}</div></aside>
      </div>
      <div className="candidate-submission-strip"><span>Saved progress is private to your account. Submission status will be <b>NOT_EVALUATED</b>; this environment does not run candidate code.</span><button className="small-primary" onClick={submitWorkspace}><Send size={13}/> Review and submit</button></div>
      {review && <div className="detail-backdrop" role="presentation" onClick={() => setReview(false)}><section className="detail-dialog candidate-review-dialog" role="dialog" aria-modal="true" aria-labelledby="candidate-review-title" onClick={event => event.stopPropagation()}><div className="detail-top"><span className="eyebrow">SUBMISSION REVIEW</span><button className="small-quiet" onClick={() => setReview(false)}>Close</button></div><h2 id="candidate-review-title">Review your solution</h2><p>{modified.length} modified file{modified.length === 1 ? '' : 's'} will be stored as an immutable snapshot for published version {workspace.publishedVersion}.</p>{modified.length ? <ul>{modified.map(file => <li key={file.path}>{file.path} · {bytesLabel(new TextEncoder().encode(file.content).length)}</li>)}</ul> : <p>No files differ from the published source.</p>}<div className="candidate-review-note">Status: NOT_EVALUATED. Candidate code will not be executed or scored.</div><div className="candidate-review-actions"><button className="small-quiet" onClick={() => setReview(false)}>Continue editing</button><button className="small-primary" onClick={confirmSubmission}><Send size={13}/> Submit snapshot</button></div></section></div>}
    </div>;
  }

  return <div className="candidate-module">
    <div className="candidate-heading"><div><div className="eyebrow">CANDIDATE WORKSPACE</div><h1>{screen === 'detail' ? codebase?.title : screen === 'history' ? 'Your attempts' : screen === 'submitted' ? 'Submission received' : screen === 'bookmarks' ? 'Bookmarked challenges' : 'Explore codebases'}</h1><p>{screen === 'discover' ? 'Browse published debugging projects, inspect the source, and continue your progress.' : screen === 'detail' ? 'Review the project setup and public debugging challenge.' : screen === 'submitted' ? 'Your snapshot is saved. Automated evaluation is not available.' : 'Your workspace and submission history are private to your account.'}</p></div>{screen === 'discover' && <div className="candidate-heading-actions"><button className="small-quiet" onClick={openBookmarks}><Bookmark size={14}/> Bookmarks</button><button className="small-quiet" onClick={() => openHistory('all')}><History size={14}/> Attempt history</button></div>}</div>
    {screen === 'discover' && <><div className="candidate-filters"><div className="searchbox"><Search size={15}/><input aria-label="Search title and description" placeholder="Search title and description" value={query} onChange={event => { setPage(1); setQuery(event.target.value); }}/></div><select aria-label="Filter difficulty" value={difficulty} onChange={event => { setPage(1); setDifficulty(event.target.value); }}><option value="">All difficulties</option><option>Easy</option><option>Medium</option><option>Hard</option></select><input aria-label="Filter language" placeholder="Language" value={language} onChange={event => { setPage(1); setLanguage(event.target.value); }}/><input aria-label="Filter framework" placeholder="Framework" value={framework} onChange={event => { setPage(1); setFramework(event.target.value); }}/><input aria-label="Filter tag" placeholder="Tag" value={tag} onChange={event => { setPage(1); setTag(event.target.value); }}/><select aria-label="Sort codebases" value={sort} onChange={event => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="difficulty">Difficulty</option><option value="time">Estimated time</option></select></div>
      {problem && <div className="candidate-alert" role="alert">{problem}<button onClick={loadRows}>Retry</button></div>}
      {busy ? <div className="candidate-empty"><LoaderCircle className="spin"/><span>Loading published projects…</span></div> : visibleRows.length ? <div className="candidate-card-grid">{visibleRows.map(item => <article className="candidate-card" key={item._id}><div className="candidate-card-top"><span className={`badge ${item.difficulty?.toLowerCase()}`}>{item.difficulty}</span><button className={`candidate-bookmark ${bookmarks.includes(String(item._id)) ? 'marked' : ''}`} aria-label={bookmarks.includes(String(item._id)) ? 'Remove bookmark' : 'Bookmark codebase'} onClick={() => toggleBookmark(item)}><Bookmark size={16}/></button></div><button className="candidate-card-title" onClick={() => loadDetail(item._id)}>{item.title}</button><p>{item.description}</p><div className="candidate-card-meta"><span>{(item.languages || []).join(', ') || 'Language not specified'}</span>{item.frameworks?.length > 0 && <span>{item.frameworks.join(', ')}</span>}<span><Clock3 size={13}/> {item.estimatedMinutes || 60} min</span></div><div className="candidate-tags">{(item.tags || []).slice(0,5).map(value => <span key={value}>{value}</span>)}</div><div className="candidate-card-footer"><span className={`candidate-progress ${progressAvailable ? (progress[item._id] || 'NOT_STARTED') : 'UNAVAILABLE'}`}>{progressAvailable ? (progress[item._id] || 'NOT_STARTED').replace('_',' ') : 'PROGRESS UNAVAILABLE'}</span><span className="candidate-published">Published {new Date(item.publishedAt || item.createdAt).toLocaleDateString()}</span><button className="small-quiet" onClick={() => loadDetail(item._id)}>Explore <ChevronRight size={14}/></button></div></article>)}</div> : <div className="candidate-empty"><Search/><b>{screen === 'bookmarks' ? 'No available bookmarks' : 'No published challenges found'}</b><span>Adjust your filters or check back later.</span>{screen === 'bookmarks' && <button className="small-quiet" onClick={() => setScreen('discover')}>Explore codebases</button>}</div>}
      {screen === 'discover' && pages > 1 && <div className="pagination"><span>Page {page} of {pages}</span><div><button className="small-quiet" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><button className="small-quiet" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>Next</button></div></div>}</>}
    {screen === 'bookmarks' && <><button className="small-quiet candidate-back" onClick={() => setScreen('discover')}><ArrowLeft size={14}/> All challenges</button>{visibleRows.length ? <div className="candidate-card-grid">{visibleRows.map(item => <article className="candidate-card" key={item._id}><div className="candidate-card-top"><span className={`badge ${item.difficulty?.toLowerCase()}`}>{item.difficulty}</span><button className="candidate-bookmark marked" aria-label="Remove bookmark" onClick={() => toggleBookmark(item)}><Bookmark size={16}/></button></div><button className="candidate-card-title" onClick={() => loadDetail(item._id)}>{item.title}</button><p>{item.description}</p><button className="small-quiet" onClick={() => loadDetail(item._id)}>Open challenge <ChevronRight size={14}/></button></article>)}</div> : <div className="candidate-empty"><Bookmark/><b>No available bookmarks</b><button className="small-quiet" onClick={() => setScreen('discover')}>Explore codebases</button></div>}</>}
    {screen === 'detail' && codebase && <><button className="small-quiet candidate-back" onClick={() => setScreen('discover')}><ArrowLeft size={14}/> Back to library</button><div className="candidate-detail-layout"><article className="candidate-detail-main"><div className="candidate-detail-meta"><span className={`badge ${codebase.difficulty?.toLowerCase()}`}>{codebase.difficulty}</span><span><Clock3 size={13}/> {codebase.estimatedMinutes || 60} minutes</span><span>{(codebase.languages || []).join(', ')}</span><span>{(codebase.frameworks || []).join(', ')}</span></div><h2>Project overview</h2><p>{codebase.detailedDescription || codebase.description}</p><div className="candidate-tags">{(codebase.tags || []).map(value => <span key={value}>{value}</span>)}</div><h3>Technical setup</h3><div className="candidate-detail-grid"><div><b>Prerequisites</b><p>{(codebase.prerequisites || []).join(', ') || 'None listed'}</p></div><div><b>Dependencies</b><p>{(codebase.dependencies || []).join(', ') || 'See project README'}</p></div><div><b>Runtime versions</b><p>{Object.entries(codebase.runtimeVersions || {}).map(([key,value]) => `${key} ${value}`).join(', ') || 'Not specified'}</p></div><div><b>Build / start / test</b><p>{[codebase.commands?.build && `Build: ${codebase.commands.build}`, codebase.commands?.start && `Start: ${codebase.commands.start}`, codebase.commands?.test && `Test: ${codebase.commands.test}`].filter(Boolean).join(' · ') || 'See setup instructions'}</p></div><div><b>Tools and technologies</b><p>{[codebase.databaseTechnology,...(codebase.requiredTools || []),...(codebase.technologies || [])].filter(Boolean).join(', ') || 'Not specified'}</p></div><div><b>Expected structure</b><p>{(codebase.expectedStructure || []).join(', ') || 'Not specified'}</p></div></div>{codebase.readme && <><h3>README</h3><pre className="candidate-markdown">{codebase.readme}</pre></>}<h3>Installation and setup</h3><p>{codebase.instructions || 'No installation instructions provided.'}</p>{codebase.environmentDocumentation && <><h3>Environment variables</h3><p>{codebase.environmentDocumentation}</p></>}{codebase.configurationInstructions && <><h3>Configuration</h3><p>{codebase.configurationInstructions}</p></>}<h3>Debugging challenge</h3><h4>{codebase.bugTitle}</h4><p>{codebase.bugDescription || codebase.problemStatement}</p><div className="candidate-detail-grid"><div><b>Expected behavior</b><p>{codebase.expectedBehavior}</p></div><div><b>Observed behavior</b><p>{codebase.actualBehavior}</p></div></div><h4>Reproduction steps</h4><ol>{(codebase.reproductionSteps || []).map(item => <li key={item}>{item}</li>)}</ol><h4>Relevant files</h4><p>{(codebase.relevantFiles || []).join(', ') || 'Explore the project files'}</p>{codebase.publicHints?.length > 0 && <><h4>Public hints</h4><ul>{codebase.publicHints.map(item => <li key={item}>{item}</li>)}</ul></>}<h4>Acceptance criteria</h4><ul>{(codebase.acceptanceCriteria || []).map(item => <li key={item}>{item}</li>)}</ul></article><aside className="candidate-detail-side"><div className="candidate-panel-title"><b>Project files</b><span>{treeFiles.length}</span></div><div className="candidate-file-search"><Search size={14}/><input value={fileQuery} onChange={event => setFileQuery(event.target.value)} placeholder="Search filenames" aria-label="Search filenames"/></div><div className="candidate-tree candidate-preview-tree">{tree.map(node => node.type === 'folder' ? <TreeBranch key={node.path} label={node.name} children={node.children} selected={selectedPath} onSelect={openFile}/> : <button key={node.path} className={`candidate-tree-file ${selectedPath === node.path ? 'active' : ''}`} onClick={() => openFile(node.path)}><FileCode2 size={13}/><span>{node.name}</span></button>)}</div><div className="candidate-source-preview">{fileBusy ? <span>Loading file…</span> : fileError ? <span className="candidate-error">{fileError}</span> : selectedPath ? <><div>{selectedPath} <small>{bytesLabel(new TextEncoder().encode(sourceText).length)}</small></div><pre>{sourceText}</pre></> : <span>Select a file to preview its source.</span>}</div><div className="candidate-detail-actions"><button className="small-quiet" onClick={() => toggleBookmark(codebase)}><Bookmark size={14}/>{bookmarks.includes(String(codebase._id)) ? 'Bookmarked' : 'Bookmark'}</button><button className="small-primary" onClick={startWorkspace}><Code2 size={14}/> Start debugging</button></div></aside></div></>}
    {screen === 'history' && <><button className="small-quiet candidate-back" onClick={() => setScreen(codebase ? 'detail' : 'discover')}><ArrowLeft size={14}/> Back</button>{codebase && <h2>{codebase.title}</h2>}<div className="candidate-history">{submissions.length ? submissions.map((item,index) => <article key={item.id}><div><b>Submission {submissions.length - index}</b><span>Version {item.publishedVersion} · {new Date(item.createdAt).toLocaleString()}</span></div><span className="candidate-status">{item.evaluationStatus || 'NOT_EVALUATED'}</span><button className="small-quiet" onClick={() => showSubmission(item)}>View snapshot</button></article>) : <div className="candidate-empty"><History/><b>No submissions yet</b><span>Submitted snapshots will appear here.</span></div>}{attempts.filter(item => item.status === 'IN_PROGRESS').map(item => <article key={item._id}><div><b>Active workspace</b><span>Version {item.publishedVersion} · updated {new Date(item.updatedAt).toLocaleString()}</span></div><span className="candidate-status">IN PROGRESS</span></article>)}</div>{submissionDetails && <div className="detail-backdrop" role="presentation" onClick={() => setSubmissionDetails(null)}><section className="detail-dialog" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}><div className="detail-top"><span className="eyebrow">SUBMITTED SNAPSHOT · {submissionDetails.evaluationStatus}</span><button className="small-quiet" onClick={() => setSubmissionDetails(null)}>Close</button></div><h2>{submissionDetails.createdAt ? new Date(submissionDetails.createdAt).toLocaleString() : 'Submission'}</h2>{submissionDetails.files?.map(file => <details key={file.path}><summary>{file.path} · {bytesLabel(file.size)}</summary><pre>{file.content}</pre></details>)}</section></div>}</>}
    {screen === 'submitted' && <div className="candidate-submitted"><div className="candidate-success"><Check size={25}/></div><h2>Submission saved</h2><p>Submitted {submissionDetails?.createdAt ? new Date(submissionDetails.createdAt).toLocaleString() : 'just now'} · status <b>NOT_EVALUATED</b></p><p>Your solution snapshot is private to your account. Candidate code is not executed.</p><div><button className="small-quiet" onClick={openHistory}>View attempt history</button><button className="small-primary" onClick={() => setScreen('detail')}>Return to challenge</button></div></div>}
  </div>;
}
