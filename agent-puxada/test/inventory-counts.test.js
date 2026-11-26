"use strict";
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path");
const inventory=require("../lib/inventory-counts");
const base=fs.mkdtempSync(path.join(os.tmpdir(),"inventory-counts-"));
(async function(){
 try{
  const now=new Date("2026-11-26T15:00:00.000Z");
  const p=inventory.buildPaths(base,"2026-11-26");
  assert.strictEqual(p.monthFolder,"11. Novembro");
  assert.strictEqual(p.baseName,"26.11 - CONTAGEM DEVOLUÇÃO");
  assert.strictEqual(path.basename(p.csvFile),"26.11 - CONTAGEM DEVOLUÇÃO.csv.inf");
  assert.strictEqual(path.basename(p.pdfFile),"26.11 - CONTAGEM DEVOLUÇÃO.pdf");
  const created=inventory.ensureOutputDirectories(base,"2026-11-26",null);
  for(const d of [created.monthDirectory,created.depositDirectory,created.csvDirectory,created.pdfDirectory])assert.ok(fs.statSync(d).isDirectory());
  assert.strictEqual(inventory.ensureOutputDirectories(base,"2026-11-26",null).monthDirectory,created.monthDirectory);

  let exports=0;
  const sourceDir=path.join(base,"source");fs.mkdirSync(sourceDir);
  const csvSource=path.join(sourceDir,"count.csv.inf"),pdfSource=path.join(sourceDir,"count.pdf");
  fs.writeFileSync(csvSource,"sku;produto\n"+ "123;Produto de teste\n".repeat(6));
  fs.writeFileSync(pdfSource,"%PDF-1.4\n"+ "conteudo de teste ".repeat(8));
  const opts={
    config:{inventoryCounts:{baseDirectory:base}},
    existingEdge:{desktopUnlocked:()=>true,idleMilliseconds:()=>0},
    promax:{isConfigured:async()=>true,exportInventoryCount:async()=>{exports++;return{csvPath:csvSource,pdfPath:pdfSource};}},
    root:base,now,log:()=>{}
  };
  const blocked=await inventory.syncDaily({...opts,force:false});
  assert.strictEqual(blocked.status,"desktop-active");
  assert.strictEqual(exports,0);

  const forced=await inventory.syncDaily({...opts,force:true});
  assert.strictEqual(forced.status,"saved");
  assert.strictEqual(exports,1);
  assert.ok(inventory.pairExists(created));

  const repeated=await inventory.syncDaily({...opts,force:true});
  assert.strictEqual(repeated.status,"already-saved");
  assert.strictEqual(exports,1);
  console.log("inventory-counts: FORCE + idle gate + idempotency OK");
 } finally {
  fs.rmSync(base,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
