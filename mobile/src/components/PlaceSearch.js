import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, useStyles, useTheme } from '../theme';

const COPY = {
  stay: { noun: 'hotels', placeholder: 'Search hotels', none: 'No hotels called' },
  attraction: { noun: 'places to visit', placeholder: 'Search places to visit', none: 'No places called' },
};

/**
 * The search box on the Stays and Attractions tabs: type a hotel's or a
 * sight's name and see the matches within the trip's destination. Tapping
 * Add opens the ordinary add sheet, filled in, like the suggestion cards;
 * tapping the row shows everything about the place. Renders nothing while
 * the server has no provider key.
 *
 *   search:      what usePlaceSearch returns
 *   suggestions: what usePlaceSuggestions returns, to know the provider is set up
 *   destination: the trip's destination as text, for the placeholder
 *   addedPlaceIds: provider ids already in the group's list (marked "Added")
 */
const PlaceSearch = ({
  type,
  search,
  suggestions,
  destination,
  addedPlaceIds = [],
  isAdmin,
  onAdd,
  onOpen,
  onSetDestination,
}) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const copy = COPY[type] ?? COPY.attraction;

  if (suggestions?.data?.configured === false || search.data?.configured === false) return null;

  const { query, setQuery, clear, active, status, data, error, retry } = search;
  const where = destination ? ` in ${destination}` : '';
  const items = data?.items ?? [];
  const added = new Set([...(data?.addedPlaceIds ?? []), ...addedPlaceIds]);

  const notice = (icon, text, action) => (
    <View style={styles.notice}>
      <Ionicons name={icon} size={16} color={theme.textMuted} />
      <Text style={styles.noticeText}>{text}</Text>
      {action ? (
        <TouchableOpacity style={styles.noticeButton} activeOpacity={0.8} onPress={action.onPress}>
          <Text style={styles.noticeButtonText}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const renderResults = () => {
    if (status === 'loading' || status === 'idle') {
      return (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.accentGreen} size="small" />
          <Text style={styles.loadingText}>Searching{where}…</Text>
        </View>
      );
    }
    if (status === 'error') {
      return notice(
        'cloud-offline-outline',
        error?.message ?? 'The search could not be run.',
        error?.code === 'PLACES_SEARCH_LIMIT' ? null : { label: 'Try again', onPress: retry }
      );
    }
    if (data?.reason === 'NO_DESTINATION') {
      return notice(
        'location-outline',
        isAdmin
          ? `Set the trip's destination to search ${copy.noun} there.`
          : `Searching ${copy.noun} works once the group admin sets the trip's destination.`,
        isAdmin ? { label: 'Set destination', onPress: onSetDestination } : null
      );
    }
    if (data?.reason === 'UNKNOWN_DESTINATION') {
      return notice(
        'help-circle-outline',
        `We couldn't find “${destination}” on the map, so there is nothing to search in.`,
        isAdmin ? { label: 'Change', onPress: onSetDestination } : null
      );
    }
    if (!items.length) {
      return notice('search-outline', `${copy.none} “${query.trim()}”${where}. You can still add one by hand.`);
    }
    return (
      <View style={styles.results}>
        {items.map((item) => {
          const isAdded = added.has(item.placeId);
          const meta = [item.category, item.address].filter(Boolean).join(' · ');
          return (
            <TouchableOpacity key={item.placeId} style={styles.row} activeOpacity={0.85} onPress={() => onOpen?.(item)}>
              <View style={styles.emojiTile}>
                <Text style={styles.emoji}>{item.emoji || '📍'}</Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                {meta ? (
                  <Text style={styles.meta} numberOfLines={1}>
                    {meta}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={[styles.addButton, isAdded && styles.addedButton]}
                activeOpacity={0.8}
                disabled={isAdded}
                onPress={() => onAdd?.(item)}
              >
                <Ionicons name={isAdded ? 'checkmark' : 'add'} size={14} color={isAdded ? theme.textMuted : '#04121C'} />
                <Text style={[styles.addText, isAdded && styles.addedText]}>{isAdded ? 'Added' : 'Add'}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.section}>
      <View style={styles.box}>
        <Ionicons name="search" size={18} color={theme.textMuted} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder={`${copy.placeholder}${where}`}
          placeholderTextColor={theme.textMuted}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
        />
        {query ? (
          <TouchableOpacity onPress={clear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={theme.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {active ? renderResults() : null}

      {active && data?.provider?.attribution ? (
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

const makeStyles = (theme) => StyleSheet.create({
  section: { marginTop: spacing.md },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    // Android TextInputs already carry vertical padding; iOS needs it added.
    paddingVertical: Platform.OS === 'ios' ? 12 : 6,
  },
  input: { flex: 1, color: theme.text, fontSize: 15, padding: 0 },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  loadingText: { color: theme.textMuted, fontSize: 12 },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  noticeText: { flex: 1, color: theme.textMuted, fontSize: 12, lineHeight: 17 },
  noticeButton: {
    borderWidth: 1,
    borderColor: theme.accentGreen,
    borderRadius: 10,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  noticeButtonText: { color: theme.accentGreen, fontSize: 11, fontWeight: '700' },

  results: {
    marginTop: spacing.sm,
    backgroundColor: theme.card2,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm + 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  emojiTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm + 2,
  },
  emoji: { fontSize: 18 },
  rowText: { flex: 1, marginRight: spacing.sm },
  name: { color: theme.text, fontSize: 13, fontWeight: '700' },
  meta: { color: theme.textMuted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: theme.accentFill,
    borderRadius: 10,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
  },
  addedButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.border },
  addText: { color: '#04121C', fontSize: 11, fontWeight: '800' },
  addedText: { color: theme.textMuted },

  attribution: { color: theme.textMuted, fontSize: 10, marginTop: spacing.sm, opacity: 0.8 },
});

export default PlaceSearch;
