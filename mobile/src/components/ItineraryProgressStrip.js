import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Line, Circle, Path, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { dark, radius, spacing } from '../theme';
import { STOP_STATUS } from '../utils/itineraryProgress';

// The road's three colours, shared with the roadmap so the two read as one.
export const ROAD_DONE = dark.accentGreen;
export const ROAD_NOW = '#F6B042';
export const ROAD_BASE = 'rgba(255,255,255,0.14)';
export const ROAD_EDGE = 'rgba(255,255,255,0.32)';
export const ON_ROAD = '#04241A';

const STRIP_H = 28;
const MID = STRIP_H / 2;
const PAD = 10;
const MILESTONE_R = 7;
// Stop dots are drawn only when a day's segment leaves them this far apart;
// a dense trip shows milestones on a plain line instead.
const MIN_DOT_GAP = 9;

// Where every milestone and stop sits on a strip `width` wide: each day gets
// an equal share of the line, with its stops spread evenly inside it.
const placeOnStrip = (progress, width) => {
  const n = progress.days.length;
  const segW = (width - 2 * PAD) / n;
  let fillTo = PAD;
  const days = progress.days.map((row, i) => {
    const x = PAD + i * segW;
    const gap = segW / (row.total + 1);
    const dots = row.stops.map((stop, k) => {
      const dotX = x + gap * (k + 1);
      if (stop === progress.currentStop) fillTo = dotX;
      return { stop, x: dotX };
    });
    return { row, x, dots, showDots: gap >= MIN_DOT_GAP };
  });
  if (progress.allDone) fillTo = width - PAD;
  return { days, fillTo };
};

const Milestone = ({ x, row }) => {
  if (row.status === STOP_STATUS.done) {
    return (
      <>
        <Circle cx={x} cy={MID} r={MILESTONE_R} fill={ROAD_DONE} />
        <Path
          d={`M${x - 3.2} ${MID} l2.2 2.2 l4.4 -4.6`}
          stroke={ON_ROAD}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </>
    );
  }
  const current = row.status === STOP_STATUS.current;
  return (
    <>
      <Circle
        cx={x}
        cy={MID}
        r={MILESTONE_R}
        fill={current ? ROAD_NOW : dark.card}
        stroke={current ? ROAD_NOW : ROAD_EDGE}
        strokeWidth={1.5}
      />
      <SvgText
        x={x}
        y={MID + 3.4}
        fontSize="9"
        fontWeight="700"
        textAnchor="middle"
        fill={current ? ON_ROAD : dark.textMuted}
      >
        {row.dayNumber}
      </SvgText>
    </>
  );
};

const Dot = ({ x, stop }) => {
  switch (stop.status) {
    case STOP_STATUS.done:
      return <Circle cx={x} cy={MID} r={3} fill={ROAD_DONE} />;
    case STOP_STATUS.current:
      return (
        <>
          <Circle cx={x} cy={MID} r={7} fill={ROAD_NOW} opacity={0.3} />
          <Circle cx={x} cy={MID} r={4} fill={ROAD_NOW} />
        </>
      );
    default:
      return (
        <Circle
          cx={x}
          cy={MID}
          r={3}
          fill={dark.card}
          stroke={ROAD_EDGE}
          strokeWidth={1.2}
          opacity={stop.status === STOP_STATUS.skipped ? 0.5 : 1}
        />
      );
  }
};

const ViewToggle = ({ view, onChange }) => (
  <View style={styles.toggle}>
    {[
      ['list', 'list'],
      ['map', 'map-outline'],
    ].map(([key, icon]) => {
      const active = view === key;
      return (
        <TouchableOpacity
          key={key}
          style={[styles.toggleItem, active && styles.toggleItemActive]}
          activeOpacity={0.8}
          onPress={() => onChange(key)}
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
          accessibilityLabel={key === 'list' ? 'Day list' : 'Roadmap'}
        >
          <Ionicons name={icon} size={15} color={active ? dark.accentGreen : dark.textMuted} />
        </TouchableOpacity>
      );
    })}
  </View>
);

// "Day 2 of 3 · 6 of 13 stops" above a metro-style line of the whole trip,
// filled up to where the group is now. Sits above the day list and the
// roadmap alike, and carries the switch between the two.
const ItineraryProgressStrip = ({ progress, view, onChangeView }) => {
  const [width, setWidth] = useState(0);
  if (!progress.dayCount) return null;

  const { currentStop, currentDay, total, done, percent, allDone, lastDayNumber } = progress;
  const title = allDone
    ? 'Trip complete'
    : currentDay
      ? `Day ${currentDay.dayNumber} of ${lastDayNumber}`
      : `${lastDayNumber} day${lastDayNumber === 1 ? '' : 's'} planned`;
  const stats = total
    ? `${done} of ${total} stop${total === 1 ? '' : 's'} done · ${percent}%`
    : 'No stops yet';
  const nowText = currentStop
    ? `Now · ${currentStop.activity.title}`
    : allDone
      ? 'Every stop is done'
      : total
        ? 'Not started yet'
        : 'Add activities to the days to see the road';

  const placed = width > 0 ? placeOnStrip(progress, width) : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <View style={styles.headText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.stats}>{stats}</Text>
        </View>
        <ViewToggle view={view} onChange={onChangeView} />
      </View>

      <View style={styles.strip} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {placed && (
          <Svg width={width} height={STRIP_H}>
            <Line
              x1={PAD}
              y1={MID}
              x2={width - PAD}
              y2={MID}
              stroke={ROAD_BASE}
              strokeWidth={3}
              strokeLinecap="round"
            />
            {placed.fillTo > PAD && (
              <Line
                x1={PAD}
                y1={MID}
                x2={placed.fillTo}
                y2={MID}
                stroke={ROAD_DONE}
                strokeWidth={3}
                strokeLinecap="round"
              />
            )}
            {placed.days.map(({ row, dots, showDots }) =>
              showDots
                ? dots.map(({ stop, x }) => <Dot key={`${row.dayId}-${stop.id}`} x={x} stop={stop} />)
                : null
            )}
            {placed.days.map(({ row, x }) => (
              <Milestone key={row.dayId} x={x} row={row} />
            ))}
          </Svg>
        )}
      </View>

      <Text style={styles.now} numberOfLines={1}>
        {nowText}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 4,
    paddingBottom: spacing.sm + 2,
    marginBottom: spacing.sm + 2,
  },
  headRow: { flexDirection: 'row', alignItems: 'center' },
  headText: { flex: 1, marginRight: spacing.sm },
  title: { color: dark.text, fontSize: 15, fontWeight: '700' },
  stats: { color: dark.textMuted, fontSize: 11, marginTop: 2 },
  toggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.sm + 2,
    padding: 2,
  },
  toggleItem: {
    width: 34,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleItemActive: { backgroundColor: 'rgba(0,196,208,0.18)' },
  strip: { marginTop: spacing.sm, height: STRIP_H },
  now: { color: dark.textMuted, fontSize: 11, marginTop: 4 },
});

export default ItineraryProgressStrip;
