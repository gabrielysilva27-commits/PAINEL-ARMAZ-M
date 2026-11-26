# Agente Logística - Promax V3

O Agente Logística automatiza rotinas do Promax e sincroniza relatórios com o Painel Armazém.

Fluxo real validado em setembro/2026:

Promax no Microsoft Edge (Modo IE) -> atalho 02.05.01 -> filtros -> Visualizar -> CSV -> arquivo .csv.inf -> Painel Armazém -> cruzamento físico x sistema.

## Computadores autorizados

Existe um único Agente Puxada lógico, com dois computadores autorizados:

- PC Logística
- PC ADM

Cada computador possui seu próprio token. A fila é compartilhada e o primeiro computador disponível assume a sincronização com lease atômico.

## Regras do relatório

- Relatório: 02.05.01
- Armazém: 1 a 1
- Depósito: 1 a 1
- Operação: 251 a 314
- Item, fornecedor, tipo de movimento e mapa permanecem nos padrões do Promax
- Movimentações automáticas do dia: permanece como padrão da tela
- Tipo de data: Entrega
- Data inicial: calculada pelo Painel conforme a carreta mais antiga pendente
- Data final: dia da sincronização

## Como a V2 opera o Promax

A V2 não usa Playwright e não inicia o Edge com depuração remota.

Ela usa o **IEDriver oficial do Selenium** para controlar o Microsoft Edge em **Modo Internet Explorer**, compatível com o Promax legado. Isso evita o problema em que a tela apenas atualizava ao clicar em Visualizar quando o navegador era aberto com depuração remota.

O agente mantém a sessão do Edge durante sua execução. O usuário deve manter o Promax autenticado no Edge do computador.

## Download CSV

O Promax gera arquivos com extensão `.csv.inf`. Apesar da extensão, o conteúdo é CSV separado por ponto e vírgula e codificado em Windows-1252.

O agente tenta primeiro baixar o arquivo diretamente usando a sessão autenticada do Promax. Se o Promax exigir a barra de download do Edge, o agente aciona Salvar e monitora a pasta Downloads.

## Consolidação

O arquivo é consolidado por:

Fornecedor + NF/Documento + Código do produto

As operações positivas entre 251 e 314 são somadas antes do cruzamento.

## Instalação

1. No Painel Armazém, abra ADM -> Agente Puxada.
2. Gere o token do computador correto.
3. Extraia o pacote portátil.
4. Abra AgentePuxada.exe.
5. Cole o token.
6. Deixe "Iniciar automaticamente com o Windows" marcado.
7. Clique em "Calibrar Promax" apenas para abrir o Edge normal e fazer login no Promax.
8. Clique em "Iniciar agente".

Não são necessários PowerShell, Node.js instalado, permissões de administrador, ChatGPT aberto ou token da OpenAI.

## Segurança

O token é protegido pelo DPAPI do Windows e fica vinculado ao usuário local.

Se AppLocker, WDAC ou outra política corporativa bloquear AgentePuxada.exe ou IEDriverServer.exe, a liberação deve ser feita pela TI. O agente não tenta contornar proteções corporativas.

## Diagnóstico

Logs:

- app\logs\agent.log
- app\logs\iedriver.log

Versão do agente: 3.0.0

## Atualização automática

A partir da V3, o agente consulta o backend do Painel a cada inicialização e periodicamente. Quando existe uma versão nova, baixa somente os arquivos publicados para aquela versão, valida SHA-256, aplica em staging e executa um health check local antes de efetivar. Se o health check falhar, restaura automaticamente os arquivos anteriores e reinicia a versão conhecida como boa.

A pasta `data` nunca é substituída pelo atualizador, preservando token, identidade ADM/PUXADA e estado local. O painel ADM mostra versão instalada, versão publicada e estado da atualização.


## Conciliação diária de contagem — 02.11.01

A primeira rotina de contagem está configurada para o depósito 6 (Devolução): armazém 1, depósito inicial/final 6, área inicial/final 1 e contagem 6. O agente exporta CSV e PDF uma vez por dia, com o nome `DD.MM - CONTAGEM DEVOLUÇÃO`. O CSV conserva a extensão real de exportação do Promax (`.csv.inf`).

O destino padrão é `Y:\{ano}\ARMAZÉM\3.0 - Acuracidade do Inventário\Acuracidade de Movimentação do Material do Armazém\CONTAGEM de Estoque`. O agente cria automaticamente a pasta do mês no padrão `MM. Nome do mês`, a pasta `06 - Depósito DEVOLUÇÃO` e as subpastas `CSV` e `PDF`. O compartilhamento UNC configurado é usado como alternativa quando a unidade Y: não estiver mapeada.
