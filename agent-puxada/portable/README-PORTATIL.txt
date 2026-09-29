AGENTE PUXADA - VERSAO PORTATIL 3.2.88

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

Versao 3.2.88 - Windows x64.

O agente lê automaticamente apenas um arquivo LIBERAÇÃO CHEIO do relatório 02.05.02 por dia. Enquanto o arquivo do dia não existir, ele procura periodicamente; depois de importar o primeiro LIBERAÇÃO CHEIO válido do dia, encerra a busca do 02.05.02 até o dia seguinte. Dias anteriores ficam para a contingência manual. O universo do OOR vem dos códigos de produto do próprio 02.05.02. A quantidade replica a planilha original: usa DISPONÍVEL, considera a parte inteira antes de /xx e, para unidade Dz, divide por 2. Arquivos DEVOLUÇÃO, ANÁLISE/PNC, FALTAS e outros tipos são ignorados. O arquivo bruto não é enviado nem armazenado; somente os saldos consolidados por SKU.
