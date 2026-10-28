# 校園車位抽籤系統 v1.0.1

學生手機登記、校方管理端配位及正備取匯出。機車（含微電機）與腳踏車各自抽籤，每位學生限登記一類。

本次交付經使用者確認為「可操作虛構展示版＋Supabase正式部署套件」。展示版不是已啟用的跨裝置學生登記服務。

## 快速演練
1. 開啟網站的「學生車位登記」，選擇內建虛構學生，點「填入範例」，試送出登記。三欄不符或重複登記會拒絕。
2. 切換「行政管理與抽籤」，進入示範管理端。
3. 點「載入示範報名」產生9位虛構申請人：機車6人、腳踏車3人。預設車格分別4個及2個。
4. 點「立即截止（示範）」，核對名單與車格，勾選確認，再由主管點擊抽籤。
5. 畫面至少3秒顯示「車位配對中」，一次顯示6位正取與3位備取。機車及腳踏車分別排序，備取名次各自從1開始。
6. 可搜尋或篩選畫面；Excel、PDF及稽核JSON仍匯出完整結果。PDF按鈕開啟瀏覽器列印視窗，請選另存PDF。
7. 重新整理後進入示範管理端會讀取同一輪結果；想重新演練時明確重置虛構示範。

## 功能與資料
- 名冊核對：班級、學號、姓名trim與Unicode NFC後完全一致，學號保留前導零。不模糊比對，不證明填表者本人身分。
- 名冊正式匯入：UTF-8 CSV，欄名`班級,學號,姓名`（亦可`class_name,student_id,name`），先預覽及檢查重複，再確認。展示版禁止匯入真實名冊。
- 期間：設定及顯示以Asia/Taipei為準；正式模式最終由資料庫時間裁決。
- 抽籤：學生及車格各自以安全亂數、拒絕採樣、Fisher–Yates洗牌；前K名配位，餘者連續排備取，空車格另列。
- 防重抽：展示在本瀏覽器保存虛構結果；正式模式在資料庫交易內鎖定活動，既有結果直接回傳，不能重新隨機。
- Excel：原生`.xlsx` OOXML，學號及所有文字採字串儲存，包含看似公式的字串；不依賴外部CDN。
- PDF：A4列印樣式、重複表頭、完整總表及主持見證欄；不限於畫面分頁。
- 快照SHA-256核對抽籤前輸入一致性，不含結果、不是數位簽章，也不證明未曾於其他環境重抽。

展示資料僅保存於目前瀏覽器的localStorage，無法跨裝置同步。正式模式不將名冊或管理員session寫入localStorage，資料由Supabase RPC與管理權限控管。

## 正式部署
閱讀[DEPLOYMENT.md](DEPLOYMENT.md)，在學校控制的Supabase專案執行[supabase/schema.sql](supabase/schema.sql)，建立管理員allowlist，再設定[config.js](config.js)。公開repo只可放公開Project URL、公開金鑰及活動UUID，不可放資料庫密碼、service_role或真實學生名冊。

正式資料庫尚未建立、SQL與正式跨裝置／權限／並發驗收尚未完成。請依部署指南驗收後才向學生開放。

## 維護
- `index.html`、`style.css`、`ui-polish.css`：主體與UI優化。
- `app.js`：登記、管理、抽籤呈現及匯出流程。
- `core.js`：虛構抽籤、CSV及真正XLSX生成核心。
- `backend.js`：正式Supabase Auth/RPC介接。
- `config.js`：展示／正式連線設定。
- `supabase/schema.sql`：正式資料庫與授權函式。
- `tests/`：核心與隔離無頭瀏覽器功能檢查。瀏覽器檢查使用全新暫存個人檔案，不連既有Chrome帳號。
- `AI-PARTICIPATION.md`：實際平台參與及檢查限制。

一般靜態HTTP伺服器即可預覽；以HTTPS部署GitHub Pages。尚未進行完整WCAG、學校資安稽核或第三方公平性認證。

重現檢查：`npm install`後執行`npm test`；瀏覽器檢查先安裝Playwright Chromium（`npx playwright install chromium`）再執行`npm run test:browser`。也可用`PLAYWRIGHT_MODULE`與`PLAYWRIGHT_CHROMIUM_EXECUTABLE`指定已安裝的測試執行環境。這些只是開發檢查依賴，網站本身不需要安裝npm套件。

[亮亮營養師 AI研究開發]
