const fs=require('fs');
const path=require('path');
const zlib=require('zlib');
const ENDPOINT='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/efd-api';
async function call(api,action,payload={}){
 const r=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','x-agent-token':api.token},body:JSON.stringify({action,...payload})});
 const d=await r.json();if(!r.ok)throw Error(d.error||'Erro na leitura PCD');return d;
}
function inventory(root){
 const files=[],directories=[],errors=[];
 function visit(dir,depth){if(depth>6||files.length>=5000)return;
  let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true})}catch(e){errors.push(path.relative(root,dir)+': '+e.message);return}
  for(const e of entries){if(e.isSymbolicLink())continue;const p=path.join(dir,e.name);
   if(e.isDirectory()){directories.push(path.relative(root,p));visit(p,depth+1)}
   else if(/\.(xlsx?|csv|txt)$/i.test(e.name)&&!e.name.startsWith('~$')){const s=fs.statSync(p);files.push({relative_path:path.relative(root,p),name:e.name,size:s.size,modified_at:s.mtime.toISOString()})}
  }
 }
 if(!fs.existsSync(root))throw Error('PCD_PATH_UNAVAILABLE: o usuário que executa o agente ADM não consegue acessar '+root);
 visit(root,0);return{files,directories,errors};
}
function preview(root,file){
 const p=path.join(root,file.relative_path);
 if(file.size>15*1024*1024)return{file:file.relative_path,note:'Arquivo acima do limite de leitura inicial.'};
 if(/\.(csv|txt)$/i.test(p)){const fd=fs.openSync(p,'r');try{const b=Buffer.alloc(16384),n=fs.readSync(fd,b,0,b.length,0);return{file:file.relative_path,lines:b.subarray(0,n).toString('latin1').split(/\r?\n/).slice(0,8)}}finally{fs.closeSync(fd)}}
 if(/\.xlsx$/i.test(p)){
  try{return{file:file.relative_path,sheets:xlsxPreview(fs.readFileSync(p))}}
  catch(e){return{file:file.relative_path,error:String(e.message).slice(0,500)}}
 }
 return{file:file.relative_path,note:'Formato identificado; leitura de conteúdo pendente.'};
}
function xlsxPreview(buf){
 let end=-1;for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--){if(buf.readUInt32LE(i)===0x06054b50){end=i;break}}
 if(end<0)throw Error('Arquivo Excel ZIP inválido');
 const entries=new Map();let offset=buf.readUInt32LE(end+16);const count=buf.readUInt16LE(end+10);
 for(let i=0;i<count;i++){
  if(buf.readUInt32LE(offset)!==0x02014b50)throw Error('Diretório ZIP inválido');
  const n=buf.readUInt16LE(offset+28),extra=buf.readUInt16LE(offset+30),comment=buf.readUInt16LE(offset+32);
  entries.set(buf.subarray(offset+46,offset+46+n).toString('utf8'),{method:buf.readUInt16LE(offset+10),size:buf.readUInt32LE(offset+20),offset:buf.readUInt32LE(offset+42)});offset+=46+n+extra+comment;
 }
 function read(name){const e=entries.get(name);if(!e)return '';const o=e.offset;if(buf.readUInt32LE(o)!==0x04034b50)throw Error('Entrada ZIP inválida');const start=o+30+buf.readUInt16LE(o+26)+buf.readUInt16LE(o+28),b=buf.subarray(start,start+e.size);return(e.method===8?zlib.inflateRawSync(b,{maxOutputLength:20*1024*1024}):e.method===0?b:(()=>{throw Error('Compressão ZIP não suportada')})()).toString('utf8')}
 function decode(s){return s.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi,(_,v)=>v[0]==='#'?String.fromCodePoint(v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):parseInt(v.slice(1),10)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[v]))}
 function texts(s){return [...s.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x=>decode(x[1])).join('')}
 const strings=[...read('xl/sharedStrings.xml').matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(x=>texts(x[1]));
 return [...entries.keys()].filter(x=>/^xl\/worksheets\/sheet[0-9]+\.xml$/.test(x)).slice(0,2).map(sheet=>({sheet,rows:[...read(sheet).matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)].slice(0,8).map(row=>[...row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map(c=>{const ref=/\br="([^"]+)"/.exec(c[1])?.[1]||'',type=/\bt="([^"]+)"/.exec(c[1])?.[1],v=/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(c[2])?.[1]||'';const value=type==='s'?strings[Number(v)]||'':type==='inlineStr'?texts(c[2]):decode(v);return value?ref+':'+value.slice(0,180):''}).filter(Boolean).join(' | '))}));
}
let lastCheck=0;
function operationalDay(timestamp){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(timestamp));
}
function shouldScan(config,now=Date.now()){
 const last=Date.parse(config.last_scan_at||'');
 return !!config.diagnostic_requested||!Number.isFinite(last)||operationalDay(last)!==operationalDay(now);
}
async function sync(api,log){
 const now=Date.now();if(now-lastCheck<30000)return;lastCheck=now;
 let config;try{const r=await call(api,'agent_status');config=r.config}catch(e){if(/reservada/.test(e.message))return;throw e}
 if(!shouldScan(config,now))return;
 if(log)log('EFD: lendo PCD pelo Computador ADM em '+config.root_path);
 try{
  const result=inventory(config.root_path),january=result.files.filter(f=>/janeiro|(^|[\\/])0?1([ ._\\/-]|$)/i.test(f.relative_path));
  const samples=(january.length?january:result.files).filter(f=>!/\.xls$/i.test(f.name)).sort((a,b)=>Number(/^PCD/i.test(b.name))-Number(/^PCD/i.test(a.name))).slice(0,3).map(f=>preview(config.root_path,f));
  const diagnostic={files_count:result.files.length,directories:result.directories.slice(0,120),files:result.files.slice(0,150),samples,errors:result.errors.slice(0,10),truncated:result.files.length>=5000};
  await call(api,'agent_diagnostic',{diagnostic,error:result.errors.length?result.errors.slice(0,3).join(' | '):null});
  if(log)log('EFD: diagnóstico PCD enviado, '+result.files.length+' arquivo(s).');
 }catch(e){await call(api,'agent_diagnostic',{diagnostic:{files_count:0},error:e.message});if(log)log('EFD: '+e.message,true)}
}
module.exports={sync,inventory,preview,xlsxPreview,shouldScan};
