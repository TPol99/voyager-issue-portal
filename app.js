const SUPABASE_URL='https://nxyutzeplurgirgdivtd.supabase.co';
const SUPABASE_KEY='sb_publishable_gSJWywfwqb0ucXeqNcgu7g_kFJKTAF8';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

const state={view:'home',user:null,role:null,approval:null,tasks:[],goLiveTasks:[],goLiveChecks:{},testingSystem:'Bag Tagger',testingDevices:[{id:'',results:{}}],testingRunDirty:false,adminTaskSystem:'Bag Tagger',editingTaskId:null,editingGoLiveId:null};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const emailOk=e=>/^[^@\s]+@virginaustralia\.com$/i.test(e.trim());

function setConnected(ok){$('#connectionPill')?.classList.toggle('ok',!!ok);}
function openModal(id){const m=$(id);if(m)m.hidden=false;}
function closeModal(id){const m=$(id);if(m)m.hidden=true;}
function formatName(email){return String(email||'').split('@')[0].split('.').map(x=>x?x[0].toUpperCase()+x.slice(1):x).join(' ');}
function setMessage(id,text,kind='error'){const el=$(id);if(!el)return;el.textContent=text;el.hidden=!text;if(kind==='success'){el.style.background='var(--greenBg)';el.style.color='var(--green)';}else{el.style.background='var(--redBg)';el.style.color='var(--red)';}}
function isLoggedIn(){return !!state.user;}
function isAdmin(){return state.role==='admin';}

