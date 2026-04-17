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
  replaceRequests: {},
  blackoutDates: {},
  notifications: [],
  lessons: {},
  currentRole: 'admin',
  currentTeacherId: null,
  currentDate: new Date(),
  selectedCell: null,
  selectedTeacherId: null,
  modalMode: 'assign',
  activeDayKey: null,
  welcomed: false,        // ← показан ли экран выбора роли

  avatarColors: [
    '#2C6FAC','#1A7A4A','#8E44AD','#C0392B',
    '#D35400','#16869A','#7D6608','#1E5799',
    '#5D4037','#2E7D6F'
  ],

  save() {
    try {
      localStorage.setItem('ag_teachers',  JSON.stringify(this.teachers));
      localStorage.setItem('ag_duties',    JSON.stringify(this.duties));
      localStorage.setItem('ag_replace',   JSON.stringify(this.replaceRequests));
      localStorage.setItem('ag_blackout',  JSON.stringify(this.blackoutDates));
      localStorage.setItem('ag_notifs',    JSON.stringify(this.notifications));
      localStorage.setItem('ag_lessons',   JSON.stringify(this.lessons));
    } catch(e) { console.warn('LocalStorage save failed', e); }
  },

  load() {
    try {
      const t = localStorage.getItem('ag_teachers');
      const d = localStorage.getItem('ag_duties');
      const r = localStorage.getItem('ag_replace');
      const b = localStorage.getItem('ag_blackout');
      const n = localStorage.getItem('ag_notifs');
      const l = localStorage.getItem('ag_lessons');
      if (t) this.teachers        = JSON.parse(t);
      if (d) this.duties          = JSON.parse(d);
      if (r) this.replaceRequests = JSON.parse(r);
      if (b) this.blackoutDates   = JSON.parse(b);
      if (n) this.notifications   = JSON.parse(n);
      if (l) this.lessons         = JSON.parse(l);
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
// ─── MULTI-DUTY HELPERS ───────────────────────────────────────────────────────
// duties[key] — массив, каждый элемент может быть строкой (legacy) или {tid, dept}

/** Нормализует запись к {tid, dept} */
function normEntry(entry) {
  if (typeof entry === 'string') return { tid: entry, dept: null };
  return { tid: entry.tid || entry.id || '', dept: entry.dept || null };
}

/** Возвращает массив нормализованных записей для даты */
function getDutyEntries(key) {
  const v = State.duties[key];
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.map(normEntry);
}

/** Возвращает только массив teacher IDs (для обратной совместимости) */
function getDutyIds(key) {
  return getDutyEntries(key).map(e => e.tid);
}

/**
 * Добавляет преподавателя к дежурству.
 * Один и тот же tid может появляться несколько раз с разными dept.
 */
function addDuty(key, tid, dept = null) {
  const entries = getDutyEntries(key);
  // Если тот же tid + та же dept — не дублируем
  const alreadySame = entries.some(e => e.tid === tid && (e.dept || null) === (dept || null));
  if (!alreadySame) entries.push({ tid, dept: dept || null });
  State.duties[key] = entries;
}

/** Удаляет конкретную запись (tid + dept) */
function removeDuty(key, tid, dept = null) {
  const entries = getDutyEntries(key).filter(e => {
    if (e.tid !== tid) return true;
    // Если dept передан — удаляем только совпадающую запись
    if (dept !== null) return (e.dept || null) !== (dept || null);
    return false;  // dept не задан — удаляем первое совпадение
  });
  if (entries.length) State.duties[key] = entries;
  else delete State.duties[key];
}

/** Полностью очищает день */
function clearDutyDay(key) {
  delete State.duties[key];
  delete State.replaceRequests[key];
}

function weekDutiesCount(tid, weekKeys) {
  return weekKeys.filter(k => getDutyIds(k).includes(tid)).length;
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
    // Принудительно переключаем на calendar и закрываем панель
    closeDayPanel();
    switchTab('calendar');
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

    // ── Compact avatar grid (no text) ─────────────────────────────────
    const dutyEntries = getDutyEntries(key);
    if (!isHoliday && dutyEntries.length > 0) {
      const avatarGrid = document.createElement('div');
      avatarGrid.className = 'cell-avatar-grid';
      dutyEntries.forEach(entry => {
        const teacher = teacherById(entry.tid);
        if (!teacher) return;
        const color = getColor(teacherIndex(entry.tid));
        const av = document.createElement('div');
        av.className = 'cell-avatar';
        av.style.background = color;
        av.textContent = initials(teacher.name);
        av.title = teacher.name + (entry.dept ? ' · ' + entry.dept : '');
        av.addEventListener('click', e => { e.stopPropagation(); openTeacherInfoModal(entry.tid); });
        avatarGrid.appendChild(av);
      });
      cell.appendChild(avatarGrid);
      // Detect overflow after paint to show fade
      requestAnimationFrame(() => {
        if (avatarGrid.scrollHeight > avatarGrid.clientHeight + 2) {
          avatarGrid.classList.add('has-overflow');
        }
      });
    } else if (!isHoliday && State.currentRole === 'admin') {
      const hint = document.createElement('div');
      hint.className = 'add-hint';
      hint.textContent = '+';
      cell.appendChild(hint);
    }

    if (!isHoliday) {
      cell.addEventListener('click', (e) => {
        if (e.target.closest('.cell-avatar')) return; // аватар обрабатывается отдельно
        openDayPanel(key);
      });
      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDayPanel(key); }
      });
    }

    grid.appendChild(cell);
  }
}

// ─── CHIP ACTIONS ─────────────────────────────────────────────────────────────

function handleChipAction(action, key, tid, actionBtn) {
  const [ky, km, kd] = key.split('-').map(Number);

  if (action === 'clear') {
    quickClear(key);
  } else if (action === 'remove-one' && tid) {
    const dept = actionBtn?.dataset?.dept || null;
    removeDuty(key, tid, dept || null);
    State.save();
    renderCalendar(); renderAccordion(); renderTeachersList(); renderStats(); renderMyCabinet();
    showToast('Преподаватель снят с дежурства', 'info');
    saveScheduleRemoveOne(key, tid);
  } else if (action === 'replace') {
    openModal(key, kd, km - 1, ky, 'assign');
  } else if (action === 'toggle-replace') {
    toggleReplaceRequest(key);
  }
}

function quickClear(key) {
  clearDutyDay(key);
  State.save();
  renderCalendar();
  renderAccordion();
  renderTeachersList();
  renderStats();
  renderMyCabinet();
  showToast('Дежурство снято', 'info');
}

