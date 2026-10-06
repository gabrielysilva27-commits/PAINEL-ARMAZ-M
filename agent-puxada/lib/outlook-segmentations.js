const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {execFile}=require('child_process');
const ENDPOINT='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/efc-api';
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
function text(v){return String(v||'').replace(/<[^>]*>/g,' ').replace(/&#(\d+);/g,(_,x)=>String.fromCodePoint(Number(x))).replace(/&#x([a-f\d]+);/gi,(_,x)=>String.fromCodePoint(parseInt(x,16))).replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();}
function parse(message){
 const subject=norm(message.subject),m=subject.match(/\b(\d{2})[/.\-](\d{2})[/.\-](2026)\b/);
 if(!/SEGMENTACAO.*CLIENTES.*EMPILHADEIRA/.test(subject)||!m)return null;
 const date=m[3]+'-'+m[2]+'-'+m[1];if(!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)return null;
 const html=String(message.html||'').split(/<blockquote\b|<div[^>]+id=["'](?:divRplyFwdMsg|appendonsend)/i)[0];
 const rows=new Map();let invalid=0,found=false;
 for(const table of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)){
  let columns=null;
  for(const row of table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
   const cells=[...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>text(x[1]));
   const headers=cells.map(norm);if(headers.includes('MAPA')&&headers.includes('VEICULO')){columns={map:headers.indexOf('MAPA'),vehicle:headers.indexOf('VEICULO'),customer:headers.findIndex(x=>/PDV|CLIENTE/.test(x))};found=true;continue;}
   if(!columns||!cells.some(Boolean))continue;
   const clean=x=>String(x||'').replace(/[.\s]/g,''),map=clean(cells[columns.map]),vehicle=clean(cells[columns.vehicle]),customer=columns.customer>=0?clean(cells[columns.customer]):'';
   if(!/^\d{1,12}$/.test(map)||!/^\d{1,12}$/.test(vehicle)||!/^\d{1,12}$/.test(customer)){invalid++;continue;}
   rows.set(map+'|'+vehicle+'|'+customer,{map:String(Number(map)),vehicle:String(Number(vehicle)),customer:String(Number(customer))});
  }
 }
 const digest=crypto.createHash('sha256').update(String(message.key||'')+'|'+subject).digest('hex');
 return {id:digest,date,received_at:message.received_at,rows:[...rows.values()],status:found&&rows.size&&!invalid?'parsed':'review',issue:!found?'Tabela não localizada':invalid?'Linhas sem mapa, veículo ou cliente válido':'Sem segmentações legíveis'};
}
async function call(api,action,payload){const r=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','x-agent-token':api.token},body:JSON.stringify({action,...payload}),signal:AbortSignal.timeout(30000)});const d=await r.json();if(!r.ok)throw Error(d.error||'Erro na coleta de segmentações');return d;}
let busy=false,next=0;
async function run(api,log){
 const allowed=await call(api,'agent_segmentations_status',{});if(!allowed.enabled)return;
 const output=path.join(__dirname,'..','data','outlook-segmentations-'+process.pid+'.json');fs.mkdirSync(path.dirname(output),{recursive:true});
 try{
  const script=fs.readFileSync(path.join(__dirname,'outlook-segmentations.ps1'),'utf8').replace(/^param[^\n]*\n/, '$OutputPath=$env:EFC_SEGMENTATIONS_OUTPUT\n');
  const psExe=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  await new Promise((resolve,reject)=>execFile(psExe,['-NoProfile','-STA','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:180000,maxBuffer:1024*1024,env:{...process.env,EFC_SEGMENTATIONS_OUTPUT:output}},(e)=>e?reject(Error('Leitura Outlook: '+String(e.code||'falha')+'. Deixe o Outlook clássico aberto no mesmo usuário do agente.')):resolve()));
  const result=JSON.parse(fs.readFileSync(output,'utf8').replace(/^\uFEFF/,''));if(result.error)throw Error(result.error);
  const messages=(result.messages||[]).map(parse).filter(Boolean);let imported=0;
  for(let i=0;i<messages.length;i+=50){await call(api,'agent_segmentations_import',{messages:messages.slice(i,i+50)});imported+=Math.min(50,messages.length-i);}
  await call(api,'agent_segmentations_scan',{messages:imported,review:messages.filter(x=>x.status==='review').length,errors:(result.errors||[]).length});
  log('EFC: '+imported+' e-mails de segmentação lidos; '+messages.filter(x=>x.status==='review').length+' pendentes de revisão.');
 }finally{try{fs.unlinkSync(output)}catch{}}
}
function kick(api,log){if(process.platform!=='win32'||busy||Date.now()<next)return;busy=true;next=Date.now()+30*60000;run(api,log).catch(async e=>{log('Segmentações Outlook: '+e.message,true);await call(api,'agent_segmentations_scan',{error:e.message}).catch(()=>{});next=Date.now()+5*60000;}).finally(()=>{busy=false;});}
module.exports={parse,kick};
