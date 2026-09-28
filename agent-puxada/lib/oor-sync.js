const fs = require("fs");
const path = require("path");
const { parse020502, discover020502Files } = require("./csv020502");

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
  // Prefixo muda quando a interpretação do 02.05.02 muda, permitindo
  // reprocessar arquivos já vistos sem apagar o histórico local do agente.
  return "020502-oor-original-v3|" + file.path + "|" + String(file.size || 0) + "|" + String(Math.round(file.mtime_ms || 0));
}

async function sync(api, installRoot, log) {
  const statusResponse = await api.oorStatus();
  const status = statusResponse.oor || {};
  if (!status.enabled && !status.diagnostic_requested) return { enabled: false, imported: 0 };
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

  if (status.diagnostic_requested) {
    const latestFile = files.slice().sort(function (a, b) { return Number(b.mtime_ms || 0) - Number(a.mtime_ms || 0); })[0];
    if (!latestFile) {
      await api.oorScanState({ status: "waiting", error: "Nenhum arquivo LIBERAÇÃO CHEIO encontrado para diagnóstico." }).catch(function(){});
      return { enabled: !!status.enabled, diagnostic: true, imported: 0 };
    }
    try {
      const parsedDiag = parse020502(latestFile.path);
      await api.oorDiagnostic({
        source_file: latestFile.name,
        reference_date: parsedDiag.reference_date,
        diagnostic: Object.assign({
          source_file: latestFile.name,
          reference_date: parsedDiag.reference_date,
          file_size: latestFile.size,
          aggregated_rows: parsedDiag.aggregated_rows,
          parsed_rows_sample: parsedDiag.rows.slice(0, 12)
        }, parsedDiag.diagnostic || {})
      });
      if (log) log("OOR diagnóstico enviado: " + latestFile.name + " · coluna " + parsedDiag.quantity_column + ".");
      if (!status.enabled) return { enabled: false, diagnostic: true, imported: 0 };
    } catch (e) {
      const message = e && e.message ? e.message : String(e);
      await api.oorScanState({ status: "error", error: "Diagnóstico 02.05.02: " + message }).catch(function(){});
      return { enabled: !!status.enabled, diagnostic: true, imported: 0, error: message };
    }
  }

  const holder = loadState(installRoot);
  const latest = String(status.latest_date || "0000-00-00");
  const candidates = [], errors = [];

  for (const file of files) {
    const sig = signature(file);
    if (holder.data.imported && holder.data.imported[sig]) continue;
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
