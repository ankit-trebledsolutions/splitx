import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import GradientButton from './GradientButton';
import AppAlert from './AppAlert';
import useSheetBottom from '../hooks/useSheetBottom';
import { MORE_CREDITS_SUBJECT, creditsLabel, featureAction } from '../data/wallet';
import { dark, radius, spacing } from '../theme';

/**
 * "Not enough credits": what a paid feature needed, what the person has, and
 * the way to get more. Credits cannot be bought yet, so that way is asking
 * the team (Contact Us).
 *
 * Every refusal for credits arrives the same way, HTTP 402 with the code
 * 'NO_CREDITS' and { needed, balance, feature } beside it, so one sheet serves
 * them all:
 *
 *   if (isNoCredits(err)) showNoCredits(err);
 *
 * <NoCreditsHost /> is mounted once inside the NavigationContainer, which is
 * what lets its button open Contact Us from anywhere (the call provider sits
 * above the navigator).
 */
const SHORT = '#F87171';
const AMBER = '#F5B342';

let present = null;

const show = (notice) => {
  if (present) present(notice);
  else AppAlert.alert(notice.title, notice.message);
};

export const isNoCredits = (err) => err?.code === 'NO_CREDITS';

// `err` is the API client's failure; the server's extra fields are in `details`.
export const showNoCredits = (err) => {
  const { needed, balance, feature } = err?.details ?? {};
  const known = Number.isFinite(needed) && Number.isFinite(balance);
  show({
    title: 'Not enough credits',
    message: known
      ? `${featureAction(feature)} needs ${creditsLabel(needed)}.`
      : err?.message ?? 'You do not have enough credits for this.',
    ...(known ? { needed, balance } : {}),
  });
};

// The call this person started was ended by the server: their credits ran out.
export const showCallEndedNoCredits = () =>
  show({
    title: 'Call ended',
    message: 'Your credits ran out, so the call ended for everyone.',
  });

export const NoCreditsHost = () => {
  const navigation = useNavigation();
  const [notice, setNotice] = useState(null);
  const sheetBottom = useSheetBottom(spacing.lg);

  useEffect(() => {
    present = setNotice;
    return () => {
      present = null;
    };
  }, []);

  if (!notice) return null;

  const close = () => setNotice(null);
  const contact = () => {
    close();
    navigation.navigate('ContactUs', { subject: MORE_CREDITS_SUBJECT });
  };
  const hasNumbers = notice.needed !== undefined;

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
      <View style={styles.backdrop}>
        {/* Behind the sheet, never around it (see FormSheet). */}
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View style={[styles.sheet, { paddingBottom: sheetBottom }]}>
          <View style={styles.grabber} />

          <View style={styles.badge}>
            <Ionicons name="wallet-outline" size={26} color={AMBER} />
          </View>
          <Text style={styles.title}>{notice.title}</Text>
          <Text style={styles.subtitle}>{notice.message}</Text>

          {hasNumbers ? (
            <View style={styles.numbers}>
              <View style={styles.number}>
                <Text style={styles.numberLabel}>NEEDED</Text>
                <Text style={styles.numberValue}>{creditsLabel(notice.needed)}</Text>
              </View>
              <View style={styles.number}>
                <Text style={styles.numberLabel}>YOU HAVE</Text>
                <Text style={[styles.numberValue, { color: SHORT }]}>
                  {creditsLabel(notice.balance)}
                </Text>
              </View>
            </View>
          ) : null}

          <Text style={styles.footnote}>
            Credits can’t be bought in the app yet. To get more, ask the Splix team.
          </Text>

          <GradientButton title="Contact support" onPress={contact} style={styles.contact} />
          <TouchableOpacity style={styles.ok} onPress={close} activeOpacity={0.8}>
            <Text style={styles.okText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// AlarmPermissionSheet's look.
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0C1418',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: dark.border,
    paddingHorizontal: spacing.lg,
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
  badge: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(245,179,66,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,179,66,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: dark.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: spacing.md,
  },
  subtitle: {
    color: dark.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: spacing.xs + 2,
    marginBottom: spacing.md,
  },

  numbers: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  number: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md - 2,
  },
  numberLabel: { color: dark.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  numberValue: { color: dark.text, fontSize: 17, fontWeight: '800', marginTop: 4 },

  footnote: {
    color: dark.textMuted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  contact: { marginTop: spacing.xs },
  ok: {
    marginTop: spacing.sm + 2,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  okText: { color: dark.text, fontSize: 15, fontWeight: '600' },
});
