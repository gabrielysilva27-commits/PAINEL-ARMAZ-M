const fs = require("fs");
const os = require("os");
const path = require("path");
const childProcess = require("child_process");

let DRIVER = null;
let SESSION_ID = null;
let DRIVER_PORT = 5555;
let LAST_READINESS_ERROR = "";
// Promax renders its home and reports in nested frames; document.body on the
// outer frameset does not contain the visible LogOff/Atalho controls.
const PAGE_TEXT_SCRIPT = [
  "function s(v){return String(v||'');}",
  "function collect(w,depth){",
  "if(depth>8)return '';var result='';",
  "try{var d=w.document;result+=' '+s(d.title)+' '+(d.body?s(d.body.innerText||d.body.textContent):'');",
  "var nodes=d.querySelectorAll('input,button,a,img,label,span,td,th');",
  "for(var j=0;j<nodes.length;j++){var e=nodes[j];result+=' '+s(e.value)+' '+s(e.innerText||e.textContent)+' '+s(e.title)+' '+s(e.alt)+' '+s(e.name)+' '+s(e.id);}",
  "}catch(e){}",
  "try{for(var i=0;i<w.frames.length;i++)result+=' '+collect(w.frames[i],depth+1);}catch(e){}",
  "return result;}",
  "return collect(window,0);"
].join("");

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function formatDate(iso) {
  const parts = String(iso || "").split("-");
  if (parts.length !== 3) return String(iso || "");
  return parts[2] + "/" + parts[1] + "/" + parts[0];
}

function edgePath() {
  const candidates = [
    path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.ProgramFiles || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Microsoft", "Edge", "Application", "msedge.exe")
  ];
  for (const p of candidates) if (p && fs.existsSync(p)) return p;
  return "";
}

