AGENTE PUXADA - VERSAO PORTATIL V2

COMO USAR

1. Extraia a pasta AgentePuxada em um local onde seu usuario tenha acesso.
2. Abra AgentePuxada.exe.
3. No Painel Armazem, abra ADM -> Agente Puxada.
4. Gere e cole o token do computador correto: ADM ou PUXADA.
5. Deixe marcada a opcao Iniciar automaticamente com o Windows.
6. Clique em Calibrar Promax para abrir o Microsoft Edge normal e faca login no Promax.
7. Clique em Iniciar agente.

A V2 usa o Microsoft Edge em Modo Internet Explorer pelo IEDriver oficial.
Nao usa Playwright nem depuracao remota.

RELATORIO AUTOMATICO

02.05.01
Armazem 1 a 1
Deposito 1 a 1
Operacao 251 a 314
Tipo de data Entrega

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

Versao 2.0.0 - Windows x64.
