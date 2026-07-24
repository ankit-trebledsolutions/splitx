import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dark, radius, spacing } from '../../theme';

const shortDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;

// Expandable "DAY 1 · Arrival Day" cards, per the Itinerary mockup.
const ItineraryTab = ({ days, loading, onAddActivity, onRemoveActivity, onDeleteDay }) => {
  const [expandedId, setExpandedId] = useState(null);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={dark.accentGreen} />
      </View>
    );
  }

  const renderDay = ({ item }) => {
    const expanded = expandedId === item._id;
    const activityCount = item.activities?.length ?? 0;
    const meta = [shortDate(item.date), `${activityCount} activit${activityCount === 1 ? 'y' : 'ies'}`]
      .filter(Boolean)
      .join(' · ');

    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.cardHeader}
          activeOpacity={0.85}
          onPress={() => setExpandedId(expanded ? null : item._id)}
          onLongPress={() => onDeleteDay?.(item)}
        >
          <View style={styles.dayBadge}>
            <Text style={styles.dayBadgeLabel}>DAY</Text>
            <Text style={styles.dayBadgeNumber}>{item.dayNumber}</Text>
          </View>

          <View style={styles.cardBody}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.meta}>{meta}</Text>
          </View>

          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={dark.textMuted}
          />
        </TouchableOpacity>

        {expanded && (
          <View style={styles.activities}>
            {item.activities?.map((activity, index) => (
              <TouchableOpacity
                key={activity._id ?? index}
                style={styles.activityRow}
                activeOpacity={0.85}
                onLongPress={() => onRemoveActivity?.(item, activity)}
              >
                <View style={styles.timeline}>
                  <View style={styles.timelineDot} />
                  {index < item.activities.length - 1 && <View style={styles.timelineLine} />}
                </View>
                <View style={styles.activityBody}>
                  <Text style={styles.activityTitle} numberOfLines={1}>
                    {activity.title}
                  </Text>
                  {activity.time || activity.note ? (
                    <Text style={styles.activityMeta} numberOfLines={1}>
                      {[activity.time, activity.note].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name={activity.icon || 'location-outline'} size={14} color={dark.textMuted} />
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.addActivity}
              activeOpacity={0.8}
              onPress={() => onAddActivity?.(item)}
            >
              <Ionicons name="add-circle-outline" size={15} color={dark.accentGreen} />
              <Text style={styles.addActivityText}>Add activity</Text>
            </TouchableOpacity>
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
      ListEmptyComponent={
        <Text style={styles.empty}>
          No itinerary yet — tap + to add Day 1 and start planning the trip.
        </Text>
      }
    />
  );
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 100 },
  empty: {
    color: dark.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
  },

  card: {
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    marginBottom: spacing.sm + 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  dayBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: dark.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  dayBadgeLabel: { color: '#04241A', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  dayBadgeNumber: { color: '#04241A', fontSize: 16, fontWeight: '800', marginTop: -1 },
  cardBody: { flex: 1, marginRight: spacing.sm },
  title: { color: dark.text, fontSize: 15, fontWeight: '700' },
  meta: { color: dark.textMuted, fontSize: 11, marginTop: 2 },

  activities: {
    borderTopWidth: 1,
    borderTopColor: dark.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  activityRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6 },
  timeline: { width: 20, alignItems: 'center' },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: dark.accentGreen,
    marginTop: 4,
  },
  timelineLine: {
    position: 'absolute',
    top: 14,
    bottom: -10,
    width: 1.5,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  activityBody: { flex: 1, marginLeft: spacing.sm, marginRight: spacing.sm },
  activityTitle: { color: dark.text, fontSize: 13, fontWeight: '600' },
  activityMeta: { color: dark.textMuted, fontSize: 11, marginTop: 1 },

  addActivity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    marginLeft: 2,
  },
  addActivityText: { color: dark.accentGreen, fontSize: 12, fontWeight: '600' },
});

export default ItineraryTab;
