import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import DarkScreen from '../components/DarkScreen';
import MemberAvatars from '../components/MemberAvatars';
import GradientButton from '../components/GradientButton';
import { fetchTrips } from '../api/trips.api';
import { usd, formatDateRange } from '../utils/format';
import { tripFlag } from '../utils/tripFlag';
import { dark, radius, spacing } from '../theme';

const STATUS = {
  ongoing: { label: 'Happening now', color: '#17E695' },
  upcoming: { label: 'Upcoming', color: '#4A8CFF' },
  unscheduled: { label: 'No dates yet', color: '#F5B342' },
  past: { label: 'Completed', color: dark.textMuted },
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'ongoing', label: 'Now' },
  { key: 'past', label: 'Past' },
];

// Shortcuts into the trip's group, each opening the matching tab.
const QUICK_LINKS = [
  { tab: 'itinerary', icon: 'map-outline', label: 'Itinerary' },
  { tab: 'expenses', icon: 'cash-outline', label: 'Expenses' },
  { tab: 'tasks', icon: 'checkbox-outline', label: 'Tasks' },
  { tab: 'chat', icon: 'chatbubble-outline', label: 'Chat' },
];

// "in 12 days" / "tomorrow" / "Day 2 of 5" / "Ended 3 Sep"
const timingLabel = (trip) => {
  if (trip.status === 'ongoing') return `Day ${trip.dayNumber} of ${trip.totalDays}`;
  if (trip.status === 'upcoming') {
    if (trip.daysUntil === 1) return 'Starts tomorrow';
    if (trip.daysUntil < 14) return `In ${trip.daysUntil} days`;
    const weeks = Math.round(trip.daysUntil / 7);
    return weeks < 9 ? `In ${weeks} weeks` : `In ${Math.round(trip.daysUntil / 30)} months`;
  }
  if (trip.status === 'past') return 'Completed';
  return 'Dates not set';
};

/**
 * How prepared an upcoming trip is, out of 100: a plan for the days, somewhere
 * to sleep, and the to-do list getting done. Each missing piece is also named,
 * so the score tells the group what to do next rather than just judging them.
 */
const readinessOf = (trip) => {
  const hasPlan = trip.counts.itineraryDays > 0;
  const hasStay = trip.counts.stays > 0;
  const taskRatio = trip.tasks.total ? trip.tasks.done / trip.tasks.total : 0;
  const score = Math.round((hasPlan ? 35 : 0) + (hasStay ? 25 : 0) + taskRatio * 40);
  const checks = [
    { key: 'plan', done: hasPlan, label: hasPlan ? `${trip.counts.itineraryDays} day plan` : 'Plan itinerary', tab: 'itinerary' },
    { key: 'stay', done: hasStay, label: hasStay ? 'Stay booked' : 'Book a stay', tab: 'stays' },
    {
      key: 'tasks',
      done: trip.tasks.total > 0 && trip.tasks.done === trip.tasks.total,
      label: trip.tasks.total ? `${trip.tasks.done}/${trip.tasks.total} tasks` : 'Add tasks',
      tab: 'tasks',
    },
  ];
  return { score, checks };
};

// The bar on a card means different things by status: how far through the trip
// you are, or how ready you are for it.
const progressOf = (trip) => {
  if (trip.status === 'ongoing') return { value: trip.dayNumber / trip.totalDays, color: STATUS.ongoing.color };
  if (trip.status === 'past') return { value: 1, color: dark.textMuted };
  return { value: readinessOf(trip).score / 100, color: STATUS.upcoming.color };
};

const ProgressBar = ({ value, color, track = 'rgba(255,255,255,0.10)' }) => (
  <View style={[styles.track, { backgroundColor: track }]}>
    <View style={[styles.fill, { width: `${Math.max(4, Math.min(100, value * 100))}%`, backgroundColor: color }]} />
  </View>
);