function driverPath(rootDir) {
  const candidates = [
    path.resolve(rootDir, "..", "driver", "IEDriverServer.exe"),
    path.resolve(rootDir, "driver", "IEDriverServer.exe")
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return "";
}

function missingSelectors() {
  return [];
}

function normalized(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function homeReady(value) {
  const content = normalized(value).replace(/\s+/g, " ");
  return content.includes("ATALHO") && (content.includes("LOGOFF") || content.includes("LOG OFF"));
}

async function isConfigured(config, rootDir) {
  const base = String(config && config.promax && config.promax.url || "https://imperio.promaxcloud.com.br").trim();
  if (!base || !edgePath() || !driverPath(rootDir || __dirname)) {
    LAST_READINESS_ERROR = "Edge, IEDriver ou URL do Promax indisponível.";
    return false;
  }
  try {
    const p = sessionFile(rootDir || __dirname);
    const x = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
    let id = String(x && x.session_id || "");
    if (!await driverReady()) {
      LAST_READINESS_ERROR = "IEDriver não responde na porta 5555.";
      return false;
    }
    try {
      if (!id) throw new Error("Sessão local ausente.");
      SESSION_ID = id;
      await wd("GET", "/url", null, 2500);
    } catch {
      id = await findExistingSession(config, rootDir);
      if (!id) {
        LAST_READINESS_ERROR = "Sessão do IEDriver não encontrada; abra o Promax pelo agente.";
        return false;
      }
      SESSION_ID = id;
    }
    const hs = await handles();
    let loginDetected = false;
    let usablePromaxWindow = false;
    for (const handle of hs) {
      try {
        await switchWindow(handle);
        if (await findHomeInFrames()) {
          LAST_READINESS_ERROR = "";
          return true;
        }
        if (await findLoginInFrames()) {
          loginDetected = true;
          continue;
        }
        if (urlLooksPromax(await currentUrl(), config)) usablePromaxWindow = true;
      } catch {}
    }
    if (usablePromaxWindow) {
      LAST_READINESS_ERROR = "";
      return true;
    }
    if (loginDetected) {
      LAST_READINESS_ERROR = "Sessão do Promax encontrada, mas somente a tela de login está disponível.";
      return false;
    }
    LAST_READINESS_ERROR = "Sessão conectada, mas nenhuma janela navegável do Promax foi encontrada.";
    return false;
  } catch (error) {
    LAST_READINESS_ERROR = "Falha ao consultar a sessão do Promax: " + (error && error.message || String(error));
    return false;
  }
}

function readinessError() { return LAST_READINESS_ERROR; }

function sessionBody(id) {
  return http("POST", driverBase() + "/session/" + encodeURIComponent(id) + "/execute/sync", {
      script: PAGE_TEXT_SCRIPT,
      args: []
    }, 4000);
}

async function findExistingSession(config, rootDir) {
  try {
    const response = await http("GET", driverBase() + "/sessions", null, 3000);
    const sessions = Array.isArray(response.value) ? response.value : [];
    const host = new URL(String(config.promax && config.promax.url)).hostname;
    const alive = [];
    for (const session of sessions) {
      const id = String(session.id || session.sessionId || "");
      if (!id) continue;
      try {
        const current = await http("GET", driverBase() + "/session/" + encodeURIComponent(id) + "/url", null, 3000);
        const url = String(current.value || "");
        alive.push({ id, url });
        try {
          if (new URL(url).hostname === host) {
            SESSION_ID = id;
            saveSession(rootDir, id);
            return id;
          }
        } catch {}
      } catch {}
    }
    // O IEDriver usado pelo Agente Puxada aceita uma sessão por vez. Se ela
    // redirecionou para outro host/subdomínio do Promax, ainda é a sessão certa.
    if (alive.length === 1) {
      SESSION_ID = alive[0].id;
      saveSession(rootDir, SESSION_ID);
      return SESSION_ID;
    }
  } catch {}
  return "";
}

async function http(method, url, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, timeoutMs || 30000);
  try {
    const response = await fetch(url, {
      method: method,
      headers: body == null ? {} : { "Content-Type": "application/json" },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { value: text }; }
    if (!response.ok || data && data.value && data.value.error) {
      const value = data && data.value;
      const message = value && value.message || data && data.message || "Falha no IEDriver (" + response.status + ")";
      throw new Error(message);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function driverBase() {
  return "http://127.0.0.1:" + DRIVER_PORT;
}

function sessionFile(rootDir) {
  return path.resolve(rootDir, "..", "data", "promax-session.json");
}

function loadSavedSession(rootDir) {
  try {
    const p = sessionFile(rootDir);
    if (!fs.existsSync(p)) return "";
    const x = JSON.parse(fs.readFileSync(p, "utf8"));
    return String(x && x.session_id || "");
  } catch {
    return "";
  }
}

function saveSession(rootDir, id) {
  try {
    const p = sessionFile(rootDir);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ session_id: id, port: DRIVER_PORT, driver_pid: DRIVER && DRIVER.pid || null, saved_at: new Date().toISOString() }), "utf8");
  } catch {}
}

function clearSavedSession(rootDir) {
  try { fs.unlinkSync(sessionFile(rootDir)); } catch {}
}

async function driverReady() {
  try {
    const r = await http("GET", driverBase() + "/status", null, 1200);
    return !!r;
  } catch {
    return false;
  }
}

async function startDriver(rootDir) {
  if (await driverReady()) return;
  const exe = driverPath(rootDir);
  if (!exe) throw new Error("IEDriverServer.exe nao encontrado. Atualize o Agente Puxada.");
  const logDir = path.join(rootDir, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const out = fs.openSync(path.join(logDir, "iedriver.log"), "a");
  DRIVER = childProcess.spawn(exe, ["--port=" + DRIVER_PORT], {
    cwd: path.dirname(exe),
    windowsHide: true,
    detached: true,
    stdio: ["ignore", out, out]
  });
  DRIVER.unref();
  for (let i = 0; i < 40; i++) {
    if (await driverReady()) return;
    await sleep(250);
  }
  throw new Error("IEDriver nao iniciou. Consulte logs\\iedriver.log.");
}

async function wd(method, suffix, body, timeoutMs) {
  if (!SESSION_ID && suffix.indexOf("/session") !== 0) throw new Error("Sessao Promax nao iniciada.");
  const prefix = SESSION_ID ? "/session/" + SESSION_ID : "";
  const r = await http(method, driverBase() + prefix + suffix, body, timeoutMs || 45000);
  return r && Object.prototype.hasOwnProperty.call(r, "value") ? r.value : r;
}

async function createSession(config, rootDir) {
  await startDriver(rootDir);
  if (!SESSION_ID) SESSION_ID = loadSavedSession(rootDir);
  if (SESSION_ID) {
    try {
      await wd("GET", "/url", null, 2500);
      return SESSION_ID;
    } catch {
      SESSION_ID = null;
      clearSavedSession(rootDir);
    }
  }
  if (await findExistingSession(config, rootDir)) return SESSION_ID;

  const edge = edgePath();
  if (!edge) throw new Error("Microsoft Edge nao encontrado neste computador.");
  const baseUrl = String(config.promax && config.promax.url || "https://imperio.promaxcloud.com.br").trim();

  const body = {
    capabilities: {
      firstMatch: [{}],
      alwaysMatch: {
        browserName: "internet explorer",
        pageLoadStrategy: "normal",
        "se:ieOptions": {
          "ie.edgechromium": true,
          "ie.edgepath": edge,
          "ie.ignoreprocessmatch": true,
          ignoreProtectedModeSettings: true,
          ignoreZoomSetting: true,
          browserAttachTimeout: 20000,
          requireWindowFocus: false,
          nativeEvents: false,
          initialBrowserUrl: baseUrl
        }
      }
    }
  };
  let created;
  try { created = await http("POST", driverBase() + "/session", body, 60000); }
  catch (error) {
    if (await findExistingSession(config, rootDir)) return SESSION_ID;
    throw error;
  }
  SESSION_ID = created && created.value && created.value.sessionId || created && created.sessionId;
  if (!SESSION_ID) throw new Error("IEDriver nao retornou uma sessao valida.");
  saveSession(rootDir, SESSION_ID);
  return SESSION_ID;
}

async function execute(script, args) {
  return wd("POST", "/execute/sync", { script: script, args: args || [] }, 45000);
}

async function navigate(url) {
  return wd("POST", "/url", { url: url }, 60000);
}

async function currentUrl() {
  return String(await wd("GET", "/url", null, 10000) || "");
}

async function handles() {
  return await wd("GET", "/window/handles", null, 10000) || [];
}

async function switchWindow(handle) {
  return wd("POST", "/window", { handle: handle }, 10000);
}

async function bodyText() {
  return String(await execute(PAGE_TEXT_SCRIPT) || "");
}

async function topFrame() {
  return wd("POST", "/frame", { id: null }, 7000);
}

async function parentFrame() {
  return wd("POST", "/frame/parent", {}, 7000);
}

async function frameElements() {
  try {
    return await wd("POST", "/elements", { using: "css selector", value: "frame,iframe" }, 7000) || [];
  } catch {
    return [];
  }
}

async function findInFrames(check, maxDepth) {
  await topFrame();
  const limit = Number(maxDepth || 8);
  async function visit(depth) {
    try { if (await check()) return true; } catch {}
    if (depth >= limit) return false;
    const frames = await frameElements();
    for (const frame of frames) {
      try { await wd("POST", "/frame", { id: frame }, 7000); }
      catch { continue; }
      if (await visit(depth + 1)) return true;
      try { await parentFrame(); } catch { await topFrame(); }
    }
    return false;
  }
  return visit(0);
}

async function findTextInFrames(text) {
  const wanted = normalized(text);
  return findInFrames(async function () {
    return normalized(await bodyText()).indexOf(wanted) >= 0;
  }, 8);
}

async function findHomeInFrames() {
  return findInFrames(async function () {
    return homeReady(await bodyText());
  }, 8);
}

async function findLoginInFrames() {
  return findInFrames(async function () {
    const t = normalized(await bodyText());
    return t.indexOf("USUARIO") >= 0 && t.indexOf("SENHA") >= 0;
  }, 8);
}

function urlLooksPromax(url, config) {
  try {
    const current = new URL(String(url || ""));
    const base = new URL(String(config.promax && config.promax.url || "https://imperio.promaxcloud.com.br"));
    return current.protocol.indexOf("http") === 0 &&
      (current.hostname === base.hostname ||
       current.hostname.endsWith(".promaxcloud.com.br") ||
       current.hostname.indexOf("promax") >= 0);
  } catch {
    return false;
  }
}

async function waitUntil(check, timeoutMs, intervalMs) {
  const until = Date.now() + (timeoutMs || 30000);
  let lastErr = null;
  while (Date.now() < until) {
    try {
      const v = await check();
      if (v) return v;
    } catch (e) {
      lastErr = e;
    }
    await sleep(intervalMs || 400);
  }
  if (lastErr) throw lastErr;
  throw new Error("Tempo esgotado aguardando o Promax.");
}

async function switchToWindowContaining(expected) {
  return waitUntil(async function () {
    const hs = await handles();
    for (let i = hs.length - 1; i >= 0; i--) {
      try {
        await switchWindow(hs[i]);
        if (await findTextInFrames(expected)) return hs[i];
      } catch {}
    }
    return null;
  }, 25000, 500);
}

async function openShortcut(reportCode) {
  const script = [
    "var target=arguments[0];",
    "function n(s){return String(s||'').replace(/\\s+/g,' ').replace(/^\\s+|\\s+$/g,'').toUpperCase();}",
    "function vis(e){if(!e)return false;try{var r=e.getBoundingClientRect();return r.width>0&&r.height>0;}catch(x){return true;}}",
    "var d=document,best=null,ok=null;",
    "var inputs=d.querySelectorAll('input[type=text],input:not([type]),textarea');",
    "for(var i=0;i<inputs.length;i++){var e=inputs[i],meta=n((e.name||'')+' '+(e.id||'')+' '+(e.title||'')+' '+(e.placeholder||'')+' '+(e.getAttribute('aria-label')||''));if(vis(e)&&meta.indexOf('ATALHO')>=0){best=e;break;}}",
    "if(!best){var labels=d.querySelectorAll('td,th,div,span,font,b,label');for(var j=0;j<labels.length&&!best;j++){var l=labels[j],t=n(l.innerText||l.textContent||l.title||l.getAttribute('aria-label'));if(t.indexOf('ATALHO')<0)continue;var lr=l.getBoundingClientRect(),score=999999;for(var k=0;k<inputs.length;k++){var x=inputs[k];if(!vis(x))continue;var r=x.getBoundingClientRect(),s=Math.abs(r.top-lr.bottom)+Math.max(0,lr.left-r.left);if(s<score){score=s;best=x;}}}}",
    "var acts=d.querySelectorAll('input,button,a,img');for(var q=0;q<acts.length;q++){var a=acts[q],txt=n(a.value||a.innerText||a.textContent||a.title||a.alt||a.name||a.id);if(vis(a)&&(txt==='OK'||txt.indexOf(' OK ')>=0||txt.indexOf('OK')===0)){ok=a;break;}}",
    "if(!best||!ok)return false;",
    "best.focus();best.value=target;",
    "try{best.fireEvent('onchange');}catch(x){try{var ev=d.createEvent('HTMLEvents');ev.initEvent('change',true,false);best.dispatchEvent(ev);}catch(y){}}",
    "try{ok.click();}catch(x){try{ok.fireEvent('onclick');}catch(y){return false;}}",
    "return true;"
  ].join("");
  const hs = await handles();
  for (let i = hs.length - 1; i >= 0; i--) {
    try {
      await switchWindow(hs[i]);
      const found = await findInFrames(async function () {
        return !!(await execute(script, [reportCode]));
      }, 8);
      if (found) return true;
    } catch {}
  }
  throw new Error("Campo ATALHO/OK não foi localizado na sessão do Promax.");
}

async function fillReport(job, config) {
  const vals = {
    dateFrom: formatDate(job.date_from),
    dateTo: formatDate(job.date_to),
    warehouse: String(config.promax && config.promax.warehouse || job.warehouse || "1"),
    deposit: String(config.promax && config.promax.deposit || job.deposit || "1"),
    operationFrom: String(config.promax && config.promax.operationFrom || job.operation_from || "251"),
    operationTo: String(config.promax && config.promax.operationTo || job.operation_to || "314")
  };
  const script = [
    "var vals=arguments[0];",
    "function n(s){return String(s||'').replace(/[ÁÀÂÃÄ]/gi,'A').replace(/[ÉÈÊË]/gi,'E').replace(/[ÍÌÎÏ]/gi,'I').replace(/[ÓÒÔÕÖ]/gi,'O').replace(/[ÚÙÛÜ]/gi,'U').replace(/Ç/gi,'C').replace(/\\s+/g,' ').replace(/^\\s+|\\s+$/g,'').toUpperCase();}",
    "function vis(e){if(!e)return false;try{var r=e.getBoundingClientRect();return r.width>0&&r.height>0;}catch(x){return true;}}",
    "function setv(e,v){e.focus();e.value=String(v);try{e.fireEvent('onchange');}catch(x){try{var ev=document.createEvent('HTMLEvents');ev.initEvent('change',true,false);e.dispatchEvent(ev);}catch(y){}}}",
    "function labelNode(label){var nodes=document.querySelectorAll('td,th,span,div,font,b,label');var want=n(label);for(var i=0;i<nodes.length;i++){var t=n(nodes[i].innerText||nodes[i].textContent||nodes[i].title||nodes[i].getAttribute('aria-label'));if(t===want||t.indexOf(want)===0)return nodes[i];}return null;}",
    "function pair(label){var l=labelNode(label);if(!l)return null;var lr=l.getBoundingClientRect();var a=document.querySelectorAll('input[type=text],input:not([type]),select'),list=[];for(var i=0;i<a.length;i++){var e=a[i];if(!vis(e))continue;var r=e.getBoundingClientRect(),dy=Math.abs((r.top+r.bottom)/2-(lr.top+lr.bottom)/2);if(dy<32&&r.left>lr.left-30)list.push({e:e,x:r.left});}list.sort(function(x,y){return x.x-y.x;});if(list.length>=2)return [list[0].e,list[1].e];var p=l.parentNode;for(var up=0;up<6&&p;up++,p=p.parentNode){var q=p.querySelectorAll('input[type=text],input:not([type]),select'),z=[];for(var j=0;j<q.length;j++)if(vis(q[j]))z.push(q[j]);if(z.length>=2)return [z[0],z[1]];}return null;}",
    "var p=pair('Periodo'),a=pair('Armazem'),d=pair('Deposito'),o=pair('Operacao');if(!p||!a||!d||!o)return false;",
    "var view=null,acts=document.querySelectorAll('input,button,a,img');for(var k=0;k<acts.length;k++){var t=n(acts[k].value||acts[k].innerText||acts[k].textContent||acts[k].title||acts[k].alt);if(vis(acts[k])&&t.indexOf('VISUALIZAR')>=0){view=acts[k];break;}}if(!view)return false;",
    "setv(p[0],vals.dateFrom);setv(p[1],vals.dateTo);setv(a[0],vals.warehouse);setv(a[1],vals.warehouse);setv(d[0],vals.deposit);setv(d[1],vals.deposit);setv(o[0],vals.operationFrom);setv(o[1],vals.operationTo);",
    "try{view.click();}catch(x){try{view.fireEvent('onclick');}catch(y){return false;}}return true;"
  ].join("");

  const hs = await handles();
  for (let i = hs.length - 1; i >= 0; i--) {
    try {
      await switchWindow(hs[i]);
      const found = await findInFrames(async function () {
        return !!(await execute(script, [vals]));
      }, 8);
      if (found) return true;
    } catch {}
  }
  return false;
}

async function csvDescriptor() {
  const script = [
    "function n(s){return String(s||'').replace(/\\s+/g,' ').replace(/^\\s+|\\s+$/g,'').toUpperCase();}",
    "var a=document.querySelectorAll('a,input,button,img');",
    "for(var i=0;i<a.length;i++){var e=a[i],t=n(e.value||e.innerText||e.textContent||e.title||e.alt||e.name||e.id);if(t==='CSV'||t.indexOf('CSV')===0){return {tag:e.tagName||'',href:e.href||e.getAttribute('href')||'',onclick:e.getAttribute('onclick')||'',html:e.outerHTML||''};}}",
    "return null;"
  ].join("");
  const hs = await handles();
  for (let i = hs.length - 1; i >= 0; i--) {
    try {
      await switchWindow(hs[i]);
      let descriptor = null;
      const found = await findInFrames(async function () {
        descriptor = await execute(script);
        return !!descriptor;
      }, 8);
      if (found) return descriptor;
    } catch {}
  }
  return null;
}

async function clickCsv() {
  const script = [
    "function n(s){return String(s||'').replace(/\\s+/g,' ').replace(/^\\s+|\\s+$/g,'').toUpperCase();}",
    "var a=document.querySelectorAll('a,input,button,img');for(var i=0;i<a.length;i++){var e=a[i],t=n(e.value||e.innerText||e.textContent||e.title||e.alt||e.name||e.id);if(t==='CSV'||t.indexOf('CSV')===0){try{e.click();}catch(x){try{e.fireEvent('onclick');}catch(y){return false;}}return true;}}return false;"
  ].join("");
  const hs = await handles();
  for (let i = hs.length - 1; i >= 0; i--) {
    try {
      await switchWindow(hs[i]);
      const found = await findInFrames(async function () {
        return !!(await execute(script));
      }, 8);
      if (found) return true;
    } catch {}
  }
  throw new Error("Botão CSV não encontrado nos quadros do Promax.");
}

async function cookieHeader() {
  const list = await wd("GET", "/cookie", null, 10000) || [];
  return list.map(function (c) { return c.name + "=" + c.value; }).join("; ");
}

async function directDownload(href, rootDir) {
  const base = await currentUrl();
  const url = new URL(href, base).toString();
  const cookies = await cookieHeader();
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      Cookie: cookies,
      Referer: base,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/131 Safari/537.36"
    }
  });
  if (!response.ok) throw new Error("Download CSV retornou HTTP " + response.status + ".");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 50) throw new Error("Arquivo CSV retornado vazio.");
  const textHead = bytes.subarray(0, Math.min(bytes.length, 300)).toString("latin1").toLowerCase();
  if (textHead.indexOf("<html") >= 0 || textHead.indexOf("<!doctype") >= 0) {
    throw new Error("O link CSV exige confirmacao pelo navegador.");
  }
  const dir = path.join(rootDir, "downloads");
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "020501_" + Date.now() + ".csv.inf");
  fs.writeFileSync(target, bytes);
  return target;
}

