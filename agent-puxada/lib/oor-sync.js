const fs = require("fs");
const path = require("path");
const { parse020502, discover020502Files, pathReferenceDate } = require("./csv020502");

function loadState(installRoot) {
  const file = path.join(installRoot, "data", "oor-sync-state.json");
  try {
    if (fs.existsSync(file)) return { file, data: JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch (_e) {}
  return { file, data: { imported: {} } };
}

function saveState(holder) {
  fs.mkdirSync(path.dirname(holder.file), { recursive: true });
  const keys = Object.keys(holder.data.imported || {});
  if (keys.length > 600) {
    keys.sort(function (a, b) { return Number(holder.data.imported[b]?.at || 0) - Number(holder.data.imported[a]?.at || 0); });
    const keep = {};
    for (const k of keys.slice(0, 500)) keep[k] = holder.data.imported[k];
    holder.data.imported = keep;
  }
  fs.writeFileSync(holder.file, JSON.stringify(holder.data, null, 2));
}

function signature(file) {
  return file.path + "|" + String(file.size || 0) + "|" + String(Math.round(file.mtime_ms || 0));
}

async function sync(api, installRoot, log) {
  const statusResponse = await api.oorStatus();
  const status = statusResponse.oor || {};
  if (!status.enabled) return { enabled: false, imported: 0 };
  if (!status.root_path) {
    await api.oorScanState({ status: "waiting", error: "Caminho do 02.05.02 ainda não configurado." }).catch(function(){});
    return { enabled: true, imported: 0, waiting: true };
  }

  await api.oorScanState({ status: "scanning" }).catch(function(){});
  let files;
  try {
    files = discover020502Files(status.root_path);
  } catch (e) {
    const message = e && e.message ? e.message : String(e);
    await api.oorScanState({ status: "waiting", error: message }).catch(function(){});
    if (log) log("OOR automático aguardando pasta: " + message);
    return { enabled: true, imported: 0, waiting: true };
  }

  const holder = loadState(installRoot);
  const latest = String(status.latest_date || "0000-00-00");
  const candidates = [], errors = [];

  for (const file of files) {
    const sig = signature(file);
    if (holder.data.imported && holder.data.imported[sig]) continue;

    // Não reabra arquivos antigos só para descobrir que estão vazios ou têm outro layout.
    // A estrutura LIBERAÇÃO (ano/mês/CSV + data no nome) permite descartá-los antes do parse.
    const pathDate = pathReferenceDate(file.path);
    if (pathDate && pathDate <= latest) continue;
    if (!pathDate && file.mtime_ms) {
      const mtime = new Date(file.mtime_ms);
      const mtimeDate = String(mtime.getFullYear()).padStart(4, "0") + "-" +
        String(mtime.getMonth() + 1).padStart(2, "0") + "-" +
        String(mtime.getDate()).padStart(2, "0");
      if (mtimeDate <= latest) continue;
    }

    try {
      const parsed = parse020502(file.path);
      if (!parsed.reference_date) { errors.push(file.name + ": data de referência não identificada."); continue; }
      if (parsed.reference_date <= latest) continue;
      candidates.push({ file, sig, parsed });
    } catch (e) {
      errors.push(file.name + ": " + (e && e.message ? e.message : String(e)));
    }
  }

  const byDate = new Map();
  for (const item of candidates) {
    const old = byDate.get(item.parsed.reference_date);
    if (!old || item.file.mtime_ms > old.file.mtime_ms) byDate.set(item.parsed.reference_date, item);
  }
  const selected = Array.from(byDate.values()).sort(function (a, b) { return a.parsed.reference_date.localeCompare(b.parsed.reference_date); });

  let imported = 0;
  for (const item of selected) {
    const parsed = item.parsed;
    if (log) log("OOR automático: importando 02.05.02 de " + parsed.reference_date + " · " + item.file.name + " · coluna " + parsed.quantity_column + ".");
    const response = await api.oorImport({
      reference_date: parsed.reference_date,
      source_file: item.file.name,
      raw_rows: parsed.raw_rows,
      rows: parsed.rows
    });
    holder.data.imported[item.sig] = { at: Date.now(), reference_date: parsed.reference_date, source_file: item.file.name };
    saveState(holder);
    imported++;
    if (log) {
      const result = response.result || {};
      log("OOR automático concluído em " + parsed.reference_date + ": " + String(result.rows || parsed.aggregated_rows) + " SKU(s) processados.");
    }
  }

  if (imported === 0 && errors.length) {
    const message = errors.slice(0, 3).join(" | ");
    await api.oorScanState({ status: "error", error: message }).catch(function(){});
    if (log) log("OOR automático: " + message, true);
    return { enabled: true, imported: 0, error: message };
  }

  await api.oorScanState({ status: "idle" }).catch(function(){});
  return { enabled: true, imported, files: files.length, candidates: selected.length };
}

module.exports = { sync };
