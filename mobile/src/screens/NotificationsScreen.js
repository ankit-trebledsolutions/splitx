import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import DarkScreen from '../components/DarkScreen';
import SwipeableRow from '../components/SwipeableRow';
import {
  fetchNotifications,
  markNotificationRead,
  clearNotification,
} from '../api/notifications.api';
import { dark, radius, spacing } from '../theme';
import { timeAgo } from '../utils/format';

// Icon tile + accent per notification type.
const TYPE_STYLE = {
  expense: { icon: 'card-outline', tint: '#F97362' },
  task: { icon: 'checkmark-circle-outline', tint: '#22C55E' },
  reminder: { icon: 'alarm-outline', tint: '#F5B342' },
  member: { icon: 'person-add-outline', tint: '#8B5CF6' },
  itinerary: { icon: 'map-outline', tint: '#4A7DF7' },
  photo: { icon: 'images-outline', tint: '#2DD4BF' },
  attraction: { icon: 'compass-outline', tint: '#2DD4BF' },
  stay: { icon: 'bed-outline', tint: '#4A7DF7' },
  system: { icon: 'sparkles-outline', tint: dark.textMuted },
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'alerts', label: 'Alerts' },
];

const matchesFilter = (item, filter) => {
  if (filter === 'unread') return !item.read;
  if (filter === 'transactions') return item.type === 'expense' || item.type === 'stay';
  if (filter === 'alerts') return item.type === 'task' || item.type === 'reminder';
  return true;
};

const signedAmount = (amount) =>
  `${amount < 0 ? '-' : '+'}$${Math.abs(amount).toFixed(2)}`;

const NotificationsScreen = ({ navigation }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const data = await fetchNotifications();
          if (active) setNotifications(data);
        } catch (err) {
          Alert.alert('Could not load notifications', err.message);
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  const visible = useMemo(
    () => notifications.filter((n) => matchesFilter(n, filter)),
    [notifications, filter]
  );

  const handleOpen = async (item) => {
    if (item.read) return;
    setNotifications((prev) =>
      prev.map((n) => (n._id === item._id ? { ...n, read: true } : n))
    );
    try {
      await markNotificationRead(item._id);
    } catch {
      // Read state is cosmetic; the next fetch resolves any drift.
    }
  };

  const handleDismiss = async (item) => {
    setNotifications((prev) => prev.filter((n) => n._id !== item._id));
    try {
      await clearNotification(item._id);
    } catch (err) {
      setNotifications((prev) => [item, ...prev]); // restore on failure
      Alert.alert('Could not clear notification', err.message);
    }
  };

  const renderNotification = ({ item }) => {
    const look = TYPE_STYLE[item.type] ?? TYPE_STYLE.system;
    return (
      <SwipeableRow onDismiss={() => handleDismiss(item)}>
        <TouchableOpacity
          style={[
            styles.card,
            item.read ? styles.cardRead : { borderColor: `${look.tint}55` },
          ]}
          activeOpacity={0.85}
          onPress={() => handleOpen(item)}
        >
          <View
            style={[
              styles.iconTile,
              { backgroundColor: `${look.tint}${item.read ? '12' : '1F'}` },
            ]}
          >
            <Ionicons
              name={look.icon}
              size={18}
              color={item.read ? `${look.tint}99` : look.tint}
            />
          </View>

          <View style={styles.body}>
            <Text style={[styles.title, item.read && styles.titleRead]}>{item.title}</Text>
            <Text style={[styles.message, item.read && styles.messageRead]}>{item.body}</Text>
            <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
          </View>

          <View style={styles.right}>
            {!item.read && <View style={styles.unreadDot} />}
            {item.amount != null && (
              <Text style={styles.amount}>{signedAmount(item.amount)}</Text>
            )}
          </View>
        </TouchableOpacity>
      </SwipeableRow>
    );
  };

  return (
    <DarkScreen>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={navigation.goBack}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color={dark.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.backButtonGhost} />
      </View>

      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {FILTERS.map((option) => {
            const active = filter === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.chip, active && styles.chipActive]}
                activeOpacity={0.8}
                onPress={() => setFilter(option.key)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={dark.accentGreen} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item._id}
          renderItem={renderNotification}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {filter === 'all'
                ? "You're all caught up — activity from your groups will show up here."
                : 'Nothing here for this filter.'}
            </Text>
          }
        />
      )}
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonGhost: { width: 36 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: dark.text,
    fontSize: 18,
    fontWeight: '800',
  },

  chipRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 1,
  },
  chipActive: { backgroundColor: dark.accentGreen, borderColor: dark.accentGreen },
  chipText: { color: dark.textMuted, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#04121C', fontWeight: '800' },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.xl },
  empty: {
    color: dark.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
  },

  card: {
    flexDirection: 'row',
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm + 2,
  },
  // Viewed notifications sit back: darker fill, plain border, dimmed content.
  cardRead: { backgroundColor: '#090B0E', borderColor: 'rgba(255,255,255,0.06)' },
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  body: { flex: 1, marginRight: spacing.sm },
  title: { color: dark.text, fontSize: 14, fontWeight: '700' },
  titleRead: { color: 'rgba(244,247,250,0.55)' },
  message: { color: dark.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  messageRead: { color: 'rgba(138,151,166,0.6)' },
  time: { color: dark.textMuted, fontSize: 10, marginTop: spacing.sm },
  right: { alignItems: 'flex-end', justifyContent: 'space-between' },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: dark.accentGreen,
  },
  amount: { color: dark.text, fontSize: 13, fontWeight: '800' },
});

export default NotificationsScreen;
