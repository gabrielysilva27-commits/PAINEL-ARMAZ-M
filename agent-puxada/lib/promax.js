const fs = require("fs");
const os = require("os");
const path = require("path");
const childProcess = require("child_process");
const net = require("net");
const existingEdge = require("./existing-edge");

let DRIVER = null;
let SESSION_ID = null;
let DRIVER_PORT = 5555;
let LAST_READINESS_ERROR = "";
let LAST_NORMAL_EDGE_STATUS = "not_run";
let NORMAL_EDGE_ATTEMPTED = false;
let MANAGED_SESSION_RETIRED = false;
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

function driverPortFile(rootDir) {
  return path.resolve(rootDir || __dirname, "..", "data", "promax-driver-port.json");
}

function loadDriverPort(rootDir) {
  try {
    const state = JSON.parse(fs.readFileSync(driverPortFile(rootDir), "utf8"));
    const port = Number(state && state.port);
    if (Number.isInteger(port) && port > 0 && port < 65536) DRIVER_PORT = port;
  } catch {}
  return DRIVER_PORT;
}

function saveDriverPort(rootDir) {
  try {
    const file = driverPortFile(rootDir);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ port: DRIVER_PORT, saved_at: new Date().toISOString() }), "utf8");
  } catch {}
}

function findAvailablePort() {
  return new Promise(function (resolve, reject) {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", function () {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(function (error) {
        if (error) return reject(error);
        if (!port) return reject(new Error("Não foi possível reservar uma porta local para o IEDriver."));
        resolve(port);
      });
    });
  });
}

