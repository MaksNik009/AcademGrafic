/* ══════════════════════════════════════════════════
   АКАДЕМГРАФИК — app.js v4
   BASE: v3 (все существующие функции сохранены)
   NEW:
     ★ Государственные праздники РФ (auto-skip)
     ★ Role switcher: Admin / Teacher
     ★ Teacher cabinet: My duties + blackout dates
     ★ Replace-request (оранжевая подсветка)
     ★ Notifications bell
     ★ Mobile accordion calendar
     ★ Add/Edit teacher via modal popup
     ★ Auto-distribution учитывает праздники + blackouts
   ══════════════════════════════════════════════════ */

// ─── ГОСУДАРСТВЕННЫЕ ПРАЗДНИКИ РФ ────────────────────────────────────────────
// Ключ "MM-DD" — ежегодный праздник; "YYYY-MM-DD" — конкретная дата

const HOLIDAYS = {
  "01-01": "Новый год",
  "01-02": "Новогодние каникулы",
  "01-03": "Новогодние каникулы",
  "01-04": "Новогодние каникулы",
  "01-05": "Новогодние каникулы",
  "01-06": "Новогодние каникулы",
  "01-07": "Рождество Христово",
  "01-08": "Новогодние каникулы",
  "02-23": "День защитника Отечества",
  "03-08": "Международный женский день",
  "05-01": "Праздник Весны и Труда",
  "05-09": "День Победы",
  "06-12": "День России",
  "11-04": "День народного единства",
  // Переносы 2026
  "2026-01-09": "Выходной (перенос)",
  "2026-02-24": "Выходной (перенос)",
  "2026-03-09": "Выходной (перенос)",
  "2026-05-04": "Выходной (перенос)",
  "2026-05-11": "Выходной (перенос)",
  "2026-11-03": "Выходной (перенос)",
};

/**
 * Возвращает название праздника для dateKey ("YYYY-MM-DD") или null.
 * Проверяет сначала точную дату, затем шаблон "MM-DD".
 */
function getHolidayName(key) {
  if (HOLIDAYS[key]) return HOLIDAYS[key];          // точная дата "YYYY-MM-DD"
  const mmdd = key.slice(5);                         // "MM-DD"
  return HOLIDAYS[mmdd] || null;
}

/** @deprecated используйте getHolidayName(key) */
function isHoliday(dateOrKey) {
  if (typeof dateOrKey === 'string') return !!getHolidayName(dateOrKey);
  const y = dateOrKey.getFullYear();
  const m = String(dateOrKey.getMonth() + 1).padStart(2, '0');
  const d = String(dateOrKey.getDate()).padStart(2, '0');
  return !!getHolidayName(`${y}-${m}-${d}`);
}

// ─── STATE ────────────────────────────────────────────────────────────────────

const State = {
  teachers: [],
  duties: {},
  replaceRequests: {},    // { "YYYY-MM-DD": true }
  blackoutDates: {},      // { teacherId: ["YYYY-MM-DD", …] }
  notifications: [],      // [{ id, msg, icon, time }]
  currentRole: 'admin',   // 'admin' | 'teacher'
  currentTeacherId: null,
  currentDate: new Date(),
  selectedCell: null,
  selectedTeacherId: null,
  modalMode: 'assign',

  avatarColors: [
    '#2C6FAC','#1A7A4A','#8E44AD','#C0392B',
    '#D35400','#16869A','#7D6608','#1E5799',
    '#5D4037','#2E7D6F'
  ],

  save() {
    // Always keep localStorage as offline fallback
    try {
      localStorage.setItem('ag_teachers',  JSON.stringify(this.teachers));
      localStorage.setItem('ag_duties',    JSON.stringify(this.duties));
      localStorage.setItem('ag_replace',   JSON.stringify(this.replaceRequests));
      localStorage.setItem('ag_blackout',  JSON.stringify(this.blackoutDates));
      localStorage.setItem('ag_notifs',    JSON.stringify(this.notifications));
    } catch(e) { console.warn('LocalStorage save failed', e); }
  },

  load() {
    try {
      const t = localStorage.getItem('ag_teachers');
      const d = localStorage.getItem('ag_duties');
      const r = localStorage.getItem('ag_replace');
      const b = localStorage.getItem('ag_blackout');
      const n = localStorage.getItem('ag_notifs');
      if (t) this.teachers        = JSON.parse(t);
      if (d) this.duties          = JSON.parse(d);
      if (r) this.replaceRequests = JSON.parse(r);
      if (b) this.blackoutDates   = JSON.parse(b);
      if (n) this.notifications   = JSON.parse(n);
    } catch(e) { console.warn('Load failed', e); }
  }
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function todayKey() {
  const n = new Date();
  return dateKey(n.getFullYear(), n.getMonth(), n.getDate());
}
function shiftDay(key, delta) {
  const d = new Date(key + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().split('T')[0];
}
function initials(name) {
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
}
function getColor(idx) {
  return State.avatarColors[idx % State.avatarColors.length];
}
function teacherById(id) {
  return State.teachers.find(t => t.id === id);
}
function teacherIndex(id) {
  return State.teachers.findIndex(t => t.id === id);
}
function getWeekKeys(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
  const mon = new Date(d);
  mon.setDate(d.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(mon);
    x.setDate(mon.getDate() + i);
    return x.toISOString().split('T')[0];
  });
}
function weekDutiesCount(tid, weekKeys) {
  return weekKeys.filter(k => State.duties[k] === tid).length;
}
function getWorkdaysInMonth() {
  const y = State.currentDate.getFullYear();
  const m = State.currentDate.getMonth();
  const total = new Date(y, m + 1, 0).getDate();
  let n = 0;
  for (let d = 1; d <= total; d++) {
    const key = dateKey(y, m, d);
    const dow = new Date(y, m, d).getDay();
    // 6-day week: Mon(1)–Sat(6) are workdays; Sun(0) is the only weekend
    if (dow !== 0 && !getHolidayName(key)) n++;
  }
  return n;
}

function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const d = digits.startsWith('7') || digits.startsWith('8') ? digits.slice(1) : digits;
  let r = '+7';
  if (d.length > 0) r += ' (' + d.slice(0, 3);
  if (d.length >= 3) r += ') ' + d.slice(3, 6);
  if (d.length >= 6) r += '-' + d.slice(6, 8);
  if (d.length >= 8) r += '-' + d.slice(8, 10);
  return r;
}

const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                   'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_RU_GEN = ['января','февраля','марта','апреля','мая','июня',
                        'июля','августа','сентября','октября','ноября','декабря'];
const DAYS_SHORT = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
const DAYS_FULL  = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];

// ── Toast ──
let toastTimer = null;
function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show toast--${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}

// ─── ROLE MANAGEMENT ─────────────────────────────────────────────────────────

function applyRole(role) {
  State.currentRole = role;
  document.body.dataset.role = role;

  document.getElementById('roleAdmin').classList.toggle('active', role === 'admin');
  document.getElementById('roleTeacher').classList.toggle('active', role === 'teacher');
  document.getElementById('roleAdmin').setAttribute('aria-pressed', role === 'admin');
  document.getElementById('roleTeacher').setAttribute('aria-pressed', role === 'teacher');

  if (role === 'teacher') {
    if (!State.currentTeacherId && State.teachers.length > 0) {
      State.currentTeacherId = State.teachers[0].id;
    }
    // If currently on admin-only tab, switch to calendar
    const activeTab = document.querySelector('.tab-panel.active');
    if (activeTab && activeTab.id === 'tab-teachers') {
      switchTab('calendar');
    }
    renderMyCabinet();
  }

  renderCalendar();
  renderAccordion();
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

function addNotification(msg, icon = '🔔') {
  const n = {
    id: 'n_' + Date.now(),
    msg, icon,
    time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  };
  State.notifications.unshift(n);
  if (State.notifications.length > 20) State.notifications.pop();
  State.save();
  renderNotifications();
}

function renderNotifications() {
  const list = document.getElementById('notifList');
  const dot  = document.getElementById('notifDot');
  if (!list || !dot) return;

  const count = State.notifications.length;
  dot.classList.toggle('visible', count > 0);

  if (count === 0) {
    list.innerHTML = '<div class="notif-empty">Нет новых уведомлений</div>';
    return;
  }

  list.innerHTML = State.notifications.map(n => `
    <div class="notif-item">
      <div class="notif-icon">${n.icon}</div>
      <div class="notif-text">
        <div class="notif-msg">${n.msg}</div>
        <div class="notif-time">${n.time}</div>
      </div>
      <button class="notif-dismiss" data-id="${n.id}" aria-label="Закрыть">✕</button>
    </div>`).join('');

  list.querySelectorAll('.notif-dismiss').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      State.notifications = State.notifications.filter(n => n.id !== btn.dataset.id);
      State.save();
      renderNotifications();
    });
  });
}

