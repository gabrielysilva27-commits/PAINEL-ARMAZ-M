import {fittedFont} from './text-fit.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function flowDocument(labels,dates,measure){
 if(labels.length!==dates.length)throw new Error('Preencha a validade de todas as posições.');
 const pages=labels.map((label,index)=>{
  const date=dates[index];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw new Error('Informe uma data válida para cada posição.');
  const nameSize=fittedFont(label.name,990,235,125,measure);
  const details=label.details+' · '+label.size;
  const detailSize=fittedFont(details,990,100,70,measure);
  return '<section><div class="code">'+escape(label.code)+'</div><div class="name" style="font-size:'+nameSize+'px">'+escape(label.name)+'</div><div class="details" style="font-size:'+detailSize+'px">'+escape(details)+'</div><div class="expiry">'+date.split('-').reverse().join('/')+'</div></section>';
 }).join('');
 return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Flow Rack</title><style>@page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#000;background:#fff}section{width:281mm;height:193mm;border:2px solid #000;padding:6mm;display:grid;grid-template-rows:24mm 64mm 30mm 1fr;overflow:hidden;break-inside:avoid;break-after:page}section:last-child{break-after:auto}.code{font-size:65px;font-weight:900}.name,.details{display:flex;align-items:center;font-weight:900;line-height:1.04;overflow-wrap:anywhere}.expiry{border-top:3px solid #000;display:flex;align-items:center;justify-content:center;font-size:145px;font-weight:900;white-space:nowrap}</style></head><body>'+pages+'</body></html>';
}
export function requestFlowDates(labels){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');
  dialog.style.cssText='width:min(720px,94vw);max-height:85vh;border:1px solid #ddd;border-radius:14px;padding:20px';
  const form=document.createElement('form');
  const heading=document.createElement('h2');heading.textContent='Validades do Flow Rack';form.append(heading);
  const inputs=labels.map(label=>{
   const row=document.createElement('label');row.style.cssText='display:grid;grid-template-columns:1fr 170px;gap:12px;align-items:center;margin:12px 0';
   const text=document.createElement('span');text.textContent=label.street+' · posição '+label.position+' · '+label.code+' · '+label.name+' · '+label.size;
   const input=document.createElement('input');input.type='date';input.required=true;input.style.cssText='padding:10px;font:inherit';row.append(text,input);form.append(row);return input;
  });
  const actions=document.createElement('div');actions.style.cssText='display:flex;gap:10px;justify-content:flex-end';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancelar';cancel.onclick=()=>dialog.close();
  const print=document.createElement('button');print.type='submit';print.textContent='Imprimir Flow Rack';actions.append(cancel,print);form.append(actions);
  let result=null;
  form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;result=inputs.map(input=>input.value);dialog.close();};
  dialog.onclose=()=>{dialog.remove();resolve(result);};
  dialog.append(form);document.body.append(dialog);dialog.showModal();
 });
}
