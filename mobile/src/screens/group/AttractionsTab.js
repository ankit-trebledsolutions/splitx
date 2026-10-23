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
import { radius, spacing, useStyles, useTheme } from '../../theme';
import AppAlert from '../../components/AppAlert';
import useListFocus from '../../hooks/useListFocus';

// "Nearby attractions" list with per-user bookmark toggles, per the mockup.
// `focusId` is an attraction a chat card asked to show (see StaysTab).
// `header` goes above the list: the suggested places for the destination.
const AttractionsTab = ({
  header = null,
  attractions,
  loading,
  currentUserId,
  onToggleSave,
  onDelete,
  focusId,
  onFocusDone,
}) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const { highlightId, listProps } = useListFocus({
    items: loading ? [] : attractions,
    focusId,
    onDone: onFocusDone,
  });

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.accentGreen} />
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
        style={[styles.card, item._id === highlightId && styles.cardHighlighted]}
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
            color={saved ? '#04241A' : theme.textMuted}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <FlatList
      {...listProps}
      data={attractions}
      keyExtractor={(item) => item._id}
      renderItem={renderAttraction}
      extraData={highlightId}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <>
          {header}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>NEARBY ATTRACTIONS</Text>
          <TouchableOpacity
            style={styles.mapLink}
            activeOpacity={0.8}
            onPress={() => AppAlert.alert('Map View', 'The attractions map is coming soon.')}
          >
            <Ionicons name="map-outline" size={13} color={theme.accentGreen} />
            <Text style={styles.mapLinkText}>Map View</Text>
          </TouchableOpacity>
          </View>
        </>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>
          No attractions yet — tap + to add places the group should check out.
        </Text>
      }
    />
  );
};

const makeStyles = (theme) => StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.md, paddingBottom: 100 },
  empty: {
    color: theme.textMuted,
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
  headerTitle: { color: theme.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.9 },
  mapLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mapLinkText: { color: theme.accentGreen, fontSize: 12, fontWeight: '600' },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm + 2,
  },
  cardHighlighted: { borderColor: theme.accentFill, backgroundColor: 'rgba(0,196,208,0.10)' },
  emojiTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  emoji: { fontSize: 22 },
  cardBody: { flex: 1, marginRight: spacing.sm },
  name: { color: theme.text, fontSize: 14, fontWeight: '700' },
  category: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  metaText: { color: theme.textMuted, fontSize: 11, fontWeight: '600' },

  bookmark: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.overlayFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookmarkSaved: { backgroundColor: theme.accentFill, borderColor: theme.accentFill },
});

export default AttractionsTab;
