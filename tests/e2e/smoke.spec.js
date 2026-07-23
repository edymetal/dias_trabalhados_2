import { expect, test } from '@playwright/test';

const masterEmail = 'edneypugliese.dev@gmail.com';
const masterPassword = 'Emulator-only-2026!';

function localDateISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

test.beforeAll(async ({ request }) => {
  const response = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key',
    {
      data: {
        email: masterEmail,
        password: masterPassword,
        displayName: 'Usuário do Emulador',
        returnSecureToken: true
      }
    }
  );

  expect(response.ok()).toBe(true);
});

async function signInWithEmulator(page) {
  await page.evaluate(async ({ email, password }) => {
    const { auth, signInWithEmailAndPassword } = await import('/src/firebase/client.js');
    await signInWithEmailAndPassword(auth, email, password);
  }, { email: masterEmail, password: masterPassword });
  await expect(page.locator('#app-content')).toBeVisible();
}

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

test('autentica e conclui os fluxos de calendário e pagamento com dados sintéticos', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  const workedDate = localDateISO();
  const previousWeek = new Date();
  previousWeek.setDate(previousWeek.getDate() - 7);
  const previousWorkedDate = localDateISO(previousWeek);
  const syntheticDatabase = {
    settings: {
      morningRate: 35,
      nightRate: 25,
      currency: 'EUR',
      offDays: [4],
      halfDays: {},
      autoFillWorkedDays: false,
      language: 'pt-BR',
      theme: 'dark'
    },
    workedDays: {
      [workedDate]: {
        date: workedDate,
        period: 'morning',
        rate: 35,
        status: 'unpaid',
        amountPaid: 0,
        pendingAmount: 35,
        notes: 'Dado sintético E2E',
        paymentsApplied: {}
      },
      [previousWorkedDate]: {
        date: previousWorkedDate,
        period: 'morning',
        rate: 35,
        status: 'unpaid',
        amountPaid: 0,
        pendingAmount: 35,
        notes: 'Semana não selecionada',
        paymentsApplied: {}
      }
    },
    payments: []
  };

  await page.addInitScript(database => {
    localStorage.setItem('fluxoturno_db', JSON.stringify(database));
  }, syntheticDatabase);
  await page.goto('/');
  await signInWithEmulator(page);

  await expect(page.locator('#user-email')).toHaveText(masterEmail);
  await expect(page.locator('#stat-total-earnings')).toContainText('70');
  const cacheState = await page.evaluate(async () => {
    const { auth } = await import('/src/firebase/client.js');
    const userId = auth.currentUser.uid;
    return {
      owner: localStorage.getItem('fluxoturno_db:legacy-owner'),
      cached: JSON.parse(localStorage.getItem(`fluxoturno_db:user:${userId}`)),
      queue: JSON.parse(localStorage.getItem(`fluxoturno_db:queue:${userId}`))
    };
  });
  expect(cacheState.owner).toBeTruthy();
  expect(cacheState.cached.schemaVersion).toBe(3);
  expect(cacheState.queue).toEqual([]);

  await page.locator('[data-tab="calendar"]').click();
  const workedDayButton = page.locator(`.calendar-day[data-date="${workedDate}"]`);
  await workedDayButton.click();
  await expect(page.locator('#day-modal')).toHaveClass(/active/);
  await expect(page.locator('#modal-date-value')).toHaveValue(workedDate);
  await expect(page.locator('#period-morning')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#day-modal')).toBeHidden();
  await expect(workedDayButton).toBeFocused();
  await workedDayButton.click();
  await page.locator('#modal-notes').fill('Registro validado no navegador');
  await page.getByRole('button', { name: 'Salvar Registro' }).click();
  await expect(page.locator('#day-modal')).toBeHidden();

  await page.locator('[data-tab="payments"]').click();
  await expect(page.locator('.week-card')).toHaveCount(2);
  await page.locator('.week-card').first().click();
  await expect(page.locator('.week-card').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#input-payment-amount')).toHaveValue('35.00');
  await page.locator('#input-payment-date').click();
  await page.locator('[data-action="today-date"]').click();
  await expect(page.locator('#input-payment-date')).toHaveValue(workedDate);
  await page.getByRole('button', { name: 'Confirmar Recebimento' }).click();

  await page.locator('[data-tab="dashboard"]').click();
  await expect(page.locator('#stat-total-received')).toContainText('35');
  const paymentState = await page.evaluate(async () => {
    const { auth } = await import('/src/firebase/client.js');
    const userId = auth.currentUser.uid;
    return JSON.parse(localStorage.getItem(`fluxoturno_db:user:${userId}`));
  });
  expect(paymentState.workedDays[workedDate]).toMatchObject({ amountPaid: 35, pendingAmount: 0 });
  expect(paymentState.workedDays[previousWorkedDate]).toMatchObject({ amountPaid: 0, pendingAmount: 35 });

  await page.locator('[data-tab="history"]').click();
  await expect(page.locator('#payment-history-table-body tr:not(.history-month-header)')).toHaveCount(1);
  await expect(page.locator('#payment-history-table-body')).toContainText('35');

  await page.locator('[data-tab="settings"]').click();
  await page.locator('#btn-clear-database').click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await page.locator('#confirmation-accept').click();
  await page.locator('[data-tab="history"]').click();
  await expect(page.locator('#payment-history-table-body')).toContainText('Nenhum registro');

  await page.locator('[data-tab="settings"]').click();
  await page.locator('#btn-restore-database').click();
  await page.locator('#confirmation-accept').click();
  await page.locator('[data-tab="history"]').click();
  await expect(page.locator('#payment-history-table-body')).toContainText('35');
});

test('mantém navegação e diálogos utilizáveis em viewport mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await signInWithEmulator(page);

  const menuButton = page.locator('#btn-toggle-sidebar');
  await expect(menuButton).toBeVisible();
  await menuButton.click();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#app-sidebar')).toHaveClass(/active/);

  await page.keyboard.press('Escape');
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await expect(menuButton).toBeFocused();

  await menuButton.click();
  await page.getByRole('button', { name: 'Calendário' }).click();
  await expect(page.locator('#section-calendar')).toHaveClass(/active/);
  const firstDay = page.locator('.calendar-day').first();
  await firstDay.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();

  const dialogBox = await page.getByRole('dialog').boundingBox();
  expect(dialogBox.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(390);
  expect(dialogBox.height).toBeLessThanOrEqual(844);
  await page.keyboard.press('Escape');
  await expect(firstDay).toBeFocused();
});
