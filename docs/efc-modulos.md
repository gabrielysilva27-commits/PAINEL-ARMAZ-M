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

## Histórico e regras a partir de outubro

Os meses de janeiro a setembro de 2026 usam os resultados salvos no arquivo Excel. O histórico não passa pelo cálculo revisado nem pode ser alterado pelas correções de atividades do painel. Cada mês preserva o dashboard, a EFM de cada atividade, o ranking original, as equivalências e as parcelas de remuneração. O total salvo do Excel é preservado mesmo quando sua fórmula soma apenas parte dos colaboradores.

A aba Reabastecimento contém dois quadros. RESSUPRIDO mede pallets em relação às posições de picking. TT REABASTECIDO mede caixas em relação às caixas de picking. Ambos são importados com seus resultados diários e acumulados; não devem ser confundidos com aderência ao módulo WMS. Datas e colunas de acumulado são identificadas por suas fórmulas, pois mudam entre os arquivos. O histograma de carregamento preserva o período selecionado no gráfico original, que pode ser uma semana; seu subtítulo informa essa seleção.

O histórico privado fica em `efc_workbook_history`, com RLS e acesso reservado ao servidor. O endpoint valida a sessão existente antes de devolver o histórico. Os arquivos privados gerados pelo extrator não devem ser incluídos no repositório.

O padrão DPO fornecido estabelece EFC até 6h30 para frota fixa e 8h30 para spot; as exclusões de mapas exigem classificação real. Uma frota não identificada não deve produzir uma EFC aparentemente completa. O documento define EFM como tempo real dividido pelo esperado: resultados acima de 100% indicam estouro do tempo, e não devem ser limitados a 100%. O algoritmo de complexidade do WMS não é fornecido pelo PDF. O padrão por faixa de caixas por pallet é uma aproximação provisória, explicitamente identificada.

A aderência de ressuprimento WMS requer atividades completas divididas pelas geradas. A estimativa de demanda acima do picking continua disponível separadamente. Outubro não deve reutilizar os itens de setembro presentes no arquivo original. Itens ausentes ou frota sem classificação permanecem pendentes até integração ou correção dos insumos.
