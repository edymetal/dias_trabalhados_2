/* ==========================================================================
   APP CONTROLLER & LOGIC - CONTROLE DE DIAS TRABALHADOS
   ========================================================================== */

// Versão da aplicação (gerenciada automaticamente pelo Git Hook)
const APP_VERSION = '1.0.1';
const APP_BUILD_DATE = '2026-05-21 04:43:36';

// Configurações do Banco de Dados Local (LocalStorage)
const DB_STORAGE_KEY = 'fluxoturno_db';

// Estado Inicial do Banco de Dados
const DEFAULT_DB = {
  settings: {
    morningRate: 80.00,
    nightRate: 100.00,
    currency: 'BRL'
  },
  workedDays: {}, // Formato: { 'YYYY-MM-DD': { date, period, rate, status, amountPaid, pendingAmount, notes, paymentsApplied: { paymentId: amount } } }
  payments: []    // Formato: [{ id, date, amount, coveredDays: [], notes }]
};

let db = null;
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-indexed (0 = Jan, 11 = Dez)
let earningsChart = null;
let selectedWeeks = []; // Lista de chaves de semana selecionadas ('YYYY-MM-DD_YYYY-MM-DD')

/* ==========================================================================
   INICIALIZAÇÃO DA APLICAÇÃO
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initDatabase();
  renderAppVersion();
  initNavigation();
  initDashboard();
  initCurrentDate();
  
  // Atualiza as tarifas padrão no modal e nas ações rápidas
  updateRateLabels();
});

// Inicializa o banco de dados carregando do localStorage
function initDatabase() {
  const stored = localStorage.getItem(DB_STORAGE_KEY);
  if (stored) {
    try {
      db = JSON.parse(stored);
      // Garantir compatibilidade com formatos legados caso existam
      if (!db.settings) db.settings = { ...DEFAULT_DB.settings };
      if (!db.workedDays) db.workedDays = {};
      if (!db.payments) db.payments = [];
    } catch (e) {
      console.error("Erro ao ler banco de dados local. Resetando para o padrão.", e);
      db = JSON.parse(JSON.stringify(DEFAULT_DB));
      saveToStorage();
    }
  } else {
    db = JSON.parse(JSON.stringify(DEFAULT_DB));
    saveToStorage();
  }
}

// Salva o estado atual no localStorage
function saveToStorage() {
  localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(db));
}

// Mostra a versão no rodapé do menu
function renderAppVersion() {
  document.getElementById('val-app-version').innerText = APP_VERSION;
  document.getElementById('val-app-build-date').innerText = APP_BUILD_DATE;
}

// Inicializa a data atual no cabeçalho
function initCurrentDate() {
  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  const todayStr = new Date().toLocaleDateString('pt-BR', options);
  document.getElementById('current-header-date').innerText = todayStr;
  
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  document.getElementById('quick-today-date').innerText = `${day}/${month}`;
}

// Define o comportamento de navegação por abas
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.app-section');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');

  const routeSubtitles = {
    dashboard: 'Visão geral do seu trabalho e finanças.',
    calendar: 'Visualize o mês de trabalho e configure seus turnos clicando nos dias.',
    payments: 'Selecione os ciclos semanais para registrar recebimentos totais ou parciais.',
    history: 'Registro completo de pagamentos e pendências finalizadas.',
    settings: 'Ajustes finos do sistema, exportação de dados e tarifas padrão.'
  };

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabName = item.getAttribute('data-tab');
      
      // Atualizar classe ativa na navegação
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // Mostrar seção correspondente com animação
      sections.forEach(sec => {
        sec.classList.remove('active');
        if (sec.id === `section-${tabName}`) {
          sec.classList.add('active');
        }
      });

      // Atualizar títulos
      pageTitle.innerText = item.querySelector('span').innerText;
      pageSubtitle.innerText = routeSubtitles[tabName] || '';

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
}

// Atualiza os valores monetários nos formulários e textos
function updateRateLabels() {
  const morning = db.settings.morningRate;
  const night = db.settings.nightRate;
  const both = morning + night;

  document.getElementById('quick-rate-morning').innerText = `Valor padrão: ${formatCurrency(morning)}`;
  document.getElementById('quick-rate-night').innerText = `Valor padrão: ${formatCurrency(night)}`;
  document.getElementById('quick-rate-both').innerText = `Valor padrão: ${formatCurrency(both)}`;

  document.getElementById('modal-price-morning').innerText = formatCurrency(morning);
  document.getElementById('modal-price-night').innerText = formatCurrency(night);
  document.getElementById('modal-price-both').innerText = formatCurrency(both);
}

/* ==========================================================================
   FORMATADORES E AUXILIARES
   ========================================================================== */

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDateISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateDisplay(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

function formatDateStringDisplay(dateISO) {
  if (!dateISO) return '';
  const [year, month, day] = dateISO.split('-');
  return `${day}/${month}/${year}`;
}

// Retorna o intervalo da semana de Segunda a Domingo de um determinado dia
function getWeekRange(dateStr) {
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  
  const date = new Date(year, month, day);
  const dayOfWeek = date.getDay(); // 0 (Dom) a 6 (Sáb)
  
  // Ajusta para segunda-feira ser o dia 1 e domingo o dia 7
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  
  return {
    mondayStr: formatDateISO(monday),
    sundayStr: formatDateISO(sunday),
    key: `${formatDateISO(monday)}_${formatDateISO(sunday)}`,
    label: `${formatDateDisplay(monday)} a ${formatDateDisplay(sunday)}`
  };
}

/* ==========================================================================
   ABA 1: DASHBOARD DE ESTATÍSTICAS
   ========================================================================== */

function initDashboard() {
  updateDashboardData();
}

function updateDashboardData() {
  // Cálculos financeiros totais
  let totalEarnings = 0;
  let totalReceived = 0;
  let totalPending = 0;
  let thisWeekEarnings = 0;

  // Obter intervalo da semana atual
  const todayISO = formatDateISO(new Date());
  const currentWeek = getWeekRange(todayISO);

  // Calcula valores de dias trabalhados
  Object.keys(db.workedDays).forEach(dateStr => {
    const dayData = db.workedDays[dateStr];
    
    // Desconsidera dias sem período ou folga do cálculo financeiro
    if (dayData.period !== 'none' && dayData.period !== 'off') {
      const rate = dayData.rate || 0;
      totalEarnings += rate;
      
      const paid = dayData.amountPaid || 0;
      totalReceived += paid;
      totalPending += (rate - paid);

      // Soma para os ganhos da semana atual
      if (dateStr >= currentWeek.mondayStr && dateStr <= currentWeek.sundayStr) {
        thisWeekEarnings += rate;
      }
    }
  });

  // Atualiza os elementos da tela
  document.getElementById('stat-total-earnings').innerText = formatCurrency(totalEarnings);
  document.getElementById('stat-total-received').innerText = formatCurrency(totalReceived);
  document.getElementById('stat-total-pending').innerText = formatCurrency(totalPending);
  document.getElementById('stat-this-week-earnings').innerText = formatCurrency(thisWeekEarnings);

  // Atualiza gráfico
  renderEarningsChart();
}

// Cria/Atualiza o gráfico dinâmico
function renderEarningsChart() {
  const ctx = document.getElementById('earningsChart').getContext('2d');
  
  // Agrupar ganhos e pagamentos recebidos por mês
  const monthlyData = {};
  
  // Preencher os últimos 6 meses para garantir dados ordenados
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    monthlyData[monthKey] = {
      label: label.charAt(0).toUpperCase() + label.slice(1),
      earned: 0,
      received: 0
    };
  }

  // Acumular ganhos por mês
  Object.keys(db.workedDays).forEach(dateStr => {
    const dayData = db.workedDays[dateStr];
    if (dayData.period !== 'none' && dayData.period !== 'off') {
      const monthKey = dateStr.substring(0, 7); // YYYY-MM
      if (monthlyData[monthKey]) {
        monthlyData[monthKey].earned += dayData.rate || 0;
      }
    }
  });

  // Acumular recebimentos por mês
  db.payments.forEach(pay => {
    const monthKey = pay.date.substring(0, 7); // YYYY-MM
    if (monthlyData[monthKey]) {
      monthlyData[monthKey].received += pay.amount || 0;
    }
  });

  const labels = Object.keys(monthlyData).map(k => monthlyData[k].label);
  const earnedValues = Object.keys(monthlyData).map(k => monthlyData[k].earned);
  const receivedValues = Object.keys(monthlyData).map(k => monthlyData[k].received);

  if (earningsChart) {
    earningsChart.destroy();
  }

  earningsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Ganhos no Trabalho',
          data: earnedValues,
          backgroundColor: 'rgba(139, 92, 246, 0.65)',
          borderColor: 'rgb(139, 92, 246)',
          borderWidth: 1,
          borderRadius: 6
        },
        {
          label: 'Valor Recebido',
          data: receivedValues,
          backgroundColor: 'rgba(16, 185, 129, 0.65)',
          borderColor: 'rgb(16, 185, 129)',
          borderWidth: 1,
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#94a3b8',
            font: { family: 'Outfit', size: 12 }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { family: 'Outfit' } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8', font: { family: 'Outfit' } }
        }
      }
    }
  });
}

