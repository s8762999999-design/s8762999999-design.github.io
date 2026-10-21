/* Pure data and lottery functions. No network, storage, DOM, or eligibility decisions. */
(function(root){
'use strict';
const VERSION='parking-lottery/1.0.0', ALGORITHM='fisher-yates-u32-rejection-v1';
const LIMIT=2000, MAX_TEXT=1024*1024;
const FIELD_KEYS=['title','org','dead','when','place','elig','wait','abs','chair','wit','app','ret','mask'];
const norm=v=>String(v??'').normalize('NFKC').trim();
const idNorm=(v,mode)=>mode==='ci'?norm(v).toUpperCase():norm(v);
const clone=v=>JSON.parse(JSON.stringify(v));
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
function canonical(v){
 if(v===null||typeof v!=='object')return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
}
async function hash(v){const s=typeof v==='string'?v:canonical(v);const b=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');}
function parseCSV(text){
 if(typeof text!=='string'||text.length>MAX_TEXT||new TextEncoder().encode(text).byteLength>MAX_TEXT)throw Error('CSV 超過 1 MB 文字上限，請分批整理後再匯入。');
 text=text.replace(/^\uFEFF/,'');let state='start',field='',row=[],rows=[],lines=[],line=1,rowLine=1;
 function cell(){row.push(field);field='';state='start';}
 function end(){const structured=row.length>0||state==='closed';cell();if(structured||row.some(x=>x.trim()!=='')){rows.push(row);lines.push(rowLine);}row=[];if(rows.length>LIMIT+1)throw Error('CSV 超過 2000 人上限。');}
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(state==='quoted'){
   if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else state='closed';}
   else {field+=c;if(c==='\n')line++;}
   continue;
  }
  if(state==='closed'&&c!==','&&c!=='\r'&&c!=='\n')throw Error('CSV 第 '+line+' 行：結束引號後只能接逗號或換行。');
  if(c===','){cell();continue;}
  if(c==='\r'||c==='\n'){end();if(c==='\r'&&text[i+1]==='\n')i++;line++;rowLine=line;continue;}
  if(c==='"'){if(state!=='start')throw Error('CSV 第 '+line+' 行：未加引號的欄位中出現引號。');state='quoted';continue;}
  state='plain';field+=c;
 }
 if(state==='quoted')throw Error('CSV 第 '+rowLine+' 行：引號尚未結束。');
 if(field!==''||row.length||state==='closed')end();
 return {rows,lines};
}
function validText(value,label,line){
 const s=norm(value);if(!s)throw Error('第 '+line+' 行：'+label+'不可空白。');
 if(s.length>80||/[\u0000-\u001F\u007F]/.test(s))throw Error('第 '+line+' 行：'+label+'須為 1–80 字且不可含控制字元。');
 return s;
}
function validateRoster(text,mode='cs'){
 const errors=[],warnings=[];let roster=[];
 if(!['cs','ci'].includes(mode))return {errors:['學號大小寫規則不合法。'],warnings,roster};
 try{
  const {rows,lines}=parseCSV(text);if(!rows.length)throw Error('請貼上名單或載入示範名單。');
  const headers=rows[0].map(x=>norm(x).toLowerCase()),expected=['student_id','class_name','full_name'];
  if(headers.length!==3||new Set(headers).size!==3||expected.some(k=>!headers.includes(k)))throw Error('標題列只能包含 student_id,class_name,full_name 三欄；可調整順序。');
  const ix=expected.map(k=>headers.indexOf(k)),seen=new Map(),names=new Map();
  rows.slice(1).forEach((row,i)=>{
   const line=lines[i+1];try{
    if(row.length!==3)throw Error('第 '+line+' 行：應為 3 欄，實際為 '+row.length+' 欄。');
    const id=idNorm(validText(row[ix[0]],'學號',line),mode),cl=validText(row[ix[1]],'班級',line),nm=validText(row[ix[2]],'姓名',line);
    if(seen.has(id))throw Error('第 '+line+' 行：學號 '+id+' 與第 '+seen.get(id)+' 行重複。');
    seen.set(id,line);roster.push({id,cl,nm});names.set(nm,(names.get(nm)||0)+1);
   }catch(e){errors.push(e.message);}
  });
  if(!roster.length&&!errors.length)errors.push('標題列下方沒有申請人。');
  const same=[...names].filter(([,n])=>n>1);if(same.length)warnings.push('同名 '+same.length+' 組：'+same.map(([n])=>n).join('、')+'。學號不同可保留，請用班級與學號核對。');
 }catch(e){errors.push(e.message);}
 return {errors,warnings,roster};
}
function validateSlots(text){
 const errors=[],slots=[],seen=new Set();if(String(text).length>MAX_TEXT)return {errors:['車位資料超過大小上限。'],slots};
 String(text).split(/\r\n|\r|\n/).forEach((x,i)=>{if(!norm(x))return;try{const s=validText(x,'車位代碼',i+1);if(seen.has(s))throw Error('車位代碼 '+s+' 重複。');seen.add(s);slots.push(s);}catch(e){errors.push(e.message);}});
 if(!slots.length)errors.push('至少填入一個車位代碼。');if(slots.length>LIMIT)errors.push('車位上限為 2000 個。');return {errors,slots};
}
function waitCount(value){if(!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)>LIMIT)throw Error('備取名額須為 0–2000 的整數。');return Number(value);}
function localEpoch(s){
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s||'');if(!m)return NaN;
 const [y,mo,d,h,mi]=m.slice(1).map(Number),u=new Date(Date.UTC(y,mo-1,d,h,mi));
 if(y<1900||y>2200||u.getUTCFullYear()!==y||u.getUTCMonth()!==mo-1||u.getUTCDate()!==d||u.getUTCHours()!==h||u.getUTCMinutes()!==mi)return NaN;
 return u.getTime()-8*3600000;
}
function makeSnapshot(rules,roster,slots){
 const copy=clone(rules);copy.W=waitCount(copy.W);if(!['cs','ci'].includes(copy.case))throw Error('學號大小寫規則不合法。');
 if(typeof copy.pre!=='boolean'||typeof copy.ptype!=='string'||copy.ptype.length>80||!copy.fields)throw Error('規則欄位型別不合法。');
 FIELD_KEYS.forEach(k=>{const f=copy.fields[k];if(!f||typeof f.v!=='string'||f.v.length>2000||typeof f.p!=='boolean')throw Error('規則欄位 '+k+' 不完整。');});
 if(!['none','undec','prio','multi'].includes(copy.pool))throw Error('抽籤池需求不合法。');
 if(!['demo','administrative'].includes(copy.dataKind))throw Error('資料模式不合法。');
 if(!Array.isArray(roster)||!roster.length||roster.length>LIMIT||!Array.isArray(slots)||!slots.length||slots.length>LIMIT)throw Error('名單或車位數量不合法。');
 const seen=new Set(),clean=roster.map((r,i)=>{const id=idNorm(validText(r.id,'學號',i+1),copy.case),cl=validText(r.cl,'班級',i+1),nm=validText(r.nm,'姓名',i+1);if(seen.has(id))throw Error('學號重複：'+id);seen.add(id);return {id,cl,nm};});
 const cleanSlots=slots.map((s,i)=>validText(s,'車位代碼',i+1));if(new Set(cleanSlots).size!==cleanSlots.length)throw Error('車位代碼重複。');
 clean.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 return freeze({schema:VERSION,rules:copy,roster:clean,slots:cleanSlots});
}
function formalIssues(snapshot,approval,fieldLabels,at=Date.now()){
 const out=[],r=snapshot.rules;
 if(r.dataKind==='demo')out.push('示範名單僅能演練；正式作業請以新案件匯入經審核名單。');
 if(r.pool!=='none')out.push('優先／多池需求未定或需另外開發，本版只執行單一同資格池。');
 if(!r.pre)out.push('請確認預先核配者已經人工審核排除。');
 for(const [key,label] of Object.entries(fieldLabels||Object.fromEntries(FIELD_KEYS.map(k=>[k,k])))){const f=r.fields?.[key];if(!f||f.p||!norm(f.v)||/待(?:主管)?確認|待填|待定|未定/.test(f.v))out.push(label+'尚未確認。');}
 if(!norm(r.ptype))out.push('車位類型未填。');
 const d=localEpoch(r.fields?.dead?.v),w=localEpoch(r.fields?.when?.v);
 if(!Number.isFinite(d)||!Number.isFinite(w)||d>=w)out.push('截止／抽籤時間須為有效台北時間，且截止時間早於抽籤時間。');
 if(!approval.on||!norm(approval.no)||!/^\d{4}-\d{2}-\d{2}$/.test(approval.date||'')||!Number.isFinite(localEpoch((approval.date||'')+'T00:00')))out.push('核准勾選、文號與有效核准日期須完整。');
 if(Number.isFinite(w)&&localEpoch((approval.date||'')+'T00:00')>w)out.push('核准日期不可晚於預計抽籤日期。');
 if(!Number.isFinite(at)||d>at||w>at)out.push('本機時間尚未到報名截止或預定抽籤時間；不得提前執行。');
 if(localEpoch((approval.date||'')+'T00:00')>at)out.push('核准日期尚未到達（依本機時間）。');
 if(!/^[a-f\d]{64}$/.test(approval.hash||'')||approval.hash!==approval.inputHash)out.push('請逐字核對奉核附件中的 SHA-256，須與鎖定值一致。');
 return out;
}
function randomInt(bound,getU32){
 if(!Number.isInteger(bound)||bound<1||bound>4294967296)throw Error('隨機抽樣範圍不合法。');
 const next=getU32||(()=>{const a=new Uint32Array(1);root.crypto.getRandomValues(a);return a[0];});
 const limit=4294967296-(4294967296%bound);let x;
 do{x=next();if(!Number.isInteger(x)||x<0||x>=4294967296)throw Error('亂數值不合法。');}while(x>=limit);
 return x%bound;
}
function shuffle(ids,getU32){const ranking=ids.slice(),choices=[];for(let i=ranking.length-1;i>0;i--){const j=randomInt(i+1,getU32);choices.push(j);[ranking[i],ranking[j]]=[ranking[j],ranking[i]];}return {ranking,choices};}
function replay(ids,choices){
 if(!Array.isArray(choices)||choices.length!==Math.max(0,ids.length-1))throw Error('洗牌索引數量不一致。');
 const a=ids.slice();for(let i=a.length-1,k=0;i>0;i--,k++){const j=choices[k];if(!Number.isInteger(j)||j<0||j>i)throw Error('洗牌索引超出範圍或不是整數。');[a[i],a[j]]=[a[j],a[i]];}return a;
}
function allocate(snapshot,ranking){
 const byId=new Map(snapshot.roster.map(r=>[r.id,r]));if(ranking.length!==byId.size||new Set(ranking).size!==byId.size||ranking.some(id=>!byId.has(id)))throw Error('排名不是完整且無重複的名單。');
 const k=snapshot.slots.length,w=snapshot.rules.W;
 return ranking.map((id,i)=>({...byId.get(id),rank:i+1,status:i<k?'正取':i<k+w?'備取':'未中籤',slot:i<k?snapshot.slots[i]:'',waitRank:i>=k&&i<k+w?i-k+1:0}));
}
async function createRecord(snapshot,meta,getU32){
 if(meta.mode==='已登錄核准'&&formalIssues(snapshot,meta.approval,undefined,Date.parse(meta.time)).length)throw Error('核准或執行時程條件不完整。');
 const inputHash=await hash(snapshot),{ranking,choices}=shuffle(snapshot.roster.map(x=>x.id),getU32);
 const payload=freeze({schema:VERSION,algorithm:ALGORITHM,runId:meta.runId,time:meta.time,mode:meta.mode,inputHash,snapshot:clone(snapshot),approval:clone(meta.approval),choices,ranking,results:allocate(snapshot,ranking)});
 return {payload,postHash:await hash(payload),status:'active',cancel:null};
}
async function verifyRecord(record){
 const errors=[];try{
  const p=record.payload;if(p.schema!==VERSION||p.algorithm!==ALGORITHM)throw Error('版本／演算法不支援。');
  const snap=makeSnapshot(p.snapshot.rules,p.snapshot.roster,p.snapshot.slots);
  if(canonical(snap)!==canonical(p.snapshot))errors.push('快照格式或標準排序不一致。');
  if(await hash(snap)!==p.inputHash)errors.push('鎖定前雜湊不一致。');
  if(canonical(replay(snap.roster.map(x=>x.id),p.choices))!==canonical(p.ranking))errors.push('重播排名不一致。');
  if(canonical(allocate(snap,p.ranking))!==canonical(p.results))errors.push('車位／正備取分配不一致。');
  if(await hash(p)!==record.postHash)errors.push('結果雜湊不一致。');
  if(!['演練','已登錄核准'].includes(p.mode))errors.push('模式不合法。');
  if(p.approval?.inputHash!==p.inputHash||!Array.isArray(p.approval?.checks)||p.approval.checks.length!==3||p.approval.checks.some(x=>x!==true))errors.push('現場勾選或核准資料未綁定本快照。');
  if(p.mode==='已登錄核准'&&formalIssues(snap,p.approval,undefined,Date.parse(p.time)).length)errors.push('核准模式或執行時程條件不完整。');
  if(!['active','cancelled'].includes(record.status))errors.push('紀錄狀態不合法。');
  if(record.status==='cancelled'&&(!norm(record.cancel?.actor)||!norm(record.cancel?.reason)))errors.push('取消紀錄不完整。');
 }catch(e){errors.push(e.message);}return {ok:!errors.length,errors};
}
async function auditEvent(previous,type,actor,reason,details,time){
 const body=freeze({seq:previous?previous.body.seq+1:1,time,type,actor:norm(actor),reason:norm(reason),details,previousHash:previous?.hash||null});return freeze({body,hash:await hash(body)});
}
async function verifyAudit(events){let prev=null;for(let i=0;i<events.length;i++){const e=events[i];if(e.body.seq!==i+1||e.body.previousHash!==(prev?.hash||null)||await hash(e.body)!==e.hash)return false;prev=e;}return true;}
function verifyCancellation(record,events){
 const matching=events.filter(e=>e.body.type==='取消抽籤結果'&&e.body.details?.runId===record.payload.runId);
 if(record.status==='active')return matching.length===0&&record.cancel===null;
 return record.status==='cancelled'&&matching.length===1&&!!record.cancel&&matching[0].body.actor===record.cancel.actor&&matching[0].body.reason===record.cancel.reason&&matching[0].body.time===record.cancel.time&&matching[0].body.details.postHash===record.postHash;
}
function safeCSVCell(value){let s=String(value??'');if(/^[\s\uFEFF]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function csv(rows){return '\uFEFF'+rows.map(r=>r.map(safeCSVCell).join(',')).join('\r\n');}
function maskName(s){const a=Array.from(s);return a.length===1?'○':a.length===2?a[0]+'○':a[0]+'○'.repeat(a.length-2)+a[a.length-1];}
function maskID(s){const a=Array.from(s),keep=Math.min(3,Math.max(0,a.length-1));return '*'.repeat(a.length-keep)+(keep?a.slice(-keep).join(''):'');}
function validateRequirements(data,mask){
 if(data?.schema!=='parking-requirements/1.0'||!data.rules||!Array.isArray(data.slots)||data.slots.length>LIMIT)throw Error('需求 JSON 格式／版本不符。');
 const r=data.rules;if(!r.fields||!['cs','ci'].includes(r.case)||!['none','undec','prio','multi'].includes(r.pool)||typeof r.pre!=='boolean'||!['demo','administrative'].includes(r.dataKind))throw Error('需求欄位型別不符。');
 const fields={};for(const key of FIELD_KEYS){const f=r.fields[key];if(!f||typeof f.v!=='string'||f.v.length>2000||typeof f.p!=='boolean')throw Error('需求欄位 '+key+' 不完整。');fields[key]={v:key==='mask'?mask:f.v,p:key==='mask'?false:f.p};}
 if(typeof r.ptype!=='string'||r.ptype.length>80||data.slots.some(s=>typeof s!=='string'||s.length>80||!norm(s)||/[\r\n]/.test(s)))throw Error('車位資料不合法。');
 const sl=data.slots.length?validateSlots(data.slots.join('\n')):{errors:[],slots:[]};if(sl.errors.length||sl.slots.length!==data.slots.length)throw Error('車位清單含重複或不合法代碼。');
 return {rules:{fields,ptype:r.ptype,W:waitCount(r.W),case:r.case,pool:r.pool,pre:r.pre,dataKind:r.dataKind},slots:sl.slots};
}
const api={VERSION,ALGORITHM,LIMIT,MAX_TEXT,FIELD_KEYS,norm,idNorm,clone,freeze,canonical,hash,parseCSV,validateRoster,validateSlots,waitCount,localEpoch,makeSnapshot,formalIssues,randomInt,shuffle,replay,allocate,createRecord,verifyRecord,auditEvent,verifyAudit,verifyCancellation,safeCSVCell,csv,maskName,maskID,validateRequirements};
if(typeof module==='object'&&module.exports)module.exports=api;else root.LotteryCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
