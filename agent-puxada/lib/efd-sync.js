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
function xlsxPreview(buf,rowLimit=8){
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
 return [...entries.keys()].filter(x=>/^xl\/worksheets\/sheet[0-9]+\.xml$/.test(x)).slice(0,2).map(sheet=>({sheet,rows:[...read(sheet).matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)].slice(0,rowLimit).map(row=>[...row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map(c=>{const ref=/\br="([^"]+)"/.exec(c[1])?.[1]||'',type=/\bt="([^"]+)"/.exec(c[1])?.[1],v=/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(c[2])?.[1]||'';const value=type==='s'?strings[Number(v)]||'':type==='inlineStr'?texts(c[2]):decode(v);return value?ref+':'+value.slice(0,180):''}).filter(Boolean).join(' | '))}));
}
function pcdRows(root,file){
 const match=file.name.match(/^PCD[^0-9]*(\d{2})[.\-_](\d{2})(?:[.\-_](\d{4}|\d{2}))?.*\.xlsx$/i);if(!match)return [];
 const year=match[3]?(match[3].length===2?'20'+match[3]:match[3]):path.basename(root);if(year!=='2026')return [];
 const date=year+'-'+match[2]+'-'+match[1];
 if(new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('EFD_PCD_INVALID_DATE: '+file.name);
 const rows=[];
 for(const sheet of xlsxPreview(fs.readFileSync(path.join(root,file.relative_path)),5000)){
  let columns=null;
  for(const line of sheet.rows){
   const cells={};for(const cell of line.split(/ \| (?=[A-Z]+\d+:)/)){const m=cell.match(/^([A-Z]+)\d+:(.*)$/);if(m)cells[m[1]]=m[2]}
   const entries=Object.entries(cells),norm=require('./efd-phases').norm;
   if(!columns){const plate=entries.find(([k,v])=>norm(v)==='VEICULO'),vehicle=entries.find(([k,v])=>norm(v).includes('ORDEM'));const explicitPlate=entries.find(([k,v])=>['PLACA','PLACA VEICULO','PLACA DO VEICULO'].includes(norm(v)));const numericVehicle=vehicle||entries.find(([k,v])=>['VEICULO','CODIGO VEICULO','COD. VEICULO','TIP'].includes(norm(v)));if((explicitPlate||plate)&&numericVehicle&&(explicitPlate||plate)[0]!==numericVehicle[0])columns={plate:(explicitPlate||plate)[0],vehicle:numericVehicle[0],route:entries.find(([k,v])=>['NOME ROTA','NOME'].includes(norm(v)))?.[0],arrival:entries.find(([k,v])=>norm(v).includes('PREV. CHEG'))?.[0]};continue}
   const vehicle=String(cells[columns.vehicle]||'').trim(),plate=String(cells[columns.plate]||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
   if(!/^\d+$/.test(vehicle)||plate.length<5)continue;
   rows.push({reference_date:date,vehicle:String(Number(vehicle)),plate,route_name:cells[columns.route]||'',expected_arrival:cells[columns.arrival]||'',source_file:file.relative_path});
  }
 }
 return rows;
}
function mapsRows(root,file){
 const m=file.name.match(/^MAPAS[^0-9]*(\d{2})[.\-_](\d{2})[.\-_](\d{4}|\d{2})\.xlsx$/i);if(!m)return null;
 const date=(m[3].length===2?'20'+m[3]:m[3])+'-'+m[2]+'-'+m[1];if(!date.startsWith('2026-')||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('EFC_MAPAS_INVALID_DATE: '+file.name);
 const result=new Map(),excluded=[];let found=false;
 for(const sheet of xlsxPreview(fs.readFileSync(path.join(root,file.relative_path)),5000)){
  let cols=null;
  for(const line of sheet.rows){const cells={};for(const c of line.split(/ \| (?=[A-Z]+\d+:)/)){const x=c.match(/^([A-Z]+)\d+:(.*)$/);if(x)cells[x[1]]=x[2]}
   if(!cols){const entries=Object.entries(cells),norm=require('./efd-phases').norm,pick=name=>entries.find(([k,v])=>norm(v)===name)?.[0];const map=pick('MAPA'),plate=pick('PLACA'),vehicle=pick('VEICULO');if(map&&plate&&vehicle){cols={map,plate,vehicle};found=true}continue}
   const map=String(cells[cols.map]||'').trim(),plate=String(cells[cols.plate]||'').toUpperCase().replace(/[^A-Z0-9]/g,''),vehicle=String(cells[cols.vehicle]||'').trim();if(!map&&!plate&&!vehicle)continue;
   if(!/^\d{1,12}$/.test(map)||!/^\d{1,12}$/.test(vehicle)||!/^\w{5,12}$/.test(plate)){excluded.push({map,plate,vehicle});continue;}
   const row={date,map:String(Number(map)),plate,vehicle:String(Number(vehicle)),eligible:true};const old=result.get(row.map);if(old&&(old.plate!==plate||old.vehicle!==row.vehicle))throw Error('EFC_MAPAS_DUPLICATE_MAP: '+map);result.set(row.map,row);
  }
 }
 if(!found||!result.size)throw Error('EFC_MAPAS_HEADERS_OR_ROWS_MISSING: '+file.name);
 return{reference_date:date,source_file:file.relative_path,rows:[...result.values()],excluded};
}
async function importMaps(api,root,files,state,log){
 state.maps??={};let count=0,rows=0;const excluded=[];
 const errors=[];for(const file of files.filter(f=>/^MAPAS.*\.xlsx$/i.test(f.name)).sort((a,b)=>b.modified_at.localeCompare(a.modified_at))){try{const signature=file.size+':'+file.modified_at;if(state.maps[file.relative_path]===signature)continue;const payload=mapsRows(root,file);if(!payload)continue;if(payload.excluded.length)excluded.push({file:file.relative_path,rows:payload.excluded});
  const r=await fetch('https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/efc-api',{method:'POST',headers:{'Content-Type':'application/json','x-agent-token':api.token},body:JSON.stringify({action:'agent_maps',...payload})});if(!r.ok)throw Error('EFC_MAPAS_IMPORT_HTTP_'+r.status);
  state.maps[file.relative_path]=signature;saveState(state);count++;rows+=payload.rows.length;if(log)log('EFC: '+payload.rows.length+' mapas incorporados de '+file.relative_path);
 }catch(e){errors.push(file.relative_path+': '+e.message);if(log)log('EFC MAPAS: '+e.message,true)}}
 return{files:count,rows,errors,excluded};
}
const STATE_PATH=path.join(__dirname,'..','..','data','efd-incorporation.json');
function loadState(){try{return JSON.parse(fs.readFileSync(STATE_PATH,'utf8'))}catch(e){return{csv:{},pcd:{}}}}
function saveState(state){fs.mkdirSync(path.dirname(STATE_PATH),{recursive:true});fs.writeFileSync(STATE_PATH,JSON.stringify(state),'utf8')}
async function importBatches(api,action,rows,source){for(let i=0;i<rows.length;i+=500)await call(api,action,{rows:rows.slice(i,i+500),source_file:source})}
async function phases(api,state,log){
 const dir=path.join(__dirname,'..','downloads');if(!fs.existsSync(dir))return{files:0,maps:0};let files=0,maps=0;
 const candidates=fs.readdirSync(dir).filter(name=>/^031120_normal_edge_\d+\.csv\.inf$/.test(name)).map(name=>{const stat=fs.statSync(path.join(dir,name));return{name,size:stat.size,modified:stat.mtimeMs}}).sort((a,b)=>a.modified-b.modified);
 for(const file of candidates){const signature=file.size+':'+file.modified;
  state.efcCsv??={};
  if(state.efcCsv[file.name]!==signature){try{
   let events=[];try{events=require('./efc-events').parse(path.join(dir,file.name))}catch(e){if(!/^EFC_(HEADER_NOT_FOUND|COLUMNS_MISSING)$/.test(e.message))throw e;}
   for(let i=0;i<events.length;i+=500){const response=await fetch('https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/efc-api',{method:'POST',headers:{'Content-Type':'application/json','x-agent-token':api.token},body:JSON.stringify({action:'agent_events',rows:events.slice(i,i+500),source_file:file.name})});if(!response.ok)throw Error('EFC_IMPORT_HTTP_'+response.status);}
   state.efcCsv[file.name]=signature;saveState(state);if(events.length&&log)log('EFC: '+events.length+' fases de carregamento incorporadas de '+file.name);
  }catch(e){if(log)log('EFC: falha ao incorporar '+file.name+': '+e.message,true);}}
  if(state.csv[file.name]===signature)continue;
  let parsed;try{parsed=require('./efd-phases').parse(path.join(dir,file.name))}catch(e){if(!/^EFD_PHASE_(HEADER_NOT_FOUND|COLUMNS_MISSING|NO_MAPS)$/.test(e.message))throw e;state.csv[file.name]=signature;saveState(state);if(log)log('EFD: arquivo antigo sem fases utilizáveis: '+file.name,true);continue}await importBatches(api,'agent_phase_import',parsed.rows,file.name);state.csv[file.name]=signature;saveState(state);files++;maps+=parsed.rows.length;
  if(log)log('EFD: '+parsed.rows.length+' mapas e '+parsed.events+' fases incorporados de '+file.name);
 }
 return{files,maps};
}
let lastCheck=0;
function operationalDay(timestamp){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(timestamp));
}
function shouldScan(config,now=Date.now()){
 const last=Date.parse(config.last_scan_at||'');
 return !!config.diagnostic_requested||!Number.isFinite(last)||operationalDay(last)!==operationalDay(now)||now-last>=15*60*1000;
}
async function sync(api,log){
 const now=Date.now();if(now-lastCheck<30000)return;lastCheck=now;
 let config;try{const r=await call(api,'agent_status');config=r.config}catch(e){if(/reservada/.test(e.message))return;throw e}
 const state=loadState();if(state.pcdParserVersion!==3){state.pcd={};state.pcdParserVersion=3}let phaseResult;
 try{phaseResult=await phases(api,state,log)}catch(e){if(config.pcd_enabled!==false)await call(api,'agent_diagnostic',{diagnostic:{phase_error:e.message},error:e.message});throw e}
 if(config.pcd_enabled===false){if(phaseResult.files)await call(api,'agent_reconcile');return}
 if(!shouldScan(config,now)&&Object.keys(state.pcd).length){if(phaseResult.files)await call(api,'agent_reconcile');return}
 if(log)log('EFD: lendo PCD pelo Computador ADM em '+config.root_path);
 try{
  const result=inventory(config.root_path),january=result.files.filter(f=>/janeiro|(^|[\\/])0?1([ ._\\/-]|$)/i.test(f.relative_path));
  const changed=result.files.filter(file=>/^PCD.*\.xlsx$/i.test(file.name)&&state.pcd[file.relative_path]!==file.size+':'+file.modified_at),routes=new Map();
  const emptyFiles=[];for(const file of changed){const parsed=pcdRows(config.root_path,file);if(!parsed.length)emptyFiles.push(file.relative_path);for(const row of parsed)routes.set(row.reference_date+'|'+row.vehicle+'|'+row.plate,row);}
  await importBatches(api,'agent_pcd_import',[...routes.values()],'PCD 2026');
  for(const file of changed.filter(f=>!emptyFiles.includes(f.relative_path)))state.pcd[file.relative_path]=file.size+':'+file.modified_at;saveState(state);
  const mapsResult=await importMaps(api,config.root_path,result.files,state,log);
  const reconciliation=await call(api,'agent_reconcile');
  const samples=(january.length?january:result.files).filter(f=>!/\.xls$/i.test(f.name)).sort((a,b)=>Number(/^PCD/i.test(b.name))-Number(/^PCD/i.test(a.name))).slice(0,3).map(f=>preview(config.root_path,f));
  const downloadDirectory=path.join(__dirname,'..','downloads');
  const csvSamples=fs.existsSync(downloadDirectory)?fs.readdirSync(downloadDirectory).filter(name=>/^031120_normal_edge_\d+\.csv\.inf$/.test(name)).map(name=>({name,modified:fs.statSync(path.join(downloadDirectory,name)).mtimeMs})).sort((a,b)=>b.modified-a.modified).slice(0,3).map(file=>{const raw=fs.readFileSync(path.join(downloadDirectory,file.name));let text=raw.toString('utf8');if((text.match(/�/g)||[]).length>3)text=raw.toString('latin1');return{file:file.name,size:raw.length,lines:text.split(/\r?\n/).slice(0,40)}}):[];
  const augustSamples=result.files.filter(f=>/agosto|(^|[\\/])0?8([ ._\\/-]|$)/i.test(f.relative_path)&&/^PCD/i.test(f.name)).slice(0,3).map(f=>preview(config.root_path,f));
  const latestSamples=result.files.filter(f=>/^PCD.*\.xlsx$/i.test(f.name)).sort((a,b)=>{const date=f=>{const m=f.name.match(/(\d{2})[.](\d{2})[.](\d{4}|\d{2})/);return m?(m[3].length===2?'20'+m[3]:m[3])+'-'+m[2]+'-'+m[1]:''};return date(b).localeCompare(date(a))}).slice(0,3).map(f=>({file:f.relative_path,sheets:xlsxPreview(fs.readFileSync(path.join(config.root_path,f.relative_path)),20)}));
  const latestMaps=result.files.filter(f=>/^MAPAS.*\.xlsx$/i.test(f.name)).sort((a,b)=>{const date=f=>{const m=f.name.match(/(\d{2})[.](\d{2})[.](\d{4}|\d{2})/);return m?(m[3].length===2?'20'+m[3]:m[3])+'-'+m[2]+'-'+m[1]:''};return date(b).localeCompare(date(a))}).slice(0,2).map(f=>({file:f.relative_path,sheets:xlsxPreview(fs.readFileSync(path.join(config.root_path,f.relative_path)),100)}));
  const diagnostic={latest_maps_samples:latestMaps,latest_pcd_samples:latestSamples,empty_pcd_files:emptyFiles,august_samples:augustSamples,pcd_files:result.files.filter(f=>/^PCD/i.test(f.name)).map(f=>({name:f.name,relative_path:f.relative_path})),incorporation:{maps_files:mapsResult.files,maps_rows:mapsResult.rows,maps_errors:mapsResult.errors.slice(0,20),maps_excluded:mapsResult.excluded.slice(0,5),phase_files:phaseResult.files,phase_maps:phaseResult.maps,pcd_files:changed.length,pcd_routes:routes.size,updated_maps:reconciliation.updated_maps},csv_samples:csvSamples,files_count:result.files.length,directories:result.directories.slice(0,120),files:result.files.slice(0,150),samples,errors:result.errors.slice(0,10),truncated:result.files.length>=5000};
  await call(api,'agent_diagnostic',{diagnostic,error:result.errors.length?result.errors.slice(0,3).join(' | '):null});
  if(log)log('EFD: diagnóstico PCD enviado, '+result.files.length+' arquivo(s).');
 }catch(e){await call(api,'agent_diagnostic',{diagnostic:{files_count:0},error:e.message});if(log)log('EFD: '+e.message,true)}
}
module.exports={sync,inventory,preview,xlsxPreview,shouldScan,pcdRows,mapsRows,phases};
