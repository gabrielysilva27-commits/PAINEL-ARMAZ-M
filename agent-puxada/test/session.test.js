const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
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
  fs.writeFileSync(path.join(base, "data", "promax-native-session.json"), JSON.stringify({ enabled: true }));
  const original = process.env["ProgramFiles(x86)"];
  process.env["ProgramFiles(x86)"] = base;
  let page = "LogOff Atalho";
  let nestedFrame = false;
  let markerOnly = false;
  let activeWindow = "home";
  let sessionUrl = "https://imperio.promaxcloud.com.br";
  let onlyLoginWindow = false;
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/status") res.end(JSON.stringify({ value: { ready: true } }));
    else if (req.url === "/sessions") res.end(JSON.stringify({ value: [{ id: "test-session" }] }));
    else if (req.url === "/session/test-session/url") res.end(JSON.stringify({ value: sessionUrl }));
    else if (req.url === "/session/test-session/window/handles") res.end(JSON.stringify({ value: onlyLoginWindow ? ["home"] : ["report", "home"] }));
    else if (req.url === "/session/test-session/frame" && req.method === "POST") res.end(JSON.stringify({ value: null }));
    else if (req.url === "/session/test-session/frame/parent" && req.method === "POST") res.end(JSON.stringify({ value: null }));
    else if (req.url === "/session/test-session/elements" && req.method === "POST") res.end(JSON.stringify({ value: [] }));
    else if (req.url === "/session/test-session/window" && req.method === "POST") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => { activeWindow = JSON.parse(body).handle; res.end(JSON.stringify({ value: null })); });
    }
    else if (req.url === "/session/test-session/execute/sync") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        function doc(title, text, markers) {
          return {
            title,
            body: { innerText: text },
            querySelectorAll: function () {
              return markers ? [
                { value: "LogOff", innerText: "", textContent: "", title: "Sair", alt: "", name: "", id: "logoff" },
                { value: "", innerText: "", textContent: "", title: "Atalho", alt: "Atalho", name: "atalho", id: "" }
              ] : [];
            }
          };
        }
        const top = { document: doc("Promax", nestedFrame ? "" : page, false), frames: [] };
        if (nestedFrame) top.frames.push({ document: doc("Início", markerOnly ? "" : page, markerOnly), frames: [] });
        const text = vm.runInNewContext("(function(){" + JSON.parse(body).script + "})()", { window: top });
        res.end(JSON.stringify({ value: activeWindow === "report" ? "Relatório 02.05.01" : text }));
      });
    }
    else { res.statusCode = 404; res.end(JSON.stringify({ value: { error: "invalid session" } })); }
  });
  try {
    await new Promise(resolve => server.listen(5555, "127.0.0.1", resolve));
    assert.equal(await isConfigured({ promax: { url: "https://imperio.promaxcloud.com.br" } }, app), true, "a sessão viva não depende do PID antigo");
    activeWindow = "report";
    assert.equal(await isConfigured({ promax: { url: "https://imperio.promaxcloud.com.br" } }, app), true, "retoma a janela do Promax quando o relatório está em foco");
    nestedFrame = true;
    assert.equal(await isConfigured({ promax: { url: "https://imperio.promaxcloud.com.br" } }, app), true, "encontra LogOff e Atalho dentro do quadro do Promax");
    markerOnly = true;
    assert.equal(await isConfigured({ promax: { url: "https://imperio.promaxcloud.com.br" } }, app), true, "reconhece LogOff e Atalho quando aparecem como atributos de controles");
    markerOnly = false;
    page = "Login de Usuário Senha";
    onlyLoginWindow = true;
    assert.equal(await isConfigured({ promax: { url: "https://imperio.promaxcloud.com.br" } }, app), false, "somente login não é calibração pronta");
    onlyLoginWindow = false;
    fs.writeFileSync(path.join(base, "data", "promax-session.json"), JSON.stringify({ session_id: "expired" }));
    page = "LogOff Atalho";
    sessionUrl = "https://sso.promaxcloud.com.br/home";
    assert.equal(await isConfigured({ promax: { url: "https://imperio.promaxcloud.com.br" } }, app), true, "sessão única redirecionada é recuperada");
    assert.equal(JSON.parse(fs.readFileSync(path.join(base, "data", "promax-session.json"))).session_id, "test-session");
    console.log("Sessão ativa, login e sessão expirada: OK");
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (original === undefined) delete process.env["ProgramFiles(x86)"];
    else process.env["ProgramFiles(x86)"] = original;
    fs.rmSync(base, { recursive: true, force: true });
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