// ─── CALENDAR (Desktop Grid) ──────────────────────────────────────────────────

function renderCalendar() {
  const y = State.currentDate.getFullYear();
  const m = State.currentDate.getMonth();

  document.getElementById('monthTitle').textContent = `${MONTHS_RU[m]} ${y}`;

  const grid     = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  const firstDay = new Date(y, m, 1);
  const lastDay  = new Date(y, m + 1, 0);
  const today    = todayKey();

  // 7-day grid: Mon=col0, Tue=col1, …, Sat=col5, Sun=col6
  // JS: Sun=0, Mon=1, …, Sat=6
  const firstDow = firstDay.getDay();                         // 0=Sun,1=Mon,...,6=Sat
  // Map to grid column: Mon→0, Tue→1, …, Sat→5, Sun→6
  const startOffset = firstDow === 0 ? 6 : firstDow - 1;

  // Leading blanks (Mon–Fri only positions before 1st)
  for (let i = 0; i < startOffset; i++) {
    const blank = document.createElement('div');
    blank.className = 'day-cell day-cell--empty';
    grid.appendChild(blank);
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const key        = dateKey(y, m, d);
    const dow        = new Date(y, m, d).getDay(); // 0=Sun,1=Mon,...,6=Sat
    const isSunday   = dow === 0;
    const isSaturday = dow === 6;
    const currentDateObj = new Date(y, m, d);
    const isHoliday      = !!getHolidayName(key);
    const isToday        = key === today;
    const isPast         = key < today;
    const isReplaceReq   = !!State.replaceRequests[key];
    const tid            = State.currentTeacherId;
    const myBlackout     = tid && (State.blackoutDates[tid] || []).includes(key);

    const cell = document.createElement('div');
    cell.className = 'day-cell';

    // 1. Воскресенье — присутствует в сетке, но визуально заблокировано
    if (isSunday) {
      cell.classList.add('day-cell--sunday');
      cell.setAttribute('aria-disabled', 'true');
      cell.setAttribute('title', 'Воскресенье — выходной');
      // Отображаем номер дня, но без возможности назначить
      const sunNum = document.createElement('div');
      sunNum.className = 'day-num';
      sunNum.textContent = d;
      cell.appendChild(sunNum);
      const sunLabel = document.createElement('div');
      sunLabel.className = 'holiday-label';
      sunLabel.textContent = 'Выходной';
      cell.appendChild(sunLabel);
      grid.appendChild(cell);
      continue;
    }

    // 2. Обработка праздника (блокируем)
    if (isHoliday) {
      cell.classList.add('day-cell--holiday', 'disabled');
      cell.setAttribute('title', getHolidayName(key) || 'Праздничный день');
      cell.style.pointerEvents = 'none';
    }

    if (isSaturday) cell.classList.add('day-cell--saturday');
    if (isToday)    cell.classList.add('day-cell--today');
    if (isPast)     cell.classList.add('day-cell--past');
    if (isHoliday)  cell.classList.add('day-cell--holiday');
    if (myBlackout) cell.classList.add('day-cell--blackout');
    if (isReplaceReq) cell.classList.add('day-cell--replace-req');
    cell.dataset.key = key;

    if (!isHoliday) {
      cell.setAttribute('role', 'button');
      cell.setAttribute('tabindex', '0');
    }

    // Day number
    const num = document.createElement('div');
    num.className = 'day-num';
    num.textContent = d;
    cell.appendChild(num);

    // Holiday label
    if (isHoliday) {
      const hl = document.createElement('div');
      hl.className = 'holiday-label';
      hl.textContent = getHolidayName(key);
      cell.appendChild(hl);
    }

    // Blackout indicator (teacher mode only)
    if (myBlackout && State.currentRole === 'teacher') {
      const bi = document.createElement('div');
      bi.className = 'blackout-indicator';
      bi.textContent = '🚫 нежелательный';
      cell.appendChild(bi);
    }

    // Duty chip
    const dutyId = State.duties[key];
    if (dutyId && !isHoliday) {
      const teacher = teacherById(dutyId);
      if (teacher) {
        const idx   = teacherIndex(dutyId);
        const color = getColor(idx);
        const chip  = document.createElement('div');
        chip.className = 'duty-chip';
        if (isReplaceReq) chip.classList.add('duty-chip--replace');
        chip.style.borderLeftColor = color;
        chip.style.background      = isReplaceReq ? '' : color + '14';
        chip.style.borderColor     = isReplaceReq ? '' : color + '50';

        const nameShort = teacher.name.split(' ').slice(0, 2).join(' ');
        const replaceBadge = isReplaceReq
          ? '<div class="replace-badge">🔄 Просит замену</div>' : '';

        chip.innerHTML = `
          <span class="chip-name">${nameShort}</span>
          <span class="chip-dept">${teacher.dept}</span>
          ${teacher.phone ? `<span class="chip-phone">${teacher.phone}</span>` : ''}
          ${replaceBadge}`;

        const canAdmin = State.currentRole === 'admin';
        const isMyDuty = State.currentTeacherId === dutyId;

        if (canAdmin || isMyDuty) {
          const actions = document.createElement('div');
          actions.className = 'chip-actions';
          if (canAdmin) {
            actions.innerHTML += `<button class="chip-action-btn" data-action="replace" data-key="${key}">↔ Заменить</button>`;
            actions.innerHTML += `<button class="chip-action-btn danger" data-action="clear" data-key="${key}">✕ Очистить</button>`;
          }
          if (isMyDuty && State.currentRole === 'teacher') {
            const isReq = !!State.replaceRequests[key];
            actions.innerHTML += `<button class="chip-action-btn orange" data-action="toggle-replace" data-key="${key}">${isReq ? '↩ Отменить' : '🔄 Замена'}</button>`;
          }
          chip.appendChild(actions);
        }
        cell.appendChild(chip);
      }
    } else if (!isHoliday && State.currentRole === 'admin') {
      const hint = document.createElement('div');
      hint.className = 'add-hint';
      hint.textContent = '+ назначить';
      cell.appendChild(hint);
    }

    if (!isHoliday) {
      cell.addEventListener('click', (e) => {
        const actionBtn = e.target.closest('.chip-action-btn');
        if (actionBtn) {
          e.stopPropagation();
          handleChipAction(actionBtn.dataset.action, actionBtn.dataset.key);
          return;
        }
        if (State.currentRole === 'admin') {
          openModal(key, d, m, y, State.duties[key] ? 'replace' : 'assign');
        }
      });
      cell.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && State.currentRole === 'admin') {
          e.preventDefault();
          openModal(key, d, m, y, State.duties[key] ? 'replace' : 'assign');
        }
      });
    }

    grid.appendChild(cell);
  }
}

// ─── CHIP ACTIONS ─────────────────────────────────────────────────────────────

function handleChipAction(action, key) {
  const [ky, km, kd] = key.split('-').map(Number);

  if (action === 'clear') {
    quickClear(key);
  } else if (action === 'replace') {
    openModal(key, kd, km - 1, ky, 'replace');
  } else if (action === 'toggle-replace') {
    toggleReplaceRequest(key);
  }
}

function quickClear(key) {
  delete State.duties[key];
  delete State.replaceRequests[key];
  State.save();
  renderCalendar();
  renderAccordion();
  renderTeachersList();
  renderStats();
  renderMyCabinet();
  showToast('Дежурство снято', 'info');
}

function toggleReplaceRequest(key) {
  const teacher = teacherById(State.duties[key]);
  if (!teacher) return;

  const [, mm, dd] = key.split('-');
  const dayLabel = `${parseInt(dd)} ${MONTHS_RU_GEN[parseInt(mm) - 1]}`;

  if (State.replaceRequests[key]) {
    delete State.replaceRequests[key];
    State.save();
    renderCalendar();
    renderAccordion();
    renderMyCabinet();
    showToast('Запрос на замену отменён', 'info');
  } else {
    State.replaceRequests[key] = true;
    State.save();
    addNotification(`🔄 ${teacher.name} просит замену ${dayLabel}`, '🔄');
    renderCalendar();
    renderAccordion();
    renderMyCabinet();
    showToast('Запрос на замену отправлен 🔔', 'warn');
  }
}

// ─── MOBILE ACCORDION ────────────────────────────────────────────────────────

