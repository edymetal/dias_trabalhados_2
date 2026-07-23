# Etapa 3 — domínio financeiro

Data de conclusão técnica local: 23/07/2026

Status: **concluída no código, backup e emuladores; produção não alterada**

Branch: `codex/etapa-3-dominio-financeiro`

## Decisões adotadas

As escolhas priorizam compatibilidade e preservação:

1. férias são marcador sem valor financeiro;
2. “recebido no mês” usa caixa, pela data do pagamento;
3. competência permanece disponível separadamente pela data trabalhada;
4. excedente de semanas selecionadas vira crédito e não paga semanas fora da seleção;
5. cada UID mantém uma base independente;
6. edição offline e cache por UID permanecem ativos;
7. dias automáticos já criados não mudam retroativamente quando tarifa ou rotina mudam.

## Modelo monetário

O JSON continua armazenando valores em euros para não quebrar backups, exportações e a interface existente. Toda soma, comparação, distribuição, estorno e arredondamento passa antes por centavos inteiros em `src/domain/money.js`.

O schema 3:

- arredonda resíduos históricos para duas casas;
- preserva valores pagos sem vínculo em `unlinkedAmountPaid`;
- explicita caixa como base padrão de relatório;
- explicita férias sem valor;
- adiciona paginação do preenchimento automático;
- infere campos ausentes de registros legados sem remover propriedades desconhecidas.

## Invariantes

- `amountPaid + pendingAmount = rate` para dias financeiros;
- dias de folga, férias ou sem período possuem tarifa, pago e pendência iguais a zero;
- aplicações de cada pagamento mais `advanceRemaining` fecham o valor recebido;
- `coveredDays` é derivado das aplicações reais;
- estorno remove somente o pagamento escolhido;
- redução de tarifa devolve primeiro as aplicações mais recentes;
- valor legado sem origem rastreável bloqueia redução/exclusão, evitando perda silenciosa;
- pagamentos usam `crypto.randomUUID()`;
- divisão dinheiro/depósito fecha exatamente em centavos.

Importações confirmadas pelo usuário passam por reconciliação determinística. Referências órfãs são separadas, excessos viram crédito e os dias cobertos são reconstruídos. A base carregada normalmente não é reconciliada de forma destrutiva.

## Datas e preenchimento automático

- datas ISO inválidas são rejeitadas;
- iteração diária usa calendário ISO e não duração em milissegundos, evitando erros em transições de horário;
- pagamento mensal no dia 29–31 é limitado ao último dia real do mês;
- preenchimento automático processa páginas de 31 dias, no máximo 12 por inicialização;
- registros existentes nunca são recalculados retroativamente.

## Validação do backup real

O backup criptografado mais recente foi descriptografado somente numa pasta temporária, validado e removido no `finally`.

| Invariante | Antes | Schema 3 |
|---|---:|---:|
| Bases de usuário | 2 | 2 |
| Dias trabalhados | 82 | 82 |
| Pagamentos | 8 | 8 |
| Valor dos dias | 4.005 | 4.005 |
| Valor pago | 3.240 | 3.240 |
| Valor pendente | 765 | 765 |
| Valor dos pagamentos | 3.240 | 3.240 |
| Raiz legada `fluxoTurnoDB` | presente | preservada |

Nenhum UID foi exibido e nenhum JSON descriptografado permaneceu no disco.

## Validação automatizada

| Verificação | Resultado |
|---|---:|
| Restrição GitHub Free/Firebase Spark | aprovada |
| ESLint | aprovado |
| Testes unitários | 42/42 |
| Testes de regras no Emulator | 8/8 |
| Testes E2E no Auth/Database Emulators | 2/2 |
| Build de produção | aprovado |

## Rollout de produção

Não executado. Antes de qualquer rollout:

1. confirmar Firebase Spark sem billing;
2. gerar novo backup criptografado e restaurá-lo no Emulator;
3. validar novamente invariantes e reconciliação;
4. publicar primeiro o cliente compatível;
5. confirmar schema 3 e fila vazia;
6. publicar regras somente depois dos testes por perfil;
7. manter rollback do cliente, regras e backup.

Nenhum passo autoriza Blaze, Cloud Functions ou outro serviço pago.
