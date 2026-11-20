import test from 'node:test';
import assert from 'node:assert/strict';
import {INTERVIEW_QUESTIONS,parseInterview,renderInterview,INTERVIEW_PRINT_CSS} from '../bo/interview-document.mjs';
import {validateOccurrenceInput} from '../supabase/functions/bo-api/bo-core.mjs';
export const report=['ENTREVISTA DE QUEBRAS','Entrevista: 2026-11-20','Quebra: 2026-11-20','Área: Picking','Funcionário: Funcionário de teste','Função: AJUDANTE',...INTERVIEW_QUESTIONS.map(([q,,na],i)=>`${i+1}. ${q} — ${na?'N/A':i===7?'Não':'Sim'}${i===7?' | Deixou cair a mala no chão.':''}`),'Considerações: Relato de teste.','Gestor: Gestor teste','Técnico de controle: Técnico teste'].join('\n');
test('multiline and previously flattened interviews recover all answers and metadata',()=>{
 const structured=parseInterview(report),flattened=parseInterview(report.replace(/\s+/g,' '));
 assert.deepEqual(flattened,structured);assert.equal(flattened.answers.length,20);assert.equal(flattened.answers[7].answer,'Não');assert.equal(flattened.answers[7].detail,'Deixou cair a mala no chão.');assert.equal(flattened.meta.Entrevista,'2026-11-20');assert.equal(flattened.notes,'Relato de teste.');assert.equal(flattened.manager,'Gestor teste');assert.equal(flattened.technician,'Técnico teste');
});
test('printed form keeps one question per row, marked choices and signatures',()=>{
 const html=renderInterview({bo_number:'BO-TEST',interview_report:report.replace(/\s+/g,' ')});
 assert.equal((html.match(/class="interview-paper-question"/g)||[]).length,20);assert.match(html,/Sim \(<b>X<\/b>\)/);assert.match(html,/Não \(<b>X<\/b>\)/);assert.match(html,/Assinatura do Gestor/);assert.match(html,/20\/11\/2026/);assert.match(INTERVIEW_PRINT_CSS,/break-inside:avoid/);
});
test('incomplete or genuinely free text stays visible without inventing answers',()=>{
 const html=renderInterview({interview_report:'Relato livre <script>exemplo</script>'});assert.match(html,/&lt;script&gt;/);assert.equal(parseInterview(report.replace('20. A quebra','21. A quebra')).structured,false);
});
test('BO validation preserves interview newlines while retaining normal validation',()=>{
 const occurrence=validateOccurrenceInput({occurrence_date:'2026-11-20',occurrence_time:'10:00',shift:'A',movement_type:'Saída',location:'Picking',subject_type:'Funcionário',employee_name:'Pessoa teste',employee_function:'AJUDANTE',reason:'Falha no Manuseio',responsibility:'Conferente',interview_report:report,items:[{sku_code:'4262',total_qty:8,repacked_qty:0,discarded_qty:2}]});assert.equal(occurrence.interview_report,report);
});
