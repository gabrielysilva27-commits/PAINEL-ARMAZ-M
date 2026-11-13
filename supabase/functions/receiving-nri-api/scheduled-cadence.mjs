// The cadence covers attempts, not only successful imports, across both PCs.
export function mayStart020501(requestType,lastRun,nowMs,intervalMinutes=60){
 if(requestType!=='scheduled')return true; // explicit "Sincronizar agora"
 const last=Date.parse(lastRun?.completed_at||lastRun?.started_at||'');
 const minutes=Math.max(60,Number(intervalMinutes)||60);
 return !Number.isFinite(last)||nowMs-last>=minutes*60000;
}
