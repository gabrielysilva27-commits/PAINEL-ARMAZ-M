export function reconcileGerotWms(w,target){
 const eligible=w.daily.filter(x=>x.planned>0),pending=eligible.filter(x=>x.rate==null);
 const total=eligible.reduce((a,x)=>a+x.planned,0),known=eligible.filter(x=>x.rate!=null).reduce((a,x)=>a+x.rate*x.planned,0),missing=pending.reduce((a,x)=>a+x.planned,0);
 const rate=missing?(target*total-known)/missing:null;
 const feasible=rate!=null&&rate>=-1e-10&&rate<=1+1e-10;
 const daily=w.daily.map(x=>x.rate==null&&x.planned>0&&feasible?{...x,rate:Math.max(0,Math.min(1,rate)),adherent:null,segmented:null,status:'Rateio GEROT',manual:true}:x);
 return {...w,daily,rate:target,manual:true,source:'Fechamento GEROT',pending_days:daily.filter(x=>x.planned>0&&x.rate==null).length,allocation_possible:feasible||!pending.length};
}
export function applyGerot(c,results,fullWms,day='',week=''){
 if(!results)return c;
 c.manualResults=results;
 if(!day&&!week){Object.assign(c.summary,{efc:results.efc,efm:results.efm,wms:results.wms,resupply_rate:results.resupply_rate});c.replenishmentSummary={...c.replenishmentSummary,rate:results.replenishment_rate};}
 const monthly=reconcileGerotWms(fullWms,results.wms),dates=new Set(c.wmsEstimate.daily.map(x=>x.date));
 const daily=day||week?monthly.daily.filter(x=>dates.has(x.date)):monthly.daily;
 const valid=daily.filter(x=>x.rate!=null&&x.planned>0),weight=valid.reduce((a,x)=>a+x.planned,0);
 c.wmsEstimate={...monthly,daily,planned:daily.reduce((a,x)=>a+x.planned,0),adherent:null,segmented:null,rate:day||week?(weight?valid.reduce((a,x)=>a+x.rate*x.planned,0)/weight:null):results.wms,pending_days:daily.filter(x=>x.planned>0&&x.rate==null).length};
 return c;
}