// Ação rápida para registrar turno no dia de hoje
function quickLogShift(period) {
  const todayStr = formatDateISO(new Date());
  let rate = 0;
  
  if (period === 'morning') rate = db.settings.morningRate;
  else if (period === 'night') rate = db.settings.nightRate;
  else if (period === 'both') rate = db.settings.morningRate + db.settings.nightRate;
  
  // Se o dia já tiver registro financeiro de pagamento, mantém o valor pago e atualiza
  const existing = db.workedDays[todayStr] || {
    amountPaid: 0,
    paymentsApplied: {}
  };

  const newDay = {
    date: todayStr,
    period: period,
    rate: rate,
    status: existing.amountPaid >= rate ? 'paid' : (existing.amountPaid > 0 ? 'partial' : 'unpaid'),
    amountPaid: existing.amountPaid || 0,
    pendingAmount: Math.max(0, rate - (existing.amountPaid || 0)),
    notes: existing.notes || 'Registrado via Ação Rápida',
    paymentsApplied: existing.paymentsApplied || {}
  };

  db.workedDays[todayStr] = newDay;
  saveToStorage();
  updateDashboardData();
  
  alert(`Turno de hoje (${period === 'morning' ? 'Manhã' : period === 'night' ? 'Noite' : period === 'both' ? 'Ambos' : 'Folga'}) registrado com sucesso!`);
}

