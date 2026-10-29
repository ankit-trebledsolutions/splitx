import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, useStyles, useTheme } from '../../theme';
import ItineraryProgressStrip from '../../components/ItineraryProgressStrip';
import ItineraryRoadmap from '../../components/ItineraryRoadmap';
import useMinuteTick from '../../hooks/useMinuteTick';
import { buildItineraryProgress, nextDoneFor, STOP_STATUS } from '../../utils/itineraryProgress';

const shortDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;

// The tick circle at the start of an activity row: filled once the stop is
// done (by a tap or by the clock), amber for the stop the group is at now.
const StopMark = ({ status }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  switch (status) {
    case STOP_STATUS.done:
      return (
        <View style={[styles.mark, styles.markDone]}>
          <Ionicons name="checkmark" size={12} color={theme.road.ink} />
        </View>
      );
    case STOP_STATUS.current:
      return <View style={[styles.mark, styles.markNow]} />;
    case STOP_STATUS.skipped:
      return (
        <View style={[styles.mark, styles.markSkipped]}>
          <Ionicons name="close" size={10} color={theme.textMuted} />
        </View>
      );
    default:
      return <View style={styles.mark} />;
  }
};

// Expandable "DAY 1 · Markets & Culture" cards with a pencil that opens the
// Edit Day Details screen, under a progress strip of the whole trip. The
// strip's switch swaps the cards for the roadmap: the same days as one
// winding road, where a tap on a stop ticks it off.
const ItineraryTab = ({ days, loading, onAddDay, onEditDay, onToggleDone }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  // undefined = nothing chosen yet (the current day opens), null = all closed.
  const [expandedId, setExpandedId] = useState(undefined);
  const [view, setView] = useState('list');
  const now = useMinuteTick();
  const progress = useMemo(() => buildItineraryProgress(days, now), [days, now]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.accentGreen} />
      </View>
    );
  }

  const header = (
    <ItineraryProgressStrip progress={progress} view={view} onChangeView={setView} />
  );

  // The roadmap needs days; with none left, the cards' empty state shows.
  if (view === 'map' && progress.dayCount) {
    return (
      <ItineraryRoadmap
        progress={progress}
        header={header}
        onToggleStop={onToggleDone}
        onAddDay={onAddDay}
        onEditDay={onEditDay}
      />
    );
  }

  const openId =
    expandedId === undefined ? (progress.currentDay?.dayId ?? days[0]?._id ?? null) : expandedId;

  const renderDay = ({ item }) => {
    const expanded = openId === item._id;
    const row = progress.days.find((r) => r.dayId === item._id);
    const activityCount = item.activities?.length ?? 0;
    const meta = [
      shortDate(item.date),
      `${activityCount} activit${activityCount === 1 ? 'y' : 'ies'}`,
      row?.total ? `${row.done} done` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const dayDone = row?.status === STOP_STATUS.done;
    const dayNow = row?.status === STOP_STATUS.current;

    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.cardHeader}
          activeOpacity={0.85}
          onPress={() => setExpandedId(expanded ? null : item._id)}
        >
          <View style={[styles.dayBadge, dayNow && styles.dayBadgeNow, dayDone && styles.dayBadgeDone]}>
            {dayDone ? (
              <Ionicons name="checkmark" size={20} color={theme.road.ink} />
            ) : (
              <>
                <Text style={styles.dayBadgeLabel}>DAY</Text>
                <Text style={styles.dayBadgeNumber}>{item.dayNumber}</Text>
              </>
            )}
          </View>

          <View style={styles.cardBody}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.meta}>{meta}</Text>
          </View>

          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={15}
            color={theme.textMuted}
            style={styles.chevron}
          />
          <TouchableOpacity
            style={styles.editButton}
            activeOpacity={0.8}
            onPress={() => onEditDay?.(item)}
          >
            <Ionicons name="pencil" size={13} color={theme.accentGreen} />
          </TouchableOpacity>
        </TouchableOpacity>

        {expanded && (
          <View style={styles.activities}>
            {row?.stops.map((stop) => {
              const { activity, status } = stop;
              const done = status === STOP_STATUS.done;
              const current = status === STOP_STATUS.current;
              return (
                <TouchableOpacity
                  key={stop.id}
                  style={styles.activityRow}
                  activeOpacity={0.7}
                  onPress={() => onToggleDone?.(stop.dayId, activity._id, nextDoneFor(stop))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                >
                  <StopMark status={status} />
                  <Text style={[styles.activityTime, current && styles.activityTimeNow, done && styles.muted]}>
                    {activity.time || '—'}
                  </Text>
                  <Text
                    style={[
                      styles.activityTitle,
                      current && styles.activityTitleNow,
                      done && styles.muted,
                      status === STOP_STATUS.skipped && styles.skipped,
                    ]}
                    numberOfLines={1}
                  >
                    {activity.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  return (
    <FlatList
      data={days}
      keyExtractor={(item) => item._id}
      renderItem={renderDay}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={header}
      ListFooterComponent={
        <TouchableOpacity style={styles.addDay} activeOpacity={0.8} onPress={onAddDay}>
          <Ionicons name="add" size={16} color={theme.accentGreen} />
          <Text style={styles.addDayText}>Add Day</Text>
        </TouchableOpacity>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>
          No itinerary yet — add Day 1 and start planning the trip.
        </Text>
      }
    />
  );
};

const makeStyles = (theme) => StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 100 },
  empty: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },

  card: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg,
    marginBottom: spacing.sm + 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  dayBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  dayBadgeNow: { backgroundColor: theme.road.now },
  dayBadgeDone: { backgroundColor: theme.road.done },
  dayBadgeLabel: { color: '#04241A', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  dayBadgeNumber: { color: '#04241A', fontSize: 16, fontWeight: '800', marginTop: -1 },
  cardBody: { flex: 1, marginRight: spacing.sm },
  title: { color: theme.text, fontSize: 15, fontWeight: '700' },
  meta: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
  chevron: { marginRight: spacing.sm },
  editButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.overlayFaint,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  activities: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  activityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  mark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: theme.road.edge,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm + 2,
  },
  markDone: { backgroundColor: theme.road.done, borderColor: theme.road.done },
  markNow: { borderColor: theme.road.now, borderWidth: 3 },
  markSkipped: { borderStyle: 'dashed' },
  activityTime: {
    width: 76,
    color: theme.accentGreen,
    fontSize: 12,
    fontWeight: '600',
  },
  activityTimeNow: { color: theme.warning },
  activityTitle: { flex: 1, color: theme.text, fontSize: 13 },
  activityTitleNow: { fontWeight: '700' },
  muted: { color: theme.textMuted },
  skipped: { color: theme.textMuted, textDecorationLine: 'line-through' },

  addDay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  addDayText: { color: theme.accentGreen, fontSize: 14, fontWeight: '700' },
});

export default ItineraryTab;
