"use strict";

const byId = id => document.getElementById(id);
const file = byId("file");
const assign = byId("assign");
const clear = byId("clear");
const download = byId("download");
const status = byId("status");
const error = byId("error");
const preview = byId("preview");
const results = byId("results");
const idleMessage = "請先選擇 Excel 檔案。";
let imported = null;
let assigned = null;
let version = 0;

function showRows(id, rows) {
  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const value of row) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    }
    fragment.append(tr);
  }
  byId(id).replaceChildren(fragment);
}

function reset() {
  version++;
  imported = null;
  assigned = null;
  assign.setAttribute("aria-disabled", "true");
  file.setAttribute("aria-busy", "false");
  error.hidden = true;
  error.textContent = "";
  preview.hidden = true;
  results.hidden = true;
  clear.hidden = true;
  byId("file-name").hidden = true;
  byId("file-name").textContent = "";
  byId("student-count").textContent = "—";
  byId("permit-count").textContent = "—";
  byId("permit-preview").textContent = "";
  byId("preview-meta").textContent = "";
  byId("result-meta").textContent = "";
  byId("download-status").textContent = "";
  download.disabled = false;
  showRows("preview-rows", []);
  showRows("result-rows", []);
  status.textContent = idleMessage;
}

function showError(message) {
  error.hidden = false;
  error.textContent = message;
  error.focus();
}

function discardResult() {
  return !assigned || confirm("目前已有分配結果。繼續會清除畫面上的結果，確定繼續？");
}

file.addEventListener("change", async () => {
  const selected = file.files[0];
  if (!selected) return;
  file.value = "";
  if (!discardResult()) return;
  reset();
  const current = version;
  clear.hidden = false;
  const fileName = byId("file-name");
  fileName.hidden = false;
  fileName.textContent = selected.name;
  file.setAttribute("aria-busy", "true");
  status.textContent = "正在讀取 Excel…";
  try {
    if (!/\.xlsx$/i.test(selected.name)) throw Error("請選擇副檔名為 .xlsx 的 Excel 檔案。");
    const data = await PermitWorkbook.read(await selected.arrayBuffer());
    if (current !== version) return;
    const { students, permits, rosterSheet, permitSheet, rosterRow, permitRow } = data;
    byId("student-count").textContent = students.length;
    byId("permit-count").textContent = permits.length;
    byId("preview-meta").textContent = `顯示前 ${Math.min(5, students.length)} 筆，共 ${students.length} 筆。名冊標題在「${rosterSheet}」第 ${rosterRow} 列，車證號標題在「${permitSheet}」第 ${permitRow} 列。`;
    showRows("preview-rows", students.slice(0, 5));
    const permitSample = permits.slice(0, 5).join("、");
    byId("permit-preview").textContent = permits.length
      ? `車證號預覽（共 ${permits.length} 個）　${permitSample}${permits.length > 5 ? " 等" : ""}`
      : "車證號欄目前沒有可用號碼。";
    preview.hidden = false;
    if (permits.length < students.length) {
      const deficit = students.length - permits.length;
      status.textContent = `尚缺 ${deficit} 個車證號，暫無法分配。`;
      showError(`請在 Excel 的「車證號」欄補上至少 ${deficit} 個不重複的號碼，再重新匯入。`);
      return;
    }
    imported = data;
    assign.setAttribute("aria-disabled", "false");
    status.textContent = `已讀取 ${students.length} 位學生與 ${permits.length} 個車證號，可以開始配對。`;
  } catch (failure) {
    if (current !== version) return;
    status.textContent = "匯入失敗，請修正後重新選擇檔案。";
    showError(failure.message || "無法讀取此檔案。");
  } finally {
    if (current === version) file.setAttribute("aria-busy", "false");
  }
});

assign.addEventListener("click", () => {
  if (!imported || assigned) return;
  const { students, permits } = imported;
  const shuffled = ParkingCore.shuffle(permits);
  assigned = students.map((student, index) => [...student, shuffled[index]]);
  showRows("result-rows", assigned);
  byId("result-meta").textContent = `已分配 ${assigned.length} 筆，剩餘 ${permits.length - assigned.length} 個車證號。`;
  assign.setAttribute("aria-disabled", "true");
  status.textContent = `已完成 ${assigned.length} 筆配對。`;
  results.hidden = false;
  byId("results-title").focus();
});

clear.addEventListener("click", () => {
  if (!discardResult()) return;
  reset();
  file.focus();
});

download.addEventListener("click", async () => {
  if (!assigned || download.disabled) return;
  const current = version;
  download.disabled = true;
  const message = byId("download-status");
  message.textContent = "正在建立 Excel…";
  try {
    const blob = await PermitWorkbook.exportResults(assigned);
    if (current !== version) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date());
    link.href = url;
    link.download = `車證分配結果_${date}.xlsx`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    message.textContent = "已開始下載結果。";
  } catch {
    if (current === version) message.textContent = "無法建立 Excel，請再試一次。";
  } finally {
    if (current === version) download.disabled = false;
  }
});
