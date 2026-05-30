/* ==========================================================================
   APP CONTROLLER & LOGIC - CONTROLE DE DIAS TRABALHADOS
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, get, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Versão da aplicação (gerenciada automaticamente pelo Git Hook)
const APP_VERSION = '1.0.39';
const APP_BUILD_DATE = '2026-05-30 13:49:24';




// CONFIGURAÇÃO DO FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyAlY3MVb-8jvvcwjOtd0VqRP427MISJDjg",
  authDomain: "dias-trabalhados-bf99a.firebaseapp.com",
  databaseURL: "https://dias-trabalhados-bf99a-default-rtdb.firebaseio.com",
  projectId: "dias-trabalhados-bf99a",
  storageBucket: "dias-trabalhados-bf99a.firebasestorage.app",
  messagingSenderId: "807305373436",
  appId: "1:807305373436:web:5b12891242f350326e9979",
  measurementId: "G-B2TPPJMH55"
};

// Configuração de Acesso (Whitelist)
const MASTER_ADMINS = ['edneypugliese.dev@gmail.com', 'edneypugleise@gmail.com'];

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Monitora o estado de autenticação
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      // Busca a lista de e-mails autorizados no banco de dados
      const authRef = ref(database, 'authorized_emails');
      const snapshot = await get(authRef);
      let allowedEmails = snapshot.val();

      // Se a lista não existir no banco (primeira vez), inicializa com os Master Admins
      if (!allowedEmails) {
        allowedEmails = [...MASTER_ADMINS];
        await set(authRef, allowedEmails);
      }

      // Verifica se o usuário tem permissão
      if (allowedEmails.includes(user.email) || MASTER_ADMINS.includes(user.email)) {
        console.log("Usuário autorizado:", user.email);
        
        // Preenche dados do perfil
        document.getElementById('user-photo').src = user.photoURL || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';
        document.getElementById('user-name').innerText = user.displayName || 'Usuário';
        document.getElementById('user-email').innerText = user.email;
        document.getElementById('user-profile').style.display = 'flex';

        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-content').style.display = 'flex';
        await initDatabase();
      } else {
        console.warn("Acesso negado para:", user.email);
        alert("Acesso negado! O e-mail " + user.email + " não tem permissão para acessar este sistema.");
        showLoginError("Acesso restrito. Seu e-mail não está na lista de permissões.");
        await signOut(auth);
      }
    } catch (error) {
      console.error("Erro ao verificar permissões:", error);
      // Fallback de segurança: permite os Master Admins mesmo se o banco falhar
      if (MASTER_ADMINS.includes(user.email)) {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-content').style.display = 'flex';
        await initDatabase();
      } else {
        showLoginError("Erro de conexão ao verificar permissões.");
        await signOut(auth);
      }
    }
  } else {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-content').style.display = 'none';
    document.getElementById('user-profile').style.display = 'none';
  }
});

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
    showLoginError("Falha na autenticação com o Google. Tente novamente.");
  }
}

// Configurações do Banco de Dados Local (LocalStorage)
const DB_STORAGE_KEY = 'fluxoturno_db';

// Estado Inicial do Banco de Dados
const DEFAULT_DB = {
  settings: {
    morningRate: 35.00,
    nightRate: 25.00,
    currency: 'EUR',
    offDays: [4], // Quinta-feira (4) por padrão
    halfDays: {
      0: 'morning' // Domingo (0) como Meio Período (Manhã) padrão
    },
    language: 'pt-BR'
  },
  workedDays: {}, // Formato: { 'YYYY-MM-DD': { date, period, rate, status, amountPaid, pendingAmount, notes, paymentsApplied: { paymentId: amount } } }
  payments: []    // Formato: [{ id, date, amount, coveredDays: [], notes }]
};

// Traduções para Português e Italiano
const translations = {
  'pt-BR': {
    // Sidebar
    'nav-dashboard': 'Dashboard',
    'nav-calendar': 'Calendário',
    'nav-payments': 'Pagamentos',
    'nav-history': 'Histórico',
    'nav-settings': 'Configurações',
    'sidebar-version': 'Versão:',
    'sidebar-updated': 'Atualizado:',
    
    // Header
    'header-dashboard-title': 'Dashboard',
    'header-dashboard-subtitle': 'Visão geral do seu trabalho e finanças.',
    'header-calendar-title': 'Calendário',
    'header-calendar-subtitle': 'Visualize o mês de trabalho e configure seus turnos clicando nos dias.',
    'header-payments-title': 'Pagamentos',
    'header-payments-subtitle': 'Selecione os ciclos semanais para registrar recebimentos totais ou parciais.',
    'header-history-title': 'Histórico',
    'header-history-subtitle': 'Registro completo de pagamentos e pendências finalizadas.',
    'header-settings-title': 'Configurações',
    'header-settings-subtitle': 'Ajustes finos do sistema, exportação de dados e tarifas padrão.',

    // Dashboard
    'stat-total-accumulated': 'Total Acumulado',
    'stat-total-received': 'Total Recebido',
    'stat-total-pending': 'Total Pendente',
    'stat-this-week': 'Esta Semana',
    'chart-title': 'Ganhos vs. Recebimentos por mês',
    'quick-actions-title': 'Ações Rápidas',
    'quick-actions-desc': 'Registre rapidamente o seu turno para o dia de hoje',
    'btn-morning-shift': 'Turno da Manhã',
    'btn-night-shift': 'Turno da Noite',
    'btn-both-shifts': 'Ambos os Turnos',
    'btn-off-day': 'Dia de Folga',
    'rate-default': 'Valor padrão:',
    'log-rest': 'Registrar descanso',

    // Calendar
    'btn-batch-launch': 'Lançar Vários Dias',
    'btn-batch-remove': 'Remover Vários Dias',
    'btn-today': 'Hoje',
    'legend-paid': 'Pago',
    'legend-partial': 'Parcialmente Pago',
    'legend-pending': 'Pendente',
    'legend-off': 'Folga',
    'legend-morning': 'Manhã',
    'legend-night': 'Noite',
    'legend-both': 'Ambos',

    // Payments
    'work-cycles-title': 'Ciclos de Trabalho Semanais',
    'work-cycles-desc': 'Selecione as semanas que deseja incluir no recebimento do pagamento.',
    'register-receipt-title': 'Registrar Recebimento',
    'summary-selected-weeks': 'Semanas Selecionadas:',
    'summary-selected-days': 'Total de Dias Selecionados:',
    'summary-total-due': 'Valor Total Devido:',
    'summary-already-paid': 'Saldo Pendente nas Selecionadas:',
    'summary-to-pay': 'Falta Pagar:',
    'label-received-amount': 'Valor Recebido (€)',
    'label-payment-date': 'Data do Recebimento',
    'label-payment-method': 'Método de Pagamento',
    'label-notes': 'Especificação / Notas',
    'btn-confirm-receipt': 'Confirmar Recebimento',
    'opt-cash': 'Dinheiro',
    'opt-deposit': 'depósito',
    'opt-others': 'Outros (Especificar)',
    'week-to': 'a',
    'week-days': 'dias',
    'week-day': 'dia',

    // History
    'payment-history-title': 'Histórico de Pagamentos Efetuados',
    'th-date': 'Data Recebimento',
    'th-amount': 'Valor Pago',
    'th-period': 'Período Coberto',
    'th-status': 'Status / pendência',
    'th-notes': 'Observações',
    'th-actions': 'Ações',
    'btn-refund': 'Estornar',
    'status-processed': 'Processado',

    // Settings
    'settings-rates-title': 'Configuração de Tarifas',
    'settings-rates-desc': 'Defina os valores padrão para cada Período trabalhado. Novos dias utilizarão essas taxas.',
    'label-morning-rate': 'Valor Período da Manhà(€)',
    'label-night-rate': 'Valor Período da Noite (€)',
    'btn-save-rates': 'Salvar Tarifas',
    'settings-offdays-title': 'Folga Semanal padrão',
    'settings-offdays-desc': 'Selecione os dias da semana que são suas folgas padrão. Eles serão sugeridos no Lançamento em lote e exibidos no Calendário.',
    'btn-save-offdays': 'Salvar Folgas',
    'settings-backup-title': 'Backup e Restauração',
    'settings-backup-desc': 'Exporte seus dados para seguranÃ§a ou importe o arquivo JSON em outro dispositivo.',
    'btn-export': 'Exportar Dados (JSON)',
    'btn-import': 'Importar Dados (JSON)',
    'danger-zone': 'Zona de Perigo',
    'danger-zone-desc': 'Esta ação excluirá permanentemente todos os registros de dias trabalhados e pagamentos.',
    'btn-clear-all': 'Apagar Todo o Histórico',
    'label-language': 'Idioma do Sistema',

    // Modals
    'modal-period-label': 'Selecione o Período Trabalhado',
    'modal-custom-rate': 'Valor Customizado para este Dia (€)',
    'modal-notes-label': 'Observações',
    'modal-fin-info': 'Informações Financeiras do Dia',
    'modal-status': 'Status:',
    'modal-received': 'Valor Já Recebido:',
    'modal-pending': 'Saldo Devedor:',
    'btn-delete': 'Excluir',
    'btn-save-record': 'Salvar Registro',
    'batch-title': 'Lançamento em Lote',
    'batch-start': 'Data Inicial',
    'batch-end': 'Data Final',
    'batch-default-period': 'Período padrão para Dias Úteis',
    'batch-offday-note': 'Obs: Os dias de folga semanal configurados serão pré-marcados como "Folga" automaticamente.',
    'batch-customize-title': 'Personalizar Dias do Intervalo',
    'btn-cancel': 'Cancelar',
    'btn-save-batch': 'Salvar Lote de Dias',
    'batch-remove-title': 'Remover Dias em Lote',
    'batch-remove-select': 'Selecionar Dias para Remoção',
    'btn-confirm-remove': 'Confirmar Remoção',

    // Days & Months
    'day-0': 'Domingo',
    'day-1': 'Segunda-feira',
    'day-2': 'Terça-feira',
    'day-3': 'Quarta-feira',
    'day-4': 'Quinta-feira',
    'day-5': 'Sexta-feira',
    'day-6': 'Sábado',
    'short-day-0': 'Dom',
    'short-day-1': 'Seg',
    'short-day-2': 'Ter',
    'short-day-3': 'Qua',
    'short-day-4': 'Qui',
    'short-day-5': 'Sex',
    'short-day-6': 'Sáb',
    'month-0': 'Janeiro',
    'month-1': 'Fevereiro',
    'month-2': 'Março',
    'month-3': 'Abril',
    'month-4': 'Maio',
    'month-5': 'Junho',
    'month-6': 'Julho',
    'month-7': 'Agosto',
    'month-8': 'Setembro',
    'month-9': 'Outubro',
    'month-10': 'Novembro',
    'month-11': 'Dezembro',

    // Alerts & Messages
    'msg-save-success': 'Salvo com sucesso!',
    'msg-delete-confirm': 'Tem certeza que deseja excluir?',
    'msg-backup-success': 'Backup importado com sucesso!',
    'msg-invalid-file': 'Arquivo inválido!',
    'msg-select-period': 'Por favor, selecione um Período.',
    'msg-payment-success': 'Pagamento registrado com sucesso!',
    'msg-undo-confirm': 'Tem certeza que deseja estornar este pagamento?',
    'msg-undo-success': 'Pagamento estornado com sucesso!',
    'msg-clear-confirm': 'ATENÇÃO: Você perderá definitivamente todos os registros. Deseja prosseguir?',
    'msg-batch-save-success': 'registros de dia salvos/atualizados com sucesso!',
    'msg-batch-remove-success': 'registros de dia removidos com sucesso!',
    'msg-all-pending': 'Todas com pendência',
    'msg-no-days': 'Nenhum dia de trabalho registrado para processar pagamentos.',
    'msg-no-history': 'Nenhum registro de pagamento recebido no Histórico.',
    'msg-no-batch-days': 'Selecione as datas inicial e final para visualizar e personalizar os dias.',
    'msg-no-remove-days': 'Selecione as datas inicial e final para visualizar os dias com registros.',
    'opt-mixed': 'Misto (Dinheiro + depósito)',
    'label-cash-amount': 'Valor em Dinheiro (€)',
    'label-deposit-amount': 'Valor em depósito (€)',
    'msg-invalid-mixed-sum': 'A soma dos valores em dinheiro e depósito deve ser igual ao valor total recebido!',
    'stat-total-credit': 'Crédito Antecipado',
    'general-balance-title': 'Saldo Geral Consolidado',
    'general-balance-credit': 'Crédito Disponível (Adiantado)',
    'general-balance-pending': 'Total Geral a Receber',
    'general-balance-zero': 'Tudo Pago / Zerado',
    'settings-halfdays-title': 'Meio Período padrão',
    'settings-halfdays-desc': 'Defina os dias da semana em que Você trabalha meio Período fixo e qual o Período padrão (Manhàou Noite).',
    'btn-save-halfdays': 'Salvar Meio Período'
  },
  'it-IT': {
    // Sidebar
    'nav-dashboard': 'Dashboard',
    'nav-calendar': 'Calendario',
    'nav-payments': 'Pagamenti',
    'nav-history': 'Cronologia',
    'nav-settings': 'Impostazioni',
    'sidebar-version': 'Versione:',
    'sidebar-updated': 'Aggiornato:',
    
    // Header
    'header-dashboard-title': 'Dashboard',
    'header-dashboard-subtitle': 'Panoramica del tuo lavoro e delle tue finanze.',
    'header-calendar-title': 'Calendario',
    'header-calendar-subtitle': 'Visualizza il mese di lavoro e configura i turni cliccando sui giorni.',
    'header-payments-title': 'Pagamenti',
    'header-payments-subtitle': 'Seleziona i cicli settimanali per registrare incassi totali o parziali.',
    'header-history-title': 'Cronologia',
    'header-history-subtitle': 'Registro completo dei pagamenti e delle pendenze completate.',
    'header-settings-title': 'Impostazioni',
    'header-settings-subtitle': 'Regolazioni del sistema, esportazione dati e tariffe standard.',

    // Dashboard
    'stat-total-accumulated': 'Totale Accumulato',
    'stat-total-received': 'Totale Ricevuto',
    'stat-total-pending': 'Totale Pendente',
    'stat-this-week': 'Questa Settimana',
    'chart-title': 'Guadagni vs. Incassi per Mese',
    'quick-actions-title': 'Azioni Rapide',
    'quick-actions-desc': 'Registra rapidamente il tuo turno per oggi',
    'btn-morning-shift': 'Turno Mattina',
    'btn-night-shift': 'Turno Sera',
    'btn-both-shifts': 'Entrambi i Turni',
    'btn-off-day': 'Giorno di Riposo',
    'rate-default': 'Valore standard:',
    'log-rest': 'Registra riposo',

    // Calendar
    'btn-batch-launch': 'Inserimento Multiplo',
    'btn-batch-remove': 'Rimozione Multipla',
    'btn-today': 'Oggi',
    'legend-paid': 'Pagato',
    'legend-partial': 'Parzialmente Pagato',
    'legend-pending': 'Pendente',
    'legend-off': 'Riposo',
    'legend-morning': 'Mattina',
    'legend-night': 'Sera',
    'legend-both': 'Entrambi',

    // Payments
    'work-cycles-title': 'Cicli di Lavoro Settimanali',
    'work-cycles-desc': 'Seleziona le settimane che desideri includere nel pagamento.',
    'register-receipt-title': 'Registra Incasso',
    'summary-selected-weeks': 'Settimane Selezionate:',
    'summary-selected-days': 'Totale Giorni Selezionati:',
    'summary-total-due': 'Totale Dovuto:',
    'summary-already-paid': 'Saldo Pendente nelle Selezionate:',
    'summary-to-pay': 'Da Pagare:',
    'label-received-amount': 'Importo Ricevuto (€)',
    'label-payment-date': 'Data di Incasso',
    'label-payment-method': 'Metodo di Pagamento',
    'label-notes': 'Specifiche / Note',
    'btn-confirm-receipt': 'Conferma Incasso',
    'opt-cash': 'Contanti',
    'opt-deposit': 'Deposito',
    'opt-others': 'Altro (Specificare)',
    'week-to': 'a',
    'week-days': 'giorni',
    'week-day': 'giorno',

    // History
    'payment-history-title': 'Cronologia dei Pagamenti Effettuati',
    'th-date': 'Data Incasso',
    'th-amount': 'Importo Pagato',
    'th-period': 'Periodo Coperto',
    'th-status': 'Stato / Pendenza',
    'th-notes': 'Note',
    'th-actions': 'Azioni',
    'btn-refund': 'Storna',
    'status-processed': 'Elaborato',

    // Settings
    'settings-rates-title': 'Configurazione Tariffe',
    'settings-rates-desc': 'Definisci i valori standard per ogni periodo lavorato. I nuovi giorni useranno queste tariffe.',
    'label-morning-rate': 'Valore Periodo Mattina (€)',
    'label-night-rate': 'Valore Periodo Sera (€)',
    'btn-save-rates': 'Salva Tariffe',
    'settings-offdays-title': 'Riposo Settimanale Standard',
    'settings-offdays-desc': 'Seleziona i giorni della settimana che sono i tuoi riposi standard.',
    'btn-save-offdays': 'Salva Riposi',
    'settings-backup-title': 'Backup e Ripristino',
    'settings-backup-desc': 'Esporta i tuoi dati per sicurezza o importa il file JSON su un altro dispositivo.',
    'btn-export': 'Esporta Dati (JSON)',
    'btn-import': 'Importa Dati (JSON)',
    'danger-zone': 'Zona di Pericolo',
    'danger-zone-desc': 'Questa azione eliminerÃƒÂ  permanentemente tutti i record di giorni lavorati e pagamenti.',
    'btn-clear-all': 'Cancella Tutta la Cronologia',
    'label-language': 'Lingua del Sistema',

    // Modals
    'modal-period-label': 'Seleziona il Periodo Lavorato',
    'modal-custom-rate': 'Valore Personalizzato per questo Giorno (€)',
    'modal-notes-label': 'Note',
    'modal-fin-info': 'Informazioni Finanziarie del Giorno',
    'modal-status': 'Stato:',
    'modal-received': 'Importo GiÃƒÂ  Ricevuto:',
    'modal-pending': 'Saldo Debitore:',
    'btn-delete': 'Elimina',
    'btn-save-record': 'Salva Record',
    'batch-title': 'Inserimento Multiplo',
    'batch-start': 'Data Iniziale',
    'batch-end': 'Data Finale',
    'batch-default-period': 'Periodo Standard per Giorni Lavorativi',
    'batch-offday-note': 'Nota: I giorni di riposo settimanale configurati saranno pre-marcati come "Riposo" automaticamente.',
    'batch-customize-title': 'Personalizza Giorni dell\'Intervallo',
    'btn-cancel': 'Annulla',
    'btn-save-batch': 'Salva Blocco Giorni',
    'batch-remove-title': 'Rimozione Multipla',
    'batch-remove-select': 'Seleziona Giorni da Rimuovere',
    'btn-confirm-remove': 'Conferma Rimozione',

    // Days & Months
    'day-0': 'Domenica',
    'day-1': 'LunedÃƒÂ¬',
    'day-2': 'MartedÃƒÂ¬',
    'day-3': 'MercoledÃƒÂ¬',
    'day-4': 'GiovedÃƒÂ¬',
    'day-5': 'VenerdÃƒÂ¬',
    'day-6': 'Sabato',
    'short-day-0': 'Dom',
    'short-day-1': 'Lun',
    'short-day-2': 'Mar',
    'short-day-3': 'Mer',
    'short-day-4': 'Gio',
    'short-day-5': 'Ven',
    'short-day-6': 'Sab',
    'month-0': 'Gennaio',
    'month-1': 'Febbraio',
    'month-2': 'Marzo',
    'month-3': 'Aprile',
    'month-4': 'Maggio',
    'month-5': 'Giugno',
    'month-6': 'Luglio',
    'month-7': 'Agosto',
    'month-8': 'Settembre',
    'month-9': 'Ottobre',
    'month-10': 'Novembre',
    'month-11': 'Dicembre',

    // Alerts & Messages
    'msg-save-success': 'Salvato con successo!',
    'msg-delete-confirm': 'Sei sicuro di voler eliminare?',
    'msg-backup-success': 'Backup importado con successo!',
    'msg-invalid-file': 'File non valido!',
    'msg-select-period': 'Per favore, seleziona un periodo.',
    'msg-payment-success': 'Pagamento registrato con successo!',
    'msg-undo-confirm': 'Sei sicuro di voler stornare questo pagamento?',
    'msg-undo-success': 'Pagamento stornato con successo!',
    'msg-clear-confirm': 'ATTENZIONE: Perderai permanentemente tutti i record. Vuoi procedere?',
    'msg-batch-save-success': 'record giornalieri salvati/aggiornati con sucesso!',
    'msg-batch-remove-success': 'record giornalieri rimossi con sucesso!',
    'msg-all-pending': 'Tutte con Pendenza',
    'msg-no-days': 'Nessun giorno di lavoro registrato per elaborare i pagamenti.',
    'msg-no-history': 'Nessun registro di pagamento ricevuto nella cronologia.',
    'msg-no-batch-days': 'Seleziona le date di inizio e fine per visualizzare e personalizzare i giorni.',
    'msg-no-remove-days': 'Seleziona le date di inizio e fine per visualizzare i giorni con i record.',
    'opt-mixed': 'Misto (Contanti + Deposito)',
    'label-cash-amount': 'Importo in Contanti (€)',
    'label-deposit-amount': 'Importo in Deposito (€)',
    'msg-invalid-mixed-sum': 'La somma degli importi in contanti e deposito deve essere uguale all\'importo totale ricevuto!',
    'stat-total-credit': 'Credito Anticipato',
    'general-balance-title': 'Saldo Generale Consolidato',
    'general-balance-credit': 'Credito Disponibile (Anticipo)',
    'general-balance-pending': 'Totale Generale da Ricevere',
    'general-balance-zero': 'Tutto Pagato / Bilancio Zero',
    'settings-halfdays-title': 'Mezza Giornata Standard',
    'settings-halfdays-desc': 'Definisci i giorni della settimana in cui lavori mezza giornata fissa e il periodo standard (Mattina o Sera).',
    'btn-save-halfdays': 'Salva Mezza Giornata'
    }
    };

let db = null;
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-indexed (0 = Jan, 11 = Dez)
let earningsChart = null;
let selectedWeeks = []; // Lista de chaves de semana selecionadas ('YYYY-MM-DD_YYYY-MM-DD')
const MONTH_NAMES = [];
const WEEKDAY_NAMES = [];

/* ==========================================================================
   INICIALIZAÇÃO DA APLICAÇÃO
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  renderAppVersion();
  initNavigation();
  initCurrentDate();

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
        const totalAmount = parseFloat(paymentAmountInput.value) || 0;
        document.getElementById('input-payment-cash-amount').value = (totalAmount / 2).toFixed(2);
        document.getElementById('input-payment-deposit-amount').value = (totalAmount - (totalAmount / 2)).toFixed(2);
      }
    });
  }

  // Permite valores assimétricos calculando a contrapartida dinamicamente
  if (inputCash && inputDeposit && paymentAmountInput) {
    inputCash.addEventListener('input', () => {
      const total = parseFloat(paymentAmountInput.value) || 0;
      const cash = parseFloat(inputCash.value) || 0;
      inputDeposit.value = Math.max(0, total - cash).toFixed(2);
    });
    inputDeposit.addEventListener('input', () => {
      const total = parseFloat(paymentAmountInput.value) || 0;
      const deposit = parseFloat(inputDeposit.value) || 0;
      inputCash.value = Math.max(0, total - deposit).toFixed(2);
    });
  }
});

// Inicializa o banco de dados carregando do Firebase ou localStorage
async function initDatabase() {
  // Tenta carregar do Firebase primeiro se estiver autenticado
  if (database && auth.currentUser) {
    try {
      const dbRef = ref(database, 'fluxoTurnoDB');
      const snapshot = await get(dbRef);
      const cloudData = snapshot.val();
      if (cloudData) {
        db = cloudData;
        console.log("Dados carregados do Firebase com sucesso.");
      } else {
        loadFromLocalStorage();
        await saveToStorage(); // Sincroniza o local inicial para o cloud novo
      }
    } catch (e) {
      console.error("Erro ao carregar do Firebase, tentando local...", e);
      loadFromLocalStorage();
    }
  } else {
    loadFromLocalStorage();
  }

  // Garantir estruturas básicas e retrocompatibilidade
  if (!db.settings) {
    db.settings = { ...DEFAULT_DB.settings };
  } else {
    if (!db.settings.offDays) db.settings.offDays = [4];
    if (!db.settings.halfDays) db.settings.halfDays = {};
    if (!db.settings.language) db.settings.language = 'pt-BR';
    if (db.settings.morningRate === 80) db.settings.morningRate = 35;
    if (db.settings.nightRate === 100) db.settings.nightRate = 25;
  }
  if (!db.workedDays) db.workedDays = {};
  if (!db.payments) db.payments = [];
  
  db.payments.forEach(pay => {
    if (pay.advanceRemaining === undefined) {
      pay.advanceRemaining = 0;
    }
  });
  
  // Após carregar, se estivermos na UI principal, renderizamos tudo
  if (typeof renderCalendar === 'function') {
    renderAll();
  }
}

function loadFromLocalStorage() {
  const stored = localStorage.getItem(DB_STORAGE_KEY);
  if (stored) {
    try {
      db = JSON.parse(stored);
    } catch (e) {
      console.error("Erro ao ler banco de dados local.", e);
      db = JSON.parse(JSON.stringify(DEFAULT_DB));
    }
  } else {
    db = JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}

// Salva o estado atual no localStorage e no Firebase
async function saveToStorage() {
  // Salva Localmente
  localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(db));
  
  // Salva na Nuvem (Firebase) se estiver autenticado
  if (database && auth.currentUser) {
    try {
      await set(ref(database, 'fluxoTurnoDB'), db);
    } catch (e) {
      console.error("Erro ao salvar no Firebase:", e);
    }
  }
}

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

// Aplica as Traduções baseadas no idioma atual
function applyLanguage() {
  const lang = db.settings.language || 'pt-BR';
  const texts = translations[lang];
  
  // Traduz elementos com atributo data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (texts[key]) {
      el.innerText = texts[key];
    }
  });

  // Atualizar nomes dos meses e dias da semana globais
  MONTH_NAMES.length = 0;
  for (let i = 0; i < 12; i++) MONTH_NAMES.push(texts[`month-${i}`]);
  
  WEEKDAY_NAMES.length = 0;
  for (let i = 0; i < 7; i++) WEEKDAY_NAMES.push(texts[`day-${i}`]);

  // Atualiza o Calendário se estiver visível
  if (document.getElementById('section-calendar').classList.contains('active')) {
    renderCalendar();
  }
  
  // Atualiza labels de tarifas
  updateRateLabels();
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
  const lang = (db && db.settings && db.settings.language === 'it-IT') ? 'it-IT' : 'pt-BR';
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

  document.getElementById('quick-rate-morning').innerText = `${texts['rate-default']} ${formatCurrency(morning)}`;
  document.getElementById('quick-rate-night').innerText = `${texts['rate-default']} ${formatCurrency(night)}`;
  document.getElementById('quick-rate-both').innerText = `${texts['rate-default']} ${formatCurrency(both)}`;

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
  }
}

/* ==========================================================================
   FORMATADORES E AUXILIARES
   ========================================================================== */

