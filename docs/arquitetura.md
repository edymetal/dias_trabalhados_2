# Arquitetura da aplicação

## Fluxo principal

1. `app.js` inicia a autenticação e a interface.
2. `src/firebase/access-control.js` verifica os e-mails autorizados; os administradores mestres mantêm o comportamento legado.
3. `src/persistence/database.js` solicita os dados ao adaptador `src/firebase/user-database.js`.
4. A base é migrada de forma idempotente para o schema 3 e combinada com operações locais ainda pendentes.
5. Toda gravação salva primeiro no cache específico do UID, calcula as folhas modificadas e persiste a operação em uma fila durável.
6. O adaptador usa `update()` para enviar os caminhos da operação atomicamente, sem substituir irmãos não relacionados.
7. A fila só remove uma operação após confirmação e volta a tentar quando a conexão retorna.
8. Uma assinatura `onValue` atualiza a sessão quando outro cliente modifica a mesma base.
9. O domínio calcula datas, resumos e alocação de pagamentos sem conhecer DOM ou Firebase.
10. A UI renderiza o estado e a situação da sincronização; Chart.js é importado somente quando solicitado.

## Limites dos módulos

| Diretório | Responsabilidade | Não deve conhecer |
|---|---|---|
| `src/domain` | regras determinísticas e cálculos | DOM, Firebase, armazenamento |
| `src/persistence` | schema, normalização e estratégia de carga/salvamento | detalhes do SDK Firebase |
| `src/firebase` | SDK, emuladores, caminhos e autorização | regras de apresentação |
| `src/ui` | traduções, feedback e dependências visuais tardias | caminhos do banco |
| `app.js` | estado da sessão e orquestração das telas legadas | novas regras de domínio complexas |

## Contrato de dados preservado

O caminho remoto continua sendo `userData/{uid}/db`. As propriedades principais continuam `settings`, `workedDays` e `payments`, com `schemaVersion: 3`. A normalização preenche somente campos ausentes e preserva propriedades desconhecidas, permitindo ler bases antigas sem descartar raízes ou metadados.

Valores continuam serializados em euros por compatibilidade, mas o domínio converte toda operação para centavos inteiros em `src/domain/money.js`. `ledger.js` concentra alocação, crédito, estorno, reconciliação e invariantes; `autofill.js` pagina datas sem recalcular registros históricos.

`src/ui/dialog.js` centraliza abertura, fechamento, foco, `Escape` e confirmações acessíveis. `src/ui/feedback.js` mantém notificações e sincronização em regiões vivas. O HTML não executa handlers nem estilos inline; os eventos permanecem no controlador e a apresentação em `style.css`.

As migrações são sequenciais e idempotentes. Schema superior ao conhecido coloca a sincronização em modo bloqueado para impedir que um cliente antigo sobrescreva dados novos. Nenhuma migração remota foi executada durante a implementação.

## Ambientes

- Produção: configuração padrão do build, sem execução automática por testes.
- Teste: `.env.test`, project ID `demo-dias-trabalhados-2`, Auth Emulator em `127.0.0.1:9099` e Database Emulator em `127.0.0.1:9000`.
- CI: executa lint, unitários, regras, build e E2E; apenas `master` pode acionar o job de deploy.

`scripts/assert-test-project.mjs` e `src/firebase/config.js` interrompem testes que não usem um project ID `demo-*`.

## Dívida arquitetural conhecida

O `app.js` ainda mantém estado global e a maior parte da renderização. A fila resolve persistência entre reinícios e concorrência em caminhos diferentes; conflitos simultâneos no mesmo campo continuam com semântica de última gravação e devem ser evitados por operações de domínio mais específicas. A decomposição visual continuará na Etapa 4, após a consolidação financeira da Etapa 3.