function showView(view){
  const protectedViews=new Set(['issues','my-issues','testing','go-live','knowledge','admin']);
  if(protectedViews.has(view)&&!isLoggedIn()){openModal('#authModal');return;}
  if(view==='admin'&&!isAdmin()){openModal('#authModal');return;}
  state.view=view;
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${view}`));
  $$('.nav-link[data-view]').forEach(v=>v.classList.toggle('active',v.dataset.view===view));
  $('#mainNav')?.classList.remove('open');
  if(view==='testing')renderTesting();
  if(view==='go-live')renderGoLive();
  if(view==='my-issues')loadMyIssues();
  if(view==='admin')refreshAdmin();
  window.scrollTo({top:0,behavior:'smooth'});
}
$$('[data-view]').forEach(el=>el.addEventListener('click',e=>{if(el.tagName==='A')return;e.preventDefault();showView(el.dataset.view);}));
$('#mobileMenuBtn')?.addEventListener('click',()=>$('#mainNav')?.classList.toggle('open'));
$('#authBtn')?.addEventListener('click',()=>state.user?signOut():openModal('#authModal'));
$('#authClose')?.addEventListener('click',()=>closeModal('#authModal'));$('#authModal')?.addEventListener('click',e=>{if(e.target.id==='authModal')closeModal('#authModal')});
$('#switchToCreate')?.addEventListener('click',()=>toggleAuthMode(true));
let authCreateMode=false;
function toggleAuthMode(create){authCreateMode=create;$('#authTitle').textContent=create?'Create account':'Sign in';$('#authSubtitle').textContent=create?'Create an account. An administrator must approve access before you can use staff features.':'Sign in to use staff features.';$('#authPassword').autocomplete=create?'new-password':'current-password';$('#rememberMe').parentElement.style.display=create?'none':'flex';$('#authForm button[type="submit"]').textContent=create?'Create account':'Sign in';$('#switchToCreate').textContent=create?'Back to sign in':'Create account';setMessage('#authMessage','');}

toggleAuthMode(false);

async function currentAccess(user){if(!user)return {role:null,approved:false,status:'pending'};const {data,error}=await sb.from('user_roles').select('role,approval_status').eq('user_id',user.id).maybeSingle();if(error)throw error;const role=data?.role||'staff';const status=data?.approval_status||(role==='admin'?'approved':'pending');return {role,approved:status==='approved'||role==='admin',status};}

function updateAuthUI(){
  $('#userPill').hidden=!state.user;$('#userPill').textContent=state.user?.email||'';$('#authBtn').textContent=state.user?'Sign out':'Sign in';$('#adminNav').hidden=!isAdmin();
  $('#homeAccessState').textContent=state.user?(isAdmin()?'Administrator':'Staff'):'Public';$('#welcomeTitle').textContent=state.user?`Welcome, ${formatName(state.user.email)}`:'Welcome to VA FAX';
}

async function setUser(user){
  state.user=user||null;state.role=null;state.approval=null;updateAuthUI();
  if(!user){setConnected(true);return;}
  try{const access=await currentAccess(user);state.role=access.role;state.approval=access;if(!access.approved){await sb.auth.signOut();state.user=null;state.role=null;updateAuthUI();openModal('#authModal');setMessage('#authMessage','Your account is waiting for administrator approval. Please try again once an administrator has approved your access.');return;}await loadAllData();setConnected(true);}
  catch(e){console.error(e);setConnected(false);setMessage('#authMessage','Could not verify your Voyager access: '+(e.message||e));openModal('#authModal');}
}

$('#authForm')?.addEventListener('submit',async e=>{e.preventDefault();const email=$('#authEmail').value.trim().toLowerCase(),password=$('#authPassword').value;setMessage('#authMessage','');if(!emailOk(email)){setMessage('#authMessage','Only @virginaustralia.com addresses can use VA FAX.');return;}if(password.length<8){setMessage('#authMessage','Password must be at least 8 characters.');return;}
  try{
    if(authCreateMode){
      const {data,error}=await sb.auth.signUp({email,password,options:{data:{full_name:formatName(email)},emailRedirectTo:location.href}});if(error)throw error;if(data.session){await sb.auth.signOut();}setMessage('#authMessage','Account created. Your account is now waiting for administrator approval. You can sign in as soon as an administrator approves it.','success');return;
    }
    const {data,error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;await setUser(data.user);if(state.user)closeModal('#authModal');
  }catch(err){setMessage('#authMessage',err.message||'Unable to complete sign in.');}
});
async function signOut(){try{await sb.auth.signOut();}finally{state.user=null;state.role=null;state.approval=null;updateAuthUI();showView('home');}}

async function loadAllData(){await Promise.all([loadTasks(),loadGoLiveTasks(),loadMyIssues(),loadTestingRuns()]);if(isAdmin())await refreshAdmin();updateAuthUI();}

async function loadTasks(){if(!state.user)return;const {data,error}=await sb.from('testing_tasks').select('id,system,name,description,sort_order,active,created_at,updated_at').order('system').order('sort_order').order('created_at');if(error)throw error;state.tasks=data||[];renderSystemTabs();renderTesting();renderAdminTasks();$('#homeTaskCount').textContent=state.tasks.filter(t=>t.active).length;}
async function loadGoLiveTasks(){if(!state.user)return;const {data,error}=await sb.from('go_live_tasks').select('id,name,description,sort_order,active,created_at,updated_at').order('sort_order').order('created_at');if(error)throw error;state.goLiveTasks=data||[];renderGoLive();renderAdminGoLiveTasks();$('#homeGoLiveCount').textContent=state.goLiveTasks.filter(t=>t.active).length;}
function renderSystemTabs(){const box=$('#systemTabs');if(!box)return;box.innerHTML=['Bag Tagger','Auto Bag Drop'].map(s=>`<button type="button" class="system-tab ${s===state.testingSystem?'active':''}" data-system="${esc(s)}">${esc(s)}</button>`).join('');$$('.system-tab').forEach(b=>b.addEventListener('click',()=>{state.testingSystem=b.dataset.system;state.testingDevices=[{id:'',results:{}}];state.testingRunDirty=false;renderSystemTabs();renderTesting();}));}
function activeTestingTasks(){return state.tasks.filter(t=>t.system===state.testingSystem&&t.active).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));}
function renderTesting(){const table=$('#testingTable');if(!table)return;const tasks=activeTestingTasks();$('#testingTitle').textContent=`${state.testingSystem} Test Cases`;let head=`<thead><tr><th>Device ID</th>${tasks.map(t=>`<th>${esc(t.name)}</th>`).join('')}</tr></thead><tbody>`;for(const [i,d] of state.testingDevices.entries()){const failed=tasks.filter(t=>d.results[t.id]==='fail');head+=`<tr><td><input class="device-input" data-device="${i}" value="${esc(d.id)}" placeholder="e.g. SYDT3ABD001"><div class="device-actions"><button class="mini" data-pass-all="${i}">✓ Pass All</button><button class="mini" data-reset-row="${i}">↻ Reset</button>${state.testingDevices.length>1?`<button class="mini" data-remove-row="${i}">Remove</button>`:''}</div>${failed.length?`<div class="raise-row"><span>${failed.length} failed test${failed.length===1?'':'s'}</span><button class="raise-btn" data-raise-device="${i}">⚠ Raise Issue</button></div>`:''}</td>`;for(const t of tasks){const r=d.results[t.id]||'';head+=`<td><div class="check-set"><button class="check pass ${r==='pass'?'sel':''}" title="Pass" data-result="${i}|${t.id}|pass">✓</button><button class="check fail ${r==='fail'?'sel':''}" title="Fail" data-result="${i}|${t.id}|fail">✕</button></div></td>`;}head+='</tr>';}table.innerHTML=head+'</tbody>';updateTestingSummary();
  $$('.device-input').forEach(inp=>{
  inp.addEventListener('input',()=>{state.testingDevices[+inp.dataset.device].id=inp.value.trim();state.testingRunDirty=true;});
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const i=+inp.dataset.device;const nextIndex=i+1;if(!state.testingDevices[nextIndex]){state.testingDevices.push({id:'',results:{}});}state.testingRunDirty=true;renderTesting();requestAnimationFrame(()=>document.querySelector(`.device-input[data-device=\"${nextIndex}\"]`)?.focus());}});
});
  $$('[data-result]').forEach(btn=>btn.addEventListener('click',()=>{const [i,id,r]=btn.dataset.result.split('|');state.testingDevices[+i].results[id]=r;state.testingRunDirty=true;renderTesting();}));
  $$('[data-pass-all]').forEach(btn=>btn.addEventListener('click',()=>{const d=state.testingDevices[+btn.dataset.passAll];tasks.forEach(t=>d.results[t.id]='pass');state.testingRunDirty=true;renderTesting();}));
  $$('[data-reset-row]').forEach(btn=>btn.addEventListener('click',()=>{state.testingDevices[+btn.dataset.resetRow].results={};state.testingRunDirty=true;renderTesting();}));
  $$('[data-remove-row]').forEach(btn=>btn.addEventListener('click',()=>{state.testingDevices.splice(+btn.dataset.removeRow,1);state.testingDevices=state.testingDevices.length?state.testingDevices:[{id:'',results:{}}];state.testingRunDirty=true;renderTesting();}));
  $$('[data-raise-device]').forEach(btn=>btn.addEventListener('click',()=>openIssueFromFailedDevice(+btn.dataset.raiseDevice)));
}
function updateTestingSummary(){const tasks=activeTestingTasks(),total=tasks.length*state.testingDevices.length,complete=state.testingDevices.reduce((n,d)=>n+tasks.filter(t=>d.results[t.id]).length,0);$('#testingSummary').textContent=`${complete} / ${total} tests complete`;}
$('#addDeviceBtn')?.addEventListener('click',()=>{state.testingDevices.push({id:'',results:{}});state.testingRunDirty=true;renderTesting();});
$('#resetTestingBtn')?.addEventListener('click',()=>{state.testingDevices=[{id:'',results:{}}];state.testingRunDirty=false;renderTesting();});
$('#testingReference')?.addEventListener('input',()=>{if(state.testingRunDirty===false)state.testingRunDirty=true;});
$('#testingPort')?.addEventListener('change',()=>{state.testingRunDirty=true;});
function openIssueFromFailedDevice(index){
  const tasks=activeTestingTasks(),failed=tasks.filter(t=>state.testingDevices[index].results[t.id]==='fail');
  if(!failed.length)return;
  $('#issueSystem').value=state.testingSystem;
  $('#issuePort').value=$('#testingPort').value||'';
  $('#issueDevice').value=state.testingDevices[index].id||'';
  $('#issueTerminal').value='';
  $('#issueEnvironment').value='Testing/CERT';
  $('#issueUrgency').value='High';
  $('#issueCategory').value='Other issues';
  $('#issuePnr').value='';
  $('#issueDescription').value=failed.map(t=>`${t.name} failed.`).join('\n');
  const modal=$('#issuePreviewModal');
  if(modal){
    $('#issuePreviewSummary').textContent=`${failed.length} failed test${failed.length===1?'':'s'} on ${state.testingDevices[index].id||'this device'}`;
    modal.hidden=false;
  }
}

