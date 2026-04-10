"""
logic.py — АкадемГрафик v4
===========================
БАЗА: v3 (все существующие функции сохранены)
НОВОЕ:
  ★ Справочник государственных праздников РФ 2025–2027
  ★ «Чёрные метки» преподавателей (blackout_dates)
  ★ Алгоритм учитывает праздники + blackouts (Hard rules)
  ★ Поле replace_requests в DutySchedule
  ★ compute_stats: учитывает запросы замены
  ★ export_to_csv: колонки «Замена?» и «Праздник»

Запуск демо: python logic.py
"""

import csv
import io
import json
import math
import random
import calendar
import re
from datetime import date, timedelta
from dataclasses import dataclass, field, asdict
from typing import Optional


# ─── ГОСУДАРСТВЕННЫЕ ПРАЗДНИКИ РФ ─────────────────────────────────────────────
# "MM-DD" = ежегодный; "YYYY-MM-DD" = конкретная дата/перенос

HOLIDAYS_RU: dict[str, str] = {
    # Новогодние каникулы
    "01-01": "Новый год",
    "01-02": "Новогодние каникулы",
    "01-03": "Новогодние каникулы",
    "01-04": "Новогодние каникулы",
    "01-05": "Новогодние каникулы",
    "01-06": "Новогодние каникулы",
    "01-07": "Рождество Христово",
    "01-08": "Новогодние каникулы",
    # Профессиональные праздники
    "02-23": "День защитника Отечества",
    "03-08": "Международный женский день",
    "05-01": "Праздник Весны и Труда",
    "05-09": "День Победы",
    "06-12": "День России",
    "11-04": "День народного единства",
    # Переносы 2026
    "2026-01-09": "Выходной (перенос)",
    "2026-02-24": "Выходной (перенос)",
    "2026-03-09": "Выходной (перенос)",
    "2026-05-04": "Выходной (перенос)",
    "2026-05-11": "Выходной (перенос)",
    "2026-11-03": "Выходной (перенос)",
    # Переносы 2025
    "2025-01-09": "Выходной (перенос)",
    "2025-05-02": "Выходной (перенос)",
    "2025-05-08": "Выходной (перенос)",
    "2025-11-03": "Выходной (перенос)",
    "2025-11-04": "День народного единства (доп.)",
    "2025-12-31": "Предновогодний выходной",
}


def get_holiday_name(d: date) -> Optional[str]:
    """Возвращает название праздника для даты или None."""
    specific = d.isoformat()              # "YYYY-MM-DD"
    annual   = f"{d.month:02d}-{d.day:02d}"  # "MM-DD"
    return HOLIDAYS_RU.get(specific) or HOLIDAYS_RU.get(annual)


def is_workday(d: date) -> bool:
    """Рабочий день: Пн–Пт И не праздник."""
    return d.weekday() < 5 and get_holiday_name(d) is None


def get_workdays(year: int, month: int) -> list[date]:
    _, days = calendar.monthrange(year, month)
    return [date(year, month, d) for d in range(1, days + 1)
            if is_workday(date(year, month, d))]


# ─── СПРАВОЧНИК КАФЕДР ────────────────────────────────────────────────────────

DEPARTMENTS = [
    "Кафедра информатики и ВТ",
    "Кафедра математики",
    "Кафедра физики",
    "Кафедра химии и биологии",
    "Кафедра истории и обществознания",
    "Кафедра русского языка и литературы",
    "Кафедра иностранных языков",
    "Кафедра физической культуры",
    "Кафедра экономики и права",
    "Кафедра психологии и педагогики",
]


# ─── ВАЛИДАЦИЯ ────────────────────────────────────────────────────────────────

def validate_phone(phone: str) -> tuple[bool, str]:
    if not phone:
        return True, ""
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 11 and digits[0] in ("7", "8"):
        d = digits[1:]
    elif len(digits) == 10:
        d = digits
    else:
        return False, ""
    return True, f"+7 ({d[0:3]}) {d[3:6]}-{d[6:8]}-{d[8:10]}"


def validate_teacher(name: str, dept: str, max_load: int, phone: str = "") -> list[str]:
    errors = []
    if not name or len(name.strip()) < 5:
        errors.append("ФИО должно содержать минимум 5 символов.")
    if not dept:
        errors.append("Кафедра обязательна.")
    if not (1 <= max_load <= 7):
        errors.append("Макс. нагрузка должна быть от 1 до 7 дней в неделю.")
    if phone:
        ok, _ = validate_phone(phone)
        if not ok:
            errors.append(f"Некорректный телефон: «{phone}».")
    return errors


# ─── МОДЕЛИ ДАННЫХ ────────────────────────────────────────────────────────────

