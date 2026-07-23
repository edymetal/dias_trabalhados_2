# Operação, release e recuperação

Este runbook descreve a entrega técnica da aplicação sem alterar o Firebase de
produção. Todos os recursos usados pertencem ao GitHub Free ou ao Firebase
Spark.

## Fluxo de entrega

```text
branch codex/** ou pull request
  -> dependências pelo package-lock
  -> lint + unitários + regras no Emulator + build
  -> E2E no Auth/Database Emulators

push validado na master
  -> reutiliza o dist produzido pelo job validate
  -> GitHub Pages publica o artefato
  -> smoke test verifica HTML, CSP, bundle e manifesto
```

Somente `push` na `master` atende à condição do job `deploy`. Pull requests,
execuções manuais e branches `codex/**` validam o projeto, mas não publicam.
O workflow não possui credenciais, comandos de deploy ou acesso ao Firebase de
produção.

As Actions de terceiros são fixadas por SHA completo. O Dependabot verifica
mensalmente npm e GitHub Actions; cada atualização deve passar por todos os
checks antes de ser aceita. O `package-lock.json` é obrigatório e o CI instala
com `npm ci --ignore-scripts`.

## Proteção da branch principal

A `master` deve manter:

- pull request obrigatório;
- checks obrigatórios `validate` e `e2e`, atualizados com a base mais recente;
- resolução de conversas antes do merge;
- histórico linear;
- force push e exclusão desativados.

O número de aprovações exigidas permanece zero porque o repositório é mantido
por uma única pessoa. Isso preserva o fluxo por PR sem impedir que o próprio
mantenedor conclua uma entrega.

## GitHub Pages e headers

O Pages deve usar `build_type: workflow`. A origem legada `master / (root)` não
deve ficar ativa, pois publicaria arquivos internos e criaria um segundo fluxo
de deploy.

O GitHub Pages não permite configurar headers HTTP arbitrários por arquivo. Por
isso a aplicação injeta CSP por `<meta http-equiv>` durante o build:

- scripts limitados ao bundle e aos endpoints necessários ao login Google;
- conexões limitadas ao Firebase/Google em produção;
- endpoints `127.0.0.1` adicionados somente no build `test`;
- objetos bloqueados e `base-uri`/`form-action` restritos à própria origem;
- imagens de perfil limitadas às origens usadas pelo aplicativo.

`style-src 'unsafe-inline'` ainda é necessário porque bibliotecas e partes
legadas aplicam estilo em tempo de execução. Diretivas exclusivas de header,
como `frame-ancestors`, não podem ser impostas por meta no Pages. HTTPS é
forçado pela própria configuração do GitHub Pages.

## Release reproduzível

Uma release somente deve ser criada depois que o commit estiver na `master`,
os checks estiverem verdes e houver um backup novo validado conforme a Etapa 0.

```powershell
git switch master
git pull --ff-only
git tag -a v1.0.121 -m "Release v1.0.121"
git push origin v1.0.121
```

O workflow `Create reproducible release` rejeita tags que não pertençam à
`master`, repete validações e E2E, gera um `.tar.gz` de `dist/`, calcula
SHA-256 e cria a GitHub Release. O changelog deve ser movido de `Unreleased`
para a versão correspondente antes da tag.

Criar uma tag não altera o Firebase nem restaura dados. A publicação no Pages
continua vinculada exclusivamente a um push validado na `master`.

## Rollback do site

Rollback de código é feito por reversão, nunca por `reset --hard` ou force push:

1. identificar o último commit saudável e o commit que introduziu a falha;
2. criar `codex/rollback-<identificador>` a partir da `master`;
3. executar `git revert <commit-com-problema>`;
4. abrir PR e aguardar `validate` e `e2e`;
5. mesclar; o Pages publicará o novo commit de reversão;
6. confirmar o job `smoke` e o histórico da aplicação.

Se o incidente envolver dados, interromper o rollback de código e seguir o
runbook da Etapa 0. Nunca importar backup, aplicar regras ou sobrescrever a raiz
do Realtime Database como parte de um rollback do site. Restauração real exige
backup recente, comparação, autorização explícita e ensaio no Emulator.

## Monitoramento gratuito

O workflow `Operational checks` roda semanalmente e também pode ser iniciado
manualmente. Ele:

- confirma a barreira GitHub Free/Firebase Spark;
- audita somente as dependências que entram no bundle;
- restaura uma base totalmente sintética no Database Emulator e compara o
  hash canônico reexportado;
- consulta apenas os arquivos estáticos do GitHub Pages.

O health check não autentica, não abre o Realtime Database e não envia
telemetria. Falhas aparecem no GitHub Actions e usam as notificações gratuitas
da conta. Depois de cada deploy, o mesmo teste é executado pelo job `smoke`.

A situação da sincronização real continua visível na própria interface
(`sincronizado`, `sincronizando`, `offline` ou `bloqueado`). Nenhum dado
financeiro, e-mail ou UID é enviado a serviços de observabilidade.

## Backup e ensaio de restauração

O backup real continua na tarefa local `Dias Trabalhados - Backup Firebase`,
com criptografia DPAPI e retenção de 30 dias. Ele não é enviado ao GitHub
Actions, artifacts, Pages ou repositório.

O ensaio semanal do CI usa somente
`tests/fixtures/synthetic-restore.json`, com dados sintéticos, project ID `demo-*` e
Database Emulator local. Esse ensaio comprova o mecanismo; não substitui a
verificação periódica de um backup real em uma máquina confiável.

## Decisão sobre PWA e offline

Não será registrado service worker nesta etapa. O manifesto permanece apenas
como atalho instalável, sem promessa de que o código da aplicação abrirá sem
rede. A fila offline existente protege alterações de uma sessão já carregada e
as sincroniza quando a conexão retorna, mas não transforma o site em uma PWA
offline completa.

Essa decisão evita manter código antigo de domínio/persistência em cache após
uma correção urgente. Uma PWA offline futura exige versionamento de cache,
atualização coordenada, tela de versão disponível e E2E específico antes de ser
ativada.
