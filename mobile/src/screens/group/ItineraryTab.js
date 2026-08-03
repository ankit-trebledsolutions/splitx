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

// Expandable "DAY 1 · Markets & Culture" cards with a pencil that opens the
// Edit Day Details screen, per the Itinerary mockup.
const ItineraryTab = ({ days, loading, onAddDay, onEditDay }) => {
  const [expandedId, setExpandedId] = useState(days[0]?._id ?? null);

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
            size={15}
            color={dark.textMuted}
            style={styles.chevron}
          />
          <TouchableOpacity
            style={styles.editButton}
            activeOpacity={0.8}
            onPress={() => onEditDay?.(item)}
          >
            <Ionicons name="pencil" size={13} color={dark.accentGreen} />
          </TouchableOpacity>
        </TouchableOpacity>

        {expanded && (
          <View style={styles.activities}>
            {item.activities?.map((activity, index) => (
              <View key={activity._id ?? index} style={styles.activityRow}>
                <Text style={styles.activityTime}>{activity.time || '—'}</Text>
                <Text style={styles.activityTitle} numberOfLines={1}>
                  {activity.title}
                </Text>
              </View>
            ))}
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
      ListFooterComponent={
        <TouchableOpacity style={styles.addDay} activeOpacity={0.8} onPress={onAddDay}>
          <Ionicons name="add" size={16} color={dark.accentGreen} />
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

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 100 },
  empty: {
    color: dark.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },

  card: {
    backgroundColor: dark.card,
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
  chevron: { marginRight: spacing.sm },
  editButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  activities: {
    borderTopWidth: 1,
    borderTopColor: dark.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  activityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  activityTime: {
    width: 76,
    color: dark.accentGreen,
    fontSize: 12,
    fontWeight: '600',
  },
  activityTitle: { flex: 1, color: dark.text, fontSize: 13 },

  addDay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  addDayText: { color: dark.accentGreen, fontSize: 14, fontWeight: '700' },
});

export default ItineraryTab;
