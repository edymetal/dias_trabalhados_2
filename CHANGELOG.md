# Changelog

Todas as alterações relevantes deste projeto são registradas neste arquivo.

## Unreleased

### Adicionado

- CSP gerada por ambiente e health check do GitHub Pages;
- ensaio periódico de restauração com dados sintéticos no Firebase Emulator;
- pipeline reproduzível de release com arquivo compactado e SHA-256;
- Dependabot mensal para npm e GitHub Actions;
- runbook de release, rollback, monitoramento, backup e decisão de PWA.

### Alterado

- pipeline constrói `dist/` uma única vez antes do deploy;
- GitHub Actions fixadas por SHA completo;
- CI instala dependências bloqueadas sem executar scripts de pacotes;
- assets instaláveis usam caminhos relativos compatíveis com GitHub Pages.

### Segurança

- auditoria das dependências de produção faz parte do CI e da rotina semanal;
- verificações estáticas impedem runners não aprovados, Actions sem SHA e
  publicação de serviços Firebase/Google Cloud.

## 1.0.120 — 2026-07-23

- interface acessível e responsiva da Etapa 4;
- domínio financeiro em centavos e schema 3 da Etapa 3;
- persistência concorrente, cache por UID e regras em Emulator da Etapa 2;
- base Vite, testes isolados e barreiras de produção da Etapa 1;
- backup criptografado e restauração local comprovada da Etapa 0.
