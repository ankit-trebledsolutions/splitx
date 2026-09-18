import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DarkScreen from '../components/DarkScreen';
import Avatar from '../components/Avatar';
import GradientButton from '../components/GradientButton';
import AppAlert from '../components/AppAlert';
import { useAuth } from '../context/AuthContext';
import { fetchExpense } from '../api/groups.api';
import { clearNotification, markNotificationRead } from '../api/notifications.api';
import { usd, timeAgo } from '../utils/format';
import { dark, radius, spacing } from '../theme';

const EXPENSE_TINT = '#F97362';

const idOf = (value) => value?._id ?? value;

/**
 * What an "Expense Added" notification opens: the notification itself, the
 * key facts of the expense it is about, and where to go next.
 *
 * `notification` is a stored notification, or the equivalent built from a
 * tapped push (which has no _id, so it cannot be dismissed or marked read).
 */
const NotificationDetailScreen = ({ route, navigation }) => {
  const { notification } = route.params;
  const { user } = useAuth();
  const me = user?._id;

  const [expense, setExpense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  // Frozen at open: the dot shows this was new, even though opening marks it read.
  const [wasUnread] = useState(notification.read === false);

  useEffect(() => {
    let active = true;
    if (notification._id && notification.read === false) {
      markNotificationRead(notification._id).catch(() => {});
    }
    (async () => {
      try {
        const data = await fetchExpense(notification.entityId);
        if (active) setExpense(data);
      } catch {
        // Deleted since, or the person has left the group.
        if (active) setGone(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [notification]);

  const dismiss = async () => {
    if (!notification._id) {
      navigation.goBack();
      return;
    }
    setDismissing(true);
    try {
      await clearNotification(notification._id);
      navigation.goBack();
    } catch (err) {
      AppAlert.alert('Could not dismiss', err.message);
      setDismissing(false);
    }
  };

  // ---- the breakdown rows, worked out from the expense ------------------
  const adder = expense?.createdBy ?? expense?.paidBy;
  const adderFirstName = adder?.name?.split(' ')[0];
  const splits = expense?.splits ?? [];
  const mySplit = splits.find((s) => idOf(s.user) === me);
  const iPaid = idOf(expense?.paidBy) === me;
  const perHead = splits.length ? expense.amount / splits.length : 0;
  const isEqual = splits.length > 0 && splits.every((s) => Math.abs(s.amount - perHead) < 0.01);

  let shareLabel = 'Your share';
  let shareValue = usd(0);
  if (expense) {
    if (iPaid) {
      // You fronted the money: what matters is what is still coming back.
      const owed = splits.reduce(
        (sum, s) => (s.settled || idOf(s.user) === me ? sum : sum + s.amount),
        0
      );
      shareLabel = "You're owed";
      shareValue = `+${usd(owed)}`;
    } else if (mySplit) {
      shareLabel = isEqual ? `Your 1/${splits.length} share` : 'Your share';
      shareValue = mySplit.settled ? `${usd(mySplit.amount)} · settled` : `-${usd(mySplit.amount)}`;
    } else {
      shareLabel = 'Your share';
      shareValue = 'Not in this split';
    }
  }

  const amount = expense?.amount ?? Math.abs(notification.amount ?? 0);

  return (
    <DarkScreen>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIcon} onPress={navigation.goBack} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={18} color={dark.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notification Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <View style={styles.iconTile}>
              <Ionicons name="add-circle-outline" size={20} color={EXPENSE_TINT} />
            </View>
            <View style={styles.titleBody}>
              <Text style={styles.title}>{notification.title ?? 'Expense Added'}</Text>
              <Text style={styles.time}>
                {notification.createdAt ? timeAgo(notification.createdAt) : 'Just now'}
              </Text>
            </View>
            {wasUnread && <View style={styles.unreadDot} />}
          </View>

          <View style={styles.divider} />

          <Text style={styles.amountLabel}>TOTAL AMOUNT</Text>
          <Text style={styles.amount}>{usd(amount)}</Text>

          <View style={styles.divider} />

          <Text style={styles.messageLabel}>Activity Message</Text>
          <Text style={styles.message}>{notification.body}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={dark.accentGreen} style={styles.loading} />
        ) : gone ? (
          <View style={[styles.card, styles.goneCard]}>
            <Ionicons name="information-circle-outline" size={18} color={dark.textMuted} />
            <Text style={styles.goneText}>
              This expense is no longer available. It may have been deleted, or you have left the group.
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>SPLIX BREAKDOWN</Text>

            <View style={styles.row}>
              <Avatar name={adder?.name} size={30} />
              <Text style={styles.rowLabel}>Added by</Text>
              <Text style={styles.rowValue} numberOfLines={1}>
                {idOf(adder) === me ? 'You' : adder?.name ?? '—'}
              </Text>
            </View>
            <View style={styles.row}>
              <Avatar name={expense.group?.name} size={30} />
              <Text style={styles.rowLabel}>Group list</Text>
              <Text style={styles.rowValue} numberOfLines={1}>
                {expense.group?.name ?? '—'}
              </Text>
            </View>
            <View style={[styles.row, styles.rowLast]}>
              <Avatar name={user?.name} size={30} />
              <Text style={styles.rowLabel}>{shareLabel}</Text>
              <Text style={[styles.rowValue, styles.rowValueAccent]} numberOfLines={1}>
                {shareValue}
              </Text>
            </View>
          </View>
        )}

        {!loading && !gone && (
          <>
            <GradientButton
              title="View & Settle Expense"
              style={styles.primary}
              onPress={() => navigation.navigate('ExpenseDetail', { expenseId: expense._id })}
            />
            {adder && idOf(adder) !== me && (
              <TouchableOpacity
                style={styles.secondary}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('DirectChat', { peer: adder })}
              >
                <Text style={styles.secondaryText}>Chat with {adderFirstName}</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <TouchableOpacity style={styles.dismiss} onPress={dismiss} disabled={dismissing} activeOpacity={0.7}>
          <Text style={styles.dismissText}>
            {dismissing ? 'Dismissing…' : notification._id ? 'Dismiss Notification' : 'Close'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: { width: 36 },
  headerTitle: { color: dark.text, fontSize: 17, fontWeight: '800' },

  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  loading: { paddingVertical: spacing.xl },

  card: {
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg + 6,
    padding: spacing.md + 2,
    marginBottom: spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  iconTile: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: `${EXPENSE_TINT}1F`,
    borderWidth: 1,
    borderColor: `${EXPENSE_TINT}47`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBody: { flex: 1, marginLeft: spacing.sm + 4 },
  title: { color: dark.text, fontSize: 16, fontWeight: '800' },
  time: { color: dark.textMuted, fontSize: 12, marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#17E695' },
  divider: { height: 1, backgroundColor: dark.border, marginVertical: spacing.md },

  amountLabel: {
    color: dark.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  amount: {
    color: dark.text,
    fontSize: 40,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 4,
  },
  messageLabel: { color: dark.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  message: { color: dark.text, fontSize: 14, lineHeight: 21 },

  sectionLabel: {
    color: dark.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: dark.border,
  },
  rowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  rowLabel: { flex: 1, color: dark.text, fontSize: 14 },
  rowValue: { flexShrink: 1, color: dark.text, fontSize: 14, fontWeight: '800', textAlign: 'right' },
  rowValueAccent: { color: '#17E695' },

  goneCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  goneText: { flex: 1, color: dark.textMuted, fontSize: 13, lineHeight: 19 },

  primary: { marginTop: spacing.xs },
  secondary: {
    backgroundColor: dark.card2,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm + 2,
  },
  secondaryText: { color: dark.text, fontSize: 15, fontWeight: '700' },
  dismiss: { alignSelf: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  dismissText: { color: dark.textMuted, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
});

export default NotificationDetailScreen;
