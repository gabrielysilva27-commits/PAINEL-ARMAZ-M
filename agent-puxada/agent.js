const fs = require("fs");
const os = require("os");
const path = require("path");

const { AgentApi } = require("./lib/api");
const { loadAgentToken } = require("./lib/secrets");
const { parse020501 } = require("./lib/csv020501");
const promax = require("./lib/promax");
const existingEdge = require("./lib/existing-edge");
const updater = require("./lib/update");

const ROOT = __dirname;
const VERSION = "3.2.55";
const CONFIG_PATH = path.join(ROOT, "config.json");
const EXAMPLE_PATH = path.join(ROOT, "config.example.json");
const LOG_DIR = path.join(ROOT, "logs");

fs.mkdirSync(LOG_DIR, { recursive: true });

function log(message, isError) {
  const line = "[" + new Date().toISOString() + "] " + message;
  if (isError) console.error(line);
  else console.log(line);
  fs.appendFileSync(path.join(LOG_DIR, "agent.log"), line + "\n");
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.copyFileSync(EXAMPLE_PATH, CONFIG_PATH);
    log("config.json criado. Promax aguardando calibracao no computador da empresa.");
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

async function main() {
  const config = loadConfig();
  let lastReadinessError = null;
  let lastEdgeProbe = "";

  if (process.argv.indexOf("--calibrate") >= 0) {
    const token = loadAgentToken(ROOT);
    const api = new AgentApi(config.apiUrl, token);
    try {
      log("Abrir Promax: iniciando recuperação da sessão controlada.");
      await promax.openCalibrationBrowser(config, ROOT);
      log("Abrir Promax: nova sessão criada e URL do Promax aberta.");
      await api.updateState({
        agent_version: VERSION,
        updater_version: updater.UPDATER_VERSION,
        capabilities: ["020501_SYNC","PROMAX_IE_MODE","PROMAX_DIRECT_CONTROL_PROBE","PROMAX_CALIBRATION_LOCK","PROMAX_DYNAMIC_DRIVER_PORT","PROMAX_DRIVER_BOOT_DIAGNOSTICS","PROMAX_CLASSIFICATION_DEPOT","PROMAX_SESSION_REUSE","PROMAX_CSV_HEADER_DETECT","PROMAX_CSV_LEGACY_DOM","PROMAX_CSV_NATIVE_CLICK","PROMAX_CSV_CONFIGURED_DOWNLOAD_DIRS","PROMAX_CSV_TRUSTED_KEY","PROMAX_CSV_AUTHENTICATED_CAPTURE","PROMAX_EXCEL_COM_CAPTURE","AUTO_UPDATE_V2","RELEASE_SHA256","UPDATE_ROLLBACK","FUTURE_JOBS_V1"],
        update_status: "current",
        update_target_version: VERSION
      }).catch(function(){});
    } catch (e) {
      const message = e && e.message ? e.message : String(e);
      log("Abrir Promax falhou: " + message, true);
      await api.updateState({
        agent_version: VERSION,
        updater_version: updater.UPDATER_VERSION,
        capabilities: ["020501_SYNC","PROMAX_IE_MODE","PROMAX_DIRECT_CONTROL_PROBE","PROMAX_CALIBRATION_LOCK","PROMAX_DYNAMIC_DRIVER_PORT","PROMAX_DRIVER_BOOT_DIAGNOSTICS","PROMAX_CLASSIFICATION_DEPOT","PROMAX_SESSION_REUSE","PROMAX_CSV_HEADER_DETECT","PROMAX_CSV_LEGACY_DOM","PROMAX_CSV_NATIVE_CLICK","PROMAX_CSV_CONFIGURED_DOWNLOAD_DIRS","PROMAX_CSV_TRUSTED_KEY","PROMAX_CSV_AUTHENTICATED_CAPTURE","PROMAX_EXCEL_COM_CAPTURE","AUTO_UPDATE_V2","RELEASE_SHA256","UPDATE_ROLLBACK","FUTURE_JOBS_V1"],
        update_status: "failed",
        update_target_version: VERSION,
        update_error: "Abrir Promax: " + message
      }).catch(function(){});
      process.exitCode = 2;
    }
    return;
  }

  const token = loadAgentToken(ROOT);
  const api = new AgentApi(config.apiUrl, token);

  async function info() {
    const calibrationReady = await promax.isConfigured(config, ROOT);
    const edgeProbe = existingEdge.probe();
    const edgeProbeStatus = edgeProbe.available
      ? "Modo IE: " + edgeProbe.ieModeSurfaces + "; DOM legível: " + edgeProbe.accessibleSurfaces + "; janela relatório: " + edgeProbe.reportWindows + "; controles: " + edgeProbe.uiaElements + "; CSV: " + edgeProbe.csvControls + "; Visualizar: " + edgeProbe.visualizeControls + "."
      : "Leitura da janela existente indisponível neste computador.";
    if (edgeProbeStatus !== lastEdgeProbe) {
      log("Verificação Edge: " + edgeProbeStatus);
      lastEdgeProbe = edgeProbeStatus;
    }
    const readinessError = calibrationReady ? "" : promax.readinessError();
    if (readinessError !== lastReadinessError) {
      if (readinessError) log("Promax aguardando: " + readinessError);
      else log("Sessão do Promax reconhecida e pronta.");
      lastReadinessError = readinessError;
    }
    return {
      hostname: os.hostname(),
      agent_version: VERSION,
      updater_version: updater.UPDATER_VERSION,
      capabilities: ["020501_SYNC","PROMAX_IE_MODE","PROMAX_DIRECT_CONTROL_PROBE","PROMAX_CALIBRATION_LOCK","PROMAX_DYNAMIC_DRIVER_PORT","PROMAX_DRIVER_BOOT_DIAGNOSTICS","PROMAX_CLASSIFICATION_DEPOT","PROMAX_SESSION_REUSE","PROMAX_CSV_HEADER_DETECT","PROMAX_CSV_LEGACY_DOM","PROMAX_CSV_NATIVE_CLICK","PROMAX_CSV_CONFIGURED_DOWNLOAD_DIRS","PROMAX_CSV_TRUSTED_KEY","PROMAX_CSV_AUTHENTICATED_CAPTURE","PROMAX_EXCEL_COM_CAPTURE","AUTO_UPDATE_V2","RELEASE_SHA256","UPDATE_ROLLBACK","FUTURE_JOBS_V1", edgeProbe.available ? "EDGE_IE_SURFACES_" + Math.min(edgeProbe.ieModeSurfaces, 99) : "EDGE_PROBE_UNAVAILABLE", edgeProbe.available ? "EDGE_ACCESSIBLE_SURFACES_" + Math.min(edgeProbe.accessibleSurfaces, 99) : "EDGE_PROBE_UNAVAILABLE", edgeProbe.available ? "EDGE_REPORT_WINDOWS_" + Math.min(edgeProbe.reportWindows, 99) : "EDGE_PROBE_UNAVAILABLE", edgeProbe.available ? "EDGE_UIA_CONTROLS_" + Math.min(edgeProbe.uiaElements, 9999) : "EDGE_PROBE_UNAVAILABLE", edgeProbe.available ? "EDGE_CSV_CONTROLS_" + Math.min(edgeProbe.csvControls, 99) : "EDGE_PROBE_UNAVAILABLE", edgeProbe.available ? "EDGE_VISUALIZAR_CONTROLS_" + Math.min(edgeProbe.visualizeControls, 99) : "EDGE_PROBE_UNAVAILABLE"],
      calibration_ready: calibrationReady,
      readiness_error: readinessError
    };
  }

  let lastUpdateCheck = 0;
  const updateRecord = path.resolve(ROOT, "..", "data", "last-update.json");
  if (fs.existsSync(updateRecord)) {
    try {
      const result = JSON.parse(fs.readFileSync(updateRecord, "utf8"));
      if (result.status === "failed") {
        await api.updateState({ ...await info(), update_status: "failed", update_target_version: result.version, update_error: result.error }).catch(function(){});
      } else if (result.version === VERSION && !result.reported) {
        await api.updateState({ ...await info(), update_status: "updated", update_target_version: VERSION });
        fs.writeFileSync(updateRecord, JSON.stringify({ ...result, reported: true }, null, 2));
      }
    } catch (e) { log("Estado da atualização: " + e.message, true); }
  }
  async function maybeUpdate(force) {
    if (!force && Date.now() - lastUpdateCheck < 2 * 60 * 1000) return false;
    lastUpdateCheck = Date.now();
    try {
      return await updater.checkForUpdate(api, await info(), path.resolve(ROOT, ".."), log);
    } catch (e) {
      const message = e && e.message ? e.message : String(e);
      log("Falha ao verificar atualização: " + message, true);
      await api.updateState({ ...await info(), update_status: "failed", update_error: message }).catch(function(){});
      return false;
    }
  }

  if (process.argv.indexOf("--check") >= 0) {
    // Update health checks validate the agent and API. Browser readiness is
    // evaluated by the normal polling loop and must not block installation.
    await api.updateState({hostname:os.hostname(),agent_version:VERSION,
      updater_version:updater.UPDATER_VERSION,update_status:"current",update_target_version:VERSION});
    log("Conexao com o Painel Armazem OK.");
    return;
  }

  if (await maybeUpdate(true)) return;

  log("Agente Puxada iniciado em " + os.hostname() + ".");
  let stopping = false;
  process.on("SIGINT", function () { stopping = true; });
  process.on("SIGTERM", function () { stopping = true; });

  while (!stopping) {
    let job = null;
    try {
      if (await maybeUpdate(false)) return;
      const response = await api.poll(await info());
      job = response.job;

      if (!job) {
        await sleep(Math.max(15, Number(config.pollIntervalSeconds || 30)) * 1000);
        continue;
      }

      log("Sincronizacao " + job.request_id + ": 020501 de " + job.date_from + " a " + job.date_to +
        (job.worker ? " · executando por " + job.worker.display_name + "." : "."));

      let heartbeatTimer = null;
      const heartbeatPayload = { request_id: job.request_id, run_id: job.run_id };
      heartbeatTimer = setInterval(function () {
        api.heartbeat(heartbeatPayload).catch(function (hbErr) {
          log("Heartbeat da sincronizacao falhou: " + (hbErr && hbErr.message ? hbErr.message : String(hbErr)), true);
        });
      }, 60000);

      try {
        const csvPath = await promax.export020501(job, config, ROOT, parse020501);
        log("CSV exportado: " + csvPath);

        const parsed = parse020501(csvPath);
        log("CSV processado: " + parsed.raw_rows + " linhas, " + parsed.aggregated_rows + " combinacoes NF/produto.");

        const done = await api.complete({
          request_id: job.request_id,
          run_id: job.run_id,
          date_from: job.date_from,
          date_to: job.date_to,
          source_file: path.basename(csvPath),
          raw_rows: parsed.raw_rows,
          rows: parsed.rows
        });

        log("Sincronizacao concluida. " +
          done.result.documents + " NF(s), " +
          done.result.aggregated_rows + " combinacoes NF/produto e " +
          done.result.compared_receipts + " recebimento(s) cruzado(s).");
      } finally {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      }
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      log(message, true);

      if (job) {
        try {
          await api.fail({ request_id: job.request_id, run_id: job.run_id, error: message });
        } catch (apiErr) {
          log("Falha ao registrar erro no Painel: " + (apiErr && apiErr.message ? apiErr.message : String(apiErr)), true);
        }
      }

      await sleep(30000);
    }
  }

  log("Agente Puxada encerrado.");
}

main().catch(function (err) {
  log(err && err.stack ? err.stack : String(err), true);
  process.exitCode = 1;
});