function formatCurrency(value) {
  const lang = db.settings.language === 'it-IT' ? 'it-IT' : 'pt-BR';
  return new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR' }).format(value);
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

function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
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

// Aplica Créditos de adiantamento disponíveis a um dia trabalhado que tenha saldo pendente
function applyAdvanceCreditsToDay(day) {
  if (day.period === 'none' || day.period === 'off') return;
  
  day.pendingAmount = Math.max(0, day.rate - (day.amountPaid || 0));
  if (day.pendingAmount <= 0) return;
  
  // Encontra pagamentos com adiantamento Disponível, ordenados por data ascendente (mais antigos primeiro)
  const paymentsWithAdvance = db.payments
    .filter(p => (p.advanceRemaining || 0) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
    
  for (const pay of paymentsWithAdvance) {
    if (day.pendingAmount <= 0) break;
    
    const apply = Math.min(pay.advanceRemaining, day.pendingAmount);
    
    day.amountPaid = (day.amountPaid || 0) + apply;
    day.pendingAmount -= apply;
    day.status = day.pendingAmount <= 0 ? 'paid' : 'partial';
    
    if (!day.paymentsApplied) day.paymentsApplied = {};
    day.paymentsApplied[pay.id] = (day.paymentsApplied[pay.id] || 0) + apply;
    
    if (!pay.coveredDays) pay.coveredDays = [];
    if (!pay.coveredDays.includes(day.date)) {
      pay.coveredDays.push(day.date);
    }
    
    pay.advanceRemaining -= apply;
  }
}

// Reembolsa valores pagos com adiantamento/Crédito de volta para os pagamentos de origem se a tarifa do dia for reduzida ou o dia for deletado
function refundPaymentCreditsFromDay(day, newRate) {
  if (!day.paymentsApplied || Object.keys(day.paymentsApplied).length === 0) return;
  
  let refundNeeded = day.amountPaid - newRate;
  if (refundNeeded <= 0) return;
  
  const paymentIds = Object.keys(day.paymentsApplied);
  
  for (const payId of paymentIds) {
    if (refundNeeded <= 0) break;
    
    const appliedAmount = day.paymentsApplied[payId];
    if (appliedAmount <= 0) continue;
    
    const refund = Math.min(refundNeeded, appliedAmount);
    
    const pay = db.payments.find(p => p.id === payId);
    if (pay) {
      pay.advanceRemaining = (pay.advanceRemaining || 0) + refund;
      
      day.amountPaid -= refund;
      day.paymentsApplied[payId] -= refund;
      if (day.paymentsApplied[payId] <= 0) {
        delete day.paymentsApplied[payId];
        if (pay.coveredDays) {
          pay.coveredDays = pay.coveredDays.filter(d => d !== day.date);
        }
      }
      
      refundNeeded -= refund;
    }
  }
  
  day.pendingAmount = Math.max(0, newRate - day.amountPaid);
  day.status = day.amountPaid >= newRate ? 'paid' : (day.amountPaid > 0 ? 'partial' : 'unpaid');
}

/* ==========================================================================
   ABA 1: DASHBOARD DE ESTATÃƒÂSTICAS
   ========================================================================== */

function initDashboard() {
  updateDashboardData();
}

function updateDashboardData() {
  if (!db) return; // Segurança contra carga incompleta
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
    
    // Desconsidera dias sem Período ou folga do cálculo financeiro
    if (dayData.period !== 'none' && dayData.period !== 'off') {
      const rate = dayData.rate || 0;
      totalEarnings += rate;
      
      const paid = dayData.amountPaid || 0;
      totalPending += (rate - paid);

      // Soma para os ganhos da semana atual
      if (dateStr >= currentWeek.mondayStr && dateStr <= currentWeek.sundayStr) {
        thisWeekEarnings += rate;
      }
    }
  });

  // Total Recebido é a soma real de todos os pagamentos efetuados
  totalReceived = db.payments.reduce((acc, pay) => acc + pay.amount, 0);

  // Total de adiantamento/Crédito ativo nos pagamentos
  const totalAdvance = db.payments.reduce((acc, pay) => acc + (pay.advanceRemaining || 0), 0);

  // Atualiza os elementos da tela
  document.getElementById('stat-total-earnings').innerText = formatCurrency(totalEarnings);
  document.getElementById('stat-total-received').innerText = formatCurrency(totalReceived);
  document.getElementById('stat-this-week-earnings').innerText = formatCurrency(thisWeekEarnings);

  // Atualização dinÃƒÂ¢mica do Card de Pendente / Crédito
  const pendingCard = document.querySelector('.stat-card.stat-pending');
  if (pendingCard) {
    const pendingTitle = pendingCard.querySelector('p');
    const pendingValue = document.getElementById('stat-total-pending');
    const pendingIcon = pendingCard.querySelector('.stat-icon');
    const texts = translations[db.settings.language || 'pt-BR'];

    if (totalAdvance > 0) {
      // Transforma em card de Crédito
      pendingCard.style.borderLeft = '4px solid var(--accent-purple)';
      pendingCard.classList.add('stat-credit-active');
      if (pendingTitle) pendingTitle.innerText = texts['stat-total-credit'] || 'Crédito Antecipado';
      if (pendingValue) {
        pendingValue.innerText = formatCurrency(totalAdvance);
        pendingValue.style.color = 'var(--accent-purple)';
      }
      if (pendingIcon) pendingIcon.innerHTML = `<i data-lucide="coins"></i>`;
    } else {
      // Volta a ser card de Pendente
      pendingCard.style.borderLeft = '';
      pendingCard.classList.remove('stat-credit-active');
      if (pendingTitle) pendingTitle.innerText = texts['stat-total-pending'] || 'Total Pendente';
      if (pendingValue) {
        pendingValue.innerText = formatCurrency(totalPending);
        pendingValue.style.color = '';
      }
      if (pendingIcon) pendingIcon.innerHTML = `<i data-lucide="alert-circle"></i>`;
    }
    
    // Atualiza os ícones Lucide no card recém-modificado
    lucide.createIcons();
  }

  // Atualiza gráfico
  renderEarningsChart();
}

