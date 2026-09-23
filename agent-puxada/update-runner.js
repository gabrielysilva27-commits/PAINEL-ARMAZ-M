const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const crypto = require("crypto");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : "";
}
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function pidAlive(pid){ try{ process.kill(Number(pid),0); return true; }catch{return false;} }
function safeTarget(value){
  const v=String(value||"").replace(/\\/g,"/").replace(/^\/+/, "");
  if(!v || v.split("/").some(p=>!p||p==="."||p==="..") || !/^(app|driver)\/[A-Za-z0-9._/-]+$/.test(v)) throw new Error("Destino inválido: "+value);
  return v;
}
function copyFile(src,dst){ fs.mkdirSync(path.dirname(dst),{recursive:true}); fs.copyFileSync(src,dst); }
function log(base,msg){
  try{
    const p=path.join(base,"data","update.log");
    fs.mkdirSync(path.dirname(p),{recursive:true});
    fs.appendFileSync(p,"["+new Date().toISOString()+"] "+msg+"\n");
  }catch{}
}
function sha256(p){return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");}
function restart(launcher,base){
  if(fs.existsSync(launcher)) childProcess.spawn(launcher,["--background"],{cwd:base,detached:true,windowsHide:true,stdio:"ignore"}).unref();
}

(async function(){
  const stage=arg("--stage"), base=arg("--base"), launcher=arg("--launcher"), version=arg("--version");
  const parent=Number(arg("--parent"));
  if(!stage||!base||!launcher||!version) process.exit(2);
  let applied=[], backup="", rolledBack=false;
  try{
    for(let i=0;i<120 && pidAlive(parent);i++) await sleep(250);

    const manifest=JSON.parse(fs.readFileSync(path.join(stage,"manifest.json"),"utf8"));
    const files=Array.isArray(manifest.files)?manifest.files:[];
    if(manifest.version!==version || !files.length) throw new Error("Manifesto inconsistente.");
    const seen=new Set();
    for(const f of files){
      const rel=safeTarget(f.target), source=path.join(stage,rel);
      if(seen.has(rel)||!/^[a-f0-9]{64}$/i.test(String(f.sha256||""))||sha256(source)!==f.sha256.toLowerCase()) throw new Error("Arquivo inválido: "+rel);
      seen.add(rel);
    }
    backup=path.join(base,"data","update-backup",Date.now()+"-"+version);
    fs.mkdirSync(backup,{recursive:true});

    const changedFiles=files.filter(f=>{
      const dst=path.join(base,safeTarget(f.target));
      return !fs.existsSync(dst)||sha256(dst)!==String(f.sha256).toLowerCase();
    });
    if(changedFiles.some(f=>String(f.target||"").startsWith("driver/"))){
      try{ childProcess.execFileSync("taskkill.exe",["/IM","IEDriverServer.exe","/F"],{windowsHide:true,stdio:"ignore"}); }catch{}
      await sleep(500);
    }

    for(const file of changedFiles){
      const rel=safeTarget(file.target), src=path.join(stage,rel), dst=path.join(base,rel), bak=path.join(backup,rel);
      const existed=fs.existsSync(dst);
      if(existed) copyFile(dst,bak);
      applied.push({rel,existed});
      copyFile(src,dst);
    }

    log(base,"Arquivos da versão "+version+" aplicados. Validando...");

    const node=path.join(base,"runtime","node.exe");
    const agent=path.join(base,"app","agent.js");
    const check=childProcess.spawnSync(node,[agent,"--check"],{
      cwd:path.join(base,"app"),
      windowsHide:true,
      timeout:60000,
      env:{...process.env,AGENTE_PUXADA_LAUNCHER:launcher,AGENTE_PUXADA_SKIP_UPDATE:"1"}
    });

    if(check.status!==0) throw new Error("Health check falhou: "+String(check.stderr||check.error||"").slice(0,500));

    fs.writeFileSync(path.join(base,"data","last-update.json"),JSON.stringify({version,updated_at:new Date().toISOString()},null,2),"utf8");
    fs.rmSync(stage,{recursive:true,force:true});
    log(base,"Atualização "+version+" validada com sucesso.");
    restart(launcher,base);
    process.exit(0);
  }catch(e){
    log(base||process.cwd(),"Falha no atualizador: "+(e&&e.stack||e));
    for(const x of applied.reverse()){
      try{const dst=path.join(base,x.rel),bak=path.join(backup,x.rel);if(x.existed) copyFile(bak,dst);else fs.rmSync(dst,{force:true});}
      catch(rollbackError){log(base,"Falha ao restaurar "+x.rel+": "+rollbackError.message);}
    }
    try{fs.writeFileSync(path.join(base,"data","last-update.json"),JSON.stringify({version,status:"failed",error:String(e.message||e),updated_at:new Date().toISOString()}));}catch{}
    try{if(launcher)restart(launcher,base||process.cwd());}catch{}
    process.exit(4);
  }
})();
