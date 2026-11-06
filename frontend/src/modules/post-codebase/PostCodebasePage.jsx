import React, { useEffect, useRef, useState } from 'react';
import { Archive, Check, ChevronRight, FileCode2, FilePlus2, FolderPlus, Github, LoaderCircle, Plus, Save, Send, Upload, X } from 'lucide-react';

const blank = () => ({ title:'', description:'', detailedDescription:'', difficulty:'Medium', estimatedMinutes:60, category:'General', tags:[], languages:['JavaScript'], frameworks:[], technologies:[], runtimeVersions:{}, databaseTechnology:'', requiredTools:[], dependencies:[], commands:{build:'',start:'',test:''}, sourceUrl:'', readme:'', instructions:'', environmentDocumentation:'', configurationInstructions:'', prerequisites:[], expectedStructure:[], problemStatement:'', bugTitle:'', bugDescription:'', currentBehavior:'', expectedBehavior:'', actualBehavior:'', reproductionSteps:[], relevantFiles:[], relevantSymbols:[], errorLogs:'', acceptanceCriteria:[], expectedDeliverables:[], publicHints:[], privateNotes:'', intendedBugExplanation:'', solutionApproach:'', evaluationRubric:[], hiddenRequirements:[], internalReferences:[], hiddenTests:[] });
const toForm = item => { const base=blank();return Object.fromEntries(Object.keys(base).map(key=>[key,key==='commands'?{...base.commands,...(item.commands||{})}:item[key]??base[key]])); };
const api = async (path, options={}) => { const headers=options.body instanceof FormData?{}:{'Content-Type':'application/json'}; const res=await fetch(`/api/v1${path}`,{headers,...options}); const body=res.status===204?null:await res.json(); if(!res.ok) throw new Error(body?.error?.message||'Request failed'); return body; };
const listFields = new Set(['tags','languages','frameworks','technologies','requiredTools','dependencies','prerequisites','expectedStructure','reproductionSteps','relevantFiles','relevantSymbols','acceptanceCriteria','expectedDeliverables','publicHints','hiddenRequirements','internalReferences']);
const metadataOnly = form => { const value={...form}; delete value.files; delete value.directories; return value; };

