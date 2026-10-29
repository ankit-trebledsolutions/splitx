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
import Svg, { Path, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { spacing, useStyles, useTheme } from '../theme';
import { STOP_STATUS, nextDoneFor } from '../utils/itineraryProgress';
import { layoutRoadmap, MILESTONE_R, STOP_R } from '../utils/roadmapLayout';

// The trip as one winding road: a milestone per day on the left, its stops
// snaking right and back, the road ahead dashed and the road behind solid
// up to the stop the group is at now. The road is one SVG; every milestone,
// stop and label is an ordinary view laid over it at the places
// utils/roadmapLayout.js works out, so text and taps behave like the rest
// of the app.

// Labels sit in boxes sized for the phone's default text; past this much
// OS font scaling they would run into the road, so growth stops here (the
// day list, one tap away, scales freely).
const FONT_SCALE_CAP = 1.1;

const shortDate = (ms) =>
  ms == null ? null : new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const STATUS_WORD = {
  [STOP_STATUS.done]: 'done',
  [STOP_STATUS.current]: 'current stop',
  [STOP_STATUS.skipped]: 'skipped',
  [STOP_STATUS.pending]: 'upcoming',
};

const PulseRing = ({ x, y }) => {
  const theme = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(600),
      ])
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
        backgroundColor: theme.road.now,
        opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1.3, 2.6] }) }],
      }}
    />
  );
};

const circleStyle = (theme, status, r) => {
  const base = { width: r * 2, height: r * 2, borderRadius: r };
  switch (status) {
    case STOP_STATUS.done:
      return [base, { backgroundColor: theme.road.done }];
    case STOP_STATUS.current:
      return [base, { backgroundColor: theme.road.now }];
    case STOP_STATUS.skipped:
      return [
        base,
        { backgroundColor: theme.card, borderWidth: 1.5, borderColor: theme.road.edge, borderStyle: 'dashed' },
      ];
    default:
      return [base, { backgroundColor: theme.card, borderWidth: 1.5, borderColor: theme.road.edge }];
  }
};

const ALIGN = { left: 'flex-start', center: 'center', right: 'flex-end' };

// A label's box is the whole strip of road it may use; the touchable inside
// hugs the text, so only the words (not the empty road beside them) react
// to a tap. The circle carries the accessibility role and label for both,
// so a screen reader meets each stop once.
const Label = ({ box, onPress, children }) => {
  const styles = useStyles(makeStyles);
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.label,
        {
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          alignItems: ALIGN[box.align],
          justifyContent: box.align === 'center' ? 'flex-start' : 'center',
        },
      ]}
    >
      <TouchableOpacity
        style={styles.labelTouch}
        activeOpacity={0.8}
        onPress={onPress}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        {children}
      </TouchableOpacity>
    </View>
  );
};