/* ==========================================================================
   ABA 2: CALENDÁRIO MENSAL INTERATIVO
   ========================================================================== */

// Lista de meses
const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

function renderCalendar() {
  const monthYearLabel = document.getElementById('calendar-month-year');
  monthYearLabel.innerText = `${MONTH_NAMES[currentMonth]} de ${currentYear}`;

  const grid = document.getElementById('calendar-days-grid');
  grid.innerHTML = ''; // Limpar calendário anterior

  // Adicionar nomes dos dias da semana
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  dayNames.forEach(name => {
    const label = document.createElement('div');
    label.className = 'calendar-day-label';
    label.innerText = name;
    grid.appendChild(label);
  });

  // Obter primeiro dia do mês e total de dias do mês
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
  const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
  
  // Obter total de dias do mês anterior
  const prevLastDay = new Date(currentYear, currentMonth, 0).getDate();

  // Desenhar dias do mês anterior (para preencher a primeira semana)
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = prevLastDay - i;
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const dateStr = formatDateISO(new Date(prevYear, prevMonth, dayNum));
    createDayElement(dayNum, dateStr, true, grid);
  }

  // Desenhar dias do mês corrente
  for (let i = 1; i <= lastDay; i++) {
    const dateStr = formatDateISO(new Date(currentYear, currentMonth, i));
    createDayElement(i, dateStr, false, grid);
  }

  // Desenhar dias do mês seguinte (para preencher até completar múltiplos de 7)
  const totalCells = grid.children.length - 7; // Desconta a linha de labels de dias
  const remainingCells = 42 - totalCells; // Queremos completar 6 semanas inteiras (42 células)
  
  for (let i = 1; i <= remainingCells; i++) {
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    const dateStr = formatDateISO(new Date(nextYear, nextMonth, i));
    createDayElement(i, dateStr, true, grid);
  }

  lucide.createIcons();
}

