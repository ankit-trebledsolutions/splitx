import React from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useSheetBottom from '../hooks/useSheetBottom';
import { radius, spacing, useStyles, useTheme, useThemeMode, THEME_MODES } from '../theme';

// Bottom sheet behind Profile → Appearance: Dark (the look the app launched
// with), Light, or whichever the phone is set to. Picking one applies it at
// once, keeps it for the next launch (ThemeContext) and closes the sheet.
const ICONS = {
  dark: 'moon-outline',
  light: 'sunny-outline',
  system: 'phone-portrait-outline',
};

const AppearanceSheet = ({ visible, onClose }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const { mode, setMode } = useThemeMode();
  const sheetBottom = useSheetBottom(spacing.xl);

  const choose = (key) => {
    setMode(key);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Behind the sheet, not around it: a pressable ancestor steals slow
            drags from anything scrollable inside (see FormSheet). */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: sheetBottom }]}>
          <Text style={styles.title}>Appearance</Text>
          <Text style={styles.hint}>How Splix looks on this phone.</Text>

          {THEME_MODES.map((option, index) => {
            const selected = option.key === mode;
            const tint = selected ? theme.accentGreen : theme.textMuted;
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.row, index > 0 && styles.rowBorder]}
                activeOpacity={0.7}
                onPress={() => choose(option.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <View style={[styles.icon, selected && styles.iconSelected]}>
                  <Ionicons name={ICONS[option.key]} size={18} color={tint} />
                </View>
                <View style={styles.body}>
                  <Text style={styles.label}>{option.label}</Text>
                  <Text style={styles.sub}>{option.hint}</Text>
                </View>
                <Ionicons
                  name={selected ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={tint}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (theme) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.sheet,
    borderTopLeftRadius: radius.lg + 8,
    borderTopRightRadius: radius.lg + 8,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  title: { color: theme.text, fontSize: 17, fontWeight: '800' },
  hint: { color: theme.textMuted, fontSize: 13, marginTop: 4, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 4,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: theme.border },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: theme.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSelected: { backgroundColor: 'rgba(0,196,208,0.14)' },
  body: { flex: 1, marginLeft: spacing.sm + 4, marginRight: spacing.sm },
  label: { color: theme.text, fontSize: 14, fontWeight: '700' },
  sub: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
});

export default AppearanceSheet;
