# Plano de Melhoria do Layout do Calendário

Status em 23/07/2026: **incorporado e substituído pela Etapa 4**. O resultado
vigente está documentado em `plans/etapa-4-interface-acessibilidade.md`.

O objetivo deste plano é resolver o problema de informações "espremidas" nas células do calendário, especialmente em dispositivos móveis, proporcionando uma visualização mais clara e espaçosa.

## Alterações Propostas

### 1. Estilização CSS (`style.css`)

*   **Aumentar o espaçamento do grid:** Incrementar o `gap` de `.calendar-grid` para dar mais respiro entre os dias.
*   **Ajustar células do dia (`.calendar-day`):**
    *   Aumentar o `min-height` base de 90px para 100px.
    *   Remover `aspect-ratio: 1 / 1` em telas maiores para permitir que a célula cresça se houver muito conteúdo.
    *   Aumentar o padding interno.
*   **Melhorar elementos internos:**
    *   Aumentar o tamanho da fonte de `.day-number`.
    *   Aumentar o tamanho da fonte e o padding de `.day-badge`.
    *   Aumentar o tamanho da fonte de `.day-value`.
*   **Ajustes Mobile:**
    *   Revisar a regra que esconde `.day-badge` em telas menores (o usuário parece querer vê-las, mas com mais espaço).
    *   Aumentar o `min-height` no mobile para pelo menos 120px.

### 2. Lógica de Renderização (`app.js`)

*   **Ajustar `detailsContainer`:** Mudar o `gap` inline de `2px` para `4px` ou `6px` para separar melhor a badge do valor monetário.
*   **Otimizar `createDayElement`:** Garantir que o layout flexbox distribua os elementos de forma mais equilibrada.

## Passos de Implementação

1.  **Modificar `style.css`:**
    *   Atualizar `.calendar-grid` gap.
    *   Atualizar `.calendar-day` min-height, padding e remover aspect-ratio fixo.
    *   Atualizar `.day-number`, `.day-badge` e `.day-value`.
    *   Atualizar media query `@media (max-width: 768px)` para aumentar `min-height` e reexibir/ajustar badges se necessário.
2.  **Modificar `app.js`:**
    *   Localizar a criação do `detailsContainer` em `createDayElement` e aumentar o `gap`.

## Verificação

1.  Abrir o calendário em diferentes resoluções (Desktop, Tablet, Mobile).
2.  Verificar se as informações (número do dia, badge de turno, valor e ícone de status) estão bem distribuídas e legíveis.
3.  Confirmar se o design continua "glassmorphism" e visualmente atraente.