function createDayElement(dayNum, dateStr, isOtherMonth, container) {
  const dayElement = document.createElement('div');
  dayElement.className = 'glass-card calendar-day';
  if (isOtherMonth) {
    dayElement.classList.add('other-month');
  }

  const data = db.workedDays[dateStr];

  // Número do Dia
  const numSpan = document.createElement('span');
  numSpan.className = 'day-number';
  numSpan.innerText = dayNum;
  dayElement.appendChild(numSpan);

  // Destacar o dia de hoje
  const todayStr = formatDateISO(new Date());
  if (dateStr === todayStr) {
    dayElement.style.border = '2px solid var(--accent-purple)';
    dayElement.style.boxShadow = '0 0 15px rgba(139, 92, 246, 0.4)';
  }

  // Adicionar layout específico se houver registros para este dia
  if (data && data.period !== 'none') {
    // Aplicar estilos com base no período trabalhado
    if (data.period === 'morning') {
      dayElement.classList.add('day-worked-morning');
    } else if (data.period === 'night') {
      dayElement.classList.add('day-worked-night');
    } else if (data.period === 'both') {
      dayElement.classList.add('day-worked-both');
    } else if (data.period === 'off') {
      dayElement.classList.add('day-off');
    }

    // Aplicar estilos com base no status do pagamento
    if (data.period !== 'off') {
      if (data.status === 'paid') {
        dayElement.classList.add('day-status-paid');
      } else if (data.status === 'partial') {
        dayElement.classList.add('day-status-partial');
      } else if (data.status === 'unpaid') {
        dayElement.classList.add('day-status-unpaid');
      }
    }

    // Badge de status visual para o período/valor
    const detailsContainer = document.createElement('div');
    detailsContainer.style.display = 'flex';
    detailsContainer.style.flexDirection = 'column';
    detailsContainer.style.gap = '2px';
    detailsContainer.style.width = '100%';

    const badge = document.createElement('span');
    badge.className = 'day-badge';
    
    if (data.period === 'morning') {
      badge.innerHTML = `<i data-lucide="sun" style="width: 10px; height: 10px; display: inline; vertical-align: middle; margin-right: 2px;"></i> Manhã`;
      badge.style.background = 'rgba(245, 158, 11, 0.15)';
      badge.style.color = '#f59e0b';
    } else if (data.period === 'night') {
      badge.innerHTML = `<i data-lucide="moon" style="width: 10px; height: 10px; display: inline; vertical-align: middle; margin-right: 2px;"></i> Noite`;
      badge.style.background = 'rgba(139, 92, 246, 0.15)';
      badge.style.color = '#a78bfa';
    } else if (data.period === 'both') {
      badge.innerHTML = `<i data-lucide="sunset" style="width: 10px; height: 10px; display: inline; vertical-align: middle; margin-right: 2px;"></i> Ambos`;
      badge.style.background = 'rgba(59, 130, 246, 0.15)';
      badge.style.color = '#60a5fa';
    } else if (data.period === 'off') {
      badge.innerHTML = `<i data-lucide="coffee" style="width: 10px; height: 10px; display: inline; vertical-align: middle; margin-right: 2px;"></i> Folga`;
      badge.style.background = 'rgba(100, 116, 139, 0.15)';
      badge.style.color = '#94a3b8';
    }
    
    detailsContainer.appendChild(badge);

    // Mostrar valor monetário se não for folga
    if (data.period !== 'off') {
      const valDiv = document.createElement('div');
      valDiv.className = 'day-value';
      
      if (data.status === 'partial') {
        const remaining = data.pendingAmount;
        valDiv.innerHTML = `${formatCurrency(data.amountPaid)} <span style="color: var(--status-unpaid); font-size: 0.65rem;">(-${formatCurrency(remaining)})</span>`;
      } else {
        valDiv.innerText = formatCurrency(data.rate);
      }
      
      detailsContainer.appendChild(valDiv);
    }

    dayElement.appendChild(detailsContainer);
  }

  // Ação de clique para abrir edição
  dayElement.addEventListener('click', () => openDayModal(dateStr));
  container.appendChild(dayElement);
}

// Navegação de meses
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
  const customRateGroup = document.getElementById('custom-rate-group');
  const deleteBtn = document.getElementById('btn-delete-day');
  const paymentInfoBox = document.getElementById('modal-payment-info');

  dateValue.value = dateStr;
  dateTitle.innerText = formatDateStringDisplay(dateStr);

  // Carregar dados existentes ou novos
  const data = db.workedDays[dateStr];
  
  // Limpar formulário de seleções anteriores
  const radios = document.getElementsByName('modal-period');
  radios.forEach(r => r.checked = false);
  document.getElementById('modal-custom-rate').value = '';
  document.getElementById('modal-notes').value = '';
  
  if (data) {
    // Preencher com os dados salvos
    const periodRadio = document.querySelector(`input[name="modal-period"][value="${data.period}"]`);
    if (periodRadio) periodRadio.checked = true;
    
    if (data.rate !== undefined) {
      // Verifica se o valor salvo é diferente do valor configurado padrão na data de criação
      const standardRate = getStandardRateForPeriod(data.period);
      if (data.rate !== standardRate && data.period !== 'off' && data.period !== 'none') {
        document.getElementById('modal-custom-rate').value = data.rate;
      }
    }
    
    document.getElementById('modal-notes').value = data.notes || '';
    deleteBtn.style.display = 'block';

    // Se já houver pagamentos parciais ou totais associados ao dia
    if (data.amountPaid > 0 || data.pendingAmount > 0) {
      paymentInfoBox.style.display = 'block';
      
      const statusLabel = document.getElementById('modal-pay-status-label');
      statusLabel.className = 'day-badge';
      if (data.status === 'paid') {
        statusLabel.innerText = 'Pago';
        statusLabel.classList.add('badge-paid');
      } else if (data.status === 'partial') {
        statusLabel.innerText = 'Parcialmente Pago';
        statusLabel.classList.add('badge-partial');
      } else {
        statusLabel.innerText = 'Pendente';
        statusLabel.classList.add('badge-unpaid');
      }

      document.getElementById('modal-pay-received').innerText = formatCurrency(data.amountPaid);
      document.getElementById('modal-pay-pending').innerText = formatCurrency(data.pendingAmount);
    } else {
      paymentInfoBox.style.display = 'none';
    }
  } else {
    // Dia vazio
    deleteBtn.style.display = 'none';
    paymentInfoBox.style.display = 'none';
  }

  // Abre o modal
  modal.classList.add('active');
  lucide.createIcons();
}

