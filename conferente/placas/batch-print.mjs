import {productLabel} from './product-label.mjs?v=20261110-batch-1';
import {fittedFont} from './text-fit.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function batchLabels(positions){
 const missing=[...new Set(positions.filter(x=>!x.product?.description||!productLabel(x.product).size).map(x=>x.code))];
 if(missing.length)throw new Error('Não foi possível gerar todas as placas. Confira descrição/volume dos códigos: '+missing.join(', ')+'. Nenhuma posição foi omitida.');
 if(!positions.length)throw new Error('O layout não possui posições preenchidas.');
 return positions.map(x=>({...productLabel(x.product),street:x.street,position:x.position}));
}
export function batchDocument(labels,measure){
 const pages=labels.map(label=>{
  const name=fittedFont(label.name,710,284,132,measure),details=fittedFont(label.details,710,106,65,measure),size=fittedFont(label.size,710,242,250,measure,1);
  let code=245;while(code>10&&measure(label.code,code)>650)code--;
  return '<section class="page"><article class="sign"><div class="sku"><span style="font-size:'+code+'px">'+escape(label.code)+'</span></div><div class="description"><div class="name"><span style="font-size:'+name+'px">'+escape(label.name)+'</span></div><div class="details"><span style="font-size:'+details+'px">'+escape(label.details)+'</span></div><div class="size"><span style="font-size:'+size+'px">'+escape(label.size)+'</span></div></div></article></section>';
 }).join('');
 return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Placas do Picking</title><style>'+`
 @page{size:A4 landscape;margin:8mm}
 *{box-sizing:border-box}html,body{margin:0;padding:0;width:281mm;font-family:Arial,Helvetica,sans-serif;color:black;background:white}
 .page{position:relative;width:281mm;height:193mm;margin:0;padding:0;overflow:hidden;break-inside:avoid;break-after:page;page-break-inside:avoid;page-break-after:always}
 .page:last-child{break-after:auto;page-break-after:auto}
 .sign{position:absolute;inset:0;border:1px solid black;padding:20px;display:grid;grid-template-columns:25% 5% 70%;font-weight:900}
 .sku{position:relative;min-width:0}.sku span{position:absolute;left:50%;top:50%;white-space:nowrap;transform:translate(-50%,-50%) rotate(-90deg);line-height:1}
 .description{grid-column:3;min-width:0;min-height:0;display:grid;grid-template-rows:minmax(0,44fr) minmax(0,18fr) minmax(0,38fr);padding:8px 0}
 .name,.details,.size{min-width:0;min-height:0;display:flex;align-items:center;line-height:1.04}.name span,.details span,.size span{display:block;width:100%}.details{border-top:2px solid black;padding-top:10px}.size{align-items:flex-end;white-space:nowrap;line-height:1}
 `+'</style></head><body>'+pages+'</body></html>';
}
export function printBatch(html){
 return new Promise((resolve,reject)=>{
  const frame=document.createElement('iframe');frame.title='Impressão das placas do picking';
  Object.assign(frame.style,{position:'fixed',width:'1px',height:'1px',left:'0',bottom:'0',opacity:'0',pointerEvents:'none'});
  frame.onload=()=>{try{frame.contentWindow.addEventListener('afterprint',()=>{setTimeout(()=>frame.remove(),1000);},{once:true});frame.contentWindow.focus();frame.contentWindow.print();resolve();}catch(error){frame.remove();reject(error);}};
  frame.srcdoc=html;document.body.appendChild(frame);
 });
}
