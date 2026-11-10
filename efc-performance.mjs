// Derived data only: no persisted records or calculation rules are changed.
export function periodMemo(calculate,limit=12){
 let source,history,entries=new Map();
 return(data,month,day='',week='',original=null)=>{
  if(source!==data||history!==original){source=data;history=original;entries=new Map();}
  const key=JSON.stringify([month,day,week]);
  if(entries.has(key))return entries.get(key);
  const value=calculate(data,month,day,week,original);entries.set(key,value);
  if(entries.size>limit)entries.delete(entries.keys().next().value);
  return value;
 };
}
