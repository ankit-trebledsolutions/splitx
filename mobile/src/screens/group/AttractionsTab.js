import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dark, radius, spacing } from '../../theme';

// "Nearby attractions" list with per-user bookmark toggles, per the mockup.
const AttractionsTab = ({ attractions, loading, currentUserId, onToggleSave, onDelete }) => {
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={dark.accentGreen} />
      </View>
    );
  }

  const renderAttraction = ({ item }) => {
    const saved = item.savedBy?.some((id) => (id?._id ?? id) === currentUserId);
    const meta = [
      item.rating != null ? `${item.rating.toFixed(1)}` : null,
      item.distanceKm != null ? `${item.distanceKm} km away` : null,
    ].filter(Boolean);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onLongPress={() => onDelete?.(item)}
      >
        <View style={styles.emojiTile}>
          <Text style={styles.emoji}>{item.emoji || '📍'}</Text>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          {item.category ? (
            <Text style={styles.category} numberOfLines={1}>
              {item.category}
            </Text>
          ) : null}
          {meta.length ? (
            <View style={styles.metaRow}>
              {item.rating != null && <Ionicons name="star" size={11} color="#F5B342" />}
              <Text style={styles.metaText}>{meta.join(' · ')}</Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.bookmark, saved && styles.bookmarkSaved]}
          activeOpacity={0.8}
          onPress={() => onToggleSave?.(item)}
        >
          <Ionicons
            name={saved ? 'bookmark' : 'bookmark-outline'}
            size={16}
            color={saved ? '#04241A' : dark.textMuted}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <FlatList
      data={attractions}
      keyExtractor={(item) => item._id}
      renderItem={renderAttraction}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.headerTitle}>NEARBY ATTRACTIONS</Text>
          <TouchableOpacity
            style={styles.mapLink}
            activeOpacity={0.8}
            onPress={() => Alert.alert('Map View', 'The attractions map is coming soon.')}
          >
            <Ionicons name="map-outline" size={13} color={dark.accentGreen} />
            <Text style={styles.mapLinkText}>Map View</Text>
          </TouchableOpacity>
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>
          No attractions yet — tap + to add places the group should check out.
        </Text>
      }
    />
  );
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.md, paddingBottom: 100 },
  empty: {
    color: dark.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  headerTitle: { color: dark.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.9 },
  mapLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mapLinkText: { color: dark.accentGreen, fontSize: 12, fontWeight: '600' },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm + 2,
  },
  emojiTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  emoji: { fontSize: 22 },
  cardBody: { flex: 1, marginRight: spacing.sm },
  name: { color: dark.text, fontSize: 14, fontWeight: '700' },
  category: { color: dark.textMuted, fontSize: 11, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  metaText: { color: dark.textMuted, fontSize: 11, fontWeight: '600' },

  bookmark: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookmarkSaved: { backgroundColor: dark.accentGreen, borderColor: dark.accentGreen },
});

export default AttractionsTab;
