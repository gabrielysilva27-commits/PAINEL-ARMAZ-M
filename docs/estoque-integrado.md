# Estoque integrado: layouts, FEFO e aderência

O módulo usa uma base versionada em stock_snapshots, acessada somente pela função stock-api com a sessão existente do painel. Nenhum saldo, lote ou validade é distribuído nos arquivos públicos do site. Cada publicação cria uma versão, sem excluir a anterior.

## Origem dos dados

- Base Ruas: 484 registros, incluindo endereços vazios. Colunas D/E/F/H/I/K/M representam endereço, SKU, descrição, recebimento, validade, quantidade em paletes e trava-palete.
- 391 registros pertencem ao Regulador e 93 ao Marketplace. A seção Marketplace começa no primeiro endereço M; os endereços R dessa seção são separados dos R do Regulador.
- Chopp: 14 posições identificadas pelas células C4:C10 e F4:F10. Essas células não são endereços físicos cadastrados e os códigos não comprovam saldo, recebimento ou validade.
- A imagem inicial contém 345 registros com produto, dos quais 20 não possuem validade e 116 não possuem quantidade. Quantidades vazias permanecem desconhecidas.
- O 01.11 oferece descrições e conversões, mas quantidades desta base já estão em paletes e não devem ser novamente convertidas.
- Reabastecimento contém consultas por SKU e ordenação por validade; suas colunas auxiliares e fórmulas de matriz não são dados de estoque.
- Os mapas usam as coordenadas relativas das abas Estoque, Marketplace e Chopp, incluindo a extensão das células que representam cada rua. Endereços da Base Ruas não desenhados aparecem em lista complementar. Repetições por rua não são descartadas.

## Regras operacionais

FEFO é calculado por área e SKU, por validade crescente. Recebimento e endereço desempatarão lotes com a mesma validade, sem mudar sua prioridade conjunta. Quantidades zero não são disponíveis. Vencidos, vencendo hoje, trava-palete, datas inconsistentes e validade ausente não são recomendados.

A regra de devolução mantém a expressão da planilha: validade menos recebimento menor que 40 dias. Sem recebimento a verificação fica pendente. A falta de quantidade exige conferência do saldo. Consultar FEFO não realiza baixa.

A ABC vem de abc_items, no mês e área selecionados. Ausência na curva mensal não herda silenciosamente a curva antiga do Excel. A classificação e o Pareto existentes não são recalculados por este módulo.

## Aderência

Aderência = endereços monitorados ocupados exclusivamente por produtos A / meta. Endereços vazios, com mistura de curvas ou com algum SKU sem curva não contam como aderentes. Cada endereço é contado uma vez.

- Regulador: meta 35. As 32 ruas de BASE CORR, mais D01/D02/D03, formam o planejamento. A fórmula anterior omitia E03 e referenciava D04 duas vezes; as referências originais são mantidas nos metadados da importação.
- Marketplace: meta original 10; a fórmula acompanha 23 endereços. A diferença entre meta e abrangência é visível. A razão não é artificialmente limitada a 100%.
- Câmara Fria: meta 14; comparação com os SKUs declarados na aba Chopp, sem alegar conferência de estoque.
- Picking: preservado. O indicador manual 100/100 do DASH não é publicado como aderência calculada.

O indicador cruza o estoque da última atualização com a curva do mês escolhido. Não representa inventário histórico.

## Atualização e acesso

Administradores podem importar outra versão do mesmo modelo XLSX e editar cada registro na tabela Base de ruas. A importação substitui a fotografia ativa, mantendo o histórico. O desenho dos mapas permanece fixo; endereços novos são listados fora do mapa até seu posicionamento ser definido.

Todas as gravações exigem perfil admin e o identificador da versão lida. Uma restrição única sobre a versão anterior impede gravações concorrentes. Usuários de visualização possuem apenas consulta.

stock-core.js contém as regras compartilhadas com a função. schema.sql documenta o DDL aplicado. stock-module.js acrescenta as três áreas no módulo Layout, Reabastecimento no menu e a seção de aderência na Curva ABC.

## Verificação

Validados: contagem da base, lotes preservados, ausência de datas e quantidades, separação por área, FEFO e empates, vencimentos, trava-palete, saldo zero, regra de devolução, mês, autorização e conflito de versões. A API publicada devolve HTTP 401 sem sessão.

A inspeção visual autenticada requer login; a sessão do navegador de verificação não estava autenticada.