$('#saveTestingBtn')?.addEventListener('click',async()=>{
  if(!isLoggedIn())return openModal('#authModal');
  const tasks=activeTestingTasks(),port=$('#testingPort').value;
  if(!port){setMessage('#testingMessage','Select a port before saving.');return;}
  const named=state.testingDevices.filter(d=>d.id.trim());
  if(!named.length){setMessage('#testingMessage','Enter at least one Device ID.');return;}
  const complete=state.testingDevices.reduce((n,d)=>n+tasks.filter(t=>d.results[t.id]).length,0);
  const results=[];
  state.testingDevices.forEach(d=>tasks.forEach(t=>results.push({device_id:d.id.trim(),test_case:t.name,result:d.results[t.id]||'untested'})));
  try{
    const {data,error}=await sb.rpc('save_testing_run',{
      p_port:port,
      p_system:state.testingSystem,
      p_run_reference:$('#testingReference').value.trim()||null,
      p_tested_by_name:formatName(state.user.email),
      p_results:results
    });
    if(error)throw error;
    state.testingDevices=[{id:'',results:{}}];
    state.testingRunDirty=false;
    renderTesting();
    await loadTestingRuns();
    setMessage('#testingMessage',`Testing run saved as ${data?.id||'successfully'}.`,'success');
  }catch(err){
    setMessage('#testingMessage','Could not save testing: '+(err.message||err));
  }
});

