/* ==========================================================================
   APP CONTROLLER & LOGIC - CONTROLE DE DIAS TRABALHADOS
   ========================================================================== */

import {
  AlertCircle,
  BarChart3,
  Calculator,
  Calendar,
  CalendarCheck,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  CalendarX,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  Coins,
  createIcons,
  Database,
  Download,
  HandCoins,
  HelpCircle,
  History,
  Info,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Palette,
  Palmtree,
  PieChart,
  Save,
  Settings,
  Sun,
  Sunset,
  ToggleLeft,
  ToggleRight,
  Trash2,
  TrendingUp,
  Upload,
  Wallet,
  ZoomIn,
  ZoomOut
} from 'lucide';
import {
  formatDateISO,
  formatDateStringDisplay,
  getNextPaymentDate,
  getWeekRange,
  parseLocalDate
} from './src/domain/dates.js';
import {
  allocatePaymentAcrossDays,
  applyAdvanceCreditsToDay,
  isFinancialDay,
  normalizePayment,
  reconcileLedger,
  refreshDayFinancials,
  refundPaymentCreditsFromDay,
  reversePayment
} from './src/domain/ledger.js';
import {
  calculateFinancialSummary,
  splitPaymentMethod
} from './src/domain/dashboard.js';
import { getAutoFillBatch } from './src/domain/autofill.js';
import { addMoney, fromCents, moneyEquals, normalizeMoney, toCents } from './src/domain/money.js';
import {
  auth,
  onAuthStateChanged,
  provider,
  signInWithPopup,
  signOut
} from './src/firebase/client.js';
import { checkUserAccess } from './src/firebase/access-control.js';
import { initializeApplicationProtection } from './src/firebase/app-check.js';
import { userDatabase } from './src/firebase/user-database.js';
import {
  createDatabaseRepository,
  createDefaultDatabase,
  DATABASE_STORAGE_KEY,
  getUserStorageKey,
  MAX_IMPORT_BYTES,
  validateImportedDatabase
} from './src/persistence/database.js';
import { loadChartRuntime } from './src/ui/chart-runtime.js';
import { renderSyncState, reportError, showStatus } from './src/ui/feedback.js';
import { translations } from './src/ui/translations.js';

const lucideIcons = {
  AlertCircle,
  BarChart3,
  Calculator,
  Calendar,
  CalendarCheck,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  CalendarX,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  Coins,
  Database,
  Download,
  HandCoins,
  HelpCircle,
  History,
  Info,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Palette,
  Palmtree,
  PieChart,
  Save,
  Settings,
  Sun,
  Sunset,
  ToggleLeft,
  ToggleRight,
  Trash2,
  TrendingUp,
  Upload,
  Wallet,
  ZoomIn,
  ZoomOut
};

const lucide = {
  createIcons: () => createIcons({ icons: lucideIcons })
};

const applicationProtectionReady = initializeApplicationProtection().catch(error => {
  reportError('app-check', error, 'Falha ao iniciar a proteção App Check.');
  return false;
});

// Versão da aplicação (gerenciada automaticamente pelo Git Hook)
const APP_VERSION = '1.0.119';
const APP_BUILD_DATE = '2026-07-23 08:23:21';




onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      await applicationProtectionReady;
      const access = await checkUserAccess(user);
      if (access.authorized) {
        console.info(`Usuário autorizado por: ${access.source}.`);
        setupUserProfile(user);
        await initDatabase();
      } else {
        handleAccessDenied(user.email);
      }
    } catch (error) {
      console.error("Erro ao verificar permissões:", error);
      showLoginError(getText('msg-permission-connection-error'));
      await signOut(auth);
    }
  } else {
    showLoginScreen();
  }
});

// Funções auxiliares para limpar o fluxo de autenticação
function setupUserProfile(user) {
  const texts = translations[getCurrentLanguage()] || translations['pt-BR'];
  document.getElementById('user-photo').src = user.photoURL || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';
  document.getElementById('user-name').innerText = user.displayName || texts['user-default-name'];
  document.getElementById('user-email').innerText = user.email;
  document.getElementById('user-profile').style.display = 'flex';
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-content').style.display = 'flex';
}

function handleAccessDenied(email) {
  console.warn("Acesso negado para:", email);
  alert(getText('msg-access-denied').replace('{email}', email));
  showLoginError(getText('msg-access-restricted'));
  signOut(auth);
}

function showLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-content').style.display = 'none';
  document.getElementById('user-profile').style.display = 'none';
  applyStaticTranslations(getCurrentLanguage());
}

function showLoginError(msg) {
  const errorEl = document.getElementById('login-error-msg');
  if (errorEl) {
    errorEl.innerText = msg;
    errorEl.style.display = 'block';
  }
}

// Função de Login
async function handleLogin() {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Erro no login:", error);
    showLoginError(getText('msg-google-auth-failed'));
  }
}

// Traduções para Português e Italiano
let db = null;
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-indexed (0 = Jan, 11 = Dez)
let earningsChart = null;
let annualMethodChart = null;
let selectedWeeks = []; // Lista de chaves de semana selecionadas ('YYYY-MM-DD_YYYY-MM-DD')
const MAX_WORK_CYCLE_WEEKS = 10;
const MONTH_NAMES = [];
const WEEKDAY_NAMES = [];
let unsubscribeDatabase = null;

const databaseRepository = createDatabaseRepository({
  localStorage: window.localStorage,
  remoteStore: userDatabase,
  onSyncState: renderSyncState,
  onError: ({ phase, error }) => {
    const messages = {
      'local-read': 'O armazenamento local estava inválido. Uma base vazia e segura foi carregada.',
      'local-write': 'Não foi possível salvar os dados neste dispositivo.',
      'remote-read': 'Não foi possível carregar a nuvem. Os dados locais foram usados.',
      'remote-write': 'Os dados foram salvos neste dispositivo e entrarão na fila até a conexão voltar.',
      'queue-read': 'A fila local de sincronização estava inválida.',
      'queue-write': 'Não foi possível persistir a fila de sincronização.',
      'incompatible-schema': 'A nuvem usa uma versão mais nova. Alterações remotas foram bloqueadas para evitar perda de dados.'
    };
    reportError(`database:${phase}`, error, messages[phase]);
  }
});

