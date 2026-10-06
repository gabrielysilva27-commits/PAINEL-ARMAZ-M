# Segmentações do EFC

Versão 3.2.129. O agente ADM consulta o Outlook clássico já aberto, no mesmo usuário Windows, usando o objeto COM existente. Não cria perfil, não solicita senha, não altera a política de execução, não envia mensagens nem marca e-mails como lidos. O agente PUXADA não coleta e-mails.

Escopo: caixa `gabrielypi@imperio1973.com`, remetente com nome Luciano Gomes, assunto segmentação de clientes com empilhadeira, ano operacional 2026. A primeira leitura reúne o histórico disponível nas pastas da caixa; novas leituras ocorrem a cada 30 minutos. Se o Outlook estiver indisponível, tenta novamente após cinco minutos. A coleta roda em segundo plano e tem limite de três minutos por tentativa.

A data vem do assunto, pois o e-mail pode chegar na véspera. A tabela deve conter mapa, veículo e código PDV. Linhas repetidas são eliminadas dentro da mensagem; clientes diferentes no mesmo mapa são preservados. Mensagens sem tabela ou com linhas incompletas ficam em revisão. O corpo HTML passa apenas por um arquivo temporário local, removido ao terminar; o servidor recebe somente identificador hash, datas, campos extraídos e estado da leitura.

Os dados são armazenados nas tabelas privadas `efc_segmentation_emails` e `efc_segmentation_scans`, com RLS e acesso direto reservado ao servidor. A API exige token de agente ativo do slot ADM para importar. O painel usa a sessão já existente para consultar.

Esta etapa entrega a coleta e seu diagnóstico em EFC → Atualização das bases. Não substitui os percentuais históricos nem publica uma aderência estimada antes de validar o histórico coletado. A próxima etapa cruza mapas únicos por data com o PCD elegível; ausência de e-mail não comprova ausência de segmentação. Mensagens retificadoras e mapas sem vínculo precisam ser conferidos antes do fechamento.

Limitações: depende do Outlook clássico em execução e da caixa sincronizada localmente; mensagens apenas em imagem não são interpretadas. Bloqueios de acesso do Outlook ou da empresa são respeitados e aparecem no diagnóstico. A leitura real só está confirmada quando o agente registra uma coleta no servidor.
