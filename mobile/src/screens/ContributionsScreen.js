import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import DarkScreen from '../components/DarkScreen';
import Avatar from '../components/Avatar';
import MemberAvatars from '../components/MemberAvatars';
import { fetchGroup, fetchExpenses, fetchContributions } from '../api/groups.api';
import { useAuth } from '../context/AuthContext';
import { dark, radius, spacing } from '../theme';
import { usd } from '../utils/format';

const SEGMENTS = ['Overview', 'Expenses', 'Tasks'];

const BADGES = {
  'contributed-extra': { label: 'Contributed Extra', color: '#4A7DF7' },
  balanced: { label: 'Balanced', color: '#C7D1DB' },
  'owes-effort': { label: 'Owes more effort', color: '#F5B342' },
  'owes-balance': { label: 'Owes balance', color: '#F97362' },
};

const CATEGORY_ICONS = {
  stay: 'bed-outline',
  housing: 'bed-outline',
  food: 'restaurant-outline',
  travel: 'airplane-outline',
  transport: 'subway-outline',
  fun: 'ticket-outline',
  entertainment: 'ticket-outline',
  shopping: 'cart-outline',
  utilities: 'flash-outline',
};

const shortDate = (value) =>
  new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const firstName = (name = '') => name.split(' ')[0];

// Score ring for the Group Balance Status card.
const ScoreRing = ({ score }) => {
  const R = 26;
  const C = 2 * Math.PI * R;
  const filled = (C * Math.min(100, Math.max(0, score))) / 100;
  return (
    <View style={styles.ringWrap}>
      <Svg width={68} height={68}>
        <Circle cx={34} cy={34} r={R} stroke="rgba(255,255,255,0.10)" strokeWidth={6} fill="none" />
        <Circle
          cx={34}
          cy={34}
          r={R}
          stroke={dark.accentGreen}
          strokeWidth={6}
          fill="none"
          strokeDasharray={`${filled} ${C}`}
          strokeLinecap="round"
          transform="rotate(-90 34 34)"
        />
      </Svg>
      <Text style={styles.ringText}>{score}%</Text>
    </View>
  );
};

// Thin two-tone progress bar used in the member breakdown.
const StatBar = ({ ratio, color }) => (
  <View style={styles.barTrack}>
    <View
      style={[
        styles.barFill,
        { width: `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`, backgroundColor: color },
      ]}
    />
  </View>
);