function renderAccordion() {
  const acc = document.getElementById('calAccordion');
  if (!acc) return;
  acc.innerHTML = '';

  const y = State.currentDate.getFullYear();
  const m = State.currentDate.getMonth();
  const total = new Date(y, m + 1, 0).getDate();
  const today = todayKey();

  // Group days into weeks (Mon-Sun)
  const weeks = [];
  let currentWeek = null;
  for (let d = 1; d <= total; d++) {
    const key = dateKey(y, m, d);
    const dow = new Date(y, m, d).getDay(); // 0=Sun
    const isMon = dow === 1;
    if (d === 1 || isMon) { currentWeek = []; weeks.push(currentWeek); }
    currentWeek.push({ d, key, dow });
  }

  weeks.forEach((week, wi) => {
    const first = week[0], last = week[week.length - 1];
    const assignedCount = week.filter(({ key, dow }) =>
      State.duties[key] && dow !== 0 && dow !== 6 && !getHolidayName(key)).length;

    const weekEl = document.createElement('div');
    weekEl.className = 'acc-week';
    if (wi === 0) weekEl.classList.add('open');

    weekEl.innerHTML = `
      <div class="acc-week-header">
        <span class="acc-week-label">${first.d}–${last.d} ${MONTHS_RU_GEN[m]}</span>
        <div class="acc-week-meta">
          <span class="acc-week-count">${assignedCount} дежурств</span>
          <span class="acc-week-arrow">▾</span>
        </div>
      </div>
      <div class="acc-week-body"></div>`;

    weekEl.querySelector('.acc-week-header').addEventListener('click', () => {
      weekEl.classList.toggle('open');
    });

    const body = weekEl.querySelector('.acc-week-body');

    week.forEach(({ d, key, dow }) => {
      const isSunday   = dow === 0;
      const isSaturday = dow === 6;
      // 6-day week: skip Sundays entirely
      if (isSunday) return;

      const isHoliday   = !!getHolidayName(key);
      const isToday     = key === today;
      const isReplace   = !!State.replaceRequests[key];
      const dutyId      = State.duties[key];
      const tid         = State.currentTeacherId;
      const myBlackout  = tid && (State.blackoutDates[tid] || []).includes(key);

      const row = document.createElement('div');
      row.className = 'acc-day-row';
      if (isSaturday) row.classList.add('saturday');
      if (isHoliday)  row.classList.add('holiday');
      if (isToday)    row.classList.add('today');
      if (isReplace)  row.classList.add('replace-req');

      let contentHtml = '';
      if (isHoliday) {
        contentHtml = `<div class="acc-holiday-tag">🏛 ${getHolidayName(key)}</div>`;
      } else if (dutyId) {
        const teacher = teacherById(dutyId);
        const idx = teacherIndex(dutyId);
        const color = getColor(idx);
        const replaceBadge = isReplace
          ? '<div style="font-size:.68rem;color:var(--orange);margin-top:3px">🔄 Просит замену</div>' : '';
        contentHtml = `
          <div class="acc-duty-chip${isReplace ? ' replace' : ''}"
               style="border-left-color:${color};background:${isReplace ? '' : color + '12'};border-color:${isReplace ? '' : color + '40'}">
            <div class="acc-duty-name">${teacher.name}</div>
            <div class="acc-duty-dept">${teacher.dept}</div>
            ${teacher.phone ? `<div class="acc-duty-dept">${teacher.phone}</div>` : ''}
            ${replaceBadge}
          </div>`;
      } else {
        contentHtml = `<div class="acc-empty" style="color:var(--text-faint)">— свободно —</div>`;
      }

      if (myBlackout) {
        contentHtml += `<div class="acc-blackout-tag">🚫 нежелательный</div>`;
      }

      // Action button
      let actionBtn = '';
      if (!isHoliday) {
        if (State.currentRole === 'admin') {
          actionBtn = dutyId
            ? `<button class="acc-action-btn" data-action="replace" data-key="${key}">↔</button>`
            : `<button class="acc-action-btn" data-action="assign" data-key="${key}">+</button>`;
        } else if (State.currentRole === 'teacher' && dutyId === tid) {
          const isReq = !!State.replaceRequests[key];
          actionBtn = `<button class="acc-action-btn orange-btn" data-action="toggle-replace" data-key="${key}">${isReq ? '↩' : '🔄'}</button>`;
        }
      }

      row.innerHTML = `
        <div class="acc-day-date">
          <div class="acc-day-num">${d}</div>
          <div class="acc-day-wd">${DAYS_SHORT[dow]}</div>
        </div>
        <div class="acc-day-content">${contentHtml}</div>
        ${actionBtn ? `<div class="acc-day-action">${actionBtn}</div>` : ''}`;

      const btn = row.querySelector('[data-action]');
      if (btn) {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const action = btn.dataset.action;
          const k = btn.dataset.key;
          const [ky, km, kd] = k.split('-').map(Number);
          if (action === 'assign' || action === 'replace') {
            openModal(k, kd, km - 1, ky, action);
          } else {
            handleChipAction(action, k);
          }
        });
      }

      body.appendChild(row);
    });

    acc.appendChild(weekEl);
  });
}

// ─── MODAL (Assignment) ───────────────────────────────────────────────────────

function openModal(key, day, month, year, mode = 'assign') {
  State.selectedCell      = key;
  State.selectedTeacherId = State.duties[key] || null;
  State.modalMode         = mode;

  const overlay     = document.getElementById('modalOverlay');
  const title       = document.getElementById('modalTitle');
  const body        = document.getElementById('modalBody');
  const hasAssigned = !!State.duties[key];

  title.textContent = `${day} ${MONTHS_RU_GEN[month]} ${year}`;

  const prevKey  = shiftDay(key, -1);
  const nextKey  = shiftDay(key, +1);
  const weekKeys = getWeekKeys(key);

  let modeSwitcherHtml = '';
  if (hasAssigned) {
    modeSwitcherHtml = `
      <div class="modal-mode-bar" role="tablist">
        <button class="modal-mode-btn${mode === 'replace' ? ' active' : ''}" data-mode="replace">↔ Заменить</button>
        <button class="modal-mode-btn danger-mode${mode === 'clear' ? ' active' : ''}" data-mode="clear">✕ Очистить</button>
      </div>`;
  }

  let html = `<div class="modal-date-label">${String(day).padStart(2,'0')}.${String(month+1).padStart(2,'0')}.${year}</div>`;
  html += modeSwitcherHtml;

  if (mode === 'clear') {
    const t = teacherById(State.duties[key]);
    html += `<div class="clear-confirm">
      <p>Снять <strong>${t ? t.name : 'преподавателя'}</strong><br>с дежурства ${day} ${MONTHS_RU_GEN[month]}?</p>
    </div>
    <div class="modal-actions">
      <button class="btn-modal-clear" id="modalCancelBtn">Отмена</button>
      <button class="btn-modal-danger" id="modalConfirmClearBtn">Снять дежурство</button>
    </div>`;
  } else {
    if (State.teachers.length === 0) {
      html += `<div class="empty-state" style="padding:1rem 0">
        <div class="empty-icon">👤</div>
        <p class="empty-title">Нет преподавателей</p>
        <p class="empty-sub">Перейдите во вкладку «Преподаватели»</p>
      </div>`;
    } else {
      html += `<div class="teacher-options" role="listbox">`;
      State.teachers.forEach((t, idx) => {
        const color         = getColor(idx);
        const wc            = weekDutiesCount(t.id, weekKeys);
        const overloaded    = wc >= t.maxLoad;
        const consecutive   = State.duties[prevKey] === t.id || State.duties[nextKey] === t.id;
        const selected      = State.selectedTeacherId === t.id;
        const isCurrentDuty = State.duties[key] === t.id;

        let badge = '';
        if (isCurrentDuty) badge = `<span class="conflict-tag" style="background:#EBF3FB;color:#2C6FAC">текущий</span>`;
        else if (consecutive) badge = `<span class="conflict-tag conflict-tag--consecutive">подряд ✕</span>`;
        else if (overloaded)  badge = `<span class="conflict-tag conflict-tag--overload">перегруз</span>`;

        html += `<button class="teacher-option${selected ? ' selected' : ''}"
                         data-id="${t.id}"
                         ${consecutive && !isCurrentDuty ? 'disabled aria-disabled="true"' : ''}
                         role="option" aria-selected="${selected}">
          <div class="opt-avatar" style="background:${color}">${initials(t.name)}</div>
          <div class="opt-info">
            <div class="opt-name">${t.name}</div>
            <div class="opt-meta">${t.dept} · нед: ${wc}/${t.maxLoad}${t.phone ? ' · ' + t.phone : ''}</div>
          </div>
          ${badge}
        </button>`;
      });
      html += `</div>`;
    }

    html += `<div class="modal-actions">
      <button class="btn-modal-clear" id="modalClearBtn">Очистить</button>
      <button class="btn-modal-save" id="modalSaveBtn">Сохранить</button>
    </div>`;
  }

  body.innerHTML = html;

  body.querySelectorAll('.modal-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => openModal(key, day, month, year, btn.dataset.mode));
  });

  body.querySelectorAll('.teacher-option:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      body.querySelectorAll('.teacher-option').forEach(b => {
        b.classList.remove('selected');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('selected');
      btn.setAttribute('aria-selected', 'true');
      State.selectedTeacherId = btn.dataset.id;
    });
  });

  const saveBtn = document.getElementById('modalSaveBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveModal);

  const clearBtn = document.getElementById('modalClearBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    State.selectedTeacherId = null;
    body.querySelectorAll('.teacher-option').forEach(b => {
      b.classList.remove('selected');
      b.setAttribute('aria-selected', 'false');
    });
  });

  const confirmClearBtn = document.getElementById('modalConfirmClearBtn');
  if (confirmClearBtn) confirmClearBtn.addEventListener('click', () => {
    delete State.duties[key];
    delete State.replaceRequests[key];
    State.save();
    closeModal('modalOverlay');
    renderCalendar(); renderAccordion(); renderTeachersList(); renderStats(); renderMyCabinet();
    showToast('Дежурство снято', 'info');
  });

  const cancelBtn = document.getElementById('modalCancelBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal('modalOverlay'));

  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');

  setTimeout(() => {
    const first = body.querySelector('button:not([disabled]), .teacher-option:not([disabled])');
    if (first) first.focus();
  }, 60);
}

