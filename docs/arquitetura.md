# Arquitetura da aplicação

## Fluxo principal

1. `app.js` inicia a autenticação e a interface.
2. `src/firebase/access-control.js` verifica os e-mails autorizados; os administradores mestres mantêm o comportamento legado.
3. `src/persistence/database.js` solicita os dados ao adaptador `src/firebase/user-database.js`.
4. Se a nuvem estiver disponível, ela é a fonte principal. Se estiver vazia, a cópia local é normalizada e enviada uma única vez. Se falhar, a aplicação usa a cópia local e informa o usuário.
5. Toda gravação salva primeiro em `localStorage` e depois tenta sincronizar o mesmo objeto em `userData/{uid}/db`.
6. O domínio calcula datas, resumos e alocação de pagamentos sem conhecer DOM ou Firebase.
7. A UI renderiza o estado; Chart.js é importado somente quando os gráficos são solicitados.

## Limites dos módulos

| Diretório | Responsabilidade | Não deve conhecer |
|---|---|---|
| `src/domain` | regras determinísticas e cálculos | DOM, Firebase, armazenamento |
| `src/persistence` | schema, normalização e estratégia de carga/salvamento | detalhes do SDK Firebase |
| `src/firebase` | SDK, emuladores, caminhos e autorização | regras de apresentação |
| `src/ui` | traduções, feedback e dependências visuais tardias | caminhos do banco |
| `app.js` | estado da sessão e orquestração das telas legadas | novas regras de domínio complexas |

## Contrato de dados preservado

O caminho remoto continua sendo `userData/{uid}/db`. As propriedades principais continuam `settings`, `workedDays` e `payments`. A normalização preenche somente campos ausentes e preserva propriedades desconhecidas, permitindo ler bases antigas sem descartar raízes ou metadados.

Nesta etapa não existe migração remota. Alterações de schema devem ser versionadas, idempotentes, testadas com a cópia restaurada no Emulator e ter rollback antes de chegar à produção.

## Ambientes

- Produção: configuração padrão do build, sem execução automática por testes.
- Teste: `.env.test`, project ID `demo-dias-trabalhados-2`, Auth Emulator em `127.0.0.1:9099` e Database Emulator em `127.0.0.1:9000`.
- CI: executa lint, unitários, regras, build e E2E; apenas `master` pode acionar o job de deploy.

`scripts/assert-test-project.mjs` e `src/firebase/config.js` interrompem testes que não usem um project ID `demo-*`.

## Dívida arquitetural conhecida

O `app.js` ainda mantém estado global e a maior parte da renderização. Essa decomposição deverá continuar por tela na Etapa 4, depois que a Etapa 2 entregar persistência concorrente e a Etapa 3 consolidar as regras financeiras. A ordem evita uma reescrita ampla sobre regras e persistência ainda em evolução.
