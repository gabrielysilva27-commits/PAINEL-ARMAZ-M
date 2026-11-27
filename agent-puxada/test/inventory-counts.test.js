"use strict";
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path");
const inventory=require("../lib/inventory-counts");
const diagnostics=require("../lib/inventory-counts-diagnostics");
const base=fs.mkdtempSync(path.join(os.tmpdir(),"inventory-counts-"));
assert.strictEqual(
 diagnostics.inventoryCountErrorCode("EDGE_NATIVE_021101-filter-controls-not-found:count-column-header-or-rows:h=1:n=8:u=0:c=8:a=0:m=0"),
 "GRADE_H1N8U0C8A0M0"
);
assert.strictEqual(
 diagnostics.inventoryCountErrorCode("EDGE_NATIVE_021101-filter-controls-not-found:count-column-ambiguous:h=2:n=8:u=8:c=8:a=8:m=16"),
 "GRADE_H2N8U8C8A8M16"
);
assert.strictEqual(
 diagnostics.inventoryCountErrorCode("021101_PDF_DOWNLOAD_TIMEOUT: no-dialog; hotkey=alt-s-sent; recent=0; partial=0"),
 "DOWNLOAD_PDF_TIMEOUT_NO_DIALOG_ALT_S_SENT_N0_P0"
);
assert.strictEqual(
 diagnostics.inventoryCountErrorCode("021101_CSV_DOWNLOAD_TIMEOUT: no-dialog; hotkey=enter+alt-s-sent; recent=1; partial=1"),
 "DOWNLOAD_CSV_TIMEOUT_NO_DIALOG_ENTER_ALT_S_SENT_N1_P1"
);

(async function(){
 try{
  const now=new Date("2026-11-26T15:00:00.000Z");
  const p=inventory.buildPaths(base,"2026-11-26");
  assert.strictEqual(p.monthFolder,"11. Novembro");
  assert.strictEqual(p.baseName,"26.11 - CONTAGEM DEVOLUÇÃO");
  assert.strictEqual(path.basename(p.csvFile),"26.11 - CONTAGEM DEVOLUÇÃO.csv.inf");
  assert.strictEqual(path.basename(p.pdfFile),"26.11 - CONTAGEM DEVOLUÇÃO.pdf");
  assert.strictEqual(path.basename(p.completionFile),".agent-count-20261126.json");
  const created=inventory.ensureOutputDirectories(base,"2026-11-26",null);
  for(const d of [created.monthDirectory,created.depositDirectory,created.csvDirectory,created.pdfDirectory])assert.ok(fs.statSync(d).isDirectory());
  assert.strictEqual(inventory.ensureOutputDirectories(base,"2026-11-26",null).monthDirectory,created.monthDirectory);

  let exports=0,exportJob=null;
  const sourceDir=path.join(base,"source");fs.mkdirSync(sourceDir);
  const csvSource=path.join(sourceDir,"count.csv.inf"),pdfSource=path.join(sourceDir,"count.pdf");
  fs.writeFileSync(csvSource,"sku;produto\n"+ "123;Produto de teste\n".repeat(6));
  fs.writeFileSync(pdfSource,"%PDF-1.4\n"+ "conteudo de teste ".repeat(8));
  const opts={
    config:{inventoryCounts:{baseDirectory:base,deposits:[{
      id:"6",countId:"6",sector:"DEVOLUÇÃO",label:"DEVOLUÇÃO",
      warehouse:"1",areaFrom:"1",areaTo:"1",folder:"06 - Depósito DEVOLUÇÃO"
    }]}},
    existingEdge:{desktopUnlocked:()=>true,idleMilliseconds:()=>0},
    promax:{isConfigured:async()=>true,exportInventoryCount:async(job)=>{exports++;exportJob=job;return{csvPath:csvSource,pdfPath:pdfSource};}},
    root:base,now,log:()=>{}
  };
  const blocked=await inventory.syncDaily({...opts,force:false});
  assert.strictEqual(blocked.status,"desktop-active");
  assert.strictEqual(exports,0);

  const forced=await inventory.syncDaily({...opts,force:true});
  assert.strictEqual(forced.status,"saved");
  assert.strictEqual(exports,1);
  assert.deepStrictEqual(exportJob,{
    warehouse:"1",depositFrom:"6",depositTo:"6",
    areaFrom:"1",areaTo:"1",countId:"6"
  });
  assert.ok(inventory.pairExists(created));
  assert.ok(fs.readFileSync(created.csvFile,"utf8").startsWith("sku;produto"));
  assert.ok(fs.readFileSync(created.pdfFile).subarray(0,5).toString("ascii")==="%PDF-");
  const selection={date:"2026-11-26",depositId:"6",countId:"6",sector:"DEVOLUÇÃO",warehouse:"1",areaFrom:"1",areaTo:"1"};
  assert.strictEqual(inventory.isVerifiedPair(created,selection),true);

  const repeated=await inventory.syncDaily({...opts,force:true});
  assert.strictEqual(repeated.status,"already-saved");
  assert.strictEqual(exports,1);

  // Files from older runs without a selection proof must be regenerated once.
  fs.unlinkSync(created.completionFile);
  const regenerated=await inventory.syncDaily({...opts,force:true});
  assert.strictEqual(regenerated.status,"saved");
  assert.strictEqual(exports,2);
  assert.strictEqual(inventory.isVerifiedPair(created,selection),true);
  const finalRepeat=await inventory.syncDaily({...opts,force:true});
  assert.strictEqual(finalRepeat.status,"already-saved");
  assert.strictEqual(exports,2);
  console.log("inventory-counts: Devolução 6/6 selection marker + regeneration + idempotency OK");
 } finally {
  fs.rmSync(base,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