function csvEscape(v){const s=String(v??'');return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;}
$('#exportTestingBtn')?.addEventListener('click',()=>{const tasks=activeTestingTasks();const rows=[['Device ID',...tasks.map(t=>t.name)],...state.testingDevices.map(d=>[d.id,...tasks.map(t=>d.results[t.id]==='pass'?'Yes':'')])];const csv='\ufeff'+rows.map(r=>r.map(csvEscape).join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`va-fax-${state.testingSystem.toLowerCase().replaceAll(' ','-')}-testing.csv`;a.click();});

async function loadTestingRuns(){if(!state.user)return;const {data,error}=await sb.from('testing_runs').select('id,created_at,port,system,run_reference,tested_by_name,device_count,total_tests,completed_tests').eq('tested_by_user_id',state.user.id).order('created_at',{ascending:false}).limit(100);if(error){console.warn(error);return;}const table=$('#testingHistoryTable');if(!table)return;const rows=data||[];table.innerHTML=rows.length?`<thead><tr><th>Date</th><th>Port</th><th>System</th><th>Reference</th><th>Devices</th><th>Completion</th><th>Export</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(new Date(r.created_at).toLocaleString('en-AU'))}</td><td>${esc(r.port)}</td><td>${esc(r.system)}</td><td>${esc(r.run_reference||'')}</td><td>${r.device_count||0}</td><td>${r.total_tests?Math.round((r.completed_tests||0)/r.total_tests*100):0}%</td><td><button class="mini" data-export-run="${esc(r.id)}">⇩ CSV</button></td></tr>`).join('')}</tbody>`:'<tbody><tr><td colspan="7" style="text-align:left;color:var(--muted)">No saved testing runs yet.</td></tr></tbody>';$('[data-export-run]')&&$$('[data-export-run]').forEach(b=>b.addEventListener('click',()=>exportSavedRun(b.dataset.exportRun)));}
$('#refreshTestingHistory')?.addEventListener('click',loadTestingRuns);
async function exportSavedRun(runId){const {data,error}=await sb.from('testing_results').select('device_id,test_case,result,created_at').eq('run_id',runId).order('created_at');if(error){alert(error.message);return;}const tests=[];const devices=[];for(const r of data||[]){if(!tests.includes(r.test_case))tests.push(r.test_case);if(!devices.includes(r.device_id))devices.push(r.device_id);}const lines=[['Device ID',...tests],...devices.map(d=>{const rows=(data||[]).filter(r=>r.device_id===d);const map=new Map(rows.map(r=>[r.test_case,r.result]));return [d,...tests.map(t=>map.get(t)==='pass'?'Yes':'')]} )];const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+lines.map(r=>r.map(csvEscape).join(',')).join('\r\n')],{type:'text/csv'}));a.download=`va-fax-${runId}.csv`;a.click();}

function activeGoLive(){return state.goLiveTasks.filter(t=>t.active).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));}
function renderGoLive(){const box=$('#goLiveTaskList');if(!box)return;const tasks=activeGoLive(),complete=tasks.filter(t=>state.goLiveChecks[t.id]).length;$('#goLiveProgressText').textContent=`${complete} / ${tasks.length} complete`;$('#goLiveProgressFill').style.width=tasks.length?`${Math.round(complete/tasks.length*100)}%`:'0%';box.innerHTML=tasks.length?tasks.map((t,i)=>`<label class="go-live-item ${state.goLiveChecks[t.id]?'checked':''}"><input type="checkbox" data-go-live="${esc(t.id)}" ${state.goLiveChecks[t.id]?'checked':''}><span class="go-live-check">✓</span><span class="go-live-copy"><strong>${i+1}. ${esc(t.name)}</strong><small>${esc(t.description||'No completion criteria supplied.')}</small></span>${state.goLiveChecks[t.id]?'<span class="status">Complete</span>':''}</label>`).join(''):'<div class="card placeholder"><strong>No active checklist tasks.</strong><span>An administrator can add them from Admin.</span></div>';
$$('[data-go-live]').forEach(cb=>cb.addEventListener('change',()=>{state.goLiveChecks[cb.dataset.goLive]=cb.checked;renderGoLive();}));}
$('#resetGoLiveBtn')?.addEventListener('click',()=>{state.goLiveChecks={};renderGoLive();});

function renderAdminTasks(){const box=$('#adminTaskList');if(!box||!isAdmin())return;const rows=state.tasks.filter(t=>t.system===state.adminTaskSystem).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));box.innerHTML=rows.length?rows.map(t=>`<div class="admin-row"><div>☷</div><div class="admin-main"><strong>${esc(t.name)}</strong><span>${esc(t.description||'No description supplied.')}</span></div><div><span class="status ${t.active?'':'inactive'}">${t.active?'Active':'Inactive'}</span><div class="admin-actions" style="margin-top:6px"><button class="mini" data-edit-task="${esc(t.id)}">Edit</button><button class="mini" data-toggle-task="${esc(t.id)}">${t.active?'Deactivate':'Activate'}</button><button class="mini" data-delete-task="${esc(t.id)}">Delete</button></div></div></div>`).join(''):'<div class="placeholder"><strong>No tasks in this system.</strong><span>Use Add Test Task to create one.</span></div>';
$$('[data-edit-task]').forEach(b=>b.addEventListener('click',()=>openTaskModal(b.dataset.editTask)));$$('[data-toggle-task]').forEach(b=>b.addEventListener('click',()=>toggleTask(b.dataset.toggleTask)));$$('[data-delete-task]').forEach(b=>b.addEventListener('click',()=>deleteTask(b.dataset.deleteTask)));}
$$('[data-admin-system]')?.forEach?.(()=>{});
$$('.admin-filter').forEach(b=>b.addEventListener('click',()=>{state.adminTaskSystem=b.dataset.adminSystem;$$('.admin-filter').forEach(x=>x.classList.toggle('active',x===b));renderAdminTasks();}));
function openTaskModal(id=null){if(!isAdmin())return;state.editingTaskId=id;const t=id?state.tasks.find(x=>String(x.id)===String(id)):null;$('#taskModalTitle').textContent=t?'Edit test case':'Add test case';$('#taskName').value=t?.name||'';$('#taskDescription').value=t?.description||'';$('#taskOrder').value=t?.sort_order||((Math.max(0,...state.tasks.filter(x=>x.system===state.adminTaskSystem).map(x=>Number(x.sort_order)||0))+1)||1);$('#taskSystem').value=t?.system||state.adminTaskSystem;openModal('#taskModal');}
$('#addTaskBtn')?.addEventListener('click',()=>openTaskModal());$('#taskClose')?.addEventListener('click',()=>closeModal('#taskModal'));$('#taskCancel')?.addEventListener('click',()=>closeModal('#taskModal'));
$('#taskSave')?.addEventListener('click',async()=>{if(!isAdmin())return;const name=$('#taskName').value.trim(),description=$('#taskDescription').value.trim()||null,system=$('#taskSystem').value,sort_order=Math.max(1,Number($('#taskOrder').value)||1);if(!name)return;try{let result;if(state.editingTaskId)result=await sb.from('testing_tasks').update({name,description,system,sort_order,updated_at:new Date().toISOString()}).eq('id',state.editingTaskId);else result=await sb.from('testing_tasks').insert({name,description,system,sort_order,active:true});if(result.error)throw result.error;closeModal('#taskModal');state.editingTaskId=null;await loadTasks();state.adminTaskSystem=system;$$('.admin-filter').forEach(b=>b.classList.toggle('active',b.dataset.adminSystem===system));renderAdminTasks();}catch(e){alert('Could not save test task: '+(e.message||e));}});
async function toggleTask(id){const t=state.tasks.find(x=>String(x.id)===String(id));if(!t)return;const {error}=await sb.from('testing_tasks').update({active:!t.active,updated_at:new Date().toISOString()}).eq('id',id);if(error){alert(error.message);return;}await loadTasks();}
async function deleteTask(id){const t=state.tasks.find(x=>String(x.id)===String(id));if(!t)return;openConfirm('Delete test case?',`Delete "${t.name}" permanently?`,async()=>{const {error}=await sb.from('testing_tasks').delete().eq('id',id);if(error)throw error;await loadTasks();});}

function renderAdminGoLiveTasks(){const box=$('#adminGoLiveTaskList');if(!box||!isAdmin())return;const rows=[...state.goLiveTasks].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));box.innerHTML=rows.length?rows.map(t=>`<div class="admin-row"><div>☷</div><div class="admin-main"><strong>${esc(t.name)}</strong><span>${esc(t.description||'No description supplied.')}</span></div><div><span class="status ${t.active?'':'inactive'}">${t.active?'Active':'Inactive'}</span><div class="admin-actions" style="margin-top:6px"><button class="mini" data-edit-gl="${esc(t.id)}">Edit</button><button class="mini" data-toggle-gl="${esc(t.id)}">${t.active?'Deactivate':'Activate'}</button><button class="mini" data-delete-gl="${esc(t.id)}">Delete</button></div></div></div>`).join(''):'<div class="placeholder"><strong>No checklist tasks yet.</strong><span>Use Add Checklist Task to create one.</span></div>';
$$('[data-edit-gl]').forEach(b=>b.addEventListener('click',()=>openGoLiveModal(b.dataset.editGl)));$$('[data-toggle-gl]').forEach(b=>b.addEventListener('click',()=>toggleGoLive(b.dataset.toggleGl)));$$('[data-delete-gl]').forEach(b=>b.addEventListener('click',()=>deleteGoLive(b.dataset.deleteGl)));}

function openGoLiveModal(id=null){if(!isAdmin())return;state.editingGoLiveId=id;const t=id?state.goLiveTasks.find(x=>String(x.id)===String(id)):null;$('#goLiveModalTitle').textContent=t?'Edit checklist task':'Add checklist task';$('#goLiveName').value=t?.name||'';$('#goLiveDescription').value=t?.description||'';$('#goLiveOrder').value=t?.sort_order||((Math.max(0,...state.goLiveTasks.map(x=>Number(x.sort_order)||0))+1)||1);openModal('#goLiveModal');}
$('#addGoLiveTaskBtn')?.addEventListener('click',()=>openGoLiveModal());$('#goLiveClose')?.addEventListener('click',()=>closeModal('#goLiveModal'));$('#goLiveCancel')?.addEventListener('click',()=>closeModal('#goLiveModal'));
$('#goLiveSave')?.addEventListener('click',async()=>{if(!isAdmin())return;const name=$('#goLiveName').value.trim(),description=$('#goLiveDescription').value.trim()||null,sort_order=Math.max(1,Number($('#goLiveOrder').value)||1);if(!name)return;try{let result;if(state.editingGoLiveId)result=await sb.from('go_live_tasks').update({name,description,sort_order,updated_at:new Date().toISOString()}).eq('id',state.editingGoLiveId);else result=await sb.from('go_live_tasks').insert({name,description,sort_order,active:true});if(result.error)throw result.error;state.editingGoLiveId=null;closeModal('#goLiveModal');await loadGoLiveTasks();}catch(e){alert('Could not save checklist task: '+(e.message||e));}});
async function toggleGoLive(id){const t=state.goLiveTasks.find(x=>String(x.id)===String(id));if(!t)return;const {error}=await sb.from('go_live_tasks').update({active:!t.active,updated_at:new Date().toISOString()}).eq('id',id);if(error){alert(error.message);return;}await loadGoLiveTasks();}
async function deleteGoLive(id){const t=state.goLiveTasks.find(x=>String(x.id)===String(id));if(!t)return;openConfirm('Delete checklist task?',`Delete "${t.name}" permanently?`,async()=>{const {error}=await sb.from('go_live_tasks').delete().eq('id',id);if(error)throw error;delete state.goLiveChecks[id];await loadGoLiveTasks();});}


async function saveGoLiveChecklist(){
  if(!isLoggedIn()){openModal('#authModal');return;}
  const tasks=activeGoLive();
  if(!tasks.length){setMessage('#goLiveMessage','There are no active checklist tasks to save.');return;}
  const completed=tasks.filter(t=>state.goLiveChecks[t.id]).length;
  try{
    const portValue=$('#goLivePort')?.value||'';
    const port=portValue.split(' - ')[0]||'';
    if(!port){setMessage('#goLiveMessage','Please select a port before saving the checklist.');return;}
    const {data:run,error}=await sb.from('go_live_runs').insert({tested_by_user_id:state.user.id,tested_by_name:formatName(state.user.email),port,total_tasks:tasks.length,completed_tasks:completed,status:completed===tasks.length?'completed':'incomplete',completed_at:completed===tasks.length?new Date().toISOString():null}).select('id').single();
    if(error)throw error;
    const rows=tasks.map(t=>({run_id:run.id,task_id:t.id,task_name:t.name,completed:!!state.goLiveChecks[t.id]}));
    const {error:rerr}=await sb.from('go_live_results').insert(rows);
    if(rerr)throw rerr;
    state.goLiveChecks={};
    renderGoLive();
    setMessage('#goLiveMessage',`Go Live checklist saved successfully.`,'success');
  }catch(e){
    setMessage('#goLiveMessage','Could not save checklist: '+(e.message||e));
  }
}
$('#saveGoLiveBtn')?.addEventListener('click',saveGoLiveChecklist);

async function loadAdminGoLiveRuns(){
  if(!isAdmin())return;
  const {data,error}=await sb.functions.invoke('admin-manage',{body:{action:'list_go_live_runs'}});
  if(error)throw error;
  const box=$('#adminGoLiveRunList');if(!box)return;
  const runs=data?.runs||[];
  box.innerHTML=runs.length?runs.map(r=>`<div class="run-row"><div><strong>${esc(r.id)}</strong><div class="row-meta">${esc(r.port||'No port')} · ${esc(r.tested_by_name||'')} · ${esc(new Date(r.created_at).toLocaleString('en-AU'))}</div><div class="row-meta">${r.completed_tasks||0} / ${r.total_tasks||0} complete · ${esc(r.status||'incomplete')}</div></div><div class="run-actions"><button class="mini" data-delete-go-live-run="${esc(r.id)}">Delete</button></div></div>`).join(''):'<div class="placeholder small"><strong>No saved Go Live checklists.</strong></div>';
  $$('[data-delete-go-live-run]').forEach(b=>b.addEventListener('click',()=>openConfirm('Delete Go Live checklist?','This permanently removes the saved checklist results.',async()=>{const {error:e}=await sb.functions.invoke('admin-manage',{body:{action:'delete_go_live_run',runId:b.dataset.deleteGoLiveRun}});if(e)throw e;await loadAdminGoLiveRuns();})));
}
$('#refreshAdminGoLiveRuns')?.addEventListener('click',loadAdminGoLiveRuns);

async function loadMyIssues(){if(!state.user){$('#myIssuesList').innerHTML='<div class="card placeholder"><strong>Sign in required.</strong><span>Sign in to view your issues.</span></div>';return;}const {data,error}=await sb.from('issues').select('id,issue_id,system,port,terminal,device_id,category,description,urgency,status,created_at,environment,pnr').eq('raised_by',state.user.email).order('created_at',{ascending:false}).limit(100);if(error){setMessage('#issueMessage',error.message);return;}const box=$('#myIssuesList');box.innerHTML=(data||[]).map(i=>`<div class="card ticket-row"><div><strong>${esc(i.issue_id||i.id)}</strong><div class="row-meta">${esc(i.system)} · ${esc(i.port)} · ${esc(i.device_id||'No device')} · ${esc(i.category)}</div><div class="row-meta">${esc(new Date(i.created_at).toLocaleString('en-AU'))}</div></div><div class="ticket-actions"><span class="status">${esc(i.status||'New')}</span></div></div>`).join('')||'<div class="card placeholder"><strong>No issues yet.</strong><span>Your submitted issues will appear here.</span></div>';}
$('#refreshMyIssues')?.addEventListener('click',loadMyIssues);
$('#issueForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!state.user){openModal('#authModal');return;}const port=$('#issuePort').value.split(' - ')[0];const payload={system:$('#issueSystem').value,port,terminal:$('#issueTerminal').value.trim()||null,device_id:$('#issueDevice').value.trim()||null,environment:$('#issueEnvironment').value,urgency:$('#issueUrgency').value,category:$('#issueCategory').value,description:$('#issueDescription').value.trim(),pnr:$('#issuePnr').value.trim().toUpperCase()||null,raised_by:state.user.email,status:'New'};if(!payload.port||!payload.category||!payload.description){setMessage('#issueMessage','Please complete Port, Issue Category and Description.');return;}try{const {data,error}=await sb.from('issues').insert(payload).select('issue_id').single();if(error)throw error;$('#issueForm').reset();setMessage('#issueMessage',`Issue ${data?.issue_id||''} submitted successfully.`,'success');await loadMyIssues();}catch(err){setMessage('#issueMessage','Could not submit issue: '+(err.message||err));}});

async function loadAdminUsers(){if(!isAdmin())return;const {data,error}=await sb.functions.invoke('admin-manage',{body:{action:'list_users'}});if(error)throw error;renderAdminUsers(data?.users||[]);return data;}
function renderAdminUsers(users){const box=$('#adminUserList');if(!box)return;box.innerHTML=users.length?users.map(u=>{const pending=u.approval_status!=='approved'&&u.role!=='admin';return `<div class="user-row"><div><strong>${esc(u.email)}</strong><div class="row-meta">${esc(u.name||'')} · Created ${esc(new Date(u.created_at).toLocaleString('en-AU'))}</div></div><div class="user-actions"><span class="status ${pending?'inactive':''}">${pending?'Pending approval':'Approved'}</span>${pending?`<button class="mini" data-approve-user="${esc(u.id)}">Approve</button>`:''}<button class="mini" data-role-user="${esc(u.id)}" data-role="${u.role==='admin'?'staff':'admin'}">Make ${u.role==='admin'?'Staff':'Admin'}</button>${u.id!==state.user.id?`<button class="mini" data-delete-user="${esc(u.id)}">Delete</button>`:'<span class="row-meta">Current user</span>'}</div></div>`}).join(''):'<div class="placeholder small"><strong>No users found.</strong></div>';$$('[data-approve-user]').forEach(b=>b.addEventListener('click',()=>adminAction('approve_user',b.dataset.approveUser)));$$('[data-role-user]').forEach(b=>b.addEventListener('click',()=>adminAction('set_role',b.dataset.roleUser,{role:b.dataset.role})));$$('[data-delete-user]').forEach(b=>b.addEventListener('click',()=>adminAction('delete_user',b.dataset.deleteUser)));}
async function adminAction(action,userId,extra={}){try{const {error}=await sb.functions.invoke('admin-manage',{body:{action,userId,...extra}});if(error)throw error;await loadAdminUsers();}catch(e){alert(e.message||e);}}
$('#refreshUsersBtn')?.addEventListener('click',loadAdminUsers);
$('#inviteBtn')?.addEventListener('click',async()=>{if(!isAdmin())return;const email=$('#inviteEmail').value.trim().toLowerCase(),name=$('#inviteName').value.trim();if(!emailOk(email)){alert('Only @virginaustralia.com addresses can be invited.');return;}try{const {error}=await sb.functions.invoke('admin-manage',{body:{action:'invite_user',email,name}});if(error)throw error;$('#inviteEmail').value='';$('#inviteName').value='';await loadAdminUsers();}catch(e){alert(e.message||e);}});

async function loadAdminTickets(){if(!isAdmin())return;const {data,error}=await sb.functions.invoke('admin-manage',{body:{action:'list_issues'}});if(error)throw error;const box=$('#adminTicketList');box.innerHTML=(data?.issues||[]).map(i=>`<div class="ticket-row"><div><strong>${esc(i.issue_id||i.id)}</strong><div class="row-meta">${esc(i.system)} · ${esc(i.port)} · ${esc(i.device_id||'')} · ${esc(i.raised_by||'')}</div><div class="row-meta">${esc(i.description||'')}</div></div><div class="ticket-actions"><span class="status">${esc(i.status||'New')}</span><button class="mini" data-delete-issue="${esc(i.id)}">Delete</button></div></div>`).join('')||'<div class="placeholder small"><strong>No tickets.</strong></div>';$$('[data-delete-issue]').forEach(b=>b.addEventListener('click',()=>openConfirm('Delete ticket?','This permanently deletes the ticket and related records.',async()=>{await sb.functions.invoke('admin-manage',{body:{action:'delete_issue',issueId:b.dataset.deleteIssue}});await loadAdminTickets();})));return data;}
$('#refreshAdminTickets')?.addEventListener('click',loadAdminTickets);
async function loadAdminRuns(){if(!isAdmin())return;const {data,error}=await sb.functions.invoke('admin-manage',{body:{action:'list_testing_runs'}});if(error)throw error;const box=$('#adminRunList');box.innerHTML=(data?.runs||[]).map(r=>`<div class="run-row"><div><strong>${esc(r.id)}</strong><div class="row-meta">${esc(r.port)} · ${esc(r.system)} · ${esc(r.tested_by_name||'')} · ${esc(new Date(r.created_at).toLocaleString('en-AU'))}</div><div class="row-meta">${r.completed_tests||0} / ${r.total_tests||0} complete</div></div><div class="run-actions"><button class="mini" data-delete-run="${esc(r.id)}">Delete</button></div></div>`).join('')||'<div class="placeholder small"><strong>No testing runs.</strong></div>';$$('[data-delete-run]').forEach(b=>b.addEventListener('click',()=>openConfirm('Delete testing run?','This permanently removes the run and saved results.',async()=>{const r=await sb.functions.invoke('admin-manage',{body:{action:'delete_test_run',runId:b.dataset.deleteRun}});if(r.error)throw r.error;await loadAdminRuns();})));return data;}
$('#refreshAdminRuns')?.addEventListener('click',loadAdminRuns);
async function refreshAdmin(){
  if(!isAdmin())return;
  const jobs=[
    ['testing tasks',loadTasks],
    ['go live tasks',loadGoLiveTasks],
    ['users',loadAdminUsers],
    ['tickets',loadAdminTickets],
    ['testing runs',loadAdminRuns],
    ['go live runs',loadAdminGoLiveRuns]
  ];
  const results=await Promise.allSettled(jobs.map(([,fn])=>fn()));
  results.forEach((r,i)=>{if(r.status==='rejected')console.error('Admin load failed:',jobs[i][0],r.reason);});
} 

let confirmFn=null;function openConfirm(title,copy,fn){$('#confirmTitle').textContent=title;$('#confirmCopy').textContent=copy;confirmFn=fn;openModal('#confirmModal');}function closeConfirm(){confirmFn=null;closeModal('#confirmModal');}$('#confirmClose')?.addEventListener('click',closeConfirm);$('#confirmCancel')?.addEventListener('click',closeConfirm);$('#confirmAction')?.addEventListener('click',async()=>{const fn=confirmFn;closeConfirm();if(!fn)return;try{await fn();}catch(e){alert(e.message||e);}});

sb.auth.onAuthStateChange(async(_event,session)=>{if(session?.user){if(!state.user||state.user.id!==session.user.id)await setUser(session.user);}else{state.user=null;state.role=null;state.approval=null;updateAuthUI();}});
(async()=>{try{const {data}=await sb.auth.getSession();if(data.session?.user)await setUser(data.session.user);else{updateAuthUI();setConnected(true);$('#homeTaskCount').textContent='Sign in to load';$('#homeGoLiveCount').textContent='Sign in to load';}}catch(e){console.error(e);setConnected(false);}})();
$('#issuePreviewClose')?.addEventListener('click',()=>closeModal('#issuePreviewModal'));
$('#issuePreviewCancel')?.addEventListener('click',()=>closeModal('#issuePreviewModal'));
$('#issuePreviewModal')?.addEventListener('click',e=>{if(e.target.id==='issuePreviewModal')closeModal('#issuePreviewModal');});
$('#issuePreviewSubmit')?.addEventListener('click',async()=>{
  closeModal('#issuePreviewModal');
  const form=$('#issueForm');
  if(form){form.requestSubmit();}
});