function saveModal() {
  const key = State.selectedCell;
  if (State.selectedTeacherId) {
    State.duties[key] = State.selectedTeacherId;
    delete State.replaceRequests[key];
    showToast('Дежурство сохранено', 'success');
  } else {
    delete State.duties[key];
    delete State.replaceRequests[key];
    showToast('Дежурство очищено', 'info');
  }
  State.save();
  closeModal('modalOverlay');
  renderCalendar(); renderAccordion(); renderTeachersList(); renderStats(); renderMyCabinet();
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('open');
  el.setAttribute('aria-hidden', 'true');
  if (id === 'modalOverlay') State.selectedCell = null;
}

// ─── TEACHER MODAL (Add / Edit Popup) ────────────────────────────────────────

function openTeacherModal(editId = null) {
  const overlay = document.getElementById('teacherModalOverlay');
  const title   = document.getElementById('teacherModalTitle');
  document.getElementById('tEditId').value = editId || '';

  if (editId) {
    const t = teacherById(editId);
    title.textContent = 'Редактировать преподавателя';
    document.getElementById('tName').value      = t.name || '';
    document.getElementById('tDeptSel').value   = t.dept || '';
    document.getElementById('tDeptCustom').value = '';
    document.getElementById('tPhone').value     = t.phone || '';
    document.getElementById('tLoad').value      = t.maxLoad || 2;
  } else {
    title.textContent = 'Добавить преподавателя';
    ['tName','tDeptCustom','tPhone'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('tDeptSel').value = '';
    document.getElementById('tLoad').value = 2;
  }

  // ── Нежелательные даты в модале ──────────────────────────────────────────
  const tid = editId;
  const existingBlackouts = tid ? (State.blackoutDates[tid] || []) : [];
  _modalBlackouts = [...existingBlackouts];
  renderModalBlackouts(_modalBlackouts, tid);

  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  setTimeout(() => document.getElementById('tName').focus(), 60);
}

/** Рендерит список нежелательных дат внутри модального окна */
function renderModalBlackouts(dates, tid) {
  const container = document.getElementById('tBlackoutSection');
  if (!container) return;

  const sorted = [...dates].sort();
  const tagsHtml = sorted.length
    ? sorted.map(k => {
        const d = new Date(k + 'T00:00:00');
        return `<span class="blackout-tag" style="font-size:.75rem;padding:3px 8px">
          ${d.getDate()} ${MONTHS_RU_GEN[d.getMonth()]} ${d.getFullYear()}
          <button class="blackout-remove" data-k="${k}" style="margin-left:4px;background:none;border:none;cursor:pointer;color:inherit">✕</button>
        </span>`;
      }).join('')
    : '<span style="font-size:.78rem;color:var(--text-faint)">Нет нежелательных дат</span>';

  container.innerHTML = `
    <div class="field-group field-group--wide" style="margin-top:.75rem">
      <label class="field-label">🚫 Нежелательные даты (алгоритм пропустит их)</label>
      <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.5rem">
        <input type="date" class="field-input" id="tBlackoutInput" style="flex:1;min-width:0"/>
        <button type="button" class="btn btn--outline" id="tBlackoutAddBtn"
                style="white-space:nowrap;padding:.45rem .85rem;font-size:.8rem">+ Добавить</button>
      </div>
      <div id="tBlackoutTags" style="display:flex;flex-wrap:wrap;gap:.35rem;min-height:1.5rem">${tagsHtml}</div>
    </div>`;

  // Кнопка добавления
  document.getElementById('tBlackoutAddBtn').addEventListener('click', () => {
    const input = document.getElementById('tBlackoutInput');
    const val   = input.value;
    if (!val) { showToast('Выберите дату', 'error'); return; }
    if (!_modalBlackouts) _modalBlackouts = [];
    if (_modalBlackouts.includes(val)) { showToast('Уже добавлено', 'info'); return; }
    _modalBlackouts.push(val);
    input.value = '';
    renderModalBlackouts(_modalBlackouts, tid);
  });

  // Кнопки удаления тегов
  container.querySelectorAll('.blackout-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      _modalBlackouts = (_modalBlackouts || []).filter(k => k !== btn.dataset.k);
      renderModalBlackouts(_modalBlackouts, tid);
    });
  });
}

// Временное хранилище нежелательных дат при работе с модалом
let _modalBlackouts = [];

function saveTeacherModal() {
  const name    = (document.getElementById('tName').value || '').trim();
  const dept    = (document.getElementById('tDeptCustom').value || '').trim()
                   || document.getElementById('tDeptSel').value;
  const phone   = (document.getElementById('tPhone').value || '').trim();
  const maxLoad = Math.max(1, Math.min(5, parseInt(document.getElementById('tLoad').value) || 2));
  const editId  = document.getElementById('tEditId').value;

  if (!name) { showToast('Введите ФИО', 'error'); return; }
  if (!dept) { showToast('Выберите кафедру', 'error'); return; }

  if (editId) {
    const t = teacherById(editId);
    if (t) {
      Object.assign(t, { name, dept, phone, maxLoad });
      // Сохраняем нежелательные даты из модала
      State.blackoutDates[editId] = [...(_modalBlackouts || [])];
      t.blackoutDates = State.blackoutDates[editId];
    }
    showToast('Данные обновлены', 'success');
  } else {
    const newId = 't_' + Date.now();
    State.teachers.push({ id: newId, name, dept, phone, maxLoad, blackoutDates: [...(_modalBlackouts || [])] });
    State.blackoutDates[newId] = [...(_modalBlackouts || [])];
    showToast(`${name} добавлен(а)`, 'success');
  }

  _modalBlackouts = [];
  State.save();
  closeModal('teacherModalOverlay');
  renderTeachersList(); renderCalendar(); renderAccordion(); renderStats(); renderMyCabinet();
}

// ─── TEACHERS ────────────────────────────────────────────────────────────────

// Keep original addTeacher for the inline form (still in DOM)
function addTeacher() {
  const nameEl   = document.getElementById('teacherName');
  const deptSel  = document.getElementById('teacherDept');
  const deptCust = document.getElementById('teacherDeptCustom');
  const phoneEl  = document.getElementById('teacherPhone');
  const loadEl   = document.getElementById('teacherLoad');

  const name    = nameEl.value.trim();
  const dept    = deptCust.value.trim() || deptSel.value;
  const phone   = phoneEl.value.trim();
  const maxLoad = Math.max(1, Math.min(5, parseInt(loadEl.value) || 2));

  if (!name) { showToast('Введите ФИО преподавателя', 'error'); nameEl.focus(); return; }
  if (!dept || dept === '') { showToast('Выберите или введите кафедру', 'error'); deptSel.focus(); return; }

  State.teachers.push({ id: 't_' + Date.now(), name, dept, phone, maxLoad });
  State.save();

  nameEl.value = ''; deptSel.value = '';
  deptCust.value = ''; phoneEl.value = ''; loadEl.value = '2';
  nameEl.focus();

  renderTeachersList(); renderCalendar(); renderAccordion(); renderStats(); renderMyCabinet();
  showToast(`${name} добавлен(а)`, 'success');
}

function removeTeacher(id) {
  const t = teacherById(id);
  if (!t) return;
  if (!confirm(`Удалить ${t.name}?`)) return;
  State.teachers = State.teachers.filter(x => x.id !== id);
  Object.keys(State.duties).forEach(k => { if (State.duties[k] === id) delete State.duties[k]; });
  if (State.currentTeacherId === id) State.currentTeacherId = State.teachers[0]?.id || null;
  State.save();
  renderTeachersList(); renderCalendar(); renderAccordion(); renderStats(); renderMyCabinet();
  showToast(`${t.name} удалён(а)`, 'info');
}

