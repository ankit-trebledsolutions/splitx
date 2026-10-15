import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { dark, spacing } from '../theme';

/**
 * The one calendar of the app: months one under the other in a single list,
 * scrolled through like a phone's calendar instead of paged with arrows.
 * Opens on the chosen day's month. Days before `minDate` cannot be picked.
 *
 *   <MonthScroller value={date} minDate={today} onPick={(day) => ...} />
 *
 * `onPick` gets the day at midnight; the caller decides the time of day.
 * Used by CalendarPanel (drops down inside a sheet) and DateField (its own
 * sheet), so both look and scroll the same.
 */
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAY = 36;
const ROW = DAY + 8;
const TITLE = 44;
// How far the list runs: back from the first month on show, and on past the chosen one.
const MONTHS_BACK = 12;
const MONTHS_AHEAD = 18;

const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const monthOf = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const addMonths = (month, by) => new Date(month.getFullYear(), month.getMonth() + by, 1);
const monthsBetween = (a, b) =>
  (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());

const monthTitle = (month) =>
  month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

// The month as rows of seven, null where a row runs beyond the month's days.
const weeksOf = (month) => {
  const lead = month.getDay();
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
};

const MonthScroller = ({ value, minDate, onPick, height = 300 }) => {
  const listRef = useRef(null);
  const today = useMemo(() => startOfDay(new Date()), []);
  const min = minDate ? startOfDay(minDate) : null;
  const chosen = value ? startOfDay(value) : null;
  const anchor = monthOf(chosen ?? today);

  // Built once per opening: the range only has to cover where the list starts.
  const months = useMemo(() => {
    const first = min ? monthOf(min) : addMonths(anchor, -MONTHS_BACK);
    const last = addMonths(anchor, MONTHS_AHEAD);
    const list = [];
    for (let m = first; m <= last; m = addMonths(m, 1)) {
      list.push({ key: `${m.getFullYear()}-${m.getMonth()}`, month: m, weeks: weeksOf(m) });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Months differ in height (four to six weeks), so each one's offset is added up.
  const layout = useMemo(() => {
    let offset = 0;
    return months.map(({ weeks }) => {
      const length = TITLE + weeks.length * ROW;
      const item = { length, offset };
      offset += length;
      return item;
    });
  }, [months]);

  const indexOf = (date) =>
    Math.min(months.length - 1, Math.max(0, monthsBetween(months[0].month, monthOf(date))));

  // The date moved from outside (the chevrons beside the chip): bring its month
  // up. A day picked here is already on screen, so the list stays put.
  const picked = useRef(null);
  const valueMonth = chosen ? `${chosen.getFullYear()}-${chosen.getMonth()}` : '';
  useEffect(() => {
    const fromPick = picked.current === valueMonth;
    picked.current = null;
    if (!chosen || fromPick) return;
    listRef.current?.scrollTo({ y: layout[indexOf(chosen)].offset, animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueMonth]);

  const pick = (month, day) => {
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    picked.current = `${date.getFullYear()}-${date.getMonth()}`;
    onPick(date);
  };

  // A plain scroll view, not a FlatList: this sits inside the sheets' own
  // ScrollView, and a virtualized list nested in one breaks (React Native
  // warns). Every month is drawn, so the range stays a few dozen months.
  // It opens on the chosen month once the months are laid out.
  const placed = useRef(false);
  const placeAtStart = () => {
    if (placed.current) return;
    placed.current = true;
    listRef.current?.scrollTo({ y: layout[indexOf(chosen ?? today)].offset, animated: false });
  };

  const renderMonth = ({ key, month, weeks }) => (
    <View key={key} style={styles.month}>
      <Text style={styles.title}>{monthTitle(month)}</Text>
      {weeks.map((week, i) => (
        <View key={i} style={styles.week}>
          {week.map((day, j) => {
            if (!day) return <View key={`blank-${j}`} style={styles.cell} />;
            const date = new Date(month.getFullYear(), month.getMonth(), day);
            const isChosen = chosen && date.getTime() === chosen.getTime();
            const isToday = date.getTime() === today.getTime();
            const gone = min && date < min;
            return (
              <TouchableOpacity
                key={day}
                style={styles.cell}
                onPress={() => pick(month, day)}
                disabled={gone}
                activeOpacity={0.7}
              >
                <View style={[styles.day, isToday && !isChosen && styles.dayToday]}>
                  {/* Its own view, put up fresh when the day is chosen: a background
                      given to an existing view loses its round corners on Android. */}
                  {isChosen ? <View style={styles.dayChosen} /> : null}
                  <Text
                    style={[
                      styles.dayText,
                      gone && styles.dayTextGone,
                      isChosen && styles.dayTextChosen,
                    ]}
                  >
                    {day}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );

  return (
    <View>
      <View style={[styles.week, styles.weekdays]}>
        {WEEKDAYS.map((name) => (
          <Text key={name} style={styles.weekday}>
            {name}
          </Text>
        ))}
      </View>
      <ScrollView
        ref={listRef}
        style={{ height }}
        onContentSizeChange={placeAtStart}
        // Inside a sheet's own scroll view: Android hands drags to the inner list.
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {months.map(renderMonth)}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  weekdays: {
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  month: { overflow: 'hidden' },
  week: { flexDirection: 'row' },
  weekday: {
    flex: 1,
    textAlign: 'center',
    color: dark.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  title: {
    height: TITLE,
    lineHeight: TITLE,
    color: dark.text,
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
  },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', height: ROW },
  day: {
    width: DAY,
    height: DAY,
    borderRadius: DAY / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: { borderWidth: 1, borderColor: dark.border },
  dayChosen: {
    position: 'absolute',
    width: DAY,
    height: DAY,
    borderRadius: DAY / 2,
    backgroundColor: dark.accentGreen,
  },
  dayText: { color: dark.text, fontSize: 16, fontWeight: '500' },
  dayTextGone: { color: 'rgba(255,255,255,0.22)' },
  dayTextChosen: { color: '#04121C', fontWeight: '800' },
});

export default MonthScroller;
