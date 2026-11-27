"use strict";
const fs=require("fs"),path=require("path");
const MONTHS=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DEFAULT_BASE_DIRECTORY="Y:\\{year}\\ARMAZÉM\\3.0 - Acuracidade do Inventário\\Acuracidade de Movimentação do Material do Armazém\\CONTAGEM de Estoque";
const DEFAULT_FALLBACK_DIRECTORY="\\\\192.168.1.48\\pilargestao$\\{year}\\ARMAZÉM\\3.0 - Acuracidade do Inventário\\Acuracidade de Movimentação do Material do Armazém\\CONTAGEM de Estoque";
const DEFAULT_DEPOSIT=Object.freeze({id:"6",countId:"6",sector:"DEVOLUÇÃO",label:"DEVOLUÇÃO",folder:"06 - Depósito DEVOLUÇÃO",warehouse:"1",areaFrom:"1",areaTo:"1"});
function dateParts(date){
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date||new Date());
 const x={};for(const p of parts)if(p.type!=="literal")x[p.type]=p.value;
 return{year:x.year,month:x.month,day:x.day,iso:x.year+"-"+x.month+"-"+x.day};
}
function buildPaths(base,iso,deposit){
 const d=String(iso||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!d)throw Error("Data inválida.");
 const m=Number(d[2]);if(m<1||m>12)throw Error("Mês inválido.");
 const item=Object.assign({},DEFAULT_DEPOSIT,deposit||{}),monthFolder=d[2]+". "+MONTHS[m-1];
 const baseName=d[3]+"."+d[2]+" - CONTAGEM "+item.label,monthDirectory=path.join(base,monthFolder);
 const depositDirectory=path.join(monthDirectory,item.folder),csvDirectory=path.join(depositDirectory,"CSV"),pdfDirectory=path.join(depositDirectory,"PDF");
 return{monthFolder,baseName,monthDirectory,depositDirectory,csvDirectory,pdfDirectory,
  csvFile:path.join(csvDirectory,baseName+".csv.inf"),pdfFile:path.join(pdfDirectory,baseName+".pdf"),
  completionFile:path.join(depositDirectory,".agent-count-"+d[1]+d[2]+d[3]+".json")};
}
function ensureDirectory(p,log,label){
 if(fs.existsSync(p)){if(!fs.statSync(p).isDirectory())throw Error("Não é uma pasta: "+p);return false;}
 fs.mkdirSync(p);if(log)log("Pasta criada: "+label+" · "+p);return true;
}
function ensureOutputDirectories(base,iso,deposit,log){
 if(!fs.existsSync(base)||!fs.statSync(base).isDirectory())throw Error("Pasta-base de contagens não acessível: "+base);
 const p=buildPaths(base,iso,deposit);
 ensureDirectory(p.monthDirectory,log,p.monthFolder);ensureDirectory(p.depositDirectory,log,p.depositDirectory);
 ensureDirectory(p.csvDirectory,log,"CSV");ensureDirectory(p.pdfDirectory,log,"PDF");return p;
}
function isUsableFile(file,format){
 try{const s=fs.statSync(file);if(!s.isFile()||s.size<50)return false;
  if(format==="pdf"){const fd=fs.openSync(file,"r"),b=Buffer.alloc(5),n=fs.readSync(fd,b,0,5,0);fs.closeSync(fd);return n===5&&b.toString("ascii")==="%PDF-";}
  return !/<html|<!doctype/i.test(fs.readFileSync(file).subarray(0,2000).toString("latin1"));
 }catch(_){return false;}
}
function pairExists(p){return isUsableFile(p.csvFile,"csv")&&isUsableFile(p.pdfFile,"pdf");}
function isVerifiedPair(p,selection){
 if(!pairExists(p))return false;
 try{
  const marker=JSON.parse(fs.readFileSync(p.completionFile,"utf8"));
  const csvSize=fs.statSync(p.csvFile).size,pdfSize=fs.statSync(p.pdfFile).size;
  return marker.schema===1 && marker.selectionVersion===2 &&
   marker.date===selection.date && marker.depositId===selection.depositId &&
   marker.countId===selection.countId && marker.sector===selection.sector &&
   marker.warehouse===selection.warehouse && marker.areaFrom===selection.areaFrom &&
   marker.areaTo===selection.areaTo && marker.csvSize===csvSize && marker.pdfSize===pdfSize;
 }catch(_){return false;}
}
function writeCompletionMarker(p,selection){
 const payload=Object.assign({schema:1,selectionVersion:2},selection,{
  csvSize:fs.statSync(p.csvFile).size,pdfSize:fs.statSync(p.pdfFile).size,
  savedAt:new Date().toISOString()
 });
 const tmp=p.completionFile+".incoming-"+process.pid+"-"+Date.now();
 const bak=p.completionFile+".backup-"+process.pid+"-"+Date.now();
 fs.writeFileSync(tmp,JSON.stringify(payload,null,2),"utf8");
 let backed=false;
 try{
  if(fs.existsSync(p.completionFile)){fs.renameSync(p.completionFile,bak);backed=true;}
  fs.renameSync(tmp,p.completionFile);
  if(backed)fs.unlinkSync(bak);
 }catch(e){
  try{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}catch(_){}
  if(backed&&!fs.existsSync(p.completionFile)){try{fs.renameSync(bak,p.completionFile);}catch(_){}}
  throw e;
 }
}
function lock(p){
 for(let i=0;i<2;i++){try{const fd=fs.openSync(p,"wx");fs.writeFileSync(fd,JSON.stringify({pid:process.pid,at:Date.now()}));return fd;}
  catch(e){if(e.code!=="EEXIST")throw e;try{if(Date.now()-fs.statSync(p).mtimeMs>45*60*1000){fs.unlinkSync(p);continue;}}catch(_){}return null;}}
 return null;
}
function atomicCopy(src,dst){
 const tmp=dst+".incoming-"+process.pid+"-"+Date.now(),bak=dst+".backup-"+process.pid+"-"+Date.now();
 fs.copyFileSync(src,tmp);let backed=false;
 try{if(fs.existsSync(dst)){fs.renameSync(dst,bak);backed=true;}fs.renameSync(tmp,dst);if(backed)fs.unlinkSync(bak);}
 catch(e){try{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}catch(_){}if(backed&&!fs.existsSync(dst)){try{fs.renameSync(bak,dst);}catch(_){}}throw e;}
}
function baseCandidates(config,year){
 const s=config.inventoryCounts||{},vals=[s.baseDirectory||process.env.AGENTE_LOGISTICA_CONTAGEM_PATH||DEFAULT_BASE_DIRECTORY,s.fallbackBaseDirectory||DEFAULT_FALLBACK_DIRECTORY];
 return [...new Set(vals.map(v=>String(v).replace(/\{year\}/g,year)))];
}
async function syncDaily(opts){
 opts=opts||{};const cfg=opts.config||{},settings=cfg.inventoryCounts||{},log=opts.log||function(){};
 if(settings.enabled===false)return{status:"disabled"};
 const edge=opts.existingEdge;if(!edge||!edge.desktopUnlocked||!edge.desktopUnlocked())return{status:"desktop-locked"};
 const idle=edge.idleMilliseconds?edge.idleMilliseconds():null;if(!opts.force&&(idle===null||idle<30000))return{status:"desktop-active"};
 const dt=dateParts(opts.now||new Date());if(!opts.promax||!(await opts.promax.isConfigured(cfg,opts.root)))return{status:"promax-not-ready"};
 const deposit=Object.assign({},DEFAULT_DEPOSIT,(settings.deposits||[]).find(x=>String(x.id)==="6")||{});
 const depositId=String(deposit.id||"6"),countId=String(deposit.countId||depositId);
 const warehouse=String(deposit.warehouse||settings.warehouse||"1");
 const areaFrom=String(deposit.areaFrom||settings.areaFrom||"1"),areaTo=String(deposit.areaTo||settings.areaTo||"1");
 const base=baseCandidates(cfg,dt.year).find(p=>{try{return fs.existsSync(p)&&fs.statSync(p).isDirectory();}catch(_){return false;}});
 if(!base)throw Error("A pasta CONTAGEM de Estoque não está acessível em Y: nem pelo compartilhamento da rede.");
 const p=ensureOutputDirectories(base,dt.iso,deposit,log),lockPath=path.join(p.depositDirectory,".agent-count-"+dt.iso.replace(/-/g,"")+".lock");
 const fd=lock(lockPath);if(fd===null)return{status:"another-computer-running"};
 try{
  // FORCE bypasses the idle gate, never a pair already proven to use the
  // current count-selection workflow. Old files without this marker are
  // regenerated once so an earlier unselected count cannot be treated as done.
  const selection={date:dt.iso,depositId:depositId,countId:countId,sector:String(deposit.sector||deposit.label),
    warehouse:warehouse,areaFrom:areaFrom,areaTo:areaTo};
  if(isVerifiedPair(p,selection))return{status:"already-saved",paths:p};
  if(pairExists(p))log("Arquivos anteriores sem confirmação da contagem selecionada serão regenerados.");
  log("Conciliação 02.11.01: setor "+deposit.sector+" · depósito "+depositId+" · contagem "+countId+" · "+dt.iso+".");
  const out=await opts.promax.exportInventoryCount({
   warehouse:warehouse,depositFrom:depositId,depositTo:depositId,
   areaFrom:areaFrom,areaTo:areaTo,countId:countId
  },cfg,opts.root);
  if(!out||!isUsableFile(out.csvPath,"csv")||!isUsableFile(out.pdfPath,"pdf"))throw Error("O Promax não entregou CSV e PDF válidos para a contagem 6.");
  atomicCopy(out.csvPath,p.csvFile);atomicCopy(out.pdfPath,p.pdfFile);
  writeCompletionMarker(p,selection);
  log("Contagem "+countId+" do setor "+deposit.sector+" salva em CSV e PDF: "+p.baseName+".");
  log("CSV: "+p.csvFile);log("PDF: "+p.pdfFile);
  return{status:"saved",paths:p};
 }finally{try{fs.closeSync(fd);}catch(_){}try{fs.unlinkSync(lockPath);}catch(_){}}
}
module.exports={dateParts,buildPaths,ensureOutputDirectories,isUsableFile,pairExists,isVerifiedPair,syncDaily};
