const SUPABASE_URL='https://nxyutzeplurgirgdivtd.supabase.co';
const SUPABASE_KEY='sb_publishable_gSJWywfwqb0ucXeqNcgu7g_kFJKTAF8';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

const state={view:'home',user:null,role:null,tasks:[],goLiveTasks:[],goLiveChecks:{},editingGoLiveId:null,system:'Bag Tagger',devices:[{id:'',results:{}}]};
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function setConnection(ok){$('#connectionState')?.classList.toggle('ok',!!ok);}
function openModal(id){const m=$(id); if(m){m.hidden=false;}}
function closeModal(id){const m=$(id); if(m){m.hidden=true;}}

function showView(view){
  if(view==='admin' && state.role!=='admin'){openModal('#authModal');return;}
  state.view=view;
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${view}`));
  $$('.nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  if(view==='testing') renderTesting();
  if(view==='go-live') renderGoLive();
  if(view==='admin') renderAdmin();
  window.scrollTo({top:0,behavior:'smooth'});
}

$$('[data-view]').forEach(el=>el.addEventListener('click',e=>{if(el.tagName==='BUTTON'||el.dataset.view){e.preventDefault();showView(el.dataset.view);$('#topNav')?.classList.remove('open')}}));
$('#mobileMenuBtn')?.addEventListener('click',()=>$('#topNav')?.classList.toggle('open'));
$('#authBtn')?.addEventListener('click',async()=>state.user?signOut():openModal('#authModal'));
$('#authClose')?.addEventListener('click',()=>closeModal('#authModal'));
$('#authModal')?.addEventListener('click',e=>{if(e.target.id==='authModal')closeModal('#authModal')});
$('#taskClose')?.addEventListener('click',()=>closeModal('#taskModal')); $('#taskCancel')?.addEventListener('click',()=>closeModal('#taskModal'));

async function getProfile(user){
  if(!user)return null;
  const {data,error}=await sb.from('user_roles').select('role,approval_status').eq('user_id',user.id).maybeSingle();
  if(error)throw error;
  return {role:data?.role||'staff',approved:(data?.approval_status==='approved'||data?.role==='admin')};
}

async function setUser(user){
  state.user=user||null; state.role=null;
  if(user){
    try{const profile=await getProfile(user); if(!profile.approved){await sb.auth.signOut();throw new Error('Your account is waiting for administrator approval.');} state.role=profile.role;}
    catch(e){state.user=null; $('#userChip').hidden=true; $('#authBtn').textContent='Sign in'; $('#adminNav').hidden=true; if(e.message?.includes('waiting')){showAuthMessage(e.message);openModal('#authModal');} return;}
  }
  $('#userChip').hidden=!state.user; $('#userChip').textContent=state.user?.email||''; $('#authBtn').textContent=state.user?'Sign out':'Sign in';
  $('#adminNav').hidden=state.role!=='admin';
  $('#welcomeTitle').textContent=state.user?`Welcome, ${formatName(state.user.email)}`:'Welcome to Voyager';
  setConnection(true);
  if(state.user) await loadTasks();
}
function formatName(email){const p=String(email||'').split('@')[0].split('.');return p.map(x=>x?x[0].toUpperCase()+x.slice(1):x).join(' ')}
function showAuthMessage(msg){const el=$('#authMessage');if(!el)return;el.textContent=msg;el.hidden=!msg;}

$('#authForm')?.addEventListener('submit',async e=>{e.preventDefault();showAuthMessage('');const email=$('#authEmail').value.trim().toLowerCase(),password=$('#authPassword').value;try{const {data,error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;await setUser(data.user);if(state.user)closeModal('#authModal');}catch(err){showAuthMessage(err.message||'Unable to sign in.');}});
async function signOut(){await sb.auth.signOut();state.user=null;state.role=null;$('#userChip').hidden=true;$('#authBtn').textContent='Sign in';$('#adminNav').hidden=true;showView('home');}

async function loadTasks(){
  if(!state.user)return;
  const [{data:testingTasks,error:testingError},{data:goLiveTasks,error:goLiveError}]=await Promise.all([
    sb.from('testing_tasks').select('id,system,name,description,sort_order,active,created_at').order('system').order('sort_order').order('created_at'),
    sb.from('go_live_tasks').select('id,name,description,sort_order,active,created_at').order('sort_order').order('created_at')
  ]);
  if(testingError){console.error(testingError);setConnection(false);return;}
  if(goLiveError){console.error(goLiveError);setConnection(false);return;}
  state.tasks=testingTasks||[];state.goLiveTasks=goLiveTasks||[];setConnection(true);
  renderSystemTabs();renderTesting();renderGoLive();renderAdmin();
}
function renderSystemTabs(){
  const box=$('#systemTabs'); if(!box)return;
  box.innerHTML=['Bag Tagger','Auto Bag Drop'].map(s=>`<button class="system-tab ${s===state.system?'active':''}" data-system="${esc(s)}">${s}</button>`).join('');
  $$('.system-tab').forEach(b=>b.addEventListener('click',()=>{state.system=b.dataset.system;renderSystemTabs();renderTesting()}));
}
function activeTasks(){return state.tasks.filter(t=>t.system===state.system&&t.active).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));}
function renderTesting(){
  const table=$('#testingTable'); if(!table)return; const tasks=activeTasks(); $('#testingTitle').textContent=`${state.system} Test Cases`;
  let html='<thead><tr><th>Device ID</th>'+tasks.map(t=>`<th>${esc(t.name)}</th>`).join('')+'</tr></thead><tbody>';
  state.devices.forEach((d,i)=>{html+=`<tr><td><input class="device-input" value="${esc(d.id)}" placeholder="e.g. SYDT3ABD001" data-device="${i}"><div class="check-set"><button class="btn secondary" data-pass-all="${i}">✓ Pass All</button><button class="btn secondary" data-reset-row="${i}">↻ Reset</button></div></td>`;tasks.forEach(t=>{const r=d.results[t.id]||'';html+=`<td><div class="check-set"><button class="check pass ${r==='pass'?'sel':''}" data-result="${i}|${t.id}|pass">✓</button><button class="check fail ${r==='fail'?'sel':''}" data-result="${i}|${t.id}|fail">✕</button></div></td>`});html+='</tr>'});
  html+='</tbody>';table.className='test-table';table.innerHTML=html;updateTestingSummary();
  $$('.device-input').forEach(inp=>inp.addEventListener('input',()=>{state.devices[Number(inp.dataset.device)].id=inp.value.trim()}));
  $$('[data-result]').forEach(b=>b.addEventListener('click',()=>{const [i,id,res]=b.dataset.result.split('|');state.devices[+i].results[id]=res;renderTesting()}));
  $$('[data-pass-all]').forEach(b=>b.addEventListener('click',()=>{const d=state.devices[+b.dataset.passAll];tasks.forEach(t=>d.results[t.id]='pass');renderTesting()}));
  $$('[data-reset-row]').forEach(b=>b.addEventListener('click',()=>{state.devices[+b.dataset.resetRow].results={};renderTesting()}));
}
function updateTestingSummary(){const tasks=activeTasks();const total=tasks.length*state.devices.length;const complete=state.devices.reduce((n,d)=>n+tasks.filter(t=>d.results[t.id]).length,0);$('#testingSummary').textContent=`${complete} / ${total} tests`}
$('#addDeviceBtn')?.addEventListener('click',()=>{state.devices.push({id:'',results:{}});renderTesting()});

$('#saveTestingBtn')?.addEventListener('click',()=>alert('Foundation only: save-to-Supabase will be wired next without changing the Testing UI.'));
$('#exportTestingBtn')?.addEventListener('click',()=>{const tasks=activeTasks();const rows=[['Device ID',...tasks.map(t=>t.name)],...state.devices.map(d=>[d.id,...tasks.map(t=>d.results[t.id]==='pass'?'Yes':'')])];const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv'}));a.download=`voyager-${state.system.toLowerCase().replaceAll(' ','-')}-testing.csv`;a.click();});


function activeGoLiveTasks(){
  return state.goLiveTasks.filter(t=>t.active).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
}
function renderGoLive(){
  const box=$('#goLiveTaskList'); if(!box)return;
  const tasks=activeGoLiveTasks();
  const complete=tasks.filter(t=>state.goLiveChecks[t.id]).length;
  $('#goLiveProgressText').textContent=`${complete} / ${tasks.length} complete`;
  const fill=$('#goLiveProgressFill'); if(fill) fill.style.width=tasks.length?`${Math.round(complete/tasks.length*100)}%`:'0%';
  if(!tasks.length){box.innerHTML='<div class="card placeholder"><strong>No active checklist tasks</strong><span>An administrator can add tasks from the Admin panel.</span></div>';return;}
  box.innerHTML=tasks.map((t,i)=>{
    const checked=!!state.goLiveChecks[t.id];
    return `<label class="go-live-item ${checked?'checked':''}">\
      <input type="checkbox" data-go-live-check="${esc(t.id)}" ${checked?'checked':''}>\
      <span class="go-live-check">✓</span>\
      <span class="go-live-copy"><strong>${i+1}. ${esc(t.name)}</strong><small>${esc(t.description||'No completion criteria supplied.')}</small></span>\
    </label>`;
  }).join('');
  $$('[data-go-live-check]').forEach(box=>box.addEventListener('change',()=>{state.goLiveChecks[box.dataset.goLiveCheck]=box.checked;renderGoLive();}));
}

$('#resetGoLiveBtn')?.addEventListener('click',()=>{state.goLiveChecks={};renderGoLive();});

function renderAdminGoLiveTasks(){
  const box=$('#adminGoLiveTaskList'); if(!box)return;
  if(state.role!=='admin'){box.innerHTML='';return;}
  const rows=[...state.goLiveTasks].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  box.innerHTML=rows.length?rows.map(t=>`<div class="admin-row go-live-admin-row">\
    <div>☷</div><div><strong>${esc(t.name)}</strong><span>${esc(t.description||'No description supplied.')}</span></div>\
    <div><span class="status ${t.active?'active':'inactive'}">${t.active?'Active':'Inactive'}</span></div>\
    <div class="admin-row-actions"><button class="btn secondary" data-edit-go-live="${esc(t.id)}">Edit</button><button class="btn secondary" data-toggle-go-live="${esc(t.id)}">${t.active?'Deactivate':'Activate'}</button><button class="btn danger" data-delete-go-live="${esc(t.id)}">Delete</button></div>\
  </div>`).join(''):'<div class="placeholder small"><strong>No checklist tasks yet</strong><span>Use + Add Checklist Task to create the first one.</span></div>';
  $$('[data-edit-go-live]').forEach(b=>b.addEventListener('click',()=>openGoLiveTaskModal(b.dataset.editGoLive)));
  $$('[data-toggle-go-live]').forEach(b=>b.addEventListener('click',()=>toggleGoLiveTask(b.dataset.toggleGoLive)));
  $$('[data-delete-go-live]').forEach(b=>b.addEventListener('click',()=>deleteGoLiveTask(b.dataset.deleteGoLive)));
}

async function toggleGoLiveTask(id){
  if(state.role!=='admin')return;
  const t=state.goLiveTasks.find(x=>String(x.id)===String(id)); if(!t)return;
  const {error}=await sb.from('go_live_tasks').update({active:!t.active,updated_at:new Date().toISOString()}).eq('id',t.id);
  if(error){alert(error.message);return;} await loadTasks();
}
async function deleteGoLiveTask(id){
  if(state.role!=='admin')return;
  const t=state.goLiveTasks.find(x=>String(x.id)===String(id)); if(!t)return;
  if(!confirm(`Delete "${t.name}" permanently?`))return;
  const {error}=await sb.from('go_live_tasks').delete().eq('id',t.id);
  if(error){alert(error.message);return;} delete state.goLiveChecks[id]; await loadTasks();
}
function openGoLiveTaskModal(id=null){
  if(state.role!=='admin')return;
  state.editingGoLiveId=id;
  const t=id?state.goLiveTasks.find(x=>String(x.id)===String(id)):null;
  $('#goLiveTaskModalTitle').textContent=t?'Edit checklist task':'Add checklist task';
  $('#goLiveTaskName').value=t?.name||'';
  $('#goLiveTaskDescription').value=t?.description||'';
  $('#goLiveTaskOrder').value=t?.sort_order||((state.goLiveTasks.reduce((m,x)=>Math.max(m,x.sort_order||0),0)||0)+1);
  openModal('#goLiveTaskModal');
}
$('#addGoLiveTaskBtn')?.addEventListener('click',()=>openGoLiveTaskModal());
$('#goLiveTaskClose')?.addEventListener('click',()=>closeModal('#goLiveTaskModal'));
$('#goLiveTaskCancel')?.addEventListener('click',()=>closeModal('#goLiveTaskModal'));
$('#goLiveTaskSave')?.addEventListener('click',async()=>{
  if(state.role!=='admin')return;
  const name=$('#goLiveTaskName').value.trim(),description=$('#goLiveTaskDescription').value.trim()||null,sort_order=Math.max(1,Number($('#goLiveTaskOrder').value)||1);
  if(!name)return $('#goLiveTaskName').focus();
  const payload={name,description,sort_order,active:true,updated_at:new Date().toISOString()};
  let error=null;
  if(state.editingGoLiveId){({error}=await sb.from('go_live_tasks').update(payload).eq('id',state.editingGoLiveId));}
  else {({error}=await sb.from('go_live_tasks').insert(payload));}
  if(error){alert(error.message);return;}
  state.editingGoLiveId=null;closeModal('#goLiveTaskModal');await loadTasks();
});

function renderAdmin(){
  const box=$('#adminTaskList'); if(!box)return; if(state.role!=='admin'){box.innerHTML='';return;}
  const rows=state.tasks.filter(t=>t.system==='Bag Tagger' || t.system==='Auto Bag Drop').sort((a,b)=>a.system.localeCompare(b.system)||((a.sort_order||0)-(b.sort_order||0)));
  box.innerHTML=rows.map(t=>`<div class="admin-row"><div>☷</div><div><strong>${esc(t.name)}</strong><span>${esc(t.system)} · ${esc(t.description||'No description supplied.')}</span></div><div><span class="status">${t.active?'Active':'Inactive'}</span></div><div><button class="btn secondary" data-toggle-task="${esc(t.id)}">${t.active?'Deactivate':'Activate'}</button></div></div>`).join('');
  $$('[data-toggle-task]').forEach(b=>b.addEventListener('click',async()=>{const t=state.tasks.find(x=>String(x.id)===String(b.dataset.toggleTask));if(!t)return;const {error}=await sb.from('testing_tasks').update({active:!t.active,updated_at:new Date().toISOString()}).eq('id',t.id);if(error)return alert(error.message);await loadTasks()}));
  renderAdminGoLiveTasks();
}
$('#addTaskBtn')?.addEventListener('click',()=>{if(state.role!=='admin')return;$('#taskName').value='';$('#taskDescription').value='';$('#taskOrder').value='1';openModal('#taskModal')});
$('#taskSave')?.addEventListener('click',async()=>{const name=$('#taskName').value.trim(),description=$('#taskDescription').value.trim()||null,system=$('#taskSystem').value,sort_order=Math.max(1,Number($('#taskOrder').value)||1);if(!name)return;const {error}=await sb.from('testing_tasks').insert({system,name,description,sort_order,active:true});if(error){alert(error.message);return}closeModal('#taskModal');await loadTasks()});

sb.auth.getSession().then(({data})=>setUser(data.session?.user||null)).catch(console.error);sb.auth.onAuthStateChange((_e,session)=>{if(session?.user) setUser(session.user);});
renderSystemTabs();renderTesting();