function getMonthDutyCount(tid) {
  const y = State.currentDate.getFullYear();
  const m = State.currentDate.getMonth();
  const prefix = `${y}-${String(m+1).padStart(2,'0')}`;
  return Object.entries(State.duties).filter(([k, v]) => v === tid && k.startsWith(prefix)).length;
}

function renderTeachersList() {
  const list  = document.getElementById('teachersList');
  const badge = document.getElementById('teacherCount');
  if (badge) badge.textContent = State.teachers.length;
  if (!list) return;

  if (State.teachers.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📋</div>
      <p class="empty-title">Список пуст</p>
      <p class="empty-sub">Нажмите «Добавить преподавателя»</p>
    </div>`;
    return;
  }

  const maxD = getWorkdaysInMonth();
  list.innerHTML = State.teachers.map((t, idx) => {
    const color    = getColor(idx);
    const dc       = getMonthDutyCount(t.id);
    const pct      = maxD ? Math.min(100, Math.round(dc / maxD * 100)) : 0;
    const barColor = pct > 70 ? '#1E8449' : color;

    return `<div class="teacher-card">
      <div class="t-avatar" style="background:${color}">${initials(t.name)}</div>
      <div class="t-info">
        <div class="t-name">${t.name}</div>
        <div class="t-meta">${t.dept} · макс ${t.maxLoad} дн/нед</div>
        ${t.phone ? `<div class="t-phone">${t.phone}</div>` : ''}
      </div>
      <div class="t-load">
        <div class="t-load-label">${dc} дн.</div>
        <div class="t-load-track">
          <div class="t-load-fill" style="width:${pct}%;background:${barColor}"></div>
        </div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0">
        <button class="t-remove" style="padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:.7rem;font-family:var(--font-mono);background:var(--surface);color:var(--text-secondary);cursor:pointer"
                data-edit="${t.id}" aria-label="Редактировать ${t.name}">✏️</button>
        <button class="t-remove" data-id="${t.id}" aria-label="Удалить ${t.name}">
          <svg viewBox="0 0 16 16" fill="none" width="14" height="14"><path d="M3 4h10M6 4V2.5h4V4M5.5 4l.5 9M10.5 4l-.5 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openTeacherModal(btn.dataset.edit));
  });
  list.querySelectorAll('[data-id]').forEach(btn => {
    btn.addEventListener('click', () => removeTeacher(btn.dataset.id));
  });
}

// ─── STATS ────────────────────────────────────────────────────────────────────

function renderStats() {
  const grid = document.getElementById('statsGrid');
  if (!grid) return;

  if (State.teachers.length === 0) {
    grid.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📊</div>
      <p class="empty-title">Нет данных</p>
      <p class="empty-sub">Добавьте преподавателей и запустите авто-распределение</p>
    </div>`;
    return;
  }

  const y      = State.currentDate.getFullYear();
  const m      = State.currentDate.getMonth();
  const prefix = `${y}-${String(m+1).padStart(2,'0')}`;
  const maxD   = getWorkdaysInMonth();

  const weekMap = {};
  const days = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const key = dateKey(y, m, d);
    const wk  = getWeekKeys(key)[0];
    if (!weekMap[wk]) weekMap[wk] = getWeekKeys(key);
  }

  grid.innerHTML = State.teachers.map((t, idx) => {
    const color        = getColor(idx);
    const monthCount   = Object.entries(State.duties).filter(([k, v]) => v === t.id && k.startsWith(prefix)).length;
    const maxWeekLoad  = Math.max(...Object.values(weekMap).map(wk => weekDutiesCount(t.id, wk)), 0);
    const replaceCount = Object.keys(State.replaceRequests).filter(k => State.duties[k] === t.id && k.startsWith(prefix)).length;

    const loadPct  = t.maxLoad ? Math.min(100, Math.round(maxWeekLoad / t.maxLoad * 100)) : 0;
    const monthPct = maxD ? Math.min(100, Math.round(monthCount / maxD * 100)) : 0;

    let loadStatus, barColor, barClass;
    if (loadPct >= 100) { loadStatus = 'over'; barColor = '#C0392B'; barClass = 'stat-bar-fill--over'; }
    else if (loadPct >= 70) { loadStatus = 'warn'; barColor = '#D4850A'; barClass = ''; }
    else { loadStatus = 'ok'; barColor = '#1E8449'; barClass = ''; }

    const statusLabel = { ok: '✓ Норма', warn: '⚠ Высокая нагрузка', over: '✕ Перебор смен' }[loadStatus];
    const pctClass    = `stat-bar-pct--${loadStatus}`;
    const statusClass = `stat-status--${loadStatus}`;

    return `<div class="stat-card">
      <div class="stat-header">
        <div class="stat-avatar" style="background:${color}">${initials(t.name)}</div>
        <div style="min-width:0">
          <div class="stat-name">${t.name}</div>
          <div class="stat-dept">${t.dept}</div>
          ${t.phone ? `<div class="stat-phone">${t.phone}</div>` : ''}
          ${replaceCount > 0 ? `<div style="font-size:.68rem;color:var(--orange);font-family:var(--font-mono);margin-top:2px">🔄 ${replaceCount} запрос замены</div>` : ''}
        </div>
      </div>
      <div class="stat-nums">
        <div class="stat-num">
          <div class="stat-num-val" style="color:${color}">${monthCount}</div>
          <div class="stat-num-label">за месяц</div>
        </div>
        <div class="stat-num">
          <div class="stat-num-val" style="color:${color}">${maxWeekLoad}/${t.maxLoad}</div>
          <div class="stat-num-label">макс. нед.</div>
        </div>
      </div>
      <div class="stat-bar">
        <div class="stat-bar-header">
          <span class="stat-bar-label">Нагрузка в неделю</span>
          <span class="stat-bar-pct ${pctClass}">${loadPct}%</span>
        </div>
        <div class="stat-bar-track" role="progressbar" aria-valuenow="${loadPct}" aria-valuemin="0" aria-valuemax="100">
          <div class="stat-bar-fill ${barClass}" style="width:${loadPct}%;background:${barColor}"></div>
        </div>
        <span class="stat-status ${statusClass}">${statusLabel}</span>
      </div>
      <div class="stat-bar" style="margin-top:6px">
        <div class="stat-bar-header">
          <span class="stat-bar-label">Доля рабочих дней</span>
          <span class="stat-bar-pct" style="background:${color}18;color:${color}">${monthPct}%</span>
        </div>
        <div class="stat-bar-track">
          <div class="stat-bar-fill" style="width:${monthPct}%;background:${color}"></div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─── MY CABINET ───────────────────────────────────────────────────────────────

function renderMyCabinet() {
  const tid     = State.currentTeacherId;
  const listEl  = document.getElementById('myDutiesList');
  const blEl    = document.getElementById('blackoutList');
  if (!listEl || !blEl) return;

  const y      = State.currentDate.getFullYear();
  const m      = State.currentDate.getMonth();
  const prefix = `${y}-${String(m+1).padStart(2,'0')}`;

  const myDuties = Object.entries(State.duties)
    .filter(([k, v]) => v === tid && k.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b));

  if (!tid || myDuties.length === 0) {
    listEl.innerHTML = `<div class="empty-state" style="padding:1.5rem">
      <div class="empty-icon">📅</div>
      <p class="empty-title">Нет дежурств</p>
    </div>`;
  } else {
    listEl.innerHTML = myDuties.map(([key]) => {
      const d      = new Date(key + 'T00:00:00');
      const dayStr = `${d.getDate()} ${MONTHS_RU_GEN[d.getMonth()]}`;
      const isReq  = !!State.replaceRequests[key];
      return `<div class="my-duty-row">
        <div class="my-duty-date">${dayStr}, ${DAYS_SHORT[d.getDay()]}</div>
        <div class="my-duty-status${isReq ? ' replace' : ''}">${isReq ? '🔄 Запрошена замена' : '✓ Запланировано'}</div>
        <button class="my-duty-action${isReq ? ' cancel' : ''}" data-key="${key}">
          ${isReq ? 'Отменить' : '🔄 Запросить замену'}
        </button>
      </div>`;
    }).join('');

    listEl.querySelectorAll('[data-key]').forEach(btn => {
      btn.addEventListener('click', () => toggleReplaceRequest(btn.dataset.key));
    });
  }

  // Blackout dates
  const myBlackouts = (State.blackoutDates[tid] || []).sort();
  if (myBlackouts.length === 0) {
    blEl.innerHTML = `<div style="font-family:var(--font-mono);font-size:.78rem;color:var(--text-faint);padding:.5rem 0">Нет нежелательных дат</div>`;
  } else {
    blEl.innerHTML = myBlackouts.map(k => {
      const d = new Date(k + 'T00:00:00');
      return `<div class="blackout-tag">
        ${d.getDate()} ${MONTHS_RU_GEN[d.getMonth()]} ${d.getFullYear()} (${DAYS_FULL[d.getDay()]})
        <button class="blackout-remove" data-k="${k}">✕</button>
      </div>`;
    }).join('');

    blEl.querySelectorAll('.blackout-remove').forEach(b => {
      b.addEventListener('click', () => {
        State.blackoutDates[tid] = (State.blackoutDates[tid] || []).filter(k => k !== b.dataset.k);
        State.save();
        renderMyCabinet(); renderCalendar(); renderAccordion();
        showToast('Дата удалена', 'info');
      });
    });
  }
}

function addBlackoutDate() {
  const tid = State.currentTeacherId;
  if (!tid) { showToast('Не выбран преподаватель', 'error'); return; }
  const input = document.getElementById('blackoutDateInput');
  const val   = input.value;
  if (!val) { showToast('Выберите дату', 'error'); return; }
  if (!State.blackoutDates[tid]) State.blackoutDates[tid] = [];
  if (State.blackoutDates[tid].includes(val)) { showToast('Уже добавлено', 'info'); return; }
  State.blackoutDates[tid].push(val);
  State.save();
  input.value = '';
  renderMyCabinet(); renderCalendar(); renderAccordion();
  showToast('Нежелательная дата добавлена', 'success');
}

// ─── AUTO-DISTRIBUTION (updated: holidays + blackouts) ───────────────────────

function autoDistribute() {
  if (State.teachers.length === 0) { showToast('Добавьте хотя бы одного преподавателя', 'error'); return; }

  const y     = State.currentDate.getFullYear();
  const m     = State.currentDate.getMonth();
  const total = new Date(y, m + 1, 0).getDate();

  // 6-day week: Mon–Sat are workdays; only Sunday (0) is weekend
  const workdays = [];
  for (let d = 1; d <= total; d++) {
    const key = dateKey(y, m, d);
    const dow = new Date(y, m, d).getDay();
    if (dow !== 0 && !getHolidayName(key)) workdays.push(key);
  }

  // Clear only workdays of this month
  workdays.forEach(k => { delete State.duties[k]; delete State.replaceRequests[k]; });

  const weekCounts  = {};
  const monthCounts = {};
  State.teachers.forEach(t => { weekCounts[t.id] = {}; monthCounts[t.id] = 0; });

  workdays.forEach(key => {
    const weekKeys = getWeekKeys(key);
    const weekId   = weekKeys[0];
    const prevKey  = shiftDay(key, -1);

    const candidates = State.teachers.map(t => {
      const wc         = weekCounts[t.id][weekId] || 0;
      const overloaded = wc >= t.maxLoad;
      // Hard rule: no consecutive days
      if (State.duties[prevKey] === t.id) return null;

      // Нежелательные даты: проверяем и в объекте учителя, и в State.blackoutDates
      const blackouts = [
        ...(Array.isArray(t.blackoutDates) ? t.blackoutDates : []),
        ...(State.blackoutDates[t.id] || []),
      ];
      if (blackouts.includes(key)) return null;

      // Праздники: авто-распределение запрещено (workdays уже отфильтрован, но double-check)
      if (getHolidayName(key)) return null;

      const score = wc * 100 + monthCounts[t.id] * 10 + (overloaded ? 500 : 0) + Math.random() * 2;
      return { t, score };
    }).filter(Boolean).sort((a, b) => a.score - b.score);

    if (candidates.length > 0) {
      const winner = candidates[0].t;
      State.duties[key] = winner.id;
      weekCounts[winner.id][weekId] = (weekCounts[winner.id][weekId] || 0) + 1;
      monthCounts[winner.id]++;
    }
  });

  State.save();
  renderCalendar(); renderAccordion(); renderTeachersList(); renderStats(); renderMyCabinet();
  showToast('Дежурства распределены (учтены праздники и «чёрные метки») ✦', 'success');
}

function clearAll() {
  if (!confirm('Очистить все назначенные дежурства текущего месяца?')) return;
  const y = State.currentDate.getFullYear();
  const m = State.currentDate.getMonth();
  const prefix = `${y}-${String(m+1).padStart(2,'0')}`;
  Object.keys(State.duties).forEach(k => { if (k.startsWith(prefix)) delete State.duties[k]; });
  Object.keys(State.replaceRequests).forEach(k => { if (k.startsWith(prefix)) delete State.replaceRequests[k]; });
  State.save();
  renderCalendar(); renderAccordion(); renderTeachersList(); renderStats(); renderMyCabinet();
  showToast('Расписание очищено', 'info');
}

// ─── PRINT ────────────────────────────────────────────────────────────────────

function printSchedule() {
  const y = State.currentDate.getFullYear();
  const m = State.currentDate.getMonth();
  document.getElementById('printMonth').textContent = `${MONTHS_RU[m]} ${y}`;
  document.getElementById('printDate').textContent  = new Date().toLocaleDateString('ru-RU', { day:'2-digit', month:'long', year:'numeric' });
  window.print();
}

// ─── TABS ────────────────────────────────────────────────────────────────────

function switchTab(tab) {
  // Update all nav buttons (desktop + mobile)
  document.querySelectorAll('.nav-btn, .mob-nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`tab-${tab}`);
  if (panel) panel.classList.add('active');
  if (tab === 'stats')   renderStats();
  if (tab === 'cabinet') renderMyCabinet();
}

function initTabs() {
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
      // Close mobile drawer
      document.getElementById('mobileNav').classList.remove('open');
      document.getElementById('hamburger').classList.remove('open');
      document.getElementById('hamburger').setAttribute('aria-expanded', 'false');
    });
  });
}

