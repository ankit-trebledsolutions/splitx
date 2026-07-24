import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Avatar from '../../components/Avatar';
import { dark, radius, spacing } from '../../theme';
import { usd } from '../../utils/format';

const STATUS = {
  pending: {
    label: 'PENDING',
    color: '#F5B342',
    chipBg: 'rgba(245,179,66,0.14)',
    gradient: ['#221534', '#120D1E'],
  },
  confirmed: {
    label: 'CONFIRMED',
    color: dark.accentGreen,
    chipBg: 'rgba(23,230,149,0.14)',
    gradient: ['#122642', '#0B1730'],
  },
  cancelled: {
    label: 'CANCELLED',
    color: '#F87171',
    chipBg: 'rgba(248,113,113,0.14)',
    gradient: ['#2A1518', '#150D0E'],
  },
};

const shortDate = (value) =>
  new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const nightsBetween = (checkIn, checkOut) =>
  Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));

// Booking cards with status gradients, per the Stays mockup.
const StaysTab = ({ stays, loading, organiserId, onToggleStatus, onDelete }) => {
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={dark.accentGreen} />
      </View>
    );
  }

  const renderStay = ({ item }) => {
    const status = STATUS[item.status] ?? STATUS.pending;
    const nights = nightsBetween(item.checkIn, item.checkOut);
    const total = nights * item.pricePerNight;
    const isOrganiser = item.bookedBy?._id === organiserId;

    return (
      <TouchableOpacity activeOpacity={0.9} onLongPress={() => onDelete?.(item)}>
        <LinearGradient
          colors={status.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.topRow}>
            <View style={styles.emojiTile}>
              <Text style={styles.emoji}>{item.emoji || '🏨'}</Text>
            </View>
            <View style={styles.titleWrap}>
              <Text style={styles.name} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={styles.stars}>{'★'.repeat(item.stars ?? 4)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.statusChip, { backgroundColor: status.chipBg }]}
              activeOpacity={0.8}
              onPress={() => onToggleStatus?.(item)}
            >
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.dateRow}>
            <View style={styles.dateBox}>
              <Text style={styles.dateLabel}>CHECK-IN</Text>
              <Text style={styles.dateValue}>{shortDate(item.checkIn)}</Text>
            </View>
            <View style={styles.dateBox}>
              <Text style={styles.dateLabel}>CHECK-OUT</Text>
              <Text style={styles.dateValue}>{shortDate(item.checkOut)}</Text>
            </View>
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.priceMeta}>
              {nights} night{nights === 1 ? '' : 's'} · {item.guests} guest
              {item.guests === 1 ? '' : 's'}
            </Text>
            <View style={styles.priceWrap}>
              <Text style={styles.priceTotal}>{usd(total)}</Text>
              <Text style={styles.pricePer}> ({usd(item.pricePerNight)}/night)</Text>
            </View>
          </View>

          {item.amenities?.length ? (
            <View style={styles.amenities}>
              {item.amenities.map((amenity) => (
                <View key={amenity} style={styles.amenityChip}>
                  <Text style={styles.amenityText}>{amenity}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.divider} />

          <View style={styles.bookerRow}>
            <Avatar name={item.bookedBy?.name} size={26} solid />
            <View style={styles.bookerBody}>
              <Text style={styles.bookerName} numberOfLines={1}>
                {item.bookedBy?.name ?? 'Unknown'}
              </Text>
              <Text style={styles.bookerMeta}>Booked · {shortDate(item.createdAt)}</Text>
            </View>
            {isOrganiser && (
              <View style={styles.organiserChip}>
                <Ionicons name="ribbon-outline" size={10} color={dark.textMuted} />
                <Text style={styles.organiserText}>Organiser</Text>
              </View>
            )}
          </View>

          {item.address ? (
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={12} color={dark.textMuted} />
              <Text style={styles.addressText} numberOfLines={1}>
                {item.address}
              </Text>
            </View>
          ) : null}
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  return (
    <FlatList
      data={stays}
      keyExtractor={(item) => item._id}
      renderItem={renderStay}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <Text style={styles.empty}>
          No stays yet — tap + to add where the group is staying.
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
    borderRadius: radius.lg + 4,
    borderWidth: 1,
    borderColor: dark.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  emojiTile: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm + 2,
  },
  emoji: { fontSize: 21 },
  titleWrap: { flex: 1, marginRight: spacing.sm },
  name: { color: dark.text, fontSize: 15, fontWeight: '700' },
  stars: { color: '#F5B342', fontSize: 11, marginTop: 2, letterSpacing: 1.5 },
  statusChip: { borderRadius: 12, paddingHorizontal: spacing.sm + 2, paddingVertical: 4 },
  statusText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },

  dateRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  dateBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  dateLabel: { color: dark.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 0.7 },
  dateValue: { color: dark.text, fontSize: 15, fontWeight: '700', marginTop: 3 },

  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  priceMeta: { color: dark.textMuted, fontSize: 12 },
  priceWrap: { flexDirection: 'row', alignItems: 'baseline' },
  priceTotal: { color: dark.text, fontSize: 17, fontWeight: '800' },
  pricePer: { color: dark.textMuted, fontSize: 11 },

  amenities: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm - 2, marginTop: spacing.md },
  amenityChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  amenityText: { color: dark.text, fontSize: 10, fontWeight: '600' },

  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: spacing.md },

  bookerRow: { flexDirection: 'row', alignItems: 'center' },
  bookerBody: { flex: 1, marginLeft: spacing.sm },
  bookerName: { color: dark.text, fontSize: 12, fontWeight: '700' },
  bookerMeta: { color: dark.textMuted, fontSize: 10, marginTop: 1 },
  organiserChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  organiserText: { color: dark.textMuted, fontSize: 9, fontWeight: '700' },

  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.sm },
  addressText: { color: dark.textMuted, fontSize: 11, flex: 1 },
});

export default StaysTab;
