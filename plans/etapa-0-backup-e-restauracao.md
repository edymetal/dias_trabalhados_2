# Etapa 0 — backup e restauração

Data de conclusão local: 22/07/2026

## Resultado

A base de produção foi somente lida. Nenhuma importação, escrita, remoção ou publicação de regras foi executada no projeto `dias-trabalhados-bf99a`.

Foram exportados:

- Realtime Database completo, com prioridades;
- regras atuais do Realtime Database;
- 8 contas do Firebase Authentication;
- configuração pública do aplicativo Web;
- inventário de contagens, totais e hash canônico.

Diretório do ensaio principal:

`D:\Backups\dias_trabalhados_2\20260722-184557`

Artefato criptografado:

`backup-20260722-184557.dtbackup`

SHA-256 do artefato criptografado:

`e864f90e5003403d4800379b14a4e5ba71c5f776dfd805c6115b7028a9dc86bd`

Referência da chave protegida:

`C:\Users\Edney\.dias-trabalhados-backup-keys\20260722-184557.key.dpapi`

Os nove arquivos sensíveis em texto claro usados no ensaio foram removidos depois de duas verificações de descriptografia. Eles permanecem recuperáveis pelo arquivo `.dtbackup` e pela chave DPAPI.

## Verificação da restauração

A cópia foi restaurada exclusivamente no Realtime Database Emulator, usando o projeto descartável `demo-dias-trabalhados-2`, e reexportada para comparação.

| Invariante | Original | Restaurado |
|---|---:|---:|
| Hash canônico SHA-256 | `eab0cc7037a7997bd4721a7dc8d160e0edb436145fb6c5439f464f2c9be88a67` | idêntico |
| Nós | 1.375 | 1.375 |
| Entradas `userData` | 2 | 2 |
| Bases de usuário válidas | 2 | 2 |
| E-mails autorizados | 2 | 2 |
| Dias trabalhados | 81 | 81 |
| Pagamentos | 8 | 8 |
| Valor dos dias | 4.005 | 4.005 |
| Valor pago | 3.240 | 3.240 |
| Valor pendente | 765 | 765 |

O invariante financeiro também fechou: `4.005 = 3.240 + 765`. Foi identificada uma raiz legada chamada `fluxoTurnoDB`; ela foi preservada integralmente e deve ser analisada antes de qualquer migração na Etapa 2.

## Criptografia e recuperação

O formato `.dtbackup` usa AES-256-GCM. A chave aleatória de 256 bits é armazenada separadamente e protegida pelo Windows DPAPI para o usuário atual.

Para recuperar o ZIP:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/unprotect-backup.ps1 `
  -EncryptedBackup "D:\Backups\dias_trabalhados_2\20260722-184557\backup-20260722-184557.dtbackup" `
  -ProtectedKey "C:\Users\Edney\.dias-trabalhados-backup-keys\20260722-184557.key.dpapi" `
  -OutputArchive "D:\Backups\dias_trabalhados_2\recovery\backup.zip"

Expand-Archive `
  -LiteralPath "D:\Backups\dias_trabalhados_2\recovery\backup.zip" `
  -DestinationPath "D:\Backups\dias_trabalhados_2\recovery\conteudo"
```

A chave DPAPI depende do mesmo perfil do Windows. A cópia atual protege contra erro da aplicação e exclusão acidental, mas não substitui uma cópia externa com estratégia de recuperação de chave. Não enviar o backup ao GitHub, e-mail ou nuvem sem definir antes o destino e a custódia da chave.

## Teste de restauração no emulador

Use Java 21 e nunca aponte o comando para o project ID de produção:

```powershell
$env:JAVA_HOME = "CAMINHO_PARA_JAVA_21"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

firebase emulators:exec `
  --project demo-dias-trabalhados-2 `
  --only database `
  "node scripts/restore-rtdb-emulator.mjs D:\Backups\dias_trabalhados_2\recovery\conteudo\rtdb-data.json D:\Backups\dias_trabalhados_2\recovery\restaurado.json"

node scripts/verify-rtdb-backup.mjs compare `
  "D:\Backups\dias_trabalhados_2\recovery\conteudo\rtdb-data.json" `
  "D:\Backups\dias_trabalhados_2\recovery\restaurado.json"
```

Nunca testar restauração sobre `dias-trabalhados-bf99a`.

## Backup automático e retenção

O Console Firebase confirmou que o projeto está no plano Spark. O backup automático nativo do Realtime Database exige upgrade para Blaze e pode gerar cobrança; nenhum upgrade foi feito.

Como alternativa sem custo adicional, foi instalada a tarefa do Windows:

- nome: `Dias Trabalhados - Backup Firebase`;
- frequência: diária às 03:00;
- execução atrasada: inicia quando possível caso o horário seja perdido;
- retenção: 30 dias;
- proteção: AES-256-GCM com chave DPAPI separada;
- limpeza: texto claro removido somente depois de a recuperação independente conferir o mesmo SHA-256;
- diretório estável dos scripts: `D:\Backups\dias_trabalhados_2\automation`;
- logs: `D:\Backups\dias_trabalhados_2\logs`.

A tarefa usa o token do Firebase CLI do usuário atual e execução interativa. Se a sessão expirar, o log registrará falha e será necessário executar `firebase login --reauth`.

O teste iniciado pelo próprio Agendador em 22/07/2026 terminou com `LastTaskResult = 0`, gerou o backup `20260722-190423`, removeu o texto claro e deixou a próxima execução programada para 23/07/2026 às 03:00.

## Critério de saída

- [x] projeto e instância confirmados;
- [x] dados, regras, usuários e configuração exportados;
- [x] hashes e manifesto gerados;
- [x] backup criptografado;
- [x] recuperação da criptografia testada em processo independente;
- [x] restauração comprovada no emulador;
- [x] contagens, totais e hash canônico idênticos;
- [x] automação local diária com retenção de 30 dias;
- [ ] cópia externa/off-site e chave portátil — depende de escolha explícita do destino;
- [ ] backup nativo Firebase — indisponível no Spark e depende de aprovação de cobrança Blaze.

O critério técnico local da Etapa 0 está concluído. Antes de alterações destrutivas ou migrações de alto risco, recomenda-se também fechar a pendência de cópia externa.