function toggleReplaceRequest(key) {
  const ids = getDutyIds(key);
  if (!ids.length) return;
  const teacher = teacherById(State.currentTeacherId && ids.includes(State.currentTeacherId) ? State.currentTeacherId : ids[0]);

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
      getDutyIds(key).length > 0 && dow !== 0 && dow !== 6 && !getHolidayName(key)).length;

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
      const dutyEntries = getDutyEntries(key);
      const dutyIds     = dutyEntries.map(e => e.tid);
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
      } else if (dutyEntries.length > 0) {
        contentHtml = dutyEntries.map(entry => {
          const teacher = teacherById(entry.tid);
          if (!teacher) return '';
          const idx = teacherIndex(entry.tid);
          const color = getColor(idx);
          const isMyDutyHere = entry.tid === tid;
          const deptLabel = entry.dept || teacher.dept || '';
          const replaceBadge = (isReplace && isMyDutyHere)
            ? '<div style="font-size:.68rem;color:var(--orange);margin-top:3px">🔄 Просит замену</div>' : '';
          return `<div class="acc-duty-chip${isReplace && isMyDutyHere ? ' replace' : ''}"
               style="border-left-color:${color};background:${isReplace && isMyDutyHere ? '' : color + '12'};border-color:${isReplace && isMyDutyHere ? '' : color + '40'};margin-bottom:4px">
            <div class="acc-duty-name">${teacher.name}</div>
            <div class="acc-duty-dept">${deptLabel}</div>
            ${teacher.phone ? `<div class="acc-duty-dept">${teacher.phone}</div>` : ''}
            ${replaceBadge}
          </div>`;
        }).join('');
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
          actionBtn = `<button class="acc-action-btn" data-action="assign" data-key="${key}">+</button>`;
        } else if (State.currentRole === 'teacher' && dutyIds.includes(tid)) {
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
  State.selectedTeacherId = null;
  State.modalMode         = 'assign';

  const overlay  = document.getElementById('modalOverlay');
  const title    = document.getElementById('modalTitle');
  const body     = document.getElementById('modalBody');

  title.textContent = `${day} ${MONTHS_RU_GEN[month]} ${year}`;

  const prevKey  = shiftDay(key, -1);
  const nextKey  = shiftDay(key, +1);
  const weekKeys = getWeekKeys(key);
  const assignedEntries = getDutyEntries(key);

  let html = `<div class="modal-date-label">${String(day).padStart(2,'0')}.${String(month+1).padStart(2,'0')}.${year}</div>`;

  // Список уже назначенных (teacher + dept)
  if (assignedEntries.length > 0) {
    html += `<div class="modal-assigned-list">`;
    assignedEntries.forEach(entry => {
      const { tid: tid2, dept: dept2 } = entry;
      const t = teacherById(tid2);
      if (!t) return;
      const color = getColor(teacherIndex(tid2));
      const deptLabel = dept2 || t.dept || '';
      html += `<div class="modal-assigned-row">
        <div class="opt-avatar" style="background:${color};width:28px;height:28px;font-size:.7rem;cursor:pointer"
             onclick="openTeacherInfoModal('${tid2}')" title="О преподавателе">${initials(t.name)}</div>
        <div style="flex:1;min-width:0">
          <span class="modal-assigned-name">${t.name.split(' ').slice(0,2).join(' ')}</span>
          ${deptLabel ? `<span style="display:block;font-size:.7rem;color:var(--text-muted);font-family:var(--font-mono)">${deptLabel}</span>` : ''}
        </div>
        <button class="modal-remove-one" data-tid="${tid2}" data-dept="${dept2||''}" title="Снять">✕</button>
      </div>`;
    });
    html += `</div>`;
    html += `<div class="modal-section-label">Добавить ещё преподавателя:</div>`;
  }

  if (State.teachers.length === 0) {
    html += `<div class="empty-state" style="padding:1rem 0">
      <div class="empty-icon">👤</div>
      <p class="empty-title">Нет преподавателей</p>
      <p class="empty-sub">Перейдите во вкладку «Преподаватели»</p>
    </div>`;
  } else {
    html += `<div class="teacher-options" role="listbox">`;
    State.teachers.forEach((t, idx) => {
      const color      = getColor(idx);
      const wc         = weekDutiesCount(t.id, weekKeys);
      const overloaded = wc >= t.maxLoad;
      const selected   = State.selectedTeacherId === t.id;
      const depts      = Array.isArray(t.depts) && t.depts.length ? t.depts : [t.dept].filter(Boolean);

      let badge = '';
      if (overloaded) badge = `<span class="conflict-tag conflict-tag--overload">перегруз</span>`;

      // Выпадающий список кафедр если их несколько
      const deptSelector = depts.length > 1
        ? `<select class="dept-sel" data-tid="${t.id}" style="font-size:.7rem;border:1px solid var(--border);border-radius:4px;padding:2px 4px;margin-top:3px;max-width:100%;background:var(--surface)">
            ${depts.map(d => `<option value="${d.replace(/"/g,'&quot;')}">${d}</option>`).join('')}
           </select>`
        : `<span style="font-size:.72rem;color:var(--text-muted)">${depts[0]||''}</span>`;

      html += `<button class="teacher-option${selected ? ' selected' : ''}"
                       data-id="${t.id}"
                       role="option" aria-selected="${selected}">
        <div class="opt-avatar" style="background:${color}" 
             onclick="event.stopPropagation();openTeacherInfoModal('${t.id}')"
             title="Инфо о преподавателе" role="button" tabindex="0">${initials(t.name)}</div>
        <div class="opt-info">
          <div class="opt-name">${t.name}</div>
          <div class="opt-meta">нед: ${wc}/${t.maxLoad}${t.phone ? ' · ' + t.phone : ''}</div>
          ${deptSelector}
        </div>
        ${badge}
      </button>`;
    });
    html += `</div>`;
  }

  html += `<div class="modal-actions">
    <button class="btn-modal-clear" id="modalClearAllBtn">Очистить день</button>
    <button class="btn-modal-save" id="modalSaveBtn">Добавить</button>
  </div>`;

  body.innerHTML = html;

  // Снять одного назначенного
  body.querySelectorAll('.modal-remove-one[data-tid]').forEach(btn => {
    btn.addEventListener('click', () => {
      const dept = btn.dataset.dept || null;
      removeDuty(key, btn.dataset.tid, dept || null);
      State.save();
      openModal(key, day, month, year, 'assign');
      renderCalendar(); renderAccordion(); renderTeachersList(); renderStats(); renderMyCabinet();
    });
  });

  body.querySelectorAll('.teacher-option:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      body.querySelectorAll('.teacher-option').forEach(b => {
        b.classList.remove('selected'); b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('selected');
      btn.setAttribute('aria-selected', 'true');
      State.selectedTeacherId = btn.dataset.id;
    });
  });

  const saveBtn = document.getElementById('modalSaveBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveModal);

  const clearAllBtn = document.getElementById('modalClearAllBtn');
  if (clearAllBtn) clearAllBtn.addEventListener('click', () => {
    clearDutyDay(key);
    State.save();
    closeModal('modalOverlay');
    renderCalendar(); renderAccordion(); renderTeachersList(); renderStats(); renderMyCabinet();
    showToast('День очищен', 'info');
  });

  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');

  setTimeout(() => {
    const first = body.querySelector('button:not([disabled])');
    if (first) first.focus();
  }, 60);
}

function saveModal() {
  const key = State.selectedCell;
  if (State.selectedTeacherId) {
    // Получаем выбранную кафедру из выпадающего списка (если есть)
    const deptSel = document.querySelector(`.dept-sel[data-tid="${State.selectedTeacherId}"]`);
    const chosenDept = deptSel ? deptSel.value : null;
    addDuty(key, State.selectedTeacherId, chosenDept);
    showToast('Дежурство добавлено', 'success');
  }
  State.save();
  closeModal('modalOverlay');
  renderCalendar(); renderAccordion(); renderTeachersList(); renderStats(); renderMyCabinet();
}

// ─── AUTH / WELCOME SYSTEM ────────────────────────────────────────────────────

const ADMIN_LOGIN    = '123';
const ADMIN_PASSWORD = '123';

/** Показывает приветственный экран при первом входе */
function showWelcomeScreen() {
  const overlay = document.getElementById('welcomeOverlay');
  if (overlay) overlay.classList.add('open');
}

function hideWelcomeScreen() {
  const overlay = document.getElementById('welcomeOverlay');
  if (overlay) overlay.classList.remove('open');
}

/** Открывает модал входа для Завуча */
function showAdminLoginModal(onSuccess) {
  const overlay = document.getElementById('authModalOverlay');
  const body    = document.getElementById('authModalBody');
  if (!overlay || !body) return;

  body.innerHTML = `
    <div style="text-align:center;margin-bottom:1.5rem">
      <div style="font-size:2.5rem;margin-bottom:.5rem">🔐</div>
      <h2 style="font-family:var(--font-display);color:var(--navy);font-size:1.3rem">Вход для Завуча</h2>
      <p style="font-size:.82rem;color:var(--text-muted);margin-top:.25rem">Введите логин и пароль</p>
    </div>
    <div style="display:flex;flex-direction:column;gap:.75rem">
      <input class="field-input" type="text" id="authLogin" placeholder="Логин" autocomplete="username" style="font-size:1rem"/>
      <input class="field-input" type="password" id="authPassword" placeholder="Пароль" autocomplete="current-password" style="font-size:1rem"/>
      <div style="display:flex;align-items:center;gap:.75rem;margin-top:.25rem">
        <button class="btn-modal-save" id="authSubmitBtn" style="flex:1;padding:.7rem">Войти</button>
        <span id="authStatus" style="font-size:1.4rem;width:28px;text-align:center;flex-shrink:0"></span>
      </div>
      <button class="btn-modal-clear" id="authCancelBtn" style="margin-top:.25rem">Отмена</button>
    </div>`;

  const doLogin = () => {
    const login = (document.getElementById('authLogin')?.value || '').trim();
    const pass  = (document.getElementById('authPassword')?.value || '').trim();
    const status = document.getElementById('authStatus');
    if (login === ADMIN_LOGIN && pass === ADMIN_PASSWORD) {
      status.textContent = '✅';
      setTimeout(() => {
        hideAuthModal();
        onSuccess && onSuccess();
      }, 400);
    } else {
      status.textContent = '❌';
      document.getElementById('authPassword').value = '';
      setTimeout(() => { if (status) status.textContent = ''; }, 1500);
    }
  };

  body.querySelector('#authSubmitBtn').addEventListener('click', doLogin);
  body.querySelector('#authCancelBtn').addEventListener('click', hideAuthModal);
  body.querySelector('#authPassword').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  setTimeout(() => document.getElementById('authLogin')?.focus(), 60);
}

/** Открывает выбор преподавателя */
function showTeacherPickerModal(onSuccess) {
  const overlay = document.getElementById('authModalOverlay');
  const body    = document.getElementById('authModalBody');
  if (!overlay || !body) return;

  if (State.teachers.length === 0) {
    showToast('Преподаватели ещё не добавлены', 'error');
    return;
  }

  body.innerHTML = `
    <div style="text-align:center;margin-bottom:1.25rem">
      <div style="font-size:2.5rem;margin-bottom:.5rem">👤</div>
      <h2 style="font-family:var(--font-display);color:var(--navy);font-size:1.3rem">Выберите преподавателя</h2>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow-y:auto">
      ${State.teachers.map(t => {
        const color = getColor(teacherIndex(t.id));
        return `<button class="teacher-picker-btn" data-tid="${t.id}" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);cursor:pointer;transition:background .15s;text-align:left">
          <div style="width:36px;height:36px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700;color:#fff;flex-shrink:0">${initials(t.name)}</div>
          <div>
            <div style="font-size:.9rem;font-weight:600;color:var(--navy)">${t.name}</div>
            <div style="font-size:.75rem;color:var(--text-muted)">${t.dept}</div>
          </div>
        </button>`;
      }).join('')}
    </div>
    <button class="btn-modal-clear" id="authCancelBtn" style="margin-top:1rem;width:100%">Отмена</button>`;

  body.querySelectorAll('.teacher-picker-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => btn.style.background = 'var(--surface-2)');
    btn.addEventListener('mouseleave', () => btn.style.background = 'var(--surface)');
    btn.addEventListener('click', () => {
      State.currentTeacherId = btn.dataset.tid;
      hideAuthModal();
      onSuccess && onSuccess();
    });
  });
  body.querySelector('#authCancelBtn').addEventListener('click', hideAuthModal);

  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
}

function hideAuthModal() {
  const overlay = document.getElementById('authModalOverlay');
  if (overlay) { overlay.classList.remove('open'); overlay.setAttribute('aria-hidden', 'true'); }
}

/** Вызывается при клике на "Завуч" в шапке */
function handleRoleSwitchAdmin() {
  if (State.currentRole === 'admin') return;
  showAdminLoginModal(() => {
    applyRole('admin');
  });
}

/** Вызывается при клике на "Преподаватель" в шапке */
function handleRoleSwitchTeacher() {
  if (State.currentRole === 'teacher') return;
  if (State.teachers.length === 0) { showToast('Сначала добавьте преподавателей', 'error'); return; }
  showTeacherPickerModal(() => {
    applyRole('teacher');
  });
}

// ─────────────────────────────────────────────────────────────────────────────

// ─── DAY DETAIL PANEL ────────────────────────────────────────────────────────

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); }
  if (id === 'modalOverlay') State.selectedCell = null;
}

const PAIRS = [
  { n: 1, time: '08:30 – 10:00' },
  { n: 2, time: '10:20 – 11:50' },
  { n: 3, time: '12:20 – 13:50' },
  { n: 4, time: '14:10 – 15:40' },
  { n: 5, time: '16:00 – 17:30' },
  { n: 6, time: '17:50 – 19:20' },
];

/** Возвращает массив записей пары (создаёт если нет) */
function getPairEntries(key, pairN) {
  if (!State.lessons[key]) State.lessons[key] = {};
  if (!State.lessons[key][pairN]) State.lessons[key][pairN] = [];
  return State.lessons[key][pairN];
}

function openDayPanel(key) {
  State.activeDayKey = key;
  const panel = document.getElementById('dayPanel');
  if (!panel) return;
  renderDayPanel(key);
  panel.classList.add('open');
  document.getElementById('dayPanelBackdrop').classList.add('open');
  document.body.classList.add('panel-open');
  document.querySelectorAll('.day-cell').forEach(c => c.classList.remove('day-cell--active'));
  const cell = document.querySelector(`.day-cell[data-key="${key}"]`);
  if (cell) cell.classList.add('day-cell--active');
}

function closeDayPanel() {
  State.activeDayKey = null;
  const panel = document.getElementById('dayPanel');
  if (panel) panel.classList.remove('open');
  const bd = document.getElementById('dayPanelBackdrop');
  if (bd) bd.classList.remove('open');
  document.body.classList.remove('panel-open');
  document.querySelectorAll('.day-cell').forEach(c => c.classList.remove('day-cell--active'));
}

function renderDayPanel(key) {
  const panel = document.getElementById('dayPanel');
  if (!panel) return;

  const [y, mm, dd] = key.split('-').map(Number);
  const dateObj = new Date(y, mm - 1, dd);
  const dayName = DAYS_FULL[dateObj.getDay()];
  const dateLabel = `${dd} ${MONTHS_RU_GEN[mm - 1]} ${y}`;
  const isHoliday = !!getHolidayName(key);
  const dutyEntries = getDutyEntries(key);
  const isAdmin = State.currentRole === 'admin';

  // Header
  panel.querySelector('.day-panel-title').textContent = `${dayName}, ${dateLabel}`;

  // Дежурные на весь день (avatar strip)
  const dutyStrip = panel.querySelector('.day-panel-duty-strip');
  if (dutyEntries.length > 0) {
    dutyStrip.innerHTML = `<div style="font-size:.72rem;color:var(--text-muted);font-family:var(--font-mono);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Дежурные</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px">` +
      dutyEntries.map(e => {
        const t = teacherById(e.tid);
        if (!t) return '';
        const color = getColor(teacherIndex(e.tid));
        return `<div style="display:flex;align-items:center;gap:5px;background:${color}14;border:1px solid ${color}40;border-radius:20px;padding:3px 10px 3px 4px;cursor:pointer" onclick="openTeacherInfoModal('${e.tid}')">
          <div style="width:22px;height:22px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:.58rem;font-weight:700;color:#fff;flex-shrink:0">${initials(t.name)}</div>
          <span style="font-size:.75rem;font-weight:500;color:var(--navy)">${t.name.split(' ').slice(0,2).join(' ')}</span>
          ${isAdmin ? `<button onclick="event.stopPropagation();removeDutyFromPanel('${key}','${e.tid}','${e.dept||''}')" style="background:none;border:none;color:var(--text-faint);cursor:pointer;font-size:.8rem;padding:0 0 0 2px" title="Убрать">✕</button>` : ''}
        </div>`;
      }).join('') +
      `</div>` +
      (isAdmin ? `<button class="day-panel-add-btn" onclick="openModal('${key}',${dd},${mm-1},${y},'assign')">+ Добавить дежурного</button>` : '');
  } else {
    dutyStrip.innerHTML = isHoliday
      ? `<div class="day-panel-holiday">🏛 ${getHolidayName(key)}</div>`
      : `<div style="font-size:.82rem;color:var(--text-faint);font-style:italic">Дежурных не назначено</div>
         ${isAdmin ? `<button class="day-panel-add-btn" onclick="openModal('${key}',${dd},${mm-1},${y},'assign')">+ Назначить дежурного</button>` : ''}`;
  }

  // Pairs / Расписание пар
  const pairsEl = panel.querySelector('.day-panel-pairs');
  pairsEl.innerHTML = PAIRS.map(p => {
    const entries = getPairEntries(key, p.n);
    const entriesHtml = entries.length
      ? entries.map((e, i) => {
          const t = teacherById(e.tid);
          if (!t) return '';
          const color = getColor(teacherIndex(e.tid));
          return `<div class="pair-teacher-row">
            <div style="width:28px;height:28px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:700;color:#fff;flex-shrink:0;cursor:pointer" onclick="openTeacherInfoModal('${e.tid}')">${initials(t.name)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:.82rem;font-weight:600;color:var(--navy)">${t.name.split(' ').slice(0,2).join(' ')}</div>
              <div style="font-size:.7rem;color:var(--text-muted);font-family:var(--font-mono)">${e.dept || t.dept || ''}${e.room ? ' · 🚪 ' + e.room : ''}</div>
            </div>
            ${isAdmin ? `<button class="pair-remove-btn" onclick="removePairEntry('${key}',${p.n},${i})" title="Удалить">✕</button>` : ''}
          </div>`;
        }).join('')
      : `<div style="font-size:.75rem;color:var(--text-faint);font-style:italic;padding:4px 0">— свободно —</div>`;

    return `<details class="pair-block" ${entries.length ? 'open' : ''}>
      <summary class="pair-summary">
        <span class="pair-num">Пара ${p.n}</span>
        <span class="pair-time">${p.time}</span>
        <span class="pair-count">${entries.length > 0 ? entries.length + ' преп.' : ''}</span>
        <span class="pair-chevron">▾</span>
      </summary>
      <div class="pair-body">
        <div class="pair-teachers-list" id="pair-list-${key}-${p.n}">${entriesHtml}</div>
        ${isAdmin ? `<div class="pair-add-row" id="pair-add-${key}-${p.n}">
          <div class="select-wrap" style="flex:1;min-width:0">
            <select class="field-input field-select pair-teacher-sel" style="height:32px;font-size:.78rem" id="pair-tsel-${key}-${p.n}">
              <option value="">— Преподаватель —</option>
              ${State.teachers.map(t => `<option value="${t.id}">${t.name.split(' ').slice(0,2).join(' ')}</option>`).join('')}
            </select>
          </div>
          <input class="field-input" placeholder="Кабинет" style="width:72px;height:32px;font-size:.78rem" id="pair-room-${key}-${p.n}"/>
          <button class="day-panel-add-btn" style="padding:0 10px;height:32px;font-size:.75rem" onclick="addPairEntry('${key}',${p.n})">+</button>
        </div>` : ''}
      </div>
    </details>`;
  }).join('');
}

function removeDutyFromPanel(key, tid, dept) {
  removeDuty(key, tid, dept || null);
  State.save();
  renderDayPanel(key);
  renderCalendar();
  renderAccordion();
  renderTeachersList();
  renderStats();
}

function addPairEntry(key, pairN) {
  const tSel = document.getElementById(`pair-tsel-${key}-${pairN}`);
  const roomEl = document.getElementById(`pair-room-${key}-${pairN}`);
  const tid = tSel?.value;
  if (!tid) { showToast('Выберите преподавателя', 'error'); return; }
  const t = teacherById(tid);
  const depts = Array.isArray(t?.depts) && t.depts.length ? t.depts : [t?.dept].filter(Boolean);
  const room = (roomEl?.value || '').trim();
  const entries = getPairEntries(key, pairN);
  entries.push({ tid, dept: depts[0] || '', room });
  State.save();
  renderDayPanel(key);
  showToast('Преподаватель добавлен в пару', 'success');
}

function removePairEntry(key, pairN, idx) {
  const entries = getPairEntries(key, pairN);
  entries.splice(idx, 1);
  State.save();
  renderDayPanel(key);
}

// ─── GLOBAL DEPARTMENT REGISTRY ──────────────────────────────────────────────
// Список кафедр — глобальный, редактируется пользователем, хранится в localStorage

const DEFAULT_DEPTS = [
  'Кафедра информатики и ВТ',
  'Кафедра математики',
  'Кафедра физики',
  'Кафедра химии и биологии',
  'Кафедра истории и обществознания',
  'Кафедра русского языка и литературы',
  'Кафедра иностранных языков',
  'Кафедра физической культуры',
  'Кафедра экономики и права',
  'Кафедра психологии и педагогики',
];

function loadGlobalDepts() {
  try {
    const d = localStorage.getItem('ag_depts');
    return d ? JSON.parse(d) : [...DEFAULT_DEPTS];
  } catch { return [...DEFAULT_DEPTS]; }
}
function saveGlobalDepts(depts) {
  try { localStorage.setItem('ag_depts', JSON.stringify(depts)); } catch {}
}
let globalDepts = loadGlobalDepts();

/**
 * Рендерит блок управления кафедрами внутри teacher modal.
 * @param {string[]} selected — текущие кафедры редактируемого преподавателя
 */
function renderDeptManager(selected) {
  const container = document.getElementById('tDeptsSection');
  if (!container) return;

  const selectedList = selected.length
    ? selected.map((d, i) => `
        <div class="dept-tag" style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <input class="field-input" style="flex:1;height:32px;font-size:.8rem" value="${d.replace(/"/g,'&quot;')}" data-dept-i="${i}"/>
          <button type="button" class="modal-remove-one" data-dept-del="${i}" title="Удалить кафедру">✕</button>
        </div>`).join('')
    : '<div style="font-size:.78rem;color:var(--text-faint);padding:4px 0">Нет кафедр</div>';

  container.innerHTML = `
    <label class="field-label">Кафедры <span class="required">*</span></label>
    <div id="tDeptsList">${selectedList}</div>
    <div style="display:flex;gap:6px;margin-top:6px;align-items:center;flex-wrap:wrap">
      <div class="select-wrap" style="flex:1;min-width:120px">
        <select class="field-input field-select" id="tDeptPickSel" style="height:34px;font-size:.8rem">
          <option value="">— выбрать из списка —</option>
          ${globalDepts.map(d => `<option value="${d.replace(/"/g,'&quot;')}">${d}</option>`).join('')}
        </select>
        <svg class="select-arrow" viewBox="0 0 16 16" fill="none" width="12" height="12"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <button type="button" class="btn btn--outline" id="tDeptAddFromList" style="padding:.3rem .7rem;font-size:.78rem;height:34px">+ Добавить</button>
    </div>
    <div style="display:flex;gap:6px;margin-top:4px;align-items:center">
      <input class="field-input" id="tDeptNewInput" placeholder="Новая кафедра…" style="flex:1;height:32px;font-size:.8rem"/>
      <button type="button" class="btn btn--outline" id="tDeptAddNew" style="padding:.3rem .7rem;font-size:.78rem;height:34px;white-space:nowrap">+ Создать</button>
    </div>`;

  // Редактирование названия кафедры
  container.querySelectorAll('[data-dept-i]').forEach(input => {
    input.addEventListener('change', () => {
      const i = parseInt(input.dataset.deptI);
      _modalDepts[i] = input.value.trim();
    });
  });

  // Удаление кафедры из списка преподавателя
  container.querySelectorAll('[data-dept-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.deptDel);
      _modalDepts.splice(i, 1);
      renderDeptManager(_modalDepts);
    });
  });

  // Добавить из глобального списка
  document.getElementById('tDeptAddFromList').addEventListener('click', () => {
    const val = document.getElementById('tDeptPickSel').value;
    if (!val) return;
    if (!_modalDepts.includes(val)) { _modalDepts.push(val); renderDeptManager(_modalDepts); }
    else showToast('Уже добавлено', 'info');
  });

  // Создать новую кафедру и добавить глобально
  document.getElementById('tDeptAddNew').addEventListener('click', () => {
    const val = (document.getElementById('tDeptNewInput').value || '').trim();
    if (!val) return;
    if (!globalDepts.includes(val)) { globalDepts.push(val); saveGlobalDepts(globalDepts); }
    if (!_modalDepts.includes(val)) { _modalDepts.push(val); renderDeptManager(_modalDepts); }
    else showToast('Уже добавлено', 'info');
  });
}

let _modalDepts = [];   // временное хранилище кафедр при редактировании

// ─── TEACHER INFO POPUP ───────────────────────────────────────────────────────

function openTeacherInfoModal(tid) {
  const t = teacherById(tid);
  if (!t) return;
  const color = getColor(teacherIndex(tid));

  const depts = Array.isArray(t.depts) && t.depts.length ? t.depts : [t.dept].filter(Boolean);
  const deptsHtml = depts.map(d =>
    `<span style="display:inline-block;background:${color}18;border:1px solid ${color}40;border-radius:12px;padding:3px 10px;font-size:.78rem;margin:2px">${d}</span>`
  ).join('');

  const y = State.currentDate.getFullYear();
  const m = State.currentDate.getMonth();
  const prefix = `${y}-${String(m+1).padStart(2,'0')}`;
  const dutyCount = Object.keys(State.duties).filter(k => k.startsWith(prefix) && getDutyIds(k).includes(tid)).length;

  const blackouts = (State.blackoutDates[tid] || []).sort().map(k => {
    const d = new Date(k + 'T00:00:00');
    return `${d.getDate()} ${MONTHS_RU_GEN[d.getMonth()]}`;
  });

  document.getElementById('teacherInfoBody').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:1.25rem">
      <div style="width:56px;height:56px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:700;color:#fff;flex-shrink:0">${initials(t.name)}</div>
      <div>
        <div style="font-size:1.05rem;font-weight:700;color:var(--navy)">${t.name}</div>
        ${t.phone ? `<div style="font-size:.82rem;color:var(--text-muted);font-family:var(--font-mono);margin-top:3px">📞 ${t.phone}</div>` : ''}
      </div>
    </div>
    <div style="margin-bottom:.75rem">
      <div class="modal-section-label" style="margin-bottom:6px">Кафедры</div>
      <div>${deptsHtml || '<span style="color:var(--text-faint);font-size:.82rem">—</span>'}</div>
    </div>
    <div style="display:flex;gap:1rem;margin-bottom:.75rem">
      <div style="flex:1;background:var(--surface-2);border-radius:var(--radius-sm);padding:10px;text-align:center">
        <div style="font-size:1.5rem;font-weight:700;color:${color}">${dutyCount}</div>
        <div style="font-size:.7rem;color:var(--text-muted);font-family:var(--font-mono)">дежурств в месяце</div>
      </div>
      <div style="flex:1;background:var(--surface-2);border-radius:var(--radius-sm);padding:10px;text-align:center">
        <div style="font-size:1.5rem;font-weight:700;color:${color}">${t.maxLoad}</div>
        <div style="font-size:.7rem;color:var(--text-muted);font-family:var(--font-mono)">макс. дн/нед</div>
      </div>
    </div>
    ${blackouts.length ? `<div>
      <div class="modal-section-label" style="margin-bottom:6px">🚫 Нежелательные даты</div>
      <div style="font-size:.8rem;color:var(--text-secondary);font-family:var(--font-mono)">${blackouts.join(', ')}</div>
    </div>` : ''}
    <div class="modal-actions" style="margin-top:1.25rem">
      <button class="btn-modal-clear" onclick="closeModal('teacherInfoOverlay')">Закрыть</button>
      <button class="btn-modal-save" onclick="closeModal('teacherInfoOverlay');openTeacherModal('${tid}')">✏️ Редактировать</button>
    </div>`;

  const overlay = document.getElementById('teacherInfoOverlay');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
}