/* ==========================================================================
   INICIALIZAÇÃO DA APLICAÇÃO
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  renderAppVersion();
  initNavigation();
  initCurrentDate();
  initMondayFirstDateInputs();

  // Configura botão de login do Google
  const loginBtn = document.getElementById('btn-google-login');
  if (loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
  }

  // Escuta alteração do valor do pagamento para atualizar a divisão do Misto se estiver ativo
  const paymentAmountInput = document.getElementById('input-payment-amount');
  const inputCash = document.getElementById('input-payment-cash-amount');
  const inputDeposit = document.getElementById('input-payment-deposit-amount');
  
  if (paymentAmountInput) {
    paymentAmountInput.addEventListener('input', () => {
      const methodSelect = document.getElementById('input-payment-method');
      if (methodSelect && methodSelect.value === 'Misto') {
        const totalCents = toCents(Number.parseFloat(paymentAmountInput.value) || 0);
        const cashCents = Math.floor(totalCents / 2);
        document.getElementById('input-payment-cash-amount').value = fromCents(cashCents).toFixed(2);
        document.getElementById('input-payment-deposit-amount').value = fromCents(totalCents - cashCents).toFixed(2);
      }
    });
  }

  // Permite valores assimétricos calculando a contrapartida dinamicamente
  if (inputCash && inputDeposit && paymentAmountInput) {
    inputCash.addEventListener('input', () => {
      const totalCents = toCents(Number.parseFloat(paymentAmountInput.value) || 0);
      const cashCents = toCents(Number.parseFloat(inputCash.value) || 0);
      inputDeposit.value = fromCents(Math.max(0, totalCents - cashCents)).toFixed(2);
    });
    inputDeposit.addEventListener('input', () => {
      const totalCents = toCents(Number.parseFloat(paymentAmountInput.value) || 0);
      const depositCents = toCents(Number.parseFloat(inputDeposit.value) || 0);
      inputCash.value = fromCents(Math.max(0, totalCents - depositCents)).toFixed(2);
    });
  }
});

// Inicializa o banco de dados carregando do Firebase ou localStorage
async function initDatabase() {
  const userId = auth.currentUser?.uid;
  if (!userId) return;
  const loaded = await databaseRepository.load(userId);
  db = loaded.data;
  console.info(`Base carregada da origem: ${loaded.source}.`);
  
  // Aplicar tema carregado do banco de dados
  applyTheme(db.settings.theme);
  
  // Após carregar, se estivermos na UI principal, renderizamos tudo
  await applyAutomaticWorkedDayFill();

  if (typeof renderCalendar === 'function') {
    renderAll();
  }

  unsubscribeDatabase?.();
  unsubscribeDatabase = databaseRepository.subscribe(userId, remoteData => {
    db = remoteData;
    renderAll();
  });
}

// Salva o estado atual no localStorage e no Firebase
async function saveToStorage() {
  const userId = auth.currentUser?.uid;
  if (!userId) return { local: false, remote: false };
  return databaseRepository.save(db, userId);
}

window.addEventListener('online', () => {
  if (auth.currentUser?.uid) databaseRepository.retry(auth.currentUser.uid);
});

// Função auxiliar para renderizar toda a UI (chamada após carga inicial)
function renderAll() {
  if (document.getElementById('calendar-days-grid')) {
    updateDashboardData();
    renderCalendar();
    renderWeeksList();
    renderPaymentHistory();
    loadSettingsFields();
    updatePaymentSummary();
    updateRateLabels();
    applyLanguage();
  }
}

function getCurrentLanguage() {
  if (db?.settings?.language && translations[db.settings.language]) {
    return db.settings.language;
  }

  try {
    const keys = [
      auth.currentUser?.uid ? getUserStorageKey(auth.currentUser.uid) : null,
      DATABASE_STORAGE_KEY
    ].filter(Boolean);
    for (const key of keys) {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        const lang = parsed?.settings?.language;
        if (translations[lang]) return lang;
      }
    }
  } catch (e) {
    console.warn("Erro ao ler idioma salvo:", e);
  }

  return 'pt-BR';
}

function getText(key) {
  const lang = getCurrentLanguage();
  return translations[lang]?.[key] || translations['pt-BR'][key] || key;
}

function applyStaticTranslations(lang = getCurrentLanguage()) {
  const texts = translations[lang] || translations['pt-BR'];
  document.documentElement.lang = lang;
  document.title = texts['app-title'] || document.title;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (texts[key]) {
      el.innerText = texts[key];
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (texts[key]) {
      el.setAttribute('placeholder', texts[key]);
    }
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (texts[key]) {
      el.setAttribute('title', texts[key]);
    }
  });
}

// Aplica as Traduções baseadas no idioma atual
function applyLanguage() {
  const lang = getCurrentLanguage();
  const texts = translations[lang];

  applyStaticTranslations(lang);

  // Atualizar nomes dos meses e dias da semana globais
  MONTH_NAMES.length = 0;
  for (let i = 0; i < 12; i++) MONTH_NAMES.push(texts[`month-${i}`]);
  
  WEEKDAY_NAMES.length = 0;
  for (let i = 0; i < 7; i++) WEEKDAY_NAMES.push(texts[`day-${i}`]);

  // Atualiza o Calendário se estiver visível
  if (document.getElementById('section-calendar').classList.contains('active')) {
    renderCalendar();
  }

  if (document.getElementById('section-dashboard').classList.contains('active')) {
    updateDashboardData();
  }
  
  // Atualiza labels de tarifas
  updateRateLabels();
  updateAutoFillStatusText();
}

// Muda o idioma e salva
function setLanguage(lang) {
  if (translations[lang]) {
    db.settings.language = lang;
    saveToStorage();
    applyLanguage();
    initCurrentDate();
    
    // Atualiza subtítulo da página atual
    const activeNav = document.querySelector('.nav-item.active');
    if (activeNav) {
      const tabName = activeNav.getAttribute('data-tab');
      const texts = translations[db.settings.language];
      document.getElementById('page-subtitle').innerText = texts[`header-${tabName}-subtitle`];
    }

    if (earningsChart) {
      renderEarningsChart();
    }
  }
}

// Aplica o tema na página
function applyTheme(theme) {
  const t = theme || 'dark';
  document.documentElement.setAttribute('data-theme', t);
  const themeSelect = document.getElementById('setting-theme');
  if (themeSelect) {
    themeSelect.value = t;
  }
}

// Altera o tema, salva e aplica
function changeTheme(theme) {
  db.settings.theme = theme;
  saveToStorage();
  applyTheme(theme);
}

// Mostra a Versão no rodapé do menu e na tela de login
function renderAppVersion() {
  const versionEl = document.getElementById('val-app-version');
  const versionLoginEl = document.getElementById('val-app-version-login');
  const versionHeaderEl = document.getElementById('val-app-version-header');
  const buildDateEl = document.getElementById('val-app-build-date');

  if (versionEl) versionEl.innerText = APP_VERSION;
  if (versionLoginEl) versionLoginEl.innerText = APP_VERSION;
  if (versionHeaderEl) versionHeaderEl.innerText = APP_VERSION;
  if (buildDateEl) buildDateEl.innerText = APP_BUILD_DATE;
}

// Inicializa a data atual no cabeçalho
function initCurrentDate() {
  const lang = getCurrentLanguage();
  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  const todayStr = new Date().toLocaleDateString(lang, options);
  const headerDateEl = document.getElementById('current-header-date');
  if (headerDateEl) headerDateEl.innerText = todayStr;
  
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const quickDateEl = document.getElementById('quick-today-date');
  if (quickDateEl) quickDateEl.innerText = `${day}/${month}`;
}

// Datepicker customizado com semanas de segunda a domingo.

let activeDateInput = null;
let datePickerYear = new Date().getFullYear();
let datePickerMonth = new Date().getMonth();

function initMondayFirstDateInputs() {
  document.querySelectorAll('input[type="date"]').forEach(input => {
    input.type = 'text';
    input.inputMode = 'none';
    input.autocomplete = 'off';
    input.readOnly = true;
    input.placeholder = 'aaaa-mm-dd';
    input.classList.add('date-input-custom');
    input.setAttribute('aria-haspopup', 'dialog');

    input.addEventListener('click', event => {
      event.stopPropagation();
      openMondayFirstDatePicker(input);
    });
    input.addEventListener('focus', () => openMondayFirstDatePicker(input));
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openMondayFirstDatePicker(input);
      }

      if (event.key === 'Escape') {
        closeMondayFirstDatePicker();
      }
    });
  });

  document.addEventListener('pointerdown', event => {
    const picker = document.getElementById('monday-first-date-picker');
    if (!picker || !picker.classList.contains('active')) return;
    if (picker.contains(event.target) || event.target === activeDateInput) return;
    closeMondayFirstDatePicker();
  });
}

function openMondayFirstDatePicker(input) {
  activeDateInput = input;
  const selectedDate = parseLocalDate(input.value) || new Date();
  datePickerYear = selectedDate.getFullYear();
  datePickerMonth = selectedDate.getMonth();

  const picker = getMondayFirstDatePicker();
  renderMondayFirstDatePicker();
  positionMondayFirstDatePicker(input, picker);
  picker.classList.add('active');
}

function closeMondayFirstDatePicker() {
  const picker = document.getElementById('monday-first-date-picker');
  if (picker) picker.classList.remove('active');
  activeDateInput = null;
}

function getMondayFirstDatePicker() {
  let picker = document.getElementById('monday-first-date-picker');
  if (picker) return picker;

  picker = document.createElement('div');
  picker.id = 'monday-first-date-picker';
  picker.className = 'date-picker-popover';
  picker.setAttribute('role', 'dialog');
  picker.setAttribute('aria-label', 'Selecionar data');
  document.body.appendChild(picker);
  return picker;
}

function positionMondayFirstDatePicker(input, picker) {
  const rect = input.getBoundingClientRect();
  const pickerWidth = Math.min(320, window.innerWidth - 24);
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - pickerWidth - 12));
  const top = Math.min(rect.bottom + 8, window.innerHeight - 360);

  picker.style.width = `${pickerWidth}px`;
  picker.style.left = `${left}px`;
  picker.style.top = `${Math.max(12, top)}px`;
}

function renderMondayFirstDatePicker() {
  const picker = getMondayFirstDatePicker();
  const texts = translations[getCurrentLanguage()] || translations['pt-BR'];
  const monthLabel = texts[`month-${datePickerMonth}`] || new Date(datePickerYear, datePickerMonth, 1).toLocaleDateString(getCurrentLanguage(), { month: 'long' });
  const weekLabels = [
    texts['short-day-1'], texts['short-day-2'], texts['short-day-3'],
    texts['short-day-4'], texts['short-day-5'], texts['short-day-6'], texts['short-day-0']
  ];
  const selectedISO = activeDateInput?.value || '';
  const todayISO = formatDateISO(new Date());
  const firstDay = new Date(datePickerYear, datePickerMonth, 1).getDay();
  const firstDayIndex = firstDay === 0 ? 6 : firstDay - 1;
  const lastDay = new Date(datePickerYear, datePickerMonth + 1, 0).getDate();
  const prevLastDay = new Date(datePickerYear, datePickerMonth, 0).getDate();
  const cells = [];

  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const day = prevLastDay - i;
    const month = datePickerMonth === 0 ? 11 : datePickerMonth - 1;
    const year = datePickerMonth === 0 ? datePickerYear - 1 : datePickerYear;
    cells.push({ day, dateStr: formatDateISO(new Date(year, month, day)), otherMonth: true });
  }

  for (let day = 1; day <= lastDay; day++) {
    cells.push({ day, dateStr: formatDateISO(new Date(datePickerYear, datePickerMonth, day)), otherMonth: false });
  }

  const remainingCells = 42 - cells.length;
  for (let day = 1; day <= remainingCells; day++) {
    const month = datePickerMonth === 11 ? 0 : datePickerMonth + 1;
    const year = datePickerMonth === 11 ? datePickerYear + 1 : datePickerYear;
    cells.push({ day, dateStr: formatDateISO(new Date(year, month, day)), otherMonth: true });
  }

  picker.innerHTML = `
    <div class="date-picker-header">
      <button type="button" class="date-picker-nav" data-action="prev-month" aria-label="Mes anterior">
        <i data-lucide="chevron-left"></i>
      </button>
      <strong>${monthLabel} ${datePickerYear}</strong>
      <button type="button" class="date-picker-nav" data-action="next-month" aria-label="Proximo mes">
        <i data-lucide="chevron-right"></i>
      </button>
    </div>
    <div class="date-picker-grid">
      ${weekLabels.map(label => `<span class="date-picker-weekday">${label}</span>`).join('')}
      ${cells.map(cell => `
        <button type="button" class="date-picker-day${cell.otherMonth ? ' is-other-month' : ''}${cell.dateStr === selectedISO ? ' is-selected' : ''}${cell.dateStr === todayISO ? ' is-today' : ''}" data-date="${cell.dateStr}">
          ${cell.day}
        </button>
      `).join('')}
    </div>
    <div class="date-picker-footer">
      <button type="button" data-action="clear-date">Limpar</button>
      <button type="button" data-action="today-date">Hoje</button>
    </div>
  `;

  picker.querySelector('[data-action="prev-month"]').addEventListener('click', () => changeDatePickerMonth(-1));
  picker.querySelector('[data-action="next-month"]').addEventListener('click', () => changeDatePickerMonth(1));
  picker.querySelector('[data-action="clear-date"]').addEventListener('click', () => setDateInputValue(''));
  picker.querySelector('[data-action="today-date"]').addEventListener('click', () => setDateInputValue(todayISO));
  picker.querySelectorAll('[data-date]').forEach(button => {
    button.addEventListener('click', () => setDateInputValue(button.dataset.date));
  });

  lucide.createIcons();
}

function changeDatePickerMonth(offset) {
  const next = new Date(datePickerYear, datePickerMonth + offset, 1);
  datePickerYear = next.getFullYear();
  datePickerMonth = next.getMonth();
  renderMondayFirstDatePicker();
}

function setDateInputValue(value) {
  if (!activeDateInput) return;
  activeDateInput.value = value;
  activeDateInput.dispatchEvent(new Event('change', { bubbles: true }));
  closeMondayFirstDatePicker();
}

// Define o comportamento de navegação por abas
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.app-section');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  const sidebar = document.querySelector('.sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');

  // Função para fechar sidebar no mobile
  const closeSidebar = () => {
    if (window.innerWidth <= 1024) {
      sidebar.classList.remove('active');
      sidebarOverlay.classList.remove('active');
    }
  };

  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      sidebar.classList.toggle('active');
      sidebarOverlay.classList.toggle('active');
    });
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeSidebar);
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabName = item.getAttribute('data-tab');
      const texts = translations[db.settings.language || 'pt-BR'];
      
      // Fecha a sidebar se estiver no mobile
      closeSidebar();

      // Atualizar classe ativa na navegação
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // Se estiver em mobile, rola o item para o centro da Visão no menu scrollable
      if (window.innerWidth <= 768) {
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }

      // Mostrar seção correspondente com animação
      sections.forEach(sec => {
        sec.classList.remove('active');
        if (sec.id === `section-${tabName}`) {
          sec.classList.add('active');
        }
      });

      // Atualizar títulos
      pageTitle.innerText = texts[`nav-${tabName}`];
      pageSubtitle.innerText = texts[`header-${tabName}-subtitle`];

      // Ações específicas ao abrir cada tela
      if (tabName === 'dashboard') {
        updateDashboardData();
      } else if (tabName === 'calendar') {
        renderCalendar();
      } else if (tabName === 'payments') {
        selectedWeeks = [];
        renderWeeksList();
        updatePaymentSummary();
      } else if (tabName === 'history') {
        renderPaymentHistory();
      } else if (tabName === 'settings') {
        loadSettingsFields();
      }
      
      // Atualiza ícones Lucide recém-renderizados
      lucide.createIcons();
    });
  });

  // Funcionalidade de Zoom do Calendário
  const btnToggleZoom = document.getElementById('btn-toggle-calendar-zoom');
  if (btnToggleZoom) {
    btnToggleZoom.addEventListener('click', () => {
      const calendarWrapper = document.querySelector('.calendar-wrapper');
      const isCompact = calendarWrapper.classList.toggle('compact-view');
      
      // Atualiza o ícone
      if (isCompact) {
        btnToggleZoom.innerHTML = '<i data-lucide="zoom-in"></i>';
      } else {
        btnToggleZoom.innerHTML = '<i data-lucide="zoom-out"></i>';
      }
      lucide.createIcons();
    });
  }

  // Inicializa ícones Lucide (como o botão de menu)
  lucide.createIcons();
}

// Atualiza os valores monetários nos formulários e textos
function updateRateLabels() {
  const morning = db.settings.morningRate;
  const night = db.settings.nightRate;
  const both = morning + night;
  const texts = translations[db.settings.language || 'pt-BR'];

  const quickRateMorning = document.getElementById('quick-rate-morning');
  const quickRateNight = document.getElementById('quick-rate-night');
  const quickRateBoth = document.getElementById('quick-rate-both');
  if (quickRateMorning) quickRateMorning.innerText = `${texts['rate-default']} ${formatCurrency(morning)}`;
  if (quickRateNight) quickRateNight.innerText = `${texts['rate-default']} ${formatCurrency(night)}`;
  if (quickRateBoth) quickRateBoth.innerText = `${texts['rate-default']} ${formatCurrency(both)}`;

  document.getElementById('modal-price-morning').innerText = formatCurrency(morning);
  document.getElementById('modal-price-night').innerText = formatCurrency(night);
  document.getElementById('modal-price-both').innerText = formatCurrency(both);

  // Atualiza as opÃ§ões do select de Período do lote com as tarifas vigentes
  const batchDefaultSelect = document.getElementById('batch-default-period');
  if (batchDefaultSelect) {
    batchDefaultSelect.options[0].text = `${texts['legend-morning']} (${formatCurrency(morning)})`;
    batchDefaultSelect.options[1].text = `${texts['legend-night']} (${formatCurrency(night)})`;
    batchDefaultSelect.options[2].text = `${texts['legend-both']} (${formatCurrency(both)})`;
    batchDefaultSelect.options[3].text = `${texts['legend-off']} (${formatCurrency(0)})`;
    if (batchDefaultSelect.options[4]) {
      batchDefaultSelect.options[4].text = `${texts['legend-vacation']} (${formatCurrency(0)})`;
    }
  }
}

/* ==========================================================================
   FORMATADORES E AUXILIARES
   ========================================================================== */