function closeDayModal() {
  const modal = document.getElementById('day-modal');
  modal.classList.remove('active');
}

// Retorna o valor padrão com base no período
function getStandardRateForPeriod(period) {
  if (period === 'morning') return db.settings.morningRate;
  if (period === 'night') return db.settings.nightRate;
  if (period === 'both') return db.settings.morningRate + db.settings.nightRate;
  return 0;
}

// Salva os dados no banco
function saveDayDetails(event) {
  event.preventDefault();

  const dateStr = document.getElementById('modal-date-value').value;
  const radios = document.getElementsByName('modal-period');
  let selectedPeriod = 'none';
  
  for (const r of radios) {
    if (r.checked) {
      selectedPeriod = r.value;
      break;
    }
  }

  if (selectedPeriod === 'none') {
    alert("Por favor, selecione um período trabalhado ou folga.");
    return;
  }

  const customRateVal = parseFloat(document.getElementById('modal-custom-rate').value);
  const notesVal = document.getElementById('modal-notes').value;

  // Determinar valor devido
  let rate = getStandardRateForPeriod(selectedPeriod);
  if (!isNaN(customRateVal) && selectedPeriod !== 'off' && selectedPeriod !== 'none') {
    rate = customRateVal;
  }

  const existing = db.workedDays[dateStr] || {
    amountPaid: 0,
    paymentsApplied: {}
  };

  const amountPaid = existing.amountPaid || 0;
  const pendingAmount = Math.max(0, rate - amountPaid);
  
  // Define status de pagamento
  let status = 'unpaid';
  if (amountPaid >= rate) {
    status = 'paid';
  } else if (amountPaid > 0) {
    status = 'partial';
  }

  db.workedDays[dateStr] = {
    date: dateStr,
    period: selectedPeriod,
    rate: rate,
    status: status,
    amountPaid: amountPaid,
    pendingAmount: pendingAmount,
    notes: notesVal,
    paymentsApplied: existing.paymentsApplied || {}
  };

  saveToStorage();
  closeDayModal();
  renderCalendar();
}

// Deleta o registro de um dia
function deleteDayRecord() {
  const dateStr = document.getElementById('modal-date-value').value;
  const data = db.workedDays[dateStr];

  if (!data) return;

  if (data.amountPaid > 0) {
    const confirmDelete = confirm("Este dia já possui registro de pagamentos. Excluir o registro de trabalho limpará o valor a receber, mas manterá o histórico financeiro. Deseja continuar?");
    if (!confirmDelete) return;
  }

  // Deleta do objeto
  delete db.workedDays[dateStr];
  
  saveToStorage();
  closeDayModal();
  renderCalendar();
}

/* ==========================================================================
   ABA 3: PAGAMENTOS SEMANAIS
   ========================================================================== */

