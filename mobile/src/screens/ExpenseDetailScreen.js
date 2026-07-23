import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import DarkScreen from '../components/DarkScreen';
import ScreenHeader from '../components/ScreenHeader';
import Avatar from '../components/Avatar';
import { useAuth } from '../context/AuthContext';
import { fetchExpense, settleExpense, deleteExpense } from '../api/groups.api';
import { dark, radius, spacing } from '../theme';
import { usd, formatDate, formatTime } from '../utils/format';

const CATEGORY_LABEL = {
  general: 'General',
  food: 'Food',
  stay: 'Stay',
  travel: 'Travel',
  fun: 'Fun',
  shopping: 'Shopping',
  transport: 'Travel',
  housing: 'Stay',
  entertainment: 'Fun',
  utilities: 'Bills',
  other: 'Other',
};

const ExpenseDetailScreen = ({ route, navigation }) => {
  const { expenseId } = route.params;
  const { user } = useAuth();
  const [expense, setExpense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);

  const load = useCallback(async () => {
    try {
      setExpense(await fetchExpense(expenseId));
    } catch (err) {
      Alert.alert('Could not load expense', err.message);
    } finally {
      setLoading(false);
    }
  }, [expenseId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading || !expense) {
    return (
      <DarkScreen>
        <ScreenHeader onBack={navigation.goBack} />
        <View style={styles.loading}>
          <ActivityIndicator color={dark.accentGreen} />
        </View>
      </DarkScreen>
    );
  }

  const payer = expense.paidBy;
  const iPaid = payer?._id === user?._id;
  const mySplit = expense.splits?.find((s) => s.user?._id === user?._id);
  const canSettleMine = mySplit && !mySplit.settled && !iPaid;

  const handleSettle = async (targetUserId) => {
    setSettling(true);
    try {
      setExpense(await settleExpense(expense._id, targetUserId));
    } catch (err) {
      Alert.alert('Could not settle', err.message);
    } finally {
      setSettling(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete expense', `Delete "${expense.description}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteExpense(expense._id);
            navigation.goBack();
          } catch (err) {
            Alert.alert('Could not delete', err.message);
          }
        },
      },
    ]);
  };

  return (
    <DarkScreen>
      <ScreenHeader
        title={expense.description}
        onBack={navigation.goBack}
        rightIcon="ellipsis-horizontal"
        onRightPress={confirmDelete}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.amount}>{usd(expense.amount)}</Text>
        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{CATEGORY_LABEL[expense.category] ?? 'General'}</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>
              {formatDate(expense.date)}, {formatTime(expense.date)}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Avatar name={payer?.name} size={38} solid />
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>
                {payer?.name}
                {iPaid ? ' (You)' : ''}
              </Text>
              <Text style={styles.cardMeta}>Paid the total amount</Text>
            </View>
            <Text style={styles.cardValue}>{usd(expense.amount)}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.cardRow}>
            <View style={styles.groupIcon}>
              <Ionicons name="people-outline" size={17} color={dark.text} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{expense.group?.name ?? 'Group'}</Text>
              <Text style={styles.cardMeta}>Shared group expense</Text>
            </View>
            {expense.group?.groupType === 'trip' && (
              <View style={styles.tripChip}>
                <Text style={styles.tripChipText}>Trip</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.sectionLabel}>
          Split between ({expense.splits?.length ?? 0} people)
        </Text>

        <View style={styles.card}>
          {expense.splits?.map((split, index) => {
            const isMe = split.user?._id === user?._id;
            const isPayerSplit = split.user?._id === payer?._id;
            return (
              <View key={split.user?._id ?? index}>
                {index > 0 && <View style={styles.divider} />}
                <View style={styles.cardRow}>
                  <Avatar name={split.user?.name} size={32} solid />
                  <Text style={styles.splitName} numberOfLines={1}>
                    {split.user?.name}
                    {isMe ? ' (You)' : ''}
                  </Text>
                  <Text style={styles.splitAmount}>{usd(split.amount)}</Text>

                  {split.settled || isPayerSplit ? (
                    <Text style={styles.paid}>✓ Paid</Text>
                  ) : iPaid ? (
                    <TouchableOpacity
                      onPress={() => handleSettle(split.user?._id)}
                      disabled={settling}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.markPaid}>Mark paid</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.pending}>Pending</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>Receipt attachment</Text>
        <View style={styles.receipt}>
          <Ionicons name="image-outline" size={22} color={dark.textMuted} />
          <Text style={styles.receiptText}>No receipt attached yet</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.editButton} activeOpacity={0.85} onPress={confirmDelete}>
          <Text style={styles.editText}>Delete Expense</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settleButton}
          activeOpacity={0.9}
          disabled={!canSettleMine || settling}
          onPress={() => handleSettle(undefined)}
        >
          <LinearGradient
            colors={
              canSettleMine ? [dark.accentBlue, dark.accentGreen] : ['#1B2429', '#1B2429']
            }
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.settleInner}
          >
            <Text style={[styles.settleText, !canSettleMine && styles.settleTextOff]}>
              {mySplit?.settled ? 'Settled' : iPaid ? 'You paid this' : 'Settle Up'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },

  amount: { color: dark.text, fontSize: 40, fontWeight: '800', textAlign: 'center', marginTop: spacing.sm },
  chipRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 8,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  chipText: { color: dark.textMuted, fontSize: 11, fontWeight: '600' },

  card: {
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.md,
  },
  cardBody: { flex: 1 },
  cardTitle: { color: dark.text, fontSize: 14, fontWeight: '700' },
  cardMeta: { color: dark.textMuted, fontSize: 11, marginTop: 2 },
  cardValue: { color: dark.text, fontSize: 15, fontWeight: '700' },
  divider: { height: 1, backgroundColor: dark.border },
  groupIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripChip: {
    backgroundColor: 'rgba(23,230,149,0.16)',
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  tripChipText: { color: dark.accentGreen, fontSize: 10, fontWeight: '700' },

  sectionLabel: {
    color: dark.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  splitName: { flex: 1, color: dark.text, fontSize: 13, fontWeight: '600' },
  splitAmount: { color: dark.text, fontSize: 14, fontWeight: '700' },
  paid: { color: dark.accentGreen, fontSize: 11, fontWeight: '600', width: 62, textAlign: 'right' },
  pending: { color: '#F5B342', fontSize: 11, fontWeight: '600', width: 62, textAlign: 'right' },
  markPaid: { color: dark.accentBlue, fontSize: 11, fontWeight: '700', width: 62, textAlign: 'right' },

  receipt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: dark.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  receiptText: { color: dark.textMuted, fontSize: 12 },

  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: dark.border,
  },
  editButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  editText: { color: dark.text, fontSize: 14, fontWeight: '600' },
  settleButton: { flex: 1 },
  settleInner: { borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  settleText: { color: '#04121C', fontSize: 14, fontWeight: '700' },
  settleTextOff: { color: dark.textMuted },
});

export default ExpenseDetailScreen;
