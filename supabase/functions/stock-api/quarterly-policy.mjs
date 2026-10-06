export function quarterDefinition(year,quarter){
  if(!Number.isInteger(year)||year<2000||year>2100||!Number.isInteger(quarter)||quarter<1||quarter>4)throw Error('Trimestre inválido');
  const start=new Date(Date.UTC(year,(quarter-1)*3,1));
  const end=new Date(Date.UTC(year,quarter*3,0));
  const reviewStart=new Date(Date.UTC(year,(quarter-2)*3,1));
  const reviewEnd=new Date(Date.UTC(year,(quarter-1)*3,0));
  const iso=d=>d.toISOString().slice(0,10);
  return {code:`T${quarter}/${year}`,effective_start:iso(start),effective_end:iso(end),review_start:iso(reviewStart),review_end:iso(reviewEnd)};
}
export function quarterActivation(version,today,lastOorDate){
  const next=date=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};
  const start=[version.effective_start,next(today),lastOorDate?next(lastOorDate):''].sort().at(-1);
  return start<=version.effective_end?{oor_enabled:true,oor_effective_start:start}:{oor_enabled:false,oor_effective_start:null};
}
export function validateQuarterDays(period,days){
  const calendar=(Date.parse(period.review_end+'T00:00:00Z')-Date.parse(period.review_start+'T00:00:00Z'))/86400000+1;
  return Number.isInteger(days)&&days>0&&days<=calendar;
}
