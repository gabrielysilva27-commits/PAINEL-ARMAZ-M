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
    for (const handle of hs) {
      try {
        await switchWindow(handle);
        if (await findHomeInFrames()) {
          LAST_READINESS_ERROR = "";
          return true;
        }
      } catch {}
    }
    LAST_READINESS_ERROR = "Sessão conectada, mas a tela inicial logada (LogOff e Atalho) não foi detectada nos quadros do Promax.";
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
    for (const session of sessions) {
      const id = String(session.id || session.sessionId || "");
      if (!id) continue;
      try {
        const current = await http("GET", driverBase() + "/session/" + encodeURIComponent(id) + "/url", null, 3000);
        if (new URL(String(current.value || "")).hostname !== host) continue;
        SESSION_ID = id;
        saveSession(rootDir, id);
        return id;
      } catch {}
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
  if (!await findTextInFrames("Atalho")) throw new Error("Campo ATALHO não encontrado nos quadros do Promax.");
  const script = [
    "var target=arguments[0];",
    "function n(s){return String(s||'').replace(/\\s+/g,' ').replace(/^\\s+|\\s+$/g,'').toUpperCase();}",
    "function vis(e){if(!e)return false;try{var r=e.getBoundingClientRect();return r.width>0&&r.height>0;}catch(x){return true;}}",
    "function docs(w,depth,out){if(depth>8)return;try{if(w.document)out.push(w.document);}catch(e){}try{for(var i=0;i<w.frames.length;i++)docs(w.frames[i],depth+1,out);}catch(e){}}",
    "var all=[];docs(window,0,all);var best=null,bestDoc=null,bestScore=999999;",
    "for(var di=0;di<all.length;di++){var d=all[di],labels=d.querySelectorAll('td,th,div,span,font,b,label');var lab=null;",
    "for(var i=0;i<labels.length;i++){var t=n(labels[i].innerText||labels[i].textContent||labels[i].title||labels[i].value);if(t==='ATALHO'||t.indexOf('ATALHO')===0){lab=labels[i];break;}}",
    "if(!lab)continue;var lr=lab.getBoundingClientRect();var inputs=d.querySelectorAll('input[type=text],input:not([type]),textarea');",
    "for(var j=0;j<inputs.length;j++){var e=inputs[j];if(!vis(e))continue;var r=e.getBoundingClientRect();var score=Math.abs(r.top-lr.bottom)+Math.max(0,lr.left-r.left);if(score<bestScore){best=e;bestDoc=d;bestScore=score;}}}",
    "if(!best)throw new Error('Campo ATALHO nao encontrado nos quadros do Promax.');",
    "best.focus();best.value=target;",
    "try{best.fireEvent('onchange');}catch(x){try{var ev=bestDoc.createEvent('HTMLEvents');ev.initEvent('change',true,false);best.dispatchEvent(ev);}catch(y){}}",
    "var searchDocs=[bestDoc];for(var z=0;z<all.length;z++)if(all[z]!==bestDoc)searchDocs.push(all[z]);var ok=null;",
    "for(var q=0;q<searchDocs.length&&!ok;q++){var acts=searchDocs[q].querySelectorAll('input,button,a');for(var k=0;k<acts.length;k++){var a=acts[k],txt=n(a.value||a.innerText||a.textContent||a.title);if(vis(a)&&txt==='OK'){ok=a;break;}}}",
    "if(!ok)throw new Error('Botao OK do ATALHO nao encontrado.');",
    "ok.click();return true;"
  ].join("");
  return execute(script, [reportCode]);
}

