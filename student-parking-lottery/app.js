'use strict';
const C=LotteryCore,$=id=>document.getElementById(id),norm=C.norm;
const MASK='姓名中間字遮罩（單字全遮）；學號最多顯示末 3 碼且至少遮 1 碼；班級仍顯示。';
const FIELDS=[
 ['title','案件名稱','text',false,'案件與時程'],['org','承辦單位與承辦人','text',false,'案件與時程'],
 ['dead','報名截止（台北時間）','datetime-local',true,'案件與時程'],['when','預計抽籤時間（台北時間）','datetime-local',true,'案件與時程'],['place','抽籤地點','text',true,'案件與時程'],
 ['elig','申請資格與人工審查方式','area',true,'資格與處理規則'],['wait','放棄／逾期與遞補方式','area',true,'資格與處理規則'],['abs','現場缺席處理','area',true,'資格與處理規則'],
 ['chair','抽籤主持人','text',true,'權責與留存'],['wit','現場見證人','text',true,'權責與留存'],['app','異議管道與期限','area',true,'權責與留存'],['ret','資料留存期限','text',true,'權責與留存'],['mask','公告遮罩方式（本版固定）','text',false,'權責與留存']
];
const LABELS=Object.fromEntries(FIELDS.map(f=>[f[0],f[1]]));
const STEPS=['需求探明','公文草稿','名單鎖定','現場抽籤','匯出留存'];
const S={locked:false,busy:false,snapshot:null,inputHash:null,lockTime:null,validation:null,draws:[],audit:[],snapshots:[],demo:false,step:0,page:0,revision:0,failedAttempt:null,allowLeave:false};
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function uid(){if(crypto.randomUUID)return crypto.randomUUID();const b=new Uint8Array(16);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');}
S.sessionId=uid();
for(const group of [...new Set(FIELDS.map(f=>f[4]))]){
 const fieldset=node('fieldset',undefined,'group');fieldset.append(node('legend',group));const grid=node('div',undefined,'fields-grid');
 for(const [key,label,type,pending,g] of FIELDS.filter(f=>f[4]===group)){
  const row=node('div',undefined,'field-row'+(type==='area'||key==='mask'?' span2':'')),lab=node('label',label);lab.htmlFor='f_'+key;
  const input=document.createElement(type==='area'?'textarea':'input');if(type!=='area')input.type=type;input.id='f_'+key;input.maxLength=type==='area'?2000:500;
  if(key==='title')input.placeholder='例如：115 學年度第 1 學期學生停車位抽籤';
  if(key==='elig')input.placeholder='請填寫校內核定的資格、申請文件與人工審查方式';
  if(key==='mask'){input.value=MASK;input.readOnly=true;}
  lab.append(input);row.append(lab);
  if(pending){const l=node('label',undefined,'pending-label'),c=document.createElement('input');c.type='checkbox';c.id='p_'+key;l.append(c,document.createTextNode('待主管確認'));row.append(l);}
  grid.append(row);
 }
 fieldset.append(grid);$('ff').append(fieldset);
}
STEPS.forEach((title,i)=>{const b=node('button');b.type='button';b.append(node('span',String(i+1),'step-num'),document.createTextNode(title));b.id='n'+i;b.onclick=()=>go(i,true);$('nav').append(b);});
document.querySelectorAll('[data-next]').forEach(b=>b.onclick=()=>go(Number(b.dataset.next),true));
function go(n,focus=false){if(document.body.classList.contains('proj')&&n!==3){say('請先離開投影模式，再檢視行政資料。',true);return;}S.step=n;STEPS.forEach((_,i)=>{$('s'+i).hidden=i!==n;if(i===n)$('n'+i).setAttribute('aria-current','step');else $('n'+i).removeAttribute('aria-current');});refresh();if(focus){$('main').focus({preventScroll:true});$('main').scrollIntoView({block:'start'});}}
function say(text,error=false){$('notice').hidden=false;$('notice').className='notice'+(error?' error':'');$('notice').textContent=text;}
function readRules(){return {fields:Object.fromEntries(FIELDS.map(([k,,t,p])=>[k,{v:k==='mask'?MASK:norm($('f_'+k).value),p:p?$('p_'+k).checked:false}])),ptype:norm($('ptype').value),W:$('W').value,pool:$('pool').value,pre:$('pre').checked,case:$('case').value,dataKind:S.demo?'demo':'administrative'};}
function rNow(){return S.locked?S.snapshot.rules:readRules();}
function approval(){return {on:$('apon').checked,no:norm($('apno').value),date:$('apdt').value,hash:norm($('aphs').value).toLowerCase(),inputHash:S.inputHash,checks:Array.from(document.querySelectorAll('.pc'),c=>c.checked)};}
function formalProblems(){return S.snapshot&&S.locked?C.formalIssues(S.snapshot,approval(),LABELS):['請先鎖定規則、名單與車位快照。'];}
function active(){return S.draws.find(d=>d.status==='active');}
function pending(r){const p=FIELDS.filter(([k])=>!r.fields[k].v||r.fields[k].p||/待(?:主管)?確認|待填|待定|未定/.test(r.fields[k].v)).map(f=>f[1]);if(r.pool!=='none')p.push('優先名額／多池需求');if(!r.pre)p.push('預先核配名單排除');if(!r.ptype)p.push('車位類型');if(!(S.locked?S.snapshot.slots.length:C.validateSlots($('slots').value).slots.length))p.push('車位代碼清單');try{C.waitCount(r.W);}catch{p.push('備取名額整數');}return p;}
function readValidation(){
 const r=C.validateRoster($('csv').value,$('case').value),s=C.validateSlots($('slots').value),errors=[...r.errors,...s.errors],warnings=[...r.warnings];let W=0;
 try{W=C.waitCount($('W').value);}catch(e){errors.push(e.message);}
 if(r.roster.length&&s.slots.length){const available=Math.max(0,r.roster.length-s.slots.length);if(r.roster.length<s.slots.length)warnings.push('申請人少於車位，實際正取 '+r.roster.length+' 人；剩餘車位不會重複配給同一人。');if(available<W)warnings.push('備取上限設定 '+W+' 人，實際可列 '+Math.min(available,W)+' 人。');}
 return {errors,warnings,roster:r.roster,slots:s.slots,W};
}
function showValidation(v){S.validation=v;const ul=$('msgs');ul.textContent='';for(const text of v.errors.slice(0,25))ul.append(node('li',text,'err'));if(v.errors.length>25)ul.append(node('li','另有 '+(v.errors.length-25)+' 項錯誤，請先修正上列問題。','err'));for(const t of v.warnings)ul.append(node('li',t,'warn'));if(!v.errors.length)ul.append(node('li','檢核通過：'+v.roster.length+' 人、'+v.slots.length+' 個車位。','good'));const body=$('prev');body.textContent='';v.roster.slice(0,50).forEach((r,i)=>{const tr=body.insertRow();[i+1,r.id,r.cl,r.nm].forEach(t=>tr.append(node('td',String(t))));});refresh();}
async function addAudit(type,actor,reason,details,time=new Date().toISOString()){const e=await C.auditEvent(S.audit.at(-1),type,actor,reason,details,time);S.audit.push(e);}
function resetChecks(){document.querySelectorAll('.pc').forEach(c=>c.checked=false);}
function resetApproval(){$('apon').checked=false;['apno','apdt','aphs'].forEach(id=>$(id).value='');$('runmode').value='demo';resetChecks();}
function controls(){
 const frozen=S.locked||S.busy;['lk1','lk2'].forEach(id=>$(id).disabled=frozen);['bdemo','fimp','fcsv'].forEach(id=>$(id).disabled=frozen);$('block').disabled=frozen||!crypto.subtle;
 $('bval').disabled=S.busy;const has=!!active();$('approvalFields').disabled=S.busy||has;$('runmode').disabled=S.busy||has;$('prechecks').disabled=S.busy||has;
 ['bcan','bunl','bexp','bcopy','btxt','bprt','bprintResult','bnew','breset','brp','faudit'].forEach(id=>$(id).disabled=S.busy);
 $('bcan').disabled=S.busy||(!has&&!S.failedAttempt);$('bunl').disabled=S.busy||!S.locked||has||!!S.failedAttempt;
 $('bcf').disabled=$('bcm').disabled=!has||S.busy;$('baj').disabled=S.busy||!S.audit.length;$('brp').disabled=S.busy||!S.audit.length;
 const checked=[...document.querySelectorAll('.pc')].every(c=>c.checked),formal=$('runmode').value==='approved',can=S.locked&&checked&&!has&&!S.busy&&!S.failedAttempt&&(!formal||!formalProblems().length);
 $('bdraw').disabled=!can;$('bdraw').textContent=S.busy?'處理中，請稍候…':has?'本次結果已產生':S.failedAttempt?'嘗試失敗，請先記錄原因並取消':!S.locked?'先鎖定快照，再勾選核對事項':formal?'主管點此執行抽籤':'主管點此開始演練';
 $('main').setAttribute('aria-busy',String(S.busy));
}
function refresh(){
 const r=rNow(),p=pending(r),d=active(),formal=$('runmode').value==='approved',issues=formalProblems();
 const banner=$('banner');banner.className='banner'+((d?.payload.mode==='已登錄核准'||(!d&&formal&&!issues.length))?' ok':' drill');
 banner.textContent=d?'本次結果：'+d.payload.mode+' · '+d.payload.results.length+' 人 · 單一同資格池':S.busy?'正在處理，請勿重複操作':formal&&!issues.length?'已登錄核准 · 待現場抽籤（須以校內文件核對）':'演練模式 · '+(S.locked?'已鎖定快照':'尚未鎖定名單');
 $('lst').textContent=S.locked?'快照已鎖定 · '+new Date(S.lockTime).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'尚未鎖定';
 $('lcnt').textContent=S.locked?S.snapshot.roster.length+' 人／'+S.snapshot.slots.length+' 位／備取上限 '+S.snapshot.rules.W:'先檢核名單與車位';
 $('lh').textContent=$('dh').textContent=S.locked?S.inputHash:'鎖定後顯示完整 64 碼';$('liveCounts').textContent=S.locked?S.snapshot.roster.length+' 人 · '+S.snapshot.slots.length+' 個車位':'尚未鎖定';
 $('sideTitle').textContent=r.fields.title.v||'尚未命名';$('sidePending').textContent=p.length+' 項';$('sideCount').textContent=S.locked?S.snapshot.roster.length+' 人':S.validation&&!S.validation.errors.length?S.validation.roster.length+' 人':'未通過檢核';
 $('sideSlots').textContent=(S.locked?S.snapshot.slots.length:C.validateSlots($('slots').value).slots.length)+'／'+(r.W||0);$('sideLock').textContent=S.busy?'處理中':S.locked?'已鎖定':'編輯中';
 $('sideTip').textContent=S.demo?'目前使用示範資料。正式作業請開始新案件後匯入經審核名單。':S.locked?'簽呈與現場請核對同一份快照驗證碼。':'先填需求，未定項目可以標記待主管確認。';
 $('pendingBox').textContent=p.length?'待填／待主管確認：'+p.join('、')+'。':'目前未標記待確認欄位；仍須由主管核定，系統不代為確認。';
 $('why').textContent='';issues.forEach(t=>$('why').append(node('li',t)));$('readinessTitle').textContent='正式操作前待確認：'+issues.length+' 項';
 if(S.step===1)$('doc').value=docText();renderResults();renderHistory();controls();
}
function renderHistory(){const body=$('hist');body.textContent='';S.draws.forEach((d,i)=>{const tr=body.insertRow();[i+1,new Date(d.payload.time).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}),d.payload.mode,d.status==='active'?'有效':'已取消'].forEach(v=>tr.append(node('td',String(v))));const td=node('td');td.append(node('code',d.postHash));tr.append(td);});const log=$('aud');log.textContent='';S.audit.forEach(e=>log.append(node('li',e.body.seq+' · '+e.body.type+' · '+e.body.actor+(e.body.reason?' · '+e.body.reason:'')+' · '+new Date(e.body.time).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei'}))));}
function displayRows(d,full=false){return d.payload.results.map(r=>({...r,id:full?r.id:C.maskID(r.id),nm:full?r.nm:C.maskName(r.nm)}));}
function renderResults(){
 const d=active(),tbody=$('res'),sum=$('sum');tbody.textContent='';sum.textContent='';let rows=[];
 if(d){const counts=['正取','備取','未中籤'].map(s=>d.payload.results.filter(r=>r.status===s).length);counts.forEach((n,i)=>{const card=node('div',undefined,'stat');card.append(node('b',String(n)),node('span',['正取／已配位','備取／依序候補','未中籤'][i]));sum.append(card);});rows=displayRows(d,$('full').checked&&!document.body.classList.contains('proj'));const q=norm($('resultSearch').value).toLowerCase();if(q)rows=rows.filter(r=>[r.rank,r.cl,r.id,r.nm,r.status,r.slot].some(v=>String(v).toLowerCase().includes(q)));}
 const size=30,pages=Math.max(1,Math.ceil(rows.length/size));S.page=Math.min(S.page,pages-1);rows.slice(S.page*size,(S.page+1)*size).forEach(r=>{const tr=tbody.insertRow();tr.append(node('td',String(r.rank)));const td=node('td');td.append(node('span',r.status+(r.waitRank?' '+r.waitRank:''),'status-pill '+(r.status==='正取'?'win':r.status==='備取'?'wait':'')));tr.append(td);[r.slot||'—',r.cl,r.id,r.nm].forEach(v=>tr.append(node('td',v)));});
 if(!rows.length){const tr=tbody.insertRow(),td=node('td',d?'沒有符合搜尋的結果。':'完成抽籤後，正取、備取與車位配對會顯示在這裡。','empty');td.colSpan=6;tr.append(td);}
 $('pageInfo').textContent=d?'共 '+rows.length+' 筆 · 第 '+(S.page+1)+'／'+pages+' 頁':'';$('bprev').disabled=S.page===0;$('bnext').disabled=S.page>=pages-1;
 $('drawNote').textContent=d?'本次 '+d.payload.mode+'；車位依鎖定順序配對，結果已保存於本頁記憶體，請立即匯出。':'每次只抽出一份完整排名；如需重抽，必須先取消舊結果並記錄原因。';
}
async function lock(){
 if(S.locked||S.busy)return;const v=readValidation();showValidation(v);if(v.errors.length){$('msgs').focus();return;}
 try{const snapshot=C.makeSnapshot(readRules(),v.roster,v.slots);S.busy=true;refresh();const inputHash=await C.hash(snapshot),at=new Date().toISOString();
 await addAudit('鎖定快照',snapshot.rules.fields.org.v||'承辦（未填）','',{inputHash,people:snapshot.roster.length,slots:snapshot.slots.length});
 S.snapshot=snapshot;S.inputHash=inputHash;S.lockTime=at;S.locked=true;S.snapshots.push({inputHash,lockedAt:at,snapshot});resetApproval();say('快照已鎖定。請回公文草稿下載附驗證碼的版本，並將同一驗證碼交由現場核對。');
 }catch(e){say('無法鎖定：'+e.message,true);}finally{S.busy=false;refresh();}
}
async function draw(){
 if(S.busy||!S.locked||active()||S.failedAttempt)return;if(![...document.querySelectorAll('.pc')].every(c=>c.checked)){say('請完成全部現場核對事項。',true);return;}
 const official=$('runmode').value==='approved';if(official&&formalProblems().length){say('正式操作條件未完整，請查看待確認事項。',true);return;}
 S.busy=true;refresh();const attempt={time:new Date().toISOString(),mode:official?'已登錄核准':'演練'};
 try{const record=await C.createRecord(S.snapshot,{...attempt,runId:uid(),approval:approval()});if(record.payload.inputHash!==S.inputHash)throw Error('鎖定快照雜湊已變更，停止抽籤。');
 await addAudit('產生抽籤結果',S.snapshot.rules.fields.chair.v||'主持（未填）','',{runId:record.payload.runId,inputHash:S.inputHash,postHash:record.postHash,mode:attempt.mode});S.draws.push(record);S.page=0;$('full').checked=false;say('已一次產生完整排名及車位配對。請當場匯出、列印並由主持與見證簽名。');
 }catch(e){S.failedAttempt={...attempt,error:e.message};say('抽籤嘗試未完成：'+e.message+'。已停止再次執行，須記錄操作人與原因後取消失敗嘗試。',true);}finally{S.busy=false;refresh();}
}
function operation(){const actor=norm($('cop').value),reason=norm($('crs').value);if(!actor||!reason)throw Error('請填操作人與原因。');return {actor,reason};}
async function cancel(){if(S.busy)return;const d=active();if(!d&&!S.failedAttempt)return;try{const op=operation();S.busy=true;refresh();const time=new Date().toISOString();await addAudit(d?'取消抽籤結果':'取消失敗嘗試',op.actor,op.reason,d?{runId:d.payload.runId,postHash:d.postHash}:{failedAttempt:S.failedAttempt},time);if(d){d.status='cancelled';d.cancel={...op,time};}S.failedAttempt=null;resetChecks();say('舊結果／嘗試已記錄取消。再次抽籤前須重新完成現場核對，歷史仍可匯出。');}catch(e){say(e.message,true);}finally{S.busy=false;refresh();}}
async function unlock(){if(S.busy||!S.locked)return;if(active()||S.failedAttempt){say('請先取消目前結果或失敗嘗試。',true);return;}try{const op=operation();S.busy=true;refresh();await addAudit('解除快照',op.actor,op.reason,{inputHash:S.inputHash});S.locked=false;S.snapshot=null;S.inputHash=null;S.lockTime=null;resetApproval();say('已解除鎖定。先前快照與抽籤歷史仍保留於稽核包；新資料須重新鎖定及核准核對。');}catch(e){say(e.message,true);}finally{S.busy=false;refresh();}}
function docText(){
 const r=rNow(),p=pending(r),g=k=>r.fields[k].p?'【待主管確認】'+(r.fields[k].v?' '+r.fields[k].v:''):(r.fields[k].v||'【待填】'),slots=S.locked?S.snapshot.slots:C.validateSlots($('slots').value).slots;
 return ['【簽呈草稿｜須由承辦修訂並送校內公文程序】','主旨：檢陳「'+g('title')+'」需求、抽籤規則及現場公開抽籤程序，簽請核示。','說明：','一、目的：辦理學生停車位分配，擬以事前核定規則、人工資格審查、鎖定名冊與規則快照、主管現場公開抽籤及紙本簽章留存辦理。','二、擬議規則：','（一）申請資格／人工審查：'+g('elig'),'（二）報名截止（台北時間）：'+g('dead'),'（三）抽籤時間／地點：'+g('when')+'／'+g('place'),'（四）車位類型：'+(r.ptype||'【待填】')+'；車位 '+slots.length+' 個；備取上限 '+r.W+' 人。名單不足時按實際可分配人數處理。','（五）優先名額／多池：'+({none:'無，採單一同資格池',undec:'【待主管確認】',prio:'需要優先池（本工具未執行，須另案設計）',multi:'需要多個池（本工具未執行，須另案設計）'}[r.pool]),'（六）預先核配者：'+(r.pre?'已經人工審核並排除於本次抽籤池。':'【待確認】人工審核與排除方式。'),'（七）缺席處理：'+g('abs'),'（八）放棄與遞補：'+g('wait')+'（本版不自動執行逐筆遞補，須依核定規則另行留存紀錄。）','（九）公告：'+MASK+' 遮罩後仍可能辨識，公告範圍應由學校確認。','（十）異議：'+g('app'),'（十一）留存期限：'+g('ret'),'（十二）主持／見證：'+g('chair')+'／'+g('wit'),'三、待主管裁示／待填：'+(p.length?p.join('、'):'本表未標記待確認欄位，仍請主管核定。'),'四、名冊與快照：'+(S.locked?'共 '+S.snapshot.roster.length+' 人；鎖定時間（本機）：'+S.lockTime+'；SHA-256：'+S.inputHash:'【尚未鎖定】名單截止且資格人工審查後，應將鎖定摘要及完整 SHA-256 附於核定附件。'),'五、抽籤：採 Web Crypto getRandomValues、拒絕採樣與 Fisher–Yates 產生完整無放回排名，前 K 人按鎖定車位序配位，其次 W 人依序列備取。以學號為唯一識別碼；'+(r.case==='ci'?'不分大小寫並轉大寫':'區分大小寫')+'，NFKC 正規化及去頭尾空白，保留前導零；同名學生可以保留。','六、現場作業：主持與見證人當眾核對名單人數、車位、規則及核定附件的相同 SHA-256 後執行一次抽籤。若取消或重抽，須記錄操作人及原因，保留前後結果。','七、工具範圍：名單僅在瀏覽器記憶體處理，不自動上傳或儲存；重新整理即可能遺失。靜態網頁無跨分頁／跨裝置防重抽、可信時間或不可竄改保證。雜湊及重播只檢查資料一致性，不能取代現場見證、紙本簽章與學校資安程序。','擬辦：規則如奉核可，請依核定名單／快照及現場程序辦理；本草稿不代表主管已核准。','承辦單位／人員：'+g('org'),'附件：核定規則、人工審查完成名單、鎖定快照摘要及操作檢核表。'].join('\n');
}
function download(filename,text,mime){const a=node('a');const url=URL.createObjectURL(new Blob([text],{type:mime}));a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function printReport(){let t=docText();const d=active();if(d){t+='\n\n【本次抽籤結果：'+d.payload.mode+'】\n本機時間：'+d.payload.time+'\n鎖定 SHA-256：'+d.payload.inputHash+'\n結果 SHA-256：'+d.postHash+'\n登錄核准文號／日期：'+(d.payload.approval.no||'無')+'／'+(d.payload.approval.date||'無')+'\n';displayRows(d,false).forEach(r=>t+=r.rank+'　'+r.status+(r.waitRank?r.waitRank:'')+'　'+(r.slot||'—')+'　'+r.cl+'　'+r.id+'　'+r.nm+'\n');}t+='\n【本分頁操作歷史】\n';S.audit.forEach(e=>t+=e.body.seq+'　'+e.body.time+'　'+e.body.type+'　'+e.body.actor+'　'+e.body.reason+'\n');t+='\n本表待現場核對後簽名；系統未代為證明程序完成。\n承辦：____________　主持：____________　見證：____________\n[亮亮營養師 AI研究開發]';$('printArea').textContent=t;window.print();}
function resultCSV(full){const d=active();if(!d){say('尚無有效結果。',true);return;}if(full&&!confirm('完整結果含完整姓名與學號，請確認僅供有權限的行政留存。'))return;const rows=[['本次模式','排名','結果','備取序','車位','班級','學號','姓名','鎖定SHA256','結果SHA256']];displayRows(d,full).forEach(r=>rows.push([d.payload.mode,r.rank,r.status,r.waitRank||'',r.slot,r.cl,r.id,r.nm,d.payload.inputHash,d.postHash]));download(full?'停車位_完整結果.csv':'停車位_遮罩公告.csv',C.csv(rows),'text/csv;charset=utf-8');say('結果已匯出。公告範圍及可辨識性請依校內核定規則確認。');}
function auditPackage(){return {schema:'parking-audit/1.0',toolVersion:C.VERSION,sessionId:S.sessionId,exportedAt:new Date().toISOString(),limitations:'資料一致性紀錄；非隨機性、核准或不可竄改證明。時間來自本機。',snapshots:S.snapshots,draws:S.draws,audit:S.audit,failedAttempt:S.failedAttempt};}
async function verifyPackage(pkg){
 if(pkg?.schema!=='parking-audit/1.0'||!Array.isArray(pkg.draws)||pkg.draws.length>100||!Array.isArray(pkg.snapshots)||pkg.snapshots.length>100||!Array.isArray(pkg.audit)||pkg.audit.length>1000)throw Error('不支援的稽核包格式或數量超限。');
 const messages=[];for(const [i,s] of pkg.snapshots.entries()){const rebuilt=C.makeSnapshot(s.snapshot.rules,s.snapshot.roster,s.snapshot.slots);if(C.canonical(rebuilt)!==C.canonical(s.snapshot)||await C.hash(rebuilt)!==s.inputHash)throw Error('快照 '+(i+1)+' 不一致。');}
 if(!await C.verifyAudit(pkg.audit))throw Error('操作紀錄鏈不一致。');
 for(const [i,d] of pkg.draws.entries()){const v=await C.verifyRecord(d);if(!v.ok)throw Error('第 '+(i+1)+' 次：'+v.errors.join('；'));if(!pkg.snapshots.some(s=>s.inputHash===d.payload.inputHash))throw Error('第 '+(i+1)+' 次缺少來源快照。');if(!pkg.audit.some(e=>e.body.type==='產生抽籤結果'&&e.body.details.runId===d.payload.runId&&e.body.details.postHash===d.postHash))throw Error('第 '+(i+1)+' 次缺少抽籤事件。');if(!C.verifyCancellation(d,pkg.audit))throw Error('第 '+(i+1)+' 次取消狀態與紀錄不一致。');messages.push('第 '+(i+1)+' 次一致');}
 return pkg.snapshots.length+' 份快照、'+pkg.draws.length+' 次抽籤與 '+pkg.audit.length+' 筆操作紀錄一致。'+messages.join('；')+'。這不證明隨機來源、真實核准或不可竄改。';
}
function validateRequirements(data){
 return C.validateRequirements(data,MASK);
}
async function loadFile(file,limit){if(!file)throw Error('未選擇檔案。');if(file.size>limit)throw Error('檔案超過 '+Math.round(limit/1024/1024)+' MB 上限。');return await file.text();}
function applyRequirements(data){const r=data.rules;for(const [key,,,hasP] of FIELDS){$('f_'+key).value=r.fields[key].v;if(hasP)$('p_'+key).checked=r.fields[key].p;}$('ptype').value=r.ptype;$('slots').value=data.slots.join('\n');$('W').value=r.W;$('pool').value=r.pool;$('case').value=r.case;$('pre').checked=r.pre;S.demo=S.demo||r.dataKind==='demo';S.validation=null;S.revision++;resetApproval();refresh();}
function newCase(){if(S.busy)return;if(confirm('開始新案件會清除本分頁名單、快照與全部歷史。請先匯出完整稽核包。確定已留存並清除？')){S.allowLeave=true;location.reload();}}
function demo(){if(S.locked||S.busy)return;if(($('csv').value||$('f_title').value)&&!confirm('載入示範將取代尚未鎖定的需求與名單，確定嗎？'))return;const rules=readRules();for(const [k] of FIELDS){rules.fields[k]={v:'',p:!!FIELDS.find(f=>f[0]===k)[3]};}Object.assign(rules,{ptype:'一般機車位（示範）',W:5,pool:'none',pre:true,case:'cs',dataKind:'demo'});const values={title:'示範案件：學生停車位抽籤',org:'示範承辦單位',dead:'2026-11-10T12:00',when:'2026-11-11T12:00',place:'示範會議室',elig:'待主管確認申請資格',wait:'待主管確認放棄與遞補期限',abs:'待主管確認缺席是否影響資格',chair:'示範主持人',wit:'示範見證人',app:'待主管確認異議管道',ret:'待主管確認留存期限',mask:MASK};for(const [k,v] of Object.entries(values))rules.fields[k].v=v;const slots=Array.from({length:10},(_,i)=>'A'+String(i+1).padStart(3,'0'));applyRequirements({rules,slots});const rows=[['student_id','class_name','full_name']];for(let i=1;i<=30;i++)rows.push(['DEMO'+String(i).padStart(4,'0'),'示範'+(['商經一甲','會計二乙','資料三甲'][i%3]),i===29||i===30?'示範同名':i===28?'示範,引號"測試':'示範學生'+String(i).padStart(2,'0')]);$('csv').value=C.csv(rows);showValidation(readValidation());go(0);say('已載入 30 位虛擬學生、10 個車位、5 位備取，含同名與引號測試案例。僅能演練；正式作業請開始新案件。');}
$('bval').onclick=()=>{showValidation(readValidation());$('msgs').focus();};$('block').onclick=lock;$('bdraw').onclick=draw;$('bcan').onclick=cancel;$('bunl').onclick=unlock;$('bdemo').onclick=demo;$('bnew').onclick=$('breset').onclick=newCase;
$('bcopy').onclick=async()=>{$('doc').value=docText();try{await navigator.clipboard.writeText($('doc').value);say('公文草稿已複製。');}catch{$('doc').focus();$('doc').select();say('瀏覽器未允許自動複製；已選取全文，可手動複製。');}};
$('btxt').onclick=()=>download('停車位抽籤_簽呈草稿.txt',docText(),'text/plain;charset=utf-8');$('bprt').onclick=$('bprintResult').onclick=printReport;
$('bcsvsample').onclick=()=>download('停車位名單_空白範本.csv',C.csv([['student_id','class_name','full_name']]),'text/csv;charset=utf-8');$('bcm').onclick=()=>resultCSV(false);$('bcf').onclick=()=>resultCSV(true);
$('baj').onclick=()=>{if(!S.audit.length)return;if(confirm('完整稽核包含完整學生名單與各次抽籤紀錄，請僅供有權限者留存。確定下載？'))download('停車位抽籤_完整稽核.json',JSON.stringify(auditPackage(),null,2),'application/json');};
$('brp').onclick=async()=>{if(S.busy)return;S.busy=true;refresh();try{$('rpl').textContent=await verifyPackage(auditPackage());}catch(e){$('rpl').textContent='驗證失敗：'+e.message;}finally{S.busy=false;refresh();}};
$('faudit').onchange=async e=>{const f=e.target.files[0];if(!f||S.busy)return;S.busy=true;refresh();try{const text=await loadFile(f,10*1024*1024);$('rpl').textContent=await verifyPackage(JSON.parse(text));}catch(x){$('rpl').textContent='驗證失敗：'+x.message;}finally{S.busy=false;refresh();e.target.value='';}};
$('bexp').onclick=()=>{try{const r=readRules();r.W=C.waitCount(r.W);download('停車位_行政需求.json',JSON.stringify({schema:'parking-requirements/1.0',rules:r,slots:C.validateSlots($('slots').value).slots},null,2),'application/json');say('需求已匯出，不含學生名單或核准登錄；原始 CSV 請另行留存。');}catch(e){say(e.message,true);}};
$('fimp').onchange=async e=>{const f=e.target.files[0];if(!f||S.locked||S.busy)return;const rev=S.revision;try{const data=validateRequirements(JSON.parse(await loadFile(f,C.MAX_TEXT)));if(S.locked||S.busy||rev!==S.revision)throw Error('讀檔期間資料已變更，未套用。請重新匯入。');applyRequirements(data);say('需求已完整驗證後匯入，核准登錄及現場勾選已重設；未匯入學生名單。');}catch(x){say('未變更表單：'+x.message,true);}finally{e.target.value='';}};
$('fcsv').onchange=async e=>{const f=e.target.files[0];if(!f||S.locked||S.busy)return;const rev=S.revision;try{const text=await loadFile(f,C.MAX_TEXT);if(S.locked||S.busy||rev!==S.revision)throw Error('讀檔期間資料已變更，請重新選擇。');$('csv').value=text;S.revision++;showValidation(readValidation());}catch(x){say(x.message,true);}finally{e.target.value='';}};
['s0','csv'].forEach(id=>$(id).addEventListener('input',()=>{if(!S.locked&&!S.busy){S.revision++;S.validation=null;resetApproval();refresh();}}));
['apon','apno','apdt','aphs','runmode'].forEach(id=>$(id).addEventListener('input',refresh));document.querySelectorAll('.pc').forEach(c=>c.onchange=refresh);
['full','resultSearch'].forEach(id=>$(id).addEventListener('input',()=>{S.page=0;renderResults();}));$('bprev').onclick=()=>{S.page=Math.max(0,S.page-1);renderResults();};$('bnext').onclick=()=>{S.page++;renderResults();};
$('bproj').onclick=()=>{const on=document.body.classList.toggle('proj');$('bproj').setAttribute('aria-pressed',String(on));$('bproj').textContent=on?'離開投影模式':'開啟投影模式';if(on){$('full').checked=false;go(3,true);}renderResults();};
window.addEventListener('beforeunload',e=>{if(!S.allowLeave&&($('csv').value||S.audit.length)){e.preventDefault();e.returnValue='';}});
go(0);if(!crypto.subtle)say('此環境未提供 Web Crypto 雜湊，需求填寫仍可用；抽籤請改在 HTTPS 的現代瀏覽器操作。',true);
