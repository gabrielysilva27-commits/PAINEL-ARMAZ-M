const path=require('path');
function monthPeriods(from,to){const out=[];let cursor=from;while(cursor<=to){const [y,m]=cursor.split('-').map(Number),end=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10),last=end<to?end:to;out.push({date_from:cursor,date_to:last,month:cursor.slice(0,7)});cursor=new Date(Date.UTC(y,m,1)).toISOString().slice(0,10)}return out}
function dataUnavailable(e){return /031120_(EMPTY|NO_DATA|ENTRADA_CDD_NOT_FOUND|HEADER_NOT_FOUND|CSV_NOT_FOUND|DOWNLOAD_TIMEOUT)/.test(String(e.message||e))}
async function run({api,promax,config,root,parse,log,task}){
 const coverage={date_from:task.date_from,date_to:task.date_to,files:[],months:[],unavailable:[]},rows=new Map();let raw=0,source=null;
 async function fetchPeriod(period){
  await api.pull031120State({status:'running',stage:'open_report',...period,coverage});
  const file=await promax.export031120({...task,...period},config,root,parse),parsed=parse(file);source=path.basename(file);
  if(parsed.rows.some(row=>row.pull_date<period.date_from||row.pull_date>period.date_to))throw Error('031120_FILTER_MISMATCH: arquivo contém dias fora do período solicitado.');
  raw+=parsed.raw_rows;for(const row of parsed.rows)rows.set(row.pull_date,row);
  await api.pull031120Import({...period,source_file:source,raw_rows:parsed.raw_rows,rows:parsed.rows});
  coverage.files.push({source_file:source,date_from:period.date_from,date_to:period.date_to,days:parsed.rows.length});return parsed;
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