@dataclass
class Teacher:
    id:             str
    name:           str
    dept:           str
    max_load:       int       = 2
    phone:          str       = ""
    blackout_dates: list[str] = field(default_factory=list)  # ★ NEW ["YYYY-MM-DD"]

    def __post_init__(self):
        if self.phone:
            ok, normalized = validate_phone(self.phone)
            if ok and normalized:
                self.phone = normalized


@dataclass
class DutySchedule:
    duties:          dict[str, Optional[str]] = field(default_factory=dict)
    replace_requests: dict[str, bool]         = field(default_factory=dict)  # ★ NEW
    unassigned:      list[str]                = field(default_factory=list)
    skipped_blackout: list[tuple[str, str]]   = field(default_factory=list)  # (date, tid)

    def to_json(self, indent=2) -> str:
        return json.dumps(asdict(self), ensure_ascii=False, indent=indent)


# ─── УТИЛИТЫ ─────────────────────────────────────────────────────────────────

def week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())

def week_key(d: date) -> str:
    return week_start(d).isoformat()

def fmt(d: date) -> str:
    return d.isoformat()


# ─── АЛГОРИТМ v4 ──────────────────────────────────────────────────────────────

class DutyDistributor:
    """
    Жадный алгоритм с расширенными правилами v4.

    Приоритеты (строгость убывает):
      1. ЖЁСТКОЕ: пропустить праздники (is_workday).
      2. ЖЁСТКОЕ: нет дежурств два дня подряд.
      3. ЖЁСТКОЕ: пропустить «чёрные метки» преподавателя.
      4. МЯГКОЕ:  недельный лимит (штраф +500 в оценке).
      5. МЯГКОЕ:  балансировка за месяц.
      6. МЯГКОЕ:  случайный тай-брейк.
    """

    def __init__(self, teachers: list[Teacher], seed: int = 42):
        self.teachers = teachers
        self.rng      = random.Random(seed)

    def distribute(self, year: int, month: int) -> DutySchedule:
        workdays = get_workdays(year, month)  # уже без праздников

        duties: dict[str, Optional[str]]      = {}
        week_counts: dict[str, dict[str, int]] = {t.id: {} for t in self.teachers}
        month_counts: dict[str, int]           = {t.id: 0  for t in self.teachers}
        unassigned: list[str]                  = []
        skipped_blackout: list[tuple[str,str]] = []

        for day in workdays:
            key  = fmt(day)
            wk   = week_key(day)
            prev = fmt(day - timedelta(days=1))

            candidates = []
            for t in self.teachers:
                wc = week_counts[t.id].get(wk, 0)

                # Правило 2: нет подряд
                if duties.get(prev) == t.id:
                    continue

                # Правило 3: «чёрная метка»
                if key in t.blackout_dates:
                    skipped_blackout.append((key, t.id))
                    continue

                # Оценка
                overloaded = wc >= t.max_load
                score = (
                    wc * 100
                    + month_counts[t.id] * 10
                    + (500 if overloaded else 0)
                    + self.rng.random()
                )
                candidates.append((score, t))

            if candidates:
                candidates.sort(key=lambda x: x[0])
                winner = candidates[0][1]
                duties[key] = winner.id
                week_counts[winner.id][wk] = week_counts[winner.id].get(wk, 0) + 1
                month_counts[winner.id]   += 1
            else:
                duties[key] = None
                unassigned.append(key)

        return DutySchedule(
            duties=duties,
            unassigned=unassigned,
            skipped_blackout=skipped_blackout,
        )


# ─── АНАЛИТИКА ────────────────────────────────────────────────────────────────

def load_status(pct: float) -> str:
    if pct >= 100: return "перебор"
    if pct >= 70:  return "высокая"
    return "норма"


