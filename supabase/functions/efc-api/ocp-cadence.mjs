export function ocpRetryGate({now=Date.now(),lastScan,completed,job,target,manual=false}){
 if(manual||!job)return {blocked:false};
 const opening=Date.parse(target+'T21:00:00-03:00'),next=opening+86400000;
 const covered=completed&&Date.parse(completed.started_at)>=opening&&Number(completed.map_from)<=Number(job.map_from)&&Number(completed.map_to)>=Number(job.map_to);
 if(covered&&now<next)return {blocked:true,retry_after:new Date(next).toISOString(),reason:'Exportação diária já concluída. Mapas ausentes continuam pendentes para conferência; sem repetir o mesmo intervalo nesta janela.'};
 const last=Date.parse(lastScan||'');
 if(Number.isFinite(last)&&now-last<3600000)return {blocked:true,retry_after:new Date(last+3600000).toISOString(),reason:'Intervalo mínimo de 1 hora entre tentativas automáticas da OCP.'};
 return {blocked:false};
}
