# EFC e operação — primeira versão

Acesso pelo menu **Carregamento / EFC**. Seis áreas compartilham mês, dia, registros de origem e correções: visão gerencial, carregamento, produtividade, picking/abastecimento, qualidade e equipe/remuneração. O módulo WLP existente continua responsável por jornadas e dimensionamento.

## Fontes e cálculo

O histórico EFC 2026 foi extraído de dez arquivos Excel, preservando linha, mês e arquivo de origem. Entradas de atividades, programação, fases, erros, avarias, capacidade e tempos especiais ficam no banco privado. Itens de mapas foram agregados por data/mapa e por data/SKU para conciliação e demanda. Valores salvos pelo Excel são identificados como históricos, não são a fonte dos indicadores recalculados. Os arquivos originais e dados pessoais não estão no repositório público.

- Carregamento: PCD histórico mais programação PCD sincronizada pelo ADM. Relaciona placa/veículo com fase Carregado do 03.11.20. Limite de 06h do dia programado. Sem conclusão permanece no denominador. Dispensas manuais rec=SIM do Excel permanecem identificadas para validação e contam separadamente no numerador. Mais de um mapa compatível fica pendente. Correspondência privilegia emissão no dia programado; janela de busca até 36h antes do corte. Esta associação precisa de revisão para veículos com mais de uma viagem.
- WMS: sistema RF/WMS explicitamente informado. Usuário preenchido não prova adesão. Proporção é ponderada pelos carregamentos identificados; desconhecidos são pendências.
- Ajudantes: caixas não fechadas por data/mapa, pallets físicos e duração com virada de dia. EFM pela faixa de caixas/pallet, limitada a 100%. Janeiro/março/abril usam padrões 7/13/18/23/28 minutos; demais meses 14/26/36/46/56. Falta de itens ou tempo válido não gera EFM. Caixas de mapa compartilhado não são rateadas sem regra confirmada; agregado gerencial conta o mapa uma vez.
- Conferentes: volume individual registrado e caixas dos mapas; sem horas individuais não se inventa produtividade horária. Sem base dedicada em janeiro–maio fica pendente.
- Abastecimento: capacidade = posições × palletização. Excesso = max(0, demanda − capacidade). Pallets equivalentes seguem arredondamento de uma casa decimal do histórico. Trata-se de necessidade estimada; tarefas executadas dependem de fonte de movimentos. Capacidades ausentes são sinalizadas.
- Qualidade: ocorrências e quantidade separadas. Histórico de erros não é adicionado aos BOs contemporâneos para evitar duplicação. Ausência de lançamento de avaria não equivale a zero avarias.
- Remuneração: histórico nominal do Excel para comparação. Não fecha pagamento enquanto faltas, tarifa, rateio de Chopp e avarias não estiverem validados. Faltas em branco continuam pendentes.
- Datas de outro mês não entram no período selecionado: outubro contém itens antigos de setembro, preservados na origem mas excluídos dos indicadores de outubro.

## Correções e proteção

Administração pode corrigir ajudante/conferente, prioridade, posições/palletização e presença histórica com justificativa. A origem permanece intacta, o recálculo aplica a correção e uma transação grava alteração e auditoria. Leituras exigem sessão ativa e usuário ativo do painel; escritas exigem administração. Eventos do agente exigem token de um nó ativo. As tabelas EFC têm RLS e sem concessões para anon/authenticated; acesso passa pela API validada.

O agente adiciona Carregado e Carga Montada sem substituir a integração EFD. O estado de EFC é independente: arquivos CSV já processados pelo EFD são relidos uma vez para EFC. Falha da API EFC é registrada e não interrompe a incorporação EFD. PCD utiliza a leitura já existente do ADM.

## Pendências conhecidas

Itens de mapas após 24/09 e outubro; divergências de datas/mapas em meses anteriores; horários individuais de conferentes; presença nominal para fechamento; identificação/rateio de equipe em Chopp/Marketplace; origem completa de avarias; execução de abastecimento. Prioridades com falta de conclusão não recebem OK automaticamente. EFC é provisória até validar programação e viagens múltiplas.

Verificações: testes de fronteiras de faixas, corte de horário, virada de dia, falta de itens, ambiguidade de mapas, sistema WMS, prioridade incompleta, capacidade e autenticação/autorização/auditoria. Validação visual autenticada depende de sessão funcional no navegador.
