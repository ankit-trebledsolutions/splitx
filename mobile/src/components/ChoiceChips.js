import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dark, radius, spacing } from '../theme';

/**
 * Tap-to-select chips for a short list of choices.
 *   options:   [{ value, label, icon? }]
 *   multi:     `value` is an array. The last selected chip can't be switched
 *              off, so a multi-select never ends up empty.
 *   clearable: single-select only; tapping the selected chip again clears it (null).
 *   equal:     the options share one row at equal widths (for three short
 *              choices) rather than wrapping as pills.
 */
const ChoiceChips = ({
  options = [],
  value,
  onChange,
  multi = false,
  clearable = false,
  equal = false,
  style,
}) => {
  const isActive = (option) => (multi ? (value ?? []).includes(option.value) : value === option.value);

  const press = (option) => {
    if (!multi) {
      if (value !== option.value) onChange?.(option.value);
      else if (clearable) onChange?.(null);
      return;
    }
    const picked = value ?? [];
    if (!picked.includes(option.value)) onChange?.([...picked, option.value]);
    else if (picked.length > 1) onChange?.(picked.filter((v) => v !== option.value));
  };

  return (
    <View style={[equal ? styles.equalRow : styles.wrapRow, style]}>
      {options.map((option) => {
        const active = isActive(option);
        return (
          <TouchableOpacity
            key={option.value}
            style={[
              equal ? styles.block : styles.pill,
              active && (equal ? styles.blockActive : styles.pillActive),
            ]}
            activeOpacity={0.8}
            onPress={() => press(option)}
          >
            {option.icon ? (
              <Ionicons
                name={option.icon}
                size={14}
                color={active ? dark.accentGreen : dark.textMuted}
              />
            ) : null}
            <Text
              style={
                equal
                  ? [styles.blockText, active && styles.blockTextActive]
                  : [styles.pillText, active && styles.pillTextActive]
              }
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  equalRow: { flexDirection: 'row', gap: spacing.sm },

  // The Trips filter pill.
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 18,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: 7,
  },
  pillActive: { borderColor: dark.accentGreen, backgroundColor: 'rgba(0,196,208,0.10)' },
  pillText: { color: dark.textMuted, fontSize: 13, fontWeight: '600' },
  pillTextActive: { color: dark.accentGreen },

  // The New Task priority block.
  block: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
  },
  blockActive: { borderColor: dark.accentGreen, backgroundColor: `${dark.accentGreen}1F` },
  blockText: { color: dark.textMuted, fontSize: 13, fontWeight: '600' },
  blockTextActive: { color: dark.text },
});

export default ChoiceChips;
