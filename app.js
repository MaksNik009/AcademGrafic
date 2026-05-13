/* ═══════════════════════════════════════════════════════════════════════════
   АКАДЕМГРАФИК — app.js v6 (исправленная)
   Цвета: дежурный (фон/полоска в teacher mode) — фиолетовый (#8E44AD),
          нежелательный — красный (#C0392B)
   Корпуса независимы: удаление/сохранение только для текущего building,
   авто-распределение не затирает другие корпуса.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── ГОСУДАРСТВЕННЫЕ ПРАЗДНИКИ РФ ────────────────────────────────────────────
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
  "2026-01-09": "Выходной (перенос)",
  "2026-02-24": "Выходной (перенос)",
  "2026-03-09": "Выходной (перенос)",
  "2026-05-04": "Выходной (перенос)",
  "2026-05-11": "Выходной (перенос)",
  "2026-11-03": "Выходной (перенос)",
};

function getHolidayName(key) {
  if (HOLIDAYS[key]) return HOLIDAYS[key];
  const mmdd = key.slice(5);
  return HOLIDAYS[mmdd] || null;
}

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
  activeBuilding: '1',
  activeTemplateByBuilding: {},
  get activeTemplateId() { return this.activeTemplateByBuilding[this.activeBuilding] || null; },
  set activeTemplateId(v) { this.activeTemplateByBuilding[this.activeBuilding] = v || null; },

  avatarColors: [
    '#2C6FAC','#1A7A4A','#8E44AD','#C0392B',
    '#D35400','#16869A','#7D6608','#1E5799',
    '#5D4037','#2E7D6F'
  ],

  save() {
    // Все данные хранятся в Supabase — localStorage не используется
  },

  load() {
    // Все данные загружаются из Supabase — localStorage не используется
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
function normEntry(entry) {
  if (typeof entry === 'string') return { tid: entry, dept: null, building: State.activeBuilding };
  return {
    tid: entry.tid || entry.id || '',
    dept: entry.dept || null,
    building: entry.building || '1'
  };
}
function getDutyEntries(key) {
  const v = State.duties[key];
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.map(normEntry).filter(e => e.building === State.activeBuilding);
}
function getDutyIds(key) {
  return getDutyEntries(key).map(e => e.tid);
}
function addDuty(key, tid, dept = null, building = State.activeBuilding) {
  const v = State.duties[key];
  const allEntries = v ? (Array.isArray(v) ? v : [v]).map(normEntry) : [];
  const already = allEntries.some(e => e.tid === tid && e.building === building && (e.dept || null) === (dept || null));
  if (!already) {
    allEntries.push({ tid, dept: dept || null, building });
    State.duties[key] = allEntries;
    State.save();
    if (sb) saveSchedule(key, tid, false, dept || '', building);
  }
}
function removeDuty(key, tid, dept = null, building = State.activeBuilding) {
  const v = State.duties[key];
  const allEntries = v ? (Array.isArray(v) ? v : [v]).map(normEntry) : [];
  const filtered = allEntries.filter(e => !(e.tid === tid && e.building === building && (dept === null || e.dept === dept)));
  if (filtered.length) State.duties[key] = filtered;
  else delete State.duties[key];
  State.save();
  if (sb) saveScheduleRemoveOne(key, tid, building);
}
function clearDutyDay(key) {
  delete State.duties[key];
  delete State.replaceRequests[key];
  State.save();
  if (sb) {
    sb.from('schedule').delete().eq('date_key', key).eq('building', State.activeBuilding);
  }
}
function weekDutiesCount(tid, weekKeys) {
  let cnt = 0;
  for (const k of weekKeys) {
    if (getDutyIds(k).includes(tid)) cnt++;
  }
  return cnt;
}
function getWorkdaysInMonth() {
  const y = State.currentDate.getFullYear();
  const m = State.currentDate.getMonth();
  const total = new Date(y, m + 1, 0).getDate();
  let n = 0;
  for (let d = 1; d <= total; d++) {
    const key = dateKey(y, m, d);
    const dow = new Date(y, m, d).getDay();
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

let toastTimer = null;
let statsSearchText = '';
function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
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
  if (role === 'admin') {
    State.activeBuilding = '1';
    _syncBuildingTabs('1');
    if (typeof loadTemplatesList === 'function') loadTemplatesList();
  }
  if (role === 'teacher') {
    if (!State.currentTeacherId && State.teachers.length > 0) {
      State.currentTeacherId = State.teachers[0].id;
    }
    const t = teacherById(State.currentTeacherId);
    State.activeBuilding = t?.building || '1';
    _syncBuildingTabs(State.activeBuilding);
    if (typeof closeDayPanel === 'function') closeDayPanel();
    switchTab('calendar');
    renderMyCabinet();
  }
  renderCalendar();
  renderAccordion();
}
function _syncBuildingTabs(b) {
  document.querySelectorAll('.building-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.building === b);
  });
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
function addNotification(msg, icon = '🔔') {
  const n = {
    id: 'n_' + Date.now(),
    msg, icon,
    time: new Date().toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' })
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
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const firstDay = new Date(y, m, 1);
  const lastDay  = new Date(y, m + 1, 0);
  const today    = todayKey();
  const firstDow = firstDay.getDay();
  const startOffset = firstDow === 0 ? 6 : firstDow - 1;
  for (let i = 0; i < startOffset; i++) {
    const blank = document.createElement('div');
    blank.className = 'day-cell day-cell--empty';
    grid.appendChild(blank);
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const key = dateKey(y, m, d);
    const dow = new Date(y, m, d).getDay();
    const isSunday = dow === 0;
    const isSaturday = dow === 6;
    const isHoliday = !!getHolidayName(key);
    const isToday = key === today;
    const isPast = key < today;
    const isReplaceReq = !!State.replaceRequests[key];
    const tid = State.currentTeacherId;
    const myBlackout = tid && (State.blackoutDates[tid] || []).includes(key);
    
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    cell.dataset.key = key;

    // ----- ВОСКРЕСЕНЬЕ -----
    if (isSunday) {
      cell.classList.add('day-cell--sunday');
      if (State.currentRole === 'admin') {
        cell.style.cursor = 'pointer';
        cell.setAttribute('role', 'button');
        cell.setAttribute('tabindex', '0');
      } else {
        cell.setAttribute('data-role-disabled', 'true');
        cell.style.cursor = 'not-allowed';
        cell.style.pointerEvents = 'none';
      }
      const num = document.createElement('div'); num.className='day-num'; num.textContent=d;
      cell.appendChild(num);
      const sunLabel = document.createElement('div'); sunLabel.className='holiday-label'; sunLabel.textContent='Выходной';
      cell.appendChild(sunLabel);
      // для админа показываем дежурных или +
      if (State.currentRole === 'admin') {
        const dutyEntries = getDutyEntries(key);
        if (dutyEntries.length === 0) {
          const hint = document.createElement('div'); hint.className='add-hint'; hint.textContent='+';
          cell.appendChild(hint);
        } else {
          const first = dutyEntries[0];
          const t = teacherById(first.tid);
          if (t) {
            const color = getColor(teacherIndex(first.tid));
            const chip = document.createElement('div'); chip.className='cell-duty-chip';
            const av = document.createElement('div'); av.className='cell-duty-avatar'; av.style.background=color; av.textContent=initials(t.name);
            av.addEventListener('click', e => { e.stopPropagation(); openTeacherInfoModal(first.tid); });
            const nameEl = document.createElement('div'); nameEl.className='cell-duty-name'; nameEl.textContent=t.name;
            chip.appendChild(av); chip.appendChild(nameEl);
            cell.appendChild(chip);
            if (dutyEntries.length > 1) {
              const more = document.createElement('div'); more.className='cell-duty-more'; more.textContent=`+${dutyEntries.length-1}`;
              cell.appendChild(more);
            }
          }
        }
      }
      // Обработчик клика для воскресенья (админ)
      if (State.currentRole === 'admin') {
        cell.addEventListener('click', (e) => { if (!e.target.closest('.cell-duty-avatar')) openDayPanel(key); });
        cell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDayPanel(key); } });
      }
      grid.appendChild(cell);
      continue;  // переходим к следующему дню
    }

    // ----- НЕ ВОСКРЕСЕНЬЕ -----
    // ПРАЗДНИКИ
    if (isHoliday) {
      cell.classList.add('day-cell--holiday');
      if (State.currentRole !== 'admin') {
        cell.setAttribute('title', getHolidayName(key) || 'Праздничный день');
        cell.style.pointerEvents = 'none';
      } else {
        cell.setAttribute('title', `Праздничный день (${getHolidayName(key)}) — можно назначить вручную`);
      }
    }

    if (isSaturday) cell.classList.add('day-cell--saturday');
    if (isToday)    cell.classList.add('day-cell--today');
    if (isPast)     cell.classList.add('day-cell--past');
    if (myBlackout) cell.classList.add('day-cell--blackout');
    if (isReplaceReq) cell.classList.add('day-cell--replace-req');

    // Для АДМИНА: если хотя бы один из дежурных пометил этот день нежелательным — красный индикатор конфликта
    if (State.currentRole === 'admin') {
      const hasBlackoutConflict = dutyEntries.some(e => (State.blackoutDates[e.tid] || []).includes(key));
      if (hasBlackoutConflict) cell.classList.add('day-cell--blackout');
    }

    if (!isHoliday) {
      cell.setAttribute('role', 'button');
      cell.setAttribute('tabindex', '0');
    }

    const num = document.createElement('div'); num.className='day-num'; num.textContent=d;
    cell.appendChild(num);
    if (isHoliday) {
      const hl = document.createElement('div'); hl.className='holiday-label'; hl.textContent=getHolidayName(key);
      cell.appendChild(hl);
    }
    if (myBlackout && State.currentRole === 'teacher') {
      const bi = document.createElement('div'); bi.className='blackout-indicator'; bi.textContent='🚫 нежелательный';
      cell.appendChild(bi);
    }

    const dutyEntries = getDutyEntries(key);
    const pairTeacherIds = new Set();
    if (State.lessons[key]) {
      for (let pn = 1; pn <= 6; pn++) {
        (State.lessons[key][pn] || []).forEach(e => {
          if (e.building === State.activeBuilding) pairTeacherIds.add(e.tid);
        });
      }
    }

    // ── РЕЖИМ УЧИТЕЛЯ (только если не праздник)
    if (!isHoliday && State.currentRole === 'teacher') {
      const hasLesson = pairTeacherIds.has(State.currentTeacherId);
      const isDuty    = dutyEntries.some(e => e.tid === State.currentTeacherId);
      if (hasLesson || isDuty) {
        cell.classList.add('cell--teacher-active');
        if (isDuty) cell.classList.add('cell--teacher-duty');
        const stripWrap = document.createElement('div'); stripWrap.className='cell-strips';
        if (hasLesson) {
          const s = document.createElement('div'); s.className='cell-strip cell-strip--lesson'; stripWrap.appendChild(s);
        }
        if (isDuty) {
          const s = document.createElement('div'); s.className='cell-strip cell-strip--duty'; stripWrap.appendChild(s);
        }
        cell.appendChild(stripWrap);
      }
      // Показываем аватарку и ФИО дежурного (как у завуча, но без редактирования)
      if (dutyEntries.length > 0) {
        const first = dutyEntries[0];
        const t = teacherById(first.tid);
        if (t) {
          const color = getColor(teacherIndex(first.tid));
          const chip = document.createElement('div'); chip.className='cell-duty-chip';
          const av = document.createElement('div'); av.className='cell-duty-avatar'; av.style.background=color; av.textContent=initials(t.name);
          const nameEl = document.createElement('div'); nameEl.className='cell-duty-name'; nameEl.textContent=t.name;
          chip.appendChild(av); chip.appendChild(nameEl);
          cell.appendChild(chip);
          if (dutyEntries.length > 1) {
            const more = document.createElement('div'); more.className='cell-duty-more'; more.textContent=`+${dutyEntries.length-1}`;
            cell.appendChild(more);
          }
        }
      }
    }

    // ── РЕЖИМ АДМИНИСТРАТОРА
    if (State.currentRole === 'admin') {
      if (dutyEntries.length > 0) {
        const first = dutyEntries[0];
        const t = teacherById(first.tid);
        if (t) {
          const color = getColor(teacherIndex(first.tid));
          const chip = document.createElement('div'); chip.className='cell-duty-chip';
          const av = document.createElement('div'); av.className='cell-duty-avatar'; av.style.background=color; av.textContent=initials(t.name);
          av.addEventListener('click', e => { e.stopPropagation(); openTeacherInfoModal(first.tid); });
          const nameEl = document.createElement('div'); nameEl.className='cell-duty-name'; nameEl.textContent=t.name;
          chip.appendChild(av); chip.appendChild(nameEl);
          cell.appendChild(chip);
          if (dutyEntries.length > 1) {
            const more = document.createElement('div'); more.className='cell-duty-more'; more.textContent=`+${dutyEntries.length-1}`;
            cell.appendChild(more);
          }
        }
      } else {
        const hint = document.createElement('div'); hint.className='add-hint'; hint.textContent='+';
        cell.appendChild(hint);
      }
    }

    // Обработчики кликов (для админа – все дни, для учителя – только не праздники)
    if (!isHoliday || State.currentRole === 'admin') {
      cell.addEventListener('click', (e) => { if (!e.target.closest('.cell-duty-avatar')) openDayPanel(key); });
      cell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDayPanel(key); } });
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
  } else if (action === 'replace') {
    openModal(key, kd, km - 1, ky, 'assign');
  } else if (action === 'toggle-replace') {
    toggleReplaceRequest(key);
  }
}
function quickClear(key) {
  clearDutyDay(key);
  State.save();
  renderCalendar(); renderAccordion(); renderTeachersList(); renderStats(); renderMyCabinet();
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
    if (sb) saveSchedule(key, teacher.id, false, '', State.activeBuilding);
    State.save();
    renderCalendar(); renderAccordion(); renderMyCabinet();
    showToast('Запрос на замену отменён', 'info');
  } else {
    State.replaceRequests[key] = true;
    if (sb) saveSchedule(key, teacher.id, true, '', State.activeBuilding);
    State.save();
    addNotification(`🔄 ${teacher.name} просит замену ${dayLabel}`, '🔄');
    renderCalendar(); renderAccordion(); renderMyCabinet();
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
  const weeks = [];
  let currentWeek = null;
  for (let d = 1; d <= total; d++) {
    const key = dateKey(y, m, d);
    const dow = new Date(y, m, d).getDay();
    if (d === 1 || dow === 1) { currentWeek = []; weeks.push(currentWeek); }
    currentWeek.push({ d, key, dow });
  }
  weeks.forEach((week, wi) => {
    const first = week[0], last = week[week.length - 1];
    const assignedCount = week.filter(({ key, dow }) =>
      getDutyIds(key).length > 0 && dow !== 0 && dow !== 6 && !getHolidayName(key)).length;
    const weekEl = document.createElement('div'); weekEl.className='acc-week';
    if (wi === 0) weekEl.classList.add('open');
    weekEl.innerHTML = `
      <div class="acc-week-header">
        <span class="acc-week-label">${first.d}–${last.d} ${MONTHS_RU_GEN[m]}</span>
        <div class="acc-week-meta"><span class="acc-week-count">${assignedCount} дежурств</span><span class="acc-week-arrow">▾</span></div>
      </div>
      <div class="acc-week-body"></div>`;
    weekEl.querySelector('.acc-week-header').addEventListener('click', () => weekEl.classList.toggle('open'));
    const body = weekEl.querySelector('.acc-week-body');
    week.forEach(({ d, key, dow }) => {
      if (dow === 0) return;
      const isHoliday = !!getHolidayName(key);
      const isToday = key === today;
      const isReplace = !!State.replaceRequests[key];
      const dutyEntries = getDutyEntries(key);
      const dutyIds = dutyEntries.map(e => e.tid);
      const tid = State.currentTeacherId;
      const myBlackout = tid && (State.blackoutDates[tid] || []).includes(key);
      const row = document.createElement('div'); row.className='acc-day-row';
      if (dow === 6) row.classList.add('saturday');
      if (isHoliday) row.classList.add('holiday');
      if (isToday) row.classList.add('today');
      if (isReplace) row.classList.add('replace-req');
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
          const removeBtn = State.currentRole === 'admin'
            ? `<button class="acc-remove-duty mob-only" data-remove-tid="${entry.tid}" data-remove-dept="${entry.dept||''}" data-remove-key="${key}" title="Убрать дежурного">✕</button>`
            : '';
          return `<div class="acc-duty-chip${isReplace && isMyDutyHere ? ' replace' : ''}"
               style="border-left-color:${color};background:${color}12;border-color:${color}40;margin-bottom:4px;position:relative">
            ${removeBtn}
            <div class="acc-duty-name">${teacher.name}</div>
            <div class="acc-duty-dept">${deptLabel}</div>
            ${teacher.phone ? `<div class="acc-duty-dept">${teacher.phone}</div>` : ''}
            ${replaceBadge}
          </div>`;
        }).join('');
      } else {
        contentHtml = `<div class="acc-empty" style="color:var(--text-faint)">— свободно —</div>`;
      }
      if (myBlackout) contentHtml += `<div class="acc-blackout-tag">🚫 нежелательный</div>`;
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
        <div class="acc-day-date"><div class="acc-day-num">${d}</div><div class="acc-day-wd">${DAYS_SHORT[dow]}</div></div>
        <div class="acc-day-content">${contentHtml}</div>
        ${actionBtn ? `<div class="acc-day-action">${actionBtn}</div>` : ''}`;
      const btn = row.querySelector('[data-action]');
      if (btn) {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const act = btn.dataset.action;
          const k = btn.dataset.key;
          const [ky, km, kd] = k.split('-').map(Number);
          if (act === 'assign') openModal(k, kd, km-1, ky, 'assign');
          else if (act === 'toggle-replace') toggleReplaceRequest(k);
        });
      }
      row.querySelectorAll('.acc-remove-duty').forEach(rb => {
        rb.addEventListener('click', e => {
          e.stopPropagation();
          const k = rb.dataset.removeKey;
          const rtid = rb.dataset.removeTid;
          const rdept = rb.dataset.removeDept || null;
          removeDuty(k, rtid, rdept);
          State.save();
          renderCalendar(); renderAccordion(); renderTeachersList(); renderStats(); renderMyCabinet();
          showToast('Дежурный снят', 'info');
        });
      });
      body.appendChild(row);
    });
    acc.appendChild(weekEl);
  });
}
// ─── MODAL (Assignment) ───────────────────────────────────────────────────────
function openModal(key, day, month, year, mode = 'assign') {
  State.selectedCell = key;
  State.selectedTeacherId = null;
  State.modalMode = 'assign';
  const overlay = document.getElementById('modalOverlay');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');
  title.textContent = `${day} ${MONTHS_RU_GEN[month]} ${year}`;
  const weekKeys = getWeekKeys(key);
  const assignedEntries = getDutyEntries(key);
  let html = `<div class="modal-date-label">${String(day).padStart(2,'0')}.${String(month+1).padStart(2,'0')}.${year}</div>`;
  if (assignedEntries.length > 0) {
    html += `<div class="modal-assigned-list">`;
    assignedEntries.forEach(entry => {
      const t = teacherById(entry.tid);
      if (!t) return;
      const color = getColor(teacherIndex(entry.tid));
      const deptLabel = entry.dept || t.dept || '';
      html += `<div class="modal-assigned-row">
        <div class="opt-avatar" style="background:${color};width:28px;height:28px;font-size:.7rem;cursor:pointer" onclick="openTeacherInfoModal('${entry.tid}')" title="О преподавателе">${initials(t.name)}</div>
        <div style="flex:1;min-width:0">
          <span class="modal-assigned-name">${t.name.split(' ').slice(0,2).join(' ')}</span>
          ${deptLabel ? `<span style="display:block;font-size:.7rem;color:var(--text-muted);font-family:var(--font-mono)">${deptLabel}</span>` : ''}
        </div>
        <button class="modal-remove-one" data-tid="${entry.tid}" data-dept="${entry.dept||''}" title="Снять">✕</button>
      </div>`;
    });
    html += `</div><div class="modal-section-label">Добавить ещё преподавателя:</div>`;
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
      const color = getColor(idx);
      const wc = weekDutiesCount(t.id, weekKeys);
      const overloaded = wc >= t.maxLoad;
      const selected = State.selectedTeacherId === t.id;
      const depts = Array.isArray(t.depts) && t.depts.length ? t.depts : [t.dept].filter(Boolean);
      let badge = '';
      if (overloaded) badge = `<span class="conflict-tag conflict-tag--overload">перегруз</span>`;
      const deptSelector = depts.length > 1
        ? `<select class="dept-sel" data-tid="${t.id}" style="font-size:.7rem;border:1px solid var(--border);border-radius:4px;padding:2px 4px;margin-top:3px;max-width:100%;background:var(--surface)">
            ${depts.map(d => `<option value="${d.replace(/"/g,'&quot;')}">${d}</option>`).join('')}
           </select>`
        : `<span style="font-size:.72rem;color:var(--text-muted)">${depts[0]||''}</span>`;
      html += `<button class="teacher-option${selected ? ' selected' : ''}" data-id="${t.id}" role="option" aria-selected="${selected}">
        <div class="opt-avatar" style="background:${color}" onclick="event.stopPropagation();openTeacherInfoModal('${t.id}')" title="Инфо о преподавателе" role="button" tabindex="0">${initials(t.name)}</div>
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
  body.querySelectorAll('.modal-remove-one[data-tid]').forEach(btn => {
    btn.addEventListener('click', () => {
      const dept = btn.dataset.dept || null;
      removeDuty(key, btn.dataset.tid, dept);
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
  setTimeout(() => { const first = body.querySelector('button:not([disabled])'); if (first) first.focus(); }, 60);
}
function saveModal() {
  const key = State.selectedCell;
  if (State.selectedTeacherId) {
    const deptSel = document.querySelector(`.dept-sel[data-tid="${State.selectedTeacherId}"]`);
    const chosenDept = deptSel ? deptSel.value : null;
    addDuty(key, State.selectedTeacherId, chosenDept);
    showToast('Дежурство добавлено', 'success');
  }
  State.save();
  closeModal('modalOverlay');
  renderCalendar(); renderAccordion(); renderTeachersList(); renderStats(); renderMyCabinet();
}

// ─── DAY DETAIL PANEL ────────────────────────────────────────────────────────
const PAIRS = [
  { n: 1, time: '08:30 – 10:00' },
  { n: 2, time: '10:20 – 11:50' },
  { n: 3, time: '12:20 – 13:50' },
  { n: 4, time: '14:10 – 15:40' },
  { n: 5, time: '16:00 – 17:30' },
  { n: 6, time: '17:50 – 19:20' },
];
function getPairEntries(key, pairN) {
  if (!State.lessons[key]) State.lessons[key] = {};
  if (!State.lessons[key][pairN]) State.lessons[key][pairN] = [];
  return State.lessons[key][pairN].filter(e => e.building === State.activeBuilding);
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
  const isSunday = dateObj.getDay() === 0;
  const dutyEntries = getDutyEntries(key);
  const isAdmin = State.currentRole === 'admin';
  panel.querySelector('.day-panel-title').textContent = `${dayName}, ${dateLabel}`;
  const dutyStrip = panel.querySelector('.day-panel-duty-strip');
  let bannerHtml = '';
  if (isSunday && !isHoliday) {
    bannerHtml = `<div class="day-panel-sunday">📅 Воскресенье (выходной)</div>`;
  } else if (isHoliday) {
    bannerHtml = `<div class="day-panel-holiday">🏛 ${getHolidayName(key)}</div>`;
  }

  if (dutyEntries.length > 0) {
    dutyStrip.innerHTML = bannerHtml +
      `<div style="font-size:.72rem;color:var(--text-muted);font-family:var(--font-mono);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Дежурные</div>
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
    let emptyMessage = `<div style="font-size:.82rem;color:var(--text-faint);font-style:italic">Дежурных не назначено</div>`;
    if (isAdmin) {
      emptyMessage += `<button class="day-panel-add-btn" onclick="openModal('${key}',${dd},${mm-1},${y},'assign')">+ Назначить дежурного</button>`;
    }
    dutyStrip.innerHTML = bannerHtml + emptyMessage;
  }
  const pairsEl = panel.querySelector('.day-panel-pairs');
  pairsEl.innerHTML = PAIRS.map(p => {
    const entries = getPairEntries(key, p.n);
    const validEntries = entries.filter(e => !!teacherById(e.tid));
    const entriesHtml = validEntries.length
      ? validEntries.map((e, i) => {
          const t = teacherById(e.tid);
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
    return `<details class="pair-block" ${validEntries.length ? 'open' : ''}>
      <summary class="pair-summary">
        <span class="pair-num">Пара ${p.n}</span>
        <span class="pair-time">${p.time}</span>
        <span class="pair-count">${validEntries.length > 0 ? validEntries.length + ' преп.' : ''}</span>
        <span class="pair-chevron">▾</span>
      </summary>
      <div class="pair-body">
        <div class="pair-teachers-list" id="pair-list-${key}-${p.n}">${entriesHtml}</div>
        ${isAdmin ? `<div class="pair-add-row" id="pair-add-${key}-${p.n}">
          <div class="select-wrap" style="flex:1;min-width:0">
            <select class="field-input field-select pair-teacher-sel" style="height:32px;font-size:.78rem" id="pair-tsel-${key}-${p.n}"
              onchange="updatePairDeptSel('${key}',${p.n})">
              <option value="">— Преподаватель —</option>
              ${State.teachers.map(t => `<option value="${t.id}">${t.name.split(' ').slice(0,2).join(' ')}</option>`).join('')}
            </select>
          </div>
          <div id="pair-dept-wrap-${key}-${p.n}" style="display:none;min-width:0;flex:1">
            <select class="field-input field-select" style="height:32px;font-size:.75rem" id="pair-dept-${key}-${p.n}"></select>
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
  renderCalendar(); renderAccordion(); renderTeachersList(); renderStats();
}
function updatePairDeptSel(key, pairN) {
  const tSel = document.getElementById(`pair-tsel-${key}-${pairN}`);
  const wrap = document.getElementById(`pair-dept-wrap-${key}-${pairN}`);
  const deptSel = document.getElementById(`pair-dept-${key}-${pairN}`);
  if (!tSel || !wrap || !deptSel) return;
  const tid = tSel.value;
  const t = teacherById(tid);
  const depts = t ? (Array.isArray(t.depts) && t.depts.length ? t.depts : [t.dept].filter(Boolean)) : [];
  if (depts.length > 1) {
    deptSel.innerHTML = depts.map(d => `<option value="${d}">${d}</option>`).join('');
    wrap.style.display = 'block';
  } else {
    wrap.style.display = 'none';
  }
}
function addPairEntry(key, pairN) {
  const tSel = document.getElementById(`pair-tsel-${key}-${pairN}`);
  const roomEl = document.getElementById(`pair-room-${key}-${pairN}`);
  const deptSel = document.getElementById(`pair-dept-${key}-${pairN}`);
  const tid = tSel?.value;
  if (!tid) { showToast('Выберите преподавателя', 'error'); return; }
  // Проверка: не занят ли преподаватель в этот же день в другом корпусе
  for (const [otherKey, lessons] of Object.entries(State.lessons)) {
    if (otherKey !== key) continue;
    for (const [pn, arr] of Object.entries(lessons)) {
      for (const e of arr) {
        if (e.tid === tid && e.building !== State.activeBuilding) {
          showToast(`Преподаватель уже ведёт пару в ${e.building} корпусе в этот день!`, 'error');
          return;
        }
      }
    }
  }
  const t = teacherById(tid);
  const depts = Array.isArray(t?.depts) && t.depts.length ? t.depts : [t?.dept].filter(Boolean);
  const dept = (deptSel && deptSel.closest('[style*="block"]')) ? deptSel.value : (depts[0] || '');
  const room = (roomEl?.value || '').trim();
  // Правильно инициализируем State.lessons[key] и State.lessons[key][pairN]
  if (!State.lessons[key]) State.lessons[key] = {};
  if (!State.lessons[key][pairN]) State.lessons[key][pairN] = [];
  State.lessons[key][pairN].push({ tid, dept, room, building: State.activeBuilding });
  State.save();
  renderDayPanel(key);
  showToast('Преподаватель добавлен в пару', 'success');
  if (sb) saveLessonsBatch(key, State.lessons[key] || {});
}
function removePairEntry(key, pairN, idx) {
  const entries = getPairEntries(key, pairN);
  entries.splice(idx, 1);
  State.save();
  renderDayPanel(key);
  saveLessonsBatch(key, State.lessons[key] || {});
}

// ─── UNIFIED WELCOME / AUTH MODAL ────────────────────────────────────────────
const ADMIN_LOGIN = '123';
const ADMIN_PASSWORD = '123';
function showWelcomeModal(page) {
  const overlay = document.getElementById('welcomeModalOverlay');
  const content = document.getElementById('welcomeModalContent');
  if (!overlay || !content) return;
  if (page === 'picker') content.classList.add('wm-card--wide');
  else content.classList.remove('wm-card--wide');
  content.innerHTML = _buildWelcomePage(page);
  overlay.classList.add('open');
  _wireWelcomePage(page);
}
function hideWelcomeModal() { document.getElementById('welcomeModalOverlay')?.classList.remove('open'); }
function _buildWelcomePage(page) {
  if (page === 'choose') {
    return `
      <div class="wm-logo">
        <svg viewBox="0 0 44 44" fill="none" width="48" height="48">
          <rect width="44" height="44" rx="11" fill="#2C3E50"/>
          <rect x="9" y="18" width="8" height="17" rx="2" fill="#3498DB"/>
          <rect x="18" y="12" width="8" height="23" rx="2" fill="#5DADE2"/>
          <rect x="27" y="8" width="8" height="27" rx="2" fill="#85C1E9"/>
          <circle cx="13" cy="13" r="3.5" fill="#F39C12"/>
        </svg>
        <div>
          <div class="wm-brand">АкадемГрафик</div>
          <div class="wm-sub">Система дежурств</div>
        </div>
      </div>
      <h2 class="wm-title">Добро пожаловать</h2>
      <p class="wm-hint">Выберите режим входа</p>
      <div class="wm-choices">
        <button class="wm-choice" id="wmChooseAdmin">
          <span class="wm-choice-icon">🎓</span>
          <span class="wm-choice-label">Завуч</span>
          <span class="wm-choice-sub">Управление расписанием</span>
        </button>
        <button class="wm-choice" id="wmChooseTeacher">
          <span class="wm-choice-icon">👤</span>
          <span class="wm-choice-label">Преподаватель</span>
          <span class="wm-choice-sub">Просмотр дежурств</span>
        </button>
      </div>`;
  }
  if (page === 'login') {
    return `
      <button class="wm-back" id="wmBack" title="Назад">←</button>
      <div style="text-align:center;margin-bottom:1.25rem">
        <div style="font-size:2.2rem;margin-bottom:.4rem">🔐</div>
        <h2 class="wm-title" style="margin-bottom:.25rem">Вход для Завуча</h2>
        <p class="wm-hint">Введите логин и пароль</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:.75rem">
        <input class="field-input" type="text" id="authLogin" placeholder="Логин" autocomplete="username" style="font-size:1rem"/>
        <input class="field-input" type="password" id="authPassword" placeholder="Пароль" autocomplete="current-password" style="font-size:1rem"/>
        <div style="display:flex;align-items:center;gap:.75rem;margin-top:.25rem">
          <button class="btn-modal-save" id="authSubmit" style="flex:1;padding:.7rem">Войти</button>
          <span id="authStatus" style="font-size:1.4rem;width:28px;text-align:center;flex-shrink:0"></span>
        </div>
      </div>`;
  }
  if (page === 'picker') {
    const buildRows = (filter = '') => State.teachers.map(t => {
      const color = getColor(teacherIndex(t.id));
      const norm = filter.toLowerCase();
      const nameLower = t.name.toLowerCase();
      if (norm && !nameLower.includes(norm)) return '';
      let displayName = t.name;
      if (norm) {
        const idx = nameLower.indexOf(norm);
        displayName = t.name.slice(0, idx) + `<mark style="background:#FFF176;border-radius:2px;padding:0 1px">${t.name.slice(idx, idx + norm.length)}</mark>` + t.name.slice(idx + norm.length);
      }
      return `<button class="wm-teacher-card" data-tid="${t.id}">
        <div class="wm-teacher-av" style="background:${color};width:44px;height:44px;font-size:.85rem">${initials(t.name)}</div>
        <div class="wm-teacher-card-name">${displayName}</div>
        <div class="wm-teacher-dept" style="font-size:.65rem">${t.dept || ''}</div>
      </button>`;
    }).join('');
    return `
      <button class="wm-back" id="wmBack" title="Назад">←</button>
      <h2 class="wm-title" style="margin-bottom:.5rem">Выберите преподавателя</h2>
      <input class="field-input" id="wmTeacherSearch" placeholder="🔍 Поиск по имени или фамилии…" style="margin-bottom:.75rem;font-size:.9rem" autocomplete="off"/>
      <div class="wm-teacher-grid" id="wmTeacherGrid">${buildRows()}</div>`;
  }
  if (page === 'teacher-login') {
    const tid = State._pendingTeacherId;
    const t = teacherById(tid);
    const color = t ? getColor(teacherIndex(tid)) : '#4A90D9';
    return `
      <button class="wm-back" id="wmBack" title="Назад">←</button>
      <div style="text-align:center;margin-bottom:1.25rem">
        ${t ? `<div style="width:60px;height:60px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:700;color:#fff;margin:0 auto .75rem">${initials(t.name)}</div>` : ''}
        <h2 class="wm-title" style="margin-bottom:.25rem">${t ? t.name : 'Преподаватель'}</h2>
        <p class="wm-hint">Введите пароль для входа</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:.75rem">
        <input class="field-input" type="password" id="tAuthPassword" placeholder="Пароль" autocomplete="current-password" style="font-size:1rem"/>
        <div style="display:flex;align-items:center;gap:.75rem">
          <button class="btn-modal-save" id="tAuthSubmit" style="flex:1;padding:.7rem">Войти</button>
          <span id="tAuthStatus" style="font-size:1.4rem;width:28px;text-align:center;flex-shrink:0"></span>
        </div>
      </div>`;
  }
  return '';
}
function _wireWelcomePage(page) {
  if (page === 'choose') {
    document.getElementById('wmChooseAdmin')?.addEventListener('click', () => showWelcomeModal('login'));
    document.getElementById('wmChooseTeacher')?.addEventListener('click', async () => {
      if (State.teachers.length === 0 && sb) {
        const btn = document.getElementById('wmChooseTeacher');
        if (btn) btn.style.opacity = '0.6';
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 100));
          if (State.teachers.length > 0) break;
        }
        if (btn) btn.style.opacity = '';
      }
      if (State.teachers.length === 0) { showToast('Преподаватели ещё не добавлены в систему', 'error'); return; }
      showWelcomeModal('picker');
    });
  }
  if (page === 'login') {
    document.getElementById('wmBack')?.addEventListener('click', () => showWelcomeModal('choose'));
    const doLogin = () => {
      const login = (document.getElementById('authLogin')?.value || '').trim();
      const pass = (document.getElementById('authPassword')?.value || '').trim();
      const status = document.getElementById('authStatus');
      if (login === ADMIN_LOGIN && pass === ADMIN_PASSWORD) {
        if (status) status.textContent = '✅';
        setTimeout(() => { hideWelcomeModal(); applyRole('admin'); }, 350);
      } else {
        if (status) status.textContent = '❌';
        const pwd = document.getElementById('authPassword');
        if (pwd) pwd.value = '';
        setTimeout(() => { const s = document.getElementById('authStatus'); if (s) s.textContent = ''; }, 1500);
      }
    };
    document.getElementById('authSubmit')?.addEventListener('click', doLogin);
    document.getElementById('authPassword')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    setTimeout(() => document.getElementById('authLogin')?.focus(), 60);
  }
  if (page === 'picker') {
    document.getElementById('wmBack')?.addEventListener('click', () => showWelcomeModal('choose'));
    const grid = document.getElementById('wmTeacherGrid');
    const search = document.getElementById('wmTeacherSearch');
    const buildRows = (filter = '') => State.teachers.map(t => {
      const color = getColor(teacherIndex(t.id));
      const norm = filter.toLowerCase();
      const nameLower = t.name.toLowerCase();
      if (norm && !nameLower.includes(norm)) return '';
      let displayName = t.name;
      if (norm) {
        const idx = nameLower.indexOf(norm);
        displayName = t.name.slice(0, idx) + `<mark style="background:#FFF176;border-radius:2px;padding:0 1px">${t.name.slice(idx, idx + norm.length)}</mark>` + t.name.slice(idx + norm.length);
      }
      return `<button class="wm-teacher-card" data-tid="${t.id}">
        <div class="wm-teacher-av" style="background:${color};width:44px;height:44px;font-size:.85rem">${initials(t.name)}</div>
        <div class="wm-teacher-card-name">${displayName}</div>
        <div class="wm-teacher-dept" style="font-size:.65rem">${t.dept || ''}</div>
      </button>`;
    }).join('');
    const wireCards = () => {
      grid.querySelectorAll('.wm-teacher-card').forEach(btn => {
        btn.addEventListener('click', () => {
          State._pendingTeacherId = btn.dataset.tid;
          showWelcomeModal('teacher-login');
        });
      });
    };
    wireCards();
    search?.addEventListener('input', () => {
      grid.innerHTML = buildRows(search.value.trim());
      wireCards();
    });
    setTimeout(() => search?.focus(), 60);
  }
  if (page === 'teacher-login') {
    document.getElementById('wmBack')?.addEventListener('click', () => showWelcomeModal('picker'));
    const doTeacherLogin = () => {
      const pass = (document.getElementById('tAuthPassword')?.value || '').trim();
      const status = document.getElementById('tAuthStatus');
      if (pass === ADMIN_PASSWORD) {
        if (status) status.textContent = '✅';
        setTimeout(() => {
          State.currentTeacherId = State._pendingTeacherId;
          delete State._pendingTeacherId;
          hideWelcomeModal();
          applyRole('teacher');
        }, 350);
      } else {
        if (status) status.textContent = '❌';
        const pwd = document.getElementById('tAuthPassword');
        if (pwd) pwd.value = '';
        setTimeout(() => { const s = document.getElementById('tAuthStatus'); if (s) s.textContent = ''; }, 1500);
      }
    };
    document.getElementById('tAuthSubmit')?.addEventListener('click', doTeacherLogin);
    document.getElementById('tAuthPassword')?.addEventListener('keydown', e => { if (e.key === 'Enter') doTeacherLogin(); });
    setTimeout(() => document.getElementById('tAuthPassword')?.focus(), 60);
  }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('open');
  el.setAttribute('aria-hidden', 'true');
  if (id === 'modalOverlay') State.selectedCell = null;
}

// ─── GLOBAL DEPARTMENT REGISTRY ──────────────────────────────────────────────
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
  return [...DEFAULT_DEPTS];
}
function saveGlobalDepts(depts) { globalDepts = depts; }
let globalDepts = loadGlobalDepts();
let _modalDepts = [];
function renderDeptManager(selected) {
  const container = document.getElementById('tDeptsSection');
  if (!container) return;
  const selectedList = selected.length
    ? selected.map((d, i) => `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
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
  container.querySelectorAll('[data-dept-i]').forEach(input => {
    input.addEventListener('change', () => { const i = parseInt(input.dataset.deptI); _modalDepts[i] = input.value.trim(); });
  });
  container.querySelectorAll('[data-dept-del]').forEach(btn => {
    btn.addEventListener('click', () => { const i = parseInt(btn.dataset.deptDel); _modalDepts.splice(i, 1); renderDeptManager(_modalDepts); });
  });
  document.getElementById('tDeptAddFromList').addEventListener('click', () => {
    const val = document.getElementById('tDeptPickSel').value;
    if (!val) return;
    if (!_modalDepts.includes(val)) { _modalDepts.push(val); renderDeptManager(_modalDepts); }
    else showToast('Уже добавлено', 'info');
  });
  document.getElementById('tDeptAddNew').addEventListener('click', () => {
    const val = (document.getElementById('tDeptNewInput').value || '').trim();
    if (!val) return;
    if (!globalDepts.includes(val)) { globalDepts.push(val); saveGlobalDepts(globalDepts); }
    if (!_modalDepts.includes(val)) { _modalDepts.push(val); renderDeptManager(_modalDepts); }
    else showToast('Уже добавлено', 'info');
  });
}


// ─── CONFIRM MODAL ──────────────────────────────────────────────
function showConfirmDialog(title, message, onConfirm, onCancel) {
  const modal = document.getElementById('confirmModal');
  const titleEl = document.getElementById('confirmModalTitle');
  const bodyEl = document.getElementById('confirmModalBody');
  const closeBtn = document.getElementById('confirmModalClose');
  const cancelBtn = document.getElementById('confirmModalCancel');
  const okBtn = document.getElementById('confirmModalOk');

  titleEl.textContent = title;
  bodyEl.innerHTML = `<p>${message}</p>`;

  const closeHandler = () => {
    modal.classList.remove('open');
    if (onCancel && typeof onCancel === 'function') onCancel();
    cleanup();
  };
  const okHandler = () => {
    modal.classList.remove('open');
    if (onConfirm && typeof onConfirm === 'function') onConfirm();
    cleanup();
  };
  const cancelHandler = () => {
    modal.classList.remove('open');
    if (onCancel && typeof onCancel === 'function') onCancel();
    cleanup();
  };
  const cleanup = () => {
    closeBtn.removeEventListener('click', closeHandler);
    cancelBtn.removeEventListener('click', cancelHandler);
    okBtn.removeEventListener('click', okHandler);
  };

  closeBtn.addEventListener('click', closeHandler);
  cancelBtn.addEventListener('click', cancelHandler);
  okBtn.addEventListener('click', okHandler);

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

// ─── TEACHER INFO POPUP ───────────────────────────────────────────────────────
function openTeacherInfoModal(tid) {
  const t = teacherById(tid);
  if (!t) return;
  const color = getColor(teacherIndex(tid));
  const depts = Array.isArray(t.depts) && t.depts.length ? t.depts : [t.dept].filter(Boolean);
  const deptsHtml = depts.map(d => `<span style="display:inline-block;background:${color}18;border:1px solid ${color}40;border-radius:12px;padding:3px 10px;font-size:.78rem;margin:2px">${d}</span>`).join('');
  const y = State.currentDate.getFullYear();
  const m = State.currentDate.getMonth();
  const prefix = `${y}-${String(m+1).padStart(2,'0')}`;
  const dutyCount = Object.keys(State.duties).filter(k => k.startsWith(prefix) && getDutyIds(k).includes(tid)).length;
  const blackouts = (State.blackoutDates[tid] || []).sort().map(k => { const d = new Date(k + 'T00:00:00'); return `${d.getDate()} ${MONTHS_RU_GEN[d.getMonth()]}`; });
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
      ${State.currentRole === 'admin' ? `<button class="btn-modal-save" onclick="closeModal('teacherInfoOverlay');openTeacherModal('${tid}')">✏️ Редактировать</button>` : ''}
    </div>`;
  const overlay = document.getElementById('teacherInfoOverlay');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
}

// ─── TEACHER MODAL (Add / Edit Popup) ────────────────────────────────────────
let _modalBlackouts = [];
function openTeacherModal(editId = null) {
  const overlay = document.getElementById('teacherModalOverlay');
  const title = document.getElementById('teacherModalTitle');
  document.getElementById('tEditId').value = editId || '';
  if (editId) {
    const t = teacherById(editId);
    title.textContent = 'Редактировать преподавателя';
    document.getElementById('tName').value = t.name || '';
    document.getElementById('tPhone').value = t.phone || '';
    document.getElementById('tLoad').value = t.maxLoad || 2;
    document.getElementById('tBuilding').value = t.building || '1';
    _modalDepts = Array.isArray(t.depts) && t.depts.length ? [...t.depts] : [t.dept].filter(Boolean);
  } else {
    title.textContent = 'Добавить преподавателя';
    ['tName','tPhone'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('tLoad').value = 2;
    document.getElementById('tBuilding').value = '1';
    _modalDepts = [];
  }
  renderDeptManager(_modalDepts);
  const tid = editId;
  const existingBlackouts = tid ? (State.blackoutDates[tid] || []) : [];
  _modalBlackouts = [...existingBlackouts];
  renderModalBlackouts(_modalBlackouts, tid);
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  setTimeout(() => document.getElementById('tName').focus(), 60);
}
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
        <button type="button" class="btn btn--outline" id="tBlackoutAddBtn" style="white-space:nowrap;padding:.45rem .85rem;font-size:.8rem">+ Добавить</button>
      </div>
      <div id="tBlackoutTags" style="display:flex;flex-wrap:wrap;gap:.35rem;min-height:1.5rem">${tagsHtml}</div>
    </div>`;
  document.getElementById('tBlackoutAddBtn').addEventListener('click', () => {
    const input = document.getElementById('tBlackoutInput');
    const val = input.value;
    if (!val) { showToast('Выберите дату', 'error'); return; }
    if (!_modalBlackouts) _modalBlackouts = [];
    if (_modalBlackouts.includes(val)) { showToast('Уже добавлено', 'info'); return; }
    _modalBlackouts.push(val);
    input.value = '';
    renderModalBlackouts(_modalBlackouts, tid);
  });
  container.querySelectorAll('.blackout-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      _modalBlackouts = (_modalBlackouts || []).filter(k => k !== btn.dataset.k);
      renderModalBlackouts(_modalBlackouts, tid);
    });
  });
}
function saveTeacherModal() {
  const name = (document.getElementById('tName').value || '').trim();
  document.querySelectorAll('[data-dept-i]').forEach(input => {
    const i = parseInt(input.dataset.deptI);
    if (_modalDepts[i] !== undefined) _modalDepts[i] = input.value.trim();
  });
  const depts = _modalDepts.filter(Boolean);
  const phone = (document.getElementById('tPhone').value || '').trim();
  const maxLoad = Math.max(1, Math.min(6, parseInt(document.getElementById('tLoad').value) || 2));
  const building = document.getElementById('tBuilding')?.value || '1';
  const editId = document.getElementById('tEditId').value;
  if (!name) { showToast('Введите ФИО', 'error'); return; }
  if (!depts.length) { showToast('Добавьте хотя бы одну кафедру', 'error'); return; }
  const dept = depts[0];
  if (editId) {
    const t = teacherById(editId);
    if (t) {
      Object.assign(t, { name, dept, depts, phone, maxLoad, building });
      State.blackoutDates[editId] = [...(_modalBlackouts || [])];
      t.blackoutDates = State.blackoutDates[editId];
    }
    showToast('Данные обновлены', 'success');
  } else {
    const newId = 't_' + Date.now();
    State.teachers.push({ id: newId, name, dept, depts, phone, maxLoad, building, blackoutDates: [...(_modalBlackouts || [])] });
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
let _inlineDepts = [];
function renderInlineDeptManager(depts) {
  const container = document.getElementById('inlineDeptsSection');
  if (!container) return;
  const tagsHtml = depts.length
    ? depts.map((d, i) => `
        <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">
          <span style="flex:1;font-size:.78rem;background:var(--blue-light);border:1px solid var(--blue);border-radius:4px;padding:2px 8px;color:var(--navy);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d}</span>
          <button type="button" class="modal-remove-one" data-inline-del="${i}" style="flex-shrink:0">✕</button>
        </div>`).join('')
    : '<div style="font-size:.75rem;color:var(--text-faint);font-style:italic">Нет кафедр</div>';
  container.innerHTML = `
    <div id="inlineDeptTags" style="margin-bottom:6px">${tagsHtml}</div>
    <div style="display:flex;gap:5px;margin-bottom:4px">
      <div class="select-wrap" style="flex:1;min-width:0">
        <select class="field-input field-select" id="inlineDeptPickSel" style="height:32px;font-size:.78rem">
          <option value="">— выбрать из списка —</option>
          ${globalDepts.map(d => `<option value="${d.replace(/"/g,'&quot;')}">${d}</option>`).join('')}
        </select>
        <svg class="select-arrow" viewBox="0 0 16 16" fill="none" width="12" height="12"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <button type="button" class="btn btn--outline" id="inlineDeptAddFromList" style="padding:.3rem .7rem;font-size:.78rem;height:32px">+</button>
    </div>
    <div style="display:flex;gap:5px">
      <input class="field-input" id="inlineDeptNewInput" placeholder="Новая кафедра…" style="flex:1;height:32px;font-size:.78rem"/>
      <button type="button" class="btn btn--outline" id="inlineDeptAddNew" style="padding:.3rem .7rem;font-size:.78rem;height:32px;white-space:nowrap">+ Создать</button>
    </div>`;
  container.querySelectorAll('[data-inline-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      _inlineDepts.splice(parseInt(btn.dataset.inlineDel), 1);
      renderInlineDeptManager(_inlineDepts);
    });
  });
  document.getElementById('inlineDeptAddFromList')?.addEventListener('click', () => {
    const val = document.getElementById('inlineDeptPickSel')?.value;
    if (!val) return;
    if (!_inlineDepts.includes(val)) { _inlineDepts.push(val); renderInlineDeptManager(_inlineDepts); }
    else showToast('Уже добавлено', 'info');
  });
  document.getElementById('inlineDeptAddNew')?.addEventListener('click', () => {
    const val = (document.getElementById('inlineDeptNewInput')?.value || '').trim();
    if (!val) return;
    if (!globalDepts.includes(val)) { globalDepts.push(val); saveGlobalDepts(globalDepts); }
    if (!_inlineDepts.includes(val)) { _inlineDepts.push(val); renderInlineDeptManager(_inlineDepts); }
    else showToast('Уже добавлено', 'info');
  });
}
function addTeacher() {
  const name = document.getElementById('teacherName').value.trim();
  const depts = [..._inlineDepts];
  const phone = document.getElementById('teacherPhone')?.value.trim() || '';
  const maxLoad = Math.max(1, Math.min(6, parseInt(document.getElementById('teacherLoad')?.value) || 2));
  const building = document.getElementById('teacherBuilding')?.value || '1';
  if (!name) { showToast('Введите ФИО преподавателя', 'error'); document.getElementById('teacherName').focus(); return; }
  if (!depts.length) { showToast('Добавьте хотя бы одну кафедру', 'error'); return; }
  const newId = 't_' + Date.now();
  const newTeacher = { id: newId, name, dept: depts[0], depts, phone, maxLoad, building, blackoutDates: [] };
  State.teachers.push(newTeacher);
  State.save();
  if (sb) saveTeachers(newTeacher);   // ★ добавить
  document.getElementById('teacherName').value = '';
  if (document.getElementById('teacherPhone')) document.getElementById('teacherPhone').value = '';
  if (document.getElementById('teacherLoad')) document.getElementById('teacherLoad').value = '2';
  _inlineDepts = [];
  renderInlineDeptManager(_inlineDepts);
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
  const container = document.getElementById('teachersList');
  const badge = document.getElementById('teacherCount');
  if (badge) badge.textContent = State.teachers.length;
  if (!container) return;
  if (State.teachers.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📋</div>
      <p class="empty-title">Список пуст</p>
      <p class="empty-sub">Нажмите «Добавить преподавателя»</p>
    </div>`;
    return;
  }
  const maxD = getWorkdaysInMonth();
  const byBuilding = { '1': [], '2': [], '3': [] };
  State.teachers.forEach((t, idx) => { const b = t.building || '1'; if (!byBuilding[b]) byBuilding[b] = []; byBuilding[b].push({ t, idx }); });
  container.innerHTML = ['1','2','3'].map(b => `
    <details class="building-section" open>
      <summary class="building-section-header">
        <span class="building-section-label">🏢 ${b} корпус</span>
        <span class="building-section-count">${byBuilding[b].length} преп.</span>
        <span class="building-section-chevron">▾</span>
      </summary>
      <div class="building-section-table">
        ${byBuilding[b].length === 0
          ? `<div class="building-empty">Нет преподавателей</div>`
          : `<table class="teacher-table">
              <thead>
                <tr>
                  <th>ФИО</th><th>Кафедра</th><th>Телефон</th>
                  <th style="text-align:center">Нагр.</th><th style="text-align:center">Дн.</th><th></th>
                </tr>
              </thead>
              <tbody>
                ${byBuilding[b].map(({ t, idx }) => {
                  const color = getColor(idx);
                  const dc = getMonthDutyCount(t.id);
                  return `
                    <tr>
                      <td>
                        <div style="display:flex;align-items:center;gap:8px">
                          <div style="width:28px;height:28px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:.62rem;font-weight:700;color:#fff;flex-shrink:0">${initials(t.name)}</div>
                          <span style="font-size:.82rem;font-weight:600;color:var(--navy)">${t.name}</span>
                        </div>
                      </td>
                      <td style="font-size:.75rem;color:var(--text-muted)">${t.dept}</td>
                      <td style="font-size:.75rem;font-family:var(--font-mono)">${t.phone || '—'}</td>
                      <td style="text-align:center;font-size:.78rem">${t.maxLoad}</td>
                      <td style="text-align:center;font-size:.78rem;font-weight:600;color:${dc > 0 ? 'var(--blue)' : 'var(--text-faint)'}">${dc}</td>
                      <td>
                        <div style="display:flex;gap:4px;justify-content:flex-end">
                          <button class="t-remove" style="padding:4px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:.7rem;background:var(--surface);cursor:pointer" data-edit="${t.id}">✏️</button>
                          <button class="t-remove" data-id="${t.id}">
                            <svg viewBox="0 0 16 16" fill="none" width="13" height="13"><path d="M3 4h10M6 4V2.5h4V4M5.5 4l.5 9M10.5 4l-.5 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>`}
      </div>
    </details>`).join('');
  container.querySelectorAll('[data-edit]').forEach(btn => { btn.addEventListener('click', () => openTeacherModal(btn.dataset.edit)); });
  container.querySelectorAll('[data-id]').forEach(btn => { btn.addEventListener('click', () => removeTeacher(btn.dataset.id)); });
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
  const y = State.currentDate.getFullYear();
  const m = State.currentDate.getMonth();
  const prefix = `${y}-${String(m+1).padStart(2,'0')}`;
  const maxD = getWorkdaysInMonth();
  const weekMap = {};
  const days = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= days; d++) { 
    const key = dateKey(y, m, d); 
    const wk = getWeekKeys(key)[0]; 
    if (!weekMap[wk]) weekMap[wk] = getWeekKeys(key); 
  }

  const searchLower = statsSearchText.trim().toLowerCase();
  const filteredTeachers = searchLower === ''
    ? State.teachers
    : State.teachers.filter(t => t.name.toLowerCase().includes(searchLower));

  if (filteredTeachers.length === 0) {
    grid.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🔍</div>
      <p class="empty-title">Ничего не найдено</p>
      <p class="empty-sub">Попробуйте изменить поисковый запрос</p>
    </div>`;
    return;
  }

  grid.innerHTML = filteredTeachers.map((t, idxOrig) => {
    const originalIdx = State.teachers.findIndex(tt => tt.id === t.id);
    const color = getColor(originalIdx);
    const monthCount = Object.keys(State.duties).filter(k => k.startsWith(prefix) && getDutyIds(k).includes(t.id)).length;
    const maxWeekLoad = Math.max(...Object.values(weekMap).map(wk => weekDutiesCount(t.id, wk)), 0);
    const replaceCount = Object.keys(State.replaceRequests).filter(k => getDutyIds(k).includes(t.id) && k.startsWith(prefix)).length;
    const loadPct = t.maxLoad ? Math.min(100, Math.round(maxWeekLoad / t.maxLoad * 100)) : 0;
    const monthPct = maxD ? Math.min(100, Math.round(monthCount / maxD * 100)) : 0;
    let loadStatus, barColor, barClass;
    if (loadPct >= 100) { loadStatus = 'over'; barColor = '#C0392B'; barClass = 'stat-bar-fill--over'; }
    else if (loadPct >= 70) { loadStatus = 'warn'; barColor = '#D4850A'; barClass = ''; }
    else { loadStatus = 'ok'; barColor = '#1E8449'; barClass = ''; }
    const statusLabel = { ok: '✓ Норма', warn: '⚠ Высокая нагрузка', over: '✕ Перебор смен' }[loadStatus];
    const pctClass = `stat-bar-pct--${loadStatus}`;
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
  const tid = State.currentTeacherId;
  const listEl = document.getElementById('myDutiesList');
  const blEl = document.getElementById('blackoutList');
  if (!listEl || !blEl) return;
  const cabinetTitle = document.getElementById('cabinetTeacherName');
  if (cabinetTitle) { const t = teacherById(tid); cabinetTitle.textContent = t ? t.name : '—'; }
  const y = State.currentDate.getFullYear();
  const m = State.currentDate.getMonth();
  const prefix = `${y}-${String(m+1).padStart(2,'0')}`;
  const myDuties = Object.keys(State.duties)
    .filter(k => k.startsWith(prefix) && getDutyEntries(k).some(e => e.tid === tid))
    .sort((a, b) => a.localeCompare(b));
  if (!tid || myDuties.length === 0) {
    listEl.innerHTML = `<div class="empty-state" style="padding:1.5rem">
      <div class="empty-icon">📅</div>
      <p class="empty-title">Нет дежурств</p>
    </div>`;
  } else {
    listEl.innerHTML = myDuties.map(key => {
      const d = new Date(key + 'T00:00:00');
      const dayStr = `${d.getDate()} ${MONTHS_RU_GEN[d.getMonth()]}`;
      const isReq = !!State.replaceRequests[key];
      return `<div class="my-duty-row">
        <div class="my-duty-date">${dayStr}, ${DAYS_SHORT[d.getDay()]}</div>
        <div class="my-duty-status${isReq ? ' replace' : ''}">${isReq ? '🔄 Запрошена замена' : '✓ Запланировано'}</div>
        <button class="my-duty-action${isReq ? ' cancel' : ''}" data-key="${key}">
          ${isReq ? 'Отменить' : '🔄 Запросить замену'}
        </button>
      </div>`;
    }).join('');
    listEl.querySelectorAll('[data-key]').forEach(btn => { btn.addEventListener('click', () => toggleReplaceRequest(btn.dataset.key)); });
  }
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
  const val = input.value;
  if (!val) { showToast('Выберите дату', 'error'); return; }
  if (!State.blackoutDates[tid]) State.blackoutDates[tid] = [];
  if (State.blackoutDates[tid].includes(val)) { showToast('Уже добавлено', 'info'); return; }
  State.blackoutDates[tid].push(val);
  State.save();
  input.value = '';
  renderMyCabinet(); renderCalendar(); renderAccordion();
  showToast('Нежелательная дата добавлена', 'success');
}
// ─── AUTO-DISTRIBUTION (с поддержкой шаблонов, без затирания других корпусов) ──
async function applyTemplate(templateId) {
  if (!sb) { showToast('Supabase не подключён', 'error'); return; }
  const { data, error } = await sb.from('templates').select('*').eq('id', templateId).single();
  if (error || !data) { showToast('Шаблон не найден', 'error'); return; }
  if (data.building !== State.activeBuilding) { showToast('Шаблон другого корпуса', 'error'); return; }
  const dutiesObj = data.duties_json;
  const lessonsObj = data.lessons_json;
  const y = State.currentDate.getFullYear();
  const m = State.currentDate.getMonth();
  const prefix = `${y}-${String(m+1).padStart(2,'0')}`;
  // Удаляем только записи текущего корпуса (не трогаем другие корпуса)
  for (const [key, val] of Object.entries(State.duties)) {
    if (key.startsWith(prefix)) {
      State.duties[key] = val.filter(e => e.building !== State.activeBuilding);
      if (State.duties[key].length === 0) delete State.duties[key];
    }
  }
  for (const [key, pairs] of Object.entries(State.lessons)) {
    if (key.startsWith(prefix)) {
      for (const pn of Object.keys(pairs)) {
        State.lessons[key][pn] = pairs[pn].filter(e => e.building !== State.activeBuilding);
        if (State.lessons[key][pn].length === 0) delete State.lessons[key][pn];
      }
      if (Object.keys(State.lessons[key]).length === 0) delete State.lessons[key];
    }
  }
  // Загружаем из шаблона (с указанием building = текущий корпус)
  for (const [dayKey, dutyList] of Object.entries(dutiesObj)) {
    if (dayKey.startsWith(prefix)) {
      State.duties[dayKey] = dutyList.map(d => ({ tid: d.tid, dept: d.dept || null, building: State.activeBuilding }));
    }
  }
  for (const [dayKey, pairData] of Object.entries(lessonsObj)) {
    if (dayKey.startsWith(prefix)) {
      if (!State.lessons[dayKey]) State.lessons[dayKey] = {};
      for (const [pn, arr] of Object.entries(pairData)) {
        State.lessons[dayKey][pn] = arr.map(e => ({ tid: e.tid, dept: e.dept || '', room: e.room || '', building: State.activeBuilding }));
      }
    }
  }
  State.save();
  renderCalendar(); renderAccordion(); renderTeachersList(); renderStats(); renderMyCabinet();
  showToast(`Шаблон «${data.name}» загружен`, 'success');
}
async function autoDistribute(useActiveTemplate = true) {
  if (State.teachers.length === 0) {
    showToast('Добавьте хотя бы одного преподавателя', 'error');
    return;
  }
  if (useActiveTemplate && State.activeTemplateId) {
    await applyTemplate(State.activeTemplateId);
    return;
  }

  const y = State.currentDate.getFullYear();
  const m = State.currentDate.getMonth();
  const total = new Date(y, m + 1, 0).getDate();
  const prefix = `${y}-${String(m+1).padStart(2,'0')}`;
  const workdays = [];
  for (let d = 1; d <= total; d++) {
    const key = dateKey(y, m, d);
    const dow = new Date(y, m, d).getDay();
    if (dow !== 0 && !getHolidayName(key)) workdays.push(key);
  }

  // 1. Очищаем локальный state для текущего корпуса (только рабочие дни)
  for (const wd of workdays) {
    const v = State.duties[wd];
    if (v) {
      const allEntries = (Array.isArray(v) ? v : [v]).map(normEntry);
      const kept = allEntries.filter(e => e.building !== State.activeBuilding);
      if (kept.length) State.duties[wd] = kept; else delete State.duties[wd];
    }
    if (State.lessons[wd]) {
      for (let pn = 1; pn <= 6; pn++) {
        if (State.lessons[wd][pn]) {
          State.lessons[wd][pn] = State.lessons[wd][pn].filter(e => e.building !== State.activeBuilding);
          if (State.lessons[wd][pn].length === 0) delete State.lessons[wd][pn];
        }
      }
      if (Object.keys(State.lessons[wd]).length === 0) delete State.lessons[wd];
    }
  }

  // 2. Подготовка
  const weekCounts = {};
  const monthCounts = {};
  const pairCounts = {};
  State.teachers.forEach(t => {
    weekCounts[t.id] = {};
    monthCounts[t.id] = 0;
    pairCounts[t.id] = 0;
  });

  const buildingTeachers = State.teachers.filter(t => (t.building || '1') === State.activeBuilding);
  if (buildingTeachers.length === 0) {
    showToast(`Нет преподавателей в ${State.activeBuilding} корпусе`, 'error');
    return;
  }

  // 3. Распределяем пары и дежурных
  for (const key of workdays) {
    const weekKeys = getWeekKeys(key);
    const weekId = weekKeys[0];
    const blackoutCheck = (t) => {
      const bl = [...(t.blackoutDates || []), ...(State.blackoutDates[t.id] || [])];
      return bl.includes(key);
    };

    if (!State.lessons[key]) State.lessons[key] = {};
    for (let pn = 1; pn <= 6; pn++) State.lessons[key][pn] = [];

    let shuffled = [...buildingTeachers].filter(t => !blackoutCheck(t));
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const maxTeachersPerPair = Math.max(2, Math.ceil(shuffled.length / 6));
    let tIdx = 0;
    for (let pi = 0; pi < 6 && tIdx < shuffled.length; pi++) {
      const pairN = pi + 1;
      const remaining = shuffled.length - tIdx;
      const pairsLeft = 6 - pi;
      let minSlot = Math.max(1, Math.floor(remaining / pairsLeft / 1.5));
      let maxSlot = Math.min(maxTeachersPerPair, Math.ceil(remaining / pairsLeft * 1.8));
      if (pairN === 6) {
        minSlot = 0;
        maxSlot = Math.min(1, remaining);
      }
      if (pairN === 5) maxSlot = Math.min(maxSlot, Math.ceil(maxTeachersPerPair * 0.6));
      const slotSize = minSlot + Math.floor(Math.random() * (maxSlot - minSlot + 1));
      for (let s = 0; s < slotSize && tIdx < shuffled.length; s++, tIdx++) {
        const t = shuffled[tIdx];
        const dept = Array.isArray(t.depts) && t.depts.length ? t.depts[0] : (t.dept || '');
        const roomBase = 100 + (teacherIndex(t.id) * 37 + pairN * 13) % 500;
        State.lessons[key][pairN].push({ tid: t.id, dept, room: String(roomBase), building: State.activeBuilding });
        pairCounts[t.id]++;
      }
    }

    const pair1 = State.lessons[key][1] || [];
    const pair2 = State.lessons[key][2] || [];
    const dutyPool = [...pair1, ...pair2];
    let dutyTeacher = null;
    for (const entry of dutyPool) {
      const t = teacherById(entry.tid);
      if (!t) continue;
      if (blackoutCheck(t)) continue;
      if (monthCounts[t.id] >= 2) continue;
      if ((t.building || '1') !== State.activeBuilding) continue;
      dutyTeacher = t;
      break;
    }
    if (!dutyTeacher) {
      dutyTeacher = buildingTeachers
        .filter(t => !blackoutCheck(t) && monthCounts[t.id] < 2)
        .sort((a, b) => monthCounts[a.id] - monthCounts[b.id])[0] || buildingTeachers[0];
    }
    if (dutyTeacher) {
      const dept = Array.isArray(dutyTeacher.depts) && dutyTeacher.depts.length ? dutyTeacher.depts[0] : (dutyTeacher.dept || '');
      // Добавляем только в локальный state — Supabase пишем батчем ниже
      const v = State.duties[key];
      const allEntries = v ? (Array.isArray(v) ? v : [v]).map(normEntry) : [];
      allEntries.push({ tid: dutyTeacher.id, dept, building: State.activeBuilding });
      State.duties[key] = allEntries;
      weekCounts[dutyTeacher.id][weekId] = (weekCounts[dutyTeacher.id][weekId] || 0) + 1;
      monthCounts[dutyTeacher.id]++;
    }
  }

  State.save();
  renderCalendar();
  renderAccordion();
  renderTeachersList();
  renderStats();
  renderMyCabinet();

  // ─── СОХРАНЕНИЕ В SUPABASE С ПОДАВЛЕНИЕМ REALTIME ───
  _suppressRealtimeRender = true;
  try {
    await deleteScheduleMonthForBuilding(y, m, State.activeBuilding);
    await deleteLessonsMonthForBuilding(y, m, State.activeBuilding);

    const scheduleRows = [];
    for (const [key, val] of Object.entries(State.duties)) {
      if (!key.startsWith(`${y}-${String(m+1).padStart(2,'0')}`)) continue;
      for (const e of val) {
        if (e.building === State.activeBuilding) {
          scheduleRows.push({
            date_key: key,
            teacher_id: e.tid,
            dept: e.dept || '',
            replace_request: State.replaceRequests[key] || false,
            building: e.building
          });
        }
      }
    }
    if (scheduleRows.length) await saveScheduleBatch(scheduleRows);

    const lessonRows = [];
    for (const [key, lessons] of Object.entries(State.lessons)) {
      if (!key.startsWith(`${y}-${String(m+1).padStart(2,'0')}`)) continue;
      for (const [pn, arr] of Object.entries(lessons)) {
        for (const e of arr) {
          if (e.building === State.activeBuilding) {
            lessonRows.push({
              date_key: key,
              pair_num: pn,
              teacher_id: e.tid,
              dept: e.dept || '',
              room: e.room || '',
              building: e.building
            });
          }
        }
      }
    }
    if (lessonRows.length) {
      const chunkSize = 500;
      for (let i = 0; i < lessonRows.length; i += chunkSize) {
        await sb.from('lessons').insert(lessonRows.slice(i, i + chunkSize));
      }
    }
    showToast(`Распределение для ${State.activeBuilding} корпуса сохранено в облако`, 'success');
  } finally {
    await new Promise(r => setTimeout(r, 2500));
    _suppressRealtimeRender = false;
    // Прогрессивное мигание — ячейки вспыхивают по очереди
    workdays.forEach((day, i) => {
      setTimeout(() => flashCell(day), 80 + i * 60);
    });
  }
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
  document.getElementById('printDate').textContent = new Date().toLocaleDateString('ru-RU', { day:'2-digit', month:'long', year:'numeric' });
  window.print();
}

// ─── TABS ────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  const dpanel = document.getElementById('dayPanel');
  const dbackdrop = document.getElementById('dayPanelBackdrop');
  if (dpanel) { dpanel.classList.remove('open'); dpanel.style.visibility = 'hidden'; }
  if (dbackdrop) dbackdrop.classList.remove('open');
  document.body.classList.remove('panel-open');
  State.activeDayKey = null;
  setTimeout(() => { if (dpanel) dpanel.style.visibility = ''; }, 320);
  document.querySelectorAll('.nav-btn, .mob-nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`tab-${tab}`);
  if (panel) panel.classList.add('active');
  if (tab === 'stats') renderStats();
  if (tab === 'cabinet') renderMyCabinet();
}
function initTabs() {
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
      document.getElementById('mobileNav').classList.remove('open');
      document.getElementById('hamburger').classList.remove('open');
      document.getElementById('hamburger').setAttribute('aria-expanded', 'false');
    });
  });
}

// ─── SUPABASE INTEGRATION ───────────────────────────────────────────────────
const SUPABASE_URL = 'https://ocqteleoxnguuxfivxpu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_jpH1scGDgkLvpVA0USJI_A_8no8yHBx';
let sb = null;
let sbChannel = null;
let sbReady = false;
let _suppressRealtimeRender = false;

function setSbStatus(state, msg) {
  const dot = document.getElementById('sbDot');
  const text = document.getElementById('sbStatusText');
  if (!dot || !text) return;
  dot.className = `sb-status-dot ${state}`;
  text.textContent = `Supabase: ${msg}`;
}
async function initSupabase() {
  let sdk = null;
  for (let i = 0; i < 50; i++) {
    sdk = window.supabase ?? window.Supabase ?? window.supabaseJs;
    if (sdk && typeof sdk.createClient === 'function') break;
    await new Promise(r => setTimeout(r, 100));
  }
  if (!sdk || typeof sdk.createClient !== 'function') {
    setSbStatus('error', '⚠️ SDK не загружен — проверьте интернет');
    return;
  }
  setSbStatus('connecting', 'подключение…');
  try {
    sb = sdk.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 10 } },
    });
    const { error: pingErr } = await sb.from('teachers').select('id').limit(1);
    if (pingErr) throw new Error(pingErr.message.includes('fetch') ? '⚠️ Нет доступа к серверу — проверьте интернет или VPN' : `Ошибка БД: ${pingErr.message}`);
    await loadTeachers(); await loadSchedule(); await loadLessons();
    subscribeRealtime();
    setSbStatus('connected', 'подключено ✓');
    sbReady = true;
  } catch (err) {
    const friendly = err.message.includes('fetch') ? '⚠️ Нет соединения с сервером — работаем офлайн' : `⚠️ ${err.message}`;
    console.error('[SB] Ошибка:', err.message);
    setSbStatus('error', friendly);
    sb = null;
    setTimeout(initSupabase, 15000);
  }
}
async function loadTeachers() { if (!sb) return; const { data, error } = await sb.from('teachers').select('*').order('name'); if (error) { console.warn('[SB] loadTeachers error:', error.message); return; } if (!data || data.length === 0) return; State.teachers = data.map(mapTeacherRow); State.blackoutDates = {}; State.teachers.forEach(t => { if (t.blackoutDates?.length) State.blackoutDates[t.id] = t.blackoutDates; }); State.save(); renderTeachersList(); }
async function loadSchedule() { if (!sb) return; const { data, error } = await sb.from('schedule').select('date_key, teacher_id, dept, replace_request, building'); if (error) { console.warn('[SB] loadSchedule error:', error.message); return; } State.duties = {}; State.replaceRequests = {}; (data || []).forEach(r => { if (r.teacher_id) { if (!State.duties[r.date_key]) State.duties[r.date_key] = []; const entry = { tid: r.teacher_id, dept: r.dept || null, building: r.building || '1' }; if (!State.duties[r.date_key].some(e => e.tid === entry.tid && e.dept === entry.dept && e.building === entry.building)) State.duties[r.date_key].push(entry); } if (r.replace_request) State.replaceRequests[r.date_key] = true; }); State.save(); renderCalendar(); renderAccordion(); renderStats(); renderMyCabinet(); }
function mapTeacherRow(r) { let depts = []; if (Array.isArray(r.depts) && r.depts.length) depts = r.depts; else if (r.dept) depts = [r.dept]; return { id: r.id, name: r.name, dept: depts[0] || '', depts: depts, phone: r.phone || '', maxLoad: r.max_load || 2, blackoutDates: Array.isArray(r.blackout_dates) ? r.blackout_dates : [], building: r.building || '1' }; }
async function saveTeachers(teacher) { if (!sb || !teacher) return; const depts = Array.isArray(teacher.depts) && teacher.depts.length ? teacher.depts : [teacher.dept].filter(Boolean); const { error } = await sb.from('teachers').upsert({ id: teacher.id, name: teacher.name, dept: depts[0] || '', depts: depts, phone: teacher.phone || '', max_load: teacher.maxLoad || 2, blackout_dates: State.blackoutDates[teacher.id] || [], building: teacher.building || '1' }, { onConflict: 'id' }); if (error) console.warn('[SB] saveTeachers error:', error.message); }
async function deleteTeacherFromSb(id) { if (!sb) return; await sb.from('schedule').update({ teacher_id: null }).eq('teacher_id', id); await sb.from('teachers').delete().eq('id', id); }
async function saveSchedule(key, teacherId, replaceRequest = false, dept = null, building = State.activeBuilding) { if (!sb) return; if (teacherId) { await sb.from('schedule').upsert({ date_key: key, teacher_id: teacherId, dept: dept || '', replace_request: replaceRequest, building: building }, { onConflict: 'date_key,teacher_id,dept' }); } else { await sb.from('schedule').delete().eq('date_key', key); } }
async function saveScheduleRemoveOne(key, teacherId, building = State.activeBuilding) { if (!sb) return; await sb.from('schedule').delete().eq('date_key', key).eq('teacher_id', teacherId).eq('building', building); }
async function saveScheduleBatch(rows) {
  if (!sb || !rows.length) return;
  // rows должны содержать поле building
  await sb.from('schedule').upsert(rows, { onConflict: 'date_key,teacher_id,dept' });
}
async function deleteScheduleMonthForBuilding(year, month, building) {
  if (!sb) return;
  const total = new Date(year, month + 1, 0).getDate();
  // Удаляем только рабочие дни — выходные и праздники не трогаем
  const workdayKeys = [];
  for (let d = 1; d <= total; d++) {
    const key = dateKey(year, month, d);
    const dow = new Date(year, month, d).getDay();
    if (dow !== 0 && !getHolidayName(key)) workdayKeys.push(key);
  }
  if (!workdayKeys.length) return;
  // Удаляем батчами по 50 ключей
  const chunkSize = 50;
  for (let i = 0; i < workdayKeys.length; i += chunkSize) {
    const chunk = workdayKeys.slice(i, i + chunkSize);
    await sb.from('schedule').delete().in('date_key', chunk).eq('building', building);
  }
}
async function deleteLessonsMonthForBuilding(year, month, building) {
  if (!sb) return;
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const from = `${prefix}-01`;
  const to = `${prefix}-32`;
  await sb.from('lessons').delete().gte('date_key', from).lte('date_key', to).eq('building', building);
}
async function loadLessons() { if (!sb) return; const y = State.currentDate.getFullYear(); const m = State.currentDate.getMonth(); const prefix = `${y}-${String(m+1).padStart(2,'0')}`; const { data, error } = await sb.from('lessons').select('date_key, pair_num, teacher_id, dept, room, building').like('date_key', prefix + '%'); if (error) { console.warn('[SB] loadLessons error:', error.message); return; } Object.keys(State.lessons).forEach(k => { if (k.startsWith(prefix)) delete State.lessons[k]; }); (data || []).forEach(r => { if (!State.lessons[r.date_key]) State.lessons[r.date_key] = {}; const pn = r.pair_num; if (!State.lessons[r.date_key][pn]) State.lessons[r.date_key][pn] = []; State.lessons[r.date_key][pn].push({ tid: r.teacher_id, dept: r.dept || '', room: r.room || '', building: r.building || '1' }); }); }
async function saveLessonsBatch(key, lessons) { if (!sb) return; await sb.from('lessons').delete().eq('date_key', key); const rows = []; [1,2,3,4,5,6].forEach(pn => { (lessons[pn] || []).forEach(e => { rows.push({ date_key: key, pair_num: pn, teacher_id: e.tid, dept: e.dept || '', room: e.room || '', building: e.building || State.activeBuilding }); }); }); if (rows.length) await sb.from('lessons').insert(rows); }
function subscribeRealtime() { if (!sb || sbChannel) return; sbChannel = sb.channel('ag-realtime-v6').on('postgres_changes', { event: '*', schema: 'public', table: 'schedule' }, onScheduleChange).on('postgres_changes', { event: '*', schema: 'public', table: 'teachers' }, onTeacherChange).on('postgres_changes', { event: '*', schema: 'public', table: 'lessons' }, onLessonsChange).subscribe(status => { if (status === 'SUBSCRIBED') setSbStatus('connected', 'подключено · Realtime ⚡'); else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { setSbStatus('error', 'Realtime: ошибка канала'); setTimeout(() => { sbChannel = null; subscribeRealtime(); }, 5000); } else if (status === 'CLOSED') { sbChannel = null; setSbStatus('error', 'Realtime: канал закрыт'); } }); }
function onLessonsChange({ eventType, new: row, old: oldRow }) { if (_suppressRealtimeRender) return; const key = row?.date_key ?? oldRow?.date_key; if (!key) return; if (eventType === 'DELETE') { if (sb) { sb.from('lessons').select('pair_num, teacher_id, dept, room, building').eq('date_key', key).then(({ data }) => { State.lessons[key] = {}; (data || []).forEach(r => { if (!State.lessons[key][r.pair_num]) State.lessons[key][r.pair_num] = []; State.lessons[key][r.pair_num].push({ tid: r.teacher_id, dept: r.dept || '', room: r.room || '', building: r.building || '1' }); }); if (State.activeDayKey === key) renderDayPanel(key); }); } } else { const pn = row.pair_num; if (!State.lessons[key]) State.lessons[key] = {}; if (!State.lessons[key][pn]) State.lessons[key][pn] = []; const exists = State.lessons[key][pn].some(e => e.tid === row.teacher_id && e.room === row.room); if (!exists) State.lessons[key][pn].push({ tid: row.teacher_id, dept: row.dept || '', room: row.room || '', building: row.building || '1' }); if (State.activeDayKey === key) renderDayPanel(key); } renderCalendar(); }
function onScheduleChange({ eventType, new: row, old: oldRow }) { if (_suppressRealtimeRender) return; const key = row?.date_key ?? oldRow?.date_key; if (!key) return; if (eventType === 'DELETE') { const tid = oldRow?.teacher_id; const bld = oldRow?.building || '1'; if (tid) removeDuty(key, tid, null, bld); else clearDutyDay(key); } else { if (row.teacher_id) addDuty(key, row.teacher_id, row.dept || null, row.building || '1'); const wasReplace = !!State.replaceRequests[key]; if (row.replace_request) { State.replaceRequests[key] = true; if (!wasReplace) { const teacher = teacherById(row.teacher_id); if (teacher) { const [, mm, dd] = key.split('-'); const label = `${parseInt(dd)} ${MONTHS_RU_GEN[parseInt(mm) - 1]}`; addNotification(`🔄 ${teacher.name} просит замену ${label}`, '🔄'); } } } else { delete State.replaceRequests[key]; } } State.save(); renderCalendar(); renderAccordion(); renderTeachersList(); renderStats(); renderMyCabinet(); flashCell(key); }
function onTeacherChange({ eventType, new: row, old: oldRow }) { if (eventType === 'DELETE') { State.teachers = State.teachers.filter(t => t.id !== oldRow.id); } else { const mapped = mapTeacherRow(row); const idx = State.teachers.findIndex(t => t.id === row.id); if (idx >= 0) State.teachers[idx] = { ...State.teachers[idx], ...mapped }; else State.teachers.push(mapped); if (mapped.blackoutDates?.length) State.blackoutDates[mapped.id] = mapped.blackoutDates; } State.save(); renderTeachersList(); renderCalendar(); renderAccordion(); renderStats(); }
function flashCell(key) { const cell = document.querySelector(`.day-cell[data-key="${key}"]`); if (!cell) return; cell.classList.remove('rt-flash'); void cell.offsetWidth; cell.classList.add('rt-flash'); setTimeout(() => cell.classList.remove('rt-flash'), 900); }

// ─── TEMPLATES FUNCTIONS ────────────────────────────────────────────────────
async function saveTemplate() {
  if (State.currentRole !== 'admin') { showToast('Только завуч может создавать шаблоны', 'error'); return; }
  const templateName = document.getElementById('newTemplateName').value.trim();
  if (!templateName) {
    showToast('Введите название шаблона', 'error');
    const input = document.getElementById('newTemplateName');
    input.style.borderColor = 'var(--danger)';
    setTimeout(() => input.style.borderColor = '', 1000);
    return;
  }
  const building = State.activeBuilding;
  const y = State.currentDate.getFullYear();
  const m = State.currentDate.getMonth();
  const prefix = `${y}-${String(m+1).padStart(2,'0')}`;
  const dutiesSnapshot = {};
  const lessonsSnapshot = {};
  for (const [key, val] of Object.entries(State.duties)) {
    if (!key.startsWith(prefix)) continue;
    const filtered = val.filter(e => e.building === building);
    if (filtered.length) dutiesSnapshot[key] = filtered.map(e => ({ tid: e.tid, dept: e.dept }));
  }
  for (const [key, pairs] of Object.entries(State.lessons)) {
    if (!key.startsWith(prefix)) continue;
    const filteredPairs = {};
    for (const [pn, arr] of Object.entries(pairs)) {
      const filtered = arr.filter(e => e.building === building);
      if (filtered.length) filteredPairs[pn] = filtered.map(e => ({ tid: e.tid, dept: e.dept, room: e.room }));
    }
    if (Object.keys(filteredPairs).length) lessonsSnapshot[key] = filteredPairs;
  }
  if (!sb) { showToast('Supabase не доступен', 'error'); return; }
  const { data: existing } = await sb.from('templates').select('id').eq('name', templateName).eq('building', building);
  if (existing && existing.length) {
    showConfirmDialog(
      'Перезаписать шаблон?',
      `Шаблон с именем «${templateName}» уже существует в этом корпусе. Перезаписать?`,
      async () => {
        await sb.from('templates').update({ duties_json: dutiesSnapshot, lessons_json: lessonsSnapshot, created_at: new Date() }).eq('id', existing[0].id);
        showToast(`Шаблон «${templateName}» обновлён`, 'success');
        loadTemplatesList();
        document.getElementById('newTemplateName').value = '';
      },
      () => { showToast('Перезапись отменена', 'info'); }
    );
  } else {
    const { error } = await sb.from('templates').insert({ name: templateName, building, duties_json: dutiesSnapshot, lessons_json: lessonsSnapshot });
    if (error) showToast('Ошибка сохранения шаблона', 'error');
    else {
      showToast(`Шаблон «${templateName}» сохранён`, 'success');
      document.getElementById('newTemplateName').value = '';
      loadTemplatesList();
    }
  }
}
async function loadTemplatesList() { if (!sb) { renderTemplatesList([]); return; } const { data, error } = await sb.from('templates').select('*').eq('building', State.activeBuilding).order('name'); if (error) { console.warn(error); renderTemplatesList([]); return; } renderTemplatesList(data || []); }
function renderTemplatesList(templates = null) {
  const container = document.getElementById('templatesList');
  const select = document.getElementById('templateSelect');
  if (!container) return;
  if (!templates) { loadTemplatesList(); return; }
  if (select) {
    select.innerHTML = '<option value="">— Без шаблона (случайное) —</option>' + templates.map(t => `<option value="${t.id}" ${State.activeTemplateId == t.id ? 'selected' : ''}>${t.name}</option>`).join('');
    select.onchange = (e) => { const id = e.target.value; State.activeTemplateId = id || null; State.save(); renderTemplatesList(templates); };
  }
  if (templates.length === 0) { container.innerHTML = '<div style="font-size:.78rem;color:var(--text-faint);padding:.25rem 0">Нет шаблонов</div>'; return; }
  container.innerHTML = templates.map(t => `
    <div class="template-tag ${State.activeTemplateId === t.id ? 'active' : ''}" data-id="${t.id}">
      <span>${t.name}</span>
      <button class="template-remove" data-id="${t.id}" title="Удалить шаблон">✕</button>
    </div>
  `).join('');
  container.querySelectorAll('.template-tag[data-id]').forEach(tag => {
    tag.addEventListener('click', (e) => {
      if (e.target.classList.contains('template-remove')) return;
      const tid = tag.dataset.id;
      if (State.activeTemplateId === tid) {
        State.activeTemplateId = null;
        tag.classList.remove('active');
        if (select) select.value = '';
        showToast('Активный шаблон снят', 'info');
      } else {
        State.activeTemplateId = tid;
        if (select) select.value = tid;
        document.querySelectorAll('.template-tag').forEach(t => t.classList.remove('active'));
        tag.classList.add('active');
        showToast(`Активный шаблон: ${tag.querySelector('span').textContent}`, 'success');
      }
      State.save();
    });
    const delBtn = tag.querySelector('.template-remove');
    if (delBtn) {
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const tid = delBtn.dataset.id;
        const templateName = tag.querySelector('span').textContent;
        showConfirmDialog(
          'Удаление шаблона',
          `Вы действительно хотите удалить шаблон «${templateName}»? Это действие нельзя отменить.`,
          async () => {
            if (sb) await sb.from('templates').delete().eq('id', tid);
            if (State.activeTemplateId === tid) State.activeTemplateId = null;
            loadTemplatesList();
            showToast('Шаблон удалён', 'info');
          }
        );
      });
    }
  });
}
function onBuildingChange() { if (State.currentRole === 'admin') loadTemplatesList(); renderCalendar(); renderAccordion(); }

// ─── SEED DEMO DATA ─────────────────────────────────────────────────────────
async function seedDemoData() {
  if (!sb) { showToast('Supabase не подключён', 'error'); return; }
  const demoTeachers = [
    { id:'demo_01', name:'Иванов Сергей Николаевич', dept:'Кафедра математики', phone:'+7 (910) 234-56-78', max_load:2, building:'1', blackout_dates:[] },
    { id:'demo_02', name:'Петрова Ольга Дмитриевна', dept:'Кафедра информатики и ВТ', phone:'+7 (926) 345-67-89', max_load:2, building:'1', blackout_dates:[] },
    { id:'demo_03', name:'Смирнов Алексей Юрьевич', dept:'Кафедра физики', phone:'+7 (905) 456-78-90', max_load:3, building:'1', blackout_dates:[] },
    { id:'demo_04', name:'Козлова Наталья Владимировна', dept:'Кафедра химии и биологии', phone:'+7 (916) 567-89-01', max_load:2, building:'2', blackout_dates:[] },
    { id:'demo_05', name:'Новиков Дмитрий Александрович', dept:'Кафедра истории и обществознания', phone:'+7 (999) 678-90-12', max_load:2, building:'2', blackout_dates:[] },
    { id:'demo_06', name:'Морозова Татьяна Игоревна', dept:'Кафедра русского языка и литературы', phone:'+7 (903) 789-01-23', max_load:2, building:'2', blackout_dates:[] },
    { id:'demo_07', name:'Волков Андрей Петрович', dept:'Кафедра иностранных языков', phone:'+7 (925) 890-12-34', max_load:3, building:'3', blackout_dates:[] },
    { id:'demo_08', name:'Лебедева Марина Сергеевна', dept:'Кафедра физической культуры', phone:'+7 (909) 901-23-45', max_load:2, building:'3', blackout_dates:[] },
    { id:'demo_09', name:'Соколов Павел Евгеньевич', dept:'Кафедра экономики и права', phone:'+7 (911) 012-34-56', max_load:2, building:'1', blackout_dates:[] },
    { id:'demo_10', name:'Попова Елена Константиновна', dept:'Кафедра психологии и педагогики', phone:'+7 (917) 123-45-67', max_load:3, building:'1', blackout_dates:[] },
    { id:'demo_11', name:'Кузнецов Игорь Васильевич', dept:'Кафедра математики', phone:'+7 (912) 234-56-78', max_load:2, building:'2', blackout_dates:[] },
    { id:'demo_12', name:'Белова Анна Михайловна', dept:'Кафедра информатики и ВТ', phone:'+7 (920) 345-67-89', max_load:2, building:'2', blackout_dates:[] },
    { id:'demo_13', name:'Орлов Максим Андреевич', dept:'Кафедра физики', phone:'+7 (913) 456-78-90', max_load:2, building:'3', blackout_dates:[] },
    { id:'demo_14', name:'Захарова Светлана Олеговна', dept:'Кафедра химии и биологии', phone:'+7 (921) 567-89-01', max_load:2, building:'3', blackout_dates:[] },
    { id:'demo_15', name:'Федоров Роман Викторович', dept:'Кафедра истории и обществознания', phone:'+7 (914) 678-90-12', max_load:3, building:'1', blackout_dates:[] },
    { id:'demo_16', name:'Громова Юлия Алексеевна', dept:'Кафедра русского языка и литературы', phone:'+7 (922) 789-01-23', max_load:2, building:'1', blackout_dates:[] },
    { id:'demo_17', name:'Тихонов Артём Борисович', dept:'Кафедра иностранных языков', phone:'+7 (915) 890-12-34', max_load:2, building:'2', blackout_dates:[] },
    { id:'demo_18', name:'Макарова Диана Руслановна', dept:'Кафедра физической культуры', phone:'+7 (923) 901-23-45', max_load:2, building:'2', blackout_dates:[] },
    { id:'demo_19', name:'Степанов Кирилл Николаевич', dept:'Кафедра экономики и права', phone:'+7 (918) 012-34-56', max_load:3, building:'3', blackout_dates:[] },
    { id:'demo_20', name:'Васильева Надежда Геннадьевна', dept:'Кафедра психологии и педагогики', phone:'+7 (924) 123-45-67', max_load:2, building:'3', blackout_dates:[] },
    { id:'demo_21', name:'Архипов Денис Михайлович', dept:'Кафедра математики', phone:'+7 (916) 235-67-89', max_load:2, building:'1', blackout_dates:[] },
    { id:'demo_22', name:'Чернова Инна Александровна', dept:'Кафедра информатики и ВТ', phone:'+7 (927) 346-78-90', max_load:2, building:'1', blackout_dates:[] },
    { id:'demo_23', name:'Карпов Евгений Семёнович', dept:'Кафедра физики', phone:'+7 (906) 457-89-01', max_load:2, building:'2', blackout_dates:[] },
    { id:'demo_24', name:'Николаева Вера Павловна', dept:'Кафедра химии и биологии', phone:'+7 (918) 568-90-12', max_load:3, building:'2', blackout_dates:[] },
    { id:'demo_25', name:'Боров Алексей Геннадьевич', dept:'Кафедра истории и обществознания', phone:'+7 (900) 679-01-23', max_load:2, building:'3', blackout_dates:[] },
    { id:'demo_26', name:'Крылова Ирина Юрьевна', dept:'Кафедра русского языка и литературы', phone:'+7 (904) 780-12-34', max_load:2, building:'3', blackout_dates:[] },
    { id:'demo_27', name:'Зайцев Павел Андреевич', dept:'Кафедра иностранных языков', phone:'+7 (926) 891-23-45', max_load:2, building:'1', blackout_dates:[] },
    { id:'demo_28', name:'Медведева Светлана Борисовна', dept:'Кафедра физической культуры', phone:'+7 (910) 902-34-56', max_load:3, building:'1', blackout_dates:[] },
    { id:'demo_29', name:'Ильин Константин Сергеевич', dept:'Кафедра экономики и права', phone:'+7 (912) 013-45-67', max_load:2, building:'2', blackout_dates:[] },
    { id:'demo_30', name:'Власова Анастасия Николаевна', dept:'Кафедра психологии и педагогики', phone:'+7 (918) 124-56-78', max_load:2, building:'2', blackout_dates:[] },
    { id:'demo_31', name:'Горбунов Михаил Владимирович', dept:'Кафедра математики', phone:'+7 (913) 235-67-89', max_load:3, building:'3', blackout_dates:[] },
    { id:'demo_32', name:'Романова Екатерина Ивановна', dept:'Кафедра информатики и ВТ', phone:'+7 (921) 346-78-90', max_load:2, building:'3', blackout_dates:[] },
    { id:'demo_33', name:'Андреев Дмитрий Петрович', dept:'Кафедра физики', phone:'+7 (909) 111-22-33', max_load:2, building:'1', blackout_dates:[] },
    { id:'demo_34', name:'Фомина Елена Викторовна', dept:'Кафедра химии и биологии', phone:'+7 (911) 222-33-44', max_load:2, building:'1', blackout_dates:[] },
    { id:'demo_35', name:'Григорьев Александр Игоревич', dept:'Кафедра истории', phone:'+7 (912) 333-44-55', max_load:2, building:'2', blackout_dates:[] },
    { id:'demo_36', name:'Никитина Татьяна Сергеевна', dept:'Кафедра русского языка', phone:'+7 (913) 444-55-66', max_load:2, building:'2', blackout_dates:[] },
    { id:'demo_37', name:'Максимов Владимир Андреевич', dept:'Кафедра иностранных языков', phone:'+7 (914) 555-66-77', max_load:3, building:'3', blackout_dates:[] },
    { id:'demo_38', name:'Полякова Ольга Николаевна', dept:'Кафедра физкультуры', phone:'+7 (915) 666-77-88', max_load:2, building:'3', blackout_dates:[] },
    { id:'demo_39', name:'Сергеев Евгений Владимирович', dept:'Кафедра экономики', phone:'+7 (916) 777-88-99', max_load:2, building:'1', blackout_dates:[] },
    { id:'demo_40', name:'Егорова Мария Александровна', dept:'Кафедра психологии', phone:'+7 (917) 888-99-00', max_load:2, building:'1', blackout_dates:[] },
    { id:'demo_41', name:'Тимофеев Арсений Дмитриевич', dept:'Кафедра математики', phone:'+7 (918) 999-00-11', max_load:2, building:'2', blackout_dates:[] },
    { id:'demo_42', name:'Мельникова Анастасия Юрьевна', dept:'Кафедра информатики', phone:'+7 (919) 000-11-22', max_load:2, building:'2', blackout_dates:[] },
    { id:'demo_43', name:'Захаров Никита Алексеевич', dept:'Кафедра физики', phone:'+7 (920) 111-22-33', max_load:2, building:'3', blackout_dates:[] },
    { id:'demo_44', name:'Дмитриева Юлия Владимировна', dept:'Кафедра химии', phone:'+7 (921) 222-33-44', max_load:2, building:'3', blackout_dates:[] },
    { id:'demo_45', name:'Емельянов Роман Викторович', dept:'Кафедра истории', phone:'+7 (922) 333-44-55', max_load:2, building:'1', blackout_dates:[] },
    { id:'demo_46', name:'Герасимова Анна Борисовна', dept:'Кафедра русского языка', phone:'+7 (923) 444-55-66', max_load:2, building:'1', blackout_dates:[] },
    { id:'demo_47', name:'Константинов Павел Сергеевич', dept:'Кафедра иностранных языков', phone:'+7 (924) 555-66-77', max_load:2, building:'2', blackout_dates:[] },
    { id:'demo_48', name:'Евдокимова Дарья Игоревна', dept:'Кафедра физкультуры', phone:'+7 (925) 666-77-88', max_load:2, building:'2', blackout_dates:[] },
    { id:'demo_49', name:'Трофимов Степан Владимирович', dept:'Кафедра экономики', phone:'+7 (926) 777-88-99', max_load:2, building:'3', blackout_dates:[] },
    { id:'demo_50', name:'Николаева Екатерина Алексеевна', dept:'Кафедра психологии', phone:'+7 (927) 888-99-00', max_load:2, building:'3', blackout_dates:[] }
  ];
  const { error } = await sb.from('teachers').upsert(demoTeachers, { onConflict: 'id' });
  if (error) { console.error('[seed] Ошибка seedDemoData:', error.message); showToast('Ошибка загрузки демо-данных: ' + error.message, 'error'); }
  else { showToast(`Добавлено ${demoTeachers.length} демо-преподавателей ✓`, 'success'); await loadTeachers(); renderTeachersList(); renderCalendar(); renderAccordion(); renderStats(); }
}

// ─── FINAL INIT ─────────────────────────────────────────────────────────────
function init() {
  State.load();
  initTabs();
  document.getElementById('prevMonth').addEventListener('click', async () => { State.currentDate.setMonth(State.currentDate.getMonth() - 1); closeDayPanel(); renderCalendar(); renderAccordion(); if (sb) { await loadSchedule(); await loadLessons(); renderCalendar(); renderAccordion(); } });
  document.getElementById('nextMonth').addEventListener('click', async () => { State.currentDate.setMonth(State.currentDate.getMonth() + 1); closeDayPanel(); renderCalendar(); renderAccordion(); if (sb) { await loadSchedule(); await loadLessons(); renderCalendar(); renderAccordion(); } });
  document.getElementById('modalClose').addEventListener('click', () => closeModal('modalOverlay'));
  document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('modalOverlay'); });
  document.getElementById('teacherInfoClose').addEventListener('click', () => closeModal('teacherInfoOverlay'));
  document.getElementById('teacherInfoOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('teacherInfoOverlay'); });
  document.getElementById('teacherModalClose').addEventListener('click', () => closeModal('teacherModalOverlay'));
  document.getElementById('teacherModalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('teacherModalOverlay'); });
  document.getElementById('teacherModalSave').addEventListener('click', saveTeacherModal);
  document.getElementById('teacherModalCancel').addEventListener('click', () => closeModal('teacherModalOverlay'));
  const tPhone = document.getElementById('tPhone'); if (tPhone) tPhone.addEventListener('input', () => { tPhone.value = formatPhone(tPhone.value); });
  document.getElementById('addTeacherBtn').addEventListener('click', addTeacher);
  renderInlineDeptManager(_inlineDepts);
  const phoneInput = document.getElementById('teacherPhone'); if (phoneInput) phoneInput.addEventListener('input', () => { phoneInput.value = formatPhone(phoneInput.value); });
  document.getElementById('openAddTeacherBtn').addEventListener('click', () => openTeacherModal());
  document.getElementById('autoDistributeBtn').addEventListener('click', () => autoDistribute(true));
  const clearAllBtn = document.getElementById('clearAllBtn'); if (clearAllBtn) clearAllBtn.addEventListener('click', clearAll);
  document.getElementById('printBtn').addEventListener('click', printSchedule);
  document.getElementById('saveTemplateBtn').addEventListener('click', saveTemplate);
  document.getElementById('roleAdmin').addEventListener('click', () => { if (State.currentRole !== 'admin') showWelcomeModal('login'); });
  document.getElementById('roleTeacher').addEventListener('click', () => { if (State.currentRole !== 'teacher') { if (State.teachers.length === 0) showToast('Сначала добавьте преподавателей', 'error'); else showWelcomeModal('picker'); } });
  document.getElementById('hamburger').addEventListener('click', () => { const nav = document.getElementById('mobileNav'); const open = nav.classList.toggle('open'); document.getElementById('hamburger').classList.toggle('open', open); document.getElementById('hamburger').setAttribute('aria-expanded', open); });
  if (window.innerWidth <= 760) document.getElementById('mobileNav').classList.add('open');
  window.addEventListener('resize', () => { if (window.innerWidth <= 760) document.getElementById('mobileNav').classList.add('open'); });
  document.getElementById('notifBtn').addEventListener('click', e => { e.stopPropagation(); const panel = document.getElementById('notifPanel'); const btn = e.currentTarget; const rect = btn.getBoundingClientRect(); const isMob = window.innerWidth <= 760; if (isMob) { const pw = Math.min(300, window.innerWidth - 16); panel.style.width = pw + 'px'; panel.style.top = (rect.bottom + 8) + 'px'; panel.style.right = 'auto'; panel.style.left = '8px'; } else { panel.style.width = ''; panel.style.left = ''; panel.style.top = (rect.bottom + 8) + 'px'; panel.style.right = (window.innerWidth - rect.right) + 'px'; } panel.classList.toggle('open'); });
  document.addEventListener('click', e => { if (!e.target.closest('.notif-wrap')) document.getElementById('notifPanel').classList.remove('open'); });
  document.getElementById('notifClearAll').addEventListener('click', () => { State.notifications = []; State.save(); renderNotifications(); });
    const statsSearchInput = document.getElementById('statsSearchInput');
  if (statsSearchInput) {
    statsSearchInput.value = statsSearchText;
    statsSearchInput.addEventListener('input', (e) => {
      statsSearchText = e.target.value;
      renderStats();
    });
  }
  document.getElementById('addBlackoutBtn').addEventListener('click', addBlackoutDate);
  const sbClose = document.getElementById('sbStatusClose'); if (sbClose) sbClose.addEventListener('click', () => { document.getElementById('sbStatusbar').classList.add('hidden'); });
  document.querySelectorAll('.building-tab').forEach(btn => {
  btn.addEventListener('click', async () => {
    State.activeBuilding = btn.dataset.building;
    _syncBuildingTabs(btn.dataset.building);
    if (State.currentRole === 'admin') {
      await loadSchedule();
      await loadLessons();
      await loadTemplatesList();
      renderCalendar();
      renderAccordion();
    } else {
      renderCalendar();
      renderAccordion();
    }
  });
  });
  const dpClose = document.getElementById('dayPanelClose'); if (dpClose) dpClose.addEventListener('click', closeDayPanel);
  const dpBackdrop = document.getElementById('dayPanelBackdrop'); if (dpBackdrop) dpBackdrop.addEventListener('click', closeDayPanel);
  const wOverlay = document.getElementById('welcomeModalOverlay'); if (wOverlay) wOverlay.addEventListener('click', e => e.stopPropagation());
  initSupabase();
  const seedBtn = document.getElementById('seedDemoBtn'); if (seedBtn) seedBtn.addEventListener('click', seedDemoData);
  window.seedDemoData = seedDemoData;
  window.openTeacherInfoModal = openTeacherInfoModal;
  window.openTeacherModal = openTeacherModal;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.openDayPanel = openDayPanel;
  window.closeDayPanel = closeDayPanel;
  window.removeDutyFromPanel = removeDutyFromPanel;
  window.addPairEntry = addPairEntry;
  window.removePairEntry = removePairEntry;
  window.updatePairDeptSel = updatePairDeptSel;
  window.showWelcomeModal = showWelcomeModal;
  window.hideWelcomeModal = hideWelcomeModal;
  window.saveTemplate = saveTemplate;
  window.autoDistribute = autoDistribute;
  window.applyTemplate = applyTemplate;
  window.getDutyEntries = getDutyEntries;
  window.getDutyIds = getDutyIds;
  window.addDuty = addDuty;
  window.removeDuty = removeDuty;
  renderCalendar(); renderAccordion(); renderTeachersList(); renderStats(); renderNotifications();
  showWelcomeModal('choose');
}
document.addEventListener('DOMContentLoaded', init);