function renderWeeksList() {
  const container = document.getElementById('weeks-container-list');
  container.innerHTML = '';

  // Agrupar dias trabalhados (que não são folgas) por semana
  const weeksMap = {};

  Object.keys(db.workedDays).forEach(dateStr => {
    const dayData = db.workedDays[dateStr];
    if (dayData.period !== 'none' && dayData.period !== 'off') {
      const weekInfo = getWeekRange(dateStr);
      const weekKey = weekInfo.key;

      if (!weeksMap[weekKey]) {
        weeksMap[weekKey] = {
          key: weekKey,
          label: weekInfo.label,
          mondayISO: weekInfo.mondayStr,
          days: [],
          totalDue: 0,
          totalPaid: 0,
          totalPending: 0
        };
      }

      weeksMap[weekKey].days.push(dayData);
      weeksMap[weekKey].totalDue += dayData.rate;
      weeksMap[weekKey].totalPaid += dayData.amountPaid || 0;
      weeksMap[weekKey].totalPending += dayData.pendingAmount || 0;
    }
  });

  // Ordena semanas em ordem decrescente (mais recentes primeiro)
  const sortedWeeks = Object.values(weeksMap).sort((a, b) => {
    return b.mondayISO.localeCompare(a.mondayISO);
  });

  if (sortedWeeks.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum dia de trabalho registrado para processar pagamentos.</div>`;
    return;
  }

  sortedWeeks.forEach(week => {
    const card = document.createElement('div');
    card.className = 'week-card';
    if (selectedWeeks.includes(week.key)) {
      card.classList.add('selected');
    }

    // Calcula status visual da semana
    let statusText = 'Pendente';
    let badgeClass = 'badge-unpaid';

    if (week.totalPending === 0) {
      statusText = 'Pago';
      badgeClass = 'badge-paid';
    } else if (week.totalPaid > 0) {
      statusText = 'Parcial';
      badgeClass = 'badge-partial';
    }

    card.innerHTML = `
      <div class="week-header">
        <span class="week-title">${week.label}</span>
        <span class="week-badge ${badgeClass}">${statusText}</span>
      </div>
      <div class="week-details">
        <div class="week-detail-item">
          <span>Total</span>
          <p>${formatCurrency(week.totalDue)}</p>
        </div>
        <div class="week-detail-item">
          <span>Recebido</span>
          <p style="color: var(--status-paid);">${formatCurrency(week.totalPaid)}</p>
        </div>
        <div class="week-detail-item">
          <span>Pendente</span>
          <p style="color: var(--status-unpaid);">${formatCurrency(week.totalPending)}</p>
        </div>
      </div>
    `;

    // Ação ao clicar no cartão da semana para seleção/multi-seleção
    card.addEventListener('click', () => {
      const idx = selectedWeeks.indexOf(week.key);
      if (idx > -1) {
        selectedWeeks.splice(idx, 1);
        card.classList.remove('selected');
      } else {
        selectedWeeks.push(week.key);
        card.classList.add('selected');
      }
      updatePaymentSummary();
    });

    container.appendChild(card);
  });
}

// Atualiza o resumo financeiro das semanas selecionadas à direita da tela
function updatePaymentSummary() {
  const summaryWeeksCount = document.getElementById('summary-weeks-count');
  const summaryDaysCount = document.getElementById('summary-days-count');
  const summaryTotalDue = document.getElementById('summary-total-due');
  const summaryAlreadyPaid = document.getElementById('summary-already-paid');
  const summaryRemainingDue = document.getElementById('summary-remaining-due');
  const paymentAmountInput = document.getElementById('input-payment-amount');
  const paymentDateInput = document.getElementById('input-payment-date');
  const submitBtn = document.getElementById('btn-submit-payment');

  if (selectedWeeks.length === 0) {
    summaryWeeksCount.innerText = "0";
    summaryDaysCount.innerText = "0 dias";
    summaryTotalDue.innerText = "R$ 0,00";
    summaryAlreadyPaid.innerText = "R$ 0,00";
    summaryRemainingDue.innerText = "R$ 0,00";
    
    paymentAmountInput.value = '';
    paymentAmountInput.disabled = true;
    submitBtn.disabled = true;
    return;
  }

  // Coleta dados dos dias correspondentes às semanas selecionadas
  let totalDays = 0;
  let totalDue = 0;
  let totalPaid = 0;
  let totalPending = 0;

  // Analisa todos os dias que pertencem às semanas selecionadas
  Object.keys(db.workedDays).forEach(dateStr => {
    const dayData = db.workedDays[dateStr];
    if (dayData.period !== 'none' && dayData.period !== 'off') {
      const weekInfo = getWeekRange(dateStr);
      if (selectedWeeks.includes(weekInfo.key)) {
        totalDays++;
        totalDue += dayData.rate;
        totalPaid += dayData.amountPaid || 0;
        totalPending += dayData.pendingAmount || 0;
      }
    }
  });

  summaryWeeksCount.innerText = selectedWeeks.length;
  summaryDaysCount.innerText = `${totalDays} dia(s)`;
  summaryTotalDue.innerText = formatCurrency(totalDue);
  summaryAlreadyPaid.innerText = formatCurrency(totalPaid);
  summaryRemainingDue.innerText = formatCurrency(totalPending);

  paymentAmountInput.disabled = false;
  paymentAmountInput.value = totalPending.toFixed(2);
  paymentAmountInput.max = totalPending.toFixed(2); // Sugere o valor máximo restante
  paymentDateInput.value = formatDateISO(new Date());
  
  submitBtn.disabled = false;
}

// Processa o pagamento enviado pelo formulário (FIFO)
function processPayment(event) {
  event.preventDefault();

  if (selectedWeeks.length === 0) return;

  const paymentAmount = parseFloat(document.getElementById('input-payment-amount').value);
  const paymentDate = document.getElementById('input-payment-date').value;
  const paymentNotes = document.getElementById('input-payment-notes').value;

  if (isNaN(paymentAmount) || paymentAmount <= 0) {
    alert("Por favor, digite um valor de pagamento válido maior que R$ 0,00.");
    return;
  }

  // 1. Identificar todos os dias trabalhados das semanas selecionadas que ainda têm pendências
  const daysToPay = [];
  Object.keys(db.workedDays).forEach(dateStr => {
    const dayData = db.workedDays[dateStr];
    if (dayData.period !== 'none' && dayData.period !== 'off' && dayData.pendingAmount > 0) {
      const weekInfo = getWeekRange(dateStr);
      if (selectedWeeks.includes(weekInfo.key)) {
        daysToPay.push(dayData);
      }
    }
  });

  if (daysToPay.length === 0) {
    alert("Todos os dias nestas semanas selecionadas já foram totalmente pagos.");
    return;
  }

  // Ordenar cronologicamente (da data mais antiga para a mais recente) para aplicar o FIFO
  daysToPay.sort((a, b) => a.date.localeCompare(b.date));

  // 2. Registrar o ID do pagamento
  const paymentId = 'pay_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  let remainingPayment = paymentAmount;
  const coveredDays = [];

  // Distribui o dinheiro
  for (const day of daysToPay) {
    if (remainingPayment <= 0) break;

    const amountNeeded = day.pendingAmount;
    const amountToApply = Math.min(remainingPayment, amountNeeded);

    // Atualiza o dia trabalhado
    day.amountPaid = (day.amountPaid || 0) + amountToApply;
    day.pendingAmount = day.rate - day.amountPaid;
    
    // Atualiza status do dia
    if (day.pendingAmount <= 0) {
      day.status = 'paid';
    } else {
      day.status = 'partial';
    }

    // Registra o relacionamento pagamento -> valor aplicado neste dia
    if (!day.paymentsApplied) day.paymentsApplied = {};
    day.paymentsApplied[paymentId] = amountToApply;

    coveredDays.push(day.date);
    remainingPayment -= amountToApply;
  }

  // 3. Registrar o pagamento no Histórico de Pagamentos
  const paymentRecord = {
    id: paymentId,
    date: paymentDate,
    amount: paymentAmount,
    coveredDays: coveredDays,
    notes: paymentNotes || 'Recebimento semanal'
  };

  db.payments.push(paymentRecord);
  saveToStorage();

  // Resetar a seleção e recarregar os dados
  selectedWeeks = [];
  renderWeeksList();
  updatePaymentSummary();
  
  // Limpar formulário
  document.getElementById('input-payment-notes').value = '';
  
  alert("Pagamento registrado com sucesso!");
}

/* ==========================================================================
   ABA 4: HISTÓRICO DE PAGAMENTOS
   ========================================================================== */

function renderPaymentHistory() {
  const tableBody = document.getElementById('payment-history-table-body');
  tableBody.innerHTML = '';

  // Ordenar pagamentos por data decrescente (mais recente primeiro)
  const sortedPayments = [...db.payments].sort((a, b) => b.date.localeCompare(a.date));

  if (sortedPayments.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 3rem;">
          Nenhum registro de pagamento recebido no histórico.
        </td>
      </tr>
    `;
    return;
  }

  sortedPayments.forEach(pay => {
    const tr = document.createElement('tr');
    
    // Formatar dias cobertos
    let periodText = 'Nenhum dia';
    if (pay.coveredDays && pay.coveredDays.length > 0) {
      const sortedDates = [...pay.coveredDays].sort((a, b) => a.localeCompare(b));
      if (sortedDates.length === 1) {
        periodText = formatDateStringDisplay(sortedDates[0]);
      } else {
        const start = formatDateStringDisplay(sortedDates[0]);
        const end = formatDateStringDisplay(sortedDates[sortedDates.length - 1]);
        periodText = `${start} a ${end} (${sortedDates.length} dias)`;
      }
    }

    tr.innerHTML = `
      <td class="history-date">${formatDateStringDisplay(pay.date)}</td>
      <td class="history-amount" style="color: var(--status-paid);">${formatCurrency(pay.amount)}</td>
      <td>${periodText}</td>
      <td>
        <span class="history-pending-tag" style="background: rgba(139, 92, 246, 0.1); color: var(--accent-purple);">
          <i data-lucide="check" style="width: 12px; height: 12px;"></i> Processado
        </span>
      </td>
      <td style="color: var(--text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${pay.notes || '-'}
      </td>
      <td>
        <button class="btn-danger" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="deletePayment('${pay.id}')">
          <i data-lucide="undo-2" style="width: 12px; height: 12px;"></i> Estornar
        </button>
      </td>
    `;

    tableBody.appendChild(tr);
  });
}

