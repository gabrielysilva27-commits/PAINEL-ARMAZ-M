const fs = require("fs");
const path = require("path");

function decodeBuffer(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(buffer.subarray(3));
  }
  const utf = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const bad = (utf.match(/\uFFFD/g) || []).length;
  if (bad <= 2) return utf;
  return new TextDecoder("windows-1252").decode(buffer);
}

function normalizeHeader(value) {
  return String(value == null ? "" : value)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().replace(/\s+/g, " ").toUpperCase()
    .replace(/[.:]+$/g, "");
}

function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter(function (x) { return x.trim(); }).slice(0, 30);
  const options = [";", "\t", ","];
  let best = ";", bestScore = -1;
  for (const delimiter of options) {
    const score = lines.reduce(function (sum, line) { return sum + (line.split(delimiter).length - 1); }, 0);
    if (score > bestScore) { bestScore = score; best = delimiter; }
  }
  return best;
}

function parseCsv(text, delimiter) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ""; }
    else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some(function (v) { return String(v).trim() !== ""; })) rows.push(row);
      row = []; field = "";
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    if (row.some(function (v) { return String(v).trim() !== ""; })) rows.push(row);
  }
  return rows;
}

function parseNumber(value) {
  let s = String(value == null ? "" : value).trim().replace(/\s/g, "");
  if (!s) return null;
  if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  s = s.replace(/[^\d+\-.]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeSku(value) {
  const raw = String(value == null ? "" : value).trim().replace(/^'+/, "").replace(/\.0+$/, "");
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  return digits || "";
}

function validDate(year, month, day) {
  const y = Number(year), m = Number(month), d = Number(day);
  if (!Number.isInteger(y) || y < 2020 || y > 2100 || !Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(d) || d < 1 || d > 31) return null;
  const x = new Date(Date.UTC(y, m - 1, d));
  if (x.getUTCFullYear() !== y || x.getUTCMonth() + 1 !== m || x.getUTCDate() !== d) return null;
  return String(y).padStart(4, "0") + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

function parseDate(value, allowCompact) {
  const s = String(value == null ? "" : value).trim();
  let m = s.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\b/);
  if (m) return validDate(m[3], m[2], m[1]);
  m = s.match(/\b(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})\b/);
  if (m) return validDate(m[1], m[2], m[3]);
  if (allowCompact) {
    m = s.match(/\b(\d{2})(\d{2})(\d{4})\b/);
    if (m) return validDate(m[3], m[2], m[1]);
    m = s.match(/\b(\d{4})(\d{2})(\d{2})\b/);
    if (m) return validDate(m[1], m[2], m[3]);
  }
  return null;
}

function pathReferenceDate(filePath) {
  const full = String(filePath || "");
  const parts = full.split(/[\\/]+/);
  const base = path.basename(full, path.extname(full));

  // Full dates in the file or folder name are the strongest signal.
  for (let i = parts.length - 1; i >= 0; i--) {
    const d = parseDate(parts[i], true);
    if (d) return d;
  }

  // Support the common LIBERAÇÃO structure: year / month folder / CSV / day-named file.
  let year = null, month = null;
  const monthNames = {
    JANEIRO:1, FEVEREIRO:2, MARCO:3, ABRIL:4, MAIO:5, JUNHO:6,
    JULHO:7, AGOSTO:8, SETEMBRO:9, OUTUBRO:10, NOVEMBRO:11, DEZEMBRO:12
  };
  for (const part of parts) {
    const normalized = normalizeHeader(part);
    const ym = normalized.match(/\b(20\d{2})\b/);
    if (ym) year = Number(ym[1]);
    for (const key of Object.keys(monthNames)) if (normalized.includes(key)) month = monthNames[key];
    const mm = normalized.match(/^(0?[1-9]|1[0-2])\s*[-_. ]/);
    if (mm && /20\d{2}/.test(normalized)) month = Number(mm[1]);
  }
  const dayMatch = base.match(/^(?:DIA\s*)?(0?[1-9]|[12]\d|3[01])(?:\b|\s*[-_.])/i);
  if (year && month && dayMatch) return validDate(year, month, Number(dayMatch[1]));
  return null;
}

const SKU_ALIASES = ["ITEM","COD ITEM","CODIGO ITEM","CODIGO DO ITEM","MATERIAL","COD MATERIAL","CODIGO MATERIAL","COD PRODUTO","CODIGO PRODUTO","COD PROD","CODIGO"];
const QTY_ALIASES = ["QTDE DISPONIVEL","QTD DISPONIVEL","QUANTIDADE DISPONIVEL","DISPONIVEL","ESTOQUE DISPONIVEL","SALDO DISPONIVEL","QTDE ESTOQUE","QTD ESTOQUE","QUANTIDADE ESTOQUE","SALDO ESTOQUE","SALDO","ESTOQUE","QTDE","QTD","QUANTIDADE"];
const NAME_ALIASES = ["DESCRICAO","DESC ITEM","DESCRICAO ITEM","PRODUTO","NOME PRODUTO"];
const UNIT_ALIASES = ["UNIDADE","UNID","UND","UN","UM"];
const DATE_ALIASES = ["DATA","DATA REFERENCIA","DATA DE REFERENCIA","DT REFERENCIA","DATA RELATORIO","DT RELATORIO"];

function exactColumn(headers, aliases) {
  for (const alias of aliases) {
    const i = headers.indexOf(alias);
    if (i >= 0) return i;
  }
  return -1;
}

function numericRatio(data, startRow, index) {
  let total = 0, numeric = 0;
  for (let r = startRow; r < Math.min(data.length, startRow + 80); r++) {
    const v = String(data[r][index] == null ? "" : data[r][index]).trim();
    if (!v) continue;
    total++;
    if (parseNumber(v) != null) numeric++;
  }
  return total ? numeric / total : 0;
}

function skuRatio(data, startRow, index) {
  let total = 0, numeric = 0;
  for (let r = startRow; r < Math.min(data.length, startRow + 80); r++) {
    const v = String(data[r][index] == null ? "" : data[r][index]).trim();
    if (!v) continue;
    total++;
    if (/^'?\d+(?:\.0+)?$/.test(v)) numeric++;
  }
  return total ? numeric / total : 0;
}

function findSkuColumn(headers, data, startRow) {
  const exact = exactColumn(headers, SKU_ALIASES);
  if (exact >= 0) return exact;
  let best = -1, bestScore = 0;
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    let score = skuRatio(data, startRow, i) * 100;
    if (/ITEM|MATERIAL|PROD/.test(h)) score += 35;
    if (/COD/.test(h)) score += 25;
    if (/DESCR|NOME|UNID|QT|SALDO|ESTOQUE/.test(h)) score -= 80;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return bestScore >= 70 ? best : -1;
}

function findQtyColumn(headers, data, startRow) {
  const exact = exactColumn(headers, QTY_ALIASES);
  if (exact >= 0) return exact;
  let best = -1, bestScore = -999;
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    let score = numericRatio(data, startRow, i) * 50;
    if (/DISPON|LIVRE/.test(h)) score += 120;
    if (/SALDO/.test(h)) score += 90;
    if (/ESTOQUE/.test(h)) score += 70;
    if (/QTDE|QTD|QUANT/.test(h)) score += 45;
    if (/BLOQ|RESERV|TRANSIT|AVARIA|QUALID|VENC|PRECO|VALOR|COD|ITEM/.test(h)) score -= 120;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return bestScore >= 55 ? best : -1;
}

function findHeaderRow(data) {
  let best = -1, bestScore = -1;
  for (let r = 0; r < Math.min(data.length, 40); r++) {
    const headers = data[r].map(normalizeHeader);
    let score = (exactColumn(headers, SKU_ALIASES) >= 0 ? 10 : 0) + (exactColumn(headers, QTY_ALIASES) >= 0 ? 10 : 0);
    if (headers.some(function (h) { return /ITEM|MATERIAL|COD PROD/.test(h); })) score += 3;
    if (headers.some(function (h) { return /DISPON|SALDO|ESTOQUE|QTDE|QTD|QUANT/.test(h); })) score += 3;
    if (headers.some(function (h) { return /DESCR|PRODUTO/.test(h); })) score += 1;
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return bestScore >= 6 ? best : 0;
}

function inferReferenceDate(filePath, data, headerRow, dateColumn) {
  if (dateColumn >= 0) {
    for (let r = headerRow + 1; r < Math.min(data.length, headerRow + 100); r++) {
      const d = parseDate(data[r][dateColumn], true);
      if (d) return d;
    }
  }

  // Prefer a date encoded in the LIBERAÇÃO file/folder name over free-form report cells.
  const fromPath = pathReferenceDate(filePath);
  if (fromPath) return fromPath;

  // In free-form report headings accept only separated dates; compact 8-digit values
  // may be product/material codes and caused false dates such as 2067-03-00.
  for (let r = 0; r < Math.min(data.length, headerRow + 8); r++) {
    for (const cell of data[r]) {
      const d = parseDate(cell, false);
      if (d) return d;
    }
  }

  // Last resort: file modification date. This keeps the automation usable when the
  // report itself omits a date, but only after every explicit source above failed.
  try {
    const stat = fs.statSync(filePath), d = stat.mtime;
    if (Number.isFinite(d.getTime())) return validDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  } catch (_e) {}
  return null;
}

function parse020502(filePath) {
  const buffer = fs.readFileSync(filePath);
  const text = decodeBuffer(buffer);
  const delimiter = detectDelimiter(text);
  const data = parseCsv(text, delimiter);
  if (data.length < 2) throw new Error("CSV do 02.05.02 vazio.");

  const headerRow = findHeaderRow(data);
  const headers = data[headerRow].map(normalizeHeader);
  const startRow = headerRow + 1;
  const skuIndex = findSkuColumn(headers, data, startRow);
  const qtyIndex = findQtyColumn(headers, data, startRow);
  if (skuIndex < 0) throw new Error('Coluna de item/SKU não encontrada no 02.05.02. Cabeçalhos: ' + headers.join(" | "));
  if (qtyIndex < 0) throw new Error('Coluna de saldo disponível não encontrada no 02.05.02. Cabeçalhos: ' + headers.join(" | "));

  const nameIndex = exactColumn(headers, NAME_ALIASES);
  const unitIndex = exactColumn(headers, UNIT_ALIASES);
  const dateIndex = exactColumn(headers, DATE_ALIASES);
  const aggregate = new Map();
  let validRows = 0;

  for (let r = startRow; r < data.length; r++) {
    const row = data[r], sku = normalizeSku(row[skuIndex]), qty = parseNumber(row[qtyIndex]);
    if (!sku || qty == null) continue;
    validRows++;
    const old = aggregate.get(sku) || {
      sku_code: sku,
      sku_name: nameIndex >= 0 ? String(row[nameIndex] == null ? "" : row[nameIndex]).trim() : "",
      unit_code: unitIndex >= 0 ? String(row[unitIndex] == null ? "" : row[unitIndex]).trim() || null : null,
      available_qty: 0
    };
    old.available_qty += qty;
    aggregate.set(sku, old);
  }

  const rows = Array.from(aggregate.values()).map(function (x) {
    return { sku_code: x.sku_code, sku_name: x.sku_name, unit_code: x.unit_code, available_qty: Math.round(x.available_qty * 1000) / 1000 };
  });
  if (!rows.length) throw new Error("Nenhum SKU válido encontrado no CSV 02.05.02.");

  return {
    reference_date: inferReferenceDate(filePath, data, headerRow, dateIndex),
    raw_rows: Math.max(0, data.length - startRow),
    valid_rows: validRows,
    aggregated_rows: rows.length,
    rows: rows,
    delimiter: delimiter,
    header_row: headerRow + 1,
    sku_column: headers[skuIndex],
    quantity_column: headers[qtyIndex]
  };
}

function discover020502Files(rootPath) {
  const out = [], stack = [rootPath];
  let visited = 0;
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (e) {
      if (dir === rootPath) throw new Error("OOR_ROOT_UNAVAILABLE: " + rootPath + " · " + e.message);
      continue;
    }
    for (const entry of entries) {
      if (++visited > 25000) throw new Error("OOR_SCAN_LIMIT: a pasta possui itens demais para a varredura automática.");
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { stack.push(full); continue; }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (ext !== ".csv" && ext !== ".inf") continue;
      if (!full.split(/[\\/]+/).some(function (part) { return part.trim().toUpperCase() === "CSV"; })) continue;
      let stat = null; try { stat = fs.statSync(full); } catch (_e) {}
      out.push({ path: full, name: entry.name, mtime_ms: stat ? stat.mtimeMs : 0, size: stat ? stat.size : 0 });
    }
  }
  return out;
}

module.exports = { parse020502, discover020502Files, normalizeHeader };
