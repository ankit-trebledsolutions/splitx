import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dark, radius, spacing } from '../theme';

const COPY = {
  stay: { noun: 'hotels', finding: 'Finding hotels in', none: 'No hotels found in' },
  attraction: {
    noun: 'places to visit',
    finding: 'Finding places to visit in',
    none: 'No places found in',
  },
};

const CARD_WIDTH = 236;

/**
 * "Suggested in Jaipur": a row of hotels or sights at the trip's destination,
 * above the group's own list on the Stays and Attractions tabs. Tapping Add
 * opens the ordinary add sheet, filled in, so nothing is saved without the
 * member seeing it. Renders nothing while the server has no provider key.
 *
 *   suggestions: what usePlaceSuggestions returns
 *   addedPlaceIds: provider ids already in the group's list (marked "Added")
 */
const PlaceSuggestions = ({ type, suggestions, addedPlaceIds = [], isAdmin, onAdd, onSetDestination }) => {
  const { status, data, error, refreshing, refresh, retry } = suggestions;
  const copy = COPY[type] ?? COPY.attraction;

  if (status === 'idle') return null;
  if (data?.configured === false) return null;

  const destination = data?.destination?.text ?? '';
  const items = data?.items ?? [];
  const added = new Set([...(data?.addedPlaceIds ?? []), ...addedPlaceIds]);
  const title = destination ? `SUGGESTED IN ${destination.toUpperCase()}` : 'SUGGESTIONS';

  const notice = (icon, text, action) => (
    <View style={styles.notice}>
      <Ionicons name={icon} size={16} color={dark.textMuted} />
      <Text style={styles.noticeText}>{text}</Text>
      {action ? (
        <TouchableOpacity style={styles.noticeButton} activeOpacity={0.8} onPress={action.onPress}>
          <Text style={styles.noticeButtonText}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const renderBody = () => {
    if (!data) {
      if (status === 'loading') {
        return (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={dark.accentGreen} size="small" />
            <Text style={styles.loadingText}>Finding suggestions…</Text>
          </View>
        );
      }
      return notice(
        'cloud-offline-outline',
        error?.message ?? 'Suggestions could not be loaded.',
        error?.code === 'PLACES_LIMIT' ? null : { label: 'Try again', onPress: retry }
      );
    }

    if (data.reason === 'NO_DESTINATION') {
      return notice(
        'location-outline',
        isAdmin
          ? `Add the trip's destination to see suggested ${copy.noun}.`
          : `Suggested ${copy.noun} appear once the group admin adds the trip's destination.`,
        isAdmin ? { label: 'Set destination', onPress: onSetDestination } : null
      );
    }
    if (data.reason === 'UNKNOWN_DESTINATION') {
      return notice(
        'help-circle-outline',
        `We couldn't find “${destination}” on the map. A city or region name works best.`,
        isAdmin ? { label: 'Change', onPress: onSetDestination } : null
      );
    }
    if (status === 'loading') {
      return (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={dark.accentGreen} size="small" />
          <Text style={styles.loadingText}>
            {copy.finding} {destination}…
          </Text>
        </View>
      );
    }
    if (!items.length) {
      return notice('search-outline', `${copy.none} ${destination} yet. You can still add one by hand.`);
    }

    return (
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) => item.placeId}
        showsHorizontalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        renderItem={({ item }) => {
          const isAdded = added.has(item.placeId);
          const meta = [item.category, item.distanceKm != null ? `${item.distanceKm} km` : null]
            .filter(Boolean)
            .join(' · ');
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.emojiTile}>
                  <Text style={styles.emoji}>{item.emoji || '📍'}</Text>
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.name} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {meta ? (
                    <Text style={styles.meta} numberOfLines={1}>
                      {meta}
                    </Text>
                  ) : null}
                </View>
              </View>
              {item.address ? (
                <Text style={styles.address} numberOfLines={1}>
                  {item.address}
                </Text>
              ) : null}
              <TouchableOpacity
                style={[styles.addButton, isAdded && styles.addedButton]}
                activeOpacity={0.8}
                disabled={isAdded}
                onPress={() => onAdd?.(item)}
              >
                <Ionicons
                  name={isAdded ? 'checkmark' : 'add'}
                  size={14}
                  color={isAdded ? dark.textMuted : '#04121C'}
                />
                <Text style={[styles.addText, isAdded && styles.addedText]}>{isAdded ? 'Added' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    );
  };

  const canRefresh = status === 'ready' && data && !data.reason;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {canRefresh ? (
          <TouchableOpacity
            style={styles.headerAction}
            activeOpacity={0.8}
            disabled={refreshing}
            onPress={refresh}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {refreshing ? (
              <ActivityIndicator color={dark.accentGreen} size="small" />
            ) : (
              <Ionicons name="refresh" size={14} color={dark.accentGreen} />
            )}
          </TouchableOpacity>
        ) : null}
        {canRefresh && isAdmin ? (
          <TouchableOpacity
            style={styles.headerAction}
            activeOpacity={0.8}
            onPress={onSetDestination}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="pencil" size={13} color={dark.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {renderBody()}

      {data?.provider?.attribution ? (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => data.provider.url && Linking.openURL(data.provider.url).catch(() => {})}
        >
          <Text style={styles.attribution}>{data.provider.attribution}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  section: { marginTop: spacing.md, marginBottom: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  title: {
    flex: 1,
    color: dark.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  headerAction: { marginLeft: spacing.sm, padding: 2 },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  loadingText: { color: dark.textMuted, fontSize: 12 },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noticeText: { flex: 1, color: dark.textMuted, fontSize: 12, lineHeight: 17 },
  noticeButton: {
    borderWidth: 1,
    borderColor: dark.accentGreen,
    borderRadius: 10,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  noticeButtonText: { color: dark.accentGreen, fontSize: 11, fontWeight: '700' },

  gap: { width: spacing.sm },
  card: {
    width: CARD_WIDTH,
    backgroundColor: dark.card2,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    padding: spacing.sm + 4,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  emojiTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm + 2,
  },
  emoji: { fontSize: 18 },
  cardText: { flex: 1 },
  name: { color: dark.text, fontSize: 13, fontWeight: '700', lineHeight: 17 },
  meta: { color: dark.textMuted, fontSize: 11, marginTop: 2 },
  address: { color: dark.textMuted, fontSize: 11, marginTop: spacing.sm },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: dark.accentGreen,
    borderRadius: 10,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
    marginTop: spacing.sm + 2,
  },
  addedButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: dark.border },
  addText: { color: '#04121C', fontSize: 11, fontWeight: '800' },
  addedText: { color: dark.textMuted },

  attribution: { color: dark.textMuted, fontSize: 10, marginTop: spacing.sm, opacity: 0.8 },
});

export default PlaceSuggestions;