const ContributionsScreen = ({ route, navigation }) => {
  const { groupId } = route.params;
  const { user } = useAuth();
  const currentUserId = user?._id;

  const [segment, setSegment] = useState('Overview');
  const [group, setGroup] = useState(null);
  const [data, setData] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const [groupData, contributions, expenseData] = await Promise.all([
            fetchGroup(groupId),
            fetchContributions(groupId),
            fetchExpenses(groupId),
          ]);
          if (!active) return;
          setGroup(groupData);
          setData(contributions);
          setExpenses(expenseData);
        } catch (err) {
          Alert.alert('Could not load contributions', err.message);
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [groupId])
  );

  if (loading || !data) {
    return (
      <DarkScreen>
        <View style={styles.loading}>
          <ActivityIndicator color={dark.accentGreen} />
        </View>
      </DarkScreen>
    );
  }

  const maxPaid = Math.max(1, ...data.members.map((m) => m.expensesPaid));

  const ledgerChip = (expense) => {
    const payerId = expense.paidBy?._id ?? expense.paidBy;
    const isPayer = payerId === currentUserId;
    if (isPayer) {
      const outstanding = expense.splits
        .filter((s) => (s.user?._id ?? s.user) !== currentUserId && !s.settled)
        .reduce((sum, s) => sum + s.amount, 0);
      return outstanding > 0.005
        ? { label: `Owed ${usd(outstanding)}`, tone: 'green' }
        : { label: 'Settled', tone: 'green' };
    }
    const mine = expense.splits.find((s) => (s.user?._id ?? s.user) === currentUserId);
    if (mine && !mine.settled) {
      return {
        label: `Owes ${firstName(expense.paidBy?.name)} ${usd(mine.amount)}`,
        tone: 'red',
      };
    }
    return { label: 'Settled', tone: 'green' };
  };

  const renderOverview = () => (
    <>
      <View style={styles.balanceCard}>
        <View style={styles.balanceHeader}>
          <View style={styles.balanceHeaderText}>
            <Text style={styles.balanceTitle}>Group Balance Status</Text>
            <Text style={styles.balanceMeta}>
              Calculated automatically from spending & task loads
            </Text>
          </View>
          <View style={styles.fairChip}>
            <Text style={styles.fairChipText}>{data.statusLabel}</Text>
          </View>
        </View>

        <View style={styles.balanceBody}>
          <ScoreRing score={data.score} />
          <View style={styles.balanceCopy}>
            <Text style={styles.balanceHeadline}>{data.headline}</Text>
            <Text style={styles.balanceBlurb}>
              {data.adjustmentsNeeded > 0
                ? `Only ${usd(data.adjustmentsNeeded)} in adjustments needed to achieve ideal equity within the group.`
                : 'Everyone is fully settled — great teamwork!'}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionLabel}>MEMBER CONTRIBUTION BREAKDOWN</Text>

      {data.members.map((member) => {
        const badge = BADGES[member.badge] ?? BADGES.balanced;
        return (
          <View key={member.user._id} style={styles.memberCard}>
            <View style={styles.memberTop}>
              <Avatar name={member.user.name} size={30} solid />
              <Text style={styles.memberName} numberOfLines={1}>
                {member.user.name}
              </Text>
              <View style={[styles.badge, { backgroundColor: `${badge.color}1F` }]}>
                <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
              </View>
            </View>

            <View style={styles.memberStats}>
              <View style={styles.memberStat}>
                <View style={styles.memberStatHeader}>
                  <Text style={styles.memberStatLabel}>Expenses paid</Text>
                  <Text style={styles.memberStatValue}>{usd(member.expensesPaid)}</Text>
                </View>
                <StatBar ratio={member.expensesPaid / maxPaid} color={dark.accentGreen} />
              </View>
              <View style={styles.memberStat}>
                <View style={styles.memberStatHeader}>
                  <Text style={styles.memberStatLabel}>Tasks done</Text>
                  <Text style={styles.memberStatValue}>
                    {member.tasksDone} / {member.tasksAssigned}
                  </Text>
                </View>
                <StatBar
                  ratio={member.tasksAssigned ? member.tasksDone / member.tasksAssigned : 0}
                  color={dark.accentBlue}
                />
              </View>
            </View>
          </View>
        );
      })}
    </>
  );

  const renderExpenses = () => (
    <>
      {data.me && (
        <View style={styles.youCard}>
          <Text style={styles.youText}>
            You&apos;ve paid <Text style={styles.youPaid}>{usd(data.me.expensesPaid)}</Text> · Your
            fair share <Text style={styles.youShare}>{usd(data.me.fairShare)}</Text>
          </Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>SETTLE OR SPLIT LEDGER</Text>

      {expenses.map((expense) => {
        const chip = ledgerChip(expense);
        const payerId = expense.paidBy?._id ?? expense.paidBy;
        const payerLabel =
          payerId === currentUserId
            ? `You (${firstName(expense.paidBy?.name)})`
            : expense.paidBy?.name ?? 'Someone';
        const splitUsers = expense.splits.map((s) => s.user).filter(Boolean);

        return (
          <TouchableOpacity
            key={expense._id}
            style={styles.ledgerCard}
            activeOpacity={0.85}
            onPress={() =>
              navigation.navigate('ExpenseDetail', {
                expenseId: expense._id,
                groupName: group?.name,
              })
            }
          >
            <View style={styles.ledgerTop}>
              <View style={styles.ledgerIcon}>
                <Ionicons
                  name={CATEGORY_ICONS[expense.category] ?? 'receipt-outline'}
                  size={16}
                  color={dark.accentGreen}
                />
              </View>
              <View style={styles.ledgerBody}>
                <Text style={styles.ledgerTitle} numberOfLines={1}>
                  {expense.description}
                </Text>
                <Text style={styles.ledgerMeta}>
                  Paid by {payerLabel} · {shortDate(expense.date ?? expense.createdAt)}
                </Text>
              </View>
              <Text style={styles.ledgerAmount}>{usd(expense.amount)}</Text>
            </View>

            <View style={styles.ledgerFooter}>
              <View style={styles.splitRow}>
                <Text style={styles.splitLabel}>Split:</Text>
                <MemberAvatars users={splitUsers} size={16} max={4} />
              </View>
              <View
                style={[
                  styles.ledgerChip,
                  chip.tone === 'red' ? styles.ledgerChipRed : styles.ledgerChipGreen,
                ]}
              >
                <Text
                  style={[
                    styles.ledgerChipText,
                    { color: chip.tone === 'red' ? '#F97362' : dark.accentGreen },
                  ]}
                >
                  {chip.label}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}

      {!expenses.length && (
        <Text style={styles.empty}>No expenses in this group yet.</Text>
      )}
    </>
  );

  const renderTasks = () => (
    <>
      <View style={styles.youCard}>
        <Text style={styles.youText}>
          <Text style={styles.youPaid}>{data.tasksCompleted}</Text> of{' '}
          <Text style={styles.youShare}>{data.tasksTotal}</Text> group tasks completed
        </Text>
      </View>

      <Text style={styles.sectionLabel}>EFFORT BREAKDOWN</Text>

      {data.members.map((member) => (
        <View key={member.user._id} style={styles.taskCard}>
          <Avatar name={member.user.name} size={30} solid />
          <View style={styles.taskBody}>
            <View style={styles.memberStatHeader}>
              <Text style={styles.memberName} numberOfLines={1}>
                {member.user.name}
              </Text>
              <Text style={styles.memberStatValue}>
                {member.tasksDone} / {member.tasksAssigned}
              </Text>
            </View>
            <StatBar
              ratio={member.tasksAssigned ? member.tasksDone / member.tasksAssigned : 0}
              color={dark.accentBlue}
            />
          </View>
        </View>
      ))}
    </>
  );

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
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Contributions</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {group?.name ?? ''}
          </Text>
        </View>
        <MemberAvatars users={group?.members ?? []} size={22} max={4} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryColumn}>
            <Text style={styles.summaryLabel}>Total Shared Expenses</Text>
            <Text style={styles.summaryMoney}>{usd(data.totalExpenses)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryColumn}>
            <Text style={styles.summaryLabel}>Tasks Completed</Text>
            <Text style={styles.summaryTasks}>{data.tasksCompleted} Tasks</Text>
          </View>
        </View>

        <View style={styles.segmentRow}>
          {SEGMENTS.map((option) => {
            const active = segment === option;
            return (
              <TouchableOpacity
                key={option}
                style={[styles.segment, active && styles.segmentActive]}
                activeOpacity={0.8}
                onPress={() => setSegment(option)}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {option}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {segment === 'Overview' && renderOverview()}
        {segment === 'Expenses' && renderExpenses()}
        {segment === 'Tasks' && renderTasks()}
      </ScrollView>
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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
  headerText: { flex: 1, marginLeft: spacing.md },
  headerTitle: { color: dark.text, fontSize: 19, fontWeight: '800' },
  headerSubtitle: { color: dark.textMuted, fontSize: 11, marginTop: 1 },

  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },

  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  summaryColumn: { flex: 1 },
  summaryLabel: { color: dark.textMuted, fontSize: 11 },
  summaryMoney: { color: '#2EE6A8', fontSize: 22, fontWeight: '800', marginTop: 4 },
  summaryTasks: { color: dark.accentBlue, fontSize: 22, fontWeight: '800', marginTop: 4 },
  summaryDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: dark.border,
    marginHorizontal: spacing.md,
  },

  segmentRow: {
    flexDirection: 'row',
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 20,
    padding: 3,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 1,
    borderRadius: 17,
  },
  segmentActive: { backgroundColor: 'rgba(255,255,255,0.10)' },
  segmentText: { color: dark.textMuted, fontSize: 13, fontWeight: '600' },
  segmentTextActive: { color: dark.text, fontWeight: '700' },

  balanceCard: {
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg + 4,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  balanceHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  balanceHeaderText: { flex: 1, marginRight: spacing.sm },
  balanceTitle: { color: dark.text, fontSize: 15, fontWeight: '800' },
  balanceMeta: { color: dark.textMuted, fontSize: 10, marginTop: 2 },
  fairChip: {
    backgroundColor: 'rgba(0,196,208,0.14)',
    borderRadius: 10,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  fairChipText: { color: dark.accentGreen, fontSize: 10, fontWeight: '800' },
  balanceBody: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  ringWrap: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center' },
  ringText: { position: 'absolute', color: dark.text, fontSize: 14, fontWeight: '800' },
  balanceCopy: { flex: 1, marginLeft: spacing.md },
  balanceHeadline: { color: dark.text, fontSize: 14, fontWeight: '700' },
  balanceBlurb: { color: dark.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },

  sectionLabel: {
    color: dark.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    marginBottom: spacing.sm,
  },

  memberCard: {
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm + 2,
  },
  memberTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  memberName: { flex: 1, color: dark.text, fontSize: 14, fontWeight: '700' },
  badge: { borderRadius: 12, paddingHorizontal: spacing.sm + 2, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '800' },

  memberStats: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  memberStat: { flex: 1 },
  memberStatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  memberStatLabel: { color: dark.textMuted, fontSize: 10 },
  memberStatValue: { color: dark.text, fontSize: 11, fontWeight: '700' },
  barTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  barFill: { height: 4, borderRadius: 2 },

  youCard: {
    backgroundColor: 'rgba(0,196,208,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,196,208,0.25)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 3,
    marginBottom: spacing.md,
  },
  youText: { color: dark.textMuted, fontSize: 12 },
  youPaid: { color: '#2EE6A8', fontWeight: '800' },
  youShare: { color: dark.accentBlue, fontWeight: '800' },

  ledgerCard: {
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm + 2,
  },
  ledgerTop: { flexDirection: 'row', alignItems: 'center' },
  ledgerIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(0,196,208,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm + 2,
  },
  ledgerBody: { flex: 1, marginRight: spacing.sm },
  ledgerTitle: { color: dark.text, fontSize: 13, fontWeight: '700' },
  ledgerMeta: { color: dark.textMuted, fontSize: 10, marginTop: 2 },
  ledgerAmount: { color: dark.text, fontSize: 15, fontWeight: '800' },
  ledgerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm + 2,
  },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  splitLabel: { color: dark.textMuted, fontSize: 10 },
  ledgerChip: { borderRadius: 10, paddingHorizontal: spacing.sm + 2, paddingVertical: 3 },
  ledgerChipGreen: { backgroundColor: 'rgba(0,196,208,0.12)' },
  ledgerChipRed: { backgroundColor: 'rgba(249,115,98,0.14)' },
  ledgerChipText: { fontSize: 10, fontWeight: '800' },

  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  taskBody: { flex: 1 },

  empty: {
    color: dark.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});

export default ContributionsScreen;