def compute_stats(schedule: DutySchedule, teachers: list[Teacher],
                  year: int, month: int) -> dict:
    month_prefix = f"{year}-{month:02d}"
    workdays     = get_workdays(year, month)

    # Недельный индекс
    _, days_in_month = calendar.monthrange(year, month)
    week_index: dict[str, list[str]] = {}
    for d in range(1, days_in_month + 1):
        day = date(year, month, d)
        wk  = week_key(day)
        week_index.setdefault(wk, []).append(fmt(day))

    month_counts    = {t.id: 0 for t in teachers}
    week_peak       = {t.id: 0 for t in teachers}
    replace_counts  = {t.id: 0 for t in teachers}

    for ds, tid in schedule.duties.items():
        if tid and ds.startswith(month_prefix):
            month_counts[tid] = month_counts.get(tid, 0) + 1

    for ds, req in schedule.replace_requests.items():
        if req and ds.startswith(month_prefix):
            tid = schedule.duties.get(ds)
            if tid:
                replace_counts[tid] = replace_counts.get(tid, 0) + 1

    for wk, days in week_index.items():
        for t in teachers:
            cnt = sum(1 for d in days if schedule.duties.get(d) == t.id)
            week_peak[t.id] = max(week_peak[t.id], cnt)

    total_assigned = sum(month_counts.values())

    result = []
    for t in teachers:
        mc  = month_counts[t.id]
        wp  = week_peak[t.id]
        pct = round(wp / t.max_load * 100, 1) if t.max_load else 0

        result.append({
            "id":              t.id,
            "name":            t.name,
            "dept":            t.dept,
            "phone":           t.phone,
            "max_load":        t.max_load,
            "month_duties":    mc,
            "share_pct":       round(mc / total_assigned * 100, 1) if total_assigned else 0,
            "week_peak":       wp,
            "load_pct":        pct,
            "status":          load_status(pct),
            "replace_requests": replace_counts[t.id],  # ★ NEW
        })

    # Count holidays in month
    holidays_in_month = sum(
        1 for d in range(1, days_in_month + 1)
        if get_holiday_name(date(year, month, d))
    )

    return {
        "year":            year,
        "month":           month,
        "total_assigned":  total_assigned,
        "workdays":        len(workdays),
        "holidays":        holidays_in_month,          # ★ NEW
        "unassigned":      len(schedule.unassigned),
        "blackout_skips":  len(schedule.skipped_blackout),  # ★ NEW
        "teachers":        sorted(result, key=lambda x: -x["month_duties"]),
    }


# ─── ЭКСПОРТ ─────────────────────────────────────────────────────────────────

def export_to_csv(schedule: DutySchedule, teachers: list[Teacher],
                  year: int, month: int) -> str:
    """Экспорт в CSV с колонками Замена? и Праздник."""
    teacher_map = {t.id: t for t in teachers}
    days_ru     = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"]

    buf = io.StringIO()
    buf.write("\ufeff")
    writer = csv.writer(buf, dialect="excel", quoting=csv.QUOTE_ALL)
    writer.writerow(["Дата", "День недели", "ФИО преподавателя", "Кафедра", "Телефон", "Замена?", "Праздник"])

    _, days_in_month = calendar.monthrange(year, month)
    for d in range(1, days_in_month + 1):
        day    = date(year, month, d)
        key    = day.isoformat()
        hname  = get_holiday_name(day) or ""
        if day.weekday() >= 5:
            continue  # пропустить выходные
        weekday = days_ru[day.weekday()]
        tid     = schedule.duties.get(key)
        repl    = "да" if schedule.replace_requests.get(key) else ""
        if hname:
            writer.writerow([key, weekday, "— праздник —", "", "", "", hname])
        elif tid and tid in teacher_map:
            t = teacher_map[tid]
            writer.writerow([key, weekday, t.name, t.dept, t.phone, repl, ""])
        else:
            writer.writerow([key, weekday, "— не назначен —", "", "", "", ""])

    return buf.getvalue()


def export_print_table(schedule: DutySchedule, teachers: list[Teacher],
                        year: int, month: int) -> str:
    """Текстовая таблица для терминала/печати."""
    teacher_map = {t.id: t for t in teachers}
    month_names = ["","Январь","Февраль","Март","Апрель","Май","Июнь",
                   "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"]
    days_ru     = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"]
    width       = 60

    lines = ["═" * width, f"  {month_names[month].upper()} {year} — ГРАФИК ДЕЖУРСТВ", "═" * width]

    _, days_in_month = calendar.monthrange(year, month)
    for d in range(1, days_in_month + 1):
        day    = date(year, month, d)
        key    = day.isoformat()
        weekday = days_ru[day.weekday()]
        hname  = get_holiday_name(day)

        if day.weekday() >= 5:
            continue
        if hname:
            lines.append(f"  {key} ({weekday})  🏛 {hname}")
            continue

        tid = schedule.duties.get(key)
        repl_mark = " 🔄" if schedule.replace_requests.get(key) else ""
        if tid and tid in teacher_map:
            t = teacher_map[tid]
            parts = t.name.split()
            short = f"{parts[0]} {parts[1][0]}.{parts[2][0]}." if len(parts) >= 3 else t.name
            phone = f"  {t.phone}" if t.phone else ""
            lines.append(f"  {key} ({weekday})  {short:<22} {t.dept[:16]}{phone}{repl_mark}")
        else:
            lines.append(f"  {key} ({weekday})  — не назначен —")

    lines.append("─" * width)
    if schedule.unassigned:
        lines.append(f"  ⚠  Без дежурного: {', '.join(schedule.unassigned)}")
    if schedule.skipped_blackout:
        lines.append(f"  🚫  Пропущено из-за «чёрных меток»: {len(schedule.skipped_blackout)}")
    lines.append("  ✓  Праздники исключены автоматически." if not schedule.unassigned else "")
    lines.append("═" * width)
    return "\n".join(lines)


