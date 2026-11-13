export const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export const code=v=>String(v??'').trim().replace(/\.0+$/,'').replace(/^0+(?=\d)/,'');
export function countFields(instruction){const s=norm(instruction);if(s==='tudo')return ['pallets','layers','boxes','units'];if(s==='un'||s==='unidade'||s==='unidades')return ['units'];if(s==='pallet'||s==='palete')return ['pallets'];if(/^(?:pallet|palete) \+ un$/.test(s))return ['pallets','units'];if(/^l e cx(?: \+ un)?$/.test(s))return s.includes('+')?['layers','boxes','units']:['layers','boxes'];throw Error('Instrução de recontagem não reconhecida: '+instruction);}
export function validateItems(items){
 if(!Array.isArray(items)||!items.length||items.length>2000)throw Error('Selecione de 1 a 2.000 produtos.');
 const keys=new Set();return items.map((r,i)=>{const sku=code(r.sku_code),sheet=String(r.source_sheet||'').trim(),row=Number(r.source_row),instruction=String(r.instruction||'').trim();
 if(!/^\d{1,12}$/.test(sku)||!sheet||sheet.length>80||!Number.isSafeInteger(row)||row<1)throw Error('Linha '+(i+1)+': código ou origem inválida.');
 countFields(instruction);const key=sheet+'|'+row;if(keys.has(key))throw Error('Linha de origem repetida.');keys.add(key);
 const clean=(v,max)=>String(v??'').trim().slice(0,max);
 return {source_sheet:sheet,source_row:row,sku_code:sku,sku_name:clean(r.sku_name,300),unit_text:clean(r.unit_text,40),instruction,source_difference:clean(r.source_difference,100),source_frozen:clean(r.source_frozen,100),source_recount:clean(r.source_recount,100),source_ok:r.source_ok===true};
 });
}
export function parseRecountWorkbook(wb,XLSX){
 const items=[],warnings=[];
 for(const [sheetIndex,sheet] of wb.SheetNames.entries()){
  if(wb.Workbook?.Sheets?.[sheetIndex]?.Hidden)continue;
  const headerRows=XLSX.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:'',raw:true,range:'A1:Z30'});let columns=null,start=0;
  for(let i=0;i<Math.min(30,headerRows.length);i++){const h=headerRows[i].map(norm),request=h.findIndex(x=>x==='recontar'||/^recontar - [123][ªa]$/.test(x));if(h.includes('produto')&&request>=0){columns={sku_code:h.indexOf('produto'),sku_name:h.indexOf('descricao'),unit_text:h.findIndex(x=>['un','und','unidade'].includes(x)),instruction:request,source_difference:h.findIndex(x=>['diferenca','diferenca - 1ª'].includes(x)),source_frozen:h.findIndex(x=>['congelada','diferenca congelamento'].includes(x)),source_recount:h.indexOf('recontagem'),source_ok:h.indexOf('ok')};start=i+1;break;}}
  if(!columns){if(/^cheio\s*\d+$/i.test(sheet))warnings.push('Aba '+sheet+': sem cabeçalho de recontagem; não importada.');continue;}
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:'',raw:true});
  for(let i=start;i<rows.length;i++){const row=rows[i],sku=row[columns.sku_code];if(sku===''||sku==null)continue;const item={source_sheet:sheet,source_row:i+1};for(const [key,col]of Object.entries(columns))item[key]=col>=0?row[col]??'':'';const request=String(item.instruction).trim();if(!request||/^[-–—]+$/.test(request)){continue;}items.push(item);}
 }
 return {items:validateItems(items),warnings};
}
export function validateCount(input,instruction,complete=false){const allowed=countFields(instruction),out={};for(const key of ['pallets','layers','boxes','units']){const v=input[key];if(!allowed.includes(key)){out[key]=null;continue;}if(v===''||v==null){if(complete)throw Error('Preencha todos os campos solicitados, inclusive zero.');out[key]=null;continue;}const n=Number(v);if(!Number.isSafeInteger(n)||n<0||n>10000000)throw Error('Informe quantidades inteiras, a partir de zero.');out[key]=n;}return out;}
