import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
  StyleSheet,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { dark, spacing } from '../theme';
import { STOP_STATUS, nextDoneFor } from '../utils/itineraryProgress';
import { ROAD_BASE, ROAD_DONE, ROAD_EDGE, ROAD_NOW, ON_ROAD } from './ItineraryProgressStrip';

// The trip as one winding road: a milestone per day on the left, its stops
// snaking right and back, the road coloured up to where the group is now.
// The road is one SVG; every milestone, stop and label is an ordinary view
// laid over it, so text and taps behave like the rest of the app.

const TOP = 18;
const BOTTOM = 110;
const EDGE = 42;
const ROW_DAY = 80;
const ROW_STOP = 66;
const MILESTONE_R = 18;
const STOP_R = 12;
// Labels start this far from a node's edge: the road beside a node bends away
// at about 25px per label line, so the text clears it with room to spare.
const LABEL_GAP = 18;
// Stops of a day take these lanes in turn (0 = left, 1 = middle, 2 = right).
const LANES = [1, 2, 1, 0];

const shortDate = (ms) =>
  ms == null ? null : new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const placeNodes = (progress, width) => {
  const lanes = [EDGE, width / 2, width - EDGE];
  const nodes = [];
  let y = TOP + MILESTONE_R;
  progress.days.forEach((row) => {
    nodes.push({ kind: 'day', key: `day-${row.dayId}`, x: lanes[0], y, lane: 0, row });
    y += ROW_DAY;
    row.stops.forEach((stop, i) => {
      const lane = LANES[i % LANES.length];
      nodes.push({ kind: 'stop', key: `stop-${stop.id}`, x: lanes[lane], y, lane, stop });
      y += ROW_STOP;
    });
  });
  nodes.push({ kind: 'add', key: 'add', x: lanes[0], y, lane: 0 });
  return { nodes, height: y + MILESTONE_R + BOTTOM };
};

// Straight down between two nodes in one lane; otherwise an S-curve that
// leaves and arrives vertically, so the road runs through every node top to
// bottom and never through a label beside it.
const segmentPath = (a, b) => {
  if (a.x === b.x) return `M${a.x} ${a.y} L${b.x} ${b.y}`;
  const mid = (a.y + b.y) / 2;
  return `M${a.x} ${a.y} C${a.x} ${mid} ${b.x} ${mid} ${b.x} ${b.y}`;
};

const buildRoads = (nodes, progress) => {
  const segments = nodes.slice(1).map((node, i) => segmentPath(nodes[i], node));
  // The last segment leads to "Add day" and is only ever dashed.
  const toAdd = segments.pop();
  let doneUntil = 0;
  if (progress.currentStop) {
    doneUntil = nodes.findIndex((n) => n.kind === 'stop' && n.stop === progress.currentStop);
  } else if (progress.allDone) {
    doneUntil = nodes.length - 2;
  }
  return {
    base: segments.join(' '),
    done: segments.slice(0, Math.max(0, doneUntil)).join(' '),
    toAdd,
  };
};

const PulseRing = ({ x, y }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  const size = STOP_R * 2;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - STOP_R,
        top: y - STOP_R,
        width: size,
        height: size,
        borderRadius: STOP_R,
        backgroundColor: ROAD_NOW,
        opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.3] }) }],
      }}
    />
  );
};

const circleStyle = (status, r) => {
  const base = { width: r * 2, height: r * 2, borderRadius: r };
  switch (status) {
    case STOP_STATUS.done:
      return [base, { backgroundColor: ROAD_DONE }];
    case STOP_STATUS.current:
      return [base, { backgroundColor: ROAD_NOW }];
    case STOP_STATUS.skipped:
      return [
        base,
        { backgroundColor: dark.card, borderWidth: 1.5, borderColor: ROAD_EDGE, borderStyle: 'dashed' },
      ];
    default:
      return [base, { backgroundColor: dark.card, borderWidth: 1.5, borderColor: ROAD_EDGE }];
  }
};

