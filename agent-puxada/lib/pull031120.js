const fs = require("fs");

function norm(v) {
  return String(v == null ? "" : v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}
function isoDate(v) {
  const s = String(v || "").trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return m[3] + "-" + m[2] + "-" + m[1];
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? s : "";
}
function num(v) {
  const s = String(v == null ? "" : v).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function parseLine(line, sep) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; }
      else q = !q;
    } else if (ch === sep && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur); return out;
}
function chooseSep(lines) {
  const seps = [";", "\t", ","];
  let best = ";", score = -1;
  for (const sep of seps) {
    const s = lines.slice(0, 30).reduce((n, l) => n + (l.split(sep).length - 1), 0);
    if (s > score) { score = s; best = sep; }
  }
  return best;
}
function findCol(headers, tests) {
  for (let i = 0; i < headers.length; i++) {
    const h = norm(headers[i]);
    if (tests.some(t => typeof t === "string" ? h === t || h.includes(t) : t.test(h))) return i;
  }
  return -1;
}

function parse031120(file) {
  const raw = fs.readFileSync(file);
  let text = raw.toString("utf8");
  if ((text.match(/�/g) || []).length > 3) text = raw.toString("latin1");
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(x => x.trim());
  if (!lines.length) throw new Error("031120_EMPTY: arquivo sem linhas.");
  const sep = chooseSep(lines);
  const matrix = lines.map(l => parseLine(l, sep));
  let headerRow = -1, cols = null;
  for (let r = 0; r < Math.min(matrix.length, 60); r++) {
    const h = matrix[r].map(norm);
    const date = findCol(h, ["DATA", "DT"]);
    const vehicle = findCol(h, ["VEICULO", "VEÍCULO"]);
    const map = findCol(h, ["MAPA"]);
    if (date >= 0 && vehicle >= 0 && map >= 0) {
      headerRow = r;
      cols = {
        date, vehicle, map,
        pallets: findCol(h, [/PALLET/, /PALETE/, /PALLETES/, /PALETES/, /QTD.*PAL/, /QTDE.*PAL/])
      };
      break;
    }
  }
  if (headerRow < 0 || !cols) throw new Error("031120_HEADER_NOT_FOUND: cabeçalho Data/Veículo/Mapa não encontrado.");
  if (cols.pallets < 0) throw new Error("031120_PALLET_COLUMN_NOT_FOUND: coluna de paletes não encontrada.");

  const days = new Map();
  let rawRows = 0;
  for (let r = headerRow + 1; r < matrix.length; r++) {
    const row = matrix[r];
    const d = isoDate(row[cols.date]);
    const vehicle = String(row[cols.vehicle] || "").replace(/\D/g, "");
    const map = String(row[cols.map] || "").trim();
    if (!d || !vehicle || !map) continue;
    const pallets = Math.max(0, num(row[cols.pallets]));
    rawRows++;
    if (!days.has(d)) days.set(d, { vehicles: new Set(), vehicle_counts: {}, pallets: 0 });
    const x = days.get(d);
    x.vehicles.add(vehicle);
    x.vehicle_counts[vehicle] = (x.vehicle_counts[vehicle] || 0) + 1;
    x.pallets += pallets;
  }
  if (!rawRows) throw new Error("031120_NO_DATA: nenhuma linha válida foi reconhecida.");

  const rows = [...days.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([pull_date, x]) => ({
    pull_date,
    truck_count: x.vehicles.size,
    pallets_pulled: Math.round(x.pallets),
    vehicle_counts: x.vehicle_counts
  }));
  return { raw_rows: rawRows, days: rows.length, rows };
}

module.exports = { parse031120 };
