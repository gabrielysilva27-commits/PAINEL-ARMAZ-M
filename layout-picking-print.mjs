const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function layoutPrintDocument({mapHtml,month,usedSlots,overflow=0}){
 if(!/^\d{4}-\d{2}$/.test(month)||!mapHtml)throw new Error('Carregue um mês do layout antes de imprimir.');
 const [year,number]=month.split('-');
 return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Layout do Picking '+escape(number+'/'+year)+'</title><style>'+`
 @page{size:A4 landscape;margin:8mm}
 *{box-sizing:border-box}html,body{margin:0;padding:0;background:white;color:#253342;font-family:Arial,Helvetica,sans-serif}
 .sheet{position:relative;width:281mm;height:193mm;overflow:hidden;break-inside:avoid;page-break-inside:avoid}
 .content{position:absolute;top:0;left:0;width:1020px;transform-origin:top left}
 .print-heading{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #cad2db;padding-bottom:10px;margin-bottom:14px}
 h1{font-size:23px;margin:0 0 5px}.subtitle{font-size:12px;margin:0}.legend{display:flex;gap:14px;font-size:12px}.legend i{display:inline-block;width:12px;height:12px;margin-right:4px;vertical-align:middle}
 .a{background:#1479b8;color:white}.b{background:#f1df00;color:#33300a}.c{background:#ed2024;color:white}
 .croqui-canvas{width:100%;color:#253342}.croqui-top{display:flex;gap:20px;align-items:flex-end}.croqui-block{flex:none;border:1px solid #aab8c8;border-radius:6px;padding:6px;background:white}.croqui-block>header{display:none}.croqui-lanes{display:flex;gap:0}.croqui-lane{width:46px;min-width:46px}.croqui-lane-id{height:38px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;padding:0 1px 5px;text-align:center;overflow:hidden}.croqui-lane-id strong{font-size:10px;line-height:1;white-space:nowrap}.croqui-lane-id span{font-size:7px;line-height:1.08;max-width:100%;overflow:hidden}
 .picking-slot{width:46px;height:19px;display:flex;justify-content:center;align-items:center;border:1px solid #fff8;font-size:10px;font-weight:700;overflow:hidden;opacity:1!important}.picking-slot.empty{background:#f1f5f9;border:1px solid #dbe3ed}.picking-slot.empty:after{content:'·';color:#94a3b8}
 .croqui-corridor{height:32px;margin:0;border:0;background:white}.croqui-bottom{display:flex;justify-content:flex-end;gap:32px;align-items:flex-start}.croqui-flow{border-right:5px solid #f47a20}.croqui-flow .picking-slot{border-bottom:1px solid #64748b}.croqui-caption{font-size:11px;line-height:1.35;margin:12px 0 0}.print-note{font-size:10px;margin:8px 0 0;color:#586575}
 @media print{*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
 `+'</style></head><body><section class="sheet"><div class="content"><header class="print-heading"><div><h1>Layout do Picking · '+escape(number+'/'+year)+'</h1><p class="subtitle">Mapa completo · 18 ruas · '+escape(usedSlots)+' / 207 vagas de rua ocupadas · Flow Rack complementar</p></div><div class="legend"><span><i class="a"></i>Curva A</span><span><i class="b"></i>Curva B</span><span><i class="c"></i>Curva C</span></div></header>'+mapHtml+'<p class="print-note">'+(overflow?escape(overflow)+' SKUs sem posição: consultar revisão de capacidade no painel. · ':'')+'Impressão do mapa completo, sem recorte dos filtros de família ou curva.</p></div></section></body></html>';
}
export function printPickingLayout(snapshot){
 const html=layoutPrintDocument(snapshot);
 return new Promise((resolve,reject)=>{
  const frame=document.createElement('iframe');frame.title='Impressão do layout do picking';
  Object.assign(frame.style,{position:'fixed',width:'1px',height:'1px',left:'0',bottom:'0',opacity:'0',pointerEvents:'none'});
  frame.onload=()=>{try{
   const doc=frame.contentDocument,sheet=doc.querySelector('.sheet'),content=doc.querySelector('.content');
   const width=Math.max(content.offsetWidth,content.scrollWidth),height=Math.max(content.offsetHeight,content.scrollHeight);
   const scale=Math.min(sheet.clientWidth/width,sheet.clientHeight/height,1);
   content.style.transform='scale('+scale+')';content.style.left=Math.max(0,(sheet.clientWidth-width*scale)/2)+'px';
   frame.contentWindow.addEventListener('afterprint',()=>setTimeout(()=>frame.remove(),1000),{once:true});
   frame.contentWindow.focus();frame.contentWindow.print();resolve();
  }catch(error){frame.remove();reject(error);}};
  frame.srcdoc=html;document.body.appendChild(frame);
 });
}
