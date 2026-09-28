AGENTE PUXADA - VERSAO PORTATIL 3.2.83

COMO USAR

1. Extraia a pasta AgentePuxada em um local onde seu usuario tenha acesso.
2. Abra AgentePuxada.exe.
3. No Painel Armazem, abra ADM -> Agente Puxada.
4. Gere e cole o token do computador correto: ADM ou PUXADA.
5. Deixe marcada a opcao Iniciar automaticamente com o Windows.
6. Clique em Calibrar Promax para abrir o Microsoft Edge normal e faca login no Promax.
7. Clique em Iniciar agente.

Esta versao usa o Promax ja aberto na janela normal do Microsoft Edge.
Nao usa Playwright nem depuracao remota.

RELATORIO AUTOMATICO

02.05.01
Armazem 1 a 1
Deposito 1 a 1
Operacao 251 a 314
Tipo de data Entrega

O agente aguarda 30 segundos sem uso do mouse ou teclado e uma sessao Windows desbloqueada antes de iniciar cada puxada.
Se voce voltar a usar o computador durante a puxada, a janela ainda podera aparecer.

O Promax gera um arquivo .csv.inf. O agente identifica, processa, consolida e envia ao Painel automaticamente.

NAO E NECESSARIO

- PowerShell
- Prompt de Comando
- Node.js instalado
- permissao de administrador
- ChatGPT aberto
- token da OpenAI

SEGURANCA

O token e protegido pelo DPAPI do Windows para o usuario atual.

Se a empresa usar AppLocker, Windows Defender Application Control ou outra politica que bloqueie executaveis nao autorizados, o AgentePuxada.exe ou IEDriverServer.exe pode precisar de liberacao pela TI.

Versao 3.2.83 - Windows x64.

O agente também lê automaticamente os CSVs do relatório 02.05.02 na pasta de rede configurada pelo Painel para atualizar o OOR. O arquivo bruto não é enviado nem armazenado; somente os saldos consolidados por SKU.