const DayNode = ({ node, width, onPress }) => {
  const { row, x, y } = node;
  const status = row.status;
  const parts = [shortDate(row.date), row.total ? `${row.done} of ${row.total} done` : 'No stops yet'];
  if (row.isToday) parts.push('today');
  return (
    <>
      <TouchableOpacity
        style={[styles.node, circleStyle(status, MILESTONE_R), { left: x - MILESTONE_R, top: y - MILESTONE_R }]}
        activeOpacity={0.8}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Day ${row.dayNumber}, ${row.day.title}`}
      >
        {status === STOP_STATUS.done ? (
          <Ionicons name="checkmark" size={20} color={ON_ROAD} />
        ) : (
          <Text style={[styles.dayNumber, status === STOP_STATUS.current && styles.onRoad]}>
            {row.dayNumber}
          </Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.label,
          styles.dayLabel,
          { left: x + MILESTONE_R + LABEL_GAP, width: width - (x + MILESTONE_R + LABEL_GAP) - spacing.md, top: y - 24 },
        ]}
        activeOpacity={0.8}
        onPress={onPress}
      >
        <View style={styles.dayTitleRow}>
          <Text style={styles.dayTitle} numberOfLines={1}>
            Day {row.dayNumber} · {row.day.title}
          </Text>
          <Ionicons name="pencil" size={12} color={dark.accentGreen} style={styles.pencil} />
        </View>
        <Text style={styles.dayMeta} numberOfLines={1}>
          {parts.filter(Boolean).join(' · ')}
        </Text>
      </TouchableOpacity>
    </>
  );
};

const StopNode = ({ node, nextLane, width, onPress }) => {
  const { stop, x, y, lane } = node;
  const { status, activity } = stop;
  const done = status === STOP_STATUS.done;
  const current = status === STOP_STATUS.current;
  const skipped = status === STOP_STATUS.skipped;

  // Side lanes label inward; a middle stop labels away from where the road
  // heads next, so the curve never runs under its text.
  const onLeft = lane === 2 || (lane === 1 && nextLane === 2);
  const inner = STOP_R + LABEL_GAP;
  const labelStyle = onLeft
    ? { left: spacing.md, width: x - inner - spacing.md, alignItems: 'flex-end' }
    : { left: x + inner, width: width - (x + inner) - spacing.md, alignItems: 'flex-start' };
  const textAlign = onLeft ? 'right' : 'left';
  const iconColor = done || current ? ON_ROAD : dark.textMuted;

  return (
    <>
      {current && <PulseRing x={x} y={y} />}
      <TouchableOpacity
        style={[styles.node, circleStyle(status, STOP_R), { left: x - STOP_R, top: y - STOP_R }]}
        activeOpacity={0.8}
        onPress={onPress}
        hitSlop={styles.hitSlop}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={activity.title}
      >
        {done ? (
          <Ionicons name="checkmark" size={15} color={iconColor} />
        ) : skipped ? (
          <Ionicons name="close" size={13} color={iconColor} />
        ) : (
          <Ionicons name={activity.icon || 'location-outline'} size={12} color={iconColor} />
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.label, styles.stopLabel, labelStyle, { top: y - 26 }]}
        activeOpacity={0.8}
        onPress={onPress}
      >
        {!!activity.time && (
          <Text
            style={[styles.stopTime, { textAlign }, current && styles.stopTimeNow, done && styles.muted]}
            numberOfLines={1}
          >
            {activity.time}
            {activity.endTime ? ` – ${activity.endTime}` : ''}
          </Text>
        )}
        <Text
          style={[
            styles.stopTitle,
            { textAlign },
            current && styles.stopTitleNow,
            done && styles.muted,
            skipped && styles.skipped,
          ]}
          numberOfLines={lane === 1 ? 2 : 1}
        >
          {activity.title}
        </Text>
        {!!activity.location && lane !== 1 && (
          <Text style={[styles.stopPlace, { textAlign }]} numberOfLines={1}>
            {activity.location}
          </Text>
        )}
      </TouchableOpacity>
    </>
  );
};

const AddNode = ({ node, width, onPress }) => (
  <>
    <TouchableOpacity
      style={[styles.node, styles.addNode, { left: node.x - MILESTONE_R, top: node.y - MILESTONE_R }]}
      activeOpacity={0.8}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add day"
    >
      <Ionicons name="add" size={20} color={dark.accentGreen} />
    </TouchableOpacity>
    <TouchableOpacity
      style={[
        styles.label,
        styles.dayLabel,
        { left: node.x + MILESTONE_R + LABEL_GAP, width: width - (node.x + MILESTONE_R + LABEL_GAP) - spacing.md, top: node.y - 24 },
      ]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <Text style={styles.addText}>Add Day</Text>
      <Text style={styles.dayMeta}>The road goes on from here</Text>
    </TouchableOpacity>
  </>
);

const ItineraryRoadmap = ({ progress, onToggleStop, onAddDay, onEditDay, header }) => {
  const [outerWidth, setOuterWidth] = useState(0);
  // The road sits inside the list's side padding.
  const width = Math.max(0, outerWidth - 2 * spacing.md);
  const scrollRef = useRef(null);
  const scrolledTo = useRef(null);

  const laid = useMemo(() => (width > 0 ? placeNodes(progress, width) : null), [progress, width]);
  const roads = useMemo(() => (laid ? buildRoads(laid.nodes, progress) : null), [laid, progress]);

  // Open on where the group is: once per current stop, so a member's own
  // scrolling is not fought every time the clock or a tick moves the marker.
  // Tried when the content is measured and again whenever the stop changes.
  const currentKey = progress.currentStop?.id ?? (progress.allDone ? 'end' : 'start');
  const currentY = laid?.nodes.find((n) => n.kind === 'stop' && n.stop === progress.currentStop)?.y;
  const scrollToCurrent = () => {
    if (!laid || scrolledTo.current === currentKey) return;
    scrolledTo.current = currentKey;
    if (currentY != null) {
      scrollRef.current?.scrollTo({ y: Math.max(0, currentY - 170), animated: false });
    }
  };
  useEffect(scrollToCurrent);

  return (
    <View style={styles.flex} onLayout={(e) => setOuterWidth(e.nativeEvent.layout.width)}>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={scrollToCurrent}
      >
        {header}
        {laid && roads && (
          <View style={{ height: laid.height, width }}>
            <Svg width={width} height={laid.height} style={StyleSheet.absoluteFill}>
              <Path d={roads.base} stroke={ROAD_BASE} strokeWidth={4} fill="none" strokeLinecap="round" />
              {!!roads.done && (
                <Path d={roads.done} stroke={ROAD_DONE} strokeWidth={4} fill="none" strokeLinecap="round" />
              )}
              <Path
                d={roads.toAdd}
                stroke={ROAD_BASE}
                strokeWidth={4}
                fill="none"
                strokeLinecap="round"
                strokeDasharray="5 8"
              />
            </Svg>
            {laid.nodes.map((node, i) => {
              if (node.kind === 'day') {
                return (
                  <DayNode key={node.key} node={node} width={width} onPress={() => onEditDay?.(node.row.day)} />
                );
              }
              if (node.kind === 'stop') {
                return (
                  <StopNode
                    key={node.key}
                    node={node}
                    nextLane={laid.nodes[i + 1]?.lane}
                    width={width}
                    onPress={() =>
                      onToggleStop?.(node.stop.dayId, node.stop.activity._id, nextDoneFor(node.stop))
                    }
                  />
                );
              }
              return <AddNode key={node.key} node={node} width={width} onPress={onAddDay} />;
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
  node: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  addNode: {
    width: MILESTONE_R * 2,
    height: MILESTONE_R * 2,
    borderRadius: MILESTONE_R,
    backgroundColor: dark.card,
    borderWidth: 1.5,
    borderColor: 'rgba(0,196,208,0.55)',
    borderStyle: 'dashed',
  },
  dayNumber: { color: dark.textMuted, fontSize: 15, fontWeight: '800' },
  onRoad: { color: ON_ROAD },
  label: { position: 'absolute', justifyContent: 'center' },
  dayLabel: { height: 48 },
  stopLabel: { height: 52 },
  dayTitleRow: { flexDirection: 'row', alignItems: 'center' },
  dayTitle: { color: dark.text, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  pencil: { marginLeft: 6 },
  dayMeta: { color: dark.textMuted, fontSize: 11, marginTop: 2 },
  addText: { color: dark.accentGreen, fontSize: 14, fontWeight: '700' },
  stopTime: { color: dark.accentGreen, fontSize: 10, fontWeight: '700', marginBottom: 1 },
  stopTimeNow: { color: ROAD_NOW },
  stopTitle: { color: dark.text, fontSize: 12.5, lineHeight: 16 },
  stopTitleNow: { color: dark.text, fontWeight: '700' },
  stopPlace: { color: dark.textMuted, fontSize: 10, marginTop: 1 },
  muted: { color: dark.textMuted },
  skipped: { color: dark.textMuted, textDecorationLine: 'line-through' },
});

export default ItineraryRoadmap;
