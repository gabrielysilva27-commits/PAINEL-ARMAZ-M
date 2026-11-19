import {fittedFont} from './text-fit.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function flowDocument(labels,dates,measure){
 if(labels.length!==dates.length)throw new Error('Preencha a validade de todas as posições.');
 const pages=labels.map((label,index)=>{
  const date=dates[index];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw new Error('Informe uma data válida para cada posição.');
  const nameSize=fittedFont(label.name,990,275,150,measure);
  const codeSize=fittedFont(label.code,990,170,170,measure,1);
  const details=label.details+' · '+label.size;
  const detailSize=fittedFont(details,990,100,70,measure);
  return '<section><div class="code" style="font-size:'+codeSize+'px">'+escape(label.code)+'</div><div class="name" style="font-size:'+nameSize+'px">'+escape(label.name)+'</div><div class="details" style="font-size:'+detailSize+'px">'+escape(details)+'</div><div class="expiry">'+date.split('-').reverse().join('/')+'</div></section>';
 }).join('');
 return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Flow Rack</title><style>@page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#000;background:#fff}section{width:281mm;height:193mm;border:2px solid #000;padding:6mm;display:grid;grid-template-rows:48mm 76mm 30mm 1fr;overflow:hidden;break-inside:avoid;break-after:page}section:last-child{break-after:auto}.code{display:flex;align-items:center;font-weight:900;line-height:1;white-space:nowrap}.name,.details{display:flex;align-items:center;font-weight:900;line-height:1.04;overflow-wrap:anywhere}.expiry{border-top:3px solid #000;display:flex;align-items:center;justify-content:center;font-size:65px;font-weight:900;white-space:nowrap}</style></head><body>'+pages+'</body></html>';
}
export function requestFlowProducts(lookup){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');
  dialog.style.cssText='width:min(720px,94vw);max-height:85vh;border:1px solid #ddd;border-radius:14px;padding:20px';
  const form=document.createElement('form');
  const heading=document.createElement('h2');heading.textContent='Placas do Flow Rack';
  const list=document.createElement('div');
  const error=document.createElement('p');error.setAttribute('role','alert');
  const add=document.createElement('button');add.type='button';add.textContent='+ Produto';
  function addRow(){
   const row=document.createElement('div');row.style.cssText='display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:14px 0';
   const selected=document.createElement('input');selected.type='checkbox';selected.checked=true;selected.setAttribute('aria-label','Imprimir esta placa');
   function field(title,type){
    const label=document.createElement('label');label.style.cssText='display:grid;gap:5px;flex:1 1 140px';
    const caption=document.createElement('span');caption.textContent=title;
    const input=document.createElement('input');input.type=type;input.style.cssText='padding:10px;font:inherit;width:100%;box-sizing:border-box';label.append(caption,input);row.append(label);return input;
   }
   row.append(selected);
   const code=field('Código do produto','text');code.inputMode='numeric';code.pattern='[0-9]{1,12}';code.maxLength=12;code.required=true;
   const date=field('Validade','date');date.required=true;
   selected.onchange=()=>{code.required=selected.checked;date.required=selected.checked;};
   const remove=document.createElement('button');remove.type='button';remove.textContent='Remover';remove.onclick=()=>row.remove();row.append(remove);
   row.flowFields={selected,code,date};list.append(row);
  }
  add.onclick=addRow;
  const actions=document.createElement('div');actions.style.cssText='display:flex;gap:10px;justify-content:flex-end';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancelar';cancel.onclick=()=>dialog.close();
  const print=document.createElement('button');print.type='submit';print.textContent='Imprimir selecionadas';actions.append(cancel,print);
  form.append(heading,list,add,error,actions);
  let result=null,closed=false;
  form.onsubmit=async event=>{
   event.preventDefault();error.textContent='';
   if(!form.reportValidity())return;
   const entries=[...list.children].map(row=>row.flowFields).filter(row=>row.selected.checked).map(row=>({code:row.code.value.trim(),date:row.date.value}));
   if(!entries.length){error.textContent='Selecione pelo menos uma placa.';return;}
   print.disabled=true;add.disabled=true;
   try{
    const labels=[];
    for(const entry of entries)labels.push(await lookup(entry.code));
    if(closed)return;
    result={labels,dates:entries.map(entry=>entry.date)};dialog.close();
   }catch(e){if(!closed)error.textContent=e.message;}
   finally{print.disabled=false;add.disabled=false;}
  };
  dialog.onclose=()=>{closed=true;dialog.remove();resolve(result);};
  addRow();dialog.append(form);document.body.append(dialog);dialog.showModal();
 });
}
