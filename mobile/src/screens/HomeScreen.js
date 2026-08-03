import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import DarkScreen from '../components/DarkScreen';
import NetBalanceBg from '../assets/net-balance-bg.svg';
import { fetchNotifications } from '../api/notifications.api';
import { fetchGroups } from '../api/groups.api';
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
  const [hasUnread, setHasUnread] = useState(false);

  // Refresh the bell dot whenever the dashboard regains focus.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const notifications = await fetchNotifications();
          if (active) setHasUnread(notifications.some((n) => !n.read));
        } catch {
          // Bell dot is best-effort; skip on network hiccups.
        }
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  const runQuickAction = (key) => {
    if (key === 'create-group' || key === 'create-trip') navigation.navigate('CreateGroup');
    else if (key === 'invite-friend') navigation.navigate('GroupAction');
    else navigation.navigate('Groups');
  };

  // Opens the contribution dashboard for the most recently active group.
  const openContributions = async () => {
    try {
      const groups = await fetchGroups();
      if (!groups.length) {
        Alert.alert('No groups yet', 'Create or join a group to see contributions.');
        return;
      }
      navigation.navigate('Contributions', { groupId: groups[0]._id });
    } catch (err) {
      Alert.alert('Could not open contributions', err.message);
    }
  };

  return (
    <DarkScreen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.upperBg}>
          <View style={styles.topRow}>
          <Avatar name={name} size={44} />
          <View style={styles.topText}>
            <Text style={styles.greeting}>{greeting()} 👋</Text>
            <Text style={styles.name}>{name}</Text>
          </View>
          <TouchableOpacity
            style={styles.bell}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Notifications')}
          >
            <Ionicons name="notifications-outline" size={20} color={dark.text} />
            {hasUnread && <View style={styles.bellDot} />}
          </TouchableOpacity>
        </View>

        <View style={styles.balanceCard}>
          <NetBalanceBg
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid slice"
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.balanceBody}>
            <Text style={styles.balanceLabel}>Net Balance</Text>
            <Text style={styles.balanceValue}>{usd(netBalance.total)}</Text>
            <Text style={styles.balanceCaption}>{netBalance.caption}</Text>
          </View>

          <View style={styles.statRow}>
            <View style={styles.stat}>
              <View style={styles.statIcon}>
                <Ionicons name="trending-up" size={15} color={dark.accentGreen} />
              </View>
              <View>
                <Text style={styles.statLabel}>YOU OWE</Text>
                <Text style={styles.statValue}>{usd(netBalance.youOwe)}</Text>
              </View>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.stat}>
              <View style={styles.statIcon}>
                <Ionicons name="trending-down" size={15} color="#F87171" />
              </View>
              <View>
                <Text style={styles.statLabel}>OWED TO YOU</Text>
                <Text style={styles.statValue}>{usd(netBalance.owedToYou)}</Text>
              </View>
            </View>
          </View>
        </View>

        <SectionHeader title="Quick Actions" style={styles.sectionSpacing} />
        <View style={styles.actionRow}>
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.key}
              style={styles.action}
              activeOpacity={0.8}
              onPress={() => runQuickAction(action.key)}
            >
              <View
                style={[
                  styles.actionTile,
                  { backgroundColor: `${action.tint}14`, borderColor: `${action.tint}3D` },
                ]}
              >
                <Ionicons name={action.icon} size={22} color={action.tint} />
              </View>
              <Text style={styles.actionLabel} numberOfLines={2}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.contribCard}
          activeOpacity={0.85}
          onPress={openContributions}
        >
          <Ionicons name="heart-outline" size={20} color={dark.accentGreen} />
          <View style={styles.contribBody}>
            <Text style={styles.contribTitle}>View Contributions</Text>
            <Text style={styles.contribMeta}>See community giving & impact</Text>
          </View>
          <View style={styles.contribButton}>
            <Text style={styles.contribButtonText}>View</Text>
            <Ionicons name="flash" size={12} color="#04121C" />
          </View>
        </TouchableOpacity>
        </View>

        <View style={styles.lowerBg}>
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
        </View>
      </ScrollView>
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl },
  upperBg: {flex: 1, backgroundColor: dark.card, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg},
  lowerBg: {flex: 1, paddingHorizontal: spacing.lg},
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
    backgroundColor: dark.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: dark.accentGreen,
    borderWidth: 1.5,
    borderColor: dark.card,
  },

  balanceCard: {
    borderRadius: radius.lg + 8,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  balanceBody: {
    alignItems: 'center',
    paddingTop: spacing.lg + 4,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  balanceValue: { color: '#FFFFFF', fontSize: 36, fontWeight: '800', marginTop: 4 },
  balanceCaption: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4 },

  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  stat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0B0E12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  statValue: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', marginTop: 1 },
  statDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginHorizontal: spacing.md,
  },

  sectionSpacing: { marginTop: spacing.lg },

  actionRow: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1, alignItems: 'center' },
  actionTile: {
    width: 58,
    height: 58,
    borderRadius: radius.lg + 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  actionLabel: { color: dark.textMuted, fontSize: 10, fontWeight: '600', textAlign: 'center' },

  contribCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: dark.card2,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    marginTop: spacing.md,
  },
  contribBody: { flex: 1 },
  contribTitle: { color: dark.text, fontSize: 13, fontWeight: '700' },
  contribMeta: { color: dark.textMuted, fontSize: 10, marginTop: 1 },
  contribButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: dark.button,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 1,
  },
  contribButtonText: { color: '#04121C', fontSize: 12, fontWeight: '800' },

  hList: { gap: spacing.sm, paddingRight: spacing.lg },
  tripCard: {
    width: 190,
    backgroundColor: dark.card,
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
    backgroundColor: dark.card,
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
    backgroundColor: dark.card,
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
