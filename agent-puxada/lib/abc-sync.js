'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const edge=require('./existing-edge'),reports=require('./abc-reports'),{parse03023601}=require('./csv03023601');
const ENDPOINT='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/abc-agent-api';
async function call(api,action,payload={}){const r=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','x-agent-token':api.token},body:JSON.stringify({action,...payload}),signal:AbortSignal.timeout(120000)});const d=await r.json();if(!r.ok)throw Error(d.error||'ABC_HTTP_'+r.status);return d;}
let next=0;
async function sync(api,promax,config,root,log){
  if(process.platform!=='win32'||Date.now()<next)return;next=Date.now()+60000;
  let job=null,timer=null;
  try{
    const state=await call(api,'status');if(state.complete){next=Date.now()+15*60000;return;}
    if(!edge.desktopUnlocked()||(edge.idleMilliseconds()??0)<30000)return;
    const claim=await call(api,'claim');if(!claim.job)return;job=claim.job;
    const payload={month:job.month,run_id:job.run_id};
    timer=setInterval(()=>call(api,'heartbeat',payload).catch(e=>log('ABC heartbeat: '+e.message,true)),45000);
    const stage=async(stage,details={})=>call(api,'stage',{...payload,stage,details});
    log('Curva ABC '+job.month+': período '+job.date_from+' a '+job.date_to+'.');
    await stage('map_inventory');
    const bounds=reports.mapBounds(job.root_path,job);Object.assign(job,bounds);
    await stage('map_boundaries',bounds);
    const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const checkpointFile=path.join(root,'downloads','abc-'+job.month+'-checkpoint.json');
    const identity=JSON.stringify({month:job.month,date_from:job.date_from,date_to:job.date_to,bounds});
    let checkpoint={identity};
    try{const saved=JSON.parse(fs.readFileSync(checkpointFile,'utf8'));if(saved.identity===identity)checkpoint=saved;}catch{}
    const cached=kind=>{const c=checkpoint[kind];try{return c&&path.dirname(c.file)===path.join(root,'downloads')&&hash(c.file)===c.sha256?c.file:null;}catch{return null;}};
    const remember=(kind,file)=>{checkpoint[kind]={file,sha256:hash(file)};fs.mkdirSync(path.dirname(checkpointFile),{recursive:true});const tmp=checkpointFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(checkpoint));fs.renameSync(tmp,checkpointFile);};
    log('ABC: mapas '+bounds.map_from+' ('+bounds.first_file+') a '+bounds.map_to+' ('+bounds.last_file+').');
    // Preserve an OCP window already opened by the operator. Sales opens its
    // own report and may need to close OCP first to unlock the home shortcut.
    await stage('export_03023601');
    // Recover an already exported OCP only when its actual rows prove both
    // exact boundary maps; never infer provenance from filename or mtime.
    let recoveredOcp=null;
    try{const dir=path.join(root,'downloads');for(const name of fs.readdirSync(dir).filter(n=>/^03023601_normal_edge_\d+\.csv\.inf$/.test(n)).sort().reverse()){
      const file=path.join(dir,name);try{const parsed=parse03023601(file),range=parsed.rows.reduce((a,r)=>[Math.min(a[0],+r.map),Math.max(a[1],+r.map)],[Infinity,-Infinity]);if(parsed.rows.length&&range[0]===+job.map_from&&range[1]===+job.map_to&&parsed.rows.every(r=>r.date>=job.date_from&&r.date<=job.date_to)){reports.pickingRows(parsed,job);recoveredOcp=file;break;}}catch{}
    }}catch{}
    const ocpFile=cached('ocp')||recoveredOcp||await promax.export03023601(job,config,root,parse03023601),picking=reports.pickingRows(parse03023601(ocpFile),job);remember('ocp',ocpFile);
    await stage('export_030519',{picking_skus:picking.rows.length,days:picking.dates.length});
    const salesFile=cached('sales')||await promax.export030519(job,config,root,reports.parseSales),sales=reports.parseSales(salesFile);remember('sales',salesFile);
    await stage('calculating',{picking_skus:picking.rows.length,days:picking.dates.length});
    const result=await call(api,'complete',{...payload,bounds,sales,picking:picking.rows,dates:picking.dates,excluded_ocp_rows:picking.excluded_rows,source_files:[path.basename(salesFile),path.basename(ocpFile)],sha256:[hash(salesFile),hash(ocpFile)]});
    log('Curva ABC '+job.month+' atualizada: '+result.items+' itens, '+picking.dates.length+' dias; '+result.skipped_codes.length+' códigos sem fator, '+result.asset_codes.length+' ativos de giro excluídos.');
    next=Date.now()+15*60000;
  }catch(e){const message=e.message+(/EDGE_NATIVE_.*window/.test(e.message)?' | windows='+JSON.stringify(edge.probe()):'');log('Curva ABC: '+message,true);next=Date.now()+5*60000;if(job)await call(api,'error',{month:job.month,run_id:job.run_id,error:message}).catch(()=>{});}
  finally{if(timer)clearInterval(timer);}
}
module.exports={sync};
