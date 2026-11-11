export const AREAS={picking:'Picking / montagem',carregamento:'Carregamento',descarga:'Descarga',retorno:'Retorno / vazio',repack:'Repack',despejo:'Despejo',reforma:'Reforma de paletes',outras:'Outras atividades',emp_carregamento:'Empilhadores C - carregamento',manobra:'Manobra de caminhões',cheio_b:'Cheio B',conferencia:'Conferência',descarga_cheio:'Descarga de cheio',descarga_vazio:'Descarga de vazio'};
export const GROUPS={
 employees:{label:'Colaboradores do B.O.',table:'bo_employee_directory',name:'employee_name',fields:['employee_name','job_title','shift','active'],description:'Responsáveis por ocorrências no B.O. Digital. Cadastre aqui o novo ajudante para encontrá-lo na pesquisa do B.O.'},
 conferencers:{label:'Conferentes',table:'bo_conferencers',name:'display_name',fields:['display_name','active'],description:'Portal do conferente, B.O., Recebimento, Blitz e Temperatura. O PIN continua no bloco Credenciais e PINs.'},
 forklift:{label:'Empilhadores',table:'receiving_forklift_operators',name:'display_name',fields:['display_name','active'],description:'Portais de descarga e guarda. O PIN continua no bloco Credenciais e PINs.'},
 gate:{label:'Portaria',table:'receiving_gate_users',name:'display_name',fields:['display_name','active'],description:'Pessoas que registram entradas de carretas. O PIN continua no bloco Credenciais e PINs.'},
 repack:{label:'Ajudantes do Repack',table:'repack_workers',name:'display_name',fields:['display_name','active'],description:'Equipe do cronômetro de Repack. Gere ou redefina o PIN no módulo Repack após o cadastro.'},
 productivity:{label:'Produtividade / WLP',table:'wlp_employees',name:'display_name',fields:['display_name','job_title','shift','area','active'],description:'Equipe usada em jornadas e produtividade. O cadastro de responsáveis do B.O. é administrado no grupo Colaboradores do B.O.'},
 panel:{label:'Usuários do painel',table:'app_users',name:'display_name',fields:['display_name','username','role','active'],description:'Contas de acesso ao painel. Novas contas precisam de usuário e senha inicial; editar o cadastro preserva a senha atual.'}
};
export const nameKey=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
function text(v,label,max,required=true){if(typeof v!=='string')throw Error(`Informe ${label}.`);const value=v.replace(/\s+/g,' ').trim();if((required&&value.length<2)||value.length>max)throw Error(`${label}: informe de 2 a ${max} caracteres.`);return value;}
export function preparePerson(group,input={},id=''){
 const g=Object.hasOwn(GROUPS,group)?GROUPS[group]:null;if(!g)throw Error('Grupo inválido.');
 if(id&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('Cadastro inválido.');
 if(typeof input.active!=='boolean')throw Error('Informe a situação do cadastro.');
 const row={[g.name]:text(input[g.name],'o nome completo',group==='productivity'?160:120),active:input.active};
 if(['employees','productivity'].includes(group)){
  row.job_title=text(input.job_title,'a função',160);const shift=input.shift||null;
  if((shift!==null&&!['A','B','C'].includes(shift))||(group==='productivity'&&!shift))throw Error('Informe um turno válido.');row.shift=shift;
 }
 if(group==='productivity'){if(!Object.hasOwn(AREAS,input.area))throw Error('Área inválida.');row.area=input.area;}
 if(group==='panel'){
  const username=String(input.username||'').trim();if(!/^[A-Za-z0-9._-]{2,80}$/.test(username))throw Error('Usuário: use de 2 a 80 letras, números, ponto, hífen ou sublinhado.');
  if(!['admin','viewer'].includes(input.role))throw Error('Perfil inválido.');Object.assign(row,{username,role:input.role});
 }
 return row;
}
export function expectedPerson(group,person){const g=Object.hasOwn(GROUPS,group)?GROUPS[group]:null;if(!g||!person||typeof person!=='object')throw Error('Recarregue o cadastro antes de salvar.');return Object.fromEntries(g.fields.filter(k=>Object.hasOwn(person,k)).map(k=>[k,person[k]]));}
export function publicPerson(group,row){const g=GROUPS[group];return Object.fromEntries(['id',...g.fields].map(k=>[k,row[k]??null]));}
