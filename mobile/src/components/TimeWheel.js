import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, PixelRatio, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { dark, radius } from '../theme';
import { PANEL_BG, PANEL_BG_CLEAR, panelStyles } from './pickerPanel';

/**
 * The time, picked the way a phone's alarm clock does it: three wheels (hour,
 * minute, AM/PM) slid with a thumb, the chosen value sitting in the lit row
 * in the middle. The hour and minute wheels go round and round.
 *
 *   <TimeWheel value={date} onChange={(date) => ...} onDone={() => ...} />
 *
 * `value` is a Date; `onChange` gets a new Date on the same day, at the time
 * the wheels show, with seconds zero.
 */

// A whole number of pixels tall, so the rows and the places the wheel stops
// at never drift apart: Android rounds a snap distance to whole pixels.
const ROW = PixelRatio.roundToNearestPixel(38);
// Rows on show: the chosen one and three each side.
const ROWS = 7;
const SIDE = Math.floor(ROWS / 2);
const HEIGHT = ROW * ROWS;

const HOURS = Array.from({ length: 12 }, (_, i) => ({ key: String(i + 1), label: String(i + 1) }));
const MINUTES = Array.from({ length: 60 }, (_, i) => ({
  key: String(i),
  label: String(i).padStart(2, '0'),
}));
const PERIODS = [
  { key: 'AM', label: 'AM' },
  { key: 'PM', label: 'PM' },
];

// A row only re-renders when it becomes, or stops being, the chosen one.
const Row = memo(({ label, chosen }) => (
  // Not a touch target itself: the wheel underneath takes every touch, so a
  // slow drag scrolls it as surely as a flick.
  <View style={styles.row} pointerEvents="none">
    <Text style={[styles.rowText, chosen && styles.rowTextChosen]} numberOfLines={1}>
      {label}
    </Text>
  </View>
));

/**
 * One wheel. `index` is the chosen item; `onChange` is called with the new
 * index once the wheel has come to rest. A cyclic wheel shows its items three
 * times over and quietly jumps back to the middle copy, so it never runs out.
 *
 * A plain ScrollView rather than a list: it sits inside the sheet's own
 * ScrollView, where a virtualized list would not be allowed, and the longest
 * wheel is only 180 rows.
 */
const Wheel = ({ items, index, onChange, cyclic = false, style }) => {
  const list = useRef(null);
  // The index this wheel last told its parent, so a prop that merely echoes
  // it back does not move the wheel while the person is still sliding it.
  const reported = useRef(index);
  const count = items.length;
  const data = useMemo(() => (cyclic ? [...items, ...items, ...items] : items), [items, cyclic]);
  // Where each row sits, given one by one: a single repeated distance is
  // rounded to whole pixels by Android and drifts off the rows.
  const stops = useMemo(() => data.map((_, row) => row * ROW), [data]);
  const rowOf = useCallback((i) => (cyclic ? i + count : i), [cyclic, count]);

  const scrollTo = useCallback((row, animated) => {
    list.current?.scrollTo({ y: row * ROW, animated });
  }, []);

  // Moved from outside (the time changed with the chip's chevrons).
  useEffect(() => {
    if (index === reported.current) return;
    reported.current = index;
    scrollTo(rowOf(index), false);
  }, [index, rowOf, scrollTo]);

  const settle = (offsetY) => {
    const row = Math.max(0, Math.min(data.length - 1, Math.round(offsetY / ROW)));
    const chosen = cyclic ? row % count : row;
    // Back to the middle copy, where there is room to keep going either way.
    if (cyclic && (row < count || row >= 2 * count)) scrollTo(chosen + count, false);
    if (chosen !== reported.current) {
      reported.current = chosen;
      onChange(chosen);
    }
  };

  // Where the wheel starts: the chosen row in the middle.
  const start = useRef({ x: 0, y: rowOf(index) * ROW }).current;

  return (
    <View style={[styles.wheel, style]}>
      <ScrollView
        ref={list}
        contentOffset={start}
        snapToOffsets={stops}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => settle(e.nativeEvent.contentOffset.y)}
        // Empty rows above and below, so the first and last items can sit in the middle too.
        contentContainerStyle={styles.rows}
      >
        {data.map((item, row) => (
          <Row
            key={`${row}:${item.key}`}
            label={item.label}
            chosen={(cyclic ? row % count : row) === index}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const TimeWheel = ({ value, onChange, onDone }) => {
  const hours = value.getHours();
  const hourIndex = (hours % 12 || 12) - 1;
  const minuteIndex = value.getMinutes();
  const periodIndex = hours >= 12 ? 1 : 0;

  const compose = (hour, minute, period) => {
    const next = new Date(value);
    next.setHours(((hour + 1) % 12) + (period === 1 ? 12 : 0), minute, 0, 0);
    return next;
  };

  return (
    <View style={panelStyles.panel}>
      <View style={styles.wheels}>
        {/* The lit row the chosen values sit in, behind the wheels. */}
        <View pointerEvents="none" style={styles.selection} />
        <Wheel
          items={HOURS}
          index={hourIndex}
          onChange={(hour) => onChange(compose(hour, minuteIndex, periodIndex))}
          cyclic
        />
        <Wheel
          items={MINUTES}
          index={minuteIndex}
          onChange={(minute) => onChange(compose(hourIndex, minute, periodIndex))}
          cyclic
        />
        <Wheel
          items={PERIODS}
          index={periodIndex}
          onChange={(period) => onChange(compose(hourIndex, minuteIndex, period))}
        />
        {/* The rows above and below fade into the card. */}
        <LinearGradient
          pointerEvents="none"
          colors={[PANEL_BG, PANEL_BG_CLEAR]}
          style={[styles.fade, styles.fadeTop]}
        />
        <LinearGradient
          pointerEvents="none"
          colors={[PANEL_BG_CLEAR, PANEL_BG]}
          style={[styles.fade, styles.fadeBottom]}
        />
      </View>
      <TouchableOpacity style={panelStyles.done} onPress={onDone} activeOpacity={0.7}>
        <Text style={panelStyles.doneText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  wheels: {
    flexDirection: 'row',
    height: HEIGHT,
    marginHorizontal: 24,
    marginTop: 8,
  },
  wheel: { flex: 1, height: HEIGHT },
  rows: { paddingVertical: ROW * SIDE },
  row: { height: ROW, alignItems: 'center', justifyContent: 'center' },
  rowText: { color: dark.textMuted, fontSize: 20, fontWeight: '500' },
  rowTextChosen: { color: dark.text, fontSize: 24, fontWeight: '700' },
  selection: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: ROW * SIDE,
    height: ROW,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  fade: { position: 'absolute', left: 0, right: 0, height: ROW * (SIDE - 0.5) },
  fadeTop: { top: 0 },
  fadeBottom: { bottom: 0 },
});

export default TimeWheel;
