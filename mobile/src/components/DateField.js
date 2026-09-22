import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, dark, radius, spacing } from '../theme';
import { formatDate } from '../utils/format';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const sameDay = (a, b) => a && b && startOfDay(a).getTime() === startOfDay(b).getTime();

// Date picker styled to match SelectField: a field that opens a month calendar sheet.
//   value: Date | null      minDate: earliest selectable day (optional)
//   renderTrigger: optional ({ open, value }) => element, for a screen that
//     already draws its own date box and only wants the calendar behind it.
//     Call `open` to show the calendar.
const DateField = ({
  label,
  value,
  onChange,
  placeholder = 'Select a date',
  minDate,
  error,
  style,
  renderTrigger,
}) => {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => startOfDay(value ?? new Date()));

  const today = startOfDay(new Date());
  const min = minDate ? startOfDay(minDate) : null;

  // Leading nulls pad the first week so day 1 lands under its weekday.
  const cells = useMemo(() => {
    const year = month.getFullYear();
    const m = month.getMonth();
    const lead = new Date(year, m, 1).getDay();
    const days = new Date(year, m + 1, 0).getDate();
    return [
      ...Array(lead).fill(null),
      ...Array.from({ length: days }, (_, i) => new Date(year, m, i + 1)),
    ];
  }, [month]);

  const show = () => {
    setMonth(startOfDay(value ?? new Date()));
    setOpen(true);
  };

  const shiftMonth = (delta) =>
    setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));

  const canGoBack =
    !min || new Date(month.getFullYear(), month.getMonth(), 1) > new Date(min.getFullYear(), min.getMonth(), 1);

  const pick = (day) => {
    // Noon keeps the calendar day stable when the ISO string crosses time zones.
    onChange?.(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12));
    setOpen(false);
  };

  // A caller's own trigger stands in for the label, the field and the error
  // line, and brings its own spacing: nothing of the default look is drawn
  // around it. Without one, this renders exactly as it always has.
  return (
    <View style={renderTrigger ? style : [styles.wrapper, style]}>
      {renderTrigger ? (
        renderTrigger({ open: show, value })
      ) : (
        <>
          {label ? <Text style={styles.label}>{label}</Text> : null}

          <TouchableOpacity
            style={[styles.field, error && styles.fieldError]}
            activeOpacity={0.8}
            onPress={show}
          >
            <Text style={[styles.value, !value && styles.placeholder]}>
              {value ? formatDate(value) : placeholder}
            </Text>
            <Ionicons name="calendar-outline" size={18} color={dark.textMuted} />
          </TouchableOpacity>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet}>
            <View style={styles.monthRow}>
              <TouchableOpacity
                style={styles.monthButton}
                onPress={() => shiftMonth(-1)}
                disabled={!canGoBack}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={canGoBack ? dark.text : dark.border}
                />
              </TouchableOpacity>
              <Text style={styles.monthTitle}>
                {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity
                style={styles.monthButton}
                onPress={() => shiftMonth(1)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="chevron-forward" size={20} color={dark.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.grid}>
              {WEEKDAYS.map((day, i) => (
                <View key={`w${i}`} style={styles.cell}>
                  <Text style={styles.weekday}>{day}</Text>
                </View>
              ))}
              {cells.map((day, i) => {
                if (!day) return <View key={`e${i}`} style={styles.cell} />;
                const disabled = min && day < min;
                const selected = sameDay(day, value);
                const isToday = sameDay(day, today);
                return (
                  <TouchableOpacity
                    key={day.getDate()}
                    style={styles.cell}
                    disabled={disabled}
                    activeOpacity={0.7}
                    onPress={() => pick(day)}
                  >
                    <View
                      style={[styles.day, isToday && styles.dayToday, selected && styles.daySelected]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          disabled && styles.dayTextDisabled,
                          selected && styles.dayTextSelected,
                        ]}
                      >
                        {day.getDate()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  label: {
    color: dark.text,
    fontSize: 15,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  fieldError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 12, marginTop: spacing.xs },
  value: { color: dark.text, fontSize: 16 },
  placeholder: { color: dark.textMuted },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0C1418',
    borderTopLeftRadius: radius.lg + 8,
    borderTopRightRadius: radius.lg + 8,
    borderWidth: 1,
    borderColor: dark.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  monthButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: { color: dark.text, fontSize: 16, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', alignItems: 'center', paddingVertical: 3 },
  weekday: { color: dark.textMuted, fontSize: 12, fontWeight: '600', paddingVertical: spacing.xs },
  day: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: { borderWidth: 1, borderColor: dark.border },
  daySelected: { backgroundColor: dark.button, borderColor: dark.button },
  dayText: { color: dark.text, fontSize: 15 },
  dayTextDisabled: { color: 'rgba(255,255,255,0.2)' },
  dayTextSelected: { color: '#04121C', fontWeight: '800' },
});

export default DateField;
