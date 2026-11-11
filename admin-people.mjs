const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/admin-people-api';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
let dialog,root,people=[],groups=[],areas={},group='employees',editing=null,page=0,serial=0,afterSave,saving=false;
const $=id=>root.querySelector('[data-people="'+id+'"]');
async function call(action,payload={}){const token=window.state?.token||localStorage.getItem('pa_session')||'';const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':token},body:JSON.stringify({action,group,...payload})});const d=await r.json();if(!r.ok)throw Error(d.error||'Não foi possível concluir a solicitação.');return d;}
const config=()=>groups.find(x=>x.key===group);
function mount(){
 if(dialog)return;
 const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./admin-people.css?v=20261111-1',import.meta.url).href;document.head.append(css);
 dialog=document.createElement('dialog');dialog.className='people-dialog';dialog.setAttribute('aria-labelledby','peopleAdminTitle');
 dialog.innerHTML='<div class="people-root"><header class="people-heading"><div><p>ADMINISTRAÇÃO</p><h2 id="peopleAdminTitle">Cadastro de pessoas</h2></div><button type="button" data-people="close" aria-label="Fechar cadastro de pessoas">×</button></header><div class="people-toolbar"><label>Cadastro<select data-people="group" aria-label="Grupo de pessoas"><option value="employees">Colaboradores do B.O.</option></select></label><label>Pesquisar<input data-people="search" type="search" placeholder="Nome, função ou turno" autocomplete="off"></label><label>Situação<select data-people="status"><option value="active">Ativos</option><option value="all">Todos</option><option value="inactive">Inativos</option></select></label><button type="button" data-people="refresh">Atualizar</button></div><p class="people-description" data-people="description"></p><p role="status" class="people-message" data-people="message"></p><div class="people-layout"><section class="people-list-panel"><div class="people-list-head"><strong data-people="count"></strong><button type="button" class="people-primary" data-people="new">Novo cadastro</button></div><div class="people-table-wrap"><table><thead><tr><th>Nome</th><th>Dados</th><th>Situação</th><th></th></tr></thead><tbody data-people="rows"></tbody></table></div><div class="people-pagination"><button type="button" data-people="previous">Anterior</button><span data-people="page"></span><button type="button" data-people="next">Próxima</button></div></section><section class="people-editor" data-people="editor"><p>Selecione uma pessoa para editar ou clique em <strong>Novo cadastro</strong>.</p></section></div></div>';
 document.body.append(dialog);root=dialog.querySelector('.people-root');
 $('close').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
 $('group').onchange=()=>{group=$('group').value;page=0;$('search').value='';$('status').value='active';load()};
 for(const id of ['search','status'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=0;renderRows()});
 $('refresh').onclick=load;$('new').onclick=()=>edit(null);$('previous').onclick=()=>{page--;renderRows()};$('next').onclick=()=>{page++;renderRows()};
 $('rows').onclick=e=>{const b=e.target.closest('[data-person]');if(b)edit(people.find(x=>x.id===b.dataset.person))};
}
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error)}
async function load(){
 if(saving)return;
 const ticket=++serial;editing=null;$('editor').innerHTML='<p>Selecione uma pessoa para editar ou clique em <strong>Novo cadastro</strong>.</p>';message('Carregando pessoas...');$('group').disabled=true;$('new').disabled=true;$('rows').innerHTML='';
 try{const d=await call('list');if(ticket!==serial)return;people=d.people;groups=d.groups;areas=d.areas;
  $('group').innerHTML=groups.map(g=>'<option value="'+esc(g.key)+'">'+esc(g.label)+'</option>').join('');$('group').value=group;$('description').textContent=config().description;page=0;message('');renderRows();
 }catch(e){message(e.message,true)}finally{if(ticket===serial){$('group').disabled=false;$('new').disabled=!config()}}
}
function renderRows(){
 const c=config();if(!c)return;const query=normalize($('search').value),status=$('status').value;
 const matches=people.filter(p=>(status==='all'||p.active===(status==='active'))&&normalize([p[c.name],p.job_title,p.shift,p.username,p.area&&areas[p.area]].filter(Boolean).join(' ')).includes(query));
 const pages=Math.max(1,Math.ceil(matches.length/20));page=Math.max(0,Math.min(page,pages-1));const visible=matches.slice(page*20,(page+1)*20);
 $('count').textContent=matches.length+' pessoa(s)';$('page').textContent=(page+1)+' / '+pages;$('previous').disabled=page===0;$('next').disabled=page+1===pages;
 $('rows').innerHTML=visible.map(p=>'<tr><td>'+esc(p[c.name])+'</td><td>'+esc([p.job_title,p.shift&&'Turno '+p.shift,p.area&&areas[p.area],p.username,p.role==='admin'?'ADM':p.role==='viewer'?'Consulta':''].filter(Boolean).join(' · ')||'—')+'</td><td><span class="people-status '+(p.active?'active':'inactive')+'">'+(p.active?'Ativo':'Inativo')+'</span></td><td><button type="button" data-person="'+esc(p.id)+'">Editar</button></td></tr>').join('')||'<tr><td colspan="4">Nenhuma pessoa encontrada. Use Novo cadastro para adicionar.</td></tr>';
}
function edit(person){
 if(saving)return;
 editing=person||null;const c=config(),has=f=>c.fields.includes(f),field=(label,name,type='text',value='',required=true)=>'<label>'+label+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+(required?'required':'')+' maxlength="'+(name==='username'?80:name==='initial_password'?200:160)+'" autocomplete="'+(name==='initial_password'?'new-password':'off')+'"></label>';
 let html='<h3>'+(person?'Editar pessoa':'Novo cadastro')+'</h3><form data-people="form">'+field('Nome completo',c.name,'text',person?.[c.name]||'');
 if(has('job_title'))html+=field('Função','job_title','text',person?.job_title||'');
 if(has('shift'))html+='<label>Turno<select name="shift" '+(group==='productivity'?'required':'')+'><option value="">Não informado</option>'+['A','B','C'].map(x=>'<option '+(person?.shift===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label>';
 if(has('area'))html+='<label>Área<select name="area" required><option value="">Selecione</option>'+Object.entries(areas).map(([k,v])=>'<option value="'+esc(k)+'" '+(person?.area===k?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label>';
 if(group==='panel')html+=field('Usuário de acesso','username','text',person?.username||'')+'<label>Perfil<select name="role"><option value="viewer">Consulta</option><option value="admin" '+(person?.role==='admin'?'selected':'')+'>ADM</option></select></label>'+(person?'':field('Senha inicial (mínimo 8 caracteres)','initial_password','password'));
 html+='<label>Situação<select name="active"><option value="true">Ativo</option><option value="false" '+(person?.active===false?'selected':'')+'>Inativo</option></select></label><p class="people-editor-note">'+(group==='employees'?'Ao salvar como ativo, o nome fica disponível na pesquisa de responsáveis do B.O. Digital.':group==='productivity'?'A área e o turno valem para o cadastro; jornadas e atividades já lançadas são preservadas.':group==='panel'?'A edição mantém a senha atual. Para trocar sua senha, use Minha conta.':'O cadastro não altera o PIN atual. Novas pessoas devem receber um PIN pelo controle de credenciais do respectivo módulo.')+'</p><p class="people-editor-note">Inativar preserva o histórico e retira a pessoa das novas seleções. Não existe exclusão definitiva nesta tela.</p><p data-people="formError" class="people-form-error" role="alert"></p><div class="people-form-actions"><button type="button" data-people="cancel">Cancelar</button><button type="submit" class="people-primary">Salvar cadastro</button></div></form>';
 $('editor').innerHTML=html;$('cancel').onclick=()=>{editing=null;$('editor').innerHTML='<p>Selecione uma pessoa para editar ou clique em <strong>Novo cadastro</strong>.</p>'};
 $('form').onsubmit=save;$('form').elements[c.name].focus();
}
async function save(event){
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type="submit"]'),data=Object.fromEntries(new FormData(form)),c=config(),original=editing;
 const person=Object.fromEntries(c.fields.map(f=>[f,f==='active'?data[f]==='true':f==='shift'?data[f]||null:data[f]]));
 $('formError').textContent='';button.disabled=true;$('group').disabled=true;saving=true;
 try{const d=await call('save',{id:original?.id||null,person,expected:original,initial_password:group==='panel'&&!original?data.initial_password:undefined});
  const at=people.findIndex(x=>x.id===d.person.id);if(at<0)people.push(d.person);else people[at]=d.person;people.sort((a,b)=>a[c.name].localeCompare(b[c.name],'pt-BR'));
  message(!d.person.active?'Cadastro salvo como inativo. O histórico foi mantido.':group==='employees'?'Cadastro salvo. O colaborador ativo já pode ser pesquisado no B.O. Digital.':'Cadastro salvo.');renderRows();saving=false;edit(d.person);
  if(afterSave)try{await afterSave({group,person:d.person})}catch{message('Cadastro salvo. Atualize o bloco Credenciais e PINs para recarregar a lista.')};window.dispatchEvent(new CustomEvent('admin:people-changed',{detail:{group}}));
 }catch(e){if($('formError'))$('formError').textContent=e.message}
 finally{saving=false;button.disabled=false;$('group').disabled=false}
}
export async function openPeopleAdmin(options={}){if(window.state?.user?.role!=='admin')throw Error('Área restrita ao ADM.');mount();afterSave=options.onSaved;group='employees';$('group').value=group;$('search').value='';$('status').value='active';if(!dialog.open)dialog.showModal();await load();}