async function fillReport(job, config) {
  const reportFrame = await findInFrames(async function () {
    const t = normalized(await bodyText());
    return t.indexOf("PERIODO") >= 0 && t.indexOf("ARMAZEM") >= 0 && t.indexOf("OPERACAO") >= 0;
  }, 8);
  if (!reportFrame) throw new Error("Formulário 02.05.01 não encontrado nos quadros do Promax.");
  const script = [
    "var vals=arguments[0];",
    "function n(s){return String(s||'').replace(/[ÁÀÂÃÄ]/gi,'A').replace(/[ÉÈÊË]/gi,'E').replace(/[ÍÌÎÏ]/gi,'I').replace(/[ÓÒÔÕÖ]/gi,'O').replace(/[ÚÙÛÜ]/gi,'U').replace(/Ç/gi,'C').replace(/\\s+/g,' ').replace(/^\\s+|\\s+$/g,'').toUpperCase();}",
    "function vis(e){if(!e)return false;try{var r=e.getBoundingClientRect();return r.width>0&&r.height>0;}catch(x){return true;}}",
    "function docs(w,depth,out){if(depth>8)return;try{if(w.document)out.push(w.document);}catch(e){}try{for(var i=0;i<w.frames.length;i++)docs(w.frames[i],depth+1,out);}catch(e){}}",
    "var all=[];docs(window,0,all);",
    "function setv(e,v){e.focus();e.value=String(v);try{e.fireEvent('onchange');}catch(x){try{var d=e.ownerDocument||document,ev=d.createEvent('HTMLEvents');ev.initEvent('change',true,false);e.dispatchEvent(ev);}catch(y){}}}",
    "function labelNode(d,label){var nodes=d.querySelectorAll('td,th,span,div,font,b,label');var want=n(label);for(var i=0;i<nodes.length;i++){var t=n(nodes[i].innerText||nodes[i].textContent||nodes[i].title||nodes[i].value);if(t===want||t.indexOf(want)===0)return nodes[i];}return null;}",
    "function pair(label){for(var di=0;di<all.length;di++){var d=all[di],l=labelNode(d,label);if(!l)continue;var lr=l.getBoundingClientRect();var a=d.querySelectorAll('input[type=text],input:not([type]),select');var list=[];for(var i=0;i<a.length;i++){var e=a[i];if(!vis(e))continue;var r=e.getBoundingClientRect();var dy=Math.abs((r.top+r.bottom)/2-(lr.top+lr.bottom)/2);if(dy<28&&r.left>lr.left-20)list.push({e:e,x:r.left,dy:dy});}list.sort(function(x,y){return x.x-y.x;});if(list.length>=2)return [list[0].e,list[1].e];var p=l.parentNode;for(var up=0;up<5&&p;up++,p=p.parentNode){var q=p.querySelectorAll('input[type=text],input:not([type]),select');var z=[];for(var j=0;j<q.length;j++)if(vis(q[j]))z.push(q[j]);if(z.length>=2)return [z[0],z[1]];}}throw new Error('Campos '+label+' nao encontrados nos quadros do Promax.');}",
    "var p=pair('Periodo');setv(p[0],vals.dateFrom);setv(p[1],vals.dateTo);",
    "var a=pair('Armazem');setv(a[0],vals.warehouse);setv(a[1],vals.warehouse);",
    "var d=pair('Deposito');setv(d[0],vals.deposit);setv(d[1],vals.deposit);",
    "var o=pair('Operacao');setv(o[0],vals.operationFrom);setv(o[1],vals.operationTo);",
    "var view=null;for(var di2=0;di2<all.length&&!view;di2++){var acts=all[di2].querySelectorAll('input,button,a');for(var k=0;k<acts.length;k++){var t=n(acts[k].value||acts[k].innerText||acts[k].textContent||acts[k].title);if(vis(acts[k])&&(t==='VISUALIZAR'||t.indexOf('VISUALIZAR')>=0)){view=acts[k];break;}}}",
    "if(!view)throw new Error('Botao Visualizar nao encontrado nos quadros do Promax.');view.click();return true;"
  ].join("");

  return execute(script, [{
    dateFrom: formatDate(job.date_from),
    dateTo: formatDate(job.date_to),
    warehouse: String(config.promax && config.promax.warehouse || job.warehouse || "1"),
    deposit: String(config.promax && config.promax.deposit || job.deposit || "1"),
    operationFrom: String(config.promax && config.promax.operationFrom || job.operation_from || "251"),
    operationTo: String(config.promax && config.promax.operationTo || job.operation_to || "314")
  }]);
}

