// Explicitly authorized fallback. Real OCP quantities always take precedence.
export function withAuthorizedBoxesAverage(data){
 const inputs=new Map((data.items||[]).map(x=>[x.date+'|'+x.map,x])),added=[];
 const targets=[...(data.helpers||[]),...(data.checkers||[])].filter(x=>x.manual_boxes_average===true);
 for(const row of targets){const key=row.date+'|'+row.map;if(inputs.get(key)?.boxes!=null)continue;
  const eligible=new Set((data.checkers||[]).filter(x=>x.date===row.date&&x.map!==row.map&&!x.manual_boxes_average).map(x=>x.date+'|'+x.map));
  const basis=[...eligible].map(k=>inputs.get(k)).filter(x=>x&&typeof x.boxes==='number'&&Number.isFinite(x.boxes)&&!x.estimated);
  if(!basis.length)continue;
  const item={id:'authorized-average:'+key,date:row.date,map:row.map,boxes:Math.round(basis.reduce((a,x)=>a+x.boxes,0)/basis.length),estimated:true,source:'Média autorizada dos mapas conferidos do dia',basis_maps:basis.length,reason:row.manual_boxes_reason};
  inputs.set(key,item);added.push(item);
 }
 return {...data,items:[...(data.items||[]).filter(x=>!added.some(a=>a.date===x.date&&a.map===x.map)),...added]};
}