// Cria/Atualiza o gráfico dinÃƒÂ¢mico
function renderEarningsChart() {
  if (!db) return; // Segurança contra carga incompleta
  const ctx = document.getElementById('earningsChart').getContext('2d');
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
          label: texts['nav-history'],
          data: earnedValues,
          backgroundColor: 'rgba(139, 92, 246, 0.65)',
          borderColor: 'rgb(139, 92, 246)',
          borderWidth: 1,
          borderRadius: 6
        },
        {
          label: texts['stat-total-received'],
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

// ação rápida para registrar turno no dia de hoje
function quickLogShift(period) {
  const todayStr = formatDateISO(new Date());
  let rate = 0;
  const texts = translations[db.settings.language || 'pt-BR'];
  
  if (period === 'morning') rate = db.settings.morningRate;
  else if (period === 'night') rate = db.settings.nightRate;
  else if (period === 'both') rate = db.settings.morningRate + db.settings.nightRate;
  
  // Se o dia Já tiver registro financeiro de pagamento, mantém o valor pago e atualiza
  const existing = db.workedDays[todayStr] || {
    amountPaid: 0,
    paymentsApplied: {}
  };

  // Se o novo rate for menor que o amountPaid Já registrado, devolvemos
  if (existing.amountPaid > rate) {
    refundPaymentCreditsFromDay(existing, rate);
  }

  const newDay = {
    date: todayStr,
    period: period,
    rate: rate,
    status: existing.amountPaid >= rate ? 'paid' : (existing.amountPaid > 0 ? 'partial' : 'unpaid'),
    amountPaid: existing.amountPaid || 0,
    pendingAmount: Math.max(0, rate - (existing.amountPaid || 0)),
    notes: existing.notes || 'Registrado via ação Rápida',
    paymentsApplied: existing.paymentsApplied || {}
  };

  // Aplica Créditos de adiantamento, se houver
  applyAdvanceCreditsToDay(newDay);

  db.workedDays[todayStr] = newDay;
  saveToStorage();
  updateDashboardData();
  
  const periodLabel = texts[`btn-${period === 'both' ? 'both-shifts' : period === 'off' ? 'off-day' : period + '-shift'}`];
  alert(`${periodLabel} - ${texts['msg-save-success']}`);
}

/* ==========================================================================
   ABA 2: CALENDÃƒÂRIO MENSAL INTERATIVO
   ========================================================================== */

function renderCalendar() {
  const texts = translations[db.settings.language || 'pt-BR'];
  const monthYearLabel = document.getElementById('calendar-month-year');
  monthYearLabel.innerText = `${MONTH_NAMES[currentMonth]} ${currentYear}`;

  const grid = document.getElementById('calendar-days-grid');
  grid.innerHTML = ''; 

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
    createDayElement(dayNum, dateStr, true, grid);
  }

  for (let i = 1; i <= lastDay; i++) {
    const dateStr = formatDateISO(new Date(currentYear, currentMonth, i));
    createDayElement(i, dateStr, false, grid);
  }

  const totalCells = grid.children.length - 7;
  const remainingCells = 42 - totalCells; 
  
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

    if (data.period !== 'off') {
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
    }
    
    detailsContainer.appendChild(badge);

    if (data.period !== 'off') {
      const valDiv = document.createElement('div');
      valDiv.className = 'day-value';
      if (data.status === 'partial') {
        valDiv.innerHTML = `<span>${formatCurrency(data.amountPaid)}</span><span class="day-pending-value">(-${formatCurrency(data.pendingAmount)})</span>`;
      } else {
        valDiv.innerText = formatCurrency(data.rate);
      }
      detailsContainer.appendChild(valDiv);
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
  if (period === 'both') return db.settings.morningRate + db.settings.nightRate;
  return 0;
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

  const customRateVal = parseFloat(document.getElementById('modal-custom-rate').value);
  const notesVal = document.getElementById('modal-notes').value;
  let rate = getStandardRateForPeriod(selectedPeriod);
  if (!isNaN(customRateVal) && selectedPeriod !== 'off' && selectedPeriod !== 'none') rate = customRateVal;

  const existing = db.workedDays[dateStr] || { amountPaid: 0, paymentsApplied: {} };

  // Se o novo rate for menor que o amountPaid Já registrado (ou se mudou para off/none), devolvemos
  if (existing.amountPaid > rate) {
    refundPaymentCreditsFromDay(existing, rate);
  }

  const amountPaid = existing.amountPaid || 0;
  const pendingAmount = Math.max(0, rate - amountPaid);
  let status = amountPaid >= rate ? 'paid' : (amountPaid > 0 ? 'partial' : 'unpaid');

  const newDay = {
    date: dateStr, period: selectedPeriod, rate: rate, status: status,
    amountPaid: amountPaid, pendingAmount: pendingAmount, notes: notesVal,
    paymentsApplied: existing.paymentsApplied || {}
  };

  // Aplica Créditos de adiantamento, se houver
  applyAdvanceCreditsToDay(newDay);

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
    refundPaymentCreditsFromDay(data, 0);
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
    if (dayData.period !== 'none' && dayData.period !== 'off') {
      const weekInfo = getWeekRange(dateStr);
      const weekKey = weekInfo.key;
      if (!weeksMap[weekKey]) {
        weeksMap[weekKey] = {
          key: weekKey, label: weekInfo.label, mondayISO: weekInfo.mondayStr,
          days: [], totalDue: 0, totalPaid: 0, totalPending: 0
        };
      }
      weeksMap[weekKey].days.push(dayData);
      weeksMap[weekKey].totalDue += dayData.rate;
      weeksMap[weekKey].totalPaid += dayData.amountPaid || 0;
      weeksMap[weekKey].totalPending += dayData.pendingAmount || 0;
    }
  });

  const sortedWeeks = Object.values(weeksMap).sort((a, b) => b.mondayISO.localeCompare(a.mondayISO));
  if (sortedWeeks.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem;">${texts['msg-no-days']}</div>`;
    return;
  }

  sortedWeeks.forEach(week => {
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
      if (dayData.period !== 'none' && dayData.period !== 'off') {
        generalPending += (dayData.pendingAmount || 0);
      }
    });
    
    const generalAdvance = db.payments.reduce((acc, pay) => acc + (pay.advanceRemaining || 0), 0);
    
    if (generalAdvance > 0) {
      balanceBox.style.border = '1px solid var(--accent-purple)';
      balanceBox.style.background = 'var(--accent-purple-glow)';
      if (balanceLabel) balanceLabel.innerText = texts['general-balance-credit'] || 'Crédito Disponível (Adiantado)';
      if (balanceValue) {
        balanceValue.innerText = formatCurrency(generalAdvance);
        balanceValue.style.color = 'var(--accent-purple)';
      }
      if (balanceIcon) balanceIcon.outerHTML = `<i id="general-balance-icon" data-lucide="coins" style="width: 16px; height: 16px; color: var(--accent-purple);"></i>`;
    } else if (generalPending > 0) {
      balanceBox.style.border = '1px solid var(--status-unpaid)';
      balanceBox.style.background = 'var(--status-unpaid-glow)';
      if (balanceLabel) balanceLabel.innerText = texts['general-balance-pending'] || 'Total Geral a Receber';
      if (balanceValue) {
        balanceValue.innerText = formatCurrency(generalPending);
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
  Object.keys(db.workedDays).forEach(dateStr => {
    const dayData = db.workedDays[dateStr];
    if (dayData.period !== 'none' && dayData.period !== 'off') {
      dbTotalDays++; dbTotalDue += dayData.rate;
      dbTotalPaid += dayData.amountPaid || 0; dbTotalPending += dayData.pendingAmount || 0;
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
  Object.keys(db.workedDays).forEach(dateStr => {
    const dayData = db.workedDays[dateStr];
    if (dayData.period !== 'none' && dayData.period !== 'off') {
      const weekInfo = getWeekRange(dateStr);
      if (selectedWeeks.includes(weekInfo.key)) {
        totalDays++; totalDue += dayData.rate;
        totalPaid += dayData.amountPaid || 0; totalPending += dayData.pendingAmount || 0;
      }
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
    const totalAmount = parseFloat(document.getElementById('input-payment-amount').value) || 0;
    document.getElementById('input-payment-cash-amount').value = (totalAmount / 2).toFixed(2);
    document.getElementById('input-payment-deposit-amount').value = (totalAmount - (totalAmount / 2)).toFixed(2);
  } else {
    customNotesGroup.style.display = 'none';
    mixedAmountsGroup.style.display = 'none';
    document.getElementById('input-payment-notes').value = '';
    document.getElementById('input-payment-cash-amount').value = '';
    document.getElementById('input-payment-deposit-amount').value = '';
  }
}

function processPayment(event) {
  event.preventDefault();
  const texts = translations[db.settings.language || 'pt-BR'];
  const paymentAmount = parseFloat(document.getElementById('input-payment-amount').value);
  const paymentDate = document.getElementById('input-payment-date').value;
  const paymentMethod = document.getElementById('input-payment-method').value;
  
  if (isNaN(paymentAmount) || paymentAmount <= 0) return;

  let paymentNotes = '';
  let cashAmount = 0;
  let depositAmount = 0;

  if (paymentMethod === 'Outros') {
    paymentNotes = document.getElementById('input-payment-notes').value || texts['opt-others'];
  } else if (paymentMethod === 'Misto') {
    cashAmount = parseFloat(document.getElementById('input-payment-cash-amount').value) || 0;
    depositAmount = parseFloat(document.getElementById('input-payment-deposit-amount').value) || 0;
    
    // Validação da soma (tolerÃƒÂ¢ncia a ponto flutuante de 0.01)
    if (Math.abs((cashAmount + depositAmount) - paymentAmount) > 0.01) {
      alert(texts['msg-invalid-mixed-sum'] || 'A soma dos valores em dinheiro e depósito deve ser igual ao valor total recebido!');
      return;
    }
    
    // Constrói notas descritivas
    paymentNotes = `${texts['opt-cash']}: ${formatCurrency(cashAmount)} / ${texts['opt-deposit']}: ${formatCurrency(depositAmount)}`;
  } else {
    paymentNotes = texts['opt-' + paymentMethod.toLowerCase().replace('é', 'e')] || paymentMethod;
  }

  const daysToPay = [], otherDaysToPay = [];
  Object.keys(db.workedDays).forEach(dateStr => {
    const dayData = db.workedDays[dateStr];
    if (dayData.period !== 'none' && dayData.period !== 'off' && dayData.pendingAmount > 0) {
      if (selectedWeeks.length === 0) {
        daysToPay.push(dayData);
      } else {
        const weekInfo = getWeekRange(dateStr);
        if (selectedWeeks.includes(weekInfo.key)) {
          daysToPay.push(dayData);
        } else {
          otherDaysToPay.push(dayData);
        }
      }
    }
  });

  daysToPay.sort((a, b) => a.date.localeCompare(b.date));
  otherDaysToPay.sort((a, b) => a.date.localeCompare(b.date));

  const paymentId = 'pay_' + Date.now();
  let remaining = paymentAmount;
  const covered = [];

  [...daysToPay, ...otherDaysToPay].forEach(day => {
    if (remaining <= 0) return;
    const apply = Math.min(remaining, day.pendingAmount);
    day.amountPaid = (day.amountPaid || 0) + apply;
    day.pendingAmount -= apply;
    day.status = day.pendingAmount <= 0 ? 'paid' : 'partial';
    if (!day.paymentsApplied) day.paymentsApplied = {};
    day.paymentsApplied[paymentId] = (day.paymentsApplied[paymentId] || 0) + apply;
    covered.push(day.date);
    remaining -= apply;
  });

  // O excedente é salvo no atributo advanceRemaining do pagamento
  db.payments.push({
    id: paymentId,
    date: paymentDate,
    amount: paymentAmount,
    coveredDays: covered,
    notes: paymentNotes,
    advanceRemaining: remaining
  });

  saveToStorage();
  
  // Limpa campos adicionais de Misto
  const inputCash = document.getElementById('input-payment-cash-amount');
  const inputDeposit = document.getElementById('input-payment-deposit-amount');
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
  tableBody.innerHTML = '';
  const sorted = [...db.payments].sort((a, b) => b.date.localeCompare(a.date));

  if (sorted.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 3rem;">${texts['msg-no-history']}</td></tr>`;
    return;
  }

  sorted.forEach(pay => {
    const tr = document.createElement('tr');
    let periodText = '...';
    if (pay.coveredDays && pay.coveredDays.length > 0) {
      const dates = [...pay.coveredDays].sort((a, b) => a.localeCompare(b));
      periodText = dates.length === 1 ? formatDateStringDisplay(dates[0]) : `${formatDateStringDisplay(dates[0])} ${texts['week-to']} ${formatDateStringDisplay(dates[dates.length-1])} (${dates.length} ${texts['week-days']})`;
    }

    const hasAdvance = pay.advanceRemaining > 0;
    const advanceBadge = hasAdvance ? `<div style="font-size:0.75rem; color: var(--accent-purple); font-weight:600; margin-top: 2px;"><i data-lucide="coins" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right: 2px;"></i>Crédito: ${formatCurrency(pay.advanceRemaining)}</div>` : '';

    tr.innerHTML = `
      <td>${formatDateStringDisplay(pay.date)}</td>
      <td style="color: var(--status-paid); font-weight: 700;">
        ${formatCurrency(pay.amount)}
        ${advanceBadge}
      </td>
      <td>${periodText}</td>
      <td><span class="history-pending-tag"><i data-lucide="check"></i> ${texts['status-processed']}</span></td>
      <td>${pay.notes || '-'}</td>
      <td><button class="btn-danger" onclick="deletePayment('${pay.id}')">${texts['btn-refund']}</button></td>
    `;
    tableBody.appendChild(tr);
  });
  lucide.createIcons();
}

function deletePayment(id) {
  const texts = translations[db.settings.language || 'pt-BR'];
  if (!confirm(texts['msg-undo-confirm'])) return;
  const idx = db.payments.findIndex(p => p.id === id);
  if (idx === -1) return;
  const pay = db.payments[idx];
  pay.coveredDays.forEach(date => {
    const day = db.workedDays[date];
    if (day && day.paymentsApplied && day.paymentsApplied[id]) {
      const amt = day.paymentsApplied[id];
      day.amountPaid -= amt; day.pendingAmount += amt;
      delete day.paymentsApplied[id];
      day.status = day.amountPaid === 0 ? 'unpaid' : 'partial';
    }
  });
  db.payments.splice(idx, 1);
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
}

function toggleHalfDaySelect(dayIndex) {
  const chk = document.getElementById(`halfday-active-${dayIndex}`);
  const sel = document.getElementById(`halfday-period-${dayIndex}`);
  if (chk && sel) {
    sel.disabled = !chk.checked;
  }
}

function saveHalfDaysSettings(event) {
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
  saveToStorage();
  alert(translations[db.settings.language]['msg-save-success']);
}

function saveOffDaysSettings(event) {
  event.preventDefault();
  const offDays = [];
  for (let i = 0; i <= 6; i++) {
    const chk = document.getElementById(`offday-${i}`);
    if (chk && chk.checked) offDays.push(parseInt(chk.value, 10));
  }
  db.settings.offDays = offDays;
  saveToStorage(); renderCalendar();
  alert(translations[db.settings.language]['msg-save-success']);
}

function saveRatesSettings(event) {
  event.preventDefault();
  db.settings.morningRate = parseFloat(document.getElementById('setting-morning-rate').value);
  db.settings.nightRate = parseFloat(document.getElementById('setting-night-rate').value);
  saveToStorage(); updateRateLabels();
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
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed.settings && parsed.workedDays) {
        db = parsed; saveToStorage(); applyLanguage();
        alert(translations[db.settings.language]['msg-backup-success']);
        document.querySelector('[data-tab="dashboard"]').click();
      }
    } catch (err) { alert("Error!"); }
  };
  reader.readAsText(file);
}

function clearDatabase() {
  if (confirm(translations[db.settings.language]['msg-clear-confirm'])) {
    db = JSON.parse(JSON.stringify(DEFAULT_DB));
    saveToStorage(); applyLanguage(); loadSettingsFields();
    document.querySelector('[data-tab="dashboard"]').click();
  }
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
  if (select.value === 'off') { input.value = ''; input.disabled = true; }
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
  rows.forEach(row => {
    const date = row.getAttribute('data-date');
    const select = row.querySelector('.batch-day-period-select');
    const input = row.querySelector('.batch-day-rate-input');
    
    if (select && input) {
      const period = select.value;
      const rateVal = parseFloat(input.value);
      const rate = isNaN(rateVal) ? getStandardRateForPeriod(period) : rateVal;
      const existing = db.workedDays[date] || { amountPaid: 0, paymentsApplied: {} };
      
      // Se o novo rate for menor que o amountPaid Já registrado, devolvemos
      if (existing.amountPaid > rate) {
        refundPaymentCreditsFromDay(existing, rate);
      }
      
      const amountPaid = existing.amountPaid || 0;
      const pendingAmount = Math.max(0, rate - amountPaid);
      const status = amountPaid >= rate ? 'paid' : (amountPaid > 0 ? 'partial' : 'unpaid');
      
      const newDay = {
        date: date,
        period: period,
        rate: rate,
        amountPaid: amountPaid,
        pendingAmount: pendingAmount,
        status: status,
        notes: 'Lote',
        paymentsApplied: existing.paymentsApplied || {}
      };
      
      // Aplica Créditos de adiantamento, se houver
      applyAdvanceCreditsToDay(newDay);
      
      db.workedDays[date] = newDay;
    }
  });
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
        refundPaymentCreditsFromDay(day, 0);
      }
      delete db.workedDays[date];
    }
  });
  saveToStorage(); closeBatchRemoveModal(); renderCalendar(); updateDashboardData();
  alert(texts['msg-batch-remove-success']);
}

async function handleLogout() {
  if (confirm("Deseja realmente sair?")) {
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
window.setLanguage = setLanguage;
window.saveRatesSettings = saveRatesSettings;
window.saveOffDaysSettings = saveOffDaysSettings;
window.saveHalfDaysSettings = saveHalfDaysSettings;
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
window.refundPaymentCreditsFromDay = refundPaymentCreditsFromDay;
window.deletePayment = deletePayment;
window.openDayModal = openDayModal;











penDayModal = openDayModal;