// ─── INIT ────────────────────────────────────────────────────────────────────

function init() {
  State.load();
  initTabs();

  // Month navigation
  document.getElementById('prevMonth').addEventListener('click', () => {
    State.currentDate.setMonth(State.currentDate.getMonth() - 1);
    renderCalendar(); renderAccordion();
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    State.currentDate.setMonth(State.currentDate.getMonth() + 1);
    renderCalendar(); renderAccordion();
  });

  // Assignment modal close
  document.getElementById('modalClose').addEventListener('click', () => closeModal('modalOverlay'));
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('modalOverlay');
  });

  // Teacher modal
  const tOverlay = document.getElementById('teacherModalOverlay');
  if (tOverlay) {
    document.getElementById('teacherModalClose').addEventListener('click', () => closeModal('teacherModalOverlay'));
    tOverlay.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('teacherModalOverlay'); });
    document.getElementById('teacherModalSave').addEventListener('click', saveTeacherModal);
    document.getElementById('teacherModalCancel').addEventListener('click', () => closeModal('teacherModalOverlay'));
    // Phone formatter in teacher modal
    const tPhone = document.getElementById('tPhone');
    if (tPhone) tPhone.addEventListener('input', () => { tPhone.value = formatPhone(tPhone.value); });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal('modalOverlay');
      closeModal('teacherModalOverlay');
    }
  });

  // Inline add teacher form (existing functionality kept)
  const addBtn = document.getElementById('addTeacherBtn');
  if (addBtn) addBtn.addEventListener('click', addTeacher);

  const phoneInput = document.getElementById('teacherPhone');
  if (phoneInput) phoneInput.addEventListener('input', () => {
    phoneInput.value = formatPhone(phoneInput.value);
  });

  ['teacherName', 'teacherDeptCustom'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') addTeacher(); });
  });

  // Open teacher popup button (new toolbar button)
  const openAddBtn = document.getElementById('openAddTeacherBtn');
  if (openAddBtn) openAddBtn.addEventListener('click', () => openTeacherModal());

  // Auto-distribute + clear
  document.getElementById('autoDistributeBtn').addEventListener('click', autoDistribute);
  const clearAllBtn = document.getElementById('clearAllBtn');
  if (clearAllBtn) clearAllBtn.addEventListener('click', clearAll);

  // Print
  document.getElementById('printBtn').addEventListener('click', printSchedule);

  // ★ Role switcher
  document.getElementById('roleAdmin').addEventListener('click', () => applyRole('admin'));
  document.getElementById('roleTeacher').addEventListener('click', () => {
    if (State.teachers.length === 0) { showToast('Сначала добавьте преподавателей', 'error'); return; }
    applyRole('teacher');
  });

  // ★ Hamburger
  document.getElementById('hamburger').addEventListener('click', () => {
    const nav  = document.getElementById('mobileNav');
    const open = nav.classList.toggle('open');
    document.getElementById('hamburger').classList.toggle('open', open);
    document.getElementById('hamburger').setAttribute('aria-expanded', open);
  });

  // ★ Notification bell
  document.getElementById('notifBtn').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('notifPanel').classList.toggle('open');
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.notif-wrap')) {
      document.getElementById('notifPanel').classList.remove('open');
    }
  });
  document.getElementById('notifClearAll').addEventListener('click', () => {
    State.notifications = [];
    State.save();
    renderNotifications();
  });

  // ★ Cabinet: add blackout
  const addBlackoutBtn = document.getElementById('addBlackoutBtn');
  if (addBlackoutBtn) addBlackoutBtn.addEventListener('click', addBlackoutDate);

  // ★ Supabase status bar close
  const sbClose = document.getElementById('sbStatusClose');
  if (sbClose) sbClose.addEventListener('click', () => {
    document.getElementById('sbStatusbar').classList.add('hidden');
  });

  // ★ Supabase init (uses hardcoded credentials)
  initSupabase();

  // ★ Seed demo data button (если кнопка есть в HTML)
  const seedBtn = document.getElementById('seedDemoBtn');
  if (seedBtn) seedBtn.addEventListener('click', seedDemoData);
  // Глобальный доступ для вызова из консоли: seedDemoData()
  window.seedDemoData = seedDemoData;

  // Initial render
  applyRole('admin');
  renderCalendar();
  renderAccordion();
  renderTeachersList();
  renderStats();
  renderNotifications();
}


