# Etapa 5 — build, deploy e operação

Data de conclusão técnica: 23/07/2026

Status: **concluída tecnicamente; Firebase e conteúdo publicado não alterados**

Branch: `codex/etapa-5-build-deploy-operacao`

## Entregas

- npm continua totalmente fixado por `package-lock.json`;
- Dependabot mensal agrupa atualizações de produção, desenvolvimento e Actions;
- todas as GitHub Actions são fixadas por SHA completo;
- instalações no CI usam `npm ci --ignore-scripts`;
- CSP é gerada pelo Vite com origens de produção e teste separadas;
- caminhos de ícones e manifesto funcionam no subdiretório do GitHub Pages;
- CI executa limite de plano gratuito, auditoria de produção, lint, 47 testes
  unitários, 8 testes de regras, 3 E2E e build;
- `dist/` é construído uma única vez e é o único artefato aceito pelo deploy;
- deploy permanece impossível fora de `push` na `master`;
- smoke test valida a publicação sem consultar Firebase;
- ensaio semanal restaura e reexporta uma base sintética no Database Emulator;
- pipeline de tag valida, empacota, calcula SHA-256 e cria GitHub Release;
- changelog, release, rollback, monitoramento e proteção da branch foram
  documentados;
- service worker foi deliberadamente adiado; o manifesto é apenas instalável e
  não promete execução offline completa.

## Proteção dos dados

Nenhum script operacional do GitHub possui credenciais Firebase. O teste
agendado aceita somente project ID `demo-*` e host local do Emulator. Backups
reais permanecem criptografados e fora do Git/repositório/Actions.

Nenhuma migração, regra, escrita, leitura autenticada ou restauração foi
executada no Firebase de produção.

## Compatibilidade de plano

- runners: somente `ubuntu-latest` padrão;
- hospedagem: GitHub Pages do repositório público;
- monitoramento: GitHub Actions e notificações da própria conta;
- banco de teste: Firebase Emulator Suite;
- nenhum App Hosting, Functions, Storage, runner maior, serviço externo de
  observabilidade ou backup nativo pago.

## Critérios validados

| Verificação | Resultado |
|---|---:|
| Limite GitHub Free/Firebase Spark | aprovado |
| ESLint | aprovado |
| Testes unitários | 47/47 |
| Build de produção | aprovado |
| CSP de produção sem localhost | aprovado |
| Artefato restrito a `dist/` | aprovado |
| Actions fixadas por SHA | aprovado |

Regras, E2E, restauração e GitHub Actions são registrados após a validação final
da branch.

## Rollout pendente

A conclusão técnica não publica a branch, não cria tag e não altera dados.
Antes do rollout real:

1. obter um backup novo e validar a recuperação;
2. abrir PR desta branch para `master`;
3. aguardar checks obrigatórios;
4. revisar o changelog e criar a tag somente após o merge;
5. acompanhar deploy e smoke test.

Consulte `docs/operacao.md`.
