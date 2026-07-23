import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DarkScreen from '../components/DarkScreen';
import Avatar from '../components/Avatar';
import SectionHeader from '../components/SectionHeader';
import { useAuth } from '../context/AuthContext';
import { profileDefaults } from '../data/profile';
import { netBalance, quickActions, upcomingTrips, tasks, recentExpenses } from '../data/dashboard';
import { dark, radius, spacing } from '../theme';

const usd = (value) =>
  `$${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

const HomeScreen = ({ navigation }) => {
  const { user } = useAuth();
  const name = user?.name || profileDefaults.name;

  const runQuickAction = (key) => {
    if (key === 'create-group' || key === 'create-trip') navigation.navigate('CreateGroup');
    else if (key === 'invite-friend') navigation.navigate('GroupAction');
    else navigation.navigate('Groups');
  };

  return (
    <DarkScreen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Avatar name={name} size={44} />
          <View style={styles.topText}>
            <Text style={styles.greeting}>{greeting()} 👋</Text>
            <Text style={styles.name}>{name}</Text>
          </View>
          <TouchableOpacity style={styles.bell} activeOpacity={0.8}>
            <Ionicons name="notifications-outline" size={20} color={dark.text} />
          </TouchableOpacity>
        </View>

        <LinearGradient
          colors={[dark.accentBlue, dark.accentGreen]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          <Text style={styles.balanceLabel}>Net Balance</Text>
          <Text style={styles.balanceValue}>{usd(netBalance.total)}</Text>
          <Text style={styles.balanceCaption}>{netBalance.caption}</Text>

          <View style={styles.pillRow}>
            <View style={styles.pill}>
              <View style={[styles.pillIcon, { backgroundColor: 'rgba(23,230,149,0.30)' }]}>
                <Ionicons name="arrow-up" size={13} color="#0B3D2B" />
              </View>
              <View>
                <Text style={styles.pillLabel}>You owe</Text>
                <Text style={styles.pillValue}>{usd(netBalance.youOwe)}</Text>
              </View>
            </View>

            <View style={styles.pill}>
              <View style={[styles.pillIcon, { backgroundColor: 'rgba(248,113,113,0.35)' }]}>
                <Ionicons name="arrow-down" size={13} color="#5B1414" />
              </View>
              <View>
                <Text style={styles.pillLabel}>Owed to you</Text>
                <Text style={styles.pillValue}>{usd(netBalance.owedToYou)}</Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        <SectionHeader title="Quick Actions" style={styles.sectionSpacing} />
        <View style={styles.actionRow}>
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.key}
              style={styles.actionTile}
              activeOpacity={0.8}
              onPress={() => runQuickAction(action.key)}
            >
              <View style={[styles.actionIcon, { backgroundColor: `${action.tint}22` }]}>
                <Ionicons name={action.icon} size={20} color={action.tint} />
              </View>
              <Text style={styles.actionLabel} numberOfLines={2}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <SectionHeader
          title="Upcoming Trips"
          actionLabel="Plan new"
          actionIcon="chevron-down"
          onActionPress={() => navigation.navigate('CreateGroup')}
          style={styles.sectionSpacing}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
          {upcomingTrips.map((trip) => (
            <View key={trip.id} style={styles.tripCard}>
              <View style={styles.tripTop}>
                <Text style={styles.flag}>{trip.flag}</Text>
                {trip.amount != null && <Text style={styles.tripAmount}>{usd(trip.amount)}</Text>}
              </View>
              <Text style={styles.tripName}>{trip.name}</Text>
              <Text style={styles.tripDates}>{trip.dates}</Text>
              <View style={styles.tripFooter}>
                <Text style={styles.tripMeta}>{trip.members} members</Text>
                {trip.status !== 'active' && (
                  <View style={styles.statusChip}>
                    <Text style={styles.statusText}>{trip.status}</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </ScrollView>

        <SectionHeader
          title="Tasks Overview"
          actionLabel="See All"
          onActionPress={() => navigation.navigate('Trips')}
          style={styles.sectionSpacing}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
          {tasks.map((task) => (
            <View key={task.id} style={styles.taskCard}>
              <View style={[styles.tag, { backgroundColor: `${task.tagColor}22` }]}>
                <Text style={[styles.tagText, { color: task.tagColor }]}>{task.tag}</Text>
              </View>
              <View style={styles.taskBody}>
                <View style={styles.taskTextWrap}>
                  <Text style={styles.taskTitle} numberOfLines={1}>
                    {task.title}
                  </Text>
                  <Text style={styles.taskMeta}>{task.meta}</Text>
                </View>
                <View style={[styles.taskDot, task.done && styles.taskDotDone]} />
              </View>
            </View>
          ))}
        </ScrollView>

        <SectionHeader
          title="Recent Expenses"
          actionLabel="See all"
          actionIcon="chevron-forward"
          onActionPress={() => navigation.navigate('Expenses')}
          style={styles.sectionSpacing}
        />
        {recentExpenses.map((expense) => (
          <View key={expense.id} style={styles.expenseRow}>
            <View style={styles.expenseIcon}>
              <Ionicons name={expense.icon} size={18} color={dark.text} />
            </View>
            <View style={styles.expenseBody}>
              <Text style={styles.expenseTitle}>{expense.title}</Text>
              <Text style={styles.expenseMeta}>{expense.meta}</Text>
            </View>
            <View style={styles.expenseRight}>
              <Text style={styles.expenseAmount}>{usd(expense.amount)}</Text>
              {expense.settled ? (
                <Text style={styles.settled}>✓ Settled</Text>
              ) : (
                <Text style={styles.share}>Your: {usd(expense.share)}</Text>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },

  topRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  topText: { flex: 1, marginLeft: spacing.md },
  greeting: { color: dark.textMuted, fontSize: 13 },
  name: { color: dark.text, fontSize: 20, fontWeight: '700', marginTop: 2 },
  bell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  balanceCard: { borderRadius: radius.lg + 8, padding: spacing.lg, marginTop: spacing.sm },
  balanceLabel: { color: 'rgba(4,18,28,0.7)', fontSize: 12, fontWeight: '600' },
  balanceValue: { color: '#04121C', fontSize: 34, fontWeight: '800', marginTop: 2 },
  balanceCaption: { color: 'rgba(4,18,28,0.75)', fontSize: 12, marginTop: 2 },
  pillRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(4,18,28,0.18)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
  },
  pillIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLabel: { color: 'rgba(4,18,28,0.75)', fontSize: 10, fontWeight: '600' },
  pillValue: { color: '#04121C', fontSize: 15, fontWeight: '800' },

  sectionSpacing: { marginTop: spacing.lg },

  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionTile: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  actionLabel: { color: dark.textMuted, fontSize: 10, fontWeight: '600', textAlign: 'center' },

  hList: { gap: spacing.sm, paddingRight: spacing.lg },
  tripCard: {
    width: 190,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  tripTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flag: { fontSize: 20 },
  tripAmount: { color: dark.accentGreen, fontSize: 18, fontWeight: '800' },
  tripName: { color: dark.text, fontSize: 15, fontWeight: '700', marginTop: spacing.sm },
  tripDates: { color: dark.textMuted, fontSize: 12, marginTop: 2 },
  tripFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  tripMeta: { color: dark.textMuted, fontSize: 11 },
  statusChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  statusText: { color: dark.textMuted, fontSize: 10, fontWeight: '600' },

  taskCard: {
    width: 190,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  tag: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  tagText: { fontSize: 10, fontWeight: '700' },
  taskBody: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  taskTextWrap: { flex: 1 },
  taskTitle: { color: dark.text, fontSize: 14, fontWeight: '600' },
  taskMeta: { color: dark.textMuted, fontSize: 11, marginTop: 2 },
  taskDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: dark.accentBlue },
  taskDotDone: { backgroundColor: dark.accentGreen },

  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  expenseIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  expenseBody: { flex: 1 },
  expenseTitle: { color: dark.text, fontSize: 14, fontWeight: '600' },
  expenseMeta: { color: dark.textMuted, fontSize: 11, marginTop: 2 },
  expenseRight: { alignItems: 'flex-end' },
  expenseAmount: { color: dark.text, fontSize: 15, fontWeight: '700' },
  settled: { color: dark.accentGreen, fontSize: 11, marginTop: 2 },
  share: { color: '#F87171', fontSize: 11, marginTop: 2 },
});

export default HomeScreen;