function formatCurrency(value) {
  const lang = db.settings.language === 'it-IT' ? 'it-IT' : 'pt-BR';
  return new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR' }).format(normalizeMoney(value || 0));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// Calcula dias projetados no futuro que seriam cobertos pelo Crédito Antecipado disponível
function calculateProjectedCreditDays() {
  const totalCreditCents = db.payments.reduce(
    (total, payment) => total + toCents(payment.advanceRemaining || 0),
    0
  );
  if (totalCreditCents <= 0) return {};

  const projectedDays = {};
  let remainingCreditCents = totalCreditCents;
  
  // Encontrar a última data registrada no banco para começar a projeção a partir dela
  const workedDates = Object.keys(db.workedDays).sort();
  let lastDate;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (workedDates.length > 0) {
    lastDate = parseLocalDate(workedDates[workedDates.length - 1]);
    // Se a última data for no passado, começamos a projetar a partir de amanhã
    if (lastDate < today) lastDate = today;
  } else {
    lastDate = today;
  }

  let current = new Date(lastDate);
  current.setDate(current.getDate() + 1);
  
  const offDays = db.settings.offDays || [];
  const halfDays = db.settings.halfDays || {};
  const morningRate = db.settings.morningRate;
  const nightRate = db.settings.nightRate;
  const bothRate = addMoney(morningRate, nightRate);

  let iterations = 0;
  const MAX_ITERATIONS = 90; // Projetar no máximo 3 meses para performance e segurança

  while (remainingCreditCents > 0 && iterations < MAX_ITERATIONS) {
    iterations++;
    const dateStr = formatDateISO(current);
    const dayOfWeek = current.getDay();

    // Pular se o dia Já estiver registrado no banco (Já foi tratado pelo applyAdvanceCreditsToDay)
    if (db.workedDays[dateStr]) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    // Pular se for folga configurada
    if (offDays.includes(dayOfWeek)) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    let rate = bothRate;
    let period = 'both';
    
    // Verifica se é meio Período padrão
    if (halfDays[dayOfWeek]) {
      period = halfDays[dayOfWeek];
      rate = (period === 'morning') ? morningRate : nightRate;
    }

    const rateCents = toCents(rate);
    const appliedCents = Math.min(remainingCreditCents, rateCents);
    
    projectedDays[dateStr] = {
      date: dateStr,
      period: period,
      rate: rate,
      amountPaid: fromCents(appliedCents),
      pendingAmount: fromCents(rateCents - appliedCents),
      status: appliedCents === rateCents ? 'paid' : 'partial',
      isProjected: true
    };

    remainingCreditCents -= appliedCents;
    current.setDate(current.getDate() + 1);
  }

  return projectedDays;
}

/* ==========================================================================
   ABA 1: DASHBOARD DE ESTATÃƒÂSTICAS
   ========================================================================== */

function updateDashboardData() {
  if (!db) return; // Segurança contra carga incompleta
  const {
    totalEarnings,
    netBalance,
    thisWeekEarnings,
    receivedThisMonthCash: totalReceived
  } = calculateFinancialSummary(db);

  // Atualiza os elementos da tela
  document.getElementById('stat-total-earnings').innerText = formatCurrency(totalEarnings);
  document.getElementById('stat-total-received').innerText = formatCurrency(totalReceived);
  document.getElementById('stat-this-week-earnings').innerText = formatCurrency(thisWeekEarnings);

  // Atualiza contagem regressiva para pagamento
  updatePaymentCountdown();

  // Atualização dinÃƒÂ¢mica do Card de Pendente / Crédito
  const pendingCard = document.querySelector('.stat-card.stat-pending');
  if (pendingCard) {
    const pendingTitle = pendingCard.querySelector('p');
    const pendingValue = document.getElementById('stat-total-pending');
    const pendingIcon = pendingCard.querySelector('.stat-icon');
    const texts = translations[db.settings.language || 'pt-BR'];

    if (toCents(netBalance) < 0) {
      // Transforma em card de Crédito
      pendingCard.style.borderLeft = ''; // Deixa o CSS tratar via classe
      pendingCard.classList.add('stat-credit-active');
      if (pendingTitle) pendingTitle.innerText = texts['stat-total-credit'] || 'Crédito Antecipado';
      if (pendingValue) {
        pendingValue.innerText = formatCurrency(Math.abs(netBalance));
        pendingValue.style.color = 'var(--accent-purple)';
      }
      if (pendingIcon) pendingIcon.innerHTML = `<i data-lucide="hand-coins"></i>`;
    } else {
      // Volta a ser card de Pendente
      pendingCard.style.borderLeft = '';
      pendingCard.classList.remove('stat-credit-active');
      if (pendingTitle) pendingTitle.innerText = texts['stat-total-pending'] || 'Total Pendente';
      if (pendingValue) {
        pendingValue.innerText = formatCurrency(Math.max(0, netBalance));
        pendingValue.style.color = '';
      }
      if (pendingIcon) pendingIcon.innerHTML = `<i data-lucide="alert-circle"></i>`;
    }
    
    // Atualiza os ícones Lucide no card recém-modificado
    lucide.createIcons();
  }

  // Calcular totais do ano atual
  const year = new Date().getFullYear();
  let annualReceivedCashCents = 0;
  let annualReceivedDepositCents = 0;
  let annualWorkedDays = 0;

  // Acumular pagamentos do ano atual
  db.payments.forEach(pay => {
    const payYear = parseLocalDate(pay.date)?.getFullYear() || new Date(pay.date).getFullYear();
    if (payYear === year) {
      const ratios = splitPaymentMethod(pay);
      const amountCents = toCents(pay.amount || 0);
      const cashCents = Math.round(amountCents * ratios.cashRatio);
      annualReceivedCashCents += cashCents;
      annualReceivedDepositCents += amountCents - cashCents;
    }
  });
  const annualReceivedCash = fromCents(annualReceivedCashCents);
  const annualReceivedDeposit = fromCents(annualReceivedDepositCents);
  const annualTotalReceived = fromCents(annualReceivedCashCents + annualReceivedDepositCents);

  // Contar dias trabalhados no ano atual
  Object.keys(db.workedDays).forEach(dateStr => {
    const dayData = db.workedDays[dateStr];
    const dayYear = parseInt(dateStr.substring(0, 4), 10);
    if (dayYear === year) {
      if (isFinancialDay(dayData)) {
        annualWorkedDays++;
      }
    }
  });

  // Atualizar elementos no Dashboard
  const annualTotalValEl = document.getElementById('annual-total-received-val');
  const depositValEl = document.getElementById('annual-received-deposit-val');
  const cashValEl = document.getElementById('annual-received-cash-val');
  const workedDaysEl = document.getElementById('annual-worked-days-val');
  const texts = translations[db.settings.language || 'pt-BR'];

  if (annualTotalValEl) annualTotalValEl.innerText = formatCurrency(annualTotalReceived);
  if (depositValEl) depositValEl.innerText = formatCurrency(annualReceivedDeposit);
  if (cashValEl) cashValEl.innerText = formatCurrency(annualReceivedCash);
  if (workedDaysEl) workedDaysEl.innerText = `${annualWorkedDays} ${annualWorkedDays === 1 ? texts['week-day'] : texts['week-days']}`;
  renderMonthlyWeeksSummary();

  // Atualiza gráficos
  renderEarningsChart();
  renderAnnualMethodChart(annualReceivedCash, annualReceivedDeposit);
}

// Cria/Atualiza o gráfico dinÃƒÂ¢mico
// Renderiza o resumo de pagamentos semanais do mês atual
function renderMonthlyWeeksSummary() {
  const listEl = document.getElementById('monthly-weeks-summary-list');
  if (!listEl) return;

  const texts = translations[db.settings.language || 'pt-BR'];
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const monthStartStr = formatDateISO(monthStart);
  const monthEndStr = formatDateISO(monthEnd);
  const weeks = [];
  const seenWeeks = new Set();

  let cursor = new Date(monthStart);
  while (cursor <= monthEnd) {
    const week = getWeekRange(formatDateISO(cursor));
    if (!seenWeeks.has(week.key)) {
      seenWeeks.add(week.key);
      weeks.push({
        ...week,
        days: 0,
        totalDue: 0,
        totalPaid: 0,
        totalPending: 0
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  Object.entries(db.workedDays || {}).forEach(([dateStr, dayData]) => {
    if (dateStr < monthStartStr || dateStr > monthEndStr) return;
    if (dayData.period === 'none' || dayData.period === 'off') return;

    const weekKey = getWeekRange(dateStr).key;
    const week = weeks.find(item => item.key === weekKey);
    if (!week) return;

    const rate = dayData.rate || 0;
    const paid = dayData.amountPaid || 0;
    week.days += 1;
    week.totalDue = addMoney(week.totalDue, rate);
    week.totalPaid = addMoney(week.totalPaid, paid);
    week.totalPending = addMoney(week.totalPending, dayData.pendingAmount || 0);
  });

  if (weeks.length === 0 || weeks.every(week => week.days === 0)) {
    listEl.innerHTML = `
      <div class="monthly-weeks-empty">
        <i data-lucide="calendar-x"></i>
        <span>${texts['dashboard-weekly-empty']}</span>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  listEl.innerHTML = weeks.map(week => {
    const statusKey = week.totalPending <= 0 && week.totalDue > 0
      ? 'legend-paid'
      : week.totalPaid > 0
        ? 'legend-partial'
        : 'legend-pending';
    const statusClass = week.totalPending <= 0 && week.totalDue > 0
      ? 'is-paid'
      : week.totalPaid > 0
        ? 'is-partial'
        : 'is-pending';
    const progress = week.totalDue > 0 ? Math.min(100, Math.round((week.totalPaid / week.totalDue) * 100)) : 0;
    const period = `${formatDateStringDisplay(week.mondayStr)} ${texts['week-to']} ${formatDateStringDisplay(week.sundayStr)}`;
    const daysLabel = `${week.days} ${week.days === 1 ? texts['week-day'] : texts['week-days']}`;

    return `
      <article class="monthly-week-card ${statusClass}">
        <div class="monthly-week-card-header">
          <div>
            <span class="monthly-week-kicker">${texts['dashboard-weekly-period']}</span>
            <strong>${period}</strong>
          </div>
          <span class="monthly-week-badge">${texts[statusKey]}</span>
        </div>
        <div class="monthly-week-metrics">
          <div>
            <span>${texts['dashboard-weekly-total-due']}</span>
            <strong>${formatCurrency(week.totalDue)}</strong>
          </div>
          <div>
            <span>${texts['dashboard-weekly-total-paid']}</span>
            <strong>${formatCurrency(week.totalPaid)}</strong>
          </div>
          <div>
            <span>${texts['dashboard-weekly-total-pending']}</span>
            <strong>${formatCurrency(week.totalPending)}</strong>
          </div>
        </div>
        <div class="monthly-week-footer">
          <span>${texts['dashboard-weekly-days']}: ${daysLabel}</span>
          <span>${progress}%</span>
        </div>
        <div class="monthly-week-progress" aria-hidden="true">
          <span style="width: ${progress}%"></span>
        </div>
      </article>
    `;
  }).join('');
}

// Cria/Atualiza o gráfico dinâmico
async function renderEarningsChart() {
  if (!db) return; // Segurança contra carga incompleta
  const canvas = document.getElementById('earningsChart');
  if (!canvas) return;
  const { Chart, ChartDataLabels } = await loadChartRuntime();
  if (!canvas.isConnected || !db) return;
  const ctx = canvas.getContext('2d');
  const lang = db.settings.language === 'it-IT' ? 'it-IT' : 'pt-BR';
  const texts = translations[db.settings.language || 'pt-BR'];
  
  // Agrupar ganhos e pagamentos recebidos por mês
  const monthlyData = {};
  
  // Preencher os últimos 6 meses para garantir dados ordenados
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString(lang, { month: 'short', year: 'numeric' });
    monthlyData[monthKey] = {
      label: label.charAt(0).toUpperCase() + label.slice(1),
      cash: 0,
      deposit: 0
    };
  }

  // Acumular recebimentos por mês de trabalho (valor pago pelos dias daquele mês)
  Object.keys(db.workedDays).forEach(dateStr => {
    const dayData = db.workedDays[dateStr];
    const monthKey = dateStr.substring(0, 7); // YYYY-MM
    
    if (monthlyData[monthKey] && dayData.paymentsApplied) {
      Object.keys(dayData.paymentsApplied).forEach(payId => {
        const amt = dayData.paymentsApplied[payId];
        const pay = db.payments.find(p => p.id === payId);
        if (pay) {
          const { cashRatio, depositRatio } = splitPaymentMethod(pay);
          
          monthlyData[monthKey].cash += amt * cashRatio;
          monthlyData[monthKey].deposit += amt * depositRatio;
        }
      });
    }
  });

  const labels = Object.keys(monthlyData).map(k => monthlyData[k].label);
  const cashValues = Object.keys(monthlyData).map(k => monthlyData[k].cash);
  const depositValues = Object.keys(monthlyData).map(k => monthlyData[k].deposit);

  if (earningsChart) {
    earningsChart.destroy();
  }

  earningsChart = new Chart(ctx, {
    type: 'bar',
    plugins: [ChartDataLabels],
    data: {
      labels: labels,
      datasets: [
        {
          label: texts['opt-cash'] || 'Dinheiro',
          data: cashValues,
          backgroundColor: 'rgba(16, 185, 129, 0.65)',
          borderColor: 'rgb(16, 185, 129)',
          borderWidth: 1,
          borderRadius: 4,
          stack: 'stack1'
        },
        {
          label: texts['opt-deposit'] || 'Depósito',
          data: depositValues,
          backgroundColor: 'rgba(139, 92, 246, 0.65)',
          borderColor: 'rgb(139, 92, 246)',
          borderWidth: 1,
          borderRadius: 4,
          stack: 'stack1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#94a3b8',
            font: { family: 'Outfit', size: 11 },
            boxWidth: 12
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) label += ': ';
              if (context.parsed.y !== null) label += formatCurrency(context.parsed.y);
              return label;
            },
            footer: function(items) {
              let total = 0;
              items.forEach(item => total += item.parsed.y);
              return `Total: ${formatCurrency(total)}`;
            }
          }
        },
        datalabels: {
          anchor: 'center',
          align: 'center',
          formatter: (value) => value > 5 ? formatCurrency(value) : '',
          color: '#fff',
          font: { family: 'Outfit', weight: '700', size: 10 },
          display: function(context) {
            return context.dataset.data[context.dataIndex] > 0;
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { family: 'Outfit', size: 11 } }
        },
        y: {
          stacked: true,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8', font: { family: 'Outfit', size: 11 } },
          grace: '15%'
        }
      }
    }
  });
}

// Cria/Atualiza o gráfico anual de métodos de pagamento (Dinheiro vs Depósito)
async function renderAnnualMethodChart(cash, deposit) {
  if (!db) return; // Segurança contra carga incompleta
  const canvas = document.getElementById('annualMethodChart');
  if (!canvas) return; // Se não estiver no dashboard (ex: executando testes), sai da função
  const { Chart, ChartDataLabels } = await loadChartRuntime();
  if (!canvas.isConnected || !db) return;
  const ctx = canvas.getContext('2d');
  const texts = translations[db.settings.language || 'pt-BR'];
  
  if (annualMethodChart) {
    annualMethodChart.destroy();
  }

  const hasData = cash > 0 || deposit > 0;
  const dataValues = hasData ? [cash, deposit] : [1];
  const backgroundColors = hasData 
    ? ['rgba(16, 185, 129, 0.75)', 'rgba(139, 92, 246, 0.75)'] 
    : ['rgba(255, 255, 255, 0.05)'];
  const borderColors = hasData 
    ? ['#10b981', '#8b5cf6'] 
    : ['rgba(255, 255, 255, 0.1)'];
  const labels = hasData 
    ? [texts['opt-cash'] || 'Dinheiro', texts['opt-deposit'] || 'Depósito'] 
    : ['Nenhum dado'];

  annualMethodChart = new Chart(ctx, {
    type: 'doughnut',
    plugins: [ChartDataLabels],
    data: {
      labels: labels,
      datasets: [{
        data: dataValues,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: hasData,
          callbacks: {
            label: function(context) {
              const value = context.raw;
              return `${context.label}: ${formatCurrency(value)}`;
            }
          }
        },
        datalabels: {
          display: false
        }
      }
    }
  });
}

// ação rápida para registrar turno no dia de hoje
function quickLogShift(period) {
  const todayStr = formatDateISO(new Date());
  let rate = 0;
  const texts = translations[db.settings.language || 'pt-BR'];
  
  if (period === 'morning') rate = db.settings.morningRate;
  else if (period === 'night') rate = db.settings.nightRate;
  else if (period === 'both') rate = addMoney(db.settings.morningRate, db.settings.nightRate);
  
  // Se o dia Já tiver registro financeiro de pagamento, mantém o valor pago e atualiza
  const existing = db.workedDays[todayStr] || {
    amountPaid: 0,
    paymentsApplied: {}
  };

  // Se o novo rate for menor que o amountPaid Já registrado, devolvemos
  if (toCents(existing.amountPaid || 0) > toCents(rate)) {
    if (!refundPaymentCreditsFromDay(db, existing, rate)) {
      alert(getText('msg-unlinked-payment-blocked'));
      return;
    }
  }

  const newDay = {
    date: todayStr,
    period: period,
    rate: rate,
    amountPaid: existing.amountPaid || 0,
    pendingAmount: 0,
    notes: existing.notes || texts['msg-quick-log-note'],
    paymentsApplied: existing.paymentsApplied || {}
  };

  refreshDayFinancials(newDay);
  // Aplica Créditos de adiantamento, se houver
  applyAdvanceCreditsToDay(db, newDay);

  db.workedDays[todayStr] = newDay;
  saveToStorage();
  updateDashboardData();
  
  const periodLabel = texts[`btn-${period === 'both' ? 'both-shifts' : period === 'off' ? 'off-day' : period + '-shift'}`];
  alert(`${periodLabel} - ${texts['msg-save-success']}`);
}

function updateCalendarAutoFillStatus() {
  const statusEl = document.getElementById('calendar-autofill-status');
  if (!statusEl) return;

  const enabled = !!db.settings.autoFillWorkedDays;
  const texts = translations[db.settings.language || 'pt-BR'];
  const iconEl = document.getElementById('calendar-autofill-icon');
  const titleEl = document.getElementById('calendar-autofill-title');

  statusEl.classList.toggle('is-enabled', enabled);
  statusEl.classList.toggle('is-disabled', !enabled);

  if (iconEl) {
    iconEl.innerHTML = `<i data-lucide="${enabled ? 'toggle-right' : 'toggle-left'}"></i>`;
  }
  if (titleEl) {
    titleEl.innerText = texts[enabled ? 'calendar-autofill-enabled-title' : 'calendar-autofill-disabled-title'];
  }
}

/* ==========================================================================
   ABA 2: CALENDÃƒÂRIO MENSAL INTERATIVO
   ========================================================================== */

function renderCalendar() {
  const texts = translations[db.settings.language || 'pt-BR'];
  const monthYearLabel = document.getElementById('calendar-month-year');
  monthYearLabel.innerText = `${MONTH_NAMES[currentMonth]} ${currentYear}`;
  updateCalendarAutoFillStatus();

  const grid = document.getElementById('calendar-days-grid');
  grid.innerHTML = ''; 

  // Calcula projeção de Créditos para exibição visual
  const projectedDays = calculateProjectedCreditDays();

  const dayNames = [
    texts['short-day-1'], texts['short-day-2'], texts['short-day-3'], 
    texts['short-day-4'], texts['short-day-5'], texts['short-day-6'], texts['short-day-0']
  ];
  dayNames.forEach(name => {
    const label = document.createElement('div');
    label.className = 'calendar-day-label';
    label.innerText = name;
    grid.appendChild(label);
  });

  const firstDay = new Date(currentYear, currentMonth, 1).getDay(); 
  const firstDayIndex = firstDay === 0 ? 6 : firstDay - 1;
  const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
  const prevLastDay = new Date(currentYear, currentMonth, 0).getDate();

  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = prevLastDay - i;
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const dateStr = formatDateISO(new Date(prevYear, prevMonth, dayNum));
    createDayElement(dayNum, dateStr, true, grid, projectedDays);
  }

  for (let i = 1; i <= lastDay; i++) {
    const dateStr = formatDateISO(new Date(currentYear, currentMonth, i));
    createDayElement(i, dateStr, false, grid, projectedDays);
  }

  const totalCells = grid.children.length - 7;
  const remainingCells = 42 - totalCells; 
  
  for (let i = 1; i <= remainingCells; i++) {
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    const dateStr = formatDateISO(new Date(nextYear, nextMonth, i));
    createDayElement(i, dateStr, true, grid, projectedDays);
  }

  lucide.createIcons();
}

function createDayElement(dayNum, dateStr, isOtherMonth, container, projectedDays = {}) {
  const dayElement = document.createElement('div');
  dayElement.className = 'glass-card calendar-day';
  dayElement.dataset.date = dateStr;
  dayElement.setAttribute('role', 'button');
  dayElement.setAttribute('tabindex', '0');
  dayElement.setAttribute('aria-label', formatDateStringDisplay(dateStr));
  if (isOtherMonth) {
    dayElement.classList.add('other-month');
  }

  let data = db.workedDays[dateStr];
  const isProjected = !data && projectedDays[dateStr];
  
  if (isProjected) {
    data = projectedDays[dateStr];
    dayElement.classList.add(data.status === 'paid' ? 'day-projected-paid' : 'day-projected-partial');
  }

  const texts = translations[db.settings.language || 'pt-BR'];

  const numSpan = document.createElement('span');
  numSpan.className = 'day-number';
  numSpan.innerText = dayNum;
  dayElement.appendChild(numSpan);

  const todayStr = formatDateISO(new Date());
  if (dateStr === todayStr) {
    dayElement.style.border = '2px solid var(--accent-purple)';
    dayElement.style.boxShadow = '0 0 15px rgba(139, 92, 246, 0.4)';
  }

  const dateParts = dateStr.split('-');
  const dateObj = new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10));
  const dayOfWeek = dateObj.getDay();
  const offDays = db.settings.offDays || [4];
  const isDefaultOffDay = offDays.includes(dayOfWeek);

  if (data && data.period !== 'none') {
    if (data.period === 'morning') dayElement.classList.add('day-worked-morning');
    else if (data.period === 'night') dayElement.classList.add('day-worked-night');
    else if (data.period === 'both') dayElement.classList.add('day-worked-both');
    else if (data.period === 'off') dayElement.classList.add('day-off');
    else if (data.period === 'vacation') dayElement.classList.add('day-vacation');

    if (data.period !== 'off' && data.period !== 'vacation') {
      if (data.status === 'paid') dayElement.classList.add('day-status-paid');
      else if (data.status === 'partial') dayElement.classList.add('day-status-partial');
      else if (data.status === 'unpaid') dayElement.classList.add('day-status-unpaid');

      const statusIndicator = document.createElement('span');
      statusIndicator.className = 'day-status-indicator';
      if (data.status === 'paid') {
        statusIndicator.innerHTML = `<i data-lucide="check-circle-2" style="width: 14px; height: 14px; color: var(--status-paid);"></i>`;
        statusIndicator.title = texts['legend-paid'];
      } else if (data.status === 'partial') {
        statusIndicator.innerHTML = `<i data-lucide="help-circle" style="width: 14px; height: 14px; color: var(--status-partial);"></i>`;
        statusIndicator.title = texts['legend-partial'];
      } else if (data.status === 'unpaid') {
        statusIndicator.innerHTML = `<i data-lucide="alert-circle" style="width: 14px; height: 14px; color: var(--status-unpaid);"></i>`;
        statusIndicator.title = texts['legend-pending'];
      }
      dayElement.appendChild(statusIndicator);
    }

    const detailsContainer = document.createElement('div');
    detailsContainer.style.display = 'flex';
    detailsContainer.style.flexDirection = 'column';
    detailsContainer.style.gap = '6px';
    detailsContainer.style.width = '100%';

    const badge = document.createElement('span');
    badge.className = 'day-badge';
    
    if (data.period === 'morning') {
      badge.innerHTML = `<i data-lucide="sun" style="width: 10px; height: 10px; display: inline; vertical-align: middle; margin-right: 2px;"></i> ${texts['legend-morning']}`;
      badge.style.background = 'rgba(245, 158, 11, 0.15)';
      badge.style.color = '#f59e0b';
    } else if (data.period === 'night') {
      badge.innerHTML = `<i data-lucide="moon" style="width: 10px; height: 10px; display: inline; vertical-align: middle; margin-right: 2px;"></i> ${texts['legend-night']}`;
      badge.style.background = 'rgba(139, 92, 246, 0.15)';
      badge.style.color = '#a78bfa';
    } else if (data.period === 'both') {
      badge.innerHTML = `<i data-lucide="sunset" style="width: 10px; height: 10px; display: inline; vertical-align: middle; margin-right: 2px;"></i> ${texts['legend-both']}`;
      badge.style.background = 'rgba(59, 130, 246, 0.15)';
      badge.style.color = '#60a5fa';
    } else if (data.period === 'off') {
      badge.innerHTML = `<i data-lucide="coffee" style="width: 10px; height: 10px; display: inline; vertical-align: middle; margin-right: 2px;"></i> ${texts['legend-off']}`;
      badge.style.background = 'rgba(100, 116, 139, 0.15)';
      badge.style.color = '#94a3b8';
    } else if (data.period === 'vacation') {
      badge.innerHTML = `<i data-lucide="palmtree" style="width: 10px; height: 10px; display: inline; vertical-align: middle; margin-right: 2px;"></i> ${texts['legend-vacation']}`;
      badge.style.background = 'rgba(6, 182, 212, 0.15)';
      badge.style.color = '#06b6d4';
    }
    
    detailsContainer.appendChild(badge);

    if (data.period !== 'off' && data.period !== 'vacation') {
      const valDiv = document.createElement('div');
      valDiv.className = 'day-value';
      if (data.status === 'partial') {
        valDiv.innerHTML = `<span>${formatCurrency(data.amountPaid)}</span><span class="day-pending-value">(-${formatCurrency(data.pendingAmount)})</span>`;
      } else {
        valDiv.innerText = formatCurrency(data.rate);
      }
      detailsContainer.appendChild(valDiv);

      if (isProjected) {
        const projBadge = document.createElement('span');
        projBadge.className = 'projected-badge';
        projBadge.innerText = texts['badge-projected'];
        detailsContainer.appendChild(projBadge);
      }
    }
    dayElement.appendChild(detailsContainer);
  } else if (!data && isDefaultOffDay) {
    dayElement.classList.add('day-off');
    dayElement.style.opacity = '0.65';
    const detailsContainer = document.createElement('div');
    detailsContainer.style.display = 'flex';
    detailsContainer.style.flexDirection = 'column';
    detailsContainer.style.gap = '6px';
    detailsContainer.style.width = '100%';
    const badge = document.createElement('span');
    badge.className = 'day-badge';
    badge.innerHTML = `<i data-lucide="coffee" style="width: 10px; height: 10px; display: inline; vertical-align: middle; margin-right: 2px;"></i> ${texts['legend-off']}`;
    badge.style.background = 'rgba(100, 116, 139, 0.15)';
    badge.style.color = '#94a3b8';
    detailsContainer.appendChild(badge);
    dayElement.appendChild(detailsContainer);
  }

  dayElement.addEventListener('click', () => openDayModal(dateStr));
  dayElement.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openDayModal(dateStr);
    }
  });
  container.appendChild(dayElement);
}

function changeMonth(direction) {
  currentMonth += direction;
  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  } else if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }
  renderCalendar();
}

function goToCurrentMonth() {
  currentYear = new Date().getFullYear();
  currentMonth = new Date().getMonth();
  renderCalendar();
}

/* ==========================================================================
   MODAL DE DETALHES DO DIA DO TRABALHO
   ========================================================================== */

function openDayModal(dateStr) {
  const modal = document.getElementById('day-modal');
  const dateTitle = document.getElementById('modal-date-title');
  const dateValue = document.getElementById('modal-date-value');
  const deleteBtn = document.getElementById('btn-delete-day');
  const paymentInfoBox = document.getElementById('modal-payment-info');
  const texts = translations[db.settings.language || 'pt-BR'];

  dateValue.value = dateStr;
  dateTitle.innerText = formatDateStringDisplay(dateStr);

  const data = db.workedDays[dateStr];
  const radios = document.getElementsByName('modal-period');
  radios.forEach(r => r.checked = false);
  document.getElementById('modal-custom-rate').value = '';
  document.getElementById('modal-notes').value = '';
  
  if (data) {
    const periodRadio = document.querySelector(`input[name="modal-period"][value="${data.period}"]`);
    if (periodRadio) periodRadio.checked = true;
    const standardRate = getStandardRateForPeriod(data.period);
    if (data.rate !== standardRate && data.period !== 'off' && data.period !== 'none') {
      document.getElementById('modal-custom-rate').value = data.rate;
    }
    document.getElementById('modal-notes').value = data.notes || '';
    deleteBtn.style.display = 'block';

    if (data.amountPaid > 0 || data.pendingAmount > 0) {
      paymentInfoBox.style.display = 'block';
      const statusLabel = document.getElementById('modal-pay-status-label');
      statusLabel.className = 'day-badge';
      if (data.status === 'paid') {
        statusLabel.innerText = texts['legend-paid'];
        statusLabel.classList.add('badge-paid');
      } else if (data.status === 'partial') {
        statusLabel.innerText = texts['legend-partial'];
        statusLabel.classList.add('badge-partial');
      } else {
        statusLabel.innerText = texts['legend-pending'];
        statusLabel.classList.add('badge-unpaid');
      }
      document.getElementById('modal-pay-received').innerText = formatCurrency(data.amountPaid);
      document.getElementById('modal-pay-pending').innerText = formatCurrency(data.pendingAmount);
    } else {
      paymentInfoBox.style.display = 'none';
    }
  } else {
    deleteBtn.style.display = 'none';
    paymentInfoBox.style.display = 'none';
  }

  modal.classList.add('active');
  lucide.createIcons();
}

function closeDayModal() {
  document.getElementById('day-modal').classList.remove('active');
}

function getStandardRateForPeriod(period) {
  if (period === 'morning') return db.settings.morningRate;
  if (period === 'night') return db.settings.nightRate;
  if (period === 'both') return addMoney(db.settings.morningRate, db.settings.nightRate);
  return 0;
}

function getConfiguredPeriodForDate(date) {
  const dayOfWeek = date.getDay();
  const offDays = db.settings.offDays || [];
  const halfDays = db.settings.halfDays || {};

  if (offDays.includes(dayOfWeek)) return 'off';
  if (halfDays[dayOfWeek]) return halfDays[dayOfWeek];
  return 'both';
}

function createOrUpdateAutomaticWorkedDay(dateStr) {
  const existing = db.workedDays[dateStr];
  // Registros anteriores, inclusive automáticos, são imutáveis para evitar
  // recálculo retroativo ao mudar tarifa ou rotina.
  if (existing) return false;

  const date = parseLocalDate(dateStr);
  if (!date) return false;
  const period = getConfiguredPeriodForDate(date);
  const rate = getStandardRateForPeriod(period);
  const newDay = {
    date: dateStr,
    period: period,
    rate: rate,
    status: 'unpaid',
    amountPaid: 0,
    pendingAmount: rate,
    notes: getText('msg-auto-note'),
    paymentsApplied: {},
    autoGenerated: true
  };

  refreshDayFinancials(newDay);
  applyAdvanceCreditsToDay(db, newDay);
  db.workedDays[dateStr] = newDay;
  return true;
}

async function applyAutomaticWorkedDayFill() {
  if (!db?.settings?.autoFillWorkedDays) return 0;

  const todayStr = formatDateISO(new Date());
  let totalCreated = 0;
  let pagesProcessed = 0;
  let complete = false;

  while (!complete && pagesProcessed < 12) {
    const batch = getAutoFillBatch({
      settings: db.settings,
      workedDays: db.workedDays,
      todayISO: todayStr,
      pageSize: db.settings.autoFillPageSize || 31
    });
    let pageCreated = 0;
    for (const dateStr of batch.dates) {
      if (createOrUpdateAutomaticWorkedDay(dateStr)) pageCreated++;
    }

    const cursorChanged = db.settings.autoFillLastDate !== batch.cursor;
    if (cursorChanged) db.settings.autoFillLastDate = batch.cursor;
    if (pageCreated > 0 || cursorChanged) await saveToStorage();

    totalCreated += pageCreated;
    complete = batch.complete || !cursorChanged;
    pagesProcessed++;
    await Promise.resolve();
  }

  return totalCreated;
}

function saveDayDetails(event) {
  event.preventDefault();
  const dateStr = document.getElementById('modal-date-value').value;
  const radios = document.getElementsByName('modal-period');
  const texts = translations[db.settings.language || 'pt-BR'];
  let selectedPeriod = 'none';
  for (const r of radios) if (r.checked) { selectedPeriod = r.value; break; }

  if (selectedPeriod === 'none') {
    alert(texts['msg-select-period']);
    return;
  }

  const customRateVal = Number.parseFloat(document.getElementById('modal-custom-rate').value);
  const notesVal = document.getElementById('modal-notes').value;
  let rate = getStandardRateForPeriod(selectedPeriod);
  if (!Number.isNaN(customRateVal) && selectedPeriod !== 'off' && selectedPeriod !== 'none') {
    if (customRateVal < 0) return;
    rate = normalizeMoney(customRateVal);
  }

  const existing = db.workedDays[dateStr] || { amountPaid: 0, paymentsApplied: {} };

  // Se o novo rate for menor que o amountPaid Já registrado (ou se mudou para off/none), devolvemos
  if (toCents(existing.amountPaid || 0) > toCents(rate)) {
    if (!refundPaymentCreditsFromDay(db, existing, rate)) {
      alert(getText('msg-unlinked-payment-blocked'));
      return;
    }
  }

  const newDay = {
    date: dateStr, period: selectedPeriod, rate: rate,
    amountPaid: existing.amountPaid || 0, pendingAmount: 0, notes: notesVal,
    paymentsApplied: existing.paymentsApplied || {}
  };

  refreshDayFinancials(newDay);
  // Aplica Créditos de adiantamento, se houver
  applyAdvanceCreditsToDay(db, newDay);

  db.workedDays[dateStr] = newDay;

  saveToStorage();
  closeDayModal();
  renderCalendar();
  updateDashboardData();
}

function deleteDayRecord() {
  const texts = translations[db.settings.language || 'pt-BR'];
  const dateStr = document.getElementById('modal-date-value').value;
  const data = db.workedDays[dateStr];
  if (!data) return;
  if (data.amountPaid > 0) {
    if (!confirm(texts['msg-delete-confirm'])) return;
    // Devolve os Créditos aplicados a este dia para os pagamentos originais
    if (!refundPaymentCreditsFromDay(db, data, 0)) {
      alert(getText('msg-unlinked-payment-blocked'));
      return;
    }
  }
  delete db.workedDays[dateStr];
  saveToStorage();
  closeDayModal();
  renderCalendar();
  updateDashboardData();
}

/* ==========================================================================
   ABA 3: PAGAMENTOS SEMANAIS
   ========================================================================== */

function renderWeeksList() {
  const container = document.getElementById('weeks-container-list');
  const texts = translations[db.settings.language || 'pt-BR'];
  container.innerHTML = '';
  const weeksMap = {};

  Object.keys(db.workedDays).forEach(dateStr => {
    const dayData = db.workedDays[dateStr];
    if (isFinancialDay(dayData)) {
      const weekInfo = getWeekRange(dateStr);
      const weekKey = weekInfo.key;
      if (!weeksMap[weekKey]) {
        weeksMap[weekKey] = {
          key: weekKey, label: weekInfo.label, mondayISO: weekInfo.mondayStr,
          days: [], totalDue: 0, totalPaid: 0, totalPending: 0
        };
      }
      weeksMap[weekKey].days.push(dayData);
      weeksMap[weekKey].totalDue = addMoney(weeksMap[weekKey].totalDue, dayData.rate);
      weeksMap[weekKey].totalPaid = addMoney(weeksMap[weekKey].totalPaid, dayData.amountPaid || 0);
      weeksMap[weekKey].totalPending = addMoney(weeksMap[weekKey].totalPending, dayData.pendingAmount || 0);
    }
  });

  const sortedWeeks = Object.values(weeksMap).sort((a, b) => b.mondayISO.localeCompare(a.mondayISO));
  if (sortedWeeks.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem;">${texts['msg-no-days']}</div>`;
    return;
  }

  const visibleWeeks = sortedWeeks.slice(0, MAX_WORK_CYCLE_WEEKS);
  const visibleWeekKeys = new Set(visibleWeeks.map(week => week.key));
  selectedWeeks = selectedWeeks.filter(weekKey => visibleWeekKeys.has(weekKey));

  visibleWeeks.forEach(week => {
    const card = document.createElement('div');
    card.className = 'week-card';
    if (selectedWeeks.includes(week.key)) card.classList.add('selected');

    let statusText = texts['legend-pending'];
    let badgeClass = 'badge-unpaid';
    if (week.totalPending === 0) { statusText = texts['legend-paid']; badgeClass = 'badge-paid'; }
    else if (week.totalPaid > 0) { statusText = texts['legend-partial']; badgeClass = 'badge-partial'; }

    card.innerHTML = `
      <div class="week-header">
        <span class="week-title">${week.label.replace(' a ', ' ' + texts['week-to'] + ' ')}</span>
        <span class="week-badge ${badgeClass}">${statusText}</span>
      </div>
      <div class="week-details">
        <div class="week-detail-item">
          <span data-i18n="nav-history">${texts['nav-history']}</span>
          <p style="color: var(--text-primary);">${week.days.length} ${week.days.length === 1 ? texts['week-day'] : texts['week-days']}</p>
        </div>
        <div class="week-detail-item">
          <span>Total</span>
          <p>${formatCurrency(week.totalDue)}</p>
        </div>
        <div class="week-detail-item">
          <span data-i18n="stat-total-received">${texts['stat-total-received']}</span>
          <p style="color: var(--status-paid);">${formatCurrency(week.totalPaid)}</p>
        </div>
        <div class="week-detail-item">
          <span data-i18n="legend-pending">${texts['legend-pending']}</span>
          <p style="color: var(--status-unpaid);">${formatCurrency(week.totalPending)}</p>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      const idx = selectedWeeks.indexOf(week.key);
      if (idx > -1) { selectedWeeks.splice(idx, 1); card.classList.remove('selected'); }
      else { selectedWeeks.push(week.key); card.classList.add('selected'); }
      updatePaymentSummary();
    });
    container.appendChild(card);
  });
}

function updatePaymentSummary() {
  const texts = translations[db.settings.language || 'pt-BR'];
  const summaryWeeksCount = document.getElementById('summary-weeks-count');
  const summaryDaysCount = document.getElementById('summary-days-count');
  const summaryTotalDue = document.getElementById('summary-total-due');
  const summaryAlreadyPaid = document.getElementById('summary-already-paid');
  const summaryRemainingDue = document.getElementById('summary-remaining-due');
  const paymentAmountInput = document.getElementById('input-payment-amount');
  const submitBtn = document.getElementById('btn-submit-payment');

  // ATUALIZAÃƒâ€¡ÃƒÆ’O DO WIDGET DE SALDO GERAL CONSOLIDADO
  const balanceBox = document.getElementById('general-balance-box');
  if (balanceBox) {
    const balanceLabel = document.getElementById('general-balance-label');
    const balanceValue = document.getElementById('general-balance-value');
    const balanceIcon = document.getElementById('general-balance-icon');
    
    // Calcula os valores gerais da base
    let generalPending = 0;
    Object.keys(db.workedDays).forEach(dateStr => {
      const dayData = db.workedDays[dateStr];
      if (isFinancialDay(dayData)) {
        generalPending = addMoney(generalPending, dayData.pendingAmount || 0);
      }
    });
    
    const generalAdvance = db.payments.reduce(
      (total, payment) => addMoney(total, payment.advanceRemaining || 0),
      0
    );
    const generalNetBalance = fromCents(toCents(generalPending) - toCents(generalAdvance));
    
    if (toCents(generalNetBalance) < 0) {
      balanceBox.style.border = '1px solid var(--accent-purple)';
      balanceBox.style.background = 'var(--accent-purple-glow)';
      if (balanceLabel) balanceLabel.innerText = texts['general-balance-credit'] || 'Crédito Disponível (Adiantado)';
      if (balanceValue) {
        balanceValue.innerText = formatCurrency(Math.abs(generalNetBalance));
        balanceValue.style.color = 'var(--accent-purple)';
      }
      if (balanceIcon) balanceIcon.outerHTML = `<i id="general-balance-icon" data-lucide="coins" style="width: 16px; height: 16px; color: var(--accent-purple);"></i>`;
    } else if (toCents(generalNetBalance) > 0) {
      balanceBox.style.border = '1px solid var(--status-unpaid)';
      balanceBox.style.background = 'var(--status-unpaid-glow)';
      if (balanceLabel) balanceLabel.innerText = texts['general-balance-pending'] || 'Total Geral a Receber';
      if (balanceValue) {
        balanceValue.innerText = formatCurrency(generalNetBalance);
        balanceValue.style.color = 'var(--status-unpaid)';
      }
      if (balanceIcon) balanceIcon.outerHTML = `<i id="general-balance-icon" data-lucide="alert-circle" style="width: 16px; height: 16px; color: var(--status-unpaid);"></i>`;
    } else {
      balanceBox.style.border = '1px solid var(--border-light)';
      balanceBox.style.background = 'rgba(255, 255, 255, 0.02)';
      if (balanceLabel) balanceLabel.innerText = texts['general-balance-zero'] || 'Tudo Pago / Zerado';
      if (balanceValue) {
        balanceValue.innerText = formatCurrency(0);
        balanceValue.style.color = 'var(--text-muted)';
      }
      if (balanceIcon) balanceIcon.outerHTML = `<i id="general-balance-icon" data-lucide="check-circle-2" style="width: 16px; height: 16px; color: var(--status-paid);"></i>`;
    }
    
    lucide.createIcons();
  }

  let dbTotalDays = 0, dbTotalDue = 0, dbTotalPaid = 0, dbTotalPending = 0;
  const pendingWeekKeys = new Set();
  Object.keys(db.workedDays).forEach(dateStr => {
    const dayData = db.workedDays[dateStr];
    if (isFinancialDay(dayData) && toCents(dayData.pendingAmount || 0) > 0) {
      dbTotalDays++;
      const weekInfo = getWeekRange(dateStr);
      pendingWeekKeys.add(weekInfo.key);
    }
  });

  Object.keys(db.workedDays).forEach(dateStr => {
    const dayData = db.workedDays[dateStr];
    if (isFinancialDay(dayData) && pendingWeekKeys.has(getWeekRange(dateStr).key)) {
      dbTotalDue = addMoney(dbTotalDue, dayData.rate || 0);
      dbTotalPaid = addMoney(dbTotalPaid, dayData.amountPaid || 0);
      dbTotalPending = addMoney(dbTotalPending, dayData.pendingAmount || 0);
    }
  });

  if (selectedWeeks.length === 0) {
    if (dbTotalPending > 0) {
      summaryWeeksCount.innerHTML = `<span style="color: var(--accent-purple); font-weight: 600;">${texts['msg-all-pending']}</span>`;
      summaryDaysCount.innerText = `${dbTotalDays} ${dbTotalDays === 1 ? texts['week-day'] : texts['week-days']}`;
      summaryTotalDue.innerText = formatCurrency(dbTotalDue);
      summaryAlreadyPaid.innerText = formatCurrency(dbTotalPaid);
      summaryRemainingDue.innerText = formatCurrency(dbTotalPending);
      paymentAmountInput.disabled = false;
      paymentAmountInput.value = dbTotalPending.toFixed(2);
      submitBtn.disabled = false;
    } else {
      summaryWeeksCount.innerText = "0";
      summaryDaysCount.innerText = `0 ${texts['week-days']}`;
      summaryTotalDue.innerText = formatCurrency(0);
      summaryAlreadyPaid.innerText = formatCurrency(0);
      summaryRemainingDue.innerText = formatCurrency(0);
      paymentAmountInput.disabled = false;
      paymentAmountInput.value = '';
      paymentAmountInput.placeholder = '0.00';
      submitBtn.disabled = false;
    }
    return;
  }

  let totalDays = 0, totalDue = 0, totalPaid = 0, totalPending = 0;
  const selectedPendingWeekKeys = new Set();
  Object.keys(db.workedDays).forEach(dateStr => {
    const dayData = db.workedDays[dateStr];
    if (isFinancialDay(dayData) && toCents(dayData.pendingAmount || 0) > 0) {
      const weekInfo = getWeekRange(dateStr);
      if (selectedWeeks.includes(weekInfo.key)) {
        totalDays++;
        selectedPendingWeekKeys.add(weekInfo.key);
      }
    }
  });

  Object.keys(db.workedDays).forEach(dateStr => {
    const dayData = db.workedDays[dateStr];
    const weekKey = getWeekRange(dateStr).key;
    if (isFinancialDay(dayData) && selectedPendingWeekKeys.has(weekKey)) {
      totalDue = addMoney(totalDue, dayData.rate || 0);
      totalPaid = addMoney(totalPaid, dayData.amountPaid || 0);
      totalPending = addMoney(totalPending, dayData.pendingAmount || 0);
    }
  });

  summaryWeeksCount.innerText = selectedWeeks.length;
  summaryDaysCount.innerText = `${totalDays} ${totalDays === 1 ? texts['week-day'] : texts['week-days']}`;
  summaryTotalDue.innerText = formatCurrency(totalDue);
  summaryAlreadyPaid.innerText = formatCurrency(totalPaid);
  summaryRemainingDue.innerText = formatCurrency(totalPending);
  paymentAmountInput.disabled = false;
  paymentAmountInput.value = totalPending.toFixed(2);
  submitBtn.disabled = false;
}

function toggleCustomNotesInput() {
  const methodSelect = document.getElementById('input-payment-method');
  const customNotesGroup = document.getElementById('custom-notes-group');
  const mixedAmountsGroup = document.getElementById('mixed-amounts-group');
  
  if (methodSelect.value === 'Outros') {
    customNotesGroup.style.display = 'block';
    mixedAmountsGroup.style.display = 'none';
  } else if (methodSelect.value === 'Misto') {
    customNotesGroup.style.display = 'none';
    mixedAmountsGroup.style.display = 'block';
    
    // Divide o valor total entre os dois campos (50/50 por padrão)
    const totalCents = toCents(Number.parseFloat(document.getElementById('input-payment-amount').value) || 0);
    const cashCents = Math.floor(totalCents / 2);
    document.getElementById('input-payment-cash-amount').value = fromCents(cashCents).toFixed(2);
    document.getElementById('input-payment-deposit-amount').value = fromCents(totalCents - cashCents).toFixed(2);
  } else {
    customNotesGroup.style.display = 'none';
    mixedAmountsGroup.style.display = 'none';
    document.getElementById('input-payment-notes').value = '';
    document.getElementById('input-payment-cash-amount').value = '';
    document.getElementById('input-payment-deposit-amount').value = '';
  }
}

async function processPayment(event) {
  event.preventDefault();
  const texts = translations[db.settings.language || 'pt-BR'];
  const rawPaymentAmount = Number.parseFloat(document.getElementById('input-payment-amount').value);
  const paymentDate = document.getElementById('input-payment-date').value;
  const paymentMethod = document.getElementById('input-payment-method').value;
  const paymentObservation = document.getElementById('input-payment-observation')?.value.trim() || '';
  
  if (!Number.isFinite(rawPaymentAmount) || rawPaymentAmount <= 0 || !parseLocalDate(paymentDate)) {
    alert(texts['msg-invalid-payment'] || 'Informe um valor positivo e uma data válida.');
    return;
  }
  const paymentAmount = normalizeMoney(rawPaymentAmount);

  let paymentNotes;
  let cashAmount = 0;
  let depositAmount = 0;

  if (paymentMethod === 'Outros') {
    paymentNotes = document.getElementById('input-payment-notes').value || texts['opt-others'];
  } else if (paymentMethod === 'Misto') {
    cashAmount = normalizeMoney(Number.parseFloat(document.getElementById('input-payment-cash-amount').value) || 0);
    depositAmount = normalizeMoney(Number.parseFloat(document.getElementById('input-payment-deposit-amount').value) || 0);
    
    if (!moneyEquals(addMoney(cashAmount, depositAmount), paymentAmount)) {
      alert(texts['msg-invalid-mixed-sum'] || 'A soma dos valores em dinheiro e depósito deve ser igual ao valor total recebido!');
      return;
    }
    
    // Constrói notas descritivas
    paymentNotes = `${texts['opt-cash']}: ${formatCurrency(cashAmount)} / ${texts['opt-deposit']}: ${formatCurrency(depositAmount)}`;
  } else {
    paymentNotes = texts['opt-' + paymentMethod.toLowerCase().replace('é', 'e')] || paymentMethod;
  }

  const daysToPay = [];
  Object.keys(db.workedDays).forEach(dateStr => {
    const dayData = db.workedDays[dateStr];
    if (isFinancialDay(dayData) && toCents(dayData.pendingAmount || 0) > 0) {
      if (selectedWeeks.length === 0) {
        daysToPay.push(dayData);
      } else {
        const weekInfo = getWeekRange(dateStr);
        if (selectedWeeks.includes(weekInfo.key)) {
          daysToPay.push(dayData);
        }
      }
    }
  });

  daysToPay.sort((a, b) => a.date.localeCompare(b.date));

  const paymentId = `pay_${globalThis.crypto.randomUUID()}`;
  const { advanceRemaining, coveredDays } = allocatePaymentAcrossDays({
    amount: paymentAmount,
    paymentId,
    primaryDays: daysToPay
  });

  // O excedente é salvo no atributo advanceRemaining do pagamento
  const payment = normalizePayment({
    id: paymentId,
    date: paymentDate,
    amount: paymentAmount,
    method: paymentMethod,
    cashAmount: paymentMethod === 'Dinheiro' ? paymentAmount : (paymentMethod === 'Misto' ? cashAmount : 0),
    depositAmount: paymentMethod === 'Dinheiro'
      ? 0
      : (paymentMethod === 'Misto' ? depositAmount : paymentAmount),
    coveredDays,
    notes: paymentNotes,
    observation: paymentObservation,
    advanceRemaining
  });
  db.payments.push(payment);

  await saveToStorage();
  
  // Limpa campos adicionais
  const inputObservation = document.getElementById('input-payment-observation');
  const inputCash = document.getElementById('input-payment-cash-amount');
  const inputDeposit = document.getElementById('input-payment-deposit-amount');
  if (inputObservation) inputObservation.value = '';
  if (inputCash) inputCash.value = '';
  if (inputDeposit) inputDeposit.value = '';
  
  selectedWeeks = [];
  renderWeeksList();
  updatePaymentSummary();
  updateDashboardData();
  alert(texts['msg-payment-success']);
}

/* ==========================================================================
   ABA 4: HISTÃƒâ€œRICO DE PAGAMENTOS
   ========================================================================== */

function renderPaymentHistory() {
  const tableBody = document.getElementById('payment-history-table-body');
  const texts = translations[db.settings.language || 'pt-BR'];
  const lang = db.settings.language === 'it-IT' ? 'it-IT' : 'pt-BR';
  tableBody.innerHTML = '';
  const sorted = [...db.payments].sort((a, b) => b.date.localeCompare(a.date));

  if (sorted.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 3rem;">${texts['msg-no-history']}</td></tr>`;
    return;
  }

  let lastMonthKey = null;

  sorted.forEach(pay => {
    // Identifica o mês e ano do pagamento para agrupamento
    const payDate = parseLocalDate(pay.date);
    const monthKey = `${payDate.getFullYear()}-${String(payDate.getMonth() + 1).padStart(2, '0')}`;
    
    // Se mudou o mês, insere um cabeçalho de seção
    if (monthKey !== lastMonthKey) {
      const monthLabel = payDate.toLocaleDateString(lang, { month: 'long', year: 'numeric' });
      const monthHeader = document.createElement('tr');
      monthHeader.className = 'history-month-header';
      monthHeader.innerHTML = `
        <td colspan="7" style="background: rgba(139, 92, 246, 0.05); padding: 1rem; border-left: 4px solid var(--accent-purple);">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <i data-lucide="calendar" style="width: 18px; height: 18px; color: var(--accent-purple);"></i>
            <span style="font-weight: 700; color: var(--text-primary); text-transform: capitalize;">${monthLabel}</span>
          </div>
        </td>
      `;
      tableBody.appendChild(monthHeader);
      lastMonthKey = monthKey;
    }

    const tr = document.createElement('tr');
    let periodText = '...';
    
    // Calcula o período real + projeção baseada no crédito antecipado
    let allDates = [...(pay.coveredDays || [])];
    if (pay.advanceRemaining > 0) {
      let lastDateISO = allDates.length > 0 ? [...allDates].sort().reverse()[0] : pay.date;
      let current = parseLocalDate(lastDateISO);
      current.setDate(current.getDate() + 1);
      let rem = pay.advanceRemaining;
      let safety = 0;
      while (rem > 0.01 && safety < 60) {
        const dayOfWeek = current.getDay();
        if (!(db.settings.offDays || []).includes(dayOfWeek)) {
          let rate = addMoney(db.settings.morningRate, db.settings.nightRate);
          if (db.settings.halfDays && db.settings.halfDays[dayOfWeek]) {
            rate = (db.settings.halfDays[dayOfWeek] === 'morning') ? db.settings.morningRate : db.settings.nightRate;
          }
          const apply = Math.min(rem, rate);
          allDates.push(formatDateISO(current));
          rem -= apply;
        }
        current.setDate(current.getDate() + 1);
        safety++;
      }
    }

    if (allDates.length > 0) {
      const sorted = [...new Set(allDates)].sort((a, b) => a.localeCompare(b));
      const start = formatDateStringDisplay(sorted[0]);
      const end = formatDateStringDisplay(sorted[sorted.length - 1]);
      periodText = sorted.length === 1 ? start : `${start} ${texts['week-to']} ${end} (${sorted.length} ${texts['week-days']})`;
    }

    const hasAdvance = pay.advanceRemaining > 0;
    const advanceBadge = hasAdvance ? `<div style="font-size:0.75rem; color: var(--accent-purple); font-weight:600; margin-top: 2px;"><i data-lucide="coins" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right: 2px;"></i>${texts['label-credit']}: ${formatCurrency(pay.advanceRemaining)}</div>` : '';
    const methodLabels = {
      'Dinheiro': texts['opt-cash'],
      'Depósito': texts['opt-deposit'],
      'Misto': texts['opt-mixed'],
      'Outros': texts['opt-others']
    };
    const methodLabel = methodLabels[pay.method] || pay.method || pay.notes || '-';
    const methodDetail = pay.method && pay.notes && pay.notes !== pay.method && pay.notes !== methodLabels[pay.method] ? pay.notes : '';
    const paymentMethod = [methodLabel, methodDetail].filter(Boolean).map(escapeHtml).join('<br>');
    const paymentObservation = pay.observation ? escapeHtml(pay.observation) : '-';

    tr.innerHTML = `
      <td>${formatDateStringDisplay(pay.date)}</td>
      <td style="color: var(--status-paid); font-weight: 700;">
        ${formatCurrency(pay.amount)}
        ${advanceBadge}
      </td>
      <td>${periodText}</td>
      <td><span class="history-pending-tag"><i data-lucide="check"></i> ${texts['status-processed']}</span></td>
      <td>${paymentMethod}</td>
      <td>${paymentObservation}</td>
      <td><button class="btn-danger" onclick="deletePayment('${pay.id}')">${texts['btn-refund']}</button></td>
    `;
    tableBody.appendChild(tr);
  });
  lucide.createIcons();
}

function deletePayment(id) {
  const texts = translations[db.settings.language || 'pt-BR'];
  if (!confirm(texts['msg-undo-confirm'])) return;
  if (!reversePayment(db, id)) return;
  saveToStorage(); renderPaymentHistory(); updateDashboardData();
  alert(texts['msg-undo-success']);
}

/* ==========================================================================
   ABA 5: CONFIGURAÃƒâ€¡Ãƒâ€¢ES E BACKUP
   ========================================================================== */

function loadSettingsFields() {
  document.getElementById('setting-morning-rate').value = db.settings.morningRate;
  document.getElementById('setting-night-rate').value = db.settings.nightRate;
  document.getElementById('setting-language').value = db.settings.language || 'pt-BR';
  const themeSelect = document.getElementById('setting-theme');
  if (themeSelect) {
    themeSelect.value = db.settings.theme || 'dark';
  }
  const autoFillToggle = document.getElementById('setting-autofill-enabled');
  if (autoFillToggle) {
    autoFillToggle.checked = !!db.settings.autoFillWorkedDays;
    updateAutoFillStatusText();
  }
  const offDays = db.settings.offDays || [4];
  for (let i = 0; i <= 6; i++) {
    const chk = document.getElementById(`offday-${i}`);
    if (chk) chk.checked = offDays.includes(i);
  }

  // Carrega Configurações de meio Período padrão
  const halfDays = db.settings.halfDays || {};
  for (let i = 0; i <= 6; i++) {
    const chk = document.getElementById(`halfday-active-${i}`);
    const sel = document.getElementById(`halfday-period-${i}`);
    if (chk && sel) {
      const period = halfDays[i];
      if (period) {
        chk.checked = true;
        sel.value = period;
        sel.disabled = false;
      } else {
        chk.checked = false;
        sel.value = 'morning';
        sel.disabled = true;
      }
    }
  }
  loadWeeklyScheduleFields();

  // Carrega Ciclo de Pagamento
  const cycle = db.settings.paymentCycle || { type: 'weekly', day: 0 };
  document.getElementById('setting-payment-type').value = cycle.type;
  if (cycle.type === 'weekly') {
    document.getElementById('setting-payment-day-week').value = cycle.day;
  } else {
    document.getElementById('setting-payment-day-month').value = cycle.day;
  }
  togglePaymentCycleInputs();
}

function loadWeeklyScheduleFields() {
  const offDays = db.settings.offDays || [4];
  const halfDays = db.settings.halfDays || {};

  for (let i = 0; i <= 6; i++) {
    const select = document.getElementById(`weekly-status-${i}`);
    if (!select) continue;

    if (offDays.includes(i)) {
      select.value = 'off';
    } else if (halfDays[i]) {
      select.value = halfDays[i];
    } else {
      select.value = 'both';
    }
  }
}

function updateAutoFillStatusText(enabled = db.settings.autoFillWorkedDays) {
  const statusEl = document.getElementById('setting-autofill-status');
  if (!statusEl) return;

  const lang = db.settings.language || 'pt-BR';
  const texts = translations[lang];
  const key = enabled ? 'status-enabled' : 'status-disabled';

  statusEl.setAttribute('data-i18n', key);
  statusEl.innerText = texts[key];
}

function togglePaymentCycleInputs() {
  const type = document.getElementById('setting-payment-type').value;
  document.getElementById('group-payment-week').style.display = type === 'weekly' ? 'block' : 'none';
  document.getElementById('group-payment-month').style.display = type === 'monthly' ? 'block' : 'none';
}

function savePaymentCycleSettings(event) {
  event.preventDefault();
  const type = document.getElementById('setting-payment-type').value;
  let day;
  if (type === 'weekly') {
    day = parseInt(document.getElementById('setting-payment-day-week').value, 10);
  } else {
    day = parseInt(document.getElementById('setting-payment-day-month').value, 10);
  }
  const minimum = type === 'weekly' ? 0 : 1;
  const maximum = type === 'weekly' ? 6 : 31;
  db.settings.paymentCycle = {
    type,
    day: Math.max(minimum, Math.min(maximum, Number.isInteger(day) ? day : minimum))
  };
  saveToStorage();
  updateDashboardData();
  alert(translations[db.settings.language]['msg-save-success']);
}

async function saveAutoFillSettings(event) {
  if (event) event.preventDefault();
  const enabled = document.getElementById('setting-autofill-enabled').checked;
  const wasEnabled = !!db.settings.autoFillWorkedDays;
  const todayStr = formatDateISO(new Date());

  db.settings.autoFillWorkedDays = enabled;
  updateAutoFillStatusText(enabled);

  if (enabled && !wasEnabled) {
    db.settings.autoFillStartedAt = todayStr;
    db.settings.autoFillLastDate = null;
  }

  if (!enabled) {
    await saveToStorage();
  } else {
    await applyAutomaticWorkedDayFill();
  }

  renderCalendar();
  renderWeeksList();
  updateDashboardData();
  updateAutoFillStatusText(enabled);
}

function updatePaymentCountdown() {
  const countdownEl = document.getElementById('stat-payment-countdown');
  if (!countdownEl) return;

  const cycle = db.settings.paymentCycle || { type: 'weekly', day: 0 };
  const texts = translations[db.settings.language || 'pt-BR'];
  const today = new Date();
  const nextPayDate = getNextPaymentDate(cycle, today);
  const toUtcDay = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const daysDiff = Math.round((toUtcDay(nextPayDate) - toUtcDay(today)) / 86_400_000);

  if (daysDiff === 0) {
    countdownEl.innerText = texts['msg-payment-today'];
    countdownEl.style.color = 'var(--status-paid)';
  } else if (daysDiff === 1) {
    countdownEl.innerText = texts['msg-day-left'];
    countdownEl.style.color = '';
  } else {
    countdownEl.innerText = texts['msg-days-left'].replace('{n}', daysDiff);
    countdownEl.style.color = '';
  }
}

function toggleHalfDaySelect(dayIndex) {
  const chk = document.getElementById(`halfday-active-${dayIndex}`);
  const sel = document.getElementById(`halfday-period-${dayIndex}`);
  if (chk && sel) {
    sel.disabled = !chk.checked;
  }
}

async function saveWeeklyScheduleSettings(event) {
  event.preventDefault();

  const offDays = [];
  const halfDays = {};

  for (let i = 0; i <= 6; i++) {
    const select = document.getElementById(`weekly-status-${i}`);
    const status = select ? select.value : 'both';

    if (status === 'off') {
      offDays.push(i);
    } else if (status === 'morning' || status === 'night') {
      halfDays[i] = status;
    }
  }

  db.settings.offDays = offDays;
  db.settings.halfDays = halfDays;
  await saveToStorage();
  await applyAutomaticWorkedDayFill();
  loadSettingsFields();
  renderCalendar();
  renderWeeksList();
  updateDashboardData();
  alert(translations[db.settings.language]['msg-save-success']);
}

async function saveHalfDaysSettings(event) {
  event.preventDefault();
  const halfDays = {};
  for (let i = 0; i <= 6; i++) {
    const chk = document.getElementById(`halfday-active-${i}`);
    const sel = document.getElementById(`halfday-period-${i}`);
    if (chk && chk.checked && sel) {
      halfDays[i] = sel.value;
    }
  }
  db.settings.halfDays = halfDays;
  await saveToStorage();
  await applyAutomaticWorkedDayFill();
  renderCalendar();
  renderWeeksList();
  updateDashboardData();
  alert(translations[db.settings.language]['msg-save-success']);
}

async function saveOffDaysSettings(event) {
  event.preventDefault();
  const offDays = [];
  for (let i = 0; i <= 6; i++) {
    const chk = document.getElementById(`offday-${i}`);
    if (chk && chk.checked) offDays.push(parseInt(chk.value, 10));
  }
  db.settings.offDays = offDays;
  await saveToStorage();
  await applyAutomaticWorkedDayFill();
  renderCalendar();
  renderWeeksList();
  updateDashboardData();
  alert(translations[db.settings.language]['msg-save-success']);
}

async function saveRatesSettings(event) {
  event.preventDefault();
  const morningRate = Number.parseFloat(document.getElementById('setting-morning-rate').value);
  const nightRate = Number.parseFloat(document.getElementById('setting-night-rate').value);
  if (!Number.isFinite(morningRate) || !Number.isFinite(nightRate) || morningRate < 0 || nightRate < 0) {
    alert(getText('msg-invalid-rates'));
    return;
  }
  db.settings.morningRate = normalizeMoney(morningRate);
  db.settings.nightRate = normalizeMoney(nightRate);
  await saveToStorage();
  await applyAutomaticWorkedDayFill();
  updateRateLabels();
  renderCalendar();
  renderWeeksList();
  updateDashboardData();
  alert(translations[db.settings.language]['msg-save-success']);
}

function exportDatabase() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
  const link = document.createElement('a');
  link.setAttribute("href", dataStr); link.setAttribute("download", `backup_${formatDateISO(new Date())}.json`);
  link.click();
}

function importDatabase(event) {
  const reader = new FileReader();
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) {
    alert(getText('msg-import-too-large'));
    event.target.value = '';
    return;
  }
  reader.onload = async (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      const normalized = validateImportedDatabase(parsed, e.target.result);
      const { state: validated, repairs } = reconcileLedger(normalized);
      if (!confirm(getText('msg-import-confirm'))) return;

      const recovery = databaseRepository.createRecoveryPoint(db, auth.currentUser.uid, 'before-import');
      if (!recovery) {
        alert(getText('msg-recovery-failed'));
        return;
      }
      db = validated;
      await saveToStorage();
      applyLanguage();
      if (repairs.length > 0) {
        showStatus(getText('msg-ledger-reconciled').replace('{count}', repairs.length), { tone: 'success' });
      }
      alert(translations[db.settings.language]['msg-backup-success']);
      document.querySelector('[data-tab="dashboard"]').click();
    } catch (error) {
      reportError('database:import', error);
      alert(`${getText('msg-import-error')} ${error.message || ''}`.trim());
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

async function clearDatabase() {
  if (confirm(translations[db.settings.language]['msg-clear-confirm'])) {
    const recovery = databaseRepository.createRecoveryPoint(db, auth.currentUser.uid, 'before-clear');
    if (!recovery) {
      alert(getText('msg-recovery-failed'));
      return;
    }
    db = createDefaultDatabase();
    await saveToStorage(); applyLanguage(); loadSettingsFields();
    document.querySelector('[data-tab="dashboard"]').click();
    showStatus(getText('msg-clear-recoverable'), { tone: 'success' });
  }
}

async function restoreLatestDatabase() {
  const recovered = databaseRepository.restoreLatestRecovery(auth.currentUser?.uid);
  if (!recovered) {
    alert(getText('msg-no-recovery'));
    return;
  }
  if (!confirm(getText('msg-restore-confirm'))) return;

  const safetyCopy = databaseRepository.createRecoveryPoint(db, auth.currentUser.uid, 'before-restore');
  if (!safetyCopy) {
    alert(getText('msg-recovery-failed'));
    return;
  }
  db = recovered;
  await saveToStorage();
  applyLanguage();
  loadSettingsFields();
  renderAll();
  document.querySelector('[data-tab="dashboard"]').click();
  showStatus(getText('msg-restore-success'), { tone: 'success' });
}

/* ==========================================================================
   FUNÃƒâ€¡Ãƒâ€¢ES PARA LANÃƒâ€¡AMENTO EM LOTE
   ========================================================================== */

function openBatchModal() {
  const texts = translations[db.settings.language || 'pt-BR'];
  const container = document.getElementById('batch-days-container');
  container.innerHTML = `
    <div style="text-align: center; color: var(--text-muted); padding: 2rem; font-size: 0.85rem;">
      ${texts['msg-no-batch-days']}
    </div>
  `;
  document.getElementById('batch-start-date').value = '';
  document.getElementById('batch-end-date').value = '';
  document.getElementById('batch-modal').classList.add('active');
  lucide.createIcons();
}

function closeBatchModal() {
  document.getElementById('batch-modal').classList.remove('active');
}

function generateBatchDaysList() {
  const startStr = document.getElementById('batch-start-date').value;
  const endStr = document.getElementById('batch-end-date').value;
  const container = document.getElementById('batch-days-container');
  const texts = translations[db.settings.language || 'pt-BR'];
  if (!startStr || !endStr) return;

  const start = parseLocalDate(startStr);
  const end = parseLocalDate(endStr);
  if (start > end) return;
  container.innerHTML = '';
  let current = new Date(start);
  const halfDays = db.settings.halfDays || {};
  const defaultPeriod = document.getElementById('batch-default-period').value;
  
  while (current <= end) {
    const dateStr = formatDateISO(current);
    const dayOfWeek = current.getDay();
    const existing = db.workedDays[dateStr];
    
    let period = defaultPeriod;
    if (existing) {
      period = existing.period;
    } else if (db.settings.offDays.includes(dayOfWeek)) {
      period = 'off';
    } else if (halfDays[dayOfWeek]) {
      period = halfDays[dayOfWeek];
    }
    
    const row = document.createElement('div');
    row.className = 'batch-day-row';
    row.innerHTML = `
      <div class="batch-day-info"><span>${formatDateStringDisplay(dateStr)}</span> <strong>${WEEKDAY_NAMES[dayOfWeek]}</strong></div>
      <div class="batch-day-controls">
        <select class="batch-day-period-select" onchange="updateBatchRowRate(this)">
          <option value="morning" ${period === 'morning' ? 'selected' : ''}>${texts['legend-morning']}</option>
          <option value="night" ${period === 'night' ? 'selected' : ''}>${texts['legend-night']}</option>
          <option value="both" ${period === 'both' ? 'selected' : ''}>${texts['legend-both']}</option>
          <option value="off" ${period === 'off' ? 'selected' : ''}>${texts['legend-off']}</option>
          <option value="vacation" ${period === 'vacation' ? 'selected' : ''}>${texts['legend-vacation']}</option>
        </select>
        <input type="number" class="batch-day-rate-input" value="${existing ? existing.rate : ''}" placeholder="${getStandardRateForPeriod(period).toFixed(2)}" ${period === 'off' ? 'disabled' : ''}>
      </div>
    `;
    row.setAttribute('data-date', dateStr);
    container.appendChild(row);
    current.setDate(current.getDate() + 1);
  }
}

function updateBatchRowRate(select) {
  const input = select.closest('.batch-day-row').querySelector('.batch-day-rate-input');
  if (select.value === 'off' || select.value === 'vacation') { input.value = ''; input.disabled = true; }
  else { input.disabled = false; input.placeholder = getStandardRateForPeriod(select.value).toFixed(2); }
}

function applyDefaultPeriodToBatchDays() {
  const defaultPeriod = document.getElementById('batch-default-period').value;
  const rows = document.querySelectorAll('.batch-day-row');
  const offDays = db.settings.offDays || [4];
  const halfDays = db.settings.halfDays || {};

  rows.forEach(row => {
    const select = row.querySelector('.batch-day-period-select');
    if (select) {
      const dateStr = row.getAttribute('data-date');
      const parts = dateStr.split('-');
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      const dayOfWeek = d.getDay();

      if (offDays.includes(dayOfWeek)) {
        select.value = 'off';
      } else if (halfDays[dayOfWeek]) {
        select.value = halfDays[dayOfWeek];
      } else {
        select.value = defaultPeriod;
      }
      updateBatchRowRate(select);
    }
  });
}

function saveBatchShifts(event) {
  event.preventDefault();
  const rows = document.querySelectorAll('.batch-day-row');
  if (rows.length === 0) return;

  const texts = translations[db.settings.language || 'pt-BR'];
  const stateBeforeBatch = structuredClone(db);
  let blockedByLegacyPayment = false;
  let invalidBatchRate = false;
  rows.forEach(row => {
    const date = row.getAttribute('data-date');
    const select = row.querySelector('.batch-day-period-select');
    const input = row.querySelector('.batch-day-rate-input');
    
    if (select && input) {
      const period = select.value;
      const rateVal = Number.parseFloat(input.value);
      if (Number.isFinite(rateVal) && rateVal < 0) {
        invalidBatchRate = true;
        return;
      }
      const rate = Number.isNaN(rateVal) ? getStandardRateForPeriod(period) : normalizeMoney(rateVal);
      const existing = db.workedDays[date] || { amountPaid: 0, paymentsApplied: {} };
      
      // Se o novo rate for menor que o amountPaid Já registrado, devolvemos
      if (toCents(existing.amountPaid || 0) > toCents(rate)) {
        if (!refundPaymentCreditsFromDay(db, existing, rate)) {
          blockedByLegacyPayment = true;
          return;
        }
      }
      
      const newDay = {
        date: date,
        period: period,
        rate: rate,
        amountPaid: existing.amountPaid || 0,
        pendingAmount: 0,
        notes: 'Lote',
        paymentsApplied: existing.paymentsApplied || {}
      };
      
      refreshDayFinancials(newDay);
      // Aplica Créditos de adiantamento, se houver
      applyAdvanceCreditsToDay(db, newDay);
      
      db.workedDays[date] = newDay;
    }
  });
  if (blockedByLegacyPayment || invalidBatchRate) {
    db = stateBeforeBatch;
    alert(getText(invalidBatchRate ? 'msg-invalid-rates' : 'msg-unlinked-payment-blocked'));
    return;
  }
  saveToStorage(); closeBatchModal(); renderCalendar(); updateDashboardData();
  alert(texts['msg-batch-save-success']);
}

function openBatchRemoveModal() {
  const texts = translations[db.settings.language || 'pt-BR'];
  const container = document.getElementById('batch-remove-days-container');
  container.innerHTML = `
    <div style="text-align: center; color: var(--text-muted); padding: 2rem; font-size: 0.85rem;">
      ${texts['msg-no-remove-days']}
    </div>
  `;
  document.getElementById('batch-remove-start-date').value = '';
  document.getElementById('batch-remove-end-date').value = '';
  document.getElementById('batch-remove-modal').classList.add('active');
}

function closeBatchRemoveModal() {
  document.getElementById('batch-remove-modal').classList.remove('active');
}

function generateBatchRemoveDaysList() {
  const startStr = document.getElementById('batch-remove-start-date').value;
  const endStr = document.getElementById('batch-remove-end-date').value;
  const container = document.getElementById('batch-remove-days-container');
  if (!startStr || !endStr) return;
  const start = parseLocalDate(startStr);
  const end = parseLocalDate(endStr);
  container.innerHTML = '';
  let current = new Date(start);
  let found = 0;
  while (current <= end) {
    const date = formatDateISO(current);
    if (db.workedDays[date]) {
      found++;
      const row = document.createElement('div');
      row.className = 'batch-day-row';
      row.innerHTML = `<span>${formatDateStringDisplay(date)}</span> <input type="checkbox" class="batch-remove-day-checkbox" data-date="${date}" checked>`;
      container.appendChild(row);
    }
    current.setDate(current.getDate() + 1);
  }
  if (found === 0) {
    const texts = translations[db.settings.language || 'pt-BR'];
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem; font-size: 0.85rem;">${texts['msg-no-history']}</div>`;
  }
}

function saveBatchRemoveShifts(event) {
  event.preventDefault();
  const checks = document.querySelectorAll('.batch-remove-day-checkbox:checked');
  const texts = translations[db.settings.language || 'pt-BR'];
  if (!confirm(texts['msg-delete-confirm'])) return;
  checks.forEach(chk => {
    const date = chk.getAttribute('data-date');
    const day = db.workedDays[date];
    if (day) {
      if (day.amountPaid > 0) {
        refundPaymentCreditsFromDay(db, day, 0);
      }
      delete db.workedDays[date];
    }
  });
  saveToStorage(); closeBatchRemoveModal(); renderCalendar(); updateDashboardData();
  alert(texts['msg-batch-remove-success']);
}

async function handleLogout() {
  if (confirm(getText('msg-logout-confirm'))) {
    try {
      await signOut(auth);
      window.location.reload();
    } catch (error) {
      console.error("Erro ao sair:", error);
    }
  }
}

// Expoe funcoes ao escopo global
window.handleLogout = handleLogout;
window.quickLogShift = quickLogShift;
window.changeMonth = changeMonth;
window.goToCurrentMonth = goToCurrentMonth;
window.openBatchModal = openBatchModal;
window.openBatchRemoveModal = openBatchRemoveModal;
window.toggleCustomNotesInput = toggleCustomNotesInput;
window.processPayment = processPayment;
window.exportDatabase = exportDatabase;
window.importDatabase = importDatabase;
window.clearDatabase = clearDatabase;
window.restoreLatestDatabase = restoreLatestDatabase;
window.setLanguage = setLanguage;
window.changeTheme = changeTheme;
window.saveRatesSettings = saveRatesSettings;
window.saveWeeklyScheduleSettings = saveWeeklyScheduleSettings;
window.saveOffDaysSettings = saveOffDaysSettings;
window.saveHalfDaysSettings = saveHalfDaysSettings;
window.saveAutoFillSettings = saveAutoFillSettings;
window.savePaymentCycleSettings = savePaymentCycleSettings;
window.togglePaymentCycleInputs = togglePaymentCycleInputs;
window.toggleHalfDaySelect = toggleHalfDaySelect;
window.closeDayModal = closeDayModal;
window.saveDayDetails = saveDayDetails;
window.deleteDayRecord = deleteDayRecord;
window.generateBatchDaysList = generateBatchDaysList;
window.applyDefaultPeriodToBatchDays = applyDefaultPeriodToBatchDays;
window.saveBatchShifts = saveBatchShifts;
window.closeBatchModal = closeBatchModal;
window.generateBatchRemoveDaysList = generateBatchRemoveDaysList;
window.saveBatchRemoveShifts = saveBatchRemoveShifts;
window.closeBatchRemoveModal = closeBatchRemoveModal;
window.refundPaymentCreditsFromDay = (day, newRate) => refundPaymentCreditsFromDay(db, day, newRate);
window.deletePayment = deletePayment;
window.openDayModal = openDayModal;
