// Isolated application integration test; does not connect to the user's Chrome profile.
let playwright;try{playwright=require('playwright');}catch{if(!process.env.PLAYWRIGHT_MODULE)throw Error('請先安裝playwright，或以PLAYWRIGHT_MODULE指定已安裝的模組。');playwright=require(process.env.PLAYWRIGHT_MODULE);}
const {chromium}=playwright;
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'qa');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.md':'text/plain; charset=utf-8'};
(async()=>{
 const server=http.createServer((req,res)=>{const target=path.resolve(root,'.'+decodeURIComponent((req.url||'/').split('?')[0]));if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(target,(err,b)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'}).end(b);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  const bundled=chromium.executablePath(),chrome=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe';
  browser=await chromium.launch({headless:true,executablePath:fs.existsSync(bundled)?bundled:chrome});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${server.address().port}/index.html`;
  await page.goto(url);await page.getByText('虛構示範模式',{exact:true}).waitFor();
  await page.screenshot({path:path.join(qa,'student-desktop.png'),fullPage:true});
  await page.locator('#fillSample').click();
  assert.equal(await page.locator('#studentId').inputValue(),'001001');
  await page.locator('#studentName').fill('不在虛構名冊的姓名');await page.locator('#registerButton').click();await page.getByText(/無法受理，請核對虛構名冊/).waitFor();
  await page.locator('#fillSample').click();await page.locator('#registerButton').click();await page.getByText(/示範登記成功/).waitFor();
  await page.locator('#fillSample').click();await page.locator('#registerButton').click();await page.getByText(/無法受理，請核對虛構名冊/).waitFor();
  await page.locator('#adminNav').click();await page.locator('#demoEntry').click();assert.equal(await page.locator('#registeredCount').textContent(),'1');
  await page.locator('#seedDemo').click();await page.getByText('已載入9位虛構申請人：機車6人、腳踏車3人。',{exact:true}).waitFor();assert.equal(await page.locator('#registeredCount').textContent(),'9');
  await page.locator('#closeDemo').click();await page.getByText('示範登記已截止，可核對後抽籤。',{exact:true}).waitFor();
  const observer=await context.newPage();observer.on('pageerror',e=>errors.push(e.message));await observer.goto(url);await observer.locator('#adminNav').click();await observer.locator('#demoEntry').click();
  await page.locator('#verified').check();const t=Date.now();await page.locator('#drawButton').click();assert(await page.locator('#pairingOverlay').isVisible());assert(await page.locator('#drawButton').isDisabled());assert(await page.locator('main').evaluate(e=>e.inert));await observer.locator('#pairingOverlay').waitFor({state:'visible'});assert(await observer.locator('#resultSection').isHidden());await page.locator('#pairingOverlay').waitFor({state:'hidden'});assert(Date.now()-t>=2900);await observer.locator('#pairingOverlay').waitFor({state:'hidden'});await observer.close();
  assert.equal(await page.locator('#selectedCount').textContent(),'6');assert.equal(await page.locator('#waitCount').textContent(),'3');assert.equal(await page.locator('#resultBody tr').count(),9);
  const rows=await page.locator('#resultBody').innerText(),meta=await page.locator('#drawMeta').innerText();assert(await page.locator('#drawButton').isDisabled());
  await page.locator('#vehicleFilter').selectOption('bicycle');assert.equal(await page.locator('#resultBody tr').count(),3);
  const dl=page.waitForEvent('download');await page.locator('#exportExcel').click();await(await dl).saveAs(path.join(qa,'browser-export.xlsx'));
  assert.equal(await page.locator('#printArea tbody tr').count(),0);
  await page.pdf({path:path.join(qa,'browser-print.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true});assert.equal(await page.locator('#printArea tbody tr').count(),9);await page.locator('#exportPDF').click();
  await page.locator('#vehicleFilter').selectOption('');await page.screenshot({path:path.join(qa,'results-desktop.png'),fullPage:true});
  await page.reload();await page.locator('#adminNav').click();await page.locator('#demoEntry').click();assert.equal(await page.locator('#drawMeta').innerText(),meta);assert.equal(await page.locator('#resultBody').innerText(),rows);assert(await page.locator('#drawButton').isDisabled());
  await page.setViewportSize({width:390,height:844});await page.locator('#studentNav').click();await page.screenshot({path:path.join(qa,'student-mobile.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#adminNav').click();await page.screenshot({path:path.join(qa,'results-mobile.png'),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:320,height:760});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#logoutButton').click();await page.locator('#studentView').waitFor({state:'visible'});assert(await page.locator('#adminWorkspace').isHidden());
  const broken=await browser.newContext();await broken.route('**/config.js',r=>r.fulfill({contentType:'application/javascript',body:"window.PARKING_CONFIG={mode:'production',supabaseUrl:'',publicKey:'',eventId:''};"}));const bad=await broken.newPage();await bad.goto(url);await bad.getByText('正式模式未啟用',{exact:true}).waitFor();assert(await bad.locator('#registerButton').isDisabled());assert(await bad.locator('#sampleHelper').isHidden());await broken.close();
  assert.deepEqual(errors,[]);
  console.log('PASS browser: mismatch/duplicate rejection, leading zero, 3-second reveal in two tabs, inert focus background, 6 selected/3 waitlist, export-all under filter, native print event, same saved results after reload, 1440/390/320 widths, logout, production misconfiguration fails closed, no page errors.');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
