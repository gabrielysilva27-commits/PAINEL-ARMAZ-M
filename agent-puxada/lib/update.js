const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const childProcess = require("child_process");

const UPDATER_VERSION = "2";

function safeTarget(value) {
  const v = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!v || v.split("/").some(p => !p || p === "." || p === "..") || !/^(app|driver)\/[A-Za-z0-9._/-]+$/.test(v)) {
    throw new Error("Destino de atualização inválido: " + value);
  }
  return v;
}

function allowedUrl(value) {
  const u = new URL(String(value || ""));
  if (u.protocol !== "https:") throw new Error("Atualização exige HTTPS.");
  const allowed = ["raw.githubusercontent.com", "github.com", "objects.githubusercontent.com"];
  if (!allowed.includes(u.hostname)) throw new Error("Origem de atualização não autorizada: " + u.hostname);
  return u.toString();
}

async function sha256File(filePath) {
  return new Promise(function(resolve, reject) {
    const h = crypto.createHash("sha256");
    const s = fs.createReadStream(filePath);
    s.on("data", d => h.update(d));
    s.on("error", reject);
    s.on("end", () => resolve(h.digest("hex")));
  });
}

async function download(file, target, api, version) {
  let buf;
  if (file.source === "api" || !file.url) {
    const response = await api.updateFile({ version: version, target: file.target });
    if (!response || !response.content_base64) throw new Error("Backend não retornou o arquivo " + file.target + ".");
    buf = Buffer.from(response.content_base64, "base64");
  } else {
    const response = await fetch(allowedUrl(file.url), { redirect: "follow" });
    if (!response.ok) throw new Error("Falha ao baixar atualização: HTTP " + response.status);
    buf = Buffer.from(await response.arrayBuffer());
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buf);
}

async function stageUpdate(manifest, baseDir, api, info, log) {
  if (!manifest || !manifest.update_available) return false;
  const release = manifest.release || {};
  const version = String(release.version || "");
  const files = Array.isArray(release.files) ? release.files : [];
  if (!version || !files.length) throw new Error("Manifesto de atualização inválido.");
  const seen = new Set();
  for (const file of files) {
    const target = safeTarget(file.target);
    if (seen.has(target) || !/^[a-f0-9]{64}$/i.test(String(file.sha256 || ""))) throw new Error("Manifesto duplicado ou sem SHA-256 válido.");
    seen.add(target);
  }

  const dataDir = path.join(baseDir, "data");
  const stageDir = path.join(dataDir, "update-staging", version);
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });

  await api.updateState({ ...info, updater_version: UPDATER_VERSION, update_status: "downloading", update_target_version: version }).catch(()=>{});
  log("Atualização " + version + " disponível. Baixando " + files.length + " arquivo(s)...");

  for (const file of files) {
    const target = safeTarget(file.target);
    const staged = path.join(stageDir, target);
    await download(file, staged, api, version);
    const hash = await sha256File(staged);
    if (hash.toLowerCase() !== String(file.sha256 || "").toLowerCase()) {
      throw new Error("Hash inválido na atualização de " + target + ".");
    }
  }

  fs.writeFileSync(path.join(stageDir, "manifest.json"), JSON.stringify(release, null, 2), "utf8");
  await api.updateState({ ...info, updater_version: UPDATER_VERSION, update_status: "staged", update_target_version: version }).catch(()=>{});

  const node = path.join(baseDir, "runtime", "node.exe");
  const runner = path.join(baseDir, "app", "update-runner.js");
  const launcher = path.join(baseDir, "AgentePuxada.exe");
  const p = childProcess.spawn(node, [
    runner,
    "--stage", stageDir,
    "--base", baseDir,
    "--parent", String(process.pid),
    "--launcher", launcher,
    "--version", version
  ], {
    cwd: baseDir,
    detached: true,
    windowsHide: true,
    stdio: "ignore"
  });
  p.unref();
  log("Atualização " + version + " preparada. O agente será reiniciado automaticamente.");
  return true;
}

async function checkForUpdate(api, info, baseDir, log) {
  if (process.env.AGENTE_PUXADA_SKIP_UPDATE === "1") return false;
  const response = await api.updateManifest({ ...info, updater_version: UPDATER_VERSION });
  if (!response || !response.update_available) return false;
  const record = path.join(baseDir, "data", "last-update.json");
  if (fs.existsSync(record)) {
    try {
      const prior = JSON.parse(fs.readFileSync(record, "utf8"));
      if (prior.status === "failed" && prior.version === response.release.version) {
        await api.updateState({ ...info, updater_version: UPDATER_VERSION, update_status: "failed", update_target_version: prior.version, update_error: prior.error }).catch(() => {});
        return false;
      }
    } catch (_) {}
  }
  return stageUpdate(response, baseDir, api, info, log);
}

module.exports = { checkForUpdate, UPDATER_VERSION };
