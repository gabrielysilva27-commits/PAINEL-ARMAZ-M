const fs = require("fs");
const os = require("os");
const path = require("path");

const { AgentApi } = require("./lib/api");
const { loadAgentToken } = require("./lib/secrets");
const { parse020501 } = require("./lib/csv020501");
const promax = require("./lib/promax");

const ROOT = __dirname;
const VERSION = "1.0.0";
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

  if (process.argv.indexOf("--calibrate") >= 0) {
    await promax.openCalibrationBrowser(config, ROOT);
    return;
  }

  const token = loadAgentToken(ROOT);
  const api = new AgentApi(config.apiUrl, token);

  function info() {
    return {
      hostname: os.hostname(),
      agent_version: VERSION,
      calibration_ready: promax.isConfigured(config)
    };
  }

  if (process.argv.indexOf("--check") >= 0) {
    const response = await api.ping(info());
    log("Conexao com o Painel Armazem OK.");
    if (!promax.isConfigured(config)) {
      log("Promax aguardando calibracao: " + promax.missingSelectors(config.promax).join(", "));
    } else {
      log("Configuracao Promax pronta.");
    }
    return;
  }

  log("Agente Puxada iniciado em " + os.hostname() + ".");
  let stopping = false;
  process.on("SIGINT", function () { stopping = true; });
  process.on("SIGTERM", function () { stopping = true; });

  while (!stopping) {
    let job = null;
    try {
      const response = await api.poll(info());
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
        const csvPath = await promax.export020501(job, config, ROOT);
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
