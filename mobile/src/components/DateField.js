import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, useStyles, useTheme } from '../theme';
import { formatDate } from '../utils/format';
import useSheetBottom from '../hooks/useSheetBottom';
import MonthScroller from './MonthScroller';

// Date picker styled to match SelectField: a field that opens a calendar sheet
// whose months scroll on one under the other (the app's one calendar).
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
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const sheetBottom = useSheetBottom(spacing.xl);

  const show = () => setOpen(true);

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
            <Ionicons name="calendar-outline" size={18} color={theme.textMuted} />
          </TouchableOpacity>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          {/* Behind the sheet, not around it: on Android a pressable ancestor
              takes slow drags away from the scrolling months (see FormSheet). */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: sheetBottom }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label || 'Pick a date'}</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setOpen(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>
            {open ? (
              <MonthScroller value={value} minDate={minDate} onPick={pick} height={340} />
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (theme) => StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  label: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  fieldError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 12, marginTop: spacing.xs },
  value: { color: theme.text, fontSize: 16 },
  placeholder: { color: theme.textMuted },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.sheet,
    borderTopLeftRadius: radius.lg + 8,
    borderTopRightRadius: radius.lg + 8,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sheetTitle: { color: theme.text, fontSize: 16, fontWeight: '700' },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default DateField;