// ─── TEACHER MODAL (Add / Edit Popup) ────────────────────────────────────────

function openTeacherModal(editId = null) {
  const overlay = document.getElementById('teacherModalOverlay');
  const title   = document.getElementById('teacherModalTitle');
  document.getElementById('tEditId').value = editId || '';

  if (editId) {
    const t = teacherById(editId);
    title.textContent = 'Редактировать преподавателя';
    document.getElementById('tName').value  = t.name || '';
    document.getElementById('tPhone').value = t.phone || '';
    document.getElementById('tLoad').value  = t.maxLoad || 2;
    _modalDepts = Array.isArray(t.depts) && t.depts.length ? [...t.depts] : [t.dept].filter(Boolean);
  } else {
    title.textContent = 'Добавить преподавателя';
    ['tName','tPhone'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('tLoad').value = 2;
    _modalDepts = [];
  }

  renderDeptManager(_modalDepts);

  // ── Нежелательные даты ──
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
  // Синхронизируем редактируемые поля перед сохранением
  document.querySelectorAll('[data-dept-i]').forEach(input => {
    const i = parseInt(input.dataset.deptI);
    if (_modalDepts[i] !== undefined) _modalDepts[i] = input.value.trim();
  });
  const depts   = _modalDepts.filter(Boolean);
  const phone   = (document.getElementById('tPhone').value || '').trim();
  const maxLoad = Math.max(1, Math.min(6, parseInt(document.getElementById('tLoad').value) || 2));
  const editId  = document.getElementById('tEditId').value;

  if (!name) { showToast('Введите ФИО', 'error'); return; }
  if (!depts.length) { showToast('Добавьте хотя бы одну кафедру', 'error'); return; }

  const dept = depts[0];

  if (editId) {
    const t = teacherById(editId);
    if (t) {
      Object.assign(t, { name, dept, depts, phone, maxLoad });
      State.blackoutDates[editId] = [...(_modalBlackouts || [])];
      t.blackoutDates = State.blackoutDates[editId];
    }
    showToast('Данные обновлены', 'success');
  } else {
    const newId = 't_' + Date.now();
    State.teachers.push({ id: newId, name, dept, depts, phone, maxLoad, blackoutDates: [...(_modalBlackouts || [])] });
    State.blackoutDates[newId] = [...(_modalBlackouts || [])];
    showToast(`${name} добавлен(а)`, 'success');
  }

  _modalBlackouts = [];
  _modalDepts = [];
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
  Object.keys(State.duties).forEach(k => {
    const entries = getDutyEntries(k).filter(e => e.tid !== id);
    if (entries.length) State.duties[k] = entries;
    else delete State.duties[k];
  });
  if (State.currentTeacherId === id) State.currentTeacherId = State.teachers[0]?.id || null;
  State.save();
  renderTeachersList(); renderCalendar(); renderAccordion(); renderStats(); renderMyCabinet();
  showToast(`${t.name} удалён(а)`, 'info');
}

function getMonthDutyCount(tid) {
  const y = State.currentDate.getFullYear();
  const m = State.currentDate.getMonth();
  const prefix = `${y}-${String(m+1).padStart(2,'0')}`;
  return Object.keys(State.duties).filter(k => k.startsWith(prefix) && getDutyIds(k).includes(tid)).length;
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
    const monthCount   = Object.keys(State.duties).filter(k => k.startsWith(prefix) && getDutyIds(k).includes(t.id)).length;
    const maxWeekLoad  = Math.max(...Object.values(weekMap).map(wk => weekDutiesCount(t.id, wk)), 0);
    const replaceCount = Object.keys(State.replaceRequests).filter(k => getDutyIds(k).includes(t.id) && k.startsWith(prefix)).length;

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

  const myDuties = Object.keys(State.duties)
    .filter(k => getDutyIds(k).includes(tid) && k.startsWith(prefix))
    .sort((a, b) => a.localeCompare(b));

  if (!tid || myDuties.length === 0) {
    listEl.innerHTML = `<div class="empty-state" style="padding:1.5rem">
      <div class="empty-icon">📅</div>
      <p class="empty-title">Нет дежурств</p>
    </div>`;
  } else {
    listEl.innerHTML = myDuties.map(key => {
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

  const workdays = [];
  for (let d = 1; d <= total; d++) {
    const key = dateKey(y, m, d);
    const dow = new Date(y, m, d).getDay();
    if (dow !== 0 && !getHolidayName(key)) workdays.push(key);
  }

  // Очищаем дежурства и расписание пар за этот месяц
  const prefix = `${y}-${String(m+1).padStart(2,'0')}`;
  workdays.forEach(k => { delete State.duties[k]; delete State.replaceRequests[k]; });
  Object.keys(State.lessons).forEach(k => { if (k.startsWith(prefix)) delete State.lessons[k]; });

  const weekCounts  = {};
  const monthCounts = {};
  State.teachers.forEach(t => { weekCounts[t.id] = {}; monthCounts[t.id] = 0; });

  // ── Шаг 1: назначить ОДНОГО дежурного на каждый рабочий день ──
  workdays.forEach(key => {
    const weekKeys = getWeekKeys(key);
    const weekId   = weekKeys[0];

    const candidates = State.teachers.map(t => {
      const wc = weekCounts[t.id][weekId] || 0;
      const blackouts = [
        ...(Array.isArray(t.blackoutDates) ? t.blackoutDates : []),
        ...(State.blackoutDates[t.id] || []),
      ];
      if (blackouts.includes(key)) return null;
      const overloaded = wc >= t.maxLoad;
      const score = monthCounts[t.id] * 10 + wc * 100 + (overloaded ? 500 : 0) + Math.random() * 2;
      return { t, score };
    }).filter(Boolean).sort((a, b) => a.score - b.score);

    if (candidates.length > 0) {
      const winner = candidates[0].t;
      const primaryDept = Array.isArray(winner.depts) && winner.depts.length ? winner.depts[0] : (winner.dept || '');
      State.duties[key] = [{ tid: winner.id, dept: primaryDept }];
      weekCounts[winner.id][weekId] = (weekCounts[winner.id][weekId] || 0) + 1;
      monthCounts[winner.id]++;
    }
  });

  // ── Шаг 2: распределить преподавателей по 6 парам каждого рабочего дня ──
  // Каждый преподаватель попадает в одну пару в день (циклически)
  const pairNums = [1, 2, 3, 4, 5, 6];
  const pairMonthCounts = {}; // tid → количество пар в месяце
  State.teachers.forEach(t => { pairMonthCounts[t.id] = 0; });

  workdays.forEach(key => {
    if (!State.lessons[key]) State.lessons[key] = {};
    pairNums.forEach(pn => { State.lessons[key][pn] = []; });

    // Перемешиваем преподавателей по баллам (равномерно по парам)
    const sorted = [...State.teachers].sort((a, b) => pairMonthCounts[a.id] - pairMonthCounts[b.id]);

    sorted.forEach((t, idx) => {
      // Блокировки
      const blackouts = [
        ...(Array.isArray(t.blackoutDates) ? t.blackoutDates : []),
        ...(State.blackoutDates[t.id] || []),
      ];
      if (blackouts.includes(key)) return;

      const pairN = pairNums[idx % pairNums.length];
      const dept = Array.isArray(t.depts) && t.depts.length ? t.depts[0] : (t.dept || '');
      State.lessons[key][pairN].push({ tid: t.id, dept, room: '' });
      pairMonthCounts[t.id]++;
    });
  });

  State.save();
  renderCalendar(); renderAccordion(); renderTeachersList(); renderStats(); renderMyCabinet();
  showToast(`Дежурства и пары распределены на ${workdays.length} дней ✦`, 'success');
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
  // Закрываем боковую панель при смене вкладки — устраняет мелькание
  if (typeof closeDayPanel === 'function') closeDayPanel();
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

  // Teacher info popup
  const tiOverlay = document.getElementById('teacherInfoOverlay');
  if (tiOverlay) {
    document.getElementById('teacherInfoClose').addEventListener('click', () => closeModal('teacherInfoOverlay'));
    tiOverlay.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('teacherInfoOverlay'); });
  }
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
      closeModal('teacherInfoOverlay');
      closeDayPanel();
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

  // ★ Role switcher — теперь с авторизацией
  document.getElementById('roleAdmin').addEventListener('click', handleRoleSwitchAdmin);
  document.getElementById('roleTeacher').addEventListener('click', handleRoleSwitchTeacher);

  // authModalOverlay — закрытие по клику вне
  const authOverlay = document.getElementById('authModalOverlay');
  if (authOverlay) authOverlay.addEventListener('click', e => { if (e.target === e.currentTarget) hideAuthModal(); });

  // welcomeOverlay — кнопки выбора роли
  const welAdmin = document.getElementById('welcomeAdminBtn');
  const welTeacher = document.getElementById('welcomeTeacherBtn');
  if (welAdmin) welAdmin.addEventListener('click', () => {
    showAdminLoginModal(() => {
      hideWelcomeScreen();
      applyRole('admin');
    });
  });
  if (welTeacher) welTeacher.addEventListener('click', () => {
    if (State.teachers.length === 0) { showToast('Преподаватели ещё не добавлены', 'error'); return; }
    showTeacherPickerModal(() => {
      hideWelcomeScreen();
      applyRole('teacher');
    });
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
  window.seedDemoData         = seedDemoData;
  window.openTeacherInfoModal = openTeacherInfoModal;
  window.openTeacherModal     = openTeacherModal;
  window.openModal            = openModal;
  window.closeModal           = closeModal;
  window.openDayPanel         = openDayPanel;
  window.closeDayPanel        = closeDayPanel;
  window.removeDutyFromPanel  = removeDutyFromPanel;
  window.addPairEntry         = addPairEntry;
  window.removePairEntry      = removePairEntry;
  window.hideAuthModal        = hideAuthModal;

  // Day panel
  const dpClose = document.getElementById('dayPanelClose');
  if (dpClose) dpClose.addEventListener('click', closeDayPanel);
  const dpBackdrop = document.getElementById('dayPanelBackdrop');
  if (dpBackdrop) dpBackdrop.addEventListener('click', closeDayPanel);

  // Initial render
  renderCalendar();
  renderAccordion();
  renderTeachersList();
  renderStats();
  renderNotifications();

  // Показываем экран приветствия при первом заходе
  // (если нет сохранённой роли, показываем выбор)
  showWelcomeScreen();
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
//     id             TEXT PRIMARY KEY,
//     name           TEXT NOT NULL,
//     dept           TEXT NOT NULL DEFAULT '',   -- основная кафедра
//     depts          JSONB DEFAULT '[]',          -- ★ все кафедры преподавателя
//     phone          TEXT DEFAULT '',
//     max_load       INT  DEFAULT 2,
//     blackout_dates JSONB DEFAULT '[]'
//   );
//   -- Миграция если таблица уже есть:
//   -- ALTER TABLE teachers ADD COLUMN IF NOT EXISTS depts JSONB DEFAULT '[]';
//
//   -- ★ ВАЖНО: составной PRIMARY KEY (date_key, teacher_id, dept)
//   --   позволяет одному преподавателю быть в один день с разными кафедрами.
//   CREATE TABLE schedule (
//     date_key        TEXT NOT NULL,        -- "YYYY-MM-DD"
//     teacher_id      TEXT NOT NULL,
//     dept            TEXT DEFAULT NULL,    -- ★ какая кафедра в этот день
//     replace_request BOOLEAN DEFAULT false,
//     PRIMARY KEY (date_key, teacher_id, dept)
//   );
//
//   -- Если таблица уже существует, выполните миграцию:
//   -- ALTER TABLE schedule ADD COLUMN IF NOT EXISTS dept TEXT DEFAULT NULL;
//   -- ALTER TABLE schedule DROP CONSTRAINT schedule_pkey;
//   -- ALTER TABLE schedule ADD PRIMARY KEY (date_key, teacher_id, dept);
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
  // Ждём пока CDN загрузит SDK (максимум 5 секунд)
  let sdk = null;
  for (let i = 0; i < 50; i++) {
    sdk = window.supabase ?? window.Supabase ?? window.supabaseJs;
    if (sdk && typeof sdk.createClient === 'function') break;
    await new Promise(r => setTimeout(r, 100));
  }

  if (!sdk || typeof sdk.createClient !== 'function') {
    console.error('[SB] SDK не загружен после 5 секунд ожидания');
    setSbStatus('error', 'SDK не загружен — проверьте сеть');
    return;
  }

  setSbStatus('connecting', 'подключение…');
  try {
    sb = sdk.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 10 } },
    });

    // Тестовый запрос для проверки соединения и правильности ключа
    const { data, error: pingErr } = await sb.from('teachers').select('id').limit(1);
    if (pingErr) {
      throw new Error(`Ошибка доступа к таблице "teachers": ${pingErr.message} (code: ${pingErr.code})`);
    }

    await loadTeachers();
    await loadSchedule();

    subscribeRealtime();
    setSbStatus('connected', 'подключено ✓');
    sbReady = true;
  } catch (err) {
    console.error('[SB] Ошибка инициализации:', err);
    setSbStatus('error', `ошибка: ${err.message}`);
    sb = null;
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
    .select('date_key, teacher_id, dept, replace_request');

  if (error) {
    console.warn('[SB] loadSchedule error:', error.message);
    return;
  }

  State.duties          = {};
  State.replaceRequests = {};
  (data || []).forEach(r => {
    if (r.teacher_id) {
      if (!State.duties[r.date_key]) State.duties[r.date_key] = [];
      const entry = { tid: r.teacher_id, dept: r.dept || null };
      const already = State.duties[r.date_key].some(e => e.tid === entry.tid && e.dept === entry.dept);
      if (!already) State.duties[r.date_key].push(entry);
    }
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
  // Поддержка нового поля depts (массив) и старого dept (строка)
  let depts = [];
  if (Array.isArray(r.depts) && r.depts.length) {
    depts = r.depts;
  } else if (r.dept) {
    depts = [r.dept];
  }
  return {
    id:            r.id,
    name:          r.name,
    dept:          depts[0] || '',           // главная кафедра (обратная совместимость)
    depts:         depts,                    // все кафедры
    phone:         r.phone || '',
    maxLoad:       r.max_load || 2,
    blackoutDates: Array.isArray(r.blackout_dates) ? r.blackout_dates : [],
  };
}

// ─── ЗАПИСЬ В SUPABASE ───────────────────────────────────────────────────────

async function saveTeachers(teacher) {
  if (!sb || !teacher) return;
  const depts = Array.isArray(teacher.depts) && teacher.depts.length ? teacher.depts : [teacher.dept].filter(Boolean);
  const { error } = await sb
    .from('teachers')
    .upsert({
      id:             teacher.id,
      name:           teacher.name,
      dept:           depts[0] || '',
      depts:          depts,
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

/**
 * Сохраняет/удаляет одну запись (дата + преподаватель) в таблице schedule.
 * Таблица должна иметь PRIMARY KEY (date_key, teacher_id).
 */
async function saveSchedule(key, teacherId, replaceRequest = false, dept = null) {
  if (!sb) return;
  if (teacherId) {
    const { error } = await sb
      .from('schedule')
      .upsert({ date_key: key, teacher_id: teacherId, dept: dept || null, replace_request: replaceRequest },
               { onConflict: 'date_key,teacher_id,dept' });
    if (error) console.warn('[SB] saveSchedule upsert error:', error.message);
  } else {
    const { error } = await sb.from('schedule').delete().eq('date_key', key);
    if (error) console.warn('[SB] saveSchedule delete error:', error.message);
  }
}

/** Удаляет одну конкретную запись (дата, преподаватель) из БД */
async function saveScheduleRemoveOne(key, teacherId) {
  if (!sb) return;
  const { error } = await sb.from('schedule').delete()
    .eq('date_key', key).eq('teacher_id', teacherId);
  if (error) console.warn('[SB] saveScheduleRemoveOne error:', error.message);
}

async function saveScheduleBatch(rows) {
  // rows = [{ date_key, teacher_id, dept, replace_request }]
  if (!sb || !rows.length) return;
  const { error } = await sb
    .from('schedule')
    .upsert(rows, { onConflict: 'date_key,teacher_id,dept' });
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
    const tid = oldRow?.teacher_id;
    if (tid) removeDuty(key, tid);
    else     clearDutyDay(key);
  } else {
    // INSERT | UPDATE
    if (row.teacher_id) {
      addDuty(key, row.teacher_id);
    }

    const wasReplace = !!State.replaceRequests[key];
    if (row.replace_request) {
      State.replaceRequests[key] = true;
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

// ── Назначение дежурства через модал (добавляет нового преподавателя) ──
const _saveModal = saveModal;
window.saveModal = async function () {
  const key = State.selectedCell;
  const tid = State.selectedTeacherId;
  const deptSel = tid ? document.querySelector(`.dept-sel[data-tid="${tid}"]`) : null;
  const chosenDept = deptSel ? deptSel.value : null;
  _saveModal();
  if (tid) await saveSchedule(key, tid, false, chosenDept);
  // Обновляем боковую панель если открыта для этого же дня
  if (State.activeDayKey === key) renderDayPanel(key);
};

// ── Быстрое снятие всего дня ──
const _quickClear = quickClear;
window.quickClear = async function (key) {
  _quickClear(key);
  await saveSchedule(key, null, false);  // null = удалить весь день
};

// ── Запрос / отмена замены ──
const _toggleReplaceRequest = toggleReplaceRequest;
window.toggleReplaceRequest = async function (key) {
  _toggleReplaceRequest(key);
  const ids = getDutyIds(key);
  // Обновляем replace_request для всех записей этого дня
  for (const tid of ids) {
    await saveSchedule(key, tid, !!State.replaceRequests[key]);
  }
};

// ── Авто-распределение (пакетная запись) ──
const _autoDistribute = autoDistribute;
window.autoDistribute = async function () {
  _autoDistribute();
  const y = State.currentDate.getFullYear();
  const m = State.currentDate.getMonth();
  await deleteScheduleMonth(y, m);
  const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  const rows = [];
  Object.entries(State.duties)
    .filter(([k]) => k.startsWith(prefix))
    .forEach(([k, v]) => {
      const entries = Array.isArray(v) ? v : [v];
      entries.forEach(e => {
        const { tid, dept } = normEntry(e);
        rows.push({ date_key: k, teacher_id: tid, dept: dept || null, replace_request: false });
      });
    });
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

