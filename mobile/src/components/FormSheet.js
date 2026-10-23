import React from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GradientButton from './GradientButton';
import useSheetBottom from '../hooks/useSheetBottom';
import { spacing, useStyles, useTheme } from '../theme';

/**
 * Shared bottom-sheet shell (grabber, header, scrollable body, gradient
 * submit) used by the itinerary / gallery / attraction / stay create sheets.
 * Mirrors the NewTaskSheet layout.
 */
const FormSheet = ({
  visible,
  title,
  subtitle,
  submitLabel = 'Save',
  saving = false,
  onClose,
  onSubmit,
  children,
}) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const sheetBottom = useSheetBottom(spacing.lg);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Behind the sheet, so a tap outside closes it. Not around the sheet: on
            Android a pressable ancestor takes slow drags away from the native
            scroll views inside (the body, a date wheel), leaving only flicks. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View style={[styles.sheet, { paddingBottom: sheetBottom }]}>
            <View style={styles.grabber} />

            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={styles.title}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
                <Ionicons name="close" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>

            <GradientButton title={submitLabel} onPress={onSubmit} loading={saving} style={styles.save} />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

export const makeSheetStyles = (theme) => StyleSheet.create({
  label: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 2,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  stepButton: { paddingHorizontal: 6, paddingVertical: 2 },
  stepValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepText: { color: theme.text, fontSize: 12, fontWeight: '600' },
});

const makeStyles = (theme) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheetWrap: { maxHeight: '92%' },
  sheet: {
    backgroundColor: theme.sheet,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.overlayBold,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  headerText: { flex: 1 },
  title: { color: theme.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { marginTop: spacing.md },
  save: { marginTop: spacing.sm },
});

export default FormSheet;