function driverLogTail(logFile) {
  try {
    return fs.readFileSync(logFile, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-12)
      .join(" | ")
      .replace(/\s+/g, " ")
      .slice(-750);
  } catch {
    return "";
  }
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

async function retireManagedSession(config, rootDir) {
  if (MANAGED_SESSION_RETIRED) return;
  MANAGED_SESSION_RETIRED = true;
  try {
    loadDriverPort(rootDir || __dirname);
    if (await driverReady()) {
      let id = "";
      try {
        const p = sessionFile(rootDir || __dirname);
        const x = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
        id = String(x && x.session_id || "");
      } catch {}
      if (!id) {
        try { id = await findExistingSession(config, rootDir); } catch {}
      }
      if (id) {
        try {
          SESSION_ID = id;
          await wd("DELETE", "", null, 10000);
        } catch {}
      }
    }
  } catch {}
  SESSION_ID = null;
  try { clearSavedSession(rootDir || __dirname); } catch {}
  try { fs.rmSync(path.resolve(rootDir || __dirname, "..", "data", "promax-native-session.json"), { force: true }); } catch {}
}

async function isConfigured(config, rootDir) {
  await retireManagedSession(config, rootDir);
  const probe = existingEdge.probe();
  if (process.platform === "win32" && probe.available && probe.homeWindows > 0) {
    LAST_READINESS_ERROR = "";
    return true;
  }
  LAST_READINESS_ERROR = "PromaxWEB não foi localizado em uma janela normal do Microsoft Edge. Abra o Promax no Edge normal e mantenha a sessão logada.";
  return false;
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

function calibrationLockFile(rootDir) {
  return path.resolve(rootDir, "..", "data", "promax-calibration.lock");
}

function calibrationLocked(rootDir) {
  try {
    const p = calibrationLockFile(rootDir);
    const st = fs.statSync(p);
    if (Date.now() - st.mtimeMs > 2 * 60 * 1000) {
      try { fs.unlinkSync(p); } catch {}
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function setCalibrationLock(rootDir, enabled) {
  const p = calibrationLockFile(rootDir);
  if (!enabled) {
    try { fs.unlinkSync(p); } catch {}
    return;
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), "utf8");
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
  loadDriverPort(rootDir || __dirname);
  if (await driverReady()) return;
  const exe = driverPath(rootDir);
  if (!exe) throw new Error("IEDriverServer.exe nao encontrado. Atualize o Agente Puxada.");
  const logDir = path.join(rootDir, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.resolve(logDir, "iedriver.log");

  // Older agent versions left a detached IEDriverServer listening on 5555.
  // If that server cannot answer /status, do not start another process on the
  // same port. Pick a free local port and persist it so the background agent
  // and the calibration process share the same driver after a restart.
  DRIVER_PORT = await findAvailablePort();
  let spawnError = null;
  let exitResult = null;
  DRIVER = childProcess.spawn(exe, [
    "--port=" + DRIVER_PORT,
    "--log-level=DEBUG",
    "--log-file=" + logFile
  ], {
    cwd: path.dirname(exe),
    windowsHide: true,
    detached: true,
    stdio: "ignore"
  });
  DRIVER.once("error", function (error) { spawnError = error; });
  DRIVER.once("exit", function (code, signal) { exitResult = { code: code, signal: signal }; });
  DRIVER.unref();
  for (let i = 0; i < 40; i++) {
    if (spawnError) throw new Error("Não foi possível iniciar o IEDriver: " + spawnError.message + ". " + driverLogTail(logFile));
    if (exitResult) throw new Error("IEDriver encerrou durante a inicialização (código " + exitResult.code + (exitResult.signal ? ", sinal " + exitResult.signal : "") + "). " + driverLogTail(logFile));
    if (await driverReady()) {
      saveDriverPort(rootDir || __dirname);
      return;
    }
    await sleep(250);
  }
  throw new Error("IEDriver não respondeu na porta " + DRIVER_PORT + " durante a inicialização. " + driverLogTail(logFile));
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
          browserAttachTimeout: 30000,
          requireWindowFocus: true,
          nativeEvents: true,
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
  const nativeMarker=path.resolve(rootDir,'..','data','promax-native-session.json');
  fs.mkdirSync(path.dirname(nativeMarker),{recursive:true});
  fs.writeFileSync(nativeMarker,JSON.stringify({session_id:SESSION_ID,nativeEvents:true}));
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
    "function rect(e){try{return e.getBoundingClientRect();}catch(x){return {left:0,right:0,top:0,bottom:0,width:0,height:0};}}",
    "function vis(e){if(!e)return false;var r=rect(e);var w=(r.width!=null?r.width:(r.right-r.left)),h=(r.height!=null?r.height:(r.bottom-r.top));return w>0&&h>0;}",
    "function txt(e){return n((e.value||'')+' '+(e.innerText||e.textContent||'')+' '+(e.title||'')+' '+(e.alt||'')+' '+(e.name||'')+' '+(e.id||''));}",
    "var ins=document.getElementsByTagName('input'),btns=document.getElementsByTagName('button'),ok=null,best=null;",
    "for(var i=0;i<ins.length;i++){var t=txt(ins[i]);if(vis(ins[i])&&(t==='OK'||t.indexOf('OK ')===0||t.indexOf(' OK')>=0)){ok=ins[i];break;}}",
    "if(!ok){for(var b=0;b<btns.length;b++){var tb=txt(btns[b]);if(vis(btns[b])&&(tb==='OK'||tb.indexOf('OK ')===0||tb.indexOf(' OK')>=0)){ok=btns[b];break;}}}",
    "var textInputs=[];for(var j=0;j<ins.length;j++){var tp=n(ins[j].type||'text');if(vis(ins[j])&&(tp==='TEXT'||tp===''))textInputs.push(ins[j]);}",
    "if(ok){var ro=rect(ok),cyo=(ro.top+ro.bottom)/2,bestScore=999999;for(var k=0;k<textInputs.length;k++){var r=rect(textInputs[k]),cy=(r.top+r.bottom)/2;if(r.right<=ro.left+8&&Math.abs(cy-cyo)<34){var score=(ro.left-r.right)+Math.abs(cy-cyo)*4;if(score<bestScore){bestScore=score;best=textInputs[k];}}}}",
    "if(!best){var labels=[];var tags=['td','th','div','span','font','b','label'];for(var ti=0;ti<tags.length;ti++){var ns=document.getElementsByTagName(tags[ti]);for(var z=0;z<ns.length;z++)labels.push(ns[z]);}var lab=null;for(var q=0;q<labels.length;q++){if(txt(labels[q]).indexOf('ATALHO')>=0){lab=labels[q];break;}}if(lab){var lr=rect(lab),bs=999999;for(var u=0;u<textInputs.length;u++){var rr=rect(textInputs[u]),sc=Math.abs(rr.top-lr.bottom)+Math.abs(rr.left-lr.left);if(sc<bs){bs=sc;best=textInputs[u];}}}}",
    "if(!best&&textInputs.length===1)best=textInputs[0];",
    "if(!best&&textInputs.length>1){for(var p=0;p<textInputs.length;p++){var meta=txt(textInputs[p]);if(meta.indexOf('ATALHO')>=0){best=textInputs[p];break;}}}",
    "if(!best||!ok){var diag=[];for(var d=0;d<ins.length&&d<12;d++)diag.push('INPUT['+d+'] type='+String(ins[d].type||'')+' value='+String(ins[d].value||'')+' name='+String(ins[d].name||'')+' id='+String(ins[d].id||''));for(var e=0;e<btns.length&&e<8;e++)diag.push('BUTTON['+e+'] '+txt(btns[e]));return {ok:false,diag:diag.join(' | ')};}",
    "try{best.focus();}catch(x){}best.value=target;",
    "try{best.fireEvent('onchange');}catch(x){try{var ev=document.createEvent('HTMLEvents');ev.initEvent('change',true,false);best.dispatchEvent(ev);}catch(y){}}",
    "try{best.fireEvent('onkeyup');}catch(x){}",
    "try{ok.click();return {ok:true};}catch(x){try{ok.fireEvent('onclick');return {ok:true};}catch(y){try{if(ok.form){ok.form.submit();return {ok:true};}}catch(z){}}}",
    "return {ok:false,diag:'Encontrou Atalho e OK, mas não conseguiu acionar o botão.'};"
  ].join("");

  const hs = await handles();
  let diagnostics = [];
  for (let i = hs.length - 1; i >= 0; i--) {
    try {
      await switchWindow(hs[i]);
      const found = await findInFrames(async function () {
        const result = await execute(script, [reportCode]);
        if (result && result.ok) return true;
        if (result && result.diag) diagnostics.push(result.diag);
        return false;
      }, 8);
      if (found) return true;
    } catch (e) {
      diagnostics.push(String(e && e.message || e));
    }
  }
  const details = diagnostics.filter(Boolean).slice(0, 4).join(" || ");
  throw new Error("Campo ATALHO/OK não foi localizado na sessão do Promax." + (details ? " Diagnóstico: " + details : ""));
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
    "function fire(e,name){try{e.fireEvent('on'+name);}catch(x){try{var ev=document.createEvent('HTMLEvents');ev.initEvent(name,true,false);e.dispatchEvent(ev);}catch(y){}}}",
    "function setv(e,v){try{e.focus();}catch(x){}e.value=String(v);fire(e,'change');fire(e,'keyup');fire(e,'blur');}",
    "function optionText(o){return n(o&&(o.text||o.innerText||o.value)||'');}",
    "function classLabel(s){var m=n((s.name||'')+' '+(s.id||'')+' '+(s.className||''));if(m.indexOf('CLASSIFICACAO')>=0)return true;var p=s;for(var d=0;p&&d<5;d++,p=p.parentNode){if(String(p.tagName||'').toUpperCase()==='TR'&&n(p.innerText||p.textContent||'').indexOf('CLASSIFICACAO')>=0)return true;}return false;}",
    "var selects=document.getElementsByTagName('select'),cls=null,clsIndex=-1,depositCandidates=[];for(var si=0;si<selects.length;si++){var ss=selects[si],oi=-1,exact=-1;for(var sj=0;sj<ss.options.length;sj++){var ot=optionText(ss.options[sj]);if(ot==='DEPOSITO')exact=sj;if(ot.indexOf('DEPOSITO')>=0&&oi<0)oi=sj;}var foundIndex=exact>=0?exact:oi;if(foundIndex>=0){depositCandidates.push({select:ss,index:foundIndex});if(classLabel(ss)){cls=ss;clsIndex=foundIndex;break;}}}if(!cls&&depositCandidates.length===1){cls=depositCandidates[0].select;clsIndex=depositCandidates[0].index;}",
    "if(!cls||clsIndex<0)return {ok:false,stage:'classification',diag:'Menu Classificação com opção Depósito não encontrado; menus='+selects.length+' candidatos='+depositCandidates.length};",
    "var currentOption=cls.options[cls.selectedIndex];if(optionText(currentOption).indexOf('DEPOSITO')<0){cls.selectedIndex=clsIndex;fire(cls,'change');fire(cls,'blur');return {ok:false,stage:'classification_changed',diag:'Classificação selecionada como Depósito; aguardando atualização do formulário.'};}",
    "function eligible(e){var tp=n(e.type||'text');return tp==='TEXT'||tp===''||tp==='NUMBER'||tp==='TEL'||tp==='SEARCH';}",
    "var all=document.getElementsByTagName('input'),txt=[];for(var i=0;i<all.length;i++)if(eligible(all[i]))txt.push(all[i]);",
    "var dateIdx=-1;for(var j=0;j<txt.length;j++){var v=String(txt[j].value||'');if(/^\\d{1,2}\\/\\d{1,2}\\/\\d{4}$/.test(v)){dateIdx=j;break;}}",
    "if(dateIdx<0){for(var k=0;k<txt.length-1;k++){var a=String(txt[k].value||''),b=String(txt[k+1].value||'');if((a.indexOf('/')>=0||b.indexOf('/')>=0)&&k+11<txt.length){dateIdx=k;break;}}}",
    "if(dateIdx<0||dateIdx+11>=txt.length){var valsNow=[];for(var d=0;d<txt.length&&d<24;d++)valsNow.push(String(txt[d].value||''));return {ok:false,stage:'anchor',diag:'Inputs texto='+txt.length+' valores='+valsNow.join(',')};}",
    "var p=[txt[dateIdx],txt[dateIdx+1]],w=[txt[dateIdx+2],txt[dateIdx+3]],dep=[txt[dateIdx+4],txt[dateIdx+5]],op=[txt[dateIdx+10],txt[dateIdx+11]];",
    "setv(p[0],vals.dateFrom);setv(p[1],vals.dateTo);",
    "setv(w[0],vals.warehouse);setv(w[1],vals.warehouse);",
    "setv(dep[0],vals.deposit);setv(dep[1],vals.deposit);",
    "setv(op[0],vals.operationFrom);setv(op[1],vals.operationTo);",
    "function meta(e){return n((e.value||'')+' '+(e.innerText||e.textContent||'')+' '+(e.title||'')+' '+(e.alt||'')+' '+(e.name||'')+' '+(e.id||'')+' '+(e.src||'')+' '+(e.href||''));}",
    "var view=null,tags=['input','button','a','img'];for(var ti=0;ti<tags.length&&!view;ti++){var ns=document.getElementsByTagName(tags[ti]);for(var ni=0;ni<ns.length;ni++){var m=meta(ns[ni]);if(m.indexOf('VISUALIZAR')>=0){view=ns[ni];break;}}}",
    "if(!view)return {ok:false,stage:'action',diag:'Filtros preenchidos; botão Visualizar não encontrado.'};",
    "var finalClass=cls.options[cls.selectedIndex];if(optionText(finalClass).indexOf('DEPOSITO')<0)return {ok:false,stage:'classification',diag:'Classificação não permaneceu em Depósito antes de Visualizar.'};",
    "try{view.click();return {ok:true,stage:'clicked'};}catch(x){try{view.fireEvent('onclick');return {ok:true,stage:'clicked'};}catch(y){try{if(view.form){view.form.submit();return {ok:true,stage:'submitted'};}}catch(z){}}}",
    "return {ok:false,stage:'action',diag:'Visualizar localizado, mas não foi possível acionar.'};"
  ].join("");

  const hs = await handles();
  let diagnostics = [];
  let classificationChanged = false;
  for (let i = hs.length - 1; i >= 0; i--) {
    try {
      await switchWindow(hs[i]);
      const found = await findInFrames(async function () {
        const result = await execute(script, [vals]);
        if (result && result.ok) return true;
        if (result && result.stage === "classification_changed") {
          classificationChanged = true;
          return true;
        }
        if (result && result.diag) diagnostics.push(result.stage + ": " + result.diag);
        return false;
      }, 8);
      if (classificationChanged) {
        await sleep(700);
        return false;
      }
      if (found) return true;
    } catch (e) {
      diagnostics.push(String(e && e.message || e));
    }
  }
  throw new Error("Não foi possível executar os filtros do 02.05.01. " + diagnostics.filter(Boolean).slice(0,6).join(" || "));
}

function csvControlScript(mode) {
  return [
    "function n(s){return String(s||'').replace(/\\s+/g,' ').replace(/^\\s+|\\s+$/g,'').toUpperCase();}",
    "function attr(e,k){try{return e.getAttribute(k)||'';}catch(x){return '';}}",
    "function hasCsv(e){var v=[e.value,e.innerText,e.textContent,e.title,e.alt,e.name,e.id,attr(e,'aria-label'),attr(e,'title')];for(var j=0;j<v.length;j++){var t=n(v[j]);if(/(^|[^A-Z0-9])CSV([^A-Z0-9]|$)/.test(t))return true;}return false;}",
    "function handler(e){return e.onclick||e.onmouseup||e.onmousedown||attr(e,'onclick')||attr(e,'onmouseup')||attr(e,'onmousedown');}",
    "function target(e){var p=e;for(var d=0;p&&d<5;d++,p=p.parentNode){var tag=String(p.tagName||'').toUpperCase();if(tag==='A'||tag==='INPUT'||tag==='BUTTON'||p.href||attr(p,'href')||handler(p))return p;}return null;}",
    "function visible(e){try{var r=e.getBoundingClientRect();if((r.right-r.left)<=0||(r.bottom-r.top)<=0)return false;}catch(x){}try{var s=e.currentStyle;if(s&&(s.display==='none'||s.visibility==='hidden'))return false;}catch(y){}return true;}",
    "var tags=['input','button','a','img','object','embed','span','td','div','label','font'],matches=[];",
    "function add(e){if(!hasCsv(e))return;var c=target(e);if(!c||!visible(c))return;for(var k=0;k<matches.length;k++)if(matches[k]===c)return;matches.push(c);}",
    "for(var ti=0;ti<tags.length;ti++){var a=document.getElementsByTagName(tags[ti]);for(var i=0;i<a.length;i++)add(a[i]);}",
    "try{if(document.all)for(var ai=0;ai<document.all.length;ai++)add(document.all[ai]);}catch(x){}",
    "for(var mi=0;mi<matches.length;mi++){var e=matches[mi],tag=String(e.tagName||'').toUpperCase(),href=e.href||attr(e,'href'),onclick=attr(e,'onclick')||attr(e,'onmouseup')||attr(e,'onmousedown');",
    mode === "focus"
      ? "try{if(!e.focus)return null;try{e.scrollIntoView(false);}catch(y){}e.focus();return {ok:true,tag:tag,href:href,onclick:onclick,html:e.outerHTML||'',element:e};}catch(x){return null;}"
      : "return {tag:tag,href:href,onclick:onclick,html:e.outerHTML||''};",
    "}",
    "return null;"
  ].join("");
}

async function csvDescriptor() {
  const script = csvControlScript("describe");
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
  const script = csvControlScript("focus");
  const hs = await handles();
  for (let i = hs.length - 1; i >= 0; i--) {
    try {
      await switchWindow(hs[i]);
      let clicked = null;
      const found = await findInFrames(async function () {
        const result = await execute(script);
        if (result && result.ok) clicked = result;
        return !!clicked;
      }, 8);
      if (found) {
        clicked.activation = "tecla Enter no botão CSV em foco";
        return clicked;
      }
    } catch {}
  }
  throw new Error("Botão CSV não encontrado nos quadros do Promax.");
}

async function cookieHeader() {
  let result;
  try { result = await wd("GET", "/cookie", null, 10000); }
  catch { result = null; }
  if (typeof result === "string") {
    try { result = JSON.parse(result); }
    catch {
      if (/^[^;=\s]+=[^;]*(?:;\s*[^;=\s]+=[^;]*)*$/.test(result)) return result;
      result = null;
    }
  }
  const list = Array.isArray(result) ? result
    : result && Array.isArray(result.cookies) ? result.cookies
    : result && Array.isArray(result.value) ? result.value
    : result && result.name && result.value != null ? [result]
    : null;
  if (!list) return String(await execute("return document.cookie||'';") || "");
  return list.filter(function (c) { return c && c.name && c.value != null; })
    .map(function (c) { return c.name + "=" + c.value; }).join("; ");
}

function wininetCookieHeader(url) {
  if (process.platform !== "win32") return "";
  const script = path.join(os.tmpdir(), "agente-puxada-ie-cookies.ps1");
  fs.writeFileSync(script, [
    "$ErrorActionPreference='Stop'",
    "$u=[Console]::In.ReadToEnd().Trim()",
    "Add-Type -TypeDefinition @'",
    "using System; using System.Text; using System.Runtime.InteropServices;",
    "public static class AgentIeCookies {",
    "  [DllImport(\"wininet.dll\", CharSet=CharSet.Unicode, SetLastError=true, EntryPoint=\"InternetGetCookieExW\")]",
    "  public static extern bool Get(string url, string name, StringBuilder data, ref uint size, uint flags, IntPtr reserved);",
    "}",
    "'@",
    "$size=[uint32]0",
    "[void][AgentIeCookies]::Get($u,$null,$null,[ref]$size,8192,[IntPtr]::Zero)",
    "if($size -gt 0 -and $size -lt 65536){",
    "  $data=New-Object -TypeName System.Text.StringBuilder -ArgumentList ([int]$size+1)",
    "  if([AgentIeCookies]::Get($u,$null,$data,[ref]$size,8192,[IntPtr]::Zero)){[Console]::Out.Write($data.ToString())}",
    "}"
  ].join("\r\n"), "utf8");
  try {
    const result = childProcess.spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script],
      { input: url, encoding: "utf8", timeout: 9000, windowsHide: true, maxBuffer: 131072 });
    return result.status === 0 ? String(result.stdout || "").trim() : "";
  } catch { return ""; }
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

const CSV_EXCEL_FORM_SCRIPT = [
  "var e=document.getElementsByName('GerExecl')[0],f=(e&&e.form)?e.form:(document.all&&document.all.form1);",
  "if(!e||!f||!f.elements)return {ok:false,reason:'botão CSV/formulário não encontrado'};",
  "function snapFields(){var fields=[];for(var i=0;i<f.elements.length;i++){var x=f.elements[i],name=String(x.name||''),type=String(x.type||'').toLowerCase();if(!name||x.disabled||type==='button'||type==='submit'||type==='reset'||type==='file')continue;if((type==='checkbox'||type==='radio')&&!x.checked)continue;if(type==='select-multiple'){for(var j=0;j<x.options.length;j++)if(x.options[j].selected)fields.push([name,String(x.options[j].value)]);}else fields.push([name,String(x.value==null?'':x.value)]);}return fields;}",
  "var states=[];for(var si=0;si<f.elements.length;si++){var se=f.elements[si];states.push({e:se,value:se.value,checked:se.checked,selectedIndex:se.selectedIndex});}",
  "var oldAction=String(f.action||''),oldMethod=String(f.method||''),oldTarget=String(f.target||''),oldSubmit=f.submit,oldOpen=window.open,submitCalled=false,opens=[],hooked=false,openHooked=false,callError='';",
  "try{f.submit=function(){submitCalled=true;};hooked=(f.submit!==oldSubmit);}catch(x){}",
  "try{window.open=function(){var a=[];for(var i=0;i<arguments.length;i++)a.push(String(arguments[i]==null?'':arguments[i]));opens.push(a);return {focus:function(){},close:function(){},document:{open:function(){},write:function(){},close:function(){}}};};openHooked=true;}catch(x){}",
  "var excel='';try{excel=(typeof Excel==='function')?String(Excel):String(e.getAttribute('onclick')||'');}catch(x){}",
  "if(!hooked){try{window.open=oldOpen;}catch(x){}return {ok:false,reason:'não foi possível interceptar form.submit',excel:excel.slice(0,1400)};}",
  "try{if(typeof Excel==='function')Excel.call(e);else if(typeof e.onclick==='function')e.onclick();else{var code=e.getAttribute('onclick');if(code)(new Function(code)).call(e);}}catch(x){callError=String(x&&x.message||x);}",
  "var out={ok:true,action:String(f.action||document.location.href),referer:String(document.location.href),method:String(f.method||'POST'),enctype:String(f.enctype||''),target:String(f.target||''),fields:snapFields(),submit_called:submitCalled,opens:opens,excel:excel.slice(0,1400),call_error:callError,submit_hooked:hooked,open_hooked:openHooked};",
  "try{f.action=oldAction;f.method=oldMethod;f.target=oldTarget;}catch(x){}",
  "for(var ri=0;ri<states.length;ri++){var st=states[ri];try{st.e.value=st.value;}catch(x){}try{if(typeof st.checked!=='undefined')st.e.checked=st.checked;}catch(x){}try{if(typeof st.selectedIndex==='number')st.e.selectedIndex=st.selectedIndex;}catch(x){}}",
  "try{f.submit=oldSubmit;}catch(x){}try{window.open=oldOpen;}catch(x){}",
  "return out;"
].join("");

const CSV_FORM_SCRIPT = [
  "var f=document.all&&document.all.form1;",
  "if(!f||!f.elements)return {ok:false,reason:'form1 não encontrado no quadro CSV'};",
  "var opcao=document.all.opcao,opcaorelat=document.all.opcaorelat;",
  "if(!opcao||!opcaorelat)return {ok:false,reason:'campos opcao/opcaorelat não encontrados'};",
  "opcao.value='88';opcaorelat.value='3';",
  "var fields=[];for(var i=0;i<f.elements.length;i++){var e=f.elements[i],name=String(e.name||''),type=String(e.type||'').toLowerCase();if(!name||e.disabled||type==='button'||type==='submit'||type==='reset'||type==='file')continue;if((type==='checkbox'||type==='radio')&&!e.checked)continue;if(type==='select-multiple'){for(var j=0;j<e.options.length;j++)if(e.options[j].selected)fields.push([name,String(e.options[j].value)]);}else fields.push([name,String(e.value==null?'':e.value)]);}",
  "return {ok:true,action:String(f.action||document.location.href),referer:String(document.location.href),method:String(f.method||'POST'),enctype:String(f.enctype||''),fields:fields};"
].join("");

const CSV_BROWSER_DOWNLOAD_SCRIPT = [
  "var form=arguments[0],done=function(r){window.__codexCsvJob=r;};window.__codexCsvJob={pending:true};",
  "var params=[];for(var i=0;i<form.fields.length;i++)params.push(encodeURIComponent(form.fields[i][0])+'='+encodeURIComponent(form.fields[i][1]));",
  "var method=String(form.method||'POST').toUpperCase(),url=String(form.action);",
  "if(method==='GET')url+=(url.indexOf('?')<0?'?':'&')+params.join('&');",
  "var x=new XMLHttpRequest();x.open(method,url,true);x.responseType='arraybuffer';x.timeout=30000;",
  "if(method==='POST')x.setRequestHeader('Content-Type','application/x-www-form-urlencoded');",
  "x.onerror=function(){done({error:'XHR_NETWORK'});};x.ontimeout=function(){done({error:'XHR_TIMEOUT'});};",
  "x.onload=function(){try{var bytes=new Uint8Array(x.response),chunks=[];for(var j=0;j<bytes.length;j+=8192){var end=Math.min(j+8192,bytes.length),s='';for(var k=j;k<end;k++)s+=String.fromCharCode(bytes[k]);chunks.push(s);}done({status:x.status,type:x.getResponseHeader('Content-Type')||'',base64:btoa(chunks.join(''))});}catch(e){done({error:'XHR_DECODE: '+String(e.message||e)});}};",
  "try{x.send(method==='POST'?params.join('&'):null);}catch(e){done({error:'XHR_SEND: '+String(e.message||e)});}return {started:true};"
].join("");

async function browserFormResponse(form) {
  const started = await execute(CSV_BROWSER_DOWNLOAD_SCRIPT, [form]);
  if (!started || !started.started) throw new Error("CSV_BROWSER_EXPORT: navegador não iniciou a exportação.");
  const result = await waitUntil(async function () {
    const state = await execute("return window.__codexCsvJob||{error:'XHR_STATE_MISSING'};");
    return state && !state.pending ? state : null;
  }, 40000, 600);
  if (!result || result.error) throw new Error("CSV_BROWSER_EXPORT: " + String(result && result.error || "resposta vazia"));
  return {
    response: { ok: result.status >= 200 && result.status < 300, status: result.status,
      headers: { get: function () { return result.type || ""; } } },
    bytes: Buffer.from(result.base64 || "", "base64")
  };
}

async function directFormDownload(form, rootDir, validateCsv) {
  if (!form || !form.ok) throw new Error("CSV_FORM_INVALID: " + String(form && form.reason || "formulário indisponível"));
  const referer = new URL(form.referer);
  const url = new URL(form.action, referer);
  if (url.protocol !== "https:" || url.origin !== referer.origin) throw new Error("CSV_FORM_INVALID: destino de exportação fora do Promax.");
  const method = String(form.method || "POST").toUpperCase();
  const enctype = String(form.enctype || "application/x-www-form-urlencoded").toLowerCase();
  if (method !== "GET" && method !== "POST") throw new Error("CSV_FORM_INVALID: método " + method + ".");
  if (method === "POST" && enctype.indexOf("application/x-www-form-urlencoded") < 0) throw new Error("CSV_FORM_INVALID: codificação " + enctype + ".");
  const params = new URLSearchParams();
  for (const field of form.fields || []) params.append(String(field[0]), String(field[1]));
  if (method === "GET") {
    for (const [name, value] of params) url.searchParams.append(name, value);
  }
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 18000);
  let response;
  let bytes;
  let cookieSource = "nenhum";
  try {
    const wininetCookies = wininetCookieHeader(referer.toString());
    const sessionCookies = wininetCookies || await cookieHeader();
    cookieSource = wininetCookies ? "WinINet" : sessionCookies ? "driver" : "nenhum";
    response = await fetch(url.toString(), {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Cookie: sessionCookies,
        Referer: referer.toString(),
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/131 Safari/537.36",
        ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
      },
      ...(method === "POST" ? { body: params.toString() } : {})
    });
    bytes = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    throw new Error("CSV_FORM_NETWORK: " + String(error && error.message || error));
  } finally {
    clearTimeout(timer);
  }
  const contentType = String(response.headers.get("content-type") || "");
  if (!response.ok) throw new Error("CSV_FORM_HTTP: HTTP " + response.status + "; tipo=" + contentType + ".");
  if (bytes.length < 50) throw new Error("CSV_FORM_EMPTY: resposta de " + bytes.length + " bytes; tipo=" + contentType + ".");
  const head = bytes.subarray(0, Math.min(bytes.length, 350)).toString("latin1");
  if (/html/i.test(contentType) || /^\s*(?:<!doctype|<html)/i.test(head)) {
    const safeText = head.replace(/https?:\/\/[^\s<>"']+/gi, "[URL]")
      .replace(/<[^>]*>/g, " ").replace(/\b[A-Za-z0-9_-]{18,}\b/g, "[valor]")
      .replace(/\s+/g, " ").trim().slice(0, 170);
    const responsePath = new URL(response.url || url.toString()).pathname;
    const fieldNames = (form.fields || []).map(function (x) { return String(x[0]); }).slice(0, 25).join(",");
    throw new Error("CSV_FORM_HTML: HTTP " + response.status + "; cookies=" + cookieSource + "; destino=" + responsePath +
      "; bytes=" + bytes.length + "; campos=" + fieldNames + "; texto=" + safeText + ".");
  }
  const dir = path.join(rootDir, "downloads");
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "020501_" + Date.now() + ".csv.inf");
  fs.writeFileSync(target, bytes);
  try {
    if (typeof validateCsv === "function") validateCsv(target);
  } catch (error) {
    fs.rmSync(target, { force: true });
    throw new Error("CSV_FORM_FORMAT: " + (error && error.message ? error.message : String(error)) + "; tipo=" + contentType + "; bytes=" + bytes.length + ".");
  }
  return target;
}

function downloadDirs() {
  const home = os.homedir();
  const list = [
    path.join(home, "Downloads"),
    path.join(home, "Documents", "Downloads"),
    path.join(home, "Documents"),
    path.join(home, "Desktop"),
    path.resolve(__dirname, "..", "downloads")
  ];
  const cloudDirs = [process.env.OneDrive, process.env.OneDriveCommercial].filter(Boolean);
  for (const cloudDir of cloudDirs) list.push(path.join(cloudDir, "Downloads"), cloudDir);
  const edgeUserData = path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "Microsoft", "Edge", "User Data");
  try {
    const profiles = fs.readdirSync(edgeUserData).filter(name => name === "Default" || /^Profile \d+$/.test(name));
    for (const profile of profiles) {
      try {
        const prefs = JSON.parse(fs.readFileSync(path.join(edgeUserData, profile, "Preferences"), "utf8"));
        const configured = prefs && prefs.download && prefs.download.default_directory;
        if (configured) list.push(String(configured).replace(/%([^%]+)%/g, function (_, name) { return process.env[name] || _; }));
      } catch {}
    }
  } catch {}
  return list.filter(function (p, i, a) { return p && a.indexOf(p) === i && fs.existsSync(p); });
}

