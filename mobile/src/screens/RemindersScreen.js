import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import DarkScreen from '../components/DarkScreen';
import ScreenHeader from '../components/ScreenHeader';
import ReminderSheet from '../components/ReminderSheet';
import AppAlert from '../components/AppAlert';
import { ensureAlarmPermissions } from '../components/AlarmPermissionSheet';
import RemindersTab from './group/RemindersTab';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketProvider';
import useReminderActions from '../hooks/useReminderActions';
import { fetchMyReminders } from '../api/reminders.api';
import { getAlarmPermissions } from '../utils/reminderAlarms';
import { dark, radius, spacing } from '../theme';

const WARN = '#F5B342';

/**
 * Every reminder that can ring for me: the shared ones from all my groups, my
 * private ones, and personal reminders that belong to no group. New reminders
 * made here are personal; a group's own are made from that group.
 */
const RemindersScreen = ({ navigation }) => {
  const { user } = useAuth();
  const { socket, connected } = useSocket();

  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Null until read. `complete: false` shows the "alarms are off" banner.
  const [permissions, setPermissions] = useState(null);

  const load = useCallback(async () => {
    try {
      setReminders(await fetchMyReminders());
    } catch (err) {
      AppAlert.alert('Could not load reminders', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const readPermissions = useCallback(async () => {
    setPermissions(await getAlarmPermissions());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      readPermissions();
    }, [load, readPermissions])
  );

  // Another member set, moved or deleted a reminder while this is open.
  useEffect(() => {
    if (!socket || !connected) return undefined;
    socket.on('reminder:changed', load);
    return () => socket.off('reminder:changed', load);
  }, [socket, connected, load]);

  const actions = useReminderActions({ groupId: null, userId: user?._id, setReminders });

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const turnOnAlarms = async () => {
    await ensureAlarmPermissions();
    readPermissions();
  };

  return (
    <DarkScreen>
      <ScreenHeader title="Reminders" onBack={() => navigation.goBack()} />

      {permissions && !permissions.complete ? (
        <TouchableOpacity style={styles.banner} activeOpacity={0.85} onPress={turnOnAlarms}>
          <Ionicons name="alert-circle-outline" size={18} color={WARN} />
          <Text style={styles.bannerText}>
            Alarms are off, so reminders arrive as normal notifications.
          </Text>
          <Text style={styles.bannerAction}>Turn on</Text>
        </TouchableOpacity>
      ) : null}

      <RemindersTab
        reminders={reminders}
        loading={loading}
        showGroup
        onToggle={actions.toggle}
        onOpen={actions.openEdit}
        refreshing={refreshing}
        onRefresh={onRefresh}
        emptyText="No reminders yet. Tap + to set one for yourself, or add one from a group."
      />

      <TouchableOpacity style={styles.fab} activeOpacity={0.9} onPress={() => actions.openNew()}>
        <LinearGradient
          colors={dark.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabInner}
        >
          <Ionicons name="add" size={26} color="#04121C" />
        </LinearGradient>
      </TouchableOpacity>

      <ReminderSheet {...actions.sheetProps} />
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    backgroundColor: 'rgba(245,179,66,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,179,66,0.28)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md - 4,
    paddingVertical: spacing.sm + 2,
  },
  bannerText: { flex: 1, color: dark.text, fontSize: 12, lineHeight: 17 },
  bannerAction: { color: WARN, fontSize: 12, fontWeight: '800' },

  // DarkScreen's inner view already ends above the system navigation bar.
  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg },
  fabInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default RemindersScreen;