const TripsScreen = ({ navigation }) => {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchTrips());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const trips = data?.trips ?? [];
  const stats = data?.stats;

  // The trip the screen leads with: the one happening now, else the next one.
  const featured = useMemo(
    () => trips.find((t) => t.status === 'ongoing') ?? trips.find((t) => t.status === 'upcoming') ?? null,
    [trips]
  );

  const counts = useMemo(() => {
    const out = { all: trips.length, upcoming: 0, ongoing: 0, past: 0 };
    for (const t of trips) if (out[t.status] !== undefined) out[t.status] += 1;
    return out;
  }, [trips]);

  const visible = useMemo(
    () => (filter === 'all' ? trips : trips.filter((t) => t.status === filter)),
    [trips, filter]
  );

  const openTrip = (trip, tab = 'chat') =>
    navigation.navigate('GroupChat', { groupId: trip._id, initialTab: tab });

  const planTrip = () => navigation.navigate('CreateGroup');

  if (!data && !error) {
    return (
      <DarkScreen>
        <View style={styles.center}>
          <ActivityIndicator color={dark.accentGreen} />
        </View>
      </DarkScreen>
    );
  }

  const renderHero = (trip) => {
    const readiness = readinessOf(trip);
    const isLive = trip.status === 'ongoing';
    const bar = progressOf(trip);
    return (
      <TouchableOpacity activeOpacity={0.92} onPress={() => openTrip(trip)}>
        <LinearGradient
          colors={isLive ? ['#0B3B2E', '#0A2233', '#0E1014'] : ['#12284A', '#0A2233', '#0E1014']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTop}>
            <View style={[styles.pill, { backgroundColor: `${STATUS[trip.status].color}26` }]}>
              {isLive && <View style={[styles.liveDot, { backgroundColor: STATUS.ongoing.color }]} />}
              <Text style={[styles.pillText, { color: STATUS[trip.status].color }]}>
                {isLive ? 'HAPPENING NOW' : 'NEXT TRIP'}
              </Text>
            </View>
            <MemberAvatars users={trip.members} size={26} max={4} />
          </View>

          <View style={styles.heroTitleRow}>
            <Text style={styles.heroFlag}>{tripFlag(trip.location)}</Text>
            <View style={styles.heroTitleBody}>
              <Text style={styles.heroName} numberOfLines={1}>
                {trip.name}
              </Text>
              <Text style={styles.heroMeta} numberOfLines={1}>
                {[trip.location, formatDateRange(trip.startDate, trip.endDate)].filter(Boolean).join('  ·  ')}
              </Text>
            </View>
          </View>

          {/* The big number: days to go, or which day of the trip it is. */}
          <View style={styles.countdownRow}>
            <Text style={styles.countdownValue}>{isLive ? trip.dayNumber : trip.daysUntil}</Text>
            <View>
              <Text style={styles.countdownUnit}>
                {isLive ? `of ${trip.totalDays} days` : trip.daysUntil === 1 ? 'day to go' : 'days to go'}
              </Text>
              <Text style={styles.countdownSub}>
                {isLive
                  ? trip.dayNumber === trip.totalDays
                    ? 'Last day. Make it count!'
                    : `${trip.totalDays - trip.dayNumber} more to enjoy`
                  : `${trip.totalDays}-day trip`}
              </Text>
            </View>
          </View>

          <View style={styles.heroBarRow}>
            <Text style={styles.heroBarLabel}>{isLive ? 'Trip progress' : 'Trip readiness'}</Text>
            <Text style={[styles.heroBarValue, { color: bar.color }]}>
              {isLive ? `${Math.round(bar.value * 100)}%` : `${readiness.score}%`}
            </Text>
          </View>
          <ProgressBar value={bar.value} color={bar.color} />

          {/* What is done and what is still missing, each a shortcut to fix it. */}
          {!isLive && (
            <View style={styles.checkRow}>
              {readiness.checks.map((check) => (
                <TouchableOpacity
                  key={check.key}
                  style={[styles.check, check.done && styles.checkDone]}
                  activeOpacity={0.8}
                  onPress={() => openTrip(trip, check.tab)}
                >
                  <Ionicons
                    name={check.done ? 'checkmark-circle' : 'ellipse-outline'}
                    size={13}
                    color={check.done ? '#17E695' : dark.textMuted}
                  />
                  <Text style={[styles.checkText, check.done && styles.checkTextDone]} numberOfLines={1}>
                    {check.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{usd(trip.spend.total)}</Text>
              <Text style={styles.heroStatLabel}>Group spent</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{usd(trip.spend.yourShare)}</Text>
              <Text style={styles.heroStatLabel}>Your share</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{trip.counts.photos}</Text>
              <Text style={styles.heroStatLabel}>Photos</Text>
            </View>
          </View>

          {trip.nextTask && (
            <TouchableOpacity
              style={styles.nextTask}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('TaskDetail', { taskId: trip.nextTask._id })}
            >
              <Ionicons name="flash" size={13} color="#F5B342" />
              <Text style={styles.nextTaskText} numberOfLines={1}>
                <Text style={styles.nextTaskLabel}>Next up  </Text>
                {trip.nextTask.title}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={dark.textMuted} />
            </TouchableOpacity>
          )}

          <View style={styles.quickRow}>
            {QUICK_LINKS.map((link) => (
              <TouchableOpacity
                key={link.tab}
                style={styles.quick}
                activeOpacity={0.8}
                onPress={() => openTrip(trip, link.tab)}
              >
                <Ionicons name={link.icon} size={17} color={dark.text} />
                <Text style={styles.quickText}>{link.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const renderCard = (trip) => {
    const look = STATUS[trip.status];
    const bar = progressOf(trip);
    return (
      <TouchableOpacity key={trip._id} style={styles.card} activeOpacity={0.88} onPress={() => openTrip(trip)}>
        <View style={styles.cardTop}>
          <View style={styles.flagTile}>
            <Text style={styles.flag}>{tripFlag(trip.location)}</Text>
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardName} numberOfLines={1}>
              {trip.name}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {trip.startDate
                ? [formatDateRange(trip.startDate, trip.endDate), trip.location].filter(Boolean).join('  ·  ')
                : `${trip.totalDays}-day trip${trip.location ? `  ·  ${trip.location}` : ''}`}
            </Text>
          </View>
          <View style={[styles.pill, { backgroundColor: `${look.color}22` }]}>
            <Text style={[styles.pillText, { color: look.color }]}>{timingLabel(trip).toUpperCase()}</Text>
          </View>
        </View>

        {trip.status !== 'unscheduled' && <ProgressBar value={bar.value} color={bar.color} />}

        <View style={styles.cardFooter}>
          <View style={styles.metaGroup}>
            <View style={styles.meta}>
              <Ionicons name="people-outline" size={13} color={dark.textMuted} />
              <Text style={styles.metaText}>{trip.members.length}</Text>
            </View>
            <View style={styles.meta}>
              <Ionicons name="map-outline" size={13} color={dark.textMuted} />
              <Text style={styles.metaText}>{trip.counts.itineraryDays}</Text>
            </View>
            <View style={styles.meta}>
              <Ionicons name="bed-outline" size={13} color={dark.textMuted} />
              <Text style={styles.metaText}>{trip.counts.stays}</Text>
            </View>
            <View style={styles.meta}>
              <Ionicons name="checkbox-outline" size={13} color={dark.textMuted} />
              <Text style={styles.metaText}>
                {trip.tasks.done}/{trip.tasks.total}
              </Text>
            </View>
            <View style={styles.meta}>
              <Ionicons name="images-outline" size={13} color={dark.textMuted} />
              <Text style={styles.metaText}>{trip.counts.photos}</Text>
            </View>
          </View>
          <View style={styles.cardSpend}>
            <Text style={styles.cardSpendValue}>{usd(trip.spend.yourShare)}</Text>
            <Text style={styles.cardSpendLabel}>your share</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // The featured trip already has the hero, so it is left out of "All".
  const listed = filter === 'all' && featured ? visible.filter((t) => t._id !== featured._id) : visible;

  return (
    <DarkScreen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={dark.accentGreen} />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerBody}>
            <Text style={styles.heading}>Trips</Text>
            <Text style={styles.subheading}>
              {trips.length
                ? stats.upcoming
                  ? `${stats.upcoming} adventure${stats.upcoming === 1 ? '' : 's'} on the horizon`
                  : 'Nothing planned yet. Where to next?'
                : 'Plan it together, split it fairly'}
            </Text>
          </View>
          <TouchableOpacity style={styles.addButton} activeOpacity={0.85} onPress={planTrip}>
            <Ionicons name="add" size={22} color="#04121C" />
          </TouchableOpacity>
        </View>

        {error && !trips.length ? (
          <View style={styles.empty}>
            <Ionicons name="cloud-offline-outline" size={30} color={dark.textMuted} />
            <Text style={styles.emptyTitle}>Could not load your trips</Text>
            <Text style={styles.emptyBody}>{error}</Text>
            <TouchableOpacity style={styles.retry} onPress={load} activeOpacity={0.85}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : !trips.length ? (
          <View style={styles.empty}>
            <LinearGradient colors={dark.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyIcon}>
              <Ionicons name="airplane" size={30} color="#04121C" />
            </LinearGradient>
            <Text style={styles.emptyTitle}>Your first trip starts here</Text>
            <Text style={styles.emptyBody}>
              Create a trip, invite your friends, and keep the itinerary, stays, tasks and every shared
              expense in one place.
            </Text>
            <GradientButton title="Plan a trip" onPress={planTrip} style={styles.emptyButton} />
          </View>
        ) : (
          <>
            {featured && renderHero(featured)}

            <View style={styles.statsRow}>
              {[
                { icon: 'airplane-outline', value: stats.totalTrips, label: 'Trips' },
                { icon: 'sunny-outline', value: stats.daysTravelled, label: 'Days away' },
                { icon: 'location-outline', value: stats.places, label: 'Places' },
                { icon: 'wallet-outline', value: usd(stats.totalSpent).replace(/\.00$/, ''), label: 'Spent' },
              ].map((stat) => (
                <View key={stat.label} style={styles.stat}>
                  <Ionicons name={stat.icon} size={15} color={dark.accentGreen} />
                  <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                    {stat.value}
                  </Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
              {FILTERS.map((option) => {
                const active = filter === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.filter, active && styles.filterActive]}
                    activeOpacity={0.8}
                    onPress={() => setFilter(option.key)}
                  >
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>{option.label}</Text>
                    <Text style={[styles.filterCount, active && styles.filterTextActive]}>
                      {counts[option.key]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {listed.map(renderCard)}

            {!listed.length && (
              <Text style={styles.noneText}>
                {filter === 'all'
                  ? 'That is your only trip so far. Tap + to plan another.'
                  : `No ${FILTERS.find((f) => f.key === filter).label.toLowerCase()} trips.`}
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl + spacing.lg },

  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  headerBody: { flex: 1 },
  heading: { color: dark.text, fontSize: 30, fontWeight: '800' },
  subheading: { color: dark.textMuted, fontSize: 13, marginTop: 2 },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: dark.button,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ---- hero
  hero: {
    borderRadius: radius.lg + 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: spacing.md + 4,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  pillText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, marginTop: spacing.md },
  heroFlag: { fontSize: 34 },
  heroTitleBody: { flex: 1 },
  heroName: { color: dark.text, fontSize: 22, fontWeight: '800' },
  heroMeta: { color: 'rgba(244,247,250,0.72)', fontSize: 13, marginTop: 2 },

  countdownRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, marginTop: spacing.md },
  countdownValue: { color: dark.text, fontSize: 56, fontWeight: '800', lineHeight: 60 },
  countdownUnit: { color: dark.text, fontSize: 16, fontWeight: '700' },
  countdownSub: { color: 'rgba(244,247,250,0.65)', fontSize: 12, marginTop: 2 },

  heroBarRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md, marginBottom: 6 },
  heroBarLabel: { color: 'rgba(244,247,250,0.72)', fontSize: 12, fontWeight: '600' },
  heroBarValue: { fontSize: 12, fontWeight: '800' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },

  checkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm + 4 },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  checkDone: { borderColor: 'rgba(23,230,149,0.35)', backgroundColor: 'rgba(23,230,149,0.08)' },
  checkText: { color: dark.textMuted, fontSize: 11, fontWeight: '600' },
  checkTextDone: { color: dark.text },

  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 4,
    marginTop: spacing.md,
  },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatValue: { color: dark.text, fontSize: 15, fontWeight: '800' },
  heroStatLabel: { color: 'rgba(244,247,250,0.6)', fontSize: 10.5, marginTop: 2 },
  heroStatDivider: { width: 1, height: 26, backgroundColor: 'rgba(255,255,255,0.12)' },

  nextTask: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(245,179,66,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(245,179,66,0.28)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.sm + 4,
  },
  nextTaskText: { flex: 1, color: dark.text, fontSize: 13, fontWeight: '600' },
  nextTaskLabel: { color: '#F5B342', fontWeight: '800' },

  quickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  quick: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 3,
  },
  quickText: { color: dark.text, fontSize: 10.5, fontWeight: '600' },

  // ---- stats
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  stat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: 4,
  },
  statValue: { color: dark.text, fontSize: 17, fontWeight: '800', marginTop: 5 },
  statLabel: { color: dark.textMuted, fontSize: 10.5, marginTop: 1 },

  // ---- filters
  filters: { marginTop: spacing.lg, marginBottom: spacing.sm + 4, flexGrow: 0 },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 18,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: 7,
    marginRight: spacing.sm,
  },
  filterActive: { borderColor: dark.accentGreen, backgroundColor: 'rgba(0,196,208,0.10)' },
  filterText: { color: dark.textMuted, fontSize: 13, fontWeight: '600' },
  filterCount: { color: dark.textMuted, fontSize: 11, fontWeight: '800' },
  filterTextActive: { color: dark.accentGreen },

  // ---- list cards
  card: {
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg + 4,
    padding: spacing.md,
    marginBottom: spacing.sm + 4,
    gap: spacing.sm + 4,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  flagTile: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flag: { fontSize: 23 },
  cardBody: { flex: 1 },
  cardName: { color: dark.text, fontSize: 16, fontWeight: '700' },
  cardMeta: { color: dark.textMuted, fontSize: 12, marginTop: 2 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: dark.textMuted, fontSize: 12, fontWeight: '600' },
  cardSpend: { alignItems: 'flex-end' },
  cardSpendValue: { color: dark.text, fontSize: 14, fontWeight: '800' },
  cardSpendLabel: { color: dark.textMuted, fontSize: 10 },
  noneText: { color: dark.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: spacing.lg },

  // ---- empty / error
  empty: { alignItems: 'center', paddingTop: spacing.xl * 2, paddingHorizontal: spacing.md },
  emptyIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: dark.text, fontSize: 19, fontWeight: '800', marginTop: spacing.lg, textAlign: 'center' },
  emptyBody: {
    color: dark.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  emptyButton: { alignSelf: 'stretch', marginTop: spacing.lg },
  retry: {
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.md,
  },
  retryText: { color: dark.text, fontSize: 13, fontWeight: '700' },
});

export default TripsScreen;
