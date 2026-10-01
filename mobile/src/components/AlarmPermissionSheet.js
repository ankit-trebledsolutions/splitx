import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity, AppState, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import GradientButton from './GradientButton';
import useSheetBottom from '../hooks/useSheetBottom';
import { getAlarmPermissions, openAlarmSettings } from '../utils/reminderAlarms';
import { dark, radius, spacing } from '../theme';

/**
 * "Turn on alarms and calls": what Android still has to allow before a
 * reminder can ring like an alarm and a group call like a phone call, with a
 * button for each.
 *
 * Two of the three are not popups. "Alarms & reminders" and full-screen
 * notifications are switches on a page in Android's settings, so the button
 * opens that page and the row ticks itself when the person comes back.
 *
 * <AlarmPermissionHost /> is mounted once at the app root. Anywhere else:
 *
 *   const allowed = await ensureAlarmPermissions();   // saving a reminder
 *   const allowed = await ensureCallPermissions();    // starting a call
 *
 * shows the sheet only if something that purpose needs is missing, and
 * resolves when it closes.
 */
const GRANTED = '#17E695';

// Phones whose makers stop closed apps unless the owner exempts them. Android
// gives no way to read or change that switch, so the sheet can only point at it.
const STRICT_BRANDS = /xiaomi|redmi|poco|oppo|vivo|realme|oneplus|huawei|honor|infinix|tecno/i;
const isStrictBrand = () => {
  const { Brand = '', Manufacturer = '' } = Platform.constants ?? {};
  return Platform.OS === 'android' && STRICT_BRANDS.test(`${Brand} ${Manufacturer}`);
};

let present = null;

// What each purpose needs. A call rings without "Alarms & reminders": that
// switch is only about ringing at a set minute.
const allowsAlarms = (state) => state.complete;
const allowsCalls = (state) => state.notifications && state.fullScreen;

const ensure = async (isEnough) => {
  const state = await getAlarmPermissions();
  if (isEnough(state) || !present) return isEnough(state);
  return new Promise((resolve) => present(async () => resolve(isEnough(await getAlarmPermissions()))));
};

/**
 * Resolves true when a reminder can ring as an alarm. If something is missing
 * the sheet is shown first, and the answer is whatever holds when it closes.
 */
export const ensureAlarmPermissions = () => ensure(allowsAlarms);

// The same for an incoming group call: shown on screen, and over the lock screen.
export const ensureCallPermissions = () => ensure(allowsCalls);