export default function PostCodebasePage({ initialCodebase, onSaved, onCancel, onDirtyChange, onNotice }) {
  const initialFiles = initialCodebase?.files?.length ? initialCodebase.files : [];
  const [form,setForm]=useState(()=>toForm(initialCodebase||{}));
  const [files,setFiles]=useState(initialFiles);
  const [directories,setDirectories]=useState(initialCodebase?.directories||[]);
  const [draftId,setDraftId]=useState(initialCodebase?._id||null);
  const [activePath,setActivePath]=useState(initialFiles[0]?.path||'');
  const [fileSearch,setFileSearch]=useState('');
  const [newFilePath,setNewFilePath]=useState('src/new-file.js');
  const [newFolderPath,setNewFolderPath]=useState('src/components');
  const [renamePath,setRenamePath]=useState('');
  const [githubUrl,setGithubUrl]=useState(''),[jsonText,setJsonText]=useState(()=>({runtimeVersions:JSON.stringify(initialCodebase?.runtimeVersions||{},null,2),evaluationRubric:JSON.stringify(initialCodebase?.evaluationRubric||[],null,2),hiddenTests:JSON.stringify(initialCodebase?.hiddenTests||[],null,2)}));
  const [jsonErrors,setJsonErrors]=useState({});
  const [saving,setSaving]=useState('saved');
  const [preview,setPreview]=useState(null);
  const versionRef=useRef(initialCodebase?.version||1);
  const idRef=useRef(initialCodebase?._id||null);
  const metaRef=useRef(form);
  const filesRef=useRef(files);
  const directoriesRef=useRef(directories);
  const savedMetaRef=useRef(JSON.stringify(metadataOnly(toForm(initialCodebase||{}))));
  const savedFilesRef=useRef(JSON.stringify(initialFiles));
  const queueRef=useRef(Promise.resolve());
  const dirtyRef=useRef(false);
  metaRef.current=form; filesRef.current=files; directoriesRef.current=directories;
  const activeFile=files.find(file=>file.path===activePath);
  const dirty=JSON.stringify(metadataOnly(form))!==savedMetaRef.current||JSON.stringify(files)!==savedFilesRef.current;
  dirtyRef.current=dirty;

  const serialize = action => {
    const result=queueRef.current.then(action,action);
    queueRef.current=result.catch(()=>{});
    return result;
  };
  const updateStatus = value => { setSaving(value); if(value==='error') onNotice?.('Autosave failed. Your changes are still in this editor.'); };

  async function createDraftNow() {
    if(idRef.current) return idRef.current;
    const current=metaRef.current;
    if(!current.title.trim()||!current.description.trim()) throw new Error('Add a project title and short description to start a recoverable draft.');
    updateStatus('saving');
    const created=await api('/creator/codebases',{method:'POST',body:JSON.stringify(metadataOnly(current))});
    idRef.current=created.data._id; versionRef.current=created.data.version; setDraftId(created.data._id);
    savedMetaRef.current=JSON.stringify(metadataOnly(current));
    for(const file of filesRef.current){const saved=await api(`/creator/codebases/${idRef.current}/files`,{method:'POST',body:JSON.stringify({file})});versionRef.current=saved.data.version;}
    savedFilesRef.current=JSON.stringify(filesRef.current);
    if(directoriesRef.current.length){for(const path of directoriesRef.current){const saved=await api(`/creator/codebases/${idRef.current}/directories`,{method:'POST',body:JSON.stringify({path})});versionRef.current=saved.data.version;}}
    updateStatus('saved');
    return idRef.current;
  }

  async function flushAutosave() {
    return serialize(async()=>{
      try {
        if(!idRef.current){await createDraftNow();return;}
        const current=metaRef.current; const signature=JSON.stringify(metadataOnly(current));
        if(signature!==savedMetaRef.current){updateStatus('saving');const result=await api(`/creator/codebases/${idRef.current}`,{method:'PATCH',body:JSON.stringify({...metadataOnly(current),version:versionRef.current})});versionRef.current=result.data.version;savedMetaRef.current=signature;}
        const pending=filesRef.current;
        const previous=JSON.parse(savedFilesRef.current);
        for(const file of pending){const old=previous.find(item=>item.path===file.path);if(old&&old.content!==file.content){updateStatus('saving');const result=await api(`/creator/codebases/${idRef.current}/file-content`,{method:'PATCH',body:JSON.stringify({path:file.path,content:file.content,version:versionRef.current})});versionRef.current=result.data.version;old.content=file.content;}}
        savedFilesRef.current=JSON.stringify(pending);
        updateStatus('saved');
      } catch(error){updateStatus('error');throw error;}
    });
  }

  useEffect(()=>{
    if(!form.title.trim()||!form.description.trim()) return undefined;
    const timer=setTimeout(()=>{flushAutosave().catch(error=>onNotice?.(error.message));},1000);
    return ()=>clearTimeout(timer);
  },[form,draftId]);
  useEffect(()=>{
    if(!draftId||JSON.stringify(files)===savedFilesRef.current)return undefined;
    const timer=setTimeout(()=>{flushAutosave().catch(error=>onNotice?.(error.message));},850);
    return ()=>clearTimeout(timer);
  },[files,draftId]);
  useEffect(()=>{
    const timer=setTimeout(()=>onDirtyChange?.(dirty),0);
    return ()=>clearTimeout(timer);
  },[dirty,onDirtyChange]);
  useEffect(()=>{
    const beforeUnload=event=>{if(dirtyRef.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',beforeUnload);
    return ()=>window.removeEventListener('beforeunload',beforeUnload);
  },[]);

  const setField=(name,value)=>setForm(previous=>({...previous,[name]:value}));
  const changeList=(name,value)=>setField(name,value.split(',').map(item=>item.trim()).filter(Boolean));
  const saveNow=async()=>{if(Object.keys(jsonErrors).length){onNotice?.('Fix the invalid JSON fields before saving.');return false;}try{await flushAutosave();if(!idRef.current) await serialize(()=>createDraftNow());else await queueRef.current;onNotice?.('Draft saved.');return true;}catch(error){onNotice?.(error.message);return false;}};
  const addFile=async()=>{
    const path=newFilePath.trim(); if(!path)return;
    if(files.some(file=>file.path.toLowerCase()===path.toLowerCase())){onNotice?.('A file already exists at that path.');return;}
    const file={path,content:''};
    try { if(idRef.current){const result=await serialize(()=>api(`/creator/codebases/${idRef.current}/files`,{method:'POST',body:JSON.stringify({file})}));versionRef.current=result.data.version;savedFilesRef.current=JSON.stringify([...filesRef.current,file]);} setFiles(current=>[...current,file]);setActivePath(path);setNewFilePath(''); }
    catch(error){onNotice?.(error.message)}
  };
  const addFolder=async()=>{
    const path=newFolderPath.trim();if(!path)return;
    try{if(idRef.current){const result=await serialize(()=>api(`/creator/codebases/${idRef.current}/directories`,{method:'POST',body:JSON.stringify({path})}));versionRef.current=result.data.version;}setDirectories(current=>current.includes(path)?current:[...current,path]);setNewFolderPath('');}
    catch(error){onNotice?.(error.message)}
  };
  const renameFile=async()=>{
    if(!activePath||!renamePath.trim())return;
    const nextPath=renamePath.trim();
    try{if(idRef.current){const result=await serialize(()=>api(`/creator/codebases/${idRef.current}/files/rename`,{method:'PATCH',body:JSON.stringify({oldPath:activePath,newPath:nextPath})}));versionRef.current=result.data.version;}setFiles(current=>current.map(file=>file.path===activePath?{...file,path:nextPath}:file));setActivePath(nextPath);setRenamePath('');}
    catch(error){onNotice?.(error.message)}
  };
  const deleteFile=async path=>{
    if(!window.confirm(`Delete ${path}?`))return;
    try{if(idRef.current){await serialize(()=>api(`/creator/codebases/${idRef.current}/files?path=${encodeURIComponent(path)}`,{method:'DELETE'}));versionRef.current+=1;}setFiles(current=>current.filter(file=>file.path!==path));setActivePath(current=>current===path?(files.find(file=>file.path!==path)?.path||''):current);}
    catch(error){onNotice?.(error.message)}
  };
  const onZip=async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{
      let id=idRef.current;if(!id){const saved=await saveNow();if(!saved)return;id=idRef.current;}
      setSaving('uploading');const body=new FormData();body.append('archive',file);
      const result=await serialize(()=>api(`/creator/codebases/${id}/upload`,{method:'POST',body}));versionRef.current=result.data.version;
      const loaded=await api(`/creator/codebases/${id}`);setFiles(loaded.data.files||[]);setDirectories(loaded.data.directories||[]);setActivePath(loaded.data.files?.[0]?.path||'');savedFilesRef.current=JSON.stringify(loaded.data.files||[]);updateStatus('saved');onNotice?.(result.message);
    }catch(error){updateStatus('error');onNotice?.(error.message)}finally{event.target.value='';}
  };
  const importGithub=async()=>{
    try{let id=idRef.current;if(!id){const saved=await saveNow();if(!saved)return;id=idRef.current;}const result=await api(`/creator/codebases/${id}/import-github`,{method:'POST',body:JSON.stringify({url:githubUrl})});onNotice?.(result.message||'Repository imported.');}
    catch(error){onNotice?.(error.message)}
  };
  const openPreview=async()=>{
    if(!(await saveNow()))return;
    try{const result=await api(`/creator/codebases/${idRef.current}/preview`);setPreview(result.data);}
    catch(error){onNotice?.(error.message)}
  };
  const publish=async()=>{
    if(!(await saveNow()))return;
    if(!window.confirm('Publish this challenge? Candidates will be able to view its public information and source files.'))return;
    try{const result=await api(`/creator/codebases/${idRef.current}/publish`,{method:'POST',body:'{}'});onNotice?.(`Published version ${result.data.version}.`);onSaved?.();}
    catch(error){onNotice?.(error.message)}
  };
  const visibleFiles=files.filter(file=>file.path.toLowerCase().includes(fileSearch.toLowerCase()));
  const field=(label,name,placeholder='',rows)=> <label className="pc-field">{label}{rows?<textarea rows={rows} value={form[name]||''} onChange={event=>setField(name,event.target.value)} placeholder={placeholder}/>:<input type={name==='estimatedMinutes'?'number':'text'} min={name==='estimatedMinutes'?5:undefined} max={name==='estimatedMinutes'?1000:undefined} value={form[name]??''} onChange={event=>setField(name,name==='estimatedMinutes'?Number(event.target.value):event.target.value)} placeholder={placeholder}/>}</label>;
  const arrayField=(label,name,placeholder='Comma-separated values')=><label className="pc-field">{label}<input value={(form[name]||[]).join(', ')} onChange={event=>changeList(name,event.target.value)} placeholder={placeholder}/></label>;
  const commandField=(label,key,placeholder)=><label className="pc-field">{label}<input value={form.commands[key]||''} onChange={event=>setField('commands',{...form.commands,[key]:event.target.value})} placeholder={placeholder}/></label>;
  const jsonField=(label,name,placeholder,rows=3)=> <label className="pc-field">{label}<textarea aria-invalid={Boolean(jsonErrors[name])} rows={rows} spellCheck="false" value={jsonText[name]} onChange={event=>{const value=event.target.value;setJsonText(current=>({...current,[name]:value}));try{const parsed=JSON.parse(value);const valid=name==='runtimeVersions'?parsed&&typeof parsed==='object'&&!Array.isArray(parsed):Array.isArray(parsed);if(!valid)throw new Error(name==='runtimeVersions'?'Expected a JSON object.':'Expected a JSON array.');setJsonErrors(current=>{const next={...current};delete next[name];return next});setField(name,parsed);}catch(error){setJsonErrors(current=>({...current,[name]:error.message==='Expected a JSON object.'||error.message==='Expected a JSON array.'?error.message:'Invalid JSON.'}));}}} placeholder={placeholder}/>{jsonErrors[name]?<small role="alert">{jsonErrors[name]}</small>:<small>Enter valid JSON.</small>}</label>;

  return <div className="pc-page">
    <div className="page-heading"><div className="eyebrow">CREATOR STUDIO · {draftId?'DRAFT EDITOR':'NEW CHALLENGE'}</div><h1>{initialCodebase?.state==='PUBLISHED'?'New version draft':draftId?'Edit codebase':'Create a codebase'}</h1><p>Build a complete debugging assessment. Draft changes save automatically after a short pause.</p></div>
    <div className="pc-toolbar"><span className={`save-state ${saving}`} aria-live="polite">{saving==='saving'||saving==='uploading'?<LoaderCircle size={14} className="spin"/>:<Check size={14}/>} {saving==='saving'?'Saving…':saving==='uploading'?'Importing files…':saving==='error'?'Save failed':draftId?`Saved · v${versionRef.current}`:'Not saved yet'}</span><div><button type="button" className="small-quiet" onClick={onCancel}><X size={14}/> Cancel</button><button type="button" className="small-quiet" onClick={openPreview}>Preview</button><button type="button" className="small-quiet" onClick={saveNow}><Save size={14}/> Save draft</button><button type="button" className="small-primary" disabled={!draftId} onClick={publish}><Send size={14}/> Publish</button></div></div>
    <form className="pc-form" onSubmit={event=>{event.preventDefault();saveNow()}}>
      <section className="pc-card"><header><span className="pc-step">01</span><div><h2>Challenge basics</h2><p>Give the challenge a clear name and candidate-facing summary.</p></div></header><div className="pc-grid">{field('Project title *','title','e.g. Repair the inventory sync service')}{field('Short description *','description','One sentence describing the challenge.',2)}{field('Detailed description *','detailedDescription','Project context and product behavior.',4)}<label className="pc-field">Difficulty<select value={form.difficulty} onChange={e=>setField('difficulty',e.target.value)}><option>Easy</option><option>Medium</option><option>Hard</option></select></label><label className="pc-field">Estimated minutes<input type="number" min="5" max="1000" value={form.estimatedMinutes} onChange={e=>setField('estimatedMinutes',Number(e.target.value))}/></label>{field('Category / domain','category','e.g. Payments')}{arrayField('Tags','tags')}{arrayField('Expected deliverables','expectedDeliverables')}</div></section>
      <section className="pc-card"><header><span className="pc-step">02</span><div><h2>Technical setup</h2><p>Document what a candidate needs to run and test the project.</p></div></header><div className="pc-grid">{arrayField('Programming languages','languages')}{arrayField('Frameworks','frameworks')}{arrayField('Libraries and technologies','technologies')}{jsonField('Runtime versions','runtimeVersions','{"node":"20"}',2)}{field('Database technology','databaseTechnology','e.g. PostgreSQL')}{arrayField('Required tools','requiredTools')}{arrayField('Dependencies','dependencies')}{commandField('Build command','build','npm run build')}{commandField('Start command','start','npm start')}{commandField('Test command','test','npm test')}{field('GitHub source URL (optional)','sourceUrl','https://github.com/owner/repository')}{arrayField('Prerequisites','prerequisites')}{field('Environment variable documentation','environmentDocumentation','Document variable names and safe example values.',3)}{field('Configuration instructions','configurationInstructions','Configuration notes.',3)}{arrayField('Expected project structure','expectedStructure')}{field('README content','readme','Project README for candidates.',5)}{field('Installation and setup instructions *','instructions','Steps for installing and running the project.',4)}</div></section>
      <section className="pc-card"><header><span className="pc-step">03</span><div><h2>Project source</h2><p>Import a bounded text-only ZIP or manage source files in local development storage.</p></div></header><div className="pc-imports"><label className="pc-upload"><Upload size={16}/> Upload ZIP<input type="file" accept=".zip,application/zip" onChange={onZip}/></label><div className="pc-github"><input value={githubUrl} onChange={e=>setGithubUrl(e.target.value)} placeholder="https://github.com/owner/repository"/><button type="button" className="small-quiet" onClick={importGithub}><Github size={14}/> Import public repo</button></div><p>ZIP limit: 10 MiB compressed, 8 MiB expanded, 300 UTF-8 text files, 1 MiB per file. GitHub fetching is currently disabled and will return an explicit error.</p></div>
        <div className="pc-files"><aside><div className="pc-file-search"><input value={fileSearch} onChange={e=>setFileSearch(e.target.value)} placeholder="Search files"/></div><div className="pc-file-list">{directories.map(dir=><div className="pc-folder" key={dir}>▸ {dir}<button type="button" title="Remove empty folder" onClick={async()=>{if(!draftId){setDirectories(ds=>ds.filter(x=>x!==dir));return;}try{await serialize(()=>api(`/creator/codebases/${draftId}/directories?path=${encodeURIComponent(dir)}`,{method:'DELETE'}));versionRef.current+=1;setDirectories(ds=>ds.filter(x=>x!==dir));}catch(e){onNotice?.(e.message)}}}>×</button></div>)}{visibleFiles.map(file=><div className={`pc-file ${activePath===file.path?'selected':''}`} key={file.path}><button type="button" onClick={()=>{setActivePath(file.path);setRenamePath(file.path)}}><FileCode2 size={13}/>{file.path}</button><button type="button" aria-label={`Delete ${file.path}`} onClick={()=>deleteFile(file.path)}>×</button></div>)}</div><div className="pc-file-actions"><input value={newFilePath} onChange={e=>setNewFilePath(e.target.value)} aria-label="New file path"/><button type="button" className="small-quiet" onClick={addFile}><FilePlus2 size={13}/> Add file</button><input value={newFolderPath} onChange={e=>setNewFolderPath(e.target.value)} aria-label="New folder path"/><button type="button" className="small-quiet" onClick={addFolder}><FolderPlus size={13}/> Add folder</button><div className="pc-rename"><input value={renamePath} onChange={e=>setRenamePath(e.target.value)} aria-label="Rename selected file"/><button type="button" className="small-quiet" onClick={renameFile}>Rename</button></div></div></aside><div className="pc-editor">{activeFile?<><div className="pc-editor-bar"><span>{activeFile.path}</span><span>{new TextEncoder().encode(activeFile.content||'').length} bytes · autosaves</span></div><textarea aria-label={`Source editor ${activeFile.path}`} spellCheck="false" value={activeFile.content||''} onChange={event=>setFiles(current=>current.map(file=>file.path===activePath?{...file,content:event.target.value}:file))}/></>:<div className="pc-file-empty"><FileCode2/><b>No file selected</b><span>Add a file or upload a ZIP archive.</span></div>}</div></div>
      </section>
      <section className="pc-card"><header><span className="pc-step">04</span><div><h2>Debugging challenge</h2><p>Separate candidate information from internal evaluation notes.</p></div></header><div className="pc-grid">{field('Candidate challenge / problem statement *','problemStatement','Explain what the candidate should investigate.',4)}{field('Bug title *','bugTitle','Short title for the defect')}{field('Bug description *','bugDescription','Describe the defect without giving away the fix.',4)}{field('Current incorrect behavior','currentBehavior','What the system currently does.',3)}{field('Expected behavior *','expectedBehavior','What should happen.',3)}{field('Actual behavior *','actualBehavior','What happens instead.',3)}{arrayField('Reproduction steps','reproductionSteps')}{arrayField('Relevant files','relevantFiles')}{arrayField('Relevant functions or components','relevantSymbols')}{field('Error messages or logs','errorLogs','Candidate-visible logs.',4)}{arrayField('Acceptance criteria *','acceptanceCriteria')}{arrayField('Public hints','publicHints')}</div></section>
      <section className="pc-card private-card"><header><span className="pc-step">05</span><div><h2>Private evaluation notes</h2><p>Stored server-side and excluded from candidate responses and preview.</p></div></header><div className="pc-grid">{field('Interviewer notes','privateNotes','Internal notes.',4)}{field('Intended bug explanation','intendedBugExplanation','Private root cause explanation.',4)}{field('Expected solution approach','solutionApproach','Internal rubric guidance.',4)}{jsonField('Evaluation rubric (JSON array)','evaluationRubric','[{"criterion":"Correctness","weight":1}]',4)}{arrayField('Hidden requirements','hiddenRequirements')}{jsonField('Hidden tests (JSON array)','hiddenTests','[{"input":"...","expected":"..."}]',4)}{arrayField('Internal references','internalReferences')}</div></section>
    </form>
    {preview&&<div className="detail-backdrop" role="presentation" onClick={()=>setPreview(null)}><section className="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="post-preview-title" onClick={e=>e.stopPropagation()}><div className="detail-top"><span className="eyebrow">CANDIDATE PREVIEW · PUBLIC FIELDS ONLY</span><button type="button" className="small-quiet" onClick={()=>setPreview(null)}>Close</button></div><h2 id="post-preview-title">{preview.title}</h2><p>{preview.description}</p><p>{preview.detailedDescription}</p><div className="meta">{preview.difficulty} · {preview.estimatedMinutes} min · {(preview.tags||[]).join(', ')}</div><h3>Debugging task</h3><p>{preview.bugDescription||preview.problemStatement}</p><h3>Setup</h3><p>{preview.instructions}</p><h3>Acceptance criteria</h3><ul>{preview.acceptanceCriteria?.map(value=><li key={value}>{value}</li>)}</ul><h3>Source files</h3>{preview.files?.map(file=><details key={file.path}><summary>{file.path}</summary><pre>{file.content}</pre></details>)}</section></div>}
  </div>;
}
