"use strict";
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path");
const inventory=require("../lib/inventory-counts"),base=fs.mkdtempSync(path.join(os.tmpdir(),"inventory-counts-"));
try{
 const p=inventory.buildPaths(base,"2026-11-26");
 assert.strictEqual(p.monthFolder,"11. Novembro");
 assert.strictEqual(p.baseName,"26.11 - CONTAGEM DEVOLUÇÃO");
 assert.strictEqual(path.basename(p.csvFile),"26.11 - CONTAGEM DEVOLUÇÃO.csv.inf");
 assert.strictEqual(path.basename(p.pdfFile),"26.11 - CONTAGEM DEVOLUÇÃO.pdf");
 const created=inventory.ensureOutputDirectories(base,"2026-11-26",null);
 for(const d of [created.monthDirectory,created.depositDirectory,created.csvDirectory,created.pdfDirectory])assert.ok(fs.statSync(d).isDirectory());
 assert.strictEqual(inventory.ensureOutputDirectories(base,"2026-11-26",null).monthDirectory,created.monthDirectory);
 console.log("inventory-counts: OK");
}finally{fs.rmSync(base,{recursive:true,force:true});}