// Estorna um pagamento (remove e devolve o saldo devedor nos dias associados)
function deletePayment(paymentId) {
  const confirmUndo = confirm("Tem certeza que deseja estornar este pagamento? O valor correspondente voltará a ficar pendente nos dias trabalhados relacionados.");
  
  if (!confirmUndo) return;

  // Localiza o pagamento no array
  const payIndex = db.payments.findIndex(p => p.id === paymentId);
  if (payIndex === -1) return;

  const payment = db.payments[payIndex];

  // Desfazer aplicação do dinheiro nos dias
  if (payment.coveredDays) {
    payment.coveredDays.forEach(dateStr => {
      const day = db.workedDays[dateStr];
      if (day && day.paymentsApplied && day.paymentsApplied[paymentId] !== undefined) {
        const amountApplied = day.paymentsApplied[paymentId];
        
        // Deduz valor pago
        day.amountPaid = Math.max(0, (day.amountPaid || 0) - amountApplied);
        day.pendingAmount = day.rate - day.amountPaid;
        
        // Remove vínculo do pagamento
        delete day.paymentsApplied[paymentId];

        // Atualiza status do dia
        if (day.amountPaid === 0) {
          day.status = 'unpaid';
        } else {
          day.status = 'partial';
        }
      }
    });
  }

  // Remove pagamento da lista
  db.payments.splice(payIndex, 1);
  saveToStorage();
  
  // Recarregar histórico
  renderPaymentHistory();
  lucide.createIcons();
  
  alert("Pagamento estornado com sucesso!");
}

