const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : "";
}
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function pidAlive(pid){ try{ process.kill(Number(pid),0); return true; }catch{return false;} }
function safeTarget(value){
  const v=String(value||"").replace(/\\/g,"/").replace(/^\/+/, "");
  if(!v || v.includes("..") || !/^(app|driver)\//.test(v)) throw new Error("Destino inválido: "+value);
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

(async function(){
  const stage=arg("--stage"), base=arg("--base"), launcher=arg("--launcher"), version=arg("--version");
  const parent=Number(arg("--parent"));
  if(!stage||!base||!launcher||!version) process.exit(2);
  try{
    for(let i=0;i<120 && pidAlive(parent);i++) await sleep(250);

    const manifest=JSON.parse(fs.readFileSync(path.join(stage,"manifest.json"),"utf8"));
    const files=Array.isArray(manifest.files)?manifest.files:[];
    const backup=path.join(base,"data","update-backup",Date.now()+"-"+version);
    fs.mkdirSync(backup,{recursive:true});

    if(files.some(f=>String(f.target||"").startsWith("driver/"))){
      try{ childProcess.execFileSync("taskkill.exe",["/IM","IEDriverServer.exe","/F"],{windowsHide:true,stdio:"ignore"}); }catch{}
      await sleep(500);
    }

    const applied=[];
    for(const file of files){
      const rel=safeTarget(file.target), src=path.join(stage,rel), dst=path.join(base,rel), bak=path.join(backup,rel);
      const existed=fs.existsSync(dst);
      if(existed) copyFile(dst,bak);
      copyFile(src,dst);
      applied.push({rel,existed});
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

    if(check.status!==0){
      log(base,"Validação falhou. Restaurando versão anterior.");
      for(const x of applied.reverse()){
        const dst=path.join(base,x.rel), bak=path.join(backup,x.rel);
        try{
          if(x.existed && fs.existsSync(bak)) copyFile(bak,dst);
          else fs.rmSync(dst,{force:true});
        }catch{}
      }
      childProcess.spawn(launcher,["--background"],{cwd:base,detached:true,windowsHide:true,stdio:"ignore"}).unref();
      process.exit(3);
    }

    fs.writeFileSync(path.join(base,"data","last-update.json"),JSON.stringify({version,updated_at:new Date().toISOString()},null,2),"utf8");
    fs.rmSync(stage,{recursive:true,force:true});
    log(base,"Atualização "+version+" validada com sucesso.");
    childProcess.spawn(launcher,["--background"],{cwd:base,detached:true,windowsHide:true,stdio:"ignore"}).unref();
    process.exit(0);
  }catch(e){
    log(base||process.cwd(),"Falha no atualizador: "+(e&&e.stack||e));
    try{ if(launcher) childProcess.spawn(launcher,["--background"],{cwd:base||process.cwd(),detached:true,windowsHide:true,stdio:"ignore"}).unref(); }catch{}
    process.exit(4);
  }
})();
