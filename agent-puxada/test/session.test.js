const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { isConfigured } = require("../lib/promax");

async function run() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "puxada-session-"));
  const app = path.join(base, "app");
  const edge = path.join(base, "Microsoft", "Edge", "Application", "msedge.exe");
  fs.mkdirSync(app);
  fs.mkdirSync(path.join(base, "driver"));
  fs.mkdirSync(path.join(base, "data"));
  fs.mkdirSync(path.dirname(edge), { recursive: true });
  fs.writeFileSync(edge, "");
  fs.writeFileSync(path.join(base, "driver", "IEDriverServer.exe"), "");
  fs.writeFileSync(path.join(base, "data", "promax-session.json"), JSON.stringify({ session_id: "test-session", driver_pid: 999999999 }));
  const original = process.env["ProgramFiles(x86)"];
  process.env["ProgramFiles(x86)"] = base;
  let page = "LogOff Atalho";
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/status") res.end(JSON.stringify({ value: { ready: true } }));
    else if (req.url === "/session/test-session/execute/sync") res.end(JSON.stringify({ value: page }));
    else { res.statusCode = 404; res.end(JSON.stringify({ value: { error: "invalid session" } })); }
  });
  try {
    await new Promise(resolve => server.listen(5555, "127.0.0.1", resolve));
    assert.equal(await isConfigured({ promax: { url: "https://imperio.promaxcloud.com.br" } }, app), true, "a sessão viva não depende do PID antigo");
    page = "Login de Usuário Senha";
    assert.equal(await isConfigured({ promax: { url: "https://imperio.promaxcloud.com.br" } }, app), false, "login não é calibração pronta");
    fs.writeFileSync(path.join(base, "data", "promax-session.json"), JSON.stringify({ session_id: "expired" }));
    assert.equal(await isConfigured({ promax: { url: "https://imperio.promaxcloud.com.br" } }, app), false, "sessão expirada não é aceita");
    console.log("Sessão ativa, login e sessão expirada: OK");
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (original === undefined) delete process.env["ProgramFiles(x86)"];
    else process.env["ProgramFiles(x86)"] = original;
    fs.rmSync(base, { recursive: true, force: true });
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
