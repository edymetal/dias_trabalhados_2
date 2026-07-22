# Dias Trabalhados

Aplicação web para registrar dias trabalhados, folgas, pagamentos e créditos antecipados. A produção continua no Firebase e no GitHub Pages, mas o desenvolvimento e os testes desta etapa usam somente projetos Firebase `demo-*` e emuladores locais.

## Proteção dos dados existentes

- O ID de produção é rejeitado pelos scripts e pela configuração de teste.
- O projeto padrão do Firebase CLI neste repositório é `demo-dias-trabalhados-2`, que existe apenas durante a execução dos emuladores.
- Os testes de navegador usam o Auth Emulator; os testes de regras usam o Realtime Database Emulator.
- Nenhum teste deve ser executado alterando `.env.test` para apontar à produção.
- As regras em `firebase/database.rules.emulator.json` são uma proposta para validação local. **Não executar `firebase deploy --only database` a partir desta branch.**
- Backups JSON, hashes e exportações do emulador estão ignorados pelo Git.

Antes de qualquer futura mudança de persistência, importação, limpeza ou regras remotas, conclua a Etapa 0 descrita em `plans/auditoria-completa-projeto-2026-07-22.md`: backup administrativo, SHA-256 e restauração comprovada fora da produção.

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
npm run build
npm run check
```

`npm run test:rules` precisa de Java. `npm run test:e2e` inicia e encerra o Auth Emulator automaticamente. O fluxo de CI instala Java 21 e executa as duas suítes.

O Firebase Web permanece na série 10, atualmente em 10.14.1, compatível com `@firebase/rules-unit-testing` 3. A dependência transitiva `undici` é fixada em 6.27.0 para eliminar vulnerabilidades conhecidas; qualquer alteração desse `override` exige nova auditoria e todos os testes.

Em 22/07/2026, `npm audit --omit=dev` retorna 0 vulnerabilidades. A auditoria completa ainda encontra 7 alertas moderados somente na árvore de desenvolvimento do Firebase CLI 15.24.0; a correção automática sugerida pelo npm é um downgrade para 14.23.0 e não foi aplicada. Essa árvore não entra no bundle publicado.

## Build e publicação

O Vite gera o site em `dist/`. Pushes para branches `codex/**` apenas validam lint, testes, emuladores e build. A publicação no GitHub Pages ocorre somente após um push validado na branch `master`.

## Estrutura iniciada na Etapa 1

- `src/domain/`: regras determinísticas de datas e alocação financeira;
- `src/firebase/`: configuração e cliente Firebase, incluindo bloqueio de produção nos testes;
- `tests/unit/`: testes rápidos de domínio e segurança da configuração;
- `tests/integration/`: testes de regras do Realtime Database Emulator;
- `tests/e2e/`: smoke test da aplicação no Auth Emulator;
- `firebase/`: regras exclusivas para validação no emulador;
- `plans/`: auditoria e acompanhamento das etapas.

O restante da separação de persistência e interface deve ocorrer de forma incremental, depois do backup validado, para evitar uma reescrita arriscada do arquivo principal.
