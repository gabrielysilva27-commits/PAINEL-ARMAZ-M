const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {spawn}=require('child_process');
const ENDPOINT='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/efc-api';
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
function text(v){return String(v||'').replace(/<[^>]*>/g,' ').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/&#(\d+);/g,(_,x)=>String.fromCodePoint(Number(x))).replace(/&#x([a-f\d]+);/gi,(_,x)=>String.fromCodePoint(parseInt(x,16))).replace(/&(aacute|agrave|acirc|atilde|eacute|ecirc|iacute|oacute|ocirc|otilde|uacute|ccedil);/gi,(_,name)=>({aacute:'á',agrave:'à',acirc:'â',atilde:'ã',eacute:'é',ecirc:'ê',iacute:'í',oacute:'ó',ocirc:'ô',otilde:'õ',uacute:'ú',ccedil:'ç'}[name.toLowerCase()])).replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();}
function parse(message){
 const subject=norm(message.subject),m=subject.match(/\b(\d{2})[/.\-](\d{2})[/.\-](2026)\b/);
 if(!/SEGMENTACAO.*CLIENTES.*EMPILHADEIRA/.test(subject)||!m)return null;
 const date=m[3]+'-'+m[2]+'-'+m[1];if(!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)return null;
 const fullHtml=String(message.html||'');
 let html=fullHtml.split(/<blockquote\b|<div[^>]+id=["'](?:divRplyFwdMsg|appendonsend)/i)[0];
 // A forwarded table is usable only when its own quoted subject exactly
 // matches the requested operational date. Never inherit an older day's table.
 if(!/<table\b/i.test(html)&&html.length<fullHtml.length){
  const quoted=fullHtml.slice(html.length),first=quoted.search(/<table\b/i);
  const originalSubject=subject.replace(/^(?:(?:RE|RES|FW|FWD|ENC):\s*)+/,'');
  if(first>=0&&norm(text(quoted.slice(0,first))).includes(originalSubject)){
   const end=quoted.indexOf('</table>',first);
   if(end>=0)html=quoted.slice(first,end+8);
  }
 }
 const rows=new Map();let invalid=0,found=false;
 for(const table of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)){
  let columns=null;
  for(const row of table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
   const cells=[...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>text(x[1]));
   const headers=cells.map(norm),mapColumn=headers.findIndex(x=>/^(?:N[º°O.]?\s*)?MAPAS?$/.test(x));if(mapColumn>=0&&headers.includes('VEICULO')){columns={map:mapColumn,vehicle:headers.indexOf('VEICULO'),customer:headers.findIndex(x=>/PDV|CLIENTE/.test(x))};found=true;continue;}
   if(!columns||!cells.some(Boolean))continue;
   const clean=x=>String(x||'').replace(/[.\s]/g,''),map=clean(cells[columns.map]),vehicle=clean(cells[columns.vehicle]),customer=columns.customer>=0?clean(cells[columns.customer]):'';
   if(!/^\d{1,12}$/.test(map)||!/^\d{1,12}$/.test(vehicle)||!/^\d{1,12}$/.test(customer)){invalid++;continue;}
   rows.set(map+'|'+vehicle+'|'+customer,{map:String(Number(map)),vehicle:String(Number(vehicle)),customer:String(Number(customer))});
  }
 }
 const diagnostics=!found?'; tabelas='+[...html.matchAll(/<table\b/gi)].length+'/'+[...String(message.html||'').matchAll(/<table\b/gi)].length+'; imagens='+[...html.matchAll(/<img\b/gi)].length+'; cabecalhos='+[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(x=>[...x[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(y=>text(y[1]))).filter(cells=>cells.some(cell=>/^(MAPA|VEICULO|COD[ .]*PDV|CLIENTE)$/i.test(norm(cell)))).map(cells=>cells.filter(cell=>/^(MAPA|VEICULO|COD[ .]*PDV|CLIENTE)$/i.test(norm(cell))).join('|')).slice(0,4).join(','):'';
 const digest=crypto.createHash('sha256').update(String(message.key||'')+'|'+subject).digest('hex');
 return {id:digest,date,received_at:message.received_at,rows:[...rows.values()],status:found&&rows.size&&!invalid?'parsed':'review',issue:!found?('Tabela não localizada'+diagnostics).slice(0,400):invalid?'Linhas sem mapa, veículo ou cliente válido':'Sem segmentações legíveis'};
}
async function call(api,action,payload){const r=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','x-agent-token':api.token},body:JSON.stringify({action,...payload}),signal:AbortSignal.timeout(30000)});const d=await r.json();if(!r.ok)throw Error(d.error||'Erro na coleta de segmentações');return d;}
let busy=false,next=0;
function nextOpening(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
 let date=parts.year+'-'+parts.month+'-'+parts.day;
 if(Number(parts.hour)>=21)date=new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 return Date.parse(date+'T21:00:00-03:00');
}
async function run(api,log){
 const allowed=await call(api,'agent_segmentations_status',{});if(!allowed.enabled||!Array.isArray(allowed.targets)||!allowed.targets.length){next=nextOpening();return;}
 const targets=new Set(allowed.targets);
 const output=path.join(__dirname,'..','data','outlook-segmentations-'+process.pid+'.json');fs.mkdirSync(path.dirname(output),{recursive:true});
 try{
  const host=path.join(process.env.SystemRoot||'C:\\Windows','System32','cscript.exe');
  const script=path.join(__dirname,'outlook-segmentations.vbs');
  await new Promise((resolve,reject)=>{
   let child;
   const fail=e=>reject(Error('Inicialização Outlook: '+String(e.code||e.message||'falha')+'; host=cscript; exe='+fs.existsSync(host)));
   try{
    child=spawn(host,['//B','//nologo',script,output,[...targets].join(',')],{cwd:path.join(__dirname,'..'),windowsHide:true,stdio:'ignore',timeout:180000});
    child.once('error',fail);
    child.once('exit',(code,signal)=>code===0?resolve():reject(Error('Leitura Outlook: código '+String(code)+' sinal '+String(signal||'nenhum')+'; etapa: '+(fs.existsSync(output+'.stage')?fs.readFileSync(output+'.stage','utf8'):'sem retorno'))));
   }catch(e){fail(e);}
  });
  const result=JSON.parse(fs.readFileSync(output,'utf8').replace(/^\uFEFF/,''));if(result.error)throw Error(result.error);
  const messages=(result.messages||[]).map(parse).filter(x=>x&&targets.has(x.date));let imported=0;
  for(let i=0;i<messages.length;i+=50){await call(api,'agent_segmentations_import',{messages:messages.slice(i,i+50)});imported+=Math.min(50,messages.length-i);}
  const completed=await call(api,'agent_segmentations_scan',{messages:imported,review:messages.filter(x=>x.status==='review').length,errors:(result.errors||[]).length});
  if(Array.isArray(completed.targets)&&!completed.targets.length)next=nextOpening();
  log('EFC: '+imported+' e-mails de segmentação lidos; '+messages.filter(x=>x.status==='review').length+' pendentes de revisão.');
 }finally{for(const file of [output,output+'.stage']){try{fs.unlinkSync(file)}catch{}}}
}
function kick(api,log){if(process.platform!=='win32'||busy||Date.now()<next)return;busy=true;next=Date.now()+60*1000;run(api,log).catch(async e=>{log('Segmentações Outlook: '+e.message,true);await call(api,'agent_segmentations_scan',{error:e.message}).catch(()=>{});next=Date.now()+60*1000;}).finally(()=>{busy=false;});}
module.exports={parse,kick,nextOpening};