const DayNode = ({ node, onPress }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const { row, x, y, label } = node;
  const status = row.status;
  const counts = row.total ? `${row.done} of ${row.total} done` : 'No stops yet';
  const parts = [shortDate(row.date), counts];
  if (row.isToday) parts.push('today');
  return (
    <>
      <TouchableOpacity
        style={[styles.node, circleStyle(theme, status, MILESTONE_R), { left: x - MILESTONE_R, top: y - MILESTONE_R }]}
        activeOpacity={0.8}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Day ${row.dayNumber}, ${row.day.title}, ${counts}`}
        accessibilityHint="Edits this day"
      >
        {status === STOP_STATUS.done ? (
          <Ionicons name="checkmark" size={18} color={theme.road.ink} />
        ) : (
          <Text
            style={[styles.dayNumber, status === STOP_STATUS.current && styles.onRoad]}
            maxFontSizeMultiplier={FONT_SCALE_CAP}
          >
            {row.dayNumber}
          </Text>
        )}
      </TouchableOpacity>
      <Label box={label} onPress={onPress}>
        <View style={styles.dayTitleRow}>
          <Text style={styles.dayTitle} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE_CAP}>
            Day {row.dayNumber} · {row.day.title}
          </Text>
          <Ionicons name="pencil" size={11} color={theme.accentGreen} style={styles.pencil} />
        </View>
        <Text style={styles.dayMeta} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE_CAP}>
          {parts.filter(Boolean).join(' · ')}
        </Text>
      </Label>
    </>
  );
};

const StopNode = ({ node, onPress }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const { stop, x, y, label } = node;
  const { status, activity } = stop;
  const done = status === STOP_STATUS.done;
  const current = status === STOP_STATUS.current;
  const skipped = status === STOP_STATUS.skipped;

  return (
    <>
      {current && <PulseRing x={x} y={y} />}
      <TouchableOpacity
        style={[styles.node, circleStyle(theme, status, STOP_R), { left: x - STOP_R, top: y - STOP_R }]}
        activeOpacity={0.8}
        onPress={onPress}
        hitSlop={styles.hitSlop}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`${activity.title}, ${STATUS_WORD[status]}`}
      >
        {done ? (
          <Ionicons name="checkmark" size={13} color={theme.road.ink} />
        ) : skipped ? (
          <Ionicons name="close" size={11} color={theme.textMuted} />
        ) : null}
      </TouchableOpacity>
      <Label box={label} onPress={onPress}>
        <Text
          style={[
            styles.stopTitle,
            { textAlign: label.align },
            current && styles.stopTitleNow,
            done && styles.stopTitleDone,
            skipped && styles.stopTitleSkipped,
          ]}
          numberOfLines={label.align === 'center' ? 2 : 1}
          maxFontSizeMultiplier={FONT_SCALE_CAP}
        >
          {activity.title}
        </Text>
      </Label>
    </>
  );
};

const AddNode = ({ node, onPress }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <>
      <TouchableOpacity
        style={[styles.node, styles.addNode, { left: node.x - MILESTONE_R, top: node.y - MILESTONE_R }]}
        activeOpacity={0.8}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Add day"
      >
        <Ionicons name="add" size={20} color={theme.accentGreen} />
      </TouchableOpacity>
      <Label box={node.label} onPress={onPress}>
        <Text style={styles.addText} maxFontSizeMultiplier={FONT_SCALE_CAP}>
          Add Day
        </Text>
        <Text style={styles.dayMeta} maxFontSizeMultiplier={FONT_SCALE_CAP}>
          The road goes on from here
        </Text>
      </Label>
    </>
  );
};

const ItineraryRoadmap = ({ progress, onToggleStop, onAddDay, onEditDay, header }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const [outerWidth, setOuterWidth] = useState(0);
  // The road sits inside the list's side padding.
  const width = Math.max(0, outerWidth - 2 * spacing.md);
  const scrollRef = useRef(null);
  const scrolledTo = useRef(null);
  // Where the road starts inside the scroll content (under the header and
  // the top padding) and how tall that content is. A scroll is only asked
  // for once both are known: one sent before the native layout is clamped
  // to the top, and the stop's y alone would land it a header too low.
  const roadTop = useRef(null);
  const contentHeight = useRef(0);

  const laid = useMemo(() => (width > 0 ? layoutRoadmap(progress, width) : null), [progress, width]);
  const current = laid?.nodes.find((n) => n.kind === 'stop' && n.stop === progress.currentStop);

  // Open on where the group is: once per current stop, so a member's own
  // scrolling is not fought every time the clock or a tick moves the marker.
  const currentKey = progress.currentStop?.id ?? (progress.allDone ? 'end' : 'start');
  const scrollToCurrent = () => {
    if (!laid || scrolledTo.current === currentKey) return;
    if (!current) {
      scrolledTo.current = currentKey;
      return;
    }
    if (roadTop.current == null) return;
    const target = roadTop.current + current.y;
    if (contentHeight.current < target) return;
    scrolledTo.current = currentKey;
    scrollRef.current?.scrollTo({ y: Math.max(0, target - 170), animated: false });
  };
  useEffect(scrollToCurrent);

  return (
    <View style={styles.flex} onLayout={(e) => setOuterWidth(e.nativeEvent.layout.width)}>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={(_w, h) => {
          contentHeight.current = h;
          scrollToCurrent();
        }}
      >
        {header}
        {laid && (
          <View
            style={{ height: laid.height, width }}
            onLayout={(e) => {
              roadTop.current = e.nativeEvent.layout.y;
              scrollToCurrent();
            }}
          >
            <Svg width={width} height={laid.height} style={StyleSheet.absoluteFill}>
              <Path
                d={laid.roadPath}
                stroke={theme.road.base}
                strokeWidth={3}
                fill="none"
                strokeLinecap="round"
                strokeDasharray="6 6"
              />
              {!!laid.travelledPath && (
                <Path d={laid.travelledPath} stroke={theme.road.done} strokeWidth={3} fill="none" strokeLinecap="round" />
              )}
              {current && <Circle cx={current.x} cy={current.y} r={STOP_R + 5} fill={theme.road.now} opacity={0.28} />}
            </Svg>
            {laid.nodes.map((node) => {
              if (node.kind === 'day') {
                return <DayNode key={node.key} node={node} onPress={() => onEditDay?.(node.row.day)} />;
              }
              if (node.kind === 'stop') {
                return (
                  <StopNode
                    key={node.key}
                    node={node}
                    onPress={() =>
                      onToggleStop?.(node.stop.dayId, node.stop.activity._id, nextDoneFor(node.stop))
                    }
                  />
                );
              }
              return <AddNode key={node.key} node={node} onPress={onAddDay} />;
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const makeStyles = (theme) => StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
  node: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  addNode: {
    width: MILESTONE_R * 2,
    height: MILESTONE_R * 2,
    borderRadius: MILESTONE_R,
    backgroundColor: theme.card,
    borderWidth: 1.5,
    borderColor: 'rgba(0,196,208,0.55)',
    borderStyle: 'dashed',
  },
  dayNumber: { color: theme.textMuted, fontSize: 14, fontWeight: '800' },
  onRoad: { color: theme.road.ink },
  label: { position: 'absolute' },
  labelTouch: { maxWidth: '100%' },
  dayTitleRow: { flexDirection: 'row', alignItems: 'center' },
  dayTitle: { color: theme.text, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  pencil: { marginLeft: 6 },
  dayMeta: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
  addText: { color: theme.accentGreen, fontSize: 14, fontWeight: '700' },
  stopTitle: { color: theme.textSoft, fontSize: 12.5, lineHeight: 16 },
  stopTitleNow: { color: theme.text, fontSize: 13.5, lineHeight: 17, fontWeight: '700' },
  stopTitleDone: { color: theme.textMuted },
  stopTitleSkipped: { color: theme.textMuted, textDecorationLine: 'line-through' },
});

export default ItineraryRoadmap;