function downloadDirs() {
  const list = [path.join(os.homedir(), "Downloads")];
  if (process.env.OneDrive) list.push(path.join(process.env.OneDrive, "Downloads"));
  return list.filter(function (p, i, a) { return p && a.indexOf(p) === i && fs.existsSync(p); });
}

function newestCandidate(sinceMs) {
  let found = null;
  for (const dir of downloadDirs()) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const name of names) {
      if (!/\.inf$|\.csv$/i.test(name) || name.toLowerCase().indexOf("02.05.01") < 0) continue;
      const full = path.join(dir, name);
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      if (!st.isFile() || st.mtimeMs < sinceMs - 2000 || st.size < 50) continue;
      if (!found || st.mtimeMs > found.mtimeMs) found = { path: full, mtimeMs: st.mtimeMs, size: st.size };
    }
  }
  return found;
}

function sendAltS() {
  const vbs = path.join(os.tmpdir(), "agente-puxada-save.vbs");
  fs.writeFileSync(vbs, [
    "On Error Resume Next",
    "Set sh = CreateObject(\"WScript.Shell\")",
    "WScript.Sleep 500",
    "ok = sh.AppActivate(\"Movimentação do Estoque\")",
    "If Not ok Then ok = sh.AppActivate(\"Microsoft Edge\")",
    "WScript.Sleep 500",
    "sh.SendKeys \"%s\"",
    "WScript.Sleep 300"
  ].join("\r\n"), "utf8");
  childProcess.execFileSync("wscript.exe", [vbs], { windowsHide: true, timeout: 5000 });
}

