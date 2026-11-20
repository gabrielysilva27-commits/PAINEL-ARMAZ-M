import {parseInterview} from './interview-document.mjs?v=20261120-paper';
(() => {
  const $ = id => document.getElementById(id);
  const questions = [
    ['Estava com disposição (bem estar) para executar o trabalho?', 'Por quê?'],
    ['Possui reincidência de quebra na operação?', 'Qual?'],
    ['Estava fazendo uso dos EPIs corretamente?', 'Por quê?'],
    ['EPIs em condição de uso?', 'Por quê?'],
    ['Foi treinado no manual de transporte seguro no local de trabalho?'],
    ['Foi treinado no manual de manuseio de materiais?'],
    ['Verificou o peso e equilíbrio da carga?'],
    ['Manuseou o produto da forma correta?', 'Como? Demonstre.'],
    ['Foi treinado para atuar na área da ocorrência (integração na função)?'],
    ['Foi treinado no plano de tráfego?'],
    ['Realizou avaliação de risco do local?'],
    ['A área da ocorrência possui iluminação adequada?'],
    ['O piso da área da ocorrência está livre de desníveis?'],
    ['A carga estava disposta da forma correta (organizada, com fitilho, palete bom, garrafeiras em bom estado)?', 'Qual?'],
    ['Realizou o checklist da empilhadeira?', null, true],
    ['Estava trafegando de ré no momento do manuseio do produto?', null, true],
    ['Foi utilizado o extensor dos garfos para manuseio do produto?', null, true],
    ['Fez uso do equipamento correto para aquela tarefa?'],
    ['São disponibilizados equipamentos suficientes para operação?', 'Qual?'],
    ['A quebra foi registrada pelo conferente no B.O.?']
  ];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const options = ['Repack','Cheio','Vazio','Devolução','Bloqueio','Picking'];
  const today = () => new Date().toLocaleDateString('sv-SE', {timeZone:'America/Sao_Paulo'});
  let loaded = '';
  $('interviewFields').innerHTML = `
    <div class="interview-grid">
      <label>Data da entrevista<input name="interview_date" type="date" required></label>
      <label>Data da quebra<input name="break_date" type="date" required></label>
      <label>Área<select name="area" required><option value="">Selecione</option>${options.map(x=>`<option>${x}</option>`).join('')}</select></label>
      <label>Funcionário<input name="employee" required maxlength="100"></label>
      <label>Função<input name="job" required maxlength="100"></label>
    </div>
    <h3>Entrevista</h3>
    <div class="interview-questions">${questions.map(([q,detail,na],i)=>`<fieldset class="interview-question"><legend>${i+1}. ${esc(q)}</legend><div class="interview-choices">${['Sim','Não',...(na?['N/A']:[])].map(v=>`<label><input type="radio" name="q${i+1}" value="${v}" required> ${v}</label>`).join('')}</div>${detail?`<label class="interview-detail">${esc(detail)}<input name="detail${i+1}" maxlength="180"></label>`:''}</fieldset>`).join('')}</div>
    <label class="interview-notes">Considerações<textarea name="notes" rows="3" maxlength="600"></textarea></label>
    <div class="interview-grid"><label>Nome do gestor<input name="manager" maxlength="100"></label><label>Nome do técnico de controle<input name="technician" maxlength="100"></label></div>
    <p class="interview-signature">Assinaturas do funcionário, gestor e técnico de controle: coletar no documento impresso, se necessário. Os nomes digitados não substituem assinaturas.</p>`;
  const form = $('interviewForm');
  const field = name => form.elements.namedItem(name);
  function areaFromLocation(location) {
    const value = (location || '').toLowerCase();
    if(value.includes('bloqueio')) return 'Bloqueio';
    if(value.includes('devolução')) return 'Devolução';
    if(value.includes('picking')) return 'Picking';
    if(value.includes('repack')) return 'Repack';
    if(value.includes('vasilhame') || value.includes('retornável')) return 'Vazio';
    return 'Cheio';
  }
  function syncFromBo() {
    if(!field('interview_date').value) field('interview_date').value=today();
    field('break_date').value=$('occurrenceDate').value;
    field('area').value=areaFromLocation($('locationSelect').value);
    field('employee').value=$('employeeInput').value;
    field('job').value=$('employeeFunction').value;
  }
  function hydrate() {
    const report=$('interviewReport').value;
    if(report===loaded) return;
    form.reset();loaded=report;
    if(!report) return;
    const data=parseInterview(report);
    if(!data.structured){field('notes').value=report.slice(0,600);return;}
    for(const [key,tag] of [['interview_date','Entrevista'],['break_date','Quebra'],['area','Área'],['employee','Funcionário'],['job','Função']])field(key).value=data.meta[tag]||'';
    field('notes').value=data.notes;field('manager').value=data.manager;field('technician').value=data.technician;
    data.answers.forEach((answer,i)=>{
      const radio=[...form.querySelectorAll(`input[name="q${i+1}"]`)].find(x=>x.value===answer.answer);
      if(radio)radio.checked=true;
      if(field(`detail${i+1}`))field(`detail${i+1}`).value=answer.detail;
    });
  }

  function update(){ $('interviewStatus').textContent=$('interviewReport').value.trim()?'Entrevista preenchida. Você pode revisar antes de enviar.':'Preencha o formulário antes de enviar o B.O.'; }
  function open(){hydrate();syncFromBo();$('interviewError').textContent='';$('interviewDialog').showModal();}
  function close(){ $('interviewDialog').close(); }
  $('openInterview').onclick=open;
  $('interviewClose').onclick=close;
  $('interviewCancel').onclick=close;
  $('interviewDialog').addEventListener('click',e=>{if(e.target===$('interviewDialog'))close();});
  form.addEventListener('submit',e=>{
    e.preventDefault();
    if(!form.reportValidity()){$('interviewError').textContent='Preencha os dados da ocorrência e responda todas as 20 perguntas.';return;}
    const lines=['ENTREVISTA DE QUEBRAS',`Entrevista: ${field('interview_date').value}`,`Quebra: ${field('break_date').value}`,`Área: ${field('area').value}`,`Funcionário: ${field('employee').value.trim()}`,`Função: ${field('job').value.trim()}`];
    questions.forEach(([question],i)=>{const answer=form.querySelector(`input[name="q${i+1}"]:checked`).value;const detail=field(`detail${i+1}`)?.value.trim();lines.push(`${i+1}. ${question} — ${answer}${detail?' | '+detail:''}`);});
    lines.push(`Considerações: ${field('notes').value.trim()}`);
    if(field('manager').value.trim())lines.push(`Gestor: ${field('manager').value.trim()}`);
    if(field('technician').value.trim())lines.push(`Técnico de controle: ${field('technician').value.trim()}`);
    const report=lines.join('\n');
    if(report.length>4000){$('interviewError').textContent='O relato ultrapassa o limite de 4.000 caracteres. Resuma as observações.';return;}
    $('interviewReport').value=report;loaded=report;update();close();
  });
  window.BoInterview={open,update,reset(){loaded='';form.reset();update();}};
  update();
})();
