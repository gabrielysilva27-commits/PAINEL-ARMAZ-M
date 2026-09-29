# Temperatura — regras operacionais

## Fonte histórica

O histórico de janeiro a setembro de 2026 foi extraído das planilhas XLSB fornecidas pela operação.

- Foram persistidas **3.019 leituras normalizadas**.
- Os arquivos XLSB/ZIP originais **não são armazenados no painel nem no Supabase Storage**.
- A partir de **29/09/2026**, o lançamento no site passa a ser a fonte operacional.
- Quando uma leitura feita no site coincidir com data, turno e área de uma carga histórica, o registro do site prevalece.

## Áreas e medições

| Área | Pontos por leitura | Turnos |
| --- | ---: | --- |
| Câmara Fria | 1 | Manhã |
| Retornável | 2 | Manhã, Tarde e Noite |
| Descartável | 2 | Manhã, Tarde e Noite |
| Repack | 1 | Manhã, Tarde e Noite |
| Marketplace | 1 | Manhã, Tarde e Noite |

Em **Retornável** e **Descartável**, a temperatura considerada no indicador é o maior valor entre os dois pontos medidos.

## Faixas

### Câmara Fria
- **OK:** até 5,0 °C
- **Atenção:** acima de 5,0 °C e abaixo de 9,0 °C
- **Crítico:** 9,0 °C ou mais

### Demais áreas
- **OK:** até 22,0 °C
- **Atenção:** acima de 22,0 °C até 25,0 °C
- **Crítico:** acima de 25,0 °C

## Ação operacional

- **OK:** operação normal.
- **Atenção:** solicitar atenção dos ajudantes na movimentação.
- **Crítico:** não realizar movimentação manual de caixaria e localizar os SKUs de caixaria nas áreas mais frescas do armazém.

## Conferentes

O portal de Temperatura usa a mesma identificação e o mesmo PIN do B.O. Digital. A leitura salva registra o conferente responsável.

O banco mantém uma linha lógica por **data + turno + área**. Um novo salvamento para a mesma combinação atualiza o registro em vez de gerar duplicidade.


## Carta de controle

O módulo administrativo exibe a carta de controle por área e mês.

- Câmara Fria: a leitura diária é o próprio valor da manhã.
- Retornável e Descartável: primeiro é considerado o maior valor entre Temp. 1 e Temp. 2 de cada turno; a carta usa a média diária desses indicadores.
- Repack e Marketplace: a carta usa a média diária das leituras dos turnos disponíveis.
- Dias sem leitura/operação não são tratados como temperatura zero.
- As faixas de OK, Atenção e Crítico aparecem como referência visual no gráfico.
