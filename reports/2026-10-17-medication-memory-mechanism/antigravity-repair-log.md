# Antigravity 任務修復與審核紀錄

日期：2026-10-17（Asia/Taipei）。此紀錄描述操作與品質審核，不增加新的醫學實證結論。

## 原因與修復方式

1. **Gemini High 判讀錯誤已修正。** 模型列顯示的是目前／預設推理設定。直接點模型列會選取該設定；先聚焦模型 menuitem，再按 ArrowRight 才開啟 Low／Medium／High 子選單。本次介面確實顯示並選用了 Gemini 4 Argon High。先前「只有 Medium、沒有 High」的結論已撤回。
2. **Media 檔案選取事件未能取得。** iframe 內實際 input 接受 PDF。於點擊 Media 前註冊 filechooser 等待、改用 iframe 內直接控制，以及重新連線後重試，仍未收到 chooser；直接點 hidden input 則沒有可見控制。這是本次內建瀏覽器與嵌入上傳流程的相容性限制，沒有證據顯示 PDF 格式不被支援。選取器本身尚未修復。
3. **報告與 Antigravity 位於不同電腦。** Antigravity 實際 Test-Path 結果顯示 Codex 的報告目錄不存在於其遠端主機。連線選單只有一台主機，無可切換的相同報告主機。
4. **可重現的任務修復。** 在既有公開報告庫保存 PDF、HTML、六張 PNG 與 SHA-256 manifest，使用固定 Git commit 的下載連結供 Antigravity 取得資料。以檔案雜湊核對版本，避免把看見路徑、成功下載或抽取文字誤寫成視覺審核。

## 第一輪實際審核

輸入 commit：`2391ca1eef5a41d9658b8ccf7f271d3eebf2b0b4`。

輸入目錄：`review-inputs/before-antigravity-repair/`。這是歷史快照，不是最新報告。

PDF SHA-256：`431672a4b274ab5f7d67b44143fc15eff07040e913093e8a77df08507cdf5eea`（397526 bytes）。

HTML SHA-256：`045f059db8e136346335e13f8b724602fbd0817f4d5b949345fb8ff0e61c658a`。

### Claude Opus 5.5／Medium

介面設定確認。17:27 完成穩定回答；工具紀錄顯示下載、雜湊、PDF 頁數檢查與 page-1.png 至 page-6.png 六次圖像讀取。回覆正文含 101 個中文字（英數與標點未計）。

> 已下載8個檔案；PDF為397526 bytes，SHA-256與預期相符，原始結構解析得/Count 6，確認共6頁。六張PNG已逐張開啟目視：繁中字體一致，未見缺字或頁面裁切，表格完整，第7筆文獻含zopiclone, triazolam and placebo。發現：第2頁概念圖右框超出正文右界；第1頁副標以「：」起行；第5頁Opus 5.5列仍寫「未執行PDF審核」。未完成：pypdf未安裝，未另行渲染PDF比對。

### Gemini 4 Argon／High

介面設定確認。17:30 完成穩定回答；工具紀錄顯示 PDF／HTML 雜湊、manifest、HTML 原碼、PDF 以及六張 PNG 的實際讀取。回覆正文含 123 個中文字（英數與標點未計）。

> 以Gemini 4 Argon High獨立完成：下載快照驗雜湊吻合、讀PDF共6頁並逐張視檢6張PNG、查HTML原文（表caption/scope、SVG替代文字、#ref1-11與11筆文獻、頁尾[亮亮營養師 AI研究開發]均備）。問題：HTML目錄漏#limitations且與PDF七章結構不一；PDF p.2圖1底框偏右且漏虛線箭頭、p.3與5缺表名、p.4『罕見』引號不一、p.5舊狀態、p.6漏頁尾署名、第105行[1–10]缺2-9連結。限制：手機樣式僅查原始碼未渲染；醫學主張未回源查核不稱已核實。

## 已採納的修訂與裁決

- PDF 概念圖縮至正文範圍，補上與 HTML 相對應的虛線連接。
- 封面副標明確換行，移除冒號落在行首；記憶三階段以同一組區塊換頁。
- 補上 PDF 表 1、表 2 表名與文末署名；統一「罕見」引號。
- HTML 目錄補入研究限制；廣泛引文範圍改為具體來源 1、2、4、5、10，各筆可點選。
- PDF 與 HTML 的 Antigravity 模型、設定與實際參與紀錄改為完成狀態，保留工具限制。
- PDF 與 HTML 仍採不同的章節分組；內容主題完整，這是格式分組差異，不作為醫學內容矛盾。
- 整合者以 Poppler 重建六頁圖並逐頁目視檢查；修正版的再次跨模型核對另記於下方。

## 修正版複核

修正版複核正在執行；完成前不宣稱兩模型已核准最新版本。

## 持續限制

Antigravity 沒有獨立重新渲染 PDF 的成功紀錄；視覺審核使用已核對版本的 PNG。Gemini 手機樣式只做原碼檢查，手機畫面由 Codex 內建瀏覽器另檢視。兩次品質審核都不代表重新完成醫學來源查證。
