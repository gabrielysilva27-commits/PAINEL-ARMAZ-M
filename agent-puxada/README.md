# Agente Puxada - Promax

Este servico representa um unico **Agente Puxada**, mas pode ser instalado simultaneamente em dois computadores autorizados: o PC oficial da Puxada e o PC ADM.

Fluxo:

Promax -> relatorio 020501 -> CSV -> Painel Armazem -> cruzamento Fisico x Sistema.

## Filtros definidos

- Relatorio: 020501
- Armazem: 1
- Deposito: 1
- Operacao inicial: 251
- Operacao final: 314
- Exportacao: CSV

A data inicial nao e fixa. O Painel calcula a carreta mais antiga ainda sem resolucao na Puxada e envia o periodo correto ao agente. A data final e o dia atual.

## Consolidacao

O CSV e consolidado por:

Fornecedor + NF + Codigo do produto

Assim compra, bonificacao e outras repeticoes do mesmo produto na mesma NF sao somadas antes do cruzamento.

## Um agente em dois computadores

Os dois computadores executam o mesmo codigo, mas cada instalacao usa seu proprio token.

- Computador oficial da Puxada
- Computador ADM

Existe uma unica fila de sincronizacao no Painel. Quando surge uma tarefa, o primeiro computador disponivel faz um **claim atomico** e recebe um lease. Enquanto ele executa, o outro fica em espera e nao pode baixar o mesmo relatorio.

Se o computador que assumiu a tarefa perder contato, o lease expira e a mesma solicitacao volta para a fila para o outro computador assumir. Em falhas normais, o computador com erro entra em cooldown por alguns minutos e a tarefa e liberada imediatamente ao outro.

## Instalacao

1. No Painel Armazem, abra ADM -> Agente Puxada.
2. Gere o token especifico do computador que esta sendo instalado.
3. Copie a pasta agent-puxada para esse computador.
3. Instale Node.js LTS se ainda nao estiver instalado.
4. Abra PowerShell na pasta e execute .\install.ps1
5. Cole o token correspondente àquele PC quando solicitado.
6. Execute .\calibrar.ps1
7. Repita o processo no segundo computador usando o outro token.

O token e salvo com DPAPI do Windows e nao fica em texto puro.

## Login do Promax

O agente usa um perfil dedicado do Microsoft Edge na pasta promax-profile.

A senha do Promax nao fica no codigo. O usuario faz login uma vez no perfil local dedicado e a sessao permanece no computador.

## Calibracao pendente

A infraestrutura esta pronta, mas os seletores reais da tela do Promax dependem do computador que acessa o sistema.

Eles ficam no arquivo config.json:

- reportSearch
- reportOpen, opcional
- dateFrom
- dateTo
- warehouse
- deposit
- operationFrom
- operationTo
- searchButton
- exportCsvMenu, opcional
- exportCsv

Os seletores podem ser CSS ou atalhos como label=Data Inicial, placeholder=Relatorio, text=Exportar CSV ou role=button:Buscar.

Enquanto a calibracao nao estiver concluida, o agente informa Aguardando calibracao e nao tenta exportar dados.

## Funcionamento normal

Depois de calibrado:

- consulta o Painel a cada 30 segundos;
- sincroniza automaticamente no intervalo definido no Painel, padrao de 10 minutos;
- atende o botao Sincronizar agora;
- baixa o 020501;
- importa e consolida a base;
- recalcula automaticamente os recebimentos concluidos;
- registra historico e erros.

Logs locais: logs\agent.log
