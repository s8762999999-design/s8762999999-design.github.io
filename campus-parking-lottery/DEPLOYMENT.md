# 正式部署指南

本次使用者確認交付範圍為「可操作展示版＋正式部署套件」。GitHub Pages上的展示不會自動變成跨裝置資料庫；Supabase尚未配置時，請只使用內建虛構資料。

## 正式啟用前
1. 由學校建立並持有Supabase專案，選擇符合校方資料治理要求的區域、備份與保留方式。
2. 在Supabase SQL Editor執行`supabase/schema.sql`；這會建立本應用專用資料表及RPC。
3. 在Auth建立管理員帳號，再將該帳號UUID加入SQL檔案註記的管理員allowlist。僅登入不代表取得管理權。
4. 填入`config.js`的Project URL、公開anon/publishable key及活動ID；不可放service_role、資料庫密碼、存取token或真實名冊。
5. 由管理端設定新活動、臺北時間起訖及兩種車格；匯入正式學生名冊並檢查錯誤與重複。
6. 以兩台不同裝置完成實測，通過下列檢查後才對學生開放正式登記。

## 上線驗收
- 匿名請求無法讀取名冊、申請總表、完整結果及管理員名單。
- 未列入allowlist的登入帳號不能匯入資料、更改活動或抽籤。
- 班級、學號、姓名任一不符均回傳一般性錯誤，不洩漏哪一欄正確。
- 學號前導零保留；重複登記與跨車種重複登記被伺服器拒絕。
- 開始前及截止後伺服器拒絕申請，修改手機時間無效。
- 兩名管理員同時抽籤僅產生一次結果；網路中斷重試及重新整理讀到同一份結果。
- 正取不重複學生及車格；備取序連續，落選者全數包含；不足額列空車格。
- Excel及列印PDF包含完整結果，不受畫面篩選或搜尋影響。
- 正式資料不出現在公開GitHub、網頁原始碼、瀏覽器console或分析追蹤服務。

名冊三欄一致並不能證明填表者本人。若需要防止冒名登記，應另加學校SSO、一次性驗證或人工核准；本次使用者明確選擇先不接校務登入。

## 個資與維運
完整名單僅供授權管理員使用。若校方要公開公告結果，另製遮蔽學號姓名的公告版，依校方核准範圍公開。由學校訂定告知文字、用途、保留期限、刪除流程及申訴窗口。

不可把前端按鈕隱藏當作權限保護。應同時檢查資料表RLS、資料權限及每個RPC的授權。匿名登記服務在大量公開開放前應加上由學校控制的閘道頻率限制或防自動化措施。

## 官方技術依據
- [GitHub Pages建立與限制](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)：只提供靜態網站，不執行本應用的資料庫邏輯。
- [Supabase資料庫函式](https://supabase.com/docs/guides/database/functions)：RPC及函式execute權限、security definer與search_path。
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)：瀏覽器資料存取必須有伺服器端資料保護。

查閱日期：2026-10-28。尚未建立實際Supabase專案，不能把部署套件視為已完成正式環境驗收。
