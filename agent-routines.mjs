const routines=[
 ['02.05.01 · Puxada','Importa os dados da puxada para o acompanhamento e confronto do recebimento.','A cada 1 hora, pelo intervalo configurado no bloco do agente.'],
 ['03.11.20 · Movimentações','Atualiza movimentos e fases dos mapas, compartilhados por Recebimento, EFC e produtividade.','A cada 1 hora; revisa também os últimos dias.'],
 ['PCD · Planilhas locais','Lê os arquivos PCD da pasta configurada no ADM para os indicadores de descarga e movimentação.','A cada 1 hora; importa arquivos alterados.'],
 ['02.05.02 · OOR','Lê a base CHEIO para Estoque x Estoque e política de estoque.','Uma vez ao dia após concluir a importação; aguarda o arquivo quando ainda não está disponível.'],
 ['03.02.36.01 · OCP operacional','Importa os itens dos mapas para as bases compartilhadas de carregamento e separação.','Rotina diária/noturna, com abertura às 21h; acompanha os dias pendentes até concluir.'],
 ['MAPAS + EFC noturno','Lê as planilhas MAPAS e concilia os carros planejados com os movimentos e indicadores do EFC.','Por dia operacional, com virada às 21h; verifica pendências a cada 15 minutos e encerra quando conclui.'],
 ['Outlook · Segmentações','Lê os e-mails de segmentação para relacionar mapas, veículos e clientes no EFC.','Rotina diária/noturna, com abertura às 21h; encerra quando os dias solicitados estão completos.'],
 ['Curva ABC mensal · 03.05.19 + OCP','Usa vendas, separação, limites dos arquivos MAPAS e fatores 01.11 para publicar a Curva ABC das quatro áreas. O Layout reaproveita essa base.','Mensal, no primeiro dia com acesso disponível; usa os três meses anteriores. Não sobrescreve mês já importado.'],
 ['Fases locais · Entrada/Saída','Lê arquivos de fases disponíveis e reconcilia os eventos dos mapas com o PCD.','Verificação de arquivos durante o ciclo do agente; processa alterações, sem nova extração de relatório no Promax.'],
 ['Estado dos computadores','Informa presença, versão, sessão do Promax e disponibilidade dos PCs ADM/Puxada.','Aproximadamente a cada 30 segundos; não baixa relatórios.'],
 ['Atualização automática','Verifica novas versões, valida os arquivos e instala com possibilidade de recuperação em caso de falha.','Verificação aproximadamente a cada 2 minutos; não baixa relatórios.']
];
const modules=[
 'Puxada · Recebimento',
 'Recebimento · Carregamento / EFC · Produtividade / WLP',
 'Eficiência de Descarga · Produtividade / WLP',
 'Estoque x Estoque · Política de estoque',
 'Carregamento / EFC · Base OCP compartilhada',
 'Carregamento / EFC',
 'Carregamento / EFC',
 'Curva ABC · Layout do picking',
 'Eficiência de Descarga · Carregamento / EFC',
 'ADM · Estado do agente',
 'ADM · Atualização do agente'
];
export function openAgentRoutines(){
 let dialog=document.getElementById('agentRoutinesDialog');
 if(!dialog){
  const style=document.createElement('style');style.textContent='#agentRoutinesDialog{width:min(1200px,96vw);max-height:88vh;padding:0;border:1px solid #e2e5e9;border-radius:16px;color:#30343b;background:white;box-shadow:0 20px 80px #0003}#agentRoutinesDialog::backdrop{background:#18202b88}#agentRoutinesDialog header{position:sticky;top:0;background:white;display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid #e7e9ed;z-index:1}#agentRoutinesDialog h2{margin:0;font-size:20px}#agentRoutinesDialog header button{padding:8px 14px;border:1px solid #ddd;border-radius:8px;background:white;cursor:pointer}#agentRoutinesDialog .body{padding:18px 24px}#agentRoutinesDialog p{font-size:13px;line-height:1.6;color:#646d77}#agentRoutinesDialog table{width:100%;border-collapse:collapse;font-size:13px;text-align:left}#agentRoutinesDialog th,#agentRoutinesDialog td{padding:13px 10px;border-bottom:1px solid #eceef1;vertical-align:top;line-height:1.5}#agentRoutinesDialog th{background:#fff5ec}#agentRoutinesDialog td:first-child{font-weight:700;width:24%}@media(max-width:650px){#agentRoutinesDialog .body{padding:12px}#agentRoutinesDialog table{font-size:11px}#agentRoutinesDialog td,#agentRoutinesDialog th{padding:9px 5px}}';document.head.appendChild(style);
  dialog=document.createElement('dialog');dialog.id='agentRoutinesDialog';dialog.setAttribute('aria-labelledby','agentRoutinesTitle');
  dialog.innerHTML='<header><h2 id="agentRoutinesTitle">Rotinas do agente</h2><button type="button">Fechar</button></header><div class="body"><p>O agente atende os computadores ADM e Puxada conforme a disponibilidade e a configuração de cada rotina. As extrações dependem do acesso ao Promax e aos arquivos locais. Tarefas compartilhadas usam travas para evitar duplicidade.</p><table><thead><tr><th>Rotina</th><th>Para que serve</th><th>Módulo</th><th>Periodicidade</th></tr></thead><tbody>'+routines.map((row,index)=>'<tr>'+[row[0],row[1],modules[index],row[2]].map(text=>'<td>'+text+'</td>').join('')+'</tr>').join('')+'</tbody></table><p>O intervalo de 1 hora vale para as rotinas recorrentes. Rotinas diárias, noturnas e mensais mantêm seus próprios calendários. Uma pendência ou tentativa de recuperação pode gerar verificações adicionais. “Sincronizar agora” é um acionamento manual.</p></div>';
  dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});document.body.appendChild(dialog);
 }
 dialog.showModal();
}
