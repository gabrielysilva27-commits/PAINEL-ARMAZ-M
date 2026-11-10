export function platePositions(plan){
 const positions=[];
 // Caixaria (CX1–CX7) does not use picking signs. Exclude the area, not its SKUs.
 for(const street of [...(plan.main||[]),...(plan.front||[])]){
  (street.slots||[]).forEach((slot,index)=>{if(slot?.sku_code)positions.push({street:street.id,position:slot.position||index+1,code:String(slot.sku_code)});});
 }
 // Same two-column arrangement used by the Layout's Flow Rack.
 for(let column=0;column<2;column++)for(let row=0;row<12;row++){
  const item=plan.flow?.items?.[row*2+column];
  if(item?.sku_code)positions.push({street:'FR'+(column+1),position:row+1,code:String(item.sku_code)});
 }
 return positions;
}