# ─── ВАЛИДАЦИЯ РАСПИСАНИЯ ─────────────────────────────────────────────────────

def validate_schedule(schedule: DutySchedule) -> list[str]:
    violations = []
    sorted_days = sorted(schedule.duties.keys())
    for i in range(1, len(sorted_days)):
        t1, t2 = sorted_days[i-1], sorted_days[i]
        if (schedule.duties[t1] and schedule.duties[t1] == schedule.duties[t2]
                and (date.fromisoformat(t2) - date.fromisoformat(t1)).days == 1):
            violations.append(f"НАРУШЕНИЕ: {schedule.duties[t1]} подряд {t1} и {t2}")
    return violations


# ─── ДЕМОНСТРАЦИЯ ─────────────────────────────────────────────────────────────

def demo():
    print()
    teachers = [
        Teacher("t1", "Иванов Иван Иванович",     "Кафедра информатики и ВТ",
                max_load=2, phone="+7 (916) 111-22-33",
                blackout_dates=["2026-04-15", "2026-04-16"]),   # ★ blackout
        Teacher("t2", "Петрова Мария Сергеевна",  "Кафедра математики",
                max_load=3, phone="89162223344"),
        Teacher("t3", "Сидоров Алексей Петрович", "Кафедра физики",
                max_load=2,
                blackout_dates=["2026-04-27"]),                  # ★ blackout
        Teacher("t4", "Козлова Наталья Юрьевна",  "Кафедра химии и биологии",
                max_load=2, phone="+7(495)333-44-55"),
        Teacher("t5", "Новиков Дмитрий Олегович", "Кафедра экономики и права",
                max_load=1),
    ]

    year, month = 2026, 4

    # Праздники месяца
    _, days_in_month = calendar.monthrange(year, month)
    holidays_found = [(d, get_holiday_name(date(year, month, d)))
                      for d in range(1, days_in_month + 1)
                      if get_holiday_name(date(year, month, d))]
    print(f"🏛  Праздники апрель 2026: {len(holidays_found)}")
    for d, name in holidays_found:
        print(f"   {date(year,month,d)} — {name}")

    print(f"\n🚫  Нежелательные даты:")
    for t in teachers:
        if t.blackout_dates:
            print(f"   {t.name[:25]}: {', '.join(t.blackout_dates)}")

    print()

    # Распределение
    distributor = DutyDistributor(teachers, seed=7)
    schedule    = distributor.distribute(year, month)

    # Добавим пример запроса замены
    first_duty = next((k for k, v in sorted(schedule.duties.items()) if v == "t1"), None)
    if first_duty:
        schedule.replace_requests[first_duty] = True

    print(export_print_table(schedule, teachers, year, month))
    print()

    # Статистика
    stats = compute_stats(schedule, teachers, year, month)
    print(f"📊  Статистика — Апрель {year}")
    print(f"    Рабочих дней: {stats['workdays']} | Праздников: {stats['holidays']} | Без дежурного: {stats['unassigned']}")
    print(f"    Пропущено из-за «чёрных меток»: {stats['blackout_skips']}\n")
    print(f"  {'Преподаватель':<32} {'Дней':>5} {'Нед':>6} {'Нагр%':>7}  {'Статус':<10}  {'Замен'}")
    print("  " + "─" * 70)
    for row in stats["teachers"]:
        icon = {"норма":"🟢","высокая":"🟡","перебор":"🔴"}.get(row["status"],"")
        repl = f"🔄 {row['replace_requests']}" if row["replace_requests"] else "—"
        print(f"  {row['name'][:32]:<32} {row['month_duties']:>5} {row['week_peak']:>3}/{row['max_load']:<2} {row['load_pct']:>7.0f}%  {icon} {row['status']:<10}  {repl}")

    print(f"\n  Итого назначено: {stats['total_assigned']} / {stats['workdays']}")

    violations = validate_schedule(schedule)
    print(f"\n✅  Проверка: {'нарушений нет' if not violations else chr(10).join(violations)}")

    csv_data = export_to_csv(schedule, teachers, year, month)
    print(f"\n📤  CSV (4 строки):")
    for line in csv_data.splitlines()[2:6]:
        print("   " + line)
    print()


if __name__ == "__main__":
    demo()
