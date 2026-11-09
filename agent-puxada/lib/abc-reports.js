'use strict';
const fs=require('fs'),path=require('path');
const efd=require('./efd-sync'),{norm}=require('./abc-core');
function records(text){const out=[];let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===';'&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))out.push(row);row=[];field='';}else field+=c;}if(quoted)throw Error('ABC_CSV_UNCLOSED_QUOTE');if(field||row.length){row.push(field);out.push(row);}return out;}
function read(file){const b=fs.readFileSync(file);let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(b);}catch{text=new TextDecoder('windows-1252').decode(b);}return records(text.replace(/^\uFEFF/,''));}
function number(value){let s=String(value??'').trim().replace(/\s/g,'');if(!s)return null;if(!/^-?\d[\d.,]*$/.test(s))throw Error('ABC_INVALID_NUMBER: '+s);if(s.includes(',')&&s.includes('.')){s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');}else if(s.includes(','))s=s.replace(',','.');const n=Number(s);if(!Number.isFinite(n))throw Error('ABC_INVALID_NUMBER');return n;}
function salesRows(rows){let h=-1,code=-1,name=-1,total=-1;for(let i=0;i<Math.min(rows.length,15);i++){const hs=rows[i].map(norm),c=hs.findIndex(x=>['produto','cod produto','codigo produto'].includes(x)),t=hs.lastIndexOf('total');if(c>=0&&t>=0){h=i;code=c;name=hs.findIndex(x=>['nome produto','descricao produto','desc produto'].includes(x));total=t;break;}}if(h<0)throw Error('ABC_030519_HEADERS_MISSING');const values=new Map();for(const row of rows.slice(h+1)){if(!/^\d+$/.test(String(row[code]||'').trim()))continue;const sku=String(Number(row[code])),q=number(row[total]);if(q==null)continue;const r=values.get(sku)||{sku_code:sku,boxes:0,name:name<0?'':row[name]||''};r.boxes+=q;values.set(sku,r);}if(!values.size)throw Error('ABC_030519_EMPTY');return[...values.values()];}
function parseSales(file){return salesRows(read(file));}
function pickingRows(parsed,job){const values=new Map(),dates=new Set();let excluded=0;for(const r of parsed.rows){if(+r.map<+job.map_from||+r.map>+job.map_to)throw Error('ABC_OCP_MAP_OUTSIDE_RANGE');if(r.date<job.date_from||r.date>job.date_to){excluded++;continue;}dates.add(r.date);if(r.closed)continue;if(!Number.isFinite(r.boxes))throw Error('ABC_OCP_INVALID_BOXES');const v=values.get(r.product)||{sku_code:r.product,boxes:0,name:r.raw_values[20]||''};v.boxes+=r.boxes;values.set(r.product,v);}if(!dates.size||!values.size)throw Error('ABC_OCP_EMPTY_PERIOD');return{rows:[...values.values()],dates:[...dates].sort(),excluded_rows:excluded};}
function fileDate(name){const m=/^MAPAS[^0-9]*(\d{2})[._-](\d{2})[._-](\d{4}|\d{2})\.xlsx$/i.exec(name);if(!m)return null;const d=(m[3].length===2?'20'+m[3]:m[3])+'-'+m[2]+'-'+m[1];if(new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d)throw Error('ABC_INVALID_MAP_FILE_DATE');return d;}
function mapNumbersFromSheets(sheets){
  const numbers=[];
  for(const sheet of sheets){let columns=[],headerSeen=false;const legacy=[];for(const line of sheet.rows){const cells={};for(const cell of line.split(/ \| (?=[A-Z]+\d+:)/)){const m=/^([A-Z]+)\d+:(.*)$/.exec(cell);if(m)cells[m[1]]=m[2];}
    if(Object.keys(cells).length)legacy.push(cells);
    const headers=Object.entries(cells).filter(([,v])=>['mapa','mapas','nr mapa','n mapa','no mapa','nro mapa','numero mapa'].includes(norm(v))).map(([col])=>col);
    if(headers.length){columns=headers;headerSeen=true;continue;}
    for(const col of columns){const value=String(cells[col]||'').trim();if(/^\d{1,12}(?:\.0+)?$/.test(value)&&Number(value)>0)numbers.push(Number(value));}
  }
    // Observed historical MAPAS layout: no header, A=map, B=plate, C=vehicle.
    // Require every nonempty row to match all three fields before accepting it.
    if(!headerSeen&&legacy.length&&legacy.every(c=>/^\d{1,12}$/.test(String(c.A||'').trim())&&Number(c.A)>0&&/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(String(c.B||'').trim().toUpperCase())&&/^\d{1,6}$/.test(String(c.C||'').trim())))numbers.push(...legacy.map(c=>Number(c.A)));
  }
  if(!numbers.length)throw Error('ABC_MAP_COLUMN_MISSING: '+JSON.stringify(sheets.map(s=>({sheet:s.sheet,rows:s.rows.slice(0,5)}))).slice(0,1500));
  return numbers;
}
function mapNumbers(root,file){
  // Only a map ID is needed here. Older MAPAS files do not necessarily have
  // the plate and vehicle columns required by the EFC reconciliation parser.
  try{const p=efd.mapsRows(root,file);if(p){const n=[...p.rows,...p.excluded].map(x=>String(x.map||'')).filter(x=>/^\d{1,12}$/.test(x)).map(Number);if(n.length)return n;}}catch{}
  return mapNumbersFromSheets(efd.xlsxPreview(fs.readFileSync(path.join(root,file.relative_path)),5000));
}
function mapBounds(root,job){
  // Scan the configured folder, including older months; never infer map IDs.
  const base=root.replace(/[\\/]+$/,''),byYear=/[\\/]\d{4}$/.test(base),roots=byYear?Array.from({length:+job.date_to.slice(0,4)-+job.date_from.slice(0,4)+1},(_,i)=>base.slice(0,-4)+(+job.date_from.slice(0,4)+i)):[root];
  const scans=roots.map(root=>({root,scan:efd.inventory(root)}));for(const {scan} of scans)if(scan.errors.length||scan.files.length>=5000)throw Error('ABC_MAP_INVENTORY_INCOMPLETE: '+scan.errors.slice(0,3).join(' | '));
  const files=scans.flatMap(({root,scan})=>scan.files.map(f=>({...f,root,date:fileDate(f.name)}))).filter(f=>f.date&&f.date>=job.date_from&&f.date<=job.date_to).sort((a,b)=>a.date.localeCompare(b.date)||b.modified_at.localeCompare(a.modified_at));
  if(!files.length)throw Error('ABC_MAP_FILES_MISSING: '+job.date_from+' até '+job.date_to);
  const firstDate=files[0].date,lastDate=files.at(-1).date;
  // Exact boundary dates are required. Missing files must be resolved, not
  // silently replaced by another operating day.
  if(firstDate!==job.date_from||lastDate!==job.date_to)throw Error('ABC_BOUNDARY_DATE_MISSING: encontrados '+firstDate+' a '+lastDate);
  function boundary(date,smallest){const candidates=files.filter(f=>f.date===date),sets=[];for(const f of candidates){const nums=mapNumbers(f.root,f);sets.push({file:roots.length>1?path.join(f.root,f.relative_path):f.relative_path,value:smallest?Math.min(...nums):Math.max(...nums)});}if(new Set(sets.map(x=>x.value)).size!==1)throw Error('ABC_CONFLICTING_BOUNDARY_FILES: '+date);return sets[0];}
  const first=boundary(firstDate,true),last=boundary(lastDate,false);if(first.value>last.value)throw Error('ABC_MAP_RANGE_REVERSED');
  return{map_from:String(first.value),map_to:String(last.value),first_date:firstDate,last_date:lastDate,first_file:first.file,last_file:last.file,files_found:files.length};
}
module.exports={read,records,number,salesRows,parseSales,pickingRows,mapBounds,fileDate,mapNumbersFromSheets};
