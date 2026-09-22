import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dark, radius, spacing } from '../theme';

// Dropdown styled to match TextField's dark variant.
//   options: [{ label, value }]
//   renderTrigger: optional ({ open, selected }) => element, for a screen that
//     already draws its own box and only wants the options sheet behind it.
//     Call `open` to show the sheet; `selected` is the chosen option, if any.
const SelectField = ({
  label,
  value,
  options = [],
  onChange,
  placeholder = 'Select',
  style,
  renderTrigger,
}) => {
  const [open, setOpen] = useState(false);
  const { height } = useWindowDimensions();
  const selected = options.find((o) => o.value === value);

  const show = () => setOpen(true);

  const pick = (option) => {
    onChange?.(option.value);
    setOpen(false);
  };

  // A caller's own trigger stands in for the label and the field, and brings
  // its own spacing: nothing of the default look is drawn around it. Without
  // one, this renders exactly as it always has.
  return (
    <View style={renderTrigger ? style : [styles.wrapper, style]}>
      {renderTrigger ? (
        renderTrigger({ open: show, selected })
      ) : (
        <>
          {label ? <Text style={styles.label}>{label}</Text> : null}

          <TouchableOpacity style={styles.field} activeOpacity={0.8} onPress={show}>
            <Text style={[styles.value, !selected && styles.placeholder]}>
              {selected ? selected.label : placeholder}
            </Text>
            <Ionicons name="chevron-down" size={18} color={dark.textMuted} />
          </TouchableOpacity>
        </>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet}>
            {label ? <Text style={styles.sheetTitle}>{label}</Text> : null}
            {/* A long list (the 14 days of a trip) scrolls inside the sheet
                rather than pushing its top off the screen. A short one stays
                put, as it always has. */}
            <ScrollView
              style={{ maxHeight: height * 0.6 }}
              keyboardShouldPersistTaps="handled"
              alwaysBounceVertical={false}
            >
              {options.map((option) => {
                const active = option.value === value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={styles.option}
                    activeOpacity={0.7}
                    onPress={() => pick(option)}
                  >
                    <Text
                      style={[styles.optionText, active && styles.optionTextActive]}
                      numberOfLines={1}
                    >
                      {option.label}
                    </Text>
                    {active && <Ionicons name="checkmark" size={18} color={dark.accentGreen} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
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
  sheetTitle: {
    color: dark.textMuted,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: dark.border,
  },
  // Shrinks (and truncates) only when a label is too long for the row, so the
  // check mark stays on screen; short labels lay out as they always have.
  optionText: { flexShrink: 1, color: dark.text, fontSize: 16 },
  optionTextActive: { color: dark.accentGreen, fontWeight: '600' },
});

export default SelectField;
