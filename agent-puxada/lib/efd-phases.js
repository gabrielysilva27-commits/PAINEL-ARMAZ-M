const fs=require('fs');
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[_\s]+/g,' ').trim().toUpperCase();
function iso(v){const m=String(v||'').trim().match(/^(\d{2})\/(\d{2})\/(2026)$/);if(!m)return null;const out=m[3]+'-'+m[2]+'-'+m[1];return new Date(out+'T12:00:00Z').toISOString().slice(0,10)===out?out:null}
function split(line){const out=[];let value='',quote=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quote&&line[i+1]==='"'){value+='"';i++}else quote=!quote}else if(c===';'&&!quote){out.push(value.trim());value=''}else value+=c}out.push(value.trim());return out}
function parse(file){
 const bytes=fs.readFileSync(file);let text=bytes.toString('utf8');if((text.match(/�/g)||[]).length>3)text=bytes.toString('latin1');
 const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/),header=lines.findIndex(line=>{const c=split(line).map(norm);return c.includes('MAPA')&&c.includes('FASE')&&c.includes('DTOPER')&&c.includes('HROPER')});
 if(header<0)throw Error('EFD_PHASE_HEADER_NOT_FOUND');
 const names=split(lines[header]).map(norm),col=name=>names.indexOf(name),columns={map:col('MAPA'),phase:col('FASE'),vehicle:col('VEICULO'),plate:col('PLACA'),date:col('DTOPER'),hour:col('HROPER'),type:col('TIPO MAPA'),fleet:col('FROTA MAPA')>=0?col('FROTA MAPA'):col('FROTA CADASTRO')};
 if(Object.values(columns).some(x=>x<0))throw Error('EFD_PHASE_COLUMNS_MISSING');
 const maps=new Map();let events=0;
 for(const line of lines.slice(header+1)){
  const r=split(line),id=r[columns.map],vehicle=r[columns.vehicle],plate=String(r[columns.plate]||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(!/^\d+$/.test(id)||!/^\d+$/.test(vehicle)||plate.length<5)continue;
  const key=String(Number(id));if(!maps.has(key))maps.set(key,{map_id:key,vehicle:String(Number(vehicle)),plate,map_type:'',fleet_type:'',departures:[],arrivals:[],physical:[]});
  const map=maps.get(key);if(r[columns.type])map.map_type=r[columns.type];if(r[columns.fleet])map.fleet_type=r[columns.fleet];
  const date=iso(r[columns.date]),hour=String(r[columns.hour]||'').trim(),phase=norm(r[columns.phase]);if(!date||!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(hour))continue;
  const at=date+'T'+hour+(hour.length===5?':00':'');
  if(phase.startsWith('SAIDA CDD'))map.departures.push(at);else if(phase.startsWith('ENTRADA CDD'))map.arrivals.push(at);else if(phase==='PC FISICA')map.physical.push(at);else continue;events++;
 }
 const rows=[];for(const map of maps.values()){
  const departure=map.departures.sort()[0]||null,arrival=map.arrivals.sort().find(at=>!departure||at>=departure)||null;
  const physical=map.physical.sort().find(at=>!arrival&&!departure||at>=(arrival||departure))||null;
  if(!departure&&!arrival&&!physical)continue;
  rows.push({map_id:map.map_id,vehicle:map.vehicle,plate:map.plate,map_type:map.map_type,fleet_type:map.fleet_type,reference_date:departure?departure.slice(0,10):null,arrival_at:arrival,physical_at:physical});
 }
 if(!rows.length)throw Error('EFD_PHASE_NO_MAPS');return{rows,events,source_file:require('path').basename(file)};
}
module.exports={parse,iso,split,norm};
