# Restrição permanente de plano gratuito

Este projeto deve funcionar sem cartão, conta de faturamento vinculada ou migração para planos pagos.

## Serviços aprovados

| Plataforma | Uso aprovado | Limite relevante |
|---|---|---|
| GitHub Free | repositório público, Pages e runners padrão do Actions | Actions padrão são gratuitos em repositórios públicos |
| Firebase Spark | Authentication com Google | não usar autenticação por telefone |
| Firebase Spark | Realtime Database | 1 GB armazenado, 10 GB baixados/mês e 100 conexões simultâneas |
| Firebase App Check | provedor Web no nível reCAPTCHA Essentials, sem billing | até 10.000 avaliações/mês; após o limite, requisições falham em vez de gerar cobrança |

Fontes oficiais: [Firebase Pricing](https://firebase.google.com/pricing), [planos Spark e Blaze](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [limites do Realtime Database](https://firebase.google.com/docs/database/usage/limits), [preços do reCAPTCHA](https://docs.cloud.google.com/recaptcha/docs/billing-information), [GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions) e [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

## Serviços proibidos neste projeto

- vincular uma conta de faturamento ao projeto Firebase;
- migrar do Spark para Blaze;
- Firebase App Hosting, Cloud Functions, Extensions ou Cloud Storage;
- autenticação por telefone/SMS;
- runners maiores do GitHub Actions;
- backup nativo pago do Realtime Database;
- qualquer implantação em Google Cloud que exija billing.

Custom claims devem ser atribuídas por operação administrativa local e controlada com o Admin SDK, sem Cloud Functions.

## Proteções

- `.firebaserc` aponta somente para o projeto fictício `demo-dias-trabalhados-2`;
- testes Firebase executam apenas nos emuladores;
- branches `codex/**` não publicam o site;
- `npm run test:free-tier` rejeita serviços Firebase que exigem billing, projeto padrão que não seja `demo-*`, runner não aprovado ou deploy Google Cloud no workflow;
- o uso das cotas deve ser acompanhado nos consoles, pois um teste estático não consegue medir consumo real.

No Spark, exceder a cota de um produto interrompe esse produto até a renovação da cota; não autoriza upgrade e não deve ser contornado ativando faturamento.
