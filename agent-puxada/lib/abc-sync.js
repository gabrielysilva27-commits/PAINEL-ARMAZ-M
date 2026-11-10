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
    log('ABC: mapas '+bounds.map_from+' ('+bounds.first_file+') a '+bounds.map_to+' ('+bounds.last_file+').');
    // Preserve an OCP window already opened by the operator. Sales opens its
    // own report and may need to close OCP first to unlock the home shortcut.
    await stage('export_03023601');
    const ocpFile=await promax.export03023601(job,config,root,parse03023601),picking=reports.pickingRows(parse03023601(ocpFile),job);
    await stage('export_030519',{picking_skus:picking.rows.length,days:picking.dates.length});
    const salesFile=await promax.export030519(job,config,root,reports.parseSales),sales=reports.parseSales(salesFile);
    const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    await stage('calculating',{picking_skus:picking.rows.length,days:picking.dates.length});
    const result=await call(api,'complete',{...payload,bounds,sales,picking:picking.rows,dates:picking.dates,excluded_ocp_rows:picking.excluded_rows,source_files:[path.basename(salesFile),path.basename(ocpFile)],sha256:[hash(salesFile),hash(ocpFile)]});
    log('Curva ABC '+job.month+' atualizada: '+result.items+' itens, '+picking.dates.length+' dias; '+result.skipped_codes.length+' códigos sem fator, '+result.asset_codes.length+' ativos de giro excluídos.');
    next=Date.now()+15*60000;
  }catch(e){log('Curva ABC: '+e.message,true);next=Date.now()+5*60000;if(job)await call(api,'error',{month:job.month,run_id:job.run_id,error:e.message}).catch(()=>{});}
  finally{if(timer)clearInterval(timer);}
}
module.exports={sync};
