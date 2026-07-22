# Etapa 1 — base de engenharia isolada

Data de início: 22/07/2026

Data de conclusão: 22/07/2026

Status: **concluída**

Branches: `codex/etapa-1-base-engenharia` e `codex/etapa-1-conclusao`

## Objetivo alcançado

O projeto pode ser desenvolvido e validado localmente e no CI sem ler ou escrever no Firebase de produção. O formato persistido e o caminho remoto `userData/{uid}/db` foram preservados; não houve migração, importação, limpeza, deploy de regras ou alteração remota nesta etapa.

## Entregas

- Vite, dependências com versões exatas e lockfile;
- Firebase SDK 10.14.1 e `undici` transitivo fixado em 6.27.0;
- bloqueio do project ID de produção antes de qualquer suíte de teste;
- projeto local `demo-dias-trabalhados-2`, Auth Emulator e Database Emulator;
- regras candidatas exclusivas do emulador, testadas por UID, claim e e-mails mestres;
- separação inicial entre `domain/`, `persistence/`, `firebase/` e `ui/`;
- repositório testável que carrega a nuvem primeiro, usa fallback local e preserva campos legados;
- erros de leitura e sincronização propagados a uma região `aria-live` da interface;
- datas, livro financeiro e cálculos do dashboard extraídos para funções puras;
- traduções e runtime de gráficos extraídos do controlador principal;
- Chart.js carregado sob demanda, reduzindo o chunk inicial de aproximadamente 539 KB para 328 KB;
- Vitest, testes de regras e Playwright com dados sintéticos;
- E2E de login, calendário, pagamento e histórico usando somente emuladores;
- regra definida e testada: semanas selecionadas são restritivas e o excedente vira crédito;
- calendário operável por clique, Enter ou Espaço;
- ESLint e GitHub Actions obrigatórios antes do deploy;
- Java 21 portátil disponível no ambiente local e Java 21 configurado nos jobs de CI;
- antigo `test.html` removido, com histórico recuperável pelo Git;
- Etapa 0 concluída antes desta conclusão, com backup e restauração validados.

## Validação final local

| Verificação | Resultado |
|---|---|
| ESLint | aprovado |
| Testes unitários | 23 aprovados em 6 arquivos |
| Testes de regras | 5 aprovados no Database Emulator |
| Playwright | 2 aprovados no Auth e Database Emulator |
| Build Vite | aprovado |
| Chunk inicial | 327,57 KB, gzip 96,57 KB |
| Chunk Chart.js sob demanda | 202,67 KB, gzip 69,52 KB |
| `npm audit --omit=dev` | 0 vulnerabilidades conhecidas |

## Arquitetura resultante

- `src/domain/`: regras puras de datas, dashboard e alocação financeira;
- `src/persistence/`: schema padrão, normalização retrocompatível e estratégia local/remota;
- `src/firebase/`: configuração segura, autenticação, autorização e adaptadores do Realtime Database;
- `src/ui/`: traduções, feedback de erro e carregamento tardio dos gráficos;
- `app.js`: orquestra estado e telas existentes enquanto a extração visual continua incrementalmente;
- `tests/unit/`: domínio, persistência, backup e proteção da configuração;
- `tests/integration/`: isolamento das regras do Realtime Database;
- `tests/e2e/`: fluxos críticos com conta e dados descartáveis.

Consulte também `docs/arquitetura.md`.

## Decisões de segurança

1. Nenhuma credencial administrativa, chave privada ou exportação da base foi adicionada ao repositório.
2. A senha presente no E2E pertence apenas a uma conta descartável criada dentro do Auth Emulator.
3. `.env.test` contém somente o ID `demo-*` e ativa os emuladores.
4. O workflow de branches valida, mas não publica; o deploy continua restrito a `master`.
5. As regras candidatas não substituem as regras de produção.
6. A normalização cria uma cópia e preserva propriedades desconhecidas, inclusive raízes legadas.
7. O projeto remoto de staging não foi criado: os emuladores cobrem o critério da etapa sem criar custo, recurso remoto ou risco adicional. Ele poderá ser criado na Etapa 5 se houver necessidade operacional explícita.

## Itens transferidos para etapas posteriores

- gravações granulares, controle de concorrência, fila offline e schema versionado: Etapa 2;
- centavos inteiros e reconciliação financeira completa: Etapa 3;
- remoção dos handlers inline, modais acessíveis e decomposição completa das telas: Etapa 4;
- staging remoto, telemetria e estratégia de publicação/rollback: Etapa 5;
- atualização de versão principal do Firebase e alertas transitivos da Firebase CLI: manutenção controlada, sem bloquear a Etapa 1.

## Próxima etapa

A Etapa 2 deve substituir a gravação integral por operações granulares e protegidas contra concorrência. Toda mudança precisa ser exercitada primeiro com uma cópia no Emulator e comparada com os invariantes documentados na Etapa 0.
