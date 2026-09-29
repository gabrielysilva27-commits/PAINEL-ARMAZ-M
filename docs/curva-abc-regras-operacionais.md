# Regras operacionais — Aderência da Curva ABC

## Estoque Geral

A aderência não considera apenas distância ao Picking. A posição também precisa respeitar o tipo físico de armazenagem.

- **Prateleiras:** endereços das ruas **A, B, C e G** com lado `-A` ou `-B`.
- **Ruas fechadas / piso:** demais endereços do Estoque Geral, como E, D e R.
- **Curva A:** deve permanecer em **rua fechada**, priorizando as posições mais próximas ao Picking.
- **Curvas B e C:** devem utilizar **prateleiras**, respeitando B mais próxima e C mais distante dentro da lógica de aderência.
- **Exceção — SKU 22209 (Guaravita):** mesmo sendo Curva A, deve utilizar **prateleira**, pois o produto é frágil e não deve ser empilhado.

## Sugestões de realocação

O plano de ação só pode sugerir uma posição fisicamente compatível:

- Curva A comum → rua fechada da Faixa A.
- SKU 22209 → prateleira da Faixa A.
- Curva B → prateleira da Faixa B.
- Curva C → prateleira da Faixa C.

Uma posição só é considerada aderente quando atende **à faixa da curva e ao tipo de armazenagem**.

## Exceções fixas

- Picking: 100% de aderência enquanto não houver histórico físico de contagem.
- Câmara Fria: 100% pela regra do SKU 838, Curva A.

## Resultado mensal e meta

- A **meta operacional de aderência é 50%**.
- A meta é exibida separadamente do resultado medido.
- **Estoque Geral e Marketplace:** quando existir fotografia de **Estoque x Estoque do próprio mês**, ela prevalece como resultado medido.
- Uma fotografia de setembro não pode ser reutilizada para calcular junho, julho ou agosto.
- Para janeiro a agosto/2026, sem fotografia física histórica, o painel usa **estimativa retroativa autorizada**, sempre identificada internamente como `estimated_historical_baseline`.
- As estimativas retroativas não geram plano de ação posicional; servem somente para a série mensal.
- **Setembro/2026:** usa a fotografia disponível de Estoque x Estoque de setembro e permanece como resultado medido.
