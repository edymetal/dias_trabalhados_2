# Etapa 2 — persistência e segurança

Data de conclusão técnica local: 23/07/2026

Status: **concluída no código e nos emuladores; rollout de produção deliberadamente não executado**

Branch: `codex/etapa-2-persistencia-seguranca`

## Objetivo alcançado

A aplicação deixou de substituir `userData/{uid}/db` inteiro a cada alteração. O estado agora é salvo localmente por UID, convertido em patches granulares, mantido em uma fila durável e enviado com `update()` atômico. Alterações feitas por duas sessões em caminhos diferentes foram preservadas nos testes unitários e no Realtime Database Emulator.

Nenhuma leitura, escrita, migração, publicação de regras, custom claim, restrição de chave ou ativação de App Check foi executada no Firebase de produção.

## Entregas

- cache `localStorage` isolado por UID;
- reivindicação única e registrada do cache legado sem UID;
- fila persistente por UID, mantida após recarregar ou fechar o navegador;
- operações idempotentes com patches de valores absolutos;
- retry automático quando `/.info/connected` volta a indicar conexão;
- estado visual: sincronizado, sincronizando, offline/pendente ou bloqueado;
- assinatura em tempo real para refletir alterações de outras sessões;
- schema atual `2`, migrações sequenciais e idempotentes;
- bloqueio de escrita remota ao encontrar schema futuro desconhecido;
- validação de importações, tamanho máximo de 5 MB, limites de registros, números e chaves;
- cinco pontos locais de recuperação por UID antes de importar, apagar ou restaurar;
- botão para restaurar a cópia mais recente;
- autorização preferencial por custom claim `authorized`, com fallback temporário para a whitelist legada;
- regras candidatas por UID, claim, schema e valores críticos;
- preparação opcional para App Check com reCAPTCHA Enterprise, desativada sem site key;
- ferramenta de validação da migração sobre backup real criptografado.

## Validação contra o backup real

O artefato criptografado da Etapa 0 foi recuperado para uma pasta temporária dentro de `D:\Backups\dias_trabalhados_2`, validado localmente e removido no bloco `finally`. Nenhum JSON em texto claro permaneceu no disco.

| Invariante | Antes | Depois da migração em memória |
|---|---:|---:|
| Bases de usuário | 2 | 2 |
| Dias trabalhados | 81 | 81 |
| Pagamentos | 8 | 8 |
| Valor dos dias | 4.005 | 4.005 |
| Valor pago | 3.240 | 3.240 |
| Valor pendente | 765 | 765 |
| Valor dos pagamentos | 3.240 | 3.240 |
| Raiz `fluxoTurnoDB` | presente | preservada |
| Schema final | sem versão | 2 |

Comando reutilizável, somente sobre uma cópia descriptografada temporária:

```powershell
npm run test:migration-backup -- D:\caminho-temporario\rtdb-data.json
```

## Modelo de sincronização

1. A nuvem é lida e normalizada sem mutar o objeto original.
2. Migrações necessárias são transformadas em patches e entram na fila.
3. Operações pendentes locais são reaplicadas sobre o snapshot remoto.
4. O estado efetivo é gravado no cache específico do UID.
5. Cada alteração seguinte gera apenas as folhas modificadas.
6. `update()` envia todos os caminhos da operação atomicamente.
7. A operação só sai da fila após confirmação do SDK.
8. Repetir uma operação após interrupção é seguro porque ela contém valores absolutos.

O SDK Web não persiste sua fila offline após encerrar a sessão; por isso a fila da aplicação permanece necessária. Referências: [gravações e updates atômicos](https://firebase.google.com/docs/database/web/read-and-write) e [estado de conexão](https://firebase.google.com/docs/database/web/offline-capabilities).

## Segurança e autorização

As regras candidatas continuam em `firebase/database.rules.emulator.json` e **não foram publicadas**. Elas exigem:

- usuário autenticado;
- UID do token igual ao nó acessado;
- custom claim `authorized: true` ou um dos dois e-mails mestres existentes;
- schema exatamente igual a `2` para novas gravações;
- tarifas e valores não negativos;
- datas de dias no formato `YYYY-MM-DD`;
- nenhum acesso à lista `authorized_emails`;
- nenhum acesso anônimo ou a outro UID.

Custom claims são transportadas no ID token e podem ser usadas em `auth.token` pelas regras. Referências: [custom claims](https://firebase.google.com/docs/auth/admin/custom-claims) e [condições nas regras do Realtime Database](https://firebase.google.com/docs/database/security/rules-conditions).

## Rollout de produção — bloqueado até autorização explícita

Executar em janela controlada, nesta ordem:

1. renovar `firebase login --reauth` e confirmar projeto/instância;
2. gerar novo backup criptografado e repetir a restauração no Emulator;
3. atribuir `authorized: true` a todos os usuários válidos que não sejam mestres;
4. confirmar renovação dos ID tokens e testar esses usuários em staging;
5. publicar primeiro a aplicação compatível, sem mudar as regras;
6. confirmar migração para schema 2 e fila vazia em todas as contas;
7. publicar as regras somente após teste de leitura/escrita por cada perfil;
8. restringir a chave Web por domínios e APIs necessárias no Google Cloud;
9. registrar o app Web no App Check e configurar `VITE_FIREBASE_APP_CHECK_SITE_KEY`;
10. observar métricas do App Check antes de ativar enforcement, pois requisições sem token passam a ser rejeitadas;
11. manter rollback da aplicação, das regras e do backup disponível.

A ativação de enforcement pode bloquear clientes ainda não preparados e leva alguns minutos para propagar. Referência: [ativação de enforcement do App Check](https://firebase.google.com/docs/app-check/enable-enforcement).

## Validação final

Executada em 23/07/2026, sem apontar nenhum teste para produção:

| Verificação | Resultado |
|---|---:|
| ESLint | aprovado |
| Testes unitários | 29/29 |
| Testes das regras no Database Emulator | 8/8 |
| Testes E2E no Auth + Database Emulators | 2/2 |
| Build de produção | aprovado |
| Auditoria das dependências de produção | 0 vulnerabilidades |
| `git diff --check` | aprovado |

A chave Web do Firebase existente no cliente é um identificador público de configuração, não uma credencial administrativa. Mesmo assim, a restrição por domínio e pelas APIs necessárias continua obrigatória no rollout de produção.

## Critérios de saída

- [x] cache por UID;
- [x] patches granulares e atômicos;
- [x] fila durável e retry;
- [x] estado de sincronização visível;
- [x] assinatura de alterações remotas;
- [x] schema versionado e migrações idempotentes;
- [x] schema futuro bloqueia escrita;
- [x] importação validada;
- [x] exclusão e restauração recuperáveis;
- [x] regras por UID/custom claim testadas;
- [x] duas sessões não perdem alterações em caminhos diferentes;
- [x] um UID nunca acessa outro no Emulator;
- [x] migração validada contra o backup real;
- [ ] rollout, claims, regras finais, restrição de chave e enforcement em produção — exigem autorização explícita e janela operacional.

O critério técnico local da Etapa 2 está concluído. A pendência externa não deve ser tratada como autorização implícita para modificar produção.
