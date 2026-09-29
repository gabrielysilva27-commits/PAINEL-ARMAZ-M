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
      cols = { date, vehicle, map };
      break;
    }
  }
  if (headerRow < 0 || !cols) throw new Error("031120_HEADER_NOT_FOUND: cabeçalho Data/Veículo/Mapa não encontrado.");

  // Regra operacional do Recebimento:
  // - somente linhas ENTRADA CDD;
  // - uma puxada = combinação única Data + Veículo + Mapa;
  // - a mesma carreta em outro mapa é uma nova puxada;
  // - cada puxada representa exatamente 28 paletes.
  const days = new Map();
  let rawRows = 0;
  let entranceRows = 0;

  for (let r = headerRow + 1; r < matrix.length; r++) {
    const row = matrix[r];
    const d = isoDate(row[cols.date]);
    const vehicle = String(row[cols.vehicle] || "").replace(/\D/g, "");
    const mapRaw = String(row[cols.map] || "").trim();
    if (!d || !vehicle || !mapRaw) continue;
    rawRows++;

    const rowText = norm(row.join(" | "));
    if (!rowText.includes("ENTRADA CDD")) continue;
    entranceRows++;

    // Normaliza "01", "1", "000001" para o mesmo mapa sem perder textos não numéricos.
    const mapDigits = mapRaw.replace(/\D/g, "");
    const map = mapDigits ? String(Number(mapDigits)) : norm(mapRaw);
    const tripKey = vehicle + "|" + map;

    if (!days.has(d)) days.set(d, { trips: new Set(), vehicle_maps: {} });
    const x = days.get(d);
    if (x.trips.has(tripKey)) continue;
    x.trips.add(tripKey);
    if (!x.vehicle_maps[vehicle]) x.vehicle_maps[vehicle] = new Set();
    x.vehicle_maps[vehicle].add(map);
  }

  if (!rawRows) throw new Error("031120_NO_DATA: nenhuma linha válida com Data/Veículo/Mapa foi reconhecida.");
  if (!entranceRows) throw new Error("031120_ENTRADA_CDD_NOT_FOUND: nenhuma linha ENTRADA CDD foi encontrada.");

  const rows = [...days.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([pull_date, x]) => {
    const vehicle_counts = {};
    for (const [vehicle, maps] of Object.entries(x.vehicle_maps)) vehicle_counts[vehicle] = maps.size;
    const pulls = x.trips.size;
    return {
      pull_date,
      truck_count: pulls,
      pallets_pulled: pulls * 28,
      vehicle_counts
    };
  });

  return {
    raw_rows: rawRows,
    entrada_cdd_rows: entranceRows,
    days: rows.length,
    rule: "ENTRADA_CDD_UNIQUE_VEHICLE_MAP_X28",
    rows
  };
}

module.exports = { parse031120 };
