const fs = require("fs");

function decodeBuffer(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(buffer.subarray(3));
  }
  const utf = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const bad = (utf.match(/\uFFFD/g) || []).length;
  if (bad <= 2) return utf;
  return new TextDecoder("windows-1252").decode(buffer);
}

function detectDelimiter(text) {
  const first = (text.split(/\r?\n/, 1)[0] || "");
  const choices = [
    [";", (first.match(/;/g) || []).length],
    [",", (first.match(/,/g) || []).length],
    ["\t", (first.match(/\t/g) || []).length]
  ];
  choices.sort(function (a, b) { return b[1] - a[1]; });
  return choices[0][1] ? choices[0][0] : ";";
}

function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some(function (v) { return String(v).trim() !== ""; })) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    if (row.some(function (v) { return String(v).trim() !== ""; })) rows.push(row);
  }

  return rows;
}

function normalizeHeader(value) {
  return String(value == null ? "" : value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizeDigits(value) {
  const s = String(value == null ? "" : value).replace(/\D/g, "").replace(/^0+/, "");
  return s || "0";
}

function parseQuantity(value) {
  if (typeof value === "number") return value;
  let s = String(value == null ? "" : value).trim().replace(/\s/g, "");
  if (!s) return 0;

  if (s.indexOf("/") >= 0) {
    const parts = s.split("/");
    const left = Number(String(parts[0]).replace(/\./g, "").replace(",", ".")) || 0;
    const digits = String(parts[1] || "").replace(/\D/g, "");
    return left + (digits ? Number(digits) / Math.pow(10, digits.length) : 0);
  }

  if (s.indexOf(",") >= 0) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value) {
  const s = String(value == null ? "" : value).trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return m[3] + "-" + m[2] + "-" + m[1];
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  return null;
}

function findColumn(headers, aliases, required) {
  for (let i = 0; i < aliases.length; i++) {
    const idx = headers.indexOf(aliases[i]);
    if (idx >= 0) return idx;
  }
  if (required !== false) {
    throw new Error('Coluna "' + aliases[0] + '" nao encontrada no CSV do 02.05.01.');
  }
  return -1;
}

function parse020501(filePath) {
  const buffer = fs.readFileSync(filePath);
  const text = decodeBuffer(buffer);
  const delimiter = detectDelimiter(text);
  const data = parseCsv(text, delimiter);

  if (data.length < 2) throw new Error("CSV do 02.05.01 vazio.");

  const headers = data[0].map(normalizeHeader);
  const ix = {
    supplier: findColumn(headers, ["FORNEC", "FORNECEDOR"]),
    invoice: findColumn(headers, ["DOCUM", "DOCUMENTO", "NF"]),
    sku: findColumn(headers, ["ITEM", "COD ITEM", "CODIGO ITEM"]),
    name: findColumn(headers, ["DESCRICAO"]),
    unit: findColumn(headers, ["UNIDADE", "UND"]),
    op: findColumn(headers, ["CODIGO OPERACAO", "OPERACAO"]),
    qty: findColumn(headers, ["QTDE ENTRADA", "QTD ENTRADA", "QUANTIDADE ENTRADA"]),
    date: findColumn(headers, ["DATA", "DT ENTRADA"], false)
  };

  const aggregate = new Map();
  let validRows = 0;

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const supplier = normalizeDigits(row[ix.supplier]);
    const invoice = normalizeDigits(row[ix.invoice]);
    const sku = normalizeDigits(row[ix.sku]);

    if (supplier === "0" || invoice === "0" || sku === "0") continue;

    validRows++;
    const key = supplier + "|" + invoice + "|" + sku;
    const old = aggregate.get(key) || {
      supplier_code: supplier,
      invoice_number: invoice,
      sku_code: sku,
      sku_name: String(row[ix.name] == null ? "" : row[ix.name]).trim(),
      report_unit: String(row[ix.unit] == null ? "" : row[ix.unit]).trim(),
      system_qty: 0,
      operations: new Set(),
      report_date: ix.date >= 0 ? parseDate(row[ix.date]) : null
    };

    old.system_qty += parseQuantity(row[ix.qty]);

    const op = String(row[ix.op] == null ? "" : row[ix.op]).trim();
    if (op) old.operations.add(op);
    if (!old.report_date && ix.date >= 0) old.report_date = parseDate(row[ix.date]);

    aggregate.set(key, old);
  }

  const rows = Array.from(aggregate.values()).map(function (x) {
    return {
      supplier_code: x.supplier_code,
      invoice_number: x.invoice_number,
      sku_code: x.sku_code,
      sku_name: x.sku_name,
      report_unit: x.report_unit,
      system_qty: Math.round(x.system_qty * 1000) / 1000,
      operation_codes: Array.from(x.operations).sort().join("+"),
      report_date: x.report_date
    };
  });

  if (!rows.length) throw new Error("Nenhuma linha valida encontrada no CSV 02.05.01.");

  return {
    raw_rows: data.length - 1,
    valid_rows: validRows,
    aggregated_rows: rows.length,
    rows: rows,
    delimiter: delimiter
  };
}

module.exports = { parse020501: parse020501 };