// === ДЕМО-ДАННЫЕ: 10 преподавателей ===
async function seedDemoData() {
  if (!sb) { showToast('Supabase не подключён', 'error'); return; }

  const demoTeachers = [
    { id: 'demo_01', name: 'Иванов Сергей Николаевич',    dept: 'Кафедра математики',                phone: '+7 (910) 234-56-78', max_load: 2, blackout_dates: [] },
    { id: 'demo_02', name: 'Петрова Ольга Дмитриевна',    dept: 'Кафедра информатики и ВТ',          phone: '+7 (926) 345-67-89', max_load: 2, blackout_dates: [] },
    { id: 'demo_03', name: 'Смирнов Алексей Юрьевич',     dept: 'Кафедра физики',                    phone: '+7 (905) 456-78-90', max_load: 3, blackout_dates: [] },
    { id: 'demo_04', name: 'Козлова Наталья Владимировна', dept: 'Кафедра химии и биологии',          phone: '+7 (916) 567-89-01', max_load: 2, blackout_dates: [] },
    { id: 'demo_05', name: 'Новиков Дмитрий Александрович',dept: 'Кафедра истории и обществознания', phone: '+7 (999) 678-90-12', max_load: 2, blackout_dates: [] },
    { id: 'demo_06', name: 'Морозова Татьяна Игоревна',   dept: 'Кафедра русского языка и литературы',phone: '+7 (903) 789-01-23', max_load: 2, blackout_dates: [] },
    { id: 'demo_07', name: 'Волков Андрей Петрович',      dept: 'Кафедра иностранных языков',        phone: '+7 (925) 890-12-34', max_load: 3, blackout_dates: [] },
    { id: 'demo_08', name: 'Лебедева Марина Сергеевна',   dept: 'Кафедра физической культуры',       phone: '+7 (909) 901-23-45', max_load: 2, blackout_dates: [] },
    { id: 'demo_09', name: 'Соколов Павел Евгеньевич',    dept: 'Кафедра экономики и права',         phone: '+7 (911) 012-34-56', max_load: 2, blackout_dates: [] },
    { id: 'demo_10', name: 'Попова Елена Константиновна', dept: 'Кафедра психологии и педагогики',   phone: '+7 (917) 123-45-67', max_load: 3, blackout_dates: [] },
  ];

  const { error } = await sb.from('teachers').upsert(demoTeachers, { onConflict: 'id' });
  if (error) {
    console.error('[seed] Ошибка seedDemoData:', error.message);
    showToast('Ошибка загрузки демо-данных: ' + error.message, 'error');
  } else {
    console.log('[seed] Demo-данные успешно добавлены:', demoTeachers.length, 'преподавателей');
    showToast(`Добавлено ${demoTeachers.length} демо-преподавателей ✓`, 'success');
    await loadTeachers();
    renderTeachersList();
    renderCalendar();
    renderAccordion();
    renderStats();
  }
}


document.addEventListener('DOMContentLoaded', init);


// ══════════════════════════════════════════════════════════════════════════════
// ★ SUPABASE INTEGRATION — АкадемГрафик
//
// Таблицы (создайте в Supabase → SQL Editor):
//
//   CREATE TABLE teachers (
//     id            TEXT PRIMARY KEY,
//     name          TEXT NOT NULL,
//     dept          TEXT NOT NULL,
//     phone         TEXT DEFAULT '',
//     max_load      INT  DEFAULT 2,
//     blackout_dates JSONB DEFAULT '[]'
//   );
//
//   CREATE TABLE schedule (
//     date_key        TEXT PRIMARY KEY,   -- "YYYY-MM-DD"
//     teacher_id      TEXT,
//     replace_request BOOLEAN DEFAULT false
//   );
//
// Realtime: Dashboard → Database → Replication → включить для обеих таблиц.
// RLS: для демо оставьте отключённым, или добавьте политику "Allow all".
// ══════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://ocqteleoxnguuxfivxpu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_jpH1scGDgkLvpVA0USJI_A_8no8yHBx';

let sb        = null;   // Supabase client
let sbChannel = null;   // Realtime channel
let sbReady   = false;  // флаг: облако загружено

// ─── СТАТУС-БАР ──────────────────────────────────────────────────────────────

function setSbStatus(state, msg) {
  const dot  = document.getElementById('sbDot');
  const text = document.getElementById('sbStatusText');
  if (!dot || !text) return;
  dot.className       = `sb-status-dot ${state}`;   // 'connecting' | 'connected' | 'error'
  text.textContent    = `Supabase: ${msg}`;
}

// ─── ИНИЦИАЛИЗАЦИЯ ────────────────────────────────────────────────────────────

async function initSupabase() {
  // SDK загружается через CDN как window.supabase
  const sdk = window.supabase || window.Supabase;
  if (!sdk || typeof sdk.createClient !== 'function') {
    console.warn('[SB] SDK не найден — работаем в режиме localStorage');
    setSbStatus('error', 'SDK не загружен');
    return;
  }

  setSbStatus('connecting', 'подключение…');
  try {
    sb = sdk.createClient(SUPABASE_URL, SUPABASE_KEY, {
      realtime: { params: { eventsPerSecond: 10 } },
    });

    await loadTeachers();
    await loadSchedule();

    subscribeRealtime();
    setSbStatus('connected', 'подключено ✓');
    sbReady = true;
  } catch (err) {
    console.error('[SB] Ошибка инициализации:', err);
    setSbStatus('error', `ошибка: ${err.message}`);
  }
}

// ─── ЗАГРУЗКА ДАННЫХ ─────────────────────────────────────────────────────────

async function loadTeachers() {
  if (!sb) return;
  const { data, error } = await sb
    .from('teachers')
    .select('*')
    .order('name');

  if (error) {
    console.warn('[SB] loadTeachers error:', error.message);
    return;
  }
  if (!data || data.length === 0) return;

  // Маппинг: snake_case БД → camelCase приложения
  State.teachers     = data.map(mapTeacherRow);
  State.blackoutDates = {};
  State.teachers.forEach(t => {
    if (t.blackoutDates?.length) {
      State.blackoutDates[t.id] = t.blackoutDates;
    }
  });

  State.save();           // синхронизируем localStorage как кэш
  renderTeachersList();
}

async function loadSchedule() {
  if (!sb) return;
  const { data, error } = await sb
    .from('schedule')
    .select('date_key, teacher_id, replace_request');

  if (error) {
    console.warn('[SB] loadSchedule error:', error.message);
    return;
  }

  State.duties          = {};
  State.replaceRequests = {};
  (data || []).forEach(r => {
    if (r.teacher_id)      State.duties[r.date_key]          = r.teacher_id;
    if (r.replace_request) State.replaceRequests[r.date_key] = true;
  });

  State.save();
  renderCalendar();
  renderAccordion();
  renderStats();
  renderMyCabinet();
}

// ─── МАППИНГ СТРОКИ БД → ОБЪЕКТ УЧИТЕЛЯ ─────────────────────────────────────

function mapTeacherRow(r) {
  return {
    id:            r.id,
    name:          r.name,
    dept:          r.dept,
    phone:         r.phone || '',
    maxLoad:       r.max_load || 2,
    blackoutDates: Array.isArray(r.blackout_dates) ? r.blackout_dates : [],
  };
}

// ─── ЗАПИСЬ В SUPABASE ───────────────────────────────────────────────────────

async function saveTeachers(teacher) {
  // teacher — один объект или null (если нужно перезаписать всю таблицу — не нужно)
  if (!sb || !teacher) return;
  const { error } = await sb
    .from('teachers')
    .upsert({
      id:             teacher.id,
      name:           teacher.name,
      dept:           teacher.dept,
      phone:          teacher.phone || '',
      max_load:       teacher.maxLoad || 2,
      blackout_dates: State.blackoutDates[teacher.id] || [],
    }, { onConflict: 'id' });
  if (error) console.warn('[SB] saveTeachers error:', error.message);
}