function newestCandidate(sinceMs) {
  let found = null;
  for (const dir of downloadDirs()) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const name of names) {
      if (!/\.inf$|\.csv$/i.test(name)) continue;
      const full = path.join(dir, name);
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      if (!st.isFile() || st.mtimeMs < sinceMs - 2000 || st.size < 50) continue;
      if (!found || st.mtimeMs > found.mtimeMs) found = { path: full, mtimeMs: st.mtimeMs, size: st.size };
    }
  }
  return found;
}

function recentDownloadNames(sinceMs) {
  const found = [];
  for (const dir of downloadDirs()) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const name of names) {
      if (!/\.inf$|\.csv$/i.test(name)) continue;
      try {
        const st = fs.statSync(path.join(dir, name));
        if (st.isFile() && st.mtimeMs >= sinceMs - 2000) found.push(name);
      } catch {}
    }
  }
  return Array.from(new Set(found)).slice(0, 6);
}

function sendAltS() {
  const vbs = path.join(os.tmpdir(), "agente-puxada-save.vbs");
  fs.writeFileSync(vbs, [
    "On Error Resume Next",
    "Set sh = CreateObject(\"WScript.Shell\")",
    "WScript.Sleep 500",
    "ok = sh.AppActivate(\"Salvar como\")",
    "If Not ok Then ok = sh.AppActivate(\"Save As\")",
    "If Not ok Then ok = sh.AppActivate(\"Download de Arquivo\")",
    "If Not ok Then ok = sh.AppActivate(\"File Download\")",
    "If Not ok Then ok = sh.AppActivate(\"Movimentação do Estoque\")",
    "If Not ok Then ok = sh.AppActivate(\"Microsoft Edge\")",
    "WScript.Sleep 500",
    "sh.SendKeys \"%s\"",
    "WScript.Sleep 300"
  ].join("\r\n"), "utf8");
  childProcess.execFileSync("wscript.exe", [vbs], { windowsHide: true, timeout: 5000 });
}