async function browserDownload(rootDir) {
  const since = Date.now();
  await clickCsv();
  await sleep(800);
  sendAltS();
  let previous = null;
  let stable = 0;
  const candidate = await waitUntil(async function () {
    const c = newestCandidate(since);
    if (!c) return null;
    if (previous && previous.path === c.path && previous.size === c.size) stable++;
    else stable = 0;
    previous = c;
    return stable >= 2 ? c : null;
  }, 45000, 700);
  const dir = path.join(rootDir, "downloads");
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "020501_" + Date.now() + ".csv.inf");
  fs.copyFileSync(candidate.path, target);
  return target;
}

async function ensurePromaxHome(config, rootDir) {
  await createSession(config, rootDir);
  const baseUrl = String(config.promax && config.promax.url || "https://imperio.promaxcloud.com.br").trim();

  async function inspectWindows() {
    const hs = await handles();
    let loginDetected = false;
    for (const handle of hs) {
      try {
        await switchWindow(handle);
        if (await findHomeInFrames()) return { ready: true, handle };
        const login = await findLoginInFrames();
        if (login) {
          loginDetected = true;
          continue;
        }
        if (urlLooksPromax(await currentUrl(), config)) return { ready: true, handle };
      } catch {}
    }
    return { ready: false, loginDetected };
  }

  let state = await inspectWindows();
  if (state.ready) return true;

  // Só navega para a URL base quando não existe uma janela Promax utilizável.
  // Isso evita transformar uma janela autenticada em uma tela de login.
  try {
    await topFrame();
    await navigate(baseUrl);
    await sleep(1200);
  } catch {}

  state = await inspectWindows();
  if (state.ready) return true;
  if (state.loginDetected) {
    throw new Error("PROMAX_LOGIN_REQUIRED: a sessão controlada pelo agente está na tela de login.");
  }
  throw new Error("Sessão do Promax conectada, mas a aplicação não ficou navegável.");
}

async function export020501(job, config, rootDir) {
  await ensurePromaxHome(config, rootDir);
  var report = String(config.promax && config.promax.report || "02.05.01").replace(/\D/g, "");
  if (report === "020501") report = "02.05.01";
  await openShortcut(report);

  await waitUntil(async function () {
    return fillReport(job, config);
  }, 30000, 600);

  const d = await waitUntil(async function () {
    return await csvDescriptor();
  }, 60000, 700);

  if (d && d.href && !/^javascript:/i.test(d.href) && d.href !== "#") {
    try {
      return await directDownload(d.href, rootDir);
    } catch {}
  }
  return browserDownload(rootDir);
}

async function openCalibrationBrowser(config, rootDir) {
  const url = String(config.promax && config.promax.url || "https://imperio.promaxcloud.com.br").trim();
  await createSession(config, rootDir);
  await navigate(url);
}

module.exports = { isConfigured, readinessError, missingSelectors, openCalibrationBrowser, export020501 };
