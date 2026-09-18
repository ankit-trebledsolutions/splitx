import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dark, radius, spacing } from '../theme';

/**
 * In-app replacement for React Native's system Alert, styled like the rest of
 * Splix. Same call shape, so it is a drop-in swap:
 *
 *   AppAlert.alert('Leave group?', 'You will lose access.', [
 *     { text: 'Cancel', style: 'cancel' },
 *     { text: 'Leave', style: 'destructive', onPress: leave },
 *   ]);
 *
 * <AppAlertHost /> is mounted once at the app root and renders whatever is
 * queued; alerts raised while one is showing wait their turn.
 */

const DANGER = '#F97362';
const SUCCESS = '#17E695';

const queue = [];
let notifyHost = null;

const alert = (title, message, buttons, options) => {
  queue.push({
    title,
    message,
    buttons: buttons?.length ? buttons : [{ text: 'OK' }],
    cancelable: options?.cancelable ?? true,
    onDismiss: options?.onDismiss,
  });
  notifyHost?.();
};

const AppAlert = { alert };

// The look is inferred from how the alert is used, so call sites stay plain.
const toneFor = ({ title = '', buttons }) => {
  if (buttons.some((b) => b.style === 'destructive')) {
    return { icon: 'warning-outline', color: DANGER };
  }
  if (/^(could ?n[o']t|can ?n[o']t|unable|error|failed|invalid|oops|no longer)|\bfailed\b/i.test(title)) {
    return { icon: 'alert-circle-outline', color: DANGER };
  }
  if (/(sent|saved|success|copied|updated|done|added|created)\b/i.test(title)) {
    return { icon: 'checkmark-circle-outline', color: SUCCESS };
  }
  return { icon: 'information-circle-outline', color: dark.accentGreen };
};

export const AppAlertHost = () => {
  const [current, setCurrent] = useState(null);

  const showing = useRef(false);

  const showNext = useCallback(() => {
    if (showing.current || !queue.length) return;
    showing.current = true;
    setCurrent(queue.shift());
  }, []);

  useEffect(() => {
    notifyHost = showNext;
    showNext();
    return () => {
      notifyHost = null;
    };
  }, [showNext]);

  // Close first, then run the handler, so a handler that raises another alert
  // (or navigates) never fights with this one still being on screen.
  const close = (handler) => {
    showing.current = false;
    setCurrent(null);
    setTimeout(() => {
      handler?.();
      showNext();
    }, 0);
  };

  if (!current) return null;

  const { title, message, buttons, cancelable, onDismiss } = current;
  const tone = toneFor(current);
  const cancelButton = buttons.find((b) => b.style === 'cancel');
  const dismiss = () => {
    if (!cancelable) return;
    close(cancelButton?.onPress ?? onDismiss);
  };
  const stacked = buttons.length > 2;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={dismiss}>
        <Pressable style={styles.card}>
          <View style={[styles.iconBadge, { backgroundColor: `${tone.color}1F`, borderColor: `${tone.color}47` }]}>
            <Ionicons name={tone.icon} size={24} color={tone.color} />
          </View>

          {title ? <Text style={styles.title}>{title}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={[styles.actions, stacked && styles.actionsStacked]}>
            {buttons.map((button, index) => {
              const isCancel = button.style === 'cancel';
              const isDestructive = button.style === 'destructive';
              return (
                <TouchableOpacity
                  key={`${button.text}-${index}`}
                  style={[
                    styles.button,
                    !stacked && styles.buttonInline,
                    isCancel ? styles.buttonCancel : isDestructive ? styles.buttonDanger : styles.buttonPrimary,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => close(button.onPress)}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      isCancel ? styles.buttonTextCancel : isDestructive ? styles.buttonTextDanger : styles.buttonTextPrimary,
                    ]}
                    numberOfLines={1}
                  >
                    {button.text ?? 'OK'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#0C1418',
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg + 8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md + 4,
    alignItems: 'center',
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { color: dark.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  message: {
    color: dark.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, alignSelf: 'stretch' },
  actionsStacked: { flexDirection: 'column' },
  button: {
    borderRadius: radius.md,
    paddingVertical: spacing.md - 3,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInline: { flex: 1 },
  buttonPrimary: { backgroundColor: dark.button },
  buttonDanger: { backgroundColor: DANGER },
  buttonCancel: { backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border },
  buttonText: { fontSize: 14, fontWeight: '800' },
  buttonTextPrimary: { color: '#04121C' },
  buttonTextDanger: { color: '#FFFFFF' },
  buttonTextCancel: { color: dark.text, fontWeight: '700' },
});

export default AppAlert;