function sendEnter() {
  const vbs = path.join(os.tmpdir(), "agente-puxada-csv-enter.vbs");
  fs.writeFileSync(vbs, [
    "On Error Resume Next",
    "Set sh = CreateObject(\"WScript.Shell\")",
    "WScript.Sleep 300",
    "ok = sh.AppActivate(\"Movimentação do Estoque\")",
    "If Not ok Then ok = sh.AppActivate(\"Microsoft Edge\")",
    "WScript.Sleep 250",
    "sh.SendKeys \"{ENTER}\"",
    "WScript.Sleep 250"
  ].join("\r\n"), "utf8");
  childProcess.execFileSync("wscript.exe", [vbs], { windowsHide: true, timeout: 5000 });
}


function captureExcelWorkbook(rootDir, validateCsv) {
  if (process.platform !== "win32") return { path: "", diagnostic: "excel-com: não Windows" };
  const dir = path.join(rootDir, "downloads");
  fs.mkdirSync(dir, { recursive: true });
  const token = Date.now().toString();
  const target = path.join(dir, "020501_excel_" + token + ".csv.inf");
  const vbs = path.join(os.tmpdir(), "agente-puxada-excel-" + token + ".vbs");
  const q = function (value) { return '"' + String(value).replace(/"/g, '""') + '"'; };
  const lines = [
    "Option Explicit",
    "On Error Resume Next",
    "Dim target: target=" + q(target),
    "Dim xl, deadline, wb, ws, used, r, c, rows, cols, rmax, cmax, sample, score, bestScore, bestRows, bestCols, bestBook, bestName, bestSheet, v, line, stm",
    "Set xl=Nothing",
    "deadline=DateAdd(\"s\",18,Now)",
    "Do",
    "  Err.Clear",
    "  Set xl=GetObject(, \"Excel.Application\")",
    "  If Err.Number=0 Then Exit Do",
    "  Set xl=Nothing",
    "  WScript.Sleep 750",
    "Loop While Now < deadline",
    "If xl Is Nothing Then WScript.Echo \"excel-not-running\": WScript.Quit 3",
    "bestScore=-1",
    "For Each wb In xl.Workbooks",
    "  For Each ws In wb.Worksheets",
    "    Err.Clear",
    "    Set used=ws.UsedRange",
    "    If Err.Number=0 Then",
    "      rows=used.Rows.Count: cols=used.Columns.Count",
    "      If rows>5000 Then rows=5000",
    "      If cols>80 Then cols=80",
    "      If rows>=2 And cols>=2 Then",
    "        rmax=rows: If rmax>25 Then rmax=25",
    "        cmax=cols: If cmax>30 Then cmax=30",
    "        sample=\"\"",
    "        For r=1 To rmax",
    "          For c=1 To cmax",
    "            v=CStr(used.Cells(r,c).Text)",
    "            If Len(v)>0 Then sample=sample & \" \" & UCase(v)",
    "          Next",
    "        Next",
    "        score=0",
    "        If InStr(sample,\"FORNEC\")>0 Then score=score+1",
    "        If InStr(sample,\"DOCUM\")>0 Or InStr(sample,\"DOCUMENTO\")>0 Then score=score+1",
    "        If InStr(sample,\"ITEM\")>0 Then score=score+1",
    "        If InStr(sample,\"DESCRI\")>0 Or InStr(sample,\"PRODUTO\")>0 Then score=score+1",
    "        If InStr(sample,\"UNIDADE\")>0 Or InStr(sample,\"UNID\")>0 Or InStr(sample,\"UND\")>0 Then score=score+1",
    "        If InStr(sample,\"OPER\")>0 Then score=score+1",
    "        If InStr(sample,\"QTDE\")>0 Or InStr(sample,\"QTD\")>0 Or InStr(sample,\"QUANTIDADE\")>0 Then score=score+1",
    "        If score>bestScore Then",
    "          bestScore=score: bestRows=rows: bestCols=cols: bestBook=CStr(wb.Name): bestName=CStr(ws.Name): Set bestSheet=ws",
    "        End If",
    "      End If",
    "    End If",
    "  Next",
    "Next",
    "If bestScore<5 Or bestSheet Is Nothing Then WScript.Echo \"excel-report-sheet-not-found;score=\" & bestScore: WScript.Quit 4",
    "Set stm=CreateObject(\"ADODB.Stream\")",
    "If Err.Number<>0 Then WScript.Echo \"excel-adodb-unavailable\": WScript.Quit 5",
    "stm.Type=2: stm.Charset=\"utf-8\": stm.Open",
    "For r=1 To bestRows",
    "  line=\"\"",
    "  For c=1 To bestCols",
    "    v=CStr(bestSheet.Cells(r,c).Text)",
    "    If (Len(v)=0 Or (Len(v)>0 And Len(Replace(v,\"#\",\"\"))=0)) And Not IsEmpty(bestSheet.Cells(r,c).Value2) Then v=CStr(bestSheet.Cells(r,c).Value2)",
    "    v=Replace(v,Chr(34),Chr(34)&Chr(34))",
    "    If c>1 Then line=line & \";\"",
    "    line=line & Chr(34) & v & Chr(34)",
    "  Next",
    "  stm.WriteText line & vbCrLf",
    "Next",
    "stm.SaveToFile target,2",
    "stm.Close",
    "If Err.Number<>0 Then WScript.Echo \"excel-save-error:\" & Err.Number & \":\" & Err.Description: WScript.Quit 6",
    "WScript.Echo \"excel-captured;workbook=\" & bestBook & \";sheet=\" & bestName & \";rows=\" & bestRows & \";cols=\" & bestCols & \";score=\" & bestScore",
    "WScript.Quit 0"
  ];
  fs.writeFileSync(vbs, lines.join("\r\n"), "utf8");

  let diagnostic = "";
  try {
    diagnostic = String(childProcess.execFileSync("cscript.exe", ["//B","//nologo",vbs],
      { encoding:"utf8", windowsHide:true, timeout:23000, maxBuffer:262144 }) || "").trim();
  } catch (error) {
    diagnostic = String(error && error.stdout || "").trim();
    if (!diagnostic) diagnostic = "excel-com-error: " + String(error && (error.code || error.status || error.message) || "erro");
  }
  try { fs.rmSync(vbs, { force: true }); } catch {}

  if (!fs.existsSync(target)) return { path: "", diagnostic: diagnostic || "excel-workbook-not-found" };
  try {
    if (typeof validateCsv === "function") validateCsv(target);
    return { path: target, diagnostic: diagnostic || "excel-captured" };
  } catch (error) {
    try { fs.rmSync(target, { force: true }); } catch {}
    return { path: "", diagnostic: (diagnostic ? diagnostic + "; " : "") + "excel-invalid: " + (error && error.message ? error.message : String(error)) };
  }
}

function clickCsvPhysical() {
  const vbs = path.join(os.tmpdir(), "agente-puxada-click-csv.vbs");
  fs.writeFileSync(vbs, [
    "On Error Resume Next",
    "Set sh = CreateObject(\"WScript.Shell\")",
    "ok = sh.AppActivate(\"Movimenta\")",
    "If Not ok Then ok = sh.AppActivate(\"Promax\")",
    "If Not ok Then ok = sh.AppActivate(\"Microsoft Edge\")",
    "If Not ok Then WScript.Quit 2",
    "WScript.Sleep 300",
    "sh.SendKeys \"%c\"",
    "WScript.Sleep 350",
    "WScript.Echo \"alt-c-sent\""
  ].join("\r\n"), "utf8");
  try {
    return String(childProcess.execFileSync("cscript.exe", ["//nologo", vbs],
      { encoding: "utf8", windowsHide: true, timeout: 5000 }) || "").trim() || "sem resposta";
  } catch (error) {
    return "falhou: " + (error && error.status != null ? "código " + error.status : String(error && error.code || "processo"));
  }
}

function startNativeCsv(rootDir) {
  const token=Date.now().toString();
  const ps=path.join(os.tmpdir(),'agente-csv-'+token+'.ps1');
  const report=path.join(os.tmpdir(),'agente-csv-'+token+'.json');
  const vbs=path.join(os.tmpdir(),'agente-csv-'+token+'.vbs');
  const dir=path.join(rootDir,'downloads');fs.mkdirSync(dir,{recursive:true});
  const target=path.join(dir,'020501_'+token+'.csv.inf');
  const quote=s=>"'"+s.replace(/'/g,"''")+"'";
  const script=String.raw`
$ErrorActionPreference='Stop'
$steps=New-Object System.Collections.Generic.List[string]
function Log([string]$s){$steps.Add($s);ConvertTo-Json -InputObject @($steps.ToArray()) -Compress | Set-Content -LiteralPath $out -Encoding UTF8}
try {
 Log 'helper-boot'
 Add-Type -AssemblyName UIAutomationClient
 Add-Type -AssemblyName UIAutomationTypes
 Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public static class CsvMouse {
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
[DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);
}
'@
 [void][CsvMouse]::SetProcessDPIAware()
 $root=[System.Windows.Automation.AutomationElement]::RootElement
 $button=[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button)
 function Windows {return $root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)}
 function Click($b,$w) {
   [void][CsvMouse]::SetForegroundWindow([IntPtr]$w.Current.NativeWindowHandle)
   Start-Sleep -Milliseconds 200
   $r=$b.Current.BoundingRectangle
   if($b.Current.IsOffscreen -or $r.Width -lt 2){throw 'control-offscreen'}
   [void][CsvMouse]::SetCursorPos([int]($r.Left+$r.Width/2),[int]($r.Top+$r.Height/2))
   [CsvMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
   Start-Sleep -Milliseconds 90
   [CsvMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
 }
 Log 'helper-started'
 $clicked=$false
 foreach($w in (Windows)) {
   if($w.Current.Name -notmatch 'Movimenta|Promax'){continue}
   $bs=$w.FindAll([System.Windows.Automation.TreeScope]::Descendants,$button)
   foreach($b in $bs){if($b.Current.Name -match '^\s*C\s*S\s*V\s*$'){Click $b $w;Log 'csv-clicked';$clicked=$true;break}}
   if($clicked){break}
 }
 if(!$clicked){Log 'csv-button-not-found';exit}
 $saved=$false
 for($i=0;$i -lt 24;$i++){
   Start-Sleep -Milliseconds 800
   foreach($w in (Windows)){
     $title=$w.Current.Name
     if($title -notmatch 'Movimenta|Promax|Salvar|Save|Download|Microsoft Edge'){continue}
     $bs=$w.FindAll([System.Windows.Automation.TreeScope]::Descendants,$button)
     if($i -eq 3){Log ('buttons: '+((@($bs | ForEach-Object {$_.Current.Name}) | Select-Object -First 30)-join '|'))}
     if($title -match 'Salvar como|Save As'){
       $edits=$w.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit))
       $filled=$false
       foreach($e in $edits){if($e.Current.AutomationId -eq '1001' -or $e.Current.Name -match 'Nome do arquivo|File name'){$vp=$e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern);$vp.SetValue($target);$filled=$true;break}}
       if(!$filled){Log 'save-filename-not-found';continue}
       foreach($b in $bs){if($b.Current.Name -match '^&?(Salvar|Save)$'){Click $b $w;Log 'save-as-confirmed';$saved=$true;break}}
     }elseif($title -match 'Download|Arquivo|File'){
       foreach($b in $bs){if($b.Current.Name -match '^&?(Salvar|Save)$'){Click $b $w;Log 'download-save-clicked';break}}
     }
     if($saved){break}
   }
   if($saved -or (Test-Path -LiteralPath $target)){break}
 }
 Log 'helper-finished'
}catch{Log ('helper-error: '+$_.Exception.GetType().Name+': '+$_.Exception.Message)}
`;
  fs.writeFileSync(ps,'\uFEFF$out='+quote(report)+'\r\n$target='+quote(target)+'\r\n'+script,'utf8');
  const stderr=report+'.stderr';
  fs.writeFileSync(report,JSON.stringify(['launching-helper']),'utf8');
  let helper;
  try {
    const psExe=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    helper=childProcess.spawn(psExe,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',ps],
      {windowsHide:true,stdio:'ignore'});
    helper.on('error',error=>fs.appendFileSync(stderr,'spawn: '+String(error.code||error.message)));
    helper.on('exit',code=>fs.appendFileSync(stderr,' exit='+String(code)));
  } catch(error) {
    fs.appendFileSync(stderr,'launch: '+String(error.code||error.message||error));
  }
  return {target,report,diagnostic:function(){
    let status='',error='';
    try{status=fs.readFileSync(report,'utf8').replace(/^\uFEFF/,'').slice(0,1300);}catch{}
    try{error=fs.readFileSync(stderr,'utf8').slice(0,1200);}catch{}
    if(helper && helper.exitCode===null)helper.kill();
    return status+'; '+error;
  }};
}

async function clickCsvWebDriver() {
  const element=await wd('POST','/element',{using:'css selector',value:'button[name="GerExecl"]'},10000);
  const id=element && (element['element-6066-11e4-a52e-4f735466cecf']||element.ELEMENT);
  if(!id)throw new Error('CSV_WEBDRIVER_ELEMENT: referência indisponível');
  await wd('POST','/element/'+encodeURIComponent(id)+'/click',{},20000);
}
function saveCsvDialog(target) {
  const file=path.join(os.tmpdir(),'agente-csv-save-dialog.vbs');
  const keys=target.replace(/[+^%~(){}\[\]]/g,c=>'{'+c+'}').replace(/"/g,'""');
  const lines=[
    'On Error Resume Next',
    'Set sh=CreateObject("WScript.Shell")',
    'saved=False',
    'For i=1 To 12',
    ' ok=sh.AppActivate("Salvar como")',
    ' If Not ok Then ok=sh.AppActivate("Save As")',
    ' If ok Then',
    '  WScript.Sleep 200',
    '  sh.SendKeys "%n"',
    '  sh.SendKeys "^a"',
    '  sh.SendKeys "'+keys+'"',
    '  sh.SendKeys "{ENTER}"',
    '  WScript.Echo "save-as-confirmed"',
    '  WScript.Quit 0',
    ' End If',
    ' ok=sh.AppActivate("Download de Arquivo")',
    ' If Not ok Then ok=sh.AppActivate("File Download")',
    ' If ok Then',
    '  sh.SendKeys "%s"',
    '  saved=True',
    ' End If',
    ' WScript.Sleep 600',
    'Next',
    'If saved Then WScript.Echo "download-save-sent" Else WScript.Echo "no-save-dialog"'
  ];
  fs.writeFileSync(file,lines.join('\r\n'),'utf8');
  try{return String(childProcess.execFileSync('cscript.exe',['//B','//nologo',file],{encoding:'utf8',windowsHide:true,timeout:12000})).trim();}
  catch(e){return 'save-dialog-error: '+String(e.code||e.status);}
}

async function browserDownload(rootDir, validateCsv) {
  const since = Date.now();
  const dirNative=path.join(rootDir,'downloads');fs.mkdirSync(dirNative,{recursive:true});

  // 0) Foca o botão CSV no frame correto e envia ENTER como entrada real do
  // Windows. Se o Promax abrir a exportação direto no Excel, leia a planilha
  // pela automação COM e gere o CSV localmente, sem depender do navegador.
  let enterDiag = "";
  let excelDiag = "";
  try {
    await clickCsv();
    sendEnter();
    enterDiag = "csv-focado+enter-enviado";
    await sleep(1400);
    const excel = captureExcelWorkbook(rootDir, validateCsv);
    excelDiag = excel.diagnostic;
    if (excel.path) return excel.path;
  } catch (error) {
    enterDiag = "enter-falhou: " + String(error && error.message || error);
  }

  // 1) O próprio botão do Promax declara accessKey=C. Use Alt+C via WScript.Shell
  // como gesto de teclado real e, em seguida, Alt+S/Salvar para o fluxo legado.
  const targetHotkey=path.join(dirNative,'020501_'+Date.now()+'_hotkey.csv.inf');
  let hotkeyDiag=clickCsvPhysical();
  await sleep(1200);
  let hotkeySave=saveCsvDialog(targetHotkey);
  try { sendAltS(); hotkeySave += '; alt-s-sent'; } catch (e) { hotkeySave += '; alt-s-error='+String(e&&e.message||e); }

  try {
    const byHotkey = await waitUntil(async function () {
      const c = fs.existsSync(targetHotkey)
        ? {path:targetHotkey,size:fs.statSync(targetHotkey).size,mtimeMs:fs.statSync(targetHotkey).mtimeMs}
        : newestCandidate(since);
      if (!c || c.size < 50) return null;
      try {
        if (typeof validateCsv === "function") validateCsv(c.path);
        return c.path;
      } catch { return null; }
    }, 15000, 600);
    if (byHotkey) return byHotkey;
  } catch {}

  // 2) Clique físico por UI Automation + captura de Salvar/Save As.
  const physical = startNativeCsv(rootDir);
  try {
    const physicalCandidate = await waitUntil(async function () {
      if (!fs.existsSync(physical.target)) return null;
      const st = fs.statSync(physical.target);
      if (!st.isFile() || st.size < 50) return null;
      try {
        if (typeof validateCsv === "function") validateCsv(physical.target);
        return physical.target;
      } catch {
        return null;
      }
    }, 28000, 700);
    if (physicalCandidate) return physicalCandidate;
  } catch {}
  const physicalDiagnostic = physical.diagnostic();

  // 3) Acionamento legado pela sessão WebDriver/Excel().
  const control = await clickCsv();
  const targetNative=path.join(dirNative,'020501_'+Date.now()+'.csv.inf');
  let legacyActivation='';
  try {
    legacyActivation=String(await execute("var e=document.getElementsByName('GerExecl')[0];if(!e)return 'elemento ausente';try{var fn=(typeof Excel==='function')?Excel:((typeof e.onclick==='function')?function(){return e.onclick();}:null);if(!fn)return 'handler ausente';setTimeout(function(){try{fn.call(e);}catch(x){}},0);return 'Excel()/onclick agendado';}catch(x){return 'erro '+String(x.message||x);}"));
  } catch (e) {
    legacyActivation='erro '+String(e&&e.message||e);
  }
  await sleep(1800);
  try {
    const excel = captureExcelWorkbook(rootDir, validateCsv);
    excelDiag = excel.diagnostic || excelDiag;
    if (excel.path) return excel.path;
  } catch (e) {
    excelDiag = "excel-com-falhou: " + String(e && e.message || e);
  }
  let saveResult=saveCsvDialog(targetNative);
  if (!fs.existsSync(targetNative)) {
    try {
      await clickCsvWebDriver();
      await sleep(1500);
      const retrySave=saveCsvDialog(targetNative);
      saveResult=legacyActivation+'; fallback WebDriver; '+retrySave;
    } catch (e) {
      saveResult=legacyActivation+'; fallback WebDriver falhou: '+String(e&&e.message||e)+'; '+saveResult;
    }
  } else {
    saveResult=legacyActivation+'; '+saveResult;
  }
  const native={target:targetNative,diagnostic:function(){return saveResult;}};
  control.activation='Alt+C físico + UIAutomation + Excel()/onclick + fallback WebDriver';

  let previous = null;
  let stable = 0;
  let lastCandidateError = "";
  const checked = new Set();
  const candidate = await waitUntil(async function () {
    const c = fs.existsSync(native.target) ? {path:native.target,size:fs.statSync(native.target).size,mtimeMs:fs.statSync(native.target).mtimeMs} : newestCandidate(since);
    if (!c) return null;
    if (previous && previous.path === c.path && previous.size === c.size) stable++;
    else stable = 0;
    previous = c;
    if (stable < 2) return null;
    const key = c.path + "|" + c.size;
    if (checked.has(key)) return null;
    checked.add(key);
    try {
      if (typeof validateCsv === "function") validateCsv(c.path);
      return c;
    } catch (error) {
      lastCandidateError = error && error.message ? error.message : String(error);
      return null;
    }
  }, 45000, 700).catch(function () {
    const names = recentDownloadNames(since);
    const detail = names.length ? " Arquivos recentes: " + names.join(", ") + "." : " Nenhum arquivo .csv/.inf novo apareceu nas pastas configuradas do navegador.";
    const controlDetail = control ? " Controle CSV acionado: " + String(control.tag || "?") + "; ação=" + String(control.activation || "?") + "; elemento=" + String(control.html || "").replace(/\s+/g, " ").slice(0, 350) + "." : "";
    const reason = lastCandidateError ? " Último arquivo rejeitado: " + lastCandidateError : "";
    throw new Error("CSV_EXPORT_TIMEOUT: o relatório foi gerado, mas o agente não localizou um CSV válido para importar." + detail + controlDetail + reason + "; Enter=" + enterDiag + "; ExcelCOM=" + excelDiag + "; Hotkey="+hotkeyDiag+" / "+hotkeySave+"; UIAutomation=" + physicalDiagnostic + "; Windows=" + native.diagnostic());
  });

  const target = path.join(dirNative, "020501_" + Date.now() + ".csv.inf");
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

async function currentReportMatches(job) {
  const from = formatDate(job.date_from);
  const to = formatDate(job.date_to);
  const hs = await handles();
  for (let i = hs.length - 1; i >= 0; i--) {
    try {
      await switchWindow(hs[i]);
      await topFrame();
      const text = normalized(await bodyText()).replace(/\s+/g, " ");
      const flat = text.replace(/[^A-Z0-9/]+/g, " ").replace(/\s+/g, " ");
      if (text.indexOf("MOVIMENTACAO DO ESTOQUE") < 0) continue;
      if (text.indexOf("OPCAO") < 0 || text.indexOf("DEPOSITO") < 0) continue;
      if (text.indexOf(from) < 0 || text.indexOf(to) < 0) continue;
      if (!/OPERACAO\s+251\s+A\s+314/.test(flat)) continue;
      return true;
    } catch {}
  }
  return false;
}

function normalizeReportHeader(value) {
  return String(value == null ? "" : value)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim().toUpperCase();
}

function decodeHtmlCell(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, function (_, n) { const x=Number(n); return Number.isFinite(x) ? String.fromCharCode(x) : _; })
    .replace(/\s+/g, " ").trim();
}

function reportHeaderScore(row) {
  const j = row.map(normalizeReportHeader).join("|");
  let score = 0;
  if (j.indexOf("FORNEC") >= 0) score++;
  if (j.indexOf("DOCUM") >= 0 || j.indexOf("DOCUMENTO") >= 0) score++;
  if (j.indexOf("ITEM") >= 0) score++;
  if (j.indexOf("DESCRICAO") >= 0 || j.indexOf("PRODUTO") >= 0) score++;
  if (j.indexOf("UNIDADE") >= 0 || j.indexOf("UND") >= 0 || j.indexOf("UNID") >= 0) score++;
  if (j.indexOf("OPER") >= 0) score++;
  if (j.indexOf("QTDE") >= 0 || j.indexOf("QTD") >= 0 || j.indexOf("QUANTIDADE") >= 0) score++;
  return score;
}

function parseReportTableFromHtml(html) {
  const source = String(html || "");
  const tableBlocks = source.match(/<table\b[\s\S]*?<\/table>/gi) || [source];
  let best = null;
  for (let ti=0; ti<tableBlocks.length; ti++) {
    const trs = tableBlocks[ti].match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    const rows = [];
    for (const tr of trs) {
      const cells = [];
      const re = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
      let m;
      while ((m = re.exec(tr))) cells.push(decodeHtmlCell(m[1]));
      if (cells.length) rows.push(cells);
    }
    if (!rows.length) continue;
    let headerIndex=-1, score=0;
    for (let i=0;i<rows.length;i++) {
      const sc=reportHeaderScore(rows[i]);
      if (sc>score) { score=sc; headerIndex=i; }
    }
    if (headerIndex<0 || score<5) continue;
    const headers=rows[headerIndex];
    const data=[];
    for (let i=headerIndex+1;i<rows.length;i++) {
      const row=rows[i];
      if (!row.some(function(v){return String(v||"").trim()!=="";})) continue;
      if (reportHeaderScore(row)>=5) continue;
      data.push(row);
    }
    if (data.length && (!best || data.length>best.rows.length)) best={headers:headers,rows:data,score:score,table:ti};
  }
  return best;
}

function htmlExportDiagnostic(html) {
  const source=String(html||"");
  const title=(source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||"";
  const body=(source.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)||[])[1]||source;
  const text=decodeHtmlCell(body).slice(0,360);
  const forms=[];
  source.replace(/<form\b([^>]*)>/gi,function(_,attrs){
    const action=(attrs.match(/\baction\s*=\s*["']([^"']*)["']/i)||[])[1]||"";
    const method=(attrs.match(/\bmethod\s*=\s*["']([^"']*)["']/i)||[])[1]||"";
    forms.push((method||"GET")+":"+action);
    return _;
  });
  const refs=[];
  const re=/\b(?:href|src|action)\s*=\s*["']([^"']+)["']/gi;let m;
  while((m=re.exec(source))&&refs.length<12){const v=String(m[1]||"");if(/csv|excel|download|arquivo|export|relat|\.inf\b/i.test(v))refs.push(v);}
  const scriptSnips=[];
  const sr=/<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  while((m=sr.exec(source))&&scriptSnips.length<5){
    const x=String(m[1]||"").replace(/\s+/g," ").trim();
    if(/csv|excel|download|arquivo|window\.open|location|opcao|relat/i.test(x))scriptSnips.push(x.slice(0,260));
  }
  return ("title="+decodeHtmlCell(title).slice(0,100)+"; text="+text+
    "; forms="+forms.slice(0,5).join("|")+"; refs="+refs.join("|")+"; scripts="+scriptSnips.join(" || "))
    .replace(/https?:\/\/[^\s"'<>|]+/gi,"[URL]")
    .replace(/\b[A-Za-z0-9_-]{22,}\b/g,"[valor]")
    .slice(0,850);
}

function writeReportHtmlCsv(html, rootDir, validateCsv) {
  const extracted=parseReportTableFromHtml(html);
  if (!extracted) throw new Error("HTML_REPORT_EMPTY: tabela de dados não encontrada na resposta HTML.");
  function quote(value){return '"' + String(value == null ? "" : value).replace(/"/g,'""') + '"';}
  const lines=[extracted.headers].concat(extracted.rows).map(function(row){return row.map(quote).join(";");});
  const dir=path.join(rootDir,"downloads");fs.mkdirSync(dir,{recursive:true});
  const target=path.join(dir,"020501_html_"+Date.now()+".csv.inf");
  fs.writeFileSync(target,"\uFEFF"+lines.join("\r\n"),"utf8");
  try {
    if (typeof validateCsv === "function") validateCsv(target);
  } catch (error) {
    fs.rmSync(target,{force:true});
    throw new Error("HTML_REPORT_FORMAT: "+(error&&error.message?error.message:String(error))+
      "; linhas="+extracted.rows.length+"; score="+extracted.score+"; tabela="+extracted.table+".");
  }
  return target;
}

async function captureAuthenticatedCsv(rootDir, validateCsv) {
  await clickCsv(); // deixa o WebDriver no frame que possui o botão CSV
  let probe = null;
  try { probe = await execute(CSV_EXCEL_FORM_SCRIPT); } catch {}
  let form = probe && probe.ok ? probe : await execute(CSV_FORM_SCRIPT);
  if (!form || !form.ok) {
    const why = probe && (probe.reason || probe.call_error) ? String(probe.reason || probe.call_error) : "formulário indisponível";
    throw new Error("CSV_CAPTURE_FORM: " + why);
  }

  // Se o Excel() abriu uma URL explícita, ela é uma pista mais fiel que o action
  // original do form. Use-a somente quando for http(s) do mesmo host.
  if (Array.isArray(form.opens) && form.opens.length && form.opens[0] && form.opens[0][0]) {
    try {
      const opened = new URL(String(form.opens[0][0]), form.referer);
      const ref = new URL(form.referer);
      if (opened.origin === ref.origin && /^https?:$/.test(opened.protocol)) {
        form.action = opened.toString();
        form.method = "GET";
        form.fields = [];
      }
    } catch {}
  }

  const action = new URL(form.action, form.referer);
  if (action.origin !== new URL(form.referer).origin) throw new Error("CSV_CAPTURE_ORIGIN");
  const result = await execute([
    "var f=arguments[0],params=[],x,transport='XMLHTTP';",
    "for(var i=0;i<f.fields.length;i++)params.push(encodeURIComponent(f.fields[i][0])+'='+encodeURIComponent(f.fields[i][1]));",
    "var method=String(f.method||'GET').toUpperCase(),url=String(f.action),body=params.join('&').replace(/%20/g,'+');",
    "if(method==='GET'&&body)url+=(url.indexOf('?')<0?'?':'&')+body;",
    "try{x=new XMLHttpRequest();transport='XMLHttpRequest';}catch(e){x=new ActiveXObject('Microsoft.XMLHTTP');}",
    "try{x.open(method,url,false);if(method==='POST')x.setRequestHeader('Content-Type','application/x-www-form-urlencoded');x.send(method==='POST'?body:null);}catch(e){return {error:'send',code:e.number||0,transport:transport};}",
    "var r={status:x.status,type:x.getResponseHeader('Content-Type')||'',disposition:x.getResponseHeader('Content-Disposition')||'',transport:transport,method:method,url:url};",
    "try{r.bytes=new VBArray(x.responseBody).toArray();}catch(e){r.text=x.responseText;}",
    "return r;"
  ].join(''), [form]);
  if (!result || result.error) throw new Error("CSV_CAPTURE_TRANSPORT: " + JSON.stringify(result || {}));

  const bytes = Array.isArray(result.bytes) ? Buffer.from(result.bytes) : Buffer.from(result.text || '', 'utf8');
  const utf8 = bytes.toString('utf8');
  const raw = ((utf8.match(/\uFFFD/g)||[]).length <= 2) ? utf8 : bytes.toString('latin1');
  const head = raw.slice(0, 4096);
  const looksHtml = /<html|<script|<!doctype|<form/i.test(head);
  if (result.status === 200 && looksHtml) {
    try {
      return writeReportHtmlCsv(raw, rootDir, validateCsv);
    } catch (htmlError) {
      result.html_parse_error = htmlError && htmlError.message ? htmlError.message : String(htmlError);
    }
  }
  if (result.status !== 200 || looksHtml) {
    const reason = /inv.lida|login|senha|usuario/i.test(head) ? 'possível sessão inválida' : 'resposta não CSV';
    const htmlDiag = looksHtml ? htmlExportDiagnostic(raw) : "";
    const current = new URL(form.referer);
    const fields = form.fields || [];
    const diagnostic = fields.filter(function(f){return /^(SessionID|SubSessionID|opcao|ppopcao|opcaorelat|call)$/i.test(f[0]);})
      .map(function(f){return /session/i.test(f[0]) ? f[0]+':len='+String(f[1]).length+',urlMatch='+(current.searchParams.get(f[0])===f[1])+',actionMatch='+(action.searchParams.get(f[0])===f[1]) : f[0]+'='+String(f[1]).replace(/[^0-9]/g,'');});
    const excel = String(form.excel || "").replace(/\s+/g," ").replace(/https?:\/\/[^\s"'<>]+/gi,"[URL]").slice(0,900);
    let clue = "";
    const fm = raw.match(/function\s+Excel[\s\S]{0,1000}/i);
    if (fm) clue = fm[0].replace(/\s+/g," ").replace(/https?:\/\/[^\s"'<>]+/gi,"[URL]").slice(0,900);
    if (!clue) clue = head.replace(/<[^>]*>/g," ").replace(/\b[A-Za-z0-9_-]{18,}\b/g,"[valor]").replace(/\s+/g," ").trim().slice(0,500);
    throw new Error("CSV_HTML_DIAG: "+htmlDiag+"; parse="+String(result.html_parse_error||"não analisado")+"; HTTP="+result.status+"; "+reason+"; bytes="+bytes.length+"; tipo="+String(result.type||"")+"; submit="+String(form.submit_called)+"; "+diagnostic.join(';')+"; Excel="+excel.slice(0,180)+"; resposta="+clue.slice(0,180));
  }

  const dir=path.join(rootDir,'downloads');fs.mkdirSync(dir,{recursive:true});
  const target=path.join(dir,'020501_'+Date.now()+'.csv.inf');fs.writeFileSync(target,bytes);
  if(typeof validateCsv==='function')validateCsv(target);
  return target;
}

async function domReportDownload(rootDir, validateCsv) {
  const script = [
    "function clean(s){return String(s||'').replace(/\\r?\\n/g,' ').replace(/\\s+/g,' ').replace(/^\\s+|\\s+$/g,'');}",
    "function norm(s){return clean(s).replace(/[ÁÀÂÃÄ]/gi,'A').replace(/[ÉÈÊË]/gi,'E').replace(/[ÍÌÎÏ]/gi,'I').replace(/[ÓÒÔÕÖ]/gi,'O').replace(/[ÚÙÛÜ]/gi,'U').replace(/Ç/gi,'C').toUpperCase();}",
    "function matrix(tb){var out=[],sp=[];for(var r=0;r<tb.rows.length;r++){var row=[],used={},c=0;for(var si=0;si<sp.length;si++){if(sp[si]&&sp[si].left>0){row[si]=sp[si].text;used[si]=true;sp[si].left--;if(sp[si].left<=0)sp[si]=null;}}var cells=tb.rows[r].cells;for(var j=0;j<cells.length;j++){while(used[c])c++;var cell=cells[j],v=clean(cell.innerText||cell.textContent||''),cs=parseInt(cell.colSpan||1,10)||1,rs=parseInt(cell.rowSpan||1,10)||1;for(var k=0;k<cs;k++){var vv=k===0?v:'';row[c+k]=vv;used[c+k]=true;if(rs>1)sp[c+k]={text:vv,left:rs-1};}c+=cs;}out.push(row);}return out;}",
    "function score(row){var a=[],i;for(i=0;i<row.length;i++)a.push(norm(row[i]));var s=0,j=a.join('|');if(j.indexOf('FORNEC')>=0)s++;if(j.indexOf('DOCUM')>=0||j.indexOf('DOCUMENTO')>=0)s++;if(j.indexOf('ITEM')>=0)s++;if(j.indexOf('DESCRICAO')>=0||j.indexOf('PRODUTO')>=0)s++;if(j.indexOf('UNIDADE')>=0||j.indexOf('UND')>=0||j.indexOf('UNID')>=0)s++;if(j.indexOf('OPER')>=0)s++;if(j.indexOf('QTDE')>=0||j.indexOf('QTD')>=0||j.indexOf('QUANTIDADE')>=0)s++;return s;}",
    "var tables=document.getElementsByTagName('table'),best=null;",
    "for(var ti=0;ti<tables.length;ti++){var g=matrix(tables[ti]),hi=-1,hs=0;for(var r=0;r<g.length;r++){var sc=score(g[r]);if(sc>hs){hs=sc;hi=r;}}if(hi<0||hs<5)continue;var header=g[hi],rows=[];for(var rr=hi+1;rr<g.length;rr++){var row=g[rr],non=0;for(var cc=0;cc<row.length;cc++)if(clean(row[cc]))non++;if(!non)continue;if(score(row)>=5)continue;rows.push(row);}if(rows.length&&(!best||rows.length>best.rows.length))best={headers:header,rows:rows,score:hs,table:ti};}",
    "return best;"
  ].join("");

  let extracted = null;
  const hs = await handles();
  for (let i = hs.length - 1; i >= 0 && !extracted; i--) {
    try {
      await switchWindow(hs[i]);
      await findInFrames(async function () {
        const candidate = await execute(script);
        if (candidate && Array.isArray(candidate.headers) && Array.isArray(candidate.rows) && candidate.rows.length) {
          extracted = candidate;
          return true;
        }
        return false;
      }, 8);
    } catch {}
  }

  if (!extracted) {
    throw new Error("DOM_REPORT_EMPTY: tabela do relatório não encontrada em nenhuma janela/quadro do Promax.");
  }
  function quoteCsv(value) {
    return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
  }
  const lines = [extracted.headers].concat(extracted.rows).map(function (row) {
    return row.map(quoteCsv).join(";");
  });
  const dir = path.join(rootDir, "downloads");
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "020501_dom_" + Date.now() + ".csv.inf");
  fs.writeFileSync(target, "\uFEFF" + lines.join("\r\n"), "utf8");
  try {
    if (typeof validateCsv === "function") validateCsv(target);
  } catch (error) {
    fs.rmSync(target, { force: true });
    throw new Error("DOM_REPORT_FORMAT: " + (error && error.message ? error.message : String(error)) +
      "; linhas=" + extracted.rows.length + "; score=" + extracted.score + "; tabela=" + extracted.table + ".");
  }
  return target;
}


function parsePlainReportRows(text) {
  const lines = String(text || "").split(/\r?\n/);
  const rows = [];

  function digits(v) { return /^\d+$/.test(String(v || "")); }
  function qty(v) { return /^[0-9][0-9.,/]*$/.test(String(v || "")); }
  function date(v) { return /^\d{2}\/\d{2}\/\d{4}$/.test(String(v || "")); }

  for (const raw of lines) {
    const line = String(raw || "").replace(/\u00a0/g, " ").trim();
    if (!line || line.length < 12) continue;
    const tokens = line.split(/\s+/);
    if (tokens.length < 7) continue;

    // Procura a operação do fim para o começo. Isso evita confundir números
    // presentes na descrição do produto (ex.: 269 ML) com a operação.
    let opIdx = -1;
    for (let i = tokens.length - 2; i >= 4; i--) {
      if (!/^\d{3}$/.test(tokens[i])) continue;
      const op = Number(tokens[i]);
      if (op < 251 || op > 314) continue;
      let hasQty = false;
      for (let j = i + 1; j < tokens.length; j++) {
        if (qty(tokens[j])) { hasQty = true; break; }
      }
      if (hasQty) { opIdx = i; break; }
    }
    if (opIdx < 0) continue;

    // FORNEC / DOCUM / ITEM são numéricos. Aceita no máximo duas colunas
    // auxiliares antes deles, mas evita confundir depósito/linha com fornecedor.
    let base = -1;
    for (let i = 0; i <= Math.min(2, opIdx - 5); i++) {
      if (digits(tokens[i]) && digits(tokens[i + 1]) && digits(tokens[i + 2]) && String(tokens[i]).length >= 4) {
        base = i;
        break;
      }
    }
    if (base < 0) continue;

    const supplier = tokens[base];
    const invoice = tokens[base + 1];
    const sku = tokens[base + 2];
    const unitIdx = opIdx - 1;
    if (unitIdx <= base + 2) continue;
    const unit = tokens[unitIdx];
    const name = tokens.slice(base + 3, unitIdx).join(" ").trim();
    if (!name) continue;

    let quantity = "";
    let reportDate = "";
    for (let j = opIdx + 1; j < tokens.length; j++) {
      const v = tokens[j];
      if (!reportDate && date(v)) reportDate = v;
      if (!quantity && qty(v)) quantity = v;
    }
    if (!quantity) continue;

    rows.push({
      supplier, invoice, sku, name, unit,
      operation: tokens[opIdx],
      quantity,
      date: reportDate
    });
  }
  return rows;
}

async function textReportDownload(rootDir, validateCsv) {
  const script = "return document.body ? String(document.body.innerText||document.body.textContent||'') : '';";
  const hs = await handles();
  const candidates = [];

  for (let i = hs.length - 1; i >= 0; i--) {
    try {
      await switchWindow(hs[i]);
      await findInFrames(async function () {
        const text = await execute(script);
        if (!text || String(text).length < 120) return false;
        const n = normalized(text).replace(/\s+/g, " ");
        if (n.indexOf("MOVIMENTACAO DO ESTOQUE") >= 0 ||
            (n.indexOf("FORNEC") >= 0 && n.indexOf("DOCUM") >= 0 && n.indexOf("ITEM") >= 0)) {
          candidates.push(String(text));
        }
        return false;
      }, 8);
    } catch {}
  }

  if (!candidates.length) throw new Error("TEXT_REPORT_EMPTY: texto do relatório não encontrado.");

  let best = [];
  let bestText = "";
  for (const text of candidates) {
    const rows = parsePlainReportRows(text);
    if (rows.length > best.length) { best = rows; bestText = text; }
  }
  if (!best.length) {
    const sample = String(bestText || candidates[0] || "").replace(/\s+/g, " ").slice(0, 500);
    throw new Error("TEXT_REPORT_PARSE_EMPTY: relatório visível, mas nenhuma linha foi reconhecida. amostra=" + sample);
  }

  function q(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }
  const lines = [
    ["FORNEC","DOCUM","ITEM","DESCRICAO","UNIDADE","OPERACAO","QTDE","DATA"]
  ];
  for (const r of best) {
    lines.push([r.supplier,r.invoice,r.sku,r.name,r.unit,r.operation,r.quantity,r.date]);
  }

  const dir = path.join(rootDir, "downloads");
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "020501_text_" + Date.now() + ".csv.inf");
  fs.writeFileSync(target, "\uFEFF" + lines.map(function (row) { return row.map(q).join(";"); }).join("\r\n"), "utf8");

  try {
    if (typeof validateCsv === "function") validateCsv(target);
  } catch (error) {
    try { fs.rmSync(target, { force: true }); } catch {}
    throw new Error("TEXT_REPORT_FORMAT: " + (error && error.message ? error.message : String(error)) + "; linhas=" + best.length + ".");
  }
  return target;
}

async function exportInNormalEdge(job, config, rootDir, validateCsv) {
  if (process.platform !== "win32" || !existingEdge.probe().homeWindows) {
    throw new Error("EDGE_HOME_NOT_FOUND");
  }
  const since = Date.now();
  const vals = {
    dateFrom: formatDate(job.date_from),
    dateTo: formatDate(job.date_to),
    warehouse: String(config.promax && config.promax.warehouse || job.warehouse || "1"),
    deposit: String(config.promax && config.promax.deposit || job.deposit || "1"),
    operationFrom: String(config.promax && config.promax.operationFrom || job.operation_from || "251"),
    operationTo: String(config.promax && config.promax.operationTo || job.operation_to || "314")
  };
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(vals.dateFrom) ||
      !/^\d{2}\/\d{2}\/\d{4}$/.test(vals.dateTo) ||
      !/^\d{1,4}$/.test(vals.warehouse) || !/^\d{1,4}$/.test(vals.deposit) ||
      vals.operationFrom !== "251" || vals.operationTo !== "314") {
    throw new Error("EDGE_FILTERS_UNSUPPORTED");
  }
  existingEdge.act("shortcut");
  await sleep(1800);
  existingEdge.act("filters", vals);
  await sleep(1600);
  // The report window is brought to the front by the native action. Export
  // through the visible CSV control, then accept Edge's legacy save prompt.
  await waitUntil(async function () {
    try { existingEdge.act("csv"); return true; }
    catch (error) { if (/csv-not-found/.test(String(error.message))) return false; throw error; }
  }, 60000, 1000).catch(function (error) {
    if (/Tempo esgotado/.test(String(error.message))) throw new Error("EDGE_CSV_NOT_FOUND_AFTER_FILTERS");
    throw error;
  });
  await sleep(1200);
  let saveStatus = "automatic";
  if (!newestCandidate(since)) {
    try { existingEdge.act("save"); saveStatus = "save-clicked"; } catch (error) {
      if (!/save-not-found/.test(String(error.message))) throw error;
      saveStatus = String(error.message).slice(0, 160);
    }
  }
  let prior = null, stable = 0;
  const candidate = await waitUntil(async function () {
    const current = newestCandidate(since);
    if (!current) return null;
    stable = prior && prior.path === current.path && prior.size === current.size ? stable + 1 : 0;
    prior = current;
    return stable >= 2 ? current : null;
  }, 25000, 700).catch(error => {
    if (/Tempo esgotado/.test(String(error.message)))
      throw new Error("EDGE_DOWNLOAD_TIMEOUT: " + saveStatus);
    throw error;
  });
  const source = candidate.path;
  const sourceText = fs.readFileSync(source, "latin1");
  if (/movimenta.{0,12}o do estoque/i.test(sourceText.slice(0,2000))) {
    const header = sourceText.slice(0,3500).replace(/\s+/g, " ");
    if (!header.includes(vals.dateFrom) || !header.includes(vals.dateTo) ||
        !/251\s+a\s+314/i.test(header) || !/dep.sito/i.test(header) ||
        !/entrega/i.test(header) ||
        !/mov\s+manual\s*:\s*n/i.test(header)) throw new Error("EDGE_REPORT_FILTER_MISMATCH");
  }
  const targetDir = path.join(rootDir, "downloads");
  fs.mkdirSync(targetDir, { recursive: true });
  const target = path.join(targetDir, "020501_normal_edge_" + Date.now() + ".csv.inf");
  fs.copyFileSync(source, target);
  try {
    if (typeof validateCsv === "function") validateCsv(target);
    return target;
  } catch (error) {
    fs.rmSync(target, { force: true });
    // Some Promax configurations save the legacy printable report with an
    // .inf extension. Parse the visible rows into the normal CSV schema.
    const body = fs.readFileSync(source, "latin1");
    const rows = parsePlainReportRows(body);
    if (!rows.length) throw error;
    const q = value => '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
    const table = [["FORNEC","DOCUM","ITEM","DESCRICAO","UNIDADE","OPERACAO","QTDE","DATA"]];
    for (const row of rows) table.push([row.supplier,row.invoice,row.sku,row.name,row.unit,row.operation,row.quantity,row.date]);
    fs.writeFileSync(target, "\uFEFF" + table.map(row => row.map(q).join(";")).join("\r\n"), "utf8");
    if (typeof validateCsv === "function") validateCsv(target);
    return target;
  }
}

async function export020501(job, config, rootDir, validateCsv) {
  try {
    const file = await exportInNormalEdge(job, config, rootDir, validateCsv);
    LAST_NORMAL_EDGE_STATUS = "success";
    NORMAL_EDGE_ATTEMPTED = false;
    return file;
  } catch (normalEdgeError) {
    const reason = String(normalEdgeError && normalEdgeError.message || normalEdgeError)
      .replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120);
    LAST_NORMAL_EDGE_STATUS = reason;
    LAST_READINESS_ERROR = "Janela normal do Edge: " + reason;
    throw new Error("EDGE_NORMAL_ONLY: " + (normalEdgeError && normalEdgeError.message ? normalEdgeError.message : String(normalEdgeError)));
  }
}

async function openCalibrationBrowser(config, rootDir) {
  await retireManagedSession(config, rootDir);
  const url = String(config.promax && config.promax.url || "https://imperio.promaxcloud.com.br").trim();
  const edge = edgePath();
  if (!edge) throw new Error("Microsoft Edge não encontrado.");
  try {
    const child = childProcess.spawn(edge, [url], { detached: true, stdio: "ignore" });
    child.unref();
    LAST_READINESS_ERROR = "Faça login no Promax na janela normal do Edge e mantenha-a aberta.";
    return true;
  } catch (e) {
    throw new Error("Não foi possível abrir o Promax no Edge normal: " + (e && e.message ? e.message : String(e)));
  }
}

module.exports = { isConfigured, readinessError, missingSelectors, openCalibrationBrowser, export020501, normalEdgeStatus: () => LAST_NORMAL_EDGE_STATUS };
