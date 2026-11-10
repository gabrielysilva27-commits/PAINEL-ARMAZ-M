export function platePositions(plan,area='picking'){
 if(!['picking','flow'].includes(area))throw new Error('Área de impressão inválida.');
 const positions=[];
 // Caixaria and frontal PF1/PF2 do not use signs. Flow Rack prints separately.
 for(const street of area==='picking'?(plan.main||[]):[]){
  (street.slots||[]).forEach((slot,index)=>{if(slot?.sku_code)positions.push({street:street.id,position:slot.position||index+1,code:String(slot.sku_code)});});
 }
 // Same two-column arrangement used by the Layout's Flow Rack.
 if(area==='flow')for(let column=0;column<2;column++)for(let row=0;row<12;row++){
  const item=plan.flow?.items?.[row*2+column];
  if(item?.sku_code)positions.push({street:'FR'+(column+1),position:row+1,code:String(item.sku_code)});
 }
 return positions;
}