/* ==========================================================================
   ABA 5: CONFIGURAÇÕES E BACKUP
   ========================================================================== */

function loadSettingsFields() {
  document.getElementById('setting-morning-rate').value = db.settings.morningRate;
  document.getElementById('setting-night-rate').value = db.settings.nightRate;
}

function saveRatesSettings(event) {
  event.preventDefault();

  const morning = parseFloat(document.getElementById('setting-morning-rate').value);
  const night = parseFloat(document.getElementById('setting-night-rate').value);

  if (isNaN(morning) || isNaN(night)) {
    alert("Valores inválidos para as tarifas.");
    return;
  }

  db.settings.morningRate = morning;
  db.settings.nightRate = night;
  
  saveToStorage();
  updateRateLabels();
  
  alert("Tarifas padrão atualizadas com sucesso!");
}

// Exporta base de dados em formato JSON para download
function exportDatabase() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
  const downloadAnchor = document.createElement('a');
  
  const dateStr = formatDateISO(new Date());
  
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `fluxoturno_backup_${dateStr}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

// Importa base de dados a partir de arquivo JSON
function importDatabase(event) {
  const fileReader = new FileReader();
  const file = event.target.files[0];

  if (!file) return;

  fileReader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      
      // Validação básica do formato
      if (parsed.settings && parsed.workedDays && parsed.payments) {
        db = parsed;
        saveToStorage();
        updateRateLabels();
        loadSettingsFields();
        alert("Backup importado com sucesso! Os dados da aplicação foram atualizados.");
        // Forçar reload na aba de dashboard
        document.querySelector('[data-tab="dashboard"]').click();
      } else {
        alert("O arquivo selecionado não é um backup válido do FluxoTurno.");
      }
    } catch (err) {
      alert("Erro ao ler o arquivo JSON de backup.");
      console.error(err);
    }
  };

  fileReader.readAsText(file);
}

// Apaga todos os dados do localStorage e reinicia
function clearDatabase() {
  const confirmClear = confirm("ATENÇÃO: Você perderá definitivamente todos os registros de dias trabalhados e pagamentos efetuados. Deseja prosseguir?");
  
  if (confirmClear) {
    db = JSON.parse(JSON.stringify(DEFAULT_DB));
    saveToStorage();
    updateRateLabels();
    loadSettingsFields();
    alert("Todos os registros foram excluídos com sucesso.");
    
    // Forçar reload na aba de dashboard
    document.querySelector('[data-tab="dashboard"]').click();
  }
}
