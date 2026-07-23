# Etapa 4 — interface, acessibilidade e desempenho

Data de conclusão técnica local: 23/07/2026

Status: **concluída no código e nos emuladores; produção não alterada**

Branch: `codex/etapa-4-interface-acessibilidade`

## Entregas

- handlers HTML foram substituídos por eventos registrados no módulo da aplicação;
- estilos inline do HTML e dos componentes gerados foram movidos para classes;
- navegação, calendário e seleção de semanas usam botões semânticos;
- a navegação informa a página ativa com `aria-current`;
- foi adicionada opção para pular diretamente ao conteúdo principal;
- os três formulários modais e a confirmação possuem nome acessível e semântica de diálogo;
- diálogos aprisionam o foco, fecham com `Escape` e devolvem o foco ao controle de origem;
- `alert()` e `confirm()` foram substituídos por notificações não bloqueantes e confirmação acessível;
- o menu mobile informa seu estado por `aria-expanded` e fecha com `Escape`;
- o seletor de datas informa estado, controles e datas de forma acessível;
- animações respeitam `prefers-reduced-motion`;
- controles e formulários foram ajustados para telas estreitas e alvos de toque;
- semanas visíveis permanecem limitadas a 10;
- operações em lote aceitam no máximo 366 dias e montam os elementos em fragmento;
- código global e funções de interface sem uso foram removidos.

## Preservação de dados

Nenhuma migração ou alteração de schema foi necessária. O schema 3 e o caminho
`userData/{uid}/db` permanecem intactos.

Exclusões em lote agora também são atômicas em memória: se um registro possuir
valor pago legado sem origem rastreável, o estado anterior é restaurado e nada
é persistido.

## Validação automatizada

| Verificação | Resultado |
|---|---:|
| Restrições GitHub Free/Firebase Spark | aprovada |
| ESLint | aprovado |
| Testes unitários | 44/44 |
| Testes de regras no Emulator | 8/8 |
| Testes E2E desktop/mobile | 3/3 |
| Build de produção | aprovado |

Os testes de interface verificam ausência de handlers, estilos inline e
diálogos nativos bloqueantes, além de foco inicial, retorno de foco, `Escape`,
estado do menu mobile, controles semânticos e dimensões do diálogo no viewport.

## Produção

Não houve deploy de produção. O workflow de branches `codex/**` executa somente
validação. Nenhuma entrega exige Firebase Blaze, serviço pago ou hospedagem
adicional.
