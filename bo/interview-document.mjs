const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const INTERVIEW_QUESTIONS=[
 ['Estava com disposição (bem estar) para executar o trabalho?','Por quê?'],
 ['Possui reincidência de quebra na operação?','Qual?'],
 ['Estava fazendo uso dos EPIs corretamente?','Por quê?'],
 ['EPIs em condição de uso?','Por quê?'],
 ['Foi treinado no manual de transporte seguro no local de trabalho?'],
 ['Foi treinado no manual de manuseio de materiais?'],
 ['Verificou o peso e equilíbrio da carga?'],
 ['Manuseou o produto da forma correta?','Como? Demonstre.'],
 ['Foi treinado para atuar na área da ocorrência (integração na função)?'],
 ['Foi treinado no plano de tráfego?'],
 ['Realizou avaliação de risco do local?'],
 ['A área da ocorrência possui iluminação adequada?'],
 ['O piso da área da ocorrência está livre de desníveis?'],
 ['A carga estava disposta da forma correta (organizada, com fitilho, palete bom, garrafeiras em bom estado)?','Qual?'],
 ['Realizou o checklist da empilhadeira?',null,true],
 ['Estava trafegando de ré no momento do manuseio do produto?',null,true],
 ['Foi utilizado o extensor dos garfos para manuseio do produto?',null,true],
 ['Fez uso do equipamento correto para aquela tarefa?'],
 ['São disponibilizados equipamentos suficientes para operação?','Qual?'],
 ['A quebra foi registrada pelo conferente no B.O.?']
];
export function parseInterview(report){
 const text=String(report??'').replace(/\s+/g,' ').trim();
 if(!text.startsWith('ENTREVISTA DE QUEBRAS '))return {structured:false,legacy:String(report??'')};
 const matches=[...text.matchAll(/(?:^|\s)([1-9]|1[0-9]|20)\.\s+(.+?)\s+—\s+(Sim|Não|N\/A)(?=\s|$)/g)];
 if(matches.length!==20||matches.some((m,i)=>Number(m[1])!==i+1))return {structured:false,legacy:String(report??'')};
 const header=text.slice(0,matches[0].index),meta={};
 const tags=['Entrevista','Quebra','Área','Funcionário','Função'];
 tags.forEach((tag,i)=>{const start=header.indexOf(tag+': ');const end=i+1<tags.length?header.indexOf(tags[i+1]+': ',start+tag.length+2):header.length;meta[tag]=start<0?'':header.slice(start+tag.length+2,end<0?header.length:end).trim();});
 const value=label=>{const match=text.match(new RegExp(label+':\\s*(.*?)(?=Gestor:|Técnico de controle:|$)'));return (match?.[1]||'').trim();};
 const answers=matches.map((m,i)=>{let tail=text.slice(m.index+m[0].length,i<19?matches[i+1].index:text.indexOf('Considerações:',m.index)<0?text.length:text.indexOf('Considerações:',m.index)).trim();return {number:i+1,question:m[2],answer:m[3],detail:tail.startsWith('|')?tail.slice(1).trim():tail};});
 return {structured:true,meta,answers,notes:value('Considerações'),manager:value('Gestor'),technician:value('Técnico de controle')};
}
const date=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4):value||'____/____/________';
export function renderInterview(row){
 if(!row?.interview_report)return '';
 const data=parseInterview(row.interview_report),meta=data.meta||{},employee=meta['Funcionário']||row.employee_name||'';
 const marked=(label,yes)=>esc(label)+' (<b>'+(yes?'X':'&nbsp;')+'</b>)';
 const questions=data.structured?data.answers.map((a,i)=>'<div class="interview-paper-question"><span>'+esc(a.question)+'</span> <span class="interview-paper-options">'+['Sim','Não',...(INTERVIEW_QUESTIONS[i][2]?['N/A']:[])].map(option=>marked(option,a.answer===option)).join(' &nbsp; ')+'</span>'+(INTERVIEW_QUESTIONS[i][1]?'<div class="interview-paper-detail">'+esc(INTERVIEW_QUESTIONS[i][1])+' <span>'+esc(a.detail)+'</span></div>':a.detail?'<div>'+esc(a.detail)+'</div>':'')+'</div>').join(''):'<div class="interview-paper-legacy">'+esc(data.legacy)+'</div>';
 return '<section class="interview-paper-document"><div class="interview-paper-frame"><header class="interview-paper-header"><strong>ENTREVISTA DE QUEBRAS</strong><img src="assets/logo-imperio.png" alt="Império"></header><div class="interview-paper-dates"><span>DATA ENTREVISTA: <b>'+esc(date(meta.Entrevista))+'</b></span><span>DATA DA QUEBRA: <b>'+esc(date(meta.Quebra||row.occurrence_date))+'</b></span></div><div class="interview-paper-areas">ÁREA: &nbsp; '+['Repack','Cheio','Vazio','Devolução','Bloqueio','Picking'].map(area=>marked(area,area===(meta['Área']||row.location))).join(' &nbsp; ')+'</div><div class="interview-paper-person"><span>Funcionário: <b>'+esc(employee)+'</b></span><span>Função: <b>'+esc(meta['Função']||row.employee_function||'')+'</b></span></div><div class="interview-paper-questions">'+questions+'</div><div class="interview-paper-notes"><span>Considerações: </span><p>'+esc(data.notes||'')+'</p></div><div class="interview-paper-signature-employee">Assinatura Funcionário: <span></span> Data ____/____/________</div><div class="interview-paper-signatures"><div><span>'+esc(data.manager||'')+'</span><small>Assinatura do Gestor</small></div><div><span>'+esc(data.technician||'')+'</span><small>Assinatura do Técnico de controle</small></div></div><footer class="interview-paper-reference">Anexo do B.O. '+esc(row.bo_number)+'</footer></div></section>';
}
export const INTERVIEW_PRINT_CSS=`
.interview-paper-document{break-before:page;font:10pt/1.2 Arial,sans-serif;color:#111;box-sizing:border-box;}
.interview-paper-document:first-child{break-before:auto}
.interview-paper-frame{border:1px solid #666;padding:4mm;min-height:265mm;box-sizing:border-box;display:block}
.interview-paper-header{position:relative;text-align:center;min-height:9mm;padding:0 20mm 2mm;font-size:11pt}
.interview-paper-header img{position:absolute;right:0;top:0;width:18mm;height:11mm;object-fit:contain}
.interview-paper-dates{display:flex;gap:7mm;flex-wrap:wrap;margin:2mm 0 4mm}
.interview-paper-areas{margin-bottom:4mm;line-height:1.4}
.interview-paper-person{display:flex;gap:4mm;flex-wrap:wrap;margin-bottom:4mm}
.interview-paper-person>span:first-child{flex:1 1 110mm}
.interview-paper-person b{font-weight:400}
.interview-paper-question{margin:0 0 .8mm;break-inside:avoid;overflow-wrap:anywhere}
.interview-paper-options{white-space:nowrap}
.interview-paper-detail{display:flex;gap:1mm;min-height:4mm;line-height:1.3}
.interview-paper-detail>span{flex:1;border-bottom:1px solid #777;min-width:0}
.interview-paper-notes{min-height:32mm;margin-top:4mm;background:repeating-linear-gradient(to bottom,transparent 0,transparent 5.8mm,#999 5.8mm,#999 6mm);line-height:6mm;overflow-wrap:anywhere}
.interview-paper-notes p{display:inline;margin:0;white-space:pre-wrap}
.interview-paper-signature-employee{display:flex;gap:2mm;align-items:end;margin-top:7mm;font-size:9pt;break-inside:avoid}
.interview-paper-signature-employee>span{flex:1;border-bottom:1px solid #555;min-height:5mm}
.interview-paper-signatures{display:flex;gap:15mm;justify-content:space-between;margin-top:7mm;break-inside:avoid}
.interview-paper-signatures>div{width:46%;text-align:center}
.interview-paper-signatures span{display:block;border-bottom:1px solid #555;min-height:5mm}
.interview-paper-signatures small{display:block;font-size:9pt;margin-top:1mm}
.interview-paper-reference{font-size:7pt;color:#555;margin-top:3mm}
.interview-paper-legacy{white-space:pre-wrap;line-height:1.5}
`;
