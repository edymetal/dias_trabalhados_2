# Etapa 1 — base de engenharia isolada

Data de início: 22/07/2026

Branch: `codex/etapa-1-base-engenharia`

## Objetivo

Permitir que o projeto seja modificado e validado sem acessar ou alterar o Firebase de produção. Esta entrega preserva o formato atual dos dados e não executa migração, importação, limpeza ou escrita remota.

## Entrega inicial

- Vite e dependências npm com versões exatas e lockfile;
- build reproduzível em `dist/`, usado pelo GitHub Pages;
- Firebase SDK atualizado de 10.8.0 para 10.14.1, última correção compatível com a biblioteca de testes de regras usada nesta etapa;
- `undici` transitivo fixado em 6.27.0, removendo os alertas conhecidos sem forçar a migração principal para Firebase 12;
- configuração do Firebase extraída para `src/firebase/`;
- bloqueio em duas camadas contra o project ID de produção: configuração da aplicação e script anterior aos testes;
- projeto padrão local `demo-dias-trabalhados-2`, sem recursos remotos;
- Auth Emulator e Realtime Database Emulator configurados;
- regras candidatas, separadas e nomeadas como exclusivas do emulador;
- primeiras funções puras de datas e lançamentos financeiros extraídas para `src/domain/`;
- antigo `test.html` removido; sua história permanece recuperável no Git;
- Vitest para domínio e proteção da configuração;
- `@firebase/rules-unit-testing` para isolamento por UID e claim autorizada;
- Playwright para o carregamento real da tela de login sem acessar a produção;
- ESLint e CI obrigatório antes do deploy;
- ativos PWA copiados pelo Vite sem caminhos quebrados no GitHub Pages.

## Validações locais

| Verificação | Situação | Observação |
|---|---|---|
| ESLint | concluída | código e configurações sem erros |
| Testes unitários | concluída | datas, alocação, estorno e bloqueio do ID de produção |
| Build Vite | concluída | artefato gerado em `dist/` |
| Smoke test Playwright | concluída | tela de login carregada pelo Auth Emulator |
| Testes de regras | pendente no computador | Java não está instalado; o CI usa Temurin 21 |
| `npm audit --omit=dev` | concluída | 0 vulnerabilidades nas dependências de produção |
| `npm audit` completo | atenção | 7 alertas moderados somente na árvore dev do Firebase CLI; o npm sugere downgrade para 14.23.0 |

O resultado final do CI da branch deve ser acrescentado a esta etapa após o push.

## Decisões de segurança

1. Nenhuma credencial administrativa ou exportação da base foi adicionada ao repositório.
2. `.env.test` contém apenas o ID `demo-*` e ativa os emuladores.
3. Qualquer script de teste termina antes de iniciar se receber o ID de produção.
4. O workflow de branches executa validações, mas nunca publica; o deploy permanece restrito a `master`.
5. As regras candidatas não substituem as regras remotas nesta etapa.
6. A extração do arquivo `app.js` é incremental, preservando o comportamento e o schema atuais.

## Pendências para concluir toda a Etapa 1

- criar um projeto Firebase remoto de staging e seu alias, caso seja realmente necessário além dos emuladores;
- concluir a separação entre `domain/`, `persistence/`, `firebase/` e `ui/`;
- ampliar o E2E para autenticação, calendário e pagamentos com dados sintéticos;
- instalar Java 21 no ambiente local ou manter os testes de regras exclusivamente no CI;
- planejar e testar a migração para uma versão principal atual do Firebase junto da evolução da biblioteca de testes de regras;
- acompanhar correções das dependências transitivas do Firebase CLI e reavaliar os 7 alertas moderados de desenvolvimento;
- decidir e testar a regra de negócio para pagamentos limitados às semanas selecionadas (teste marcado como pendente);
- concluir a Etapa 0 antes de qualquer alteração remota em dados ou regras.

## Próximo recorte recomendado

Depois de confirmar o CI desta branch e concluir o backup da Etapa 0, extrair uma camada de repositório que grave por caminhos granulares no Realtime Database. Primeiro serão adicionados testes de caracterização do schema atual; somente depois o `app.js` passará a usar a nova camada.
