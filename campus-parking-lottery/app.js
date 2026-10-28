'use strict';
const C=ParkingCore,$=id=>document.getElementById(id),CFG=window.PARKING_CONFIG;
const DEMO=CFG.mode==='demo',KEY='campus-parking-demo-v1',fixtures=Array.from({length:12},(_,i)=>({student_id:String(1001+i).padStart(6,'0'),class_name:i<6?'商一甲':'商一乙',name:'示範學生'+String(i+1).padStart(2,'0')}));
let api=null,admin=false,busy=false,view='student',pendingRoster=null,currentPage=0,clockOffset=0,model;
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text??'');if(cls)e.className=cls;return e;};
const taipei=t=>new Date(t).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
const localTime=t=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t)).replace(' ','T');
const parseTime=v=>{if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v))throw Error('請填寫完整起訖時間');const d=new Date(v+':00+08:00');if(!Number.isFinite(d.getTime()))throw Error('時間格式不正確');return d.toISOString();};
const now=()=>Date.now()+clockOffset;
function emptyModel(){const n=Date.now();return {event:{id:'demo',title:'115 學年度學生停車位抽籤',starts_at:new Date(n-3600000).toISOString(),ends_at:new Date(n+3600000).toISOString(),drawn_at:null,slots:[...['M01','M02','M03','M04'].map(code=>({vehicle:'motorcycle',code})),...['B01','B02'].map(code=>({vehicle:'bicycle',code}))]},roster:fixtures,registrations:[],results:[],audit:[],draw_id:null,fingerprint:null,reveal_at:0};}
function readDemo(){const saved=localStorage.getItem(KEY);if(!saved)return emptyModel();const d=JSON.parse(saved);if(!d.event||!Array.isArray(d.registrations)||!Array.isArray(d.results))throw Error('示範資料格式異常，請重置虛構示範。');const seen=new Set();for(const r of d.registrations){const f=fixtures.find(x=>x.student_id===r.student_id);if(!f||f.name!==r.name||f.class_name!==r.class_name||seen.has(r.student_id))throw Error('示範資料異常，請重置虛構示範。');seen.add(r.student_id);}d.roster=fixtures;return d;}
function persist(){if(DEMO)localStorage.setItem(KEY,JSON.stringify(model));}
async function demoLock(fn){return navigator.locks?navigator.locks.request(KEY,fn):fn();}
function say(text,error=false){const n=$('notice');n.textContent=text;n.className='notice'+(error?' error':'');n.hidden=false;}
function feedback(text,error=false){$('studentFeedback').textContent=text;$('studentFeedback').className='notice'+(error?' error':' success');$('studentFeedback').hidden=false;}
function stage(){const e=model?.event;if(!e)return'未設定';if(e.drawn_at)return'已抽籤';if(now()<Date.parse(e.starts_at))return'尚未開始';if(now()>=Date.parse(e.ends_at))return'登記截止';return'開放登記';}
function activeRows(){return model?.results||[];}
function navigate(target,force=false){if(busy&&!force)return;view=target;$('studentView').hidden=target!=='student';$('adminView').hidden=target!=='admin';$('studentNav').setAttribute('aria-current',target==='student'?'page':'false');$('adminNav').setAttribute('aria-current',target==='admin'?'page':'false');render();$('main').focus({preventScroll:true});}
function paintStatus(){
 const st=stage(),e=model?.event;$('phase').textContent=st;$('studentPhase').textContent=st;
 $('registerButton').disabled=busy||st!=='開放登記';
 const submitTag=$('registerButton').querySelector('.btn-tag');if(submitTag)submitTag.textContent=busy?'處理中':st==='開放登記'?'確認送出':st;
 $('registrationTime').textContent=e?`${taipei(e.starts_at)} — ${taipei(e.ends_at)}（臺北時間）`:'活動尚未建立';
 if(e){const remaining=Date.parse(e.ends_at)-now();$('countdown').textContent=st==='開放登記'?`距截止 ${Math.floor(remaining/3600000)} 小時 ${Math.floor(remaining%3600000/60000)} 分 ${Math.max(0,Math.floor(remaining%60000/1000))} 秒`:st==='已抽籤'?'本輪已完成，結果不會重抽':st==='尚未開始'?'尚未到開放時間':'已截止，可由主管執行抽籤';}
 const hasRegs=(model?.registrations.length||0)>0,drawn=!!e?.drawn_at;
 $('saveSettings').disabled=busy||hasRegs||drawn;$('confirmImport').disabled=busy||!pendingRoster||hasRegs||drawn;
 $('drawButton').disabled=busy||!admin||stage()!=='登記截止'||!$('verified').checked||!e?.slots.length;
 $('drawButton').textContent=drawn?'本輪結果已保存':busy?'車位配對中':'開始抽籤配位';
 for(const id of ['exportExcel','exportPDF','exportAudit'])$(id).disabled=busy||!drawn||!activeRows().length;
 for(const id of ['seedDemo','closeDemo'])$(id).disabled=busy||drawn;
 $('rosterFile').disabled=DEMO||busy||hasRegs||drawn;
}
function listTable(id,rows,fields){const body=$(id);body.replaceChildren();const frag=document.createDocumentFragment();for(const r of rows){const tr=el('tr');for(const f of fields)tr.append(el('td',typeof f==='function'?f(r):r[f]));frag.append(tr);}if(!rows.length){const tr=el('tr'),td=el('td','目前沒有資料','empty');td.colSpan=fields.length;tr.append(td);frag.append(tr);}body.append(frag);}
function render(){
 if(!model)return;const e=model.event,regs=model.registrations||[],results=activeRows();
 $('modeBadge').textContent=DEMO?'虛構示範模式':'正式連線模式';$('modeBanner').textContent=DEMO?'此頁只接受內建虛構名冊。示範資料僅存本瀏覽器，手機與其他電腦不會同步。':'正式登記由學校資料庫核對，名冊與完整結果僅限授權管理員讀取。';
 $('eventTitle').textContent=e?.title||'校園車位抽籤';$('demoTools').hidden=!DEMO;$('sampleHelper').hidden=!DEMO;
 $('demoEntry').hidden=!DEMO;$('loginForm').hidden=DEMO;$('adminGate').hidden=admin;$('adminWorkspace').hidden=!admin;
 $('logoutButton').hidden=!admin;$('demoRosterNote').hidden=!DEMO;
 $('motorCount').textContent=e?.slots.filter(s=>s.vehicle==='motorcycle').length||0;$('bicycleCount').textContent=e?.slots.filter(s=>s.vehicle==='bicycle').length||0;
 $('registeredCount').textContent=admin||DEMO?regs.length:'—';$('selectedCount').textContent=results.filter(r=>r.outcome==='selected').length;$('waitCount').textContent=results.filter(r=>r.outcome==='waitlist').length;$('vacantCount').textContent=results.filter(r=>r.outcome==='vacant').length;
 $('rosterCount').textContent=model.roster.length;$('rosterHelp').textContent=regs.length?'已有登記，名冊與活動設定已鎖定。':'正式模式可匯入UTF-8 CSV；先預覽，再確認匯入。';
 if(e){$('activityTitle').value=e.title;$('startsAt').value=localTime(e.starts_at);$('endsAt').value=localTime(e.ends_at);$('motorSlots').value=e.slots.filter(s=>s.vehicle==='motorcycle').map(s=>s.code).join('\n');$('bicycleSlots').value=e.slots.filter(s=>s.vehicle==='bicycle').map(s=>s.code).join('\n');}
 listTable('rosterBody',model.roster.slice(0,20),['class_name','student_id','name']);listTable('registeredBody',regs,['vehicle', 'class_name','student_id','name'].map(f=>f==='vehicle'?r=>C.vehicleLabel(r.vehicle):f));
 $('drawMeta').textContent=e?.drawn_at?`${DEMO?'虛構示範 · ':''}抽籤時間 ${taipei(e.drawn_at)} ｜ 識別 ${model.draw_id}`:'截止後核對名單，勾選確認，再由主管按一次抽籤。';
 $('fingerprint').textContent=model.fingerprint||'抽籤後產生輸入快照指紋';$('readiness').textContent=e?.drawn_at?'結果已鎖定保存':`${regs.length} 位申請人・${e?.slots.length||0} 個車格・${stage()}`;
 renderResults();paintStatus();
}
function resultFields(){return [r=>C.vehicleLabel(r.vehicle),r=>r.outcome==='selected'?'正取':r.outcome==='waitlist'?'備取':'空車格',r=>r.slot_code||'備取 '+r.wait_rank,'class_name','name','student_id'];}
function renderResults(){
 const all=activeRows(),query=C.norm($('searchResults').value).toLowerCase(),v=$('vehicleFilter').value,o=$('outcomeFilter').value;
 const filtered=all.filter(r=>(!v||r.vehicle===v)&&(!o||r.outcome===o)&&(!query||[r.class_name,r.student_id,r.name,r.slot_code,r.wait_rank].join(' ').toLowerCase().includes(query)));
 const pages=Math.max(1,Math.ceil(filtered.length/100));currentPage=Math.min(currentPage,pages-1);
 listTable('resultBody',filtered.slice(currentPage*100,currentPage*100+100),resultFields());$('resultCount').textContent=`顯示 ${filtered.length}／全部 ${all.length} 筆 ｜ 第 ${currentPage+1}／${pages} 頁`;
 $('previousPage').disabled=currentPage===0;$('nextPage').disabled=currentPage===pages-1;$('resultSection').hidden=!model.event?.drawn_at;
}
async function refreshProduction(){const p=admin?await api.snapshot():{event:await api.publicEvent(),roster:[],registrations:[],results:[],audit:[]};model={...p,roster:p.roster||[],registrations:p.registrations||[],results:p.results||[],audit:p.audit||[]};if(p.event?.server_now)clockOffset=Date.parse(p.event.server_now)-Date.now();render();}
async function guarded(fn){if(busy)return;busy=true;document.body.setAttribute('aria-busy','true');paintStatus();try{await fn();}catch(e){say(e.message,true);}finally{busy=false;document.body.removeAttribute('aria-busy');render();}}
function lockUI(on){for(const n of document.querySelectorAll('.topbar,.subheader,main,.footer'))n.inert=on;if(on)document.body.setAttribute('aria-busy','true');else document.body.removeAttribute('aria-busy');}
async function holdReveal(){if(!(model?.reveal_at>Date.now()))return;busy=true;lockUI(true);$('resultSection').hidden=true;$('pairingOverlay').hidden=false;$('pairingOverlay').focus();await new Promise(r=>setTimeout(r,model.reveal_at-Date.now()));busy=false;lockUI(false);$('pairingOverlay').hidden=true;render();if(!$('resultSection').hidden&&!$('adminView').hidden)$('resultHeading').focus({preventScroll:true});}
function download(name,bytes,type){const url=URL.createObjectURL(new Blob([bytes],{type})),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function allNote(){return `${DEMO?'虛構展示資料｜':''}${model.event.title}｜抽籤 ${taipei(model.event.drawn_at)}｜${model.draw_id}｜完整名單，不受畫面篩選影響`;}
function buildPrint(){const a=$('printArea');a.replaceChildren(el('h1',model.event.title),el('p',allNote()),el('p',`正取 ${activeRows().filter(r=>r.outcome==='selected').length} 人｜備取 ${activeRows().filter(r=>r.outcome==='waitlist').length} 人｜空車格 ${activeRows().filter(r=>r.outcome==='vacant').length}`));const table=el('table'),thead=el('thead'),tr=el('tr');for(const t of ['車種','結果','車格／備取序','班級','姓名','學號'])tr.append(el('th',t));thead.append(tr);table.append(thead);const body=el('tbody');for(const row of activeRows()){const r=el('tr');for(const f of resultFields())r.append(el('td',typeof f==='function'?f(row):row[f]));body.append(r);}table.append(body);a.append(table,el('p','輸入快照 SHA-256：'+model.fingerprint),el('p','主持：____________　見證：____________　承辦：____________'),el('p','[亮亮營養師 AI研究開發]'));}
function bind(){
 $('studentNav').onclick=()=>navigate('student');$('adminNav').onclick=()=>navigate('admin');$('demoEntry').onclick=()=>{admin=true;render();};
 $('loginForm').onsubmit=e=>{e.preventDefault();guarded(async()=>{try{await api.login($('adminEmail').value,$('adminPassword').value);admin=true;await refreshProduction();say('已通過管理員權限檢查。');}finally{$('adminPassword').value='';}});};
 $('logoutButton').onclick=()=>guarded(async()=>{if(api)await api.logout();admin=false;pendingRoster=null;if(!DEMO)await refreshProduction();navigate('student',true);});
 $('fillSample').onclick=()=>{const f=fixtures[Number($('sampleSelect').value)];$('className').value=f.class_name;$('studentId').value=f.student_id;$('studentName').value=f.name;$('studentVehicle').value=Number($('sampleSelect').value)<6?'motorcycle':'bicycle';};
 $('studentForm').onsubmit=e=>{e.preventDefault();guarded(async()=>{const row={class_name:C.norm($('className').value),student_id:C.norm($('studentId').value),name:C.norm($('studentName').value),vehicle:$('studentVehicle').value};
  let reply;if(DEMO){await demoLock(async()=>{model=readDemo();if(stage()!=='開放登記'||!fixtures.some(f=>f.student_id===row.student_id&&f.class_name===row.class_name&&f.name===row.name)||model.registrations.some(r=>r.student_id===row.student_id)||!model.event.slots.some(s=>s.vehicle===row.vehicle))reply={ok:false,message:'無法受理，請核對虛構名冊、登記時間或是否重複登記。'};else{const receipt=crypto.randomUUID();model.registrations.push({...row,id:receipt});persist();reply={ok:true,message:'示範登記成功，只保存於本瀏覽器。',receipt};}});}else reply=await api.register(row);
  feedback(reply.message+(reply.receipt?' 回條：'+reply.receipt:''),!reply.ok);if(reply.ok)$('studentForm').reset();$('studentFeedback').scrollIntoView({block:'nearest'});if(!DEMO&&admin)await refreshProduction();
 });};
 $('settingsForm').onsubmit=e=>{e.preventDefault();guarded(async()=>{const code=id=>$(id).value.split(/\r?\n/).map(C.norm).filter(Boolean);const ev={title:C.norm($('activityTitle').value),starts_at:parseTime($('startsAt').value),ends_at:parseTime($('endsAt').value),motorSlots:code('motorSlots'),bicycleSlots:code('bicycleSlots')};if(!ev.title||Date.parse(ev.ends_at)<=Date.parse(ev.starts_at))throw Error('活動名稱與時間設定不正確');for(const a of [ev.motorSlots,ev.bicycleSlots])if(new Set(a).size!==a.length||a.some(x=>x.length>40)||a.length>5000)throw Error('車格代碼重複、過長或超過5000個');if(!ev.motorSlots.length&&!ev.bicycleSlots.length)throw Error('請至少設定一個車格');
  if(DEMO)await demoLock(async()=>{model=readDemo();if(model.registrations.length||model.event.drawn_at)throw Error('已有登記，設定已鎖定');Object.assign(model.event,ev,{slots:[...ev.motorSlots.map(code=>({vehicle:'motorcycle',code})),...ev.bicycleSlots.map(code=>({vehicle:'bicycle',code}))]});persist();});else model=await api.saveEvent(ev);say('活動設定已保存。');
 });};
 $('seedDemo').onclick=()=>guarded(async()=>{await demoLock(async()=>{model=readDemo();if(model.event.drawn_at)throw Error('已抽籤，請重置虛構示範建立下一輪');model.registrations=fixtures.slice(0,9).map((r,i)=>({...r,id:'demo-'+r.student_id,vehicle:i<6?'motorcycle':'bicycle'}));persist();});say('已載入9位虛構申請人：機車6人、腳踏車3人。');});
 $('closeDemo').onclick=()=>guarded(async()=>{await demoLock(async()=>{model=readDemo();if(model.event.drawn_at)return;model.event.ends_at=new Date(Date.now()-1000).toISOString();if(Date.parse(model.event.starts_at)>=Date.parse(model.event.ends_at))model.event.starts_at=new Date(Date.now()-3600000).toISOString();persist();});say('示範登記已截止，可核對後抽籤。');});
 $('resetDemo').onclick=()=>{if(!busy)$('resetDialog').showModal();};$('confirmReset').onclick=()=>{localStorage.removeItem(KEY);model=emptyModel();persist();$('resetDialog').close();$('verified').checked=false;pendingRoster=null;render();say('已建立新一輪虛構示範。');};$('cancelReset').onclick=()=>$('resetDialog').close();
 $('rosterFile').onchange=async e=>{if(DEMO||busy)return;const f=e.target.files[0];pendingRoster=null;if(!f)return;if(f.size>2*1024*1024){say('CSV不得超過2MB',true);return;}try{const parsed=C.rosterFromCSV(await f.text());$('importPreview').textContent=`${parsed.rows.length}筆有效；${parsed.errors.length}項錯誤。`+parsed.errors.slice(0,15).map(x=>`第${x.line}列：${x.message}`).join('；');if(parsed.errors.length===0&&parsed.rows.length){pendingRoster=parsed.rows;listTable('rosterBody',parsed.rows.slice(0,20),['class_name','student_id','name']);}}catch(err){say(err.message,true);}paintStatus();};
 $('confirmImport').onclick=()=>guarded(async()=>{if(DEMO||!pendingRoster)return;model=await api.importRoster(pendingRoster);pendingRoster=null;$('rosterFile').value='';$('importPreview').textContent='名冊已匯入。';say('正式名冊已保存於學校資料庫。');});
 $('downloadTemplate').onclick=()=>download('學生名冊範本.csv','\uFEFF班級,學號,姓名\r\n商一甲,001001,示範學生01\r\n','text/csv;charset=utf-8');
 $('verified').onchange=paintStatus;
 $('drawButton').onclick=async()=>{if(busy||!$('verified').checked||stage()!=='登記截止')return;busy=true;paintStatus();$('pairingOverlay').hidden=false;lockUI(true);$('pairingOverlay').focus();const started=performance.now();
  try{if(DEMO)await demoLock(async()=>{model=readDemo();if(model.event.drawn_at)return;if(stage()!=='登記截止')throw Error('尚未截止');const snap=JSON.stringify({event:model.event,registrations:model.registrations});model.results=C.lottery(model.registrations,model.event.slots);model.fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(snap))),b=>b.toString(16).padStart(2,'0')).join('');model.draw_id=crypto.randomUUID();model.event.drawn_at=new Date().toISOString();model.reveal_at=Date.now()+3000;model.audit.push({action:'draw',time:model.event.drawn_at,participants:model.registrations.length,draw_id:model.draw_id});persist();});else model=await api.draw();await new Promise(r=>setTimeout(r,Math.max(0,3000-(performance.now()-started))));say('配對完成，已保存本輪正取與備取完整結果。');}
  catch(e){say(e.message,true);}finally{busy=false;lockUI(false);$('pairingOverlay').hidden=true;render();if(model.event?.drawn_at){$('resultSection').scrollIntoView({block:'start',behavior:'instant'});$('resultHeading').focus({preventScroll:true});}}
 };
 for(const id of ['searchResults','vehicleFilter','outcomeFilter'])$(id).addEventListener(id==='searchResults'?'input':'change',()=>{currentPage=0;renderResults();});
 $('previousPage').onclick=()=>{currentPage--;renderResults();};$('nextPage').onclick=()=>{currentPage++;renderResults();};
 $('exportExcel').onclick=()=>download('校園車位正備取總表.xlsx',C.xlsx(activeRows(),model.event.title,allNote()),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 $('exportPDF').onclick=()=>{buildPrint();window.print();};
 $('exportAudit').onclick=()=>download('校園車位抽籤稽核.json',JSON.stringify({mode:DEMO?'demo':'production',event:model.event,registrations:model.registrations,results:model.results,draw_id:model.draw_id,fingerprint:model.fingerprint,audit:model.audit},null,2),'application/json');
 $('refreshAdmin').onclick=()=>guarded(async()=>{if(DEMO)model=readDemo();else await refreshProduction();say('已讀取保存資料。');});
 window.addEventListener('storage',e=>{if(DEMO&&e.key===KEY&&!busy){try{model=readDemo();render();holdReveal().catch(err=>say(err.message,true));}catch(err){say(err.message,true);}}});
}
window.addEventListener('beforeprint',()=>{if(model?.event?.drawn_at&&activeRows().length)buildPrint();});
async function boot(){
 bind();for(const [i,f]of fixtures.entries()){const o=el('option',`${f.class_name}｜${f.student_id}｜${f.name}`);o.value=String(i);$('sampleSelect').append(o);}
 try{if(DEMO){model=readDemo();persist();}else if(CFG.mode==='production'){api=new ParkingBackend(CFG);await refreshProduction();}else throw Error('模式設定不正確');render();
  if(DEMO)await holdReveal();
  let lastStage=stage();setInterval(()=>{const s=stage();if(!busy&&s!==lastStage){lastStage=s;render();}else paintStatus();},1000);
 }catch(e){say(e.message,true);$('modeBadge').textContent=DEMO?'示範資料錯誤':'正式模式未啟用';$('modeBanner').textContent='系統設定或資料讀取失敗，登記未啟用；請洽管理單位。';$('registerButton').disabled=true;$('loginButton').disabled=true;}
}
boot();
