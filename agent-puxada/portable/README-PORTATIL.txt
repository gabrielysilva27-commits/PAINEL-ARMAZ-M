AGENTE PUXADA - VERSAO PORTATIL

Esta versao foi pensada para computadores corporativos sem acesso a PowerShell
e sem permissao de administrador.

COMO USAR

1. Extraia a pasta AgentePuxada para uma pasta onde seu usuario tenha acesso.
2. Abra AgentePuxada.exe com dois cliques.
3. No Painel Armazem, abra ADM -> Agente Puxada.
4. Gere o token do computador correto:
   - Computador oficial da Puxada; ou
   - Computador ADM.
5. Cole o token na primeira tela do AgentePuxada.exe.
6. Deixe marcada a opcao "Iniciar automaticamente com o Windows", se a politica
   do computador permitir.
7. Clique em "Calibrar Promax" e faca login no perfil dedicado do Edge.

NAO E NECESSARIO

- PowerShell
- Prompt de Comando
- Node.js instalado
- permissao de administrador
- ChatGPT aberto
- ChatGPT Work
- token da OpenAI

SEGURANCA

O token e protegido pelo DPAPI do Windows para o usuario atual.

IMPORTANTE

Se a empresa usar AppLocker, Windows Defender Application Control ou outra politica
que bloqueie executaveis nao autorizados, o Windows pode impedir o AgentePuxada.exe
de abrir. Nesse caso nao existe uma forma correta de contornar a politica: o arquivo
precisara ser liberado/allowlisted pela TI da empresa.

O agente nao tenta desativar, contornar ou modificar as protecoes corporativas.

Versao portatil preparada para Windows x64.
