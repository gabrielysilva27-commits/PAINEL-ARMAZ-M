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
