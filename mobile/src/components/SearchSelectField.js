import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, useStyles, useTheme } from '../theme';
import useSheetBottom from '../hooks/useSheetBottom';

// "india" and "Índia" look for the same thing.
const fold = (text) =>
  String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/**
 * The options that match what was typed: those whose name starts with it
 * first ("in" → India, Indonesia), then those with a later word starting
 * with it (British Indian Ocean Territory). Nothing typed lists everything.
 */
export const filterOptions = (options, text) => {
  const wanted = fold(text);
  if (!wanted) return options;
  const starts = [];
  const words = [];
  for (const option of options) {
    const name = fold(option.label);
    if (name.startsWith(wanted)) starts.push(option);
    else if (name.split(/[\s\-(/]+/).some((word) => word.startsWith(wanted))) words.push(option);
  }
  return [...starts, ...words];
};

/**
 * A dropdown with a search box, for lists too long to scroll through: every
 * country, a country's states. Looks like SelectField; tapping the field
 * opens a sheet listing everything, and typing narrows it as you go.
 *
 *   options: [{ value, label, flag? }]   `flag` is shown before the label
 *   disabled / disabledHint: a field that waits on another ("Pick a country first")
 *   loading: the options are still on their way
 */
const SearchSelectField = ({
  label,
  value,
  options = [],
  onChange,
  placeholder = 'Select',
  searchPlaceholder = 'Search',
  emptyText = 'Nothing matches',
  disabled = false,
  disabledHint,
  loading = false,
  error,
  style,
}) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const { height } = useWindowDimensions();
  const sheetBottom = useSheetBottom(spacing.lg);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  const selected = options.find((option) => option.value === value);
  const shown = useMemo(() => filterOptions(options, text), [options, text]);

  useEffect(() => {
    if (!open) setText('');
  }, [open]);

  const pick = (option) => {
    onChange?.(option.value, option);
    setOpen(false);
  };

  const renderOption = ({ item }) => {
    const active = item.value === value;
    return (
      <TouchableOpacity style={styles.option} activeOpacity={0.7} onPress={() => pick(item)}>
        {item.flag ? <Text style={styles.flag}>{item.flag}</Text> : null}
        <Text style={[styles.optionText, active && styles.optionTextActive]} numberOfLines={1}>
          {item.label}
        </Text>
        {active && <Ionicons name="checkmark" size={18} color={theme.accentGreen} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.wrapper, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <TouchableOpacity
        style={[styles.field, disabled && styles.fieldDisabled, error && styles.fieldError]}
        activeOpacity={disabled ? 1 : 0.8}
        onPress={() => !disabled && setOpen(true)}
      >
        {selected?.flag ? <Text style={styles.fieldFlag}>{selected.flag}</Text> : null}
        <Text style={[styles.value, !selected && styles.placeholder]} numberOfLines={1}>
          {selected ? selected.label : disabled && disabledHint ? disabledHint : placeholder}
        </Text>
        {loading ? (
          <ActivityIndicator size="small" color={theme.textMuted} />
        ) : (
          <Ionicons name="chevron-down" size={18} color={theme.textMuted} />
        )}
      </TouchableOpacity>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          {/* Behind the sheet, not around it: on Android a pressable ancestor
              takes slow drags away from the list (see SelectField). */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.sheet, { height: height * 0.8, paddingBottom: sheetBottom }]}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{label}</Text>
                <TouchableOpacity
                  onPress={() => setOpen(false)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={18} color={theme.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.search}>
                <Ionicons name="search" size={18} color={theme.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={text}
                  onChangeText={setText}
                  placeholder={searchPlaceholder}
                  placeholderTextColor={theme.textMuted}
                  autoFocus
                  autoCorrect={false}
                  autoCapitalize="words"
                  returnKeyType="search"
                />
                {text ? (
                  <TouchableOpacity onPress={() => setText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={18} color={theme.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {loading && !options.length ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={theme.accentGreen} size="small" />
                </View>
              ) : (
                <FlatList
                  data={shown}
                  keyExtractor={(item) => String(item.value)}
                  renderItem={renderOption}
                  extraData={value}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  initialNumToRender={20}
                  ListEmptyComponent={<Text style={styles.empty}>{emptyText}</Text>}
                />
              )}
            </View>
          </KeyboardAvoidingView>
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
    gap: spacing.sm,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  fieldDisabled: { opacity: 0.55 },
  fieldError: { borderColor: theme.danger },
  fieldFlag: { fontSize: 18 },
  value: { flex: 1, color: theme.text, fontSize: 16 },
  placeholder: { color: theme.textMuted },
  error: { color: theme.danger, fontSize: 12, marginTop: spacing.xs },
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    color: theme.textMuted,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 6,
    marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, color: theme.text, fontSize: 15, padding: 0 },
  loadingRow: { paddingVertical: spacing.xl, alignItems: 'center' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  flag: { fontSize: 18, width: 26 },
  optionText: { flex: 1, color: theme.text, fontSize: 16 },
  optionTextActive: { color: theme.accentGreen, fontWeight: '600' },
  empty: { color: theme.textMuted, fontSize: 14, paddingVertical: spacing.lg, textAlign: 'center' },
});

export default SearchSelectField;