export const AlarmPermissionHost = () => {
  // Everyone waiting for the sheet to close; empty while it is not showing.
  // More than one when it is asked for again while already up (a call started
  // during the first-time prompt): each is answered when it closes.
  const [waiting, setWaiting] = useState([]);
  const [state, setState] = useState(null);
  const sheetBottom = useSheetBottom(spacing.lg);
  const showing = waiting.length > 0;

  const refresh = useCallback(async () => {
    setState(await getAlarmPermissions());
  }, []);

  useEffect(() => {
    present = (onClose) => {
      setWaiting((list) => [...list, onClose]);
      refresh();
    };
    return () => {
      present = null;
    };
  }, [refresh]);

  // Back from Android's settings page: read the switches again.
  useEffect(() => {
    if (!showing) return undefined;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    return () => subscription.remove();
  }, [showing, refresh]);

  if (!showing || !state) return null;

  const close = () => {
    const done = waiting;
    setWaiting([]);
    done.forEach((onClose) => onClose());
  };

  const allowNotifications = async () => {
    // Android shows its own popup once (twice at most); after that it is the settings page.
    if (state.canAskNotifications) await Notifications.requestPermissionsAsync();
    else await openAlarmSettings('notifications');
    refresh();
  };

  // text: what it is for. how: what to do, shown only while it is still off.
  const rows = [
    {
      key: 'notifications',
      icon: 'notifications-outline',
      title: 'Notifications',
      text: 'Shows reminders and incoming calls on your screen.',
      granted: state.notifications,
      onAllow: allowNotifications,
    },
    state.exactAlarmIsSetting && {
      key: 'exactAlarm',
      icon: 'alarm-outline',
      title: 'Alarms & reminders',
      text: 'Rings a reminder at the exact minute.',
      how: 'Android opens its settings: switch on "Allow setting alarms and reminders", then come back.',
      granted: state.exactAlarm,
      onAllow: () => openAlarmSettings('exactAlarm'),
    },
    state.fullScreenIsSetting && {
      key: 'fullScreen',
      icon: 'phone-portrait-outline',
      title: 'Full-screen alarms and calls',
      text: 'Shows the alarm or the incoming call when your phone is locked.',
      how: 'Android opens its settings: switch it on, then come back.',
      granted: state.fullScreen,
      onAllow: () => openAlarmSettings('fullScreen'),
    },
  ].filter(Boolean);

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={[styles.sheet, { paddingBottom: sheetBottom }]}>
          <View style={styles.grabber} />

          <View style={styles.badge}>
            <Ionicons name="alarm-outline" size={26} color={dark.accentGreen} />
          </View>
          <Text style={styles.title}>Turn on alarms and calls</Text>
          <Text style={styles.subtitle}>
            Reminders ring like an alarm and group calls ring like a phone call, even when Splix
            is closed or your phone is locked.
          </Text>

          {rows.map((row) => (
            <View key={row.key} style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name={row.icon} size={18} color={dark.text} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{row.title}</Text>
                <Text style={styles.rowText}>
                  {row.granted || !row.how ? row.text : `${row.text} ${row.how}`}
                </Text>
              </View>
              {row.granted ? (
                <Ionicons name="checkmark-circle" size={24} color={GRANTED} />
              ) : (
                <TouchableOpacity style={styles.allow} onPress={row.onAllow} activeOpacity={0.85}>
                  <Text style={styles.allowText}>Allow</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}

          {isStrictBrand() ? (
            <TouchableOpacity
              style={styles.tip}
              activeOpacity={0.8}
              onPress={() => openAlarmSettings('app')}
            >
              <Ionicons name="battery-charging-outline" size={16} color="#F5B342" />
              <Text style={styles.tipText}>
                On this phone, also allow Splix to start by itself (Autostart) and set its battery
                use to “No restrictions”, or alarms and calls can be stopped once the app is
                closed. Tap to open the app’s settings.
              </Text>
            </TouchableOpacity>
          ) : null}

          {state.complete ? (
            <GradientButton title="Done" onPress={close} style={styles.done} />
          ) : (
            <>
              <Text style={styles.footnote}>
                Until these are on, a reminder arrives as a normal notification and can be a few
                minutes late, and a group call may not ring.
              </Text>
              <TouchableOpacity style={styles.later} onPress={close} activeOpacity={0.8}>
                <Text style={styles.laterText}>Not now</Text>
              </TouchableOpacity>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

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
    backgroundColor: 'rgba(0,196,208,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,196,208,0.28)',
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

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    padding: spacing.md - 2,
    marginBottom: spacing.sm,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md - 4,
  },
  rowBody: { flex: 1, marginRight: spacing.sm },
  rowTitle: { color: dark.text, fontSize: 14, fontWeight: '700' },
  rowText: { color: dark.textMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  allow: {
    backgroundColor: dark.button,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 1,
  },
  allowText: { color: '#04121C', fontSize: 12, fontWeight: '800' },

  tip: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: 'rgba(245,179,66,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,179,66,0.25)',
    borderRadius: radius.md,
    padding: spacing.md - 4,
    marginBottom: spacing.sm,
  },
  tipText: { flex: 1, color: dark.textMuted, fontSize: 11, lineHeight: 16 },

  done: { marginTop: spacing.sm },
  footnote: {
    color: dark.textMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  later: {
    marginTop: spacing.sm + 2,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  laterText: { color: dark.text, fontSize: 15, fontWeight: '600' },
});
