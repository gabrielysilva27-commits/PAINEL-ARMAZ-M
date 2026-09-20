# Agente Puxada - Promax

Este servico roda localmente no computador da empresa que possui acesso ao Promax.

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

## Instalacao

1. No Painel Armazem, abra ADM e gere o token do Agente Puxada.
2. Copie a pasta agent-puxada para o computador da empresa.
3. Instale Node.js LTS se ainda nao estiver instalado.
4. Abra PowerShell na pasta e execute .\install.ps1
5. Cole o token quando solicitado.
6. Execute .\calibrar.ps1

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
