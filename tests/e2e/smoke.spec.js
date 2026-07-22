import { expect, test } from '@playwright/test';

test('carrega a tela de login sem erros JavaScript', async ({ page }) => {
  const errors = [];
  const missingIcons = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'warning' && message.text().includes('icon name was not found')) {
      missingIcons.push(message.text());
    }
  });

  await page.goto('/');

  await expect(page).toHaveTitle('Dias Trabalhados');
  await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeVisible();
  await expect(page.locator('#app-content')).toBeHidden();
  await expect(page.locator('#val-app-version-login')).not.toHaveText('1.0.0');
  expect(errors).toEqual([]);
  expect(missingIcons).toEqual([]);
});
