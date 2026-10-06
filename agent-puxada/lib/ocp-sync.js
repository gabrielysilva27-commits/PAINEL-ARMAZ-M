const fs=require('fs'),path=require('path'),crypto=require('crypto');
const efd=require('./efd-sync'),edge=require('./existing-edge');
const {parse03023601}=require('./csv03023601');
const {nextOpening}=require('./outlook-segmentations');
const ENDPOINT='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/efc-api';
async function call(api,action,payload={}){const r=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','x-agent-token':api.token},body:JSON.stringify({action,...payload}),signal:AbortSignal.timeout(60000)});const d=await r.json();if(!r.ok)throw Error(d.error||'OCP_HTTP_'+r.status);return d;}
function day(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function inventory(root,today){const selected=new Map();for(const file of efd.inventory(root).files.filter(f=>/^MAPAS.*\.xlsx$/i.test(f.name)).sort((a,b)=>a.modified_at.localeCompare(b.modified_at))){const match=file.name.match(/(\d{2})[._-](\d{2})[._-](\d{4}|\d{2})/);if(!match)continue;const date=(match[3].length===2?'20'+match[3]:match[3])+'-'+match[2]+'-'+match[1];if(date<'2026-10-01'||date>today)continue;const data=efd.mapsRows(root,file);if(!data)continue;const all=[...data.rows,...data.excluded].filter(r=>/^\d{1,12}$/.test(r.map));if(!all.length)continue;selected.set(date,{date,source_file:file.relative_path,signature:file.size+':'+file.modified_at,map_from:String(Math.min(...all.map(r=>+r.map))),map_to:String(Math.max(...all.map(r=>+r.map))),rows:data.rows.filter(r=>r.plate&&!r.plate.startsWith('REC'))});}return [...selected.values()].sort((a,b)=>a.date.localeCompare(b.date));}
let next=0;
async function sync(api,promax,config,root,log){if(process.platform!=='win32'||Date.now()<next)return;next=Date.now()+60000;let id=null;try{
 const state=await call(api,'agent_ocp_status');if(!state.enabled){next=Date.now()+3600000;return;}if(!state.pending&&!state.force_run){next=nextOpening();return;}
 // All browser work remains sequential inside the main agent loop.
 if(!edge.desktopUnlocked()||(edge.idleMilliseconds()??0)<30000)return;
 const r=await fetch('https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/efd-api',{method:'POST',headers:{'Content-Type':'application/json','x-agent-token':api.token},body:JSON.stringify({action:'agent_status'}),signal:AbortSignal.timeout(30000)});const c=await r.json();if(!r.ok||!c.config?.root_path)throw Error('OCP_MAPAS_PATH_UNAVAILABLE');
 const files=inventory(c.config.root_path,state.inventory_through);for(const file of files)await call(api,'agent_ocp_inventory',file);
 await call(api,'agent_ocp_inventory_end',{date:state.inventory_through});
 const refreshed=await call(api,'agent_ocp_status'),job=refreshed.job;if(!job){if(!refreshed.pending)next=nextOpening();return;}
 log('OCP: recuperando mapas '+job.map_from+' até '+job.map_to+' desde '+job.date_from+'.');
 const file=await promax.export03023601(job,config,root,parse03023601),parsed=parse03023601(file);
 id=crypto.randomUUID();const sha=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 await call(api,'agent_ocp_begin',{id,headers:parsed.headers,row_count:parsed.rows.length,sha256:sha,source_file:path.basename(file),map_from:job.map_from,map_to:job.map_to});
 for(let i=0;i<parsed.rows.length;i+=200)await call(api,'agent_ocp_rows',{id,chunk:i/200,rows:parsed.rows.slice(i,i+200)});
 const result=await call(api,'agent_ocp_finish',{id});log('OCP: '+parsed.rows.length+' linhas importadas; '+result.pending+' dias pendentes.');if(!result.pending)next=nextOpening();
 }catch(e){log('OCP: '+e.message,true);await call(api,'agent_ocp_error',{id,error:e.message}).catch(()=>{});next=Date.now()+60000;}}
module.exports={sync,inventory,day};
