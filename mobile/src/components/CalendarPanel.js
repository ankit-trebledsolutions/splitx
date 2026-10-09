import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dark, spacing } from '../theme';
import { panelStyles } from './pickerPanel';

/**
 * A month of days to pick one from, dropping down under the date chip of the
 * reminder sheet. Days already gone cannot be picked. The time of day is
 * kept; only the day changes.
 *
 *   <CalendarPanel value={date} onChange={(date) => ...} onDone={() => ...} />
 */
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const monthOf = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

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

const CalendarPanel = ({ value, onChange, onDone }) => {
  const today = useMemo(() => startOfDay(new Date()), []);

  // The month on show: the one the person paged to, else the chosen date's.
  const [paged, setPaged] = useState(null);
  const valueMonth = `${value.getFullYear()}-${value.getMonth()}`;
  // The date changed (a day picked here, or the chevrons on the chip): show its month.
  useEffect(() => setPaged(null), [valueMonth]);
  const month = paged ?? monthOf(value);

  const weeks = useMemo(() => weeksOf(month), [month]);
  const canPageBack = month > monthOf(today);
  const page = (by) => setPaged(new Date(month.getFullYear(), month.getMonth() + by, 1));

  const pick = (day) => {
    const next = new Date(value);
    next.setFullYear(month.getFullYear(), month.getMonth(), day);
    onChange(next);
  };

  const isChosen = (day) =>
    day === value.getDate() &&
    month.getMonth() === value.getMonth() &&
    month.getFullYear() === value.getFullYear();
  const isGone = (day) => new Date(month.getFullYear(), month.getMonth(), day) < today;

  return (
    <View style={[panelStyles.panel, styles.panel]}>
      <View style={styles.header}>
        <Text style={styles.title}>{monthTitle(month)}</Text>
        <View style={styles.arrows}>
          <TouchableOpacity
            style={styles.arrow}
            onPress={() => page(-1)}
            disabled={!canPageBack}
            activeOpacity={0.7}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={canPageBack ? dark.accentGreen : 'rgba(255,255,255,0.25)'}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.arrow} onPress={() => page(1)} activeOpacity={0.7}>
            <Ionicons name="chevron-forward" size={22} color={dark.accentGreen} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.week}>
        {WEEKDAYS.map((name) => (
          <Text key={name} style={styles.weekday}>
            {name}
          </Text>
        ))}
      </View>

      {weeks.map((week, i) => (
        <View key={i} style={styles.week}>
          {week.map((day, j) => {
            if (!day) return <View key={`blank-${j}`} style={styles.cell} />;
            const chosen = isChosen(day);
            const gone = isGone(day);
            return (
              <TouchableOpacity
                key={day}
                style={styles.cell}
                onPress={() => pick(day)}
                disabled={gone}
                activeOpacity={0.7}
              >
                <View style={styles.day}>
                  {/* Its own view, put up fresh when the day is chosen: a background
                      given to an existing view loses its round corners on Android. */}
                  {chosen ? <View style={styles.dayChosen} /> : null}
                  <Text
                    style={[
                      styles.dayText,
                      gone && styles.dayTextGone,
                      chosen && styles.dayTextChosen,
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

      <TouchableOpacity style={panelStyles.done} onPress={onDone} activeOpacity={0.7}>
        <Text style={panelStyles.doneText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
};

const DAY = 36;

const styles = StyleSheet.create({
  panel: { paddingTop: spacing.md, paddingHorizontal: spacing.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  title: { flex: 1, color: dark.text, fontSize: 17, fontWeight: '700' },
  arrows: { flexDirection: 'row' },
  arrow: { padding: 6 },
  week: { flexDirection: 'row' },
  weekday: {
    flex: 1,
    textAlign: 'center',
    color: dark.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', height: DAY + 8 },
  day: {
    width: DAY,
    height: DAY,
    borderRadius: DAY / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
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

export default CalendarPanel;
