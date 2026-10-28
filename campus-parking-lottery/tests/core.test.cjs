const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../core.js');
let cases=0;
for(const motorCount of [0,1,3,9])for(const bikeCount of [0,1,4])for(const motorSlots of [0,1,5])for(const bikeSlots of [0,2,6]){
 const applicants=[...Array.from({length:motorCount},(_,i)=>({student_id:'M'+i,vehicle:'motorcycle'})),...Array.from({length:bikeCount},(_,i)=>({student_id:'B'+i,vehicle:'bicycle'}))];
 const slots=[...Array.from({length:motorSlots},(_,i)=>({vehicle:'motorcycle',code:'M'+i})),...Array.from({length:bikeSlots},(_,i)=>({vehicle:'bicycle',code:'B'+i}))];
 const r=C.lottery(applicants,slots);
 assert.deepEqual(r.filter(x=>x.student_id).map(x=>x.student_id).sort(),applicants.map(x=>x.student_id).sort());
 for(const v of ['motorcycle','bicycle']){
  const n=applicants.filter(x=>x.vehicle===v).length,m=slots.filter(x=>x.vehicle===v).length,g=r.filter(x=>x.vehicle===v);
  assert.equal(g.filter(x=>x.outcome==='selected').length,Math.min(n,m));
  assert.deepEqual(g.filter(x=>x.outcome==='waitlist').map(x=>x.wait_rank),Array.from({length:Math.max(0,n-m)},(_,i)=>i+1));
  assert.deepEqual(g.filter(x=>x.slot_code).map(x=>x.slot_code).sort(),slots.filter(x=>x.vehicle===v).map(x=>x.code).sort());
  assert.equal(g.filter(x=>x.outcome==='vacant').length,Math.max(0,m-n));
 }cases++;
}
assert.throws(()=>C.lottery([{student_id:'1',vehicle:'motorcycle'},{student_id:'1',vehicle:'bicycle'}],[]));
assert.throws(()=>C.lottery([],[{vehicle:'bicycle',code:'X'},{vehicle:'bicycle',code:'X'}]));
assert.throws(()=>C.uniform(0));
const parsed=C.rosterFromCSV('\uFEFF班級,學號,姓名\r\n"商一,甲",00123,"測試""名字"\r\n商一乙,00124,範例學生\r\n');
assert.equal(parsed.errors.length,0);assert.equal(parsed.rows[0].student_id,'00123');assert.equal(parsed.rows[0].class_name,'商一,甲');assert.equal(parsed.rows[0].name,'測試"名字');
assert.equal(C.rosterFromCSV('班級,學號,姓名\nA,01,X\nA,01,Y').errors.length,1);
assert.equal(C.rosterFromCSV('班級,學號,姓名\n,,\nA,01,X').errors.length,1);
assert.throws(()=>C.rosterFromCSV('班級,學號,姓名,姓名\nA,01,X,X'));
assert.throws(()=>C.parseCSV('"unclosed'));
const outdir=path.join(__dirname,'..','qa');fs.mkdirSync(outdir,{recursive:true});
fs.writeFileSync(path.join(outdir,'export-test.xlsx'),C.xlsx([{vehicle:'motorcycle',outcome:'selected',slot_code:'M01',class_name:'測一甲',name:'=1+1',student_id:'00123'}],'虛構匯出測試','非正式資料'));
console.log(`PASS ${cases} allocation boundary cases; duplicate validation; strict CSV; generated genuine XLSX fixture.`);
