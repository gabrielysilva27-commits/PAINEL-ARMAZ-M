export const AREAS={picking:{label:'Picking / montagem',unit:'paletes'},carregamento:{label:'Carregamento',unit:'paletes'},descarga:{label:'Descarga',unit:'paletes'},retorno:{label:'Retorno',unit:'caixas'},repack:{label:'Repack',unit:'caixas'},despejo:{label:'Despejo',unit:'caixas'},reforma:{label:'Reforma de paletes',unit:'paletes'},outras:{label:'Outras atividades',unit:'tarefas'}};
export const localDay=v=>new Date(v).toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
Object.assign(AREAS,{emp_carregamento:{label:'Empilhadores C — carregamento',unit:'HL'},manobra:{label:'Manobra de caminhões',unit:'carros'},cheio_b:{label:'Cheio B',unit:'paletes'},conferencia:{label:'Conferência',unit:'mapas'},descarga_cheio:{label:'Descarga de cheio',unit:'carretas'},descarga_vazio:{label:'Descarga de vazio',unit:'carros'}});
export function summarize(activities,attendance,targets){
 const units=new Map(), hours=new Map();
 const key=x=>`${x.employee_id}|${x.reference_date}|${x.area}`;
 for(const x of activities){const k=key(x),r=units.get(k)||{employee_id:x.employee_id,reference_date:x.reference_date,area:x.area,quantity:0,task_minutes:0};r.quantity+=Number(x.quantity);r.task_minutes+=Number(x.duration_minutes);units.set(k,r)}
 for(const x of attendance){const k=key(x),r=hours.get(k)||{regular:0,overtime:0};r.regular+=Number(x.regular_hours);r.overtime+=Number(x.overtime_hours);hours.set(k,r)}
 const rows=[...new Set([...units.keys(),...hours.keys()])].map(k=>{const [employee_id,reference_date,area]=k.split('|'),u=units.get(k),h=hours.get(k);return{employee_id,reference_date,area,quantity:u?.quantity??null,task_minutes:u?.task_minutes??null,regular_hours:h?.regular??null,overtime_hours:h?.overtime??null,labor_hours:h?h.regular+h.overtime:null,complete:!!u&&!!h&&h.regular+h.overtime>0}});
 const areas=Object.keys(AREAS).map(area=>{const r=rows.filter(x=>x.area===area),qty=r.reduce((a,x)=>a+(x.quantity||0),0),hh=r.reduce((a,x)=>a+(x.labor_hours||0),0),complete=r.length>0&&r.every(x=>x.complete),target=targets.find(x=>x.area===area)?.units_per_labor_hour;return{area,quantity:qty,labor_hours:hh,missing:r.filter(x=>!x.complete).length,productivity:complete?qty/hh:null,target:target?Number(target):null}});
 return{rows,areas};
}
export function simulate({volume,target,hours,days,availability,headcount,overtime_hours=0,area}){
 if(![volume,target,hours,days,availability,headcount].every(Number.isFinite)||volume<0||target<=0||hours<=0||hours>24||!Number.isInteger(days)||days<1||days>7||availability<=0||availability>1||!Number.isInteger(headcount)||headcount<0)throw Error('Informe volume, meta, jornada, dias, disponibilidade e quadro válidos.');
 if(!Number.isFinite(overtime_hours)||overtime_hours<0||overtime_hours>13||(['emp_carregamento','descarga_cheio','descarga_vazio'].includes(area)&&overtime_hours!==0))throw Error('HE semanal inválida. Empilhadores não recebem horas extras; demais colaboradores têm 13h mensais.');
 const required_hours=volume/target,capacity_per_person=hours*days*availability+overtime_hours,required_people=Math.ceil(required_hours/capacity_per_person);
 return{required_hours,capacity_per_person,required_people,gap:required_people-headcount};
}
export function repackActivities(tasks,employees){return tasks.filter(x=>x.status==='completed'&&x.quantity_boxes>0&&x.duration_seconds>0).map(x=>{const e=employees.find(e=>e.repack_worker_id===x.worker_id);return{employee_id:e?.id||null,reference_date:localDay(x.started_at),area:x.process_type==='despejo'?'despejo':'repack',quantity:Number(x.quantity_boxes),duration_minutes:Number(x.duration_seconds)/60,reference:`Repack #${x.id}`,source:'repack',source_id:x.id}})}

