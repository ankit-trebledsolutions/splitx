import React from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  Linking,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GradientButton from './GradientButton';
import useSheetBottom from '../hooks/useSheetBottom';
import { radius, spacing, useStyles, useTheme } from '../theme';

const COPY = {
  stay: { add: 'Add to Stays', added: 'Already in Stays' },
  attraction: { add: 'Add to Attractions', added: 'Already in Attractions' },
};

// Opens the place in the phone's maps app at its coordinates. Android's geo:
// scheme lets the person pick their maps app; elsewhere Google Maps on the web
// works everywhere.
const openInMaps = (item) => {
  const query = encodeURIComponent(item.name);
  const url =
    Platform.OS === 'android'
      ? `geo:${item.lat},${item.lon}?q=${item.lat},${item.lon}(${query})`
      : `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lon}`;
  Linking.openURL(url).catch(() =>
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lon}`).catch(() => {})
  );
};

/**
 * Everything a suggestion card knows about a place, with the same Add action
 * as the card. `item` is one entry of the Suggestions answer; `added` says the
 * group already has it.
 */
const PlaceDetailSheet = ({ visible, type, item, destination, added, attribution, onClose, onAdd }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const sheetBottom = useSheetBottom(spacing.lg);
  const copy = COPY[type] ?? COPY.attraction;
  const hasCoords = typeof item?.lat === 'number' && typeof item?.lon === 'number';

  const row = (icon, label, value) =>
    value ? (
      <View style={styles.row}>
        <Ionicons name={icon} size={16} color={theme.textMuted} style={styles.rowIcon} />
        <View style={styles.rowBody}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue}>{value}</Text>
        </View>
      </View>
    ) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: sheetBottom }]}>
          <View style={styles.grabber} />

          {item ? (
            <>
              <View style={styles.headerRow}>
                <View style={styles.emojiTile}>
                  <Text style={styles.emoji}>{item.emoji || '📍'}</Text>
                </View>
                <View style={styles.headerText}>
                  <Text style={styles.name}>{item.name}</Text>
                  <View style={styles.chips}>
                    {item.category ? (
                      <View style={styles.chip}>
                        <Text style={styles.chipText}>{item.category}</Text>
                      </View>
                    ) : null}
                    {added ? (
                      <View style={[styles.chip, styles.chipAdded]}>
                        <Ionicons name="checkmark" size={11} color={theme.accentGreen} />
                        <Text style={[styles.chipText, styles.chipAddedText]}>Added</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
                  <Ionicons name="close" size={18} color={theme.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.rows}>
                {row('location-outline', 'Address', item.address)}
                {row(
                  'navigate-outline',
                  'Distance',
                  item.distanceKm != null
                    ? `${item.distanceKm} km from the centre of ${destination || 'the destination'}`
                    : null
                )}
                {row('pricetag-outline', 'Kind of place', item.category)}
                {row(
                  'globe-outline',
                  'Coordinates',
                  hasCoords ? `${item.lat.toFixed(5)}, ${item.lon.toFixed(5)}` : null
                )}
              </View>

              {hasCoords ? (
                <TouchableOpacity style={styles.mapsButton} activeOpacity={0.8} onPress={() => openInMaps(item)}>
                  <Ionicons name="map-outline" size={15} color={theme.accentGreen} />
                  <Text style={styles.mapsText}>Open in Maps</Text>
                </TouchableOpacity>
              ) : null}

              {added ? (
                <View style={styles.addedBox}>
                  <Ionicons name="checkmark-circle" size={16} color={theme.accentGreen} />
                  <Text style={styles.addedText}>{copy.added}</Text>
                </View>
              ) : (
                <GradientButton title={copy.add} onPress={() => onAdd?.(item)} style={styles.addButton} />
              )}

              {attribution ? <Text style={styles.attribution}>{attribution}</Text> : null}
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (theme) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.sheet,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: spacing.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.overlayBold,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  emojiTile: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: theme.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  emoji: { fontSize: 26 },
  headerText: { flex: 1 },
  name: { color: theme.text, fontSize: 19, fontWeight: '800', lineHeight: 24 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.overlay,
    borderRadius: 10,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  chipText: { color: theme.text, fontSize: 11, fontWeight: '600' },
  chipAdded: { backgroundColor: 'rgba(0,196,208,0.12)' },
  chipAddedText: { color: theme.accentGreen },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },

  rows: {
    marginTop: spacing.lg,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing.sm + 4 },
  rowIcon: { marginTop: 2, marginRight: spacing.sm + 2 },
  rowBody: { flex: 1 },
  rowLabel: { color: theme.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' },
  rowValue: { color: theme.text, fontSize: 13, lineHeight: 19, marginTop: 2 },

  mapsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(0,196,208,0.35)',
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 4,
  },
  mapsText: { color: theme.accentGreen, fontSize: 13, fontWeight: '700' },

  addButton: { marginTop: spacing.md },
  addedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 6,
  },
  addedText: { color: theme.textMuted, fontSize: 13, fontWeight: '700' },

  attribution: { color: theme.textMuted, fontSize: 10, marginTop: spacing.md, opacity: 0.8, textAlign: 'center' },
});

export default PlaceDetailSheet;
