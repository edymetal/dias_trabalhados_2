# Dias Trabalhados

Aplicação web para registrar dias trabalhados, folgas, pagamentos e créditos antecipados. A produção continua no Firebase e no GitHub Pages, mas o desenvolvimento e os testes desta etapa usam somente projetos Firebase `demo-*` e emuladores locais.

O projeto possui uma restrição permanente: deve operar somente com **GitHub Free** e **Firebase Spark**, sem conta de faturamento ou migração para Blaze. Consulte [a política de plano gratuito](docs/plano-gratuito.md).

## Proteção dos dados existentes

- O ID de produção é rejeitado pelos scripts e pela configuração de teste.
- O projeto padrão do Firebase CLI neste repositório é `demo-dias-trabalhados-2`, que existe apenas durante a execução dos emuladores.
- Os testes de navegador usam Auth e Realtime Database Emulators; os testes de regras usam uma instância isolada do Database Emulator.
- O cache, a fila offline e as cópias recuperáveis são separados por UID.
- Nenhum teste deve ser executado alterando `.env.test` para apontar à produção.
- As regras em `firebase/database.rules.emulator.json` são uma proposta para validação local. **Não executar `firebase deploy --only database` a partir desta branch.**
- Backups JSON, hashes e exportações do emulador estão ignorados pelo Git.

A Etapa 0 foi concluída localmente em 22/07/2026: exportação administrativa, SHA-256, criptografia e restauração comprovada no emulador. Consulte `plans/etapa-0-backup-e-restauracao.md` antes de qualquer mudança de persistência, importação, limpeza ou regras remotas.

## Requisitos

- Node.js 22.13 ou superior;
- npm;
- Java 21 para o Realtime Database Emulator;
- Firebase CLI e GitHub CLI já podem ser usados pelas dependências locais ou pelas instalações do computador.

Neste computador, se o npm não reconhecer o certificado da rede, use a cadeia de certificados do Windows sem desabilitar TLS:

```powershell
$env:NODE_USE_SYSTEM_CA = '1'
npm ci
```

## Desenvolvimento

```powershell
npm ci
npm run dev:test
```

O modo `test` lê `.env.test` e conecta somente aos emuladores. Para iniciar Auth e Database juntos:

```powershell
npm run emulators
```

Comandos principais:

```powershell
npm run lint
npm run test:unit
npm run test:rules
npm run test:e2e
npm run test:restore-drill
npm run test:free-tier
npm run test:migration-backup -- D:\copia-temporaria\rtdb-data.json
npm run build
npm run check
```

Operação de backup no Windows:

```powershell
npm run backup:production
npm run backup:install-task
```

O primeiro comando cria um backup criptografado em `D:\Backups\dias_trabalhados_2`, testa a recuperação independente e remove os JSONs em texto claro. O segundo instala a tarefa diária **Dias Trabalhados - Backup Firebase**, programada para 03:00 com retenção de 30 dias. A chave é protegida pelo Windows DPAPI e não deve ser adicionada ao Git.

`npm run test:rules` e `npm run test:e2e` precisam de Java. O E2E inicia e encerra Auth e Database Emulators automaticamente. O fluxo de CI instala Java 21 e executa as duas suítes.

O Firebase Web permanece na série 10, atualmente em 10.14.1, compatível com
`@firebase/rules-unit-testing` 3. A dependência transitiva `undici` é fixada em
6.27.0 para eliminar vulnerabilidades conhecidas; qualquer alteração desse
`override` exige nova auditoria e todos os testes.

Em 23/07/2026, a reinstalação reproduzível e
`npm audit --omit=dev --audit-level=high` retornam 0 vulnerabilidades. O CI
repete a consulta ao registro em cada entrega e semanalmente para não depender
somente do resultado local.

## Build e publicação

O Vite gera o site em `dist/`. Pushes para branches `codex/**` apenas validam
lint, testes, emuladores e build. A publicação no GitHub Pages ocorre somente
após um push validado na branch protegida `master`; o job de deploy recebe
exclusivamente o `dist/` criado pelo job de validação.

O projeto também possui:

- Dependabot mensal para npm e GitHub Actions;
- Actions fixadas por SHA;
- CSP específica para produção e emuladores;
- smoke test após deploy;
- verificação operacional semanal com auditoria e restauração sintética;
- release por tag com artefato compactado e SHA-256;
- rollback por `git revert`, sem sobrescrever histórico ou dados.

O manifesto oferece instalação como atalho, mas não há service worker nem
promessa de abertura offline completa. A fila offline de dados continua
funcionando depois que uma sessão foi carregada.

O runbook completo está em [docs/operacao.md](docs/operacao.md) e o histórico
em [CHANGELOG.md](CHANGELOG.md).

## Estrutura concluída na Etapa 1

- `src/domain/`: regras determinísticas de datas, dashboard e alocação financeira;
- `src/persistence/`: schema, compatibilidade de dados legados e estratégia local/remota;
- `src/firebase/`: configuração, autorização e adaptadores Firebase, incluindo bloqueio de produção nos testes;
- `src/ui/`: traduções, feedback de falhas e carregamento tardio dos gráficos;
- `tests/unit/`: testes rápidos de domínio, persistência, backup e segurança da configuração;
- `tests/integration/`: testes de regras do Realtime Database Emulator;
- `tests/e2e/`: login, calendário e pagamento com dados sintéticos nos emuladores;
- `firebase/`: regras exclusivas para validação no emulador;
- `plans/`: auditoria e acompanhamento das etapas.

A visão dos módulos e do fluxo de dados está em `docs/arquitetura.md`. As Etapas
0 a 5 estão concluídas tecnicamente. O domínio financeiro e o schema 3 estão
documentados em `plans/etapa-3-dominio-financeiro.md`; a interface acessível e
responsiva em `plans/etapa-4-interface-acessibilidade.md`; build, entrega e
operação em `plans/etapa-5-build-deploy-operacao.md`. Rollouts de produção
permanecem condicionados a backup novo e autorização explícita.
