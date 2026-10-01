# Produtividade do armazém

Primeira versão do módulo de gestão do Painel Armazém. A Workstation não foi alterada.

## Fontes e cálculo

- Repack e despejo: somente tarefas concluídas do cronômetro, com executor identificado. Históricos coletivos não são atribuídos a pessoas.
- Outras atividades: registro individual com volume, minutos e referência da origem.
- Jornada: horas decimais por pessoa, data, atividade e turno. As horas extras entram no denominador. Distribuir as horas entre as atividades, sem repetir a jornada integral.
- Produtividade por área: soma dos volumes dividida pela soma das horas-pessoa. Unidades permanecem separadas. Sem produção ou jornada correspondente, o resultado fica incompleto.
- Consolidado HL/hh: volume diário informado dividido pelas jornadas registradas. A fórmula oficial e a cobertura de equipe devem ser validadas antes de usar como WLP oficial.
- EFD: mapas válidos com PC física até 21h divididos pelos mapas válidos. É indicador de prazo, sem atribuição individual de descarga.
- Dimensionamento: volume previsto / meta de unidades por hora-pessoa; dividir por horas diárias × dias × disponibilidade e arredondar pessoas para cima. Salva premissas, resultado e decisão.
- Fechamento: preserva um snapshot diário, junto da data, turno, participantes, canal, discussão e ações. Não publica resultados na Workstation nesta etapa.

## Permissões

A função `productivity-api` valida a sessão existente do painel e a conta ativa antes de consultar dados. Somente administradores podem gravar. As tabelas `wlp_*` e `repack_legacy_adjustments` têm RLS ativo e não permitem acesso direto de `anon` ou `authenticated`. A função usa a chave de serviço somente no servidor.

O SQL inicial em `supabase/productivity-schema.sql` foi aplicado no projeto do Painel em 01/10/2026. A API está em `supabase/functions/productivity-api`. O arquivo público `productivity-core.mjs` deve permanecer idêntico ao `core.mjs` da API.

## Validação

Executar `node --test tests/productivity*.test.mjs`. Os testes cobrem horas extras, médias ponderadas, dados incompletos, dimensionamento, executor real de repack e permissões de API. A API publicada deve responder 401 a consultas sem sessão.

## Próximas etapas

Importadores das planilhas de 2026 após o recebimento dos arquivos, validação da fórmula oficial de WLP, cadastro completo da equipe e integração de consulta individual na Workstation. O início da tarefa determina a data operacional do repack; a distribuição de tarefas que atravessam dias deve ser definida antes de fechamento oficial.
# Histórico 2026 publicado

O histórico mensal está em `wlp_monthly_archive`, protegido por RLS e sem acesso direto de anon/authenticated. A ação `historical` da API exige a mesma sessão ativa do painel. Os dados individuais não são publicados como arquivos estáticos.

Janeiro a setembro: volume TOTAL da ANS, produção PBR1/PBR2 atribuída a Ivanildo, todos os canais de repack rateados entre Andrei e Richard e volume TOTAL rateado entre os dois empilhadores C. Os 45 nomes confirmados estão cadastrados; ADM e candidatos pendentes ficam fora.

As taxas históricas são estimativas pela escala 6x1 e pelos dias planejados da fonte, com jornada 7h20 e HE mensal de 13h por pessoa; empilhadores têm HE zero. Elas não alimentam as jornadas diárias nem o WLP global medido. Fevereiro da reforma ausente permanece nulo. Setembro do repack termina em 18/09 e não recebe taxa por hora com denominador mensal. Manobra aguarda carros atendidos/dia; ida e volta formam um ciclo por carro. Cadastro histórico, ausências e calendário divergente em 21/04 e 25/08 ainda precisam ser validados.

O simulador inclui HE alocada à semana, limitada a 13h por pessoa e zerada para áreas de empilhadores. A HE mensal não deve ser repetida em cada semana. Metas e previsão do volume TOTAL ainda devem ser informadas; o plano de entrega não cobre toda a movimentação.

## Fechamento do histórico 2026 — 01/10/2026

O histórico de janeiro a setembro incorpora o 030237 e mantém cada fonte na sua finalidade: produção nominal da EFC para montagem/conferência C, PCD/031120 para referências de carros/carretas, SAROBA somente como estimativa de refugo e 030237 como memória documental/HL complementar. As funções confirmadas de conferência são Alex e Ruan no cheio A, Luis Carlos Marques no cheio B, Tiago no vazio A e Vanderson no vazio B; Everton Mantovam é o ajudante fixo das baias; os demais ajudantes dessa frente permanecem no refugo; repack é exclusivo da equipe de repack.

O dimensionamento semanal só oferece automaticamente referências históricas cujo escopo da atividade esteja completo, com quantidade, horas e período fechados. Rateios, proxies, estimativas e bases parciais continuam visíveis para análise, mas não são usados como produtividade sugerida. Isso evita transformar PCD, 031120 ou SAROBA em meta oficial de produtividade individual.

Pendências preservadas sem imputação: montagem C sem base nominal em 12/09, SAROBA parcial no fim de setembro, repack de setembro somente até 18/09 e códigos de presença não definidos quando impedem o cálculo de horas.