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
import { dark, spacing } from '../theme';

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
}) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <Pressable style={styles.backdrop} onPress={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <Pressable style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color={dark.text} />
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
        </Pressable>
      </KeyboardAvoidingView>
    </Pressable>
  </Modal>
);

export const sheetStyles = StyleSheet.create({
  label: {
    color: dark.textMuted,
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
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 12,
    paddingHorizontal: 2,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  stepButton: { paddingHorizontal: 6, paddingVertical: 2 },
  stepValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepText: { color: dark.text, fontSize: 12, fontWeight: '600' },
});

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheetWrap: { maxHeight: '92%' },
  sheet: {
    backgroundColor: '#0C1418',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: dark.border,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  headerText: { flex: 1 },
  title: { color: dark.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: dark.textMuted, fontSize: 12, marginTop: 2 },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { marginTop: spacing.md },
  save: { marginTop: spacing.sm },
});

export default FormSheet;