async function csvDescriptor() {
  const csvFrame = await findInFrames(async function () {
    const t = normalized(await bodyText());
    return t.indexOf("CSV") >= 0;
  }, 8);
  if (!csvFrame) return null;
  const script = [
    "function n(s){return String(s||'').replace(/\\s+/g,' ').replace(/^\\s+|\\s+$/g,'').toUpperCase();}",
    "function docs(w,depth,out){if(depth>8)return;try{if(w.document)out.push(w.document);}catch(e){}try{for(var i=0;i<w.frames.length;i++)docs(w.frames[i],depth+1,out);}catch(e){}}",
    "var all=[];docs(window,0,all);",
    "for(var di=0;di<all.length;di++){var a=all[di].querySelectorAll('a,input,button');",
    "for(var i=0;i<a.length;i++){var e=a[i],t=n(e.value||e.innerText||e.textContent||e.title);if(t==='CSV'){return {tag:e.tagName||'',href:e.href||e.getAttribute('href')||'',onclick:e.getAttribute('onclick')||'',html:e.outerHTML||''};}}}",
    "return null;"
  ].join("");
  return execute(script);
}

async function clickCsv() {
  const csvFrame = await findInFrames(async function () {
    const t = normalized(await bodyText());
    return t.indexOf("CSV") >= 0;
  }, 8);
  if (!csvFrame) throw new Error("Botão CSV não encontrado nos quadros do Promax.");
  return execute([
    "function n(s){return String(s||'').replace(/\\s+/g,' ').replace(/^\\s+|\\s+$/g,'').toUpperCase();}",
    "function docs(w,depth,out){if(depth>8)return;try{if(w.document)out.push(w.document);}catch(e){}try{for(var i=0;i<w.frames.length;i++)docs(w.frames[i],depth+1,out);}catch(e){}}",
    "var all=[];docs(window,0,all);",
    "for(var di=0;di<all.length;di++){var a=all[di].querySelectorAll('a,input,button');for(var i=0;i<a.length;i++){var e=a[i],t=n(e.value||e.innerText||e.textContent||e.title);if(t==='CSV'){e.click();return true;}}}",
    "throw new Error('Botao CSV nao encontrado nos quadros do Promax.');"
  ].join(""));
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
  await navigate(baseUrl);
  await waitUntil(async function () {
    if (await findHomeInFrames()) return true;
    const login = await findInFrames(async function () {
      const t = normalized(await bodyText());
      return t.indexOf("USUARIO") >= 0 && t.indexOf("SENHA") >= 0;
    }, 8);
    if (login) throw new Error("PROMAX_LOGIN_REQUIRED: faca login no Promax no Edge e mantenha a sessao aberta.");
    return false;
  }, 25000, 500);
}

async function export020501(job, config, rootDir) {
  await ensurePromaxHome(config, rootDir);
  var report = String(config.promax && config.promax.report || "02.05.01").replace(/\D/g, "");
  if (report === "020501") report = "02.05.01";
  await openShortcut(report);
  await switchToWindowContaining("Movimentação do Estoque");
  await waitUntil(async function () {
    return findInFrames(async function () {
      const t = normalized(await bodyText());
      return t.indexOf("PERIODO") >= 0 && t.indexOf("ARMAZEM") >= 0 && t.indexOf("OPERACAO") >= 0;
    }, 8);
  }, 20000, 400);

  await fillReport(job, config);
  await switchToWindowContaining("Movimentação de Estoque");
  await waitUntil(async function () {
    const d = await csvDescriptor();
    return d ? d : null;
  }, 60000, 700);

  const d = await csvDescriptor();
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