async function deleteTeacherFromSb(id) {
  if (!sb) return;
  // Сначала убираем смены этого преподавателя из schedule
  await sb.from('schedule').update({ teacher_id: null }).eq('teacher_id', id);
  const { error } = await sb.from('teachers').delete().eq('id', id);
  if (error) console.warn('[SB] deleteTeacher error:', error.message);
}

async function saveSchedule(key, teacherId, replaceRequest = false) {
  if (!sb) return;
  if (teacherId) {
    const { error } = await sb
      .from('schedule')
      .upsert({ date_key: key, teacher_id: teacherId, replace_request: replaceRequest },
               { onConflict: 'date_key' });
    if (error) console.warn('[SB] saveSchedule upsert error:', error.message);
  } else {
    const { error } = await sb.from('schedule').delete().eq('date_key', key);
    if (error) console.warn('[SB] saveSchedule delete error:', error.message);
  }
}

async function saveScheduleBatch(rows) {
  // rows = [{ date_key, teacher_id, replace_request }]
  if (!sb || !rows.length) return;
  const { error } = await sb
    .from('schedule')
    .upsert(rows, { onConflict: 'date_key' });
  if (error) console.warn('[SB] saveScheduleBatch error:', error.message);
}

async function deleteScheduleMonth(year, month) {
  // Удаляем все смены месяца из Supabase
  if (!sb) return;
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  // Supabase не поддерживает LIKE через JS SDK напрямую — используем gte/lt
  const from = `${prefix}-01`;
  const to   = `${prefix}-32`;   // заведомо больше любого дня
  const { error } = await sb
    .from('schedule')
    .delete()
    .gte('date_key', from)
    .lte('date_key', to);
  if (error) console.warn('[SB] deleteScheduleMonth error:', error.message);
}

// ─── REALTIME ────────────────────────────────────────────────────────────────

function subscribeRealtime() {
  if (!sb || sbChannel) return;

  sbChannel = sb
    .channel('ag-realtime-v5')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'schedule' },
        onScheduleChange)
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'teachers' },
        onTeacherChange)
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        setSbStatus('connected', 'подключено · Realtime ⚡');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setSbStatus('error', 'Realtime: ошибка канала');
      } else if (status === 'CLOSED') {
        sbChannel = null;   // разрешаем переподключение
        setSbStatus('error', 'Realtime: канал закрыт');
      }
    });
}

// ── Обработчики входящих Realtime событий ────────────────────────────────────

function onScheduleChange({ eventType, new: row, old: oldRow }) {
  const key = row?.date_key ?? oldRow?.date_key;
  if (!key) return;

  if (eventType === 'DELETE') {
    delete State.duties[key];
    delete State.replaceRequests[key];
  } else {
    // INSERT | UPDATE
    if (row.teacher_id) {
      State.duties[key] = row.teacher_id;
    } else {
      delete State.duties[key];
    }

    const wasReplace = !!State.replaceRequests[key];
    if (row.replace_request) {
      State.replaceRequests[key] = true;
      // Показываем уведомление только при новом запросе
      if (!wasReplace) {
        const teacher = teacherById(row.teacher_id);
        if (teacher) {
          const [, mm, dd] = key.split('-');
          const label = `${parseInt(dd)} ${MONTHS_RU_GEN[parseInt(mm) - 1]}`;
          addNotification(`🔄 ${teacher.name} просит замену ${label}`, '🔄');
        }
      }
    } else {
      delete State.replaceRequests[key];
    }
  }

  State.save();
  renderCalendar();
  renderAccordion();
  renderTeachersList();
  renderStats();
  renderMyCabinet();
  flashCell(key);
}

function onTeacherChange({ eventType, new: row, old: oldRow }) {
  if (eventType === 'DELETE') {
    State.teachers = State.teachers.filter(t => t.id !== oldRow.id);
  } else {
    const mapped = mapTeacherRow(row);
    const idx    = State.teachers.findIndex(t => t.id === row.id);
    if (idx >= 0) State.teachers[idx] = { ...State.teachers[idx], ...mapped };
    else          State.teachers.push(mapped);
    // Обновляем blackoutDates
    if (mapped.blackoutDates?.length) {
      State.blackoutDates[mapped.id] = mapped.blackoutDates;
    }
  }

  State.save();
  renderTeachersList();
  renderCalendar();
  renderAccordion();
  renderStats();
}

// ── Визуальная вспышка изменённой ячейки ─────────────────────────────────────

function flashCell(key) {
  const cell = document.querySelector(`.day-cell[data-key="${key}"]`);
  if (!cell) return;
  cell.classList.remove('rt-flash');
  void cell.offsetWidth;    // принудительный reflow для перезапуска анимации
  cell.classList.add('rt-flash');
  setTimeout(() => cell.classList.remove('rt-flash'), 900);
}

// ─── ПЕРЕХВАТ ВСЕХ ФУНКЦИЙ ЗАПИСИ ────────────────────────────────────────────
// Патчим каждую функцию-мутатор: она сначала отрабатывает локально,
// затем асинхронно пишет в Supabase (без блокировки UI).

// ── Назначение / снятие дежурства через модал ──
const _saveModal = saveModal;
window.saveModal = async function () {
  const key = State.selectedCell;
  const tid = State.selectedTeacherId;
  _saveModal();                           // локальное обновление State + render
  await saveSchedule(key, tid || null, !!State.replaceRequests[key]);
};

// ── Быстрое снятие из чипа ──
const _quickClear = quickClear;
window.quickClear = async function (key) {
  _quickClear(key);
  await saveSchedule(key, null, false);
};

// ── Запрос / отмена замены ──
const _toggleReplaceRequest = toggleReplaceRequest;
window.toggleReplaceRequest = async function (key) {
  _toggleReplaceRequest(key);
  const tid = State.duties[key];
  await saveSchedule(key, tid || null, !!State.replaceRequests[key]);
};

// ── Авто-распределение (пакетная запись) ──
const _autoDistribute = autoDistribute;
window.autoDistribute = async function () {
  _autoDistribute();    // синхронная локальная логика уже обновила State.duties
  const y = State.currentDate.getFullYear();
  const m = State.currentDate.getMonth();
  // 1. Стираем старое расписание месяца в БД
  await deleteScheduleMonth(y, m);
  // 2. Пишем новое одним batch-запросом
  const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  const rows = Object.entries(State.duties)
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, v]) => ({ date_key: k, teacher_id: v, replace_request: false }));
  await saveScheduleBatch(rows);
};

// ── Очистка расписания ──
const _clearAll = clearAll;
window.clearAll = async function () {
  const y = State.currentDate.getFullYear();
  const m = State.currentDate.getMonth();
  _clearAll();
  await deleteScheduleMonth(y, m);
};

// ── Добавление через инлайн-форму ──
const _addTeacher = addTeacher;
window.addTeacher = async function () {
  const prevLen = State.teachers.length;
  _addTeacher();
  if (State.teachers.length > prevLen) {
    // Новый преподаватель добавлен последним
    const t = State.teachers[State.teachers.length - 1];
    await saveTeachers(t);
  }
};

// ── Добавление / редактирование через модал ──
const _saveTeacherModal = saveTeacherModal;
window.saveTeacherModal = async function () {
  // Читаем editId ДО вызова оригинала (тот очищает поле)
  const editId = (document.getElementById('tEditId')?.value || '').trim();
  _saveTeacherModal();
  // После оригинала ищем нужного учителя
  const t = editId
    ? teacherById(editId)
    : State.teachers[State.teachers.length - 1];
  if (t) await saveTeachers(t);
};

// ── Удаление преподавателя ──
const _removeTeacher = removeTeacher;
window.removeTeacher = async function (id) {
  _removeTeacher(id);
  await deleteTeacherFromSb(id);
};

// ── Добавление нежелательной даты ──
const _addBlackoutDate = addBlackoutDate;
window.addBlackoutDate = async function () {
  const tid = State.currentTeacherId;
  _addBlackoutDate();
  const t = teacherById(tid);
  if (t) await saveTeachers(t);
};

// ── Удаление нежелательной даты (патчим через делегирование в renderMyCabinet) ──
// renderMyCabinet уже использует State.blackoutDates — достаточно перехватить
// moment после клика на .blackout-remove
const _renderMyCabinet = renderMyCabinet;
window.renderMyCabinet = function () {
  _renderMyCabinet();
  // Навешиваем обёртку на каждую кнопку удаления
  document.querySelectorAll('.blackout-remove').forEach(btn => {
    const origClick = btn.onclick;   // уже назначен внутри _renderMyCabinet
    btn.addEventListener('click', async () => {
      const tid = State.currentTeacherId;
      const t   = teacherById(tid);
      if (t) await saveTeachers(t);
    }, { once: true });
  });
};

