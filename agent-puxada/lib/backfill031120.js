const path=require('path');
const fs=require('fs');
function monthPeriods(from,to){const out=[];let cursor=from;while(cursor<=to){const [y,m]=cursor.split('-').map(Number),end=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10),last=end<to?end:to;out.push({date_from:cursor,date_to:last,month:cursor.slice(0,7)});cursor=new Date(Date.UTC(y,m,1)).toISOString().slice(0,10)}return out}
function dataUnavailable(e){return /031120_(EMPTY|NO_DATA|ENTRADA_CDD_NOT_FOUND|HEADER_NOT_FOUND|CSV_NOT_FOUND|DOWNLOAD_TIMEOUT)/.test(String(e.message||e))}
async function run({api,promax,config,root,parse,log,task}){
 const coverage={date_from:task.date_from,date_to:task.date_to,files:[],months:[],unavailable:[]},rows=new Map();let raw=0,source=null;
 let cached=null;
 if(task.force_run&&monthPeriods(task.date_from,task.date_to).length>1){
  const directory=path.join(root,'downloads');
  const candidates=fs.existsSync(directory)?fs.readdirSync(directory).filter(name=>/^031120_normal_edge_\d+\.csv\.inf$/.test(name)).map(name=>{const file=path.join(directory,name),stat=fs.statSync(file);return{file,mtime:stat.mtimeMs,size:stat.size}}).filter(x=>Date.now()-x.mtime<86400000&&x.size<100*1024*1024).sort((a,b)=>b.mtime-a.mtime).slice(0,20):[];
  for(const candidate of candidates){try{const parsed=parse(candidate.file),months=new Set(parsed.rows.filter(r=>r.pull_date>=task.date_from&&r.pull_date<=task.date_to).map(r=>r.pull_date.slice(0,7)));if(months.size>1&&(!cached||months.size>cached.months)){cached={file:candidate.file,months:months.size}}}catch(e){}}
  if(cached)log('03.11.20: recuperando CSV já exportado pelo agente: '+path.basename(cached.file));
 }
 async function fetchPeriod(period){
  await api.pull031120State({status:'running',stage:'open_report',...period,coverage});
  const recovered=cached&&period.date_from===task.date_from&&period.date_to===task.date_to;
  const file=recovered?cached.file:await promax.export031120({...task,...period},config,root,parse),parsed=parse(file);source=path.basename(file);
  const outside=parsed.rows.filter(row=>row.pull_date<period.date_from||row.pull_date>period.date_to);
  parsed.rows=parsed.rows.filter(row=>row.pull_date>=period.date_from&&row.pull_date<=period.date_to);
  if(!parsed.rows.length)throw Error('031120_NO_DATA: arquivo '+path.basename(file)+' sem entradas dentro de '+period.date_from+' a '+period.date_to+'.');
  if(outside.length)log('03.11.20: '+outside.length+' dias fora do intervalo foram excluídos da importação.');
  raw+=parsed.raw_rows;for(const row of parsed.rows)rows.set(row.pull_date,row);
  await api.pull031120Import({...period,source_file:source,raw_rows:parsed.raw_rows,rows:parsed.rows});
  coverage.files.push({source_file:source,date_from:period.date_from,date_to:period.date_to,days:parsed.rows.length,recovered:!!recovered,excluded_days:outside.map(row=>row.pull_date)});return parsed;
 }
 const periods=monthPeriods(task.date_from,task.date_to);let missing=[];
 try{const full=await fetchPeriod({date_from:task.date_from,date_to:task.date_to});const found=new Set(full.rows.map(r=>r.pull_date.slice(0,7)));missing=periods.filter(p=>!found.has(p.month));coverage.months=[...found].sort()}
 catch(e){if(!dataUnavailable(e)||periods.length<=1)throw e;log('03.11.20: consulta completa indisponível; verificando os meses separadamente.');missing=periods}
 for(const period of missing){
  try{const parsed=await fetchPeriod(period);if(parsed.rows.length)coverage.months.push(period.month);else coverage.unavailable.push({...period,error:'Sem entradas de carretas no arquivo gerado; retenção histórica não confirmada.'})}
  catch(e){if(!dataUnavailable(e))throw e;coverage.unavailable.push({...period,error:String(e.message||e).slice(0,700)});log('03.11.20: '+period.month+' indisponível: '+e.message,true)}
 }
 coverage.months=[...new Set(coverage.months)].sort();const all=[...rows.values()];
 await api.pull031120State({status:'completed',stage:coverage.unavailable.length?'done_with_gaps':'done',date_from:task.date_from,date_to:task.date_to,source_file:source,raw_rows:raw,days:all.length,truck_count:all.reduce((n,x)=>n+x.truck_count,0),pallets_pulled:all.reduce((n,x)=>n+x.pallets_pulled,0),coverage});return coverage;
}
module.exports={run,monthPeriods,dataUnavailable};
