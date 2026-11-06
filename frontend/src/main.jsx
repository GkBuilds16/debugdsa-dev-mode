import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Bug, ChevronRight, Code2, Compass, FolderGit2, Plus, Search, Swords, Layers3, ArrowUpRight } from 'lucide-react';
import CreatorDashboard from './modules/post-codebase/CreatorDashboard.jsx';
import PostCodebasePage from './modules/post-codebase/PostCodebasePage.jsx';
import CandidateWorkspace from './modules/view-codebases/CandidateWorkspace.jsx';
import BattlesPage from './modules/battles/BattlesPage.jsx';
import { apiFetch } from './apiClient.js';
import './style.css';

const tabs=[['overview','Overview'],['post','Post codebase'],['view','View codebases'],['battles','Battles']];
const api=async(path,options={})=>{const response=await apiFetch(path,options);const body=response.status===204?null:await response.json();if(!response.ok)throw new Error(body?.error?.message||'Request failed');return body};

function App(){
  const [tab,setTab]=useState('overview'),[battles,setBattles]=useState([]),[busy,setBusy]=useState(false),[query,setQuery]=useState(''),[filter,setFilter]=useState(''),[notice,setNotice]=useState(''),[editing,setEditing]=useState(null),[discovered,setDiscovered]=useState([]),[selected,setSelected]=useState(null),[apiStatus,setApiStatus]=useState('Checking'),[postDirty,setPostDirty]=useState(false),[candidateDirty,setCandidateDirty]=useState(false),[battleDirty,setBattleDirty]=useState(false);
  const refresh=async()=>{setBusy(true);try{const result=await api('/codebase-battles');setBattles(result.data||[]);await searchDiscovery(query,filter)}catch(error){setNotice(error.message)}finally{setBusy(false)}};
  const searchDiscovery=async(q=query,difficulty=filter)=>{const result=await api(`/codebases?q=${encodeURIComponent(q)}${difficulty?`&difficulty=${encodeURIComponent(difficulty)}`:''}`);setDiscovered(result.data||[])};
  useEffect(()=>{api('/health').then(result=>setApiStatus(result.data.database==='connected'?'Connected':'API up · DB disconnected')).catch(()=>setApiStatus('Unavailable'));refresh()},[]);
  const navigate=next=>{if(tab==='post'&&next!=='post'&&postDirty&&!window.confirm('Leave the editor? The latest draft is autosaving.'))return;if(tab==='view'&&next!=='view'&&candidateDirty&&!window.confirm('Leave the candidate workspace? Some edits may still be saving.'))return;if(tab==='battles'&&next!=='battles'&&battleDirty&&!window.confirm('Leave the battle workspace? Changes that have not finished saving will be lost.'))return;setPostDirty(false);setCandidateDirty(false);setBattleDirty(false);setTab(next)};
  const newCodebase=()=>{setEditing(null);setPostDirty(false);setTab('post')};
  const openEdit=async id=>{try{let result=await api(`/creator/codebases/${id}`);if(result.data.state==='PUBLISHED')result=await api(`/creator/codebases/${id}/versions`,{method:'POST',body:'{}'});setEditing(result.data);setTab('post');setPostDirty(false)}catch(error){setNotice(error.message)}};
  const donePost=()=>{setEditing(null);setPostDirty(false);setTab('overview');refresh()};
  return <div className="shell"><aside className="sidebar"><div className="brand"><span className="brand-mark"><Bug size={19}/></span><span>debug<span className="brand-light">dsa</span><small>DEV MODE</small></span></div><div className="workspace-label">WORKSPACE</div><nav>{tabs.map(([key,label],index)=><button className={`nav-item ${tab===key?'active':''}`} key={key} onClick={()=>navigate(key)}>{index===0?<Layers3/>:index===1?<Plus/>:index===2?<Compass/>:<Swords/>}<span>{label}</span>{key==='battles'&&<span className="nav-count">{battles.length}</span>}</button>)}</nav><div className="side-bottom"><div className="connection"><i/>Local workspace</div><div className="identity"><div className="avatar">KD</div><div><b>Dev account</b><small>Integration preview</small></div></div></div></aside>
    <main className="main"><header className="topbar"><div className="crumb">Dev Mode <ChevronRight size={14}/><b>{tabs.find(item=>item[0]===tab)?.[1]}</b></div><div className="top-actions"><span className="env-chip">LOCAL ENVIRONMENT</span><button className="icon-button" title="Explore codebases" aria-label="Explore codebases" onClick={()=>navigate('view')}><Search size={17}/></button><div className="user-dot" aria-label="Local development identity">K</div></div></header>
      {notice&&<div className="notice" role="status">{notice}<button aria-label="Dismiss notification" onClick={()=>setNotice('')}>×</button></div>}
      <div className="content">
        {tab==='overview'&&<CreatorDashboard onCreate={newCodebase} onEdit={openEdit} onNotice={setNotice}/>}
        {tab==='post'&&<PostCodebasePage key={editing?editing._id:'new'} initialCodebase={editing} onDirtyChange={setPostDirty} onNotice={setNotice} onCancel={()=>navigate('overview')} onSaved={donePost}/>}
        {tab==='view'&&<CandidateWorkspace onNotice={setNotice} onDirtyChange={setCandidateDirty}/>}
        {tab==='battles'&&<BattlesPage onNotice={setNotice} onDirtyChange={setBattleDirty}/>}
      </div><footer>DEBUGDSA DEV MODE <span>·</span> Independent integration module <span className="footer-right">API v1 <i/> {apiStatus}</span></footer>
    </main>
    {selected&&<div className="detail-backdrop" role="presentation" onClick={()=>setSelected(null)}><section className="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="candidate-title" onClick={event=>event.stopPropagation()}><div className="detail-top"><span className="eyebrow">CODEBASE DETAILS</span><button className="small-quiet" onClick={()=>setSelected(null)}>Close</button></div><h2 id="candidate-title">{selected.title}</h2><span className={`badge ${selected.difficulty?.toLowerCase()}`}>{selected.difficulty}</span><p>{selected.bugDescription||selected.problemStatement}</p><h3>Setup instructions</h3><p>{selected.instructions||'No setup instructions provided.'}</p><h3>Source files</h3>{selected.files?.map(file=><details key={file.path}><summary>{file.path}</summary><pre>{file.content}</pre></details>)}</section></div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
