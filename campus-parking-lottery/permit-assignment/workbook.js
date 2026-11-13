/* Read only the OOXML parts used by the assignment workbook. */
(function (root) {
  "use strict";

  const rosterHeaders = ["班級", "學號", "姓名"];
  const permitHeaders = new Set(["車證號", "車證號碼", "停車證號", "停車證號碼"]);
  const clean = value => String(value ?? "").trim().normalize("NFC");
  const header = value => clean(value).normalize("NFKC").replace(/\s/g, "");
  const elements = (node, name) => [...node.getElementsByTagNameNS("*", name)];
  const child = (node, name) => [...node.children].find(element => element.localName === name);
  const richText = node => [...node.children].map(element => {
    if (element.localName === "t") return element.textContent;
    if (element.localName === "r") return child(element, "t")?.textContent ?? "";
    return "";
  }).join("");

  function parseXml(text) {
    if (/<!DOCTYPE/i.test(text)) throw Error("Excel 檔案含有不支援的 XML 格式。");
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (elements(doc, "parsererror").length) throw Error("Excel 檔案內部資料格式錯誤。");
    return doc;
  }

  async function xmlPart(zip, path) {
    const file = zip.file(path);
    if (!file) throw Error("Excel 檔案缺少必要內容，請另存成 .xlsx 後再試。");
    return parseXml(await file.async("string"));
  }

  function partPath(target, from) {
    const base = new URL(from, "https://workbook.invalid/");
    const url = new URL(target, base);
    if (url.origin !== base.origin) throw Error("Excel 檔案含有無法讀取的外部工作表。");
    return decodeURIComponent(url.pathname.slice(1));
  }

  function formatCell(cell, strings, formats) {
    const type = cell.getAttribute("t");
    const raw = child(cell, "v")?.textContent ?? "";
    if (type === "s") {
      if (!/^\d+$/.test(raw) || strings[Number(raw)] === undefined) {
        throw Error("Excel 檔案的文字資料不完整。");
      }
      return strings[Number(raw)];
    }
    if (type === "inlineStr") {
      const inline = child(cell, "is");
      return inline ? richText(inline) : "";
    }
    const format = formats[Number(cell.getAttribute("s") ?? 0)];
    if ((!type || type === "n") && /^0+$/.test(format ?? "") && /^\d+$/.test(raw)) {
      return raw.padStart(format.length, "0");
    }
    return raw;
  }

  async function readSheets(buffer) {
    let zip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch {
      throw Error("無法開啟 Excel，請確認檔案是未加密的 .xlsx。");
    }
    const main = elements(await xmlPart(zip, "_rels/.rels"), "Relationship")
      .find(element => element.getAttribute("Type")?.endsWith("/officeDocument"));
    if (!main) throw Error("找不到 Excel 活頁簿。");
    const workbookPath = partPath(main.getAttribute("Target"), "/");
    const relPath = workbookPath.replace(/([^/]+)$/, "_rels/$1.rels");
    const [workbook, relDoc] = await Promise.all([xmlPart(zip, workbookPath), xmlPart(zip, relPath)]);
    const rels = elements(relDoc, "Relationship").filter(element => element.getAttribute("TargetMode") !== "External");
    const related = type => rels.find(element => element.getAttribute("Type")?.endsWith("/" + type));
    const readRelated = rel => rel ? xmlPart(zip, partPath(rel.getAttribute("Target"), "/" + workbookPath)) : null;
    const [stringDoc, styleDoc] = await Promise.all([readRelated(related("sharedStrings")), readRelated(related("styles"))]);
    const strings = stringDoc ? elements(stringDoc, "si").map(richText) : [];
    const numberFormats = new Map(styleDoc ? elements(styleDoc, "numFmt").map(el => [el.getAttribute("numFmtId"), el.getAttribute("formatCode")]) : []);
    const cellStyles = styleDoc ? elements(styleDoc, "cellXfs")[0] : null;
    const formats = cellStyles ? [...cellStyles.children].map(el => numberFormats.get(el.getAttribute("numFmtId"))) : [];
    const sheets = [];
    for (const sheet of elements(workbook, "sheet")) {
      const relationId = [...sheet.attributes].find(attribute => attribute.localName === "id")?.value;
      const rel = rels.find(element => element.getAttribute("Id") === relationId);
      if (!rel?.getAttribute("Type")?.endsWith("/worksheet")) continue;
      const sheetDoc = await readRelated(rel);
      const data = elements(sheetDoc, "sheetData")[0];
      const rows = [];
      for (const row of data?.children ?? []) {
        const cells = new Map();
        for (const cell of row.children) {
          const column = cell.getAttribute("r")?.match(/^[A-Z]+/)?.[0];
          if (!column) continue;
          const value = clean(formatCell(cell, strings, formats));
          const invalid = cell.getAttribute("t") === "e" || Boolean(child(cell, "f"));
          if (value || invalid) cells.set(column, { value, invalid });
        }
        if (cells.size) rows.push({ number: row.getAttribute("r"), cells });
      }
      sheets.push({ name: sheet.getAttribute("name"), rows });
    }
    return sheets;
  }

  function collect(sheets) {
    const rosters = [];
    const pools = [];
    for (const sheet of sheets) {
      sheet.rows.forEach((row, index) => {
        const entries = [...row.cells].filter(([, cell]) => !cell.invalid);
        const rosterColumns = rosterHeaders.map(label => entries.filter(([, cell]) => header(cell.value) === label));
        if (rosterColumns.every(matches => matches.length)) {
          if (rosterColumns.some(matches => matches.length > 1)) {
            throw Error(`「${sheet.name}」第 ${row.number} 列有重複的名冊欄名。`);
          }
          rosters.push({ sheet, index, columns: rosterColumns.map(matches => matches[0][0]) });
        }
        entries.filter(([, cell]) => permitHeaders.has(header(cell.value)))
          .forEach(([column]) => pools.push({ sheet, index, columns: [column] }));
      });
    }
    if (!rosters.length) throw Error("找不到名冊標題，請在同一列填寫「班級、學號、姓名」。");
    if (!pools.length) throw Error("找不到「車證號」欄。請加入欄名，並在下方填入可用車證號。");
    if (rosters.length > 1 || pools.length > 1) throw Error("找到多組名冊或車證號標題。請在檔案中各保留一組。");

    const [roster] = rosters;
    const [pool] = pools;
    function readSection(section, other, kind) {
      const { sheet, index, columns } = section;
      const sharesColumns = sheet === other.sheet && columns.some(column => other.columns.includes(column));
      const end = sharesColumns && other.index > index ? other.index : sheet.rows.length;
      const entries = [];
      const seen = new Map();
      for (const row of sheet.rows.slice(index + 1, end)) {
        const cells = columns.map(column => row.cells.get(column));
        if (cells.every(cell => !cell)) continue;
        const location = `「${sheet.name}」第 ${row.number} 列`;
        if (cells.some(cell => cell?.invalid)) throw Error(`${location}的${kind}含公式或 Excel 錯誤，請改為固定值。`);
        const values = cells.map(cell => cell?.value ?? "");
        if (values.some(value => !value)) throw Error(`${location}的班級、學號或姓名有空白，請補齊後重新匯入。`);
        const key = header(values[kind === "名冊" ? 1 : 0]);
        if (seen.has(key)) throw Error(`${location}與第 ${seen.get(key)} 列的${kind === "名冊" ? "學號" : "車證號"}重複，請修正後重新匯入。`);
        seen.set(key, row.number);
        entries.push(values);
      }
      return entries;
    }
    const students = readSection(roster, pool, "名冊");
    const permits = readSection(pool, roster, "車證號").map(([permit]) => permit);
    if (!students.length) throw Error("名冊沒有學生資料，請在標題下方填入名冊。");
    return { students, permits, rosterSheet: roster.sheet.name, permitSheet: pool.sheet.name, rosterRow: roster.sheet.rows[roster.index].number, permitRow: pool.sheet.rows[pool.index].number };
  }

  const escapeXml = value => value.replace(/[&<>]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[character]));
  async function exportResults(rows) {
    const zip = new JSZip();
    const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const pkg = "http://schemas.openxmlformats.org/package/2006";
    const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const ct = "application/vnd.openxmlformats-officedocument.spreadsheetml";
    zip.file("[Content_Types].xml", `<Types xmlns="${pkg}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="${ct}.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${ct}.worksheet+xml"/></Types>`);
    zip.file("_rels/.rels", `<Relationships xmlns="${pkg}/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    zip.file("xl/workbook.xml", `<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="分配結果" sheetId="1" r:id="rId1"/></sheets></workbook>`);
    zip.file("xl/_rels/workbook.xml.rels", `<Relationships xmlns="${pkg}/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`);
    const data = [["班級", "學號", "姓名", "車證號"], ...rows];
    const sheetRows = data.map((row, index) => {
      const number = index + 1;
      const cells = row.map((value, column) =>
        `<c r="${"ABCD"[column]}${number}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
      ).join("");
      return `<row r="${number}">${cells}</row>`;
    }).join("");
    zip.file("xl/worksheets/sheet1.xml", `<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="4" width="20" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:D${data.length}"/></worksheet>`);
    return zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: ct + ".sheet" });
  }

  root.PermitWorkbook = {
    read: async buffer => collect(await readSheets(buffer)),
    exportResults
  };
})(globalThis);
