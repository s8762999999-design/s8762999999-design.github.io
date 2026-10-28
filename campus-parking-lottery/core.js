/* Codex functional core: demo lottery, strict CSV and dependency-free genuine XLSX. */
(function(root){
 'use strict';
 const norm=x=>String(x??'').trim().normalize('NFC');
 const vehicleLabel=v=>v==='motorcycle'?'機車／電動機車':'腳踏車';
 function uniform(n){
  if(!Number.isInteger(n)||n<1||n>4294967296)throw Error('亂數範圍不正確');
  const lim=4294967296-(4294967296%n),a=new Uint32Array(1);let x;
  do{crypto.getRandomValues(a);x=a[0];}while(x>=lim);return x%n;
 }
 function shuffle(input){const a=[...input];for(let i=a.length-1;i>0;i--){const j=uniform(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
 function lottery(registrations,slots){
  const ids=new Set();for(const r of registrations){if(!r.student_id||ids.has(r.student_id)||!['motorcycle','bicycle'].includes(r.vehicle))throw Error('登記資料重複或車種錯誤');ids.add(r.student_id);}
  const result=[];
  for(const vehicle of ['motorcycle','bicycle']){
   const candidates=shuffle(registrations.filter(r=>r.vehicle===vehicle));
   const codes=slots.filter(s=>s.vehicle===vehicle).map(s=>norm(s.code));
   if(codes.some(x=>!x)||new Set(codes).size!==codes.length)throw Error('車格空白或重複');
   const parking=shuffle(codes),k=Math.min(candidates.length,parking.length);
   candidates.forEach((r,i)=>result.push({...r,vehicle,row_no:i+1,outcome:i<k?'selected':'waitlist',slot_code:i<k?parking[i]:null,wait_rank:i<k?null:i-k+1}));
   parking.slice(k).forEach((code,i)=>result.push({vehicle,row_no:candidates.length+i+1,outcome:'vacant',slot_code:code,wait_rank:null,class_name:'',student_id:'',name:''}));
  }
  return result;
 }
 function parseCSV(text){
  text=String(text).replace(/^\uFEFF/,'');const rows=[];let row=[],field='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++){
   const c=text[i];
   if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;}
   else if(c==='"'){if(field||closed)throw Error('CSV引號格式不正確');quoted=true;}
   else if(c===','){row.push(field);field='';closed=false;}
   else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.length>1||row.some(x=>norm(x))||closed)rows.push(row);row=[];field='';closed=false;}
   else{if(closed&&!/\s/.test(c))throw Error('CSV引號後有多餘字元');if(!closed)field+=c;}
  }
  if(quoted)throw Error('CSV引號未結束');row.push(field);if(row.length>1||row.some(x=>norm(x))||closed)rows.push(row);return rows;
 }
 function rosterFromCSV(text){
  const rows=parseCSV(text);if(rows.length<2)throw Error('名冊需要標題及資料列');
  const h=rows.shift().map(norm);if(new Set(h).size!==h.length)throw Error('CSV標題欄位重複');const find=keys=>h.findIndex(x=>keys.includes(x));
  const ci=find(['班級','class_name']),si=find(['學號','student_id']),ni=find(['姓名','name']);
  if([ci,si,ni].includes(-1))throw Error('CSV標題必須包含班級、學號、姓名');
  const seen=new Set(),valid=[],errors=[];
  rows.forEach((r,i)=>{const o={class_name:norm(r[ci]),student_id:norm(r[si]),name:norm(r[ni])};
   let msg='';if(r.length!==h.length)msg='欄位數不符';else if(!o.class_name||!o.student_id||!o.name)msg='有空白欄位';else if(o.class_name.length>40||o.student_id.length>40||o.name.length>80)msg='欄位過長';else if(seen.has(o.student_id))msg='重複學號';
   if(msg)errors.push({line:i+2,message:msg});else{seen.add(o.student_id);valid.push(o);}});
  if(rows.length>10000)errors.push({line:0,message:'超過10000筆上限'});return {rows:valid,errors};
 }
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
 const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
 const crc32=bytes=>{let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
 function zipStored(files){
  const encoder=new TextEncoder(),parts=[],central=[];let offset=0,size=0;
  function header(length){const b=new Uint8Array(length);return[b,new DataView(b.buffer)];}
  for(const [path,text] of Object.entries(files)){
   const name=encoder.encode(path),data=encoder.encode(text),crc=crc32(data),[a,v]=header(30);
   v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);
   parts.push(a,name,data);const[b,w]=header(46);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint32(16,crc,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,name.length,true);w.setUint32(42,offset,true);central.push(b,name);offset+=a.length+name.length+data.length;size+=b.length+name.length;
  }
  const[end,e]=header(22);e.setUint32(0,0x06054b50,true);e.setUint16(8,central.length/2,true);e.setUint16(10,central.length/2,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);
  const all=[...parts,...central,end],out=new Uint8Array(offset+size+22);let pos=0;for(const p of all){out.set(p,pos);pos+=p.length;}return out;
 }
 function xlsx(rows,title='校園車位抽籤結果',note=''){
  const xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const data=[[title],[note],['車種','結果','車格／備取序','班級','姓名','學號'],...rows.map(r=>[vehicleLabel(r.vehicle),r.outcome==='selected'?'正取':r.outcome==='waitlist'?'備取':'空車格',r.slot_code??'備取 '+r.wait_rank,r.class_name,r.name,r.student_id])];
  const sheet=xml+'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="10" customWidth="1"/><col min="3" max="3" width="20" customWidth="1"/><col min="4" max="5" width="18" customWidth="1"/><col min="6" max="6" width="22" customWidth="1"/></cols><sheetData>'+data.map((r,i)=>'<row r="'+(i+1)+'">'+r.map((c,j)=>'<c r="'+String.fromCharCode(65+j)+(i+1)+'" t="inlineStr" s="'+(i===0?2:i===2?1:0)+'"><is><t xml:space="preserve">'+esc(c)+'</t></is></c>').join('')+'</row>').join('')+'</sheetData><autoFilter ref="A3:F'+data.length+'"/><mergeCells count="2"><mergeCell ref="A1:F1"/><mergeCell ref="A2:F2"/></mergeCells><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>';
  return zipStored({
   '[Content_Types].xml':xml+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
   '_rels/.rels':xml+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
   'xl/workbook.xml':xml+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="正備取總表" sheetId="1" r:id="rId1"/></sheets></workbook>',
   'xl/_rels/workbook.xml.rels':xml+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
   'xl/styles.xml':xml+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Microsoft JhengHei"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Microsoft JhengHei"/></font><font><b/><sz val="16"/><name val="Microsoft JhengHei"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF153954"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="49" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
   'xl/worksheets/sheet1.xml':sheet
  });
 }
 const api=Object.freeze({norm,vehicleLabel,uniform,shuffle,lottery,parseCSV,rosterFromCSV,xlsx});root.ParkingCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
