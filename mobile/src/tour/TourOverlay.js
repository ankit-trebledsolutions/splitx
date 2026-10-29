import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  BackHandler,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, useStyles } from '../theme';
import { useTour, useTourRegistry } from './TourProvider';

/**
 * The spotlight. Mounted once at the app root, over the navigator, so it can
 * dim the whole screen, bottom tab bar included.
 *
 * For the current step it asks the registered target for its position, cuts
 * a rounded hole there in a dark layer (an SVG mask, so the corners are real),
 * draws a pulsing ring around it and puts the card below the hole, or above it
 * when there is no room. Touches outside the hole are swallowed; inside it they
 * reach the real control on 'tap' steps, and are swallowed too on the others.
 *
 * Positions come from `measure`'s page coordinates, which count from the top
 * of the app's root view: edge-to-edge, that is the top of the screen, and it
 * is where this overlay's own (0, 0) is. (measureInWindow starts below the
 * status bar on Android, which would put every hole too high.)
 *
 * Between steps the screen stays dimmed while the next target is found, so
 * the tour reads as one thing. A target that cannot be measured (its screen
 * is still mounting, or it stepped out of the registry because its screen is
 * covered) is given a moment; after that the dim lifts and the tour waits,
 * unseen, for the target to come back.
 */

const DIM = 'rgba(0,0,0,0.76)';
const CARD_MARGIN = 18;
const HOLE_PAD = 7;
const HOLE_RADIUS = 12;
const RING_GAP = 4;
const CARET = 14;
const CARD_GAP = 14;
// Layout settles after a step change (a tab switch moves the + button): the
// target is measured once soon, and once more after any such move.
const MEASURE_DELAYS = [80, 360];
// How long a step may hold the dim with nothing to point at.
const GIVE_UP_MS = 1500;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const noop = () => {};

// The hole around a target: padded, and a circle for round buttons.
const holeFor = (rect, step) => {
  if (step.shape === 'circle') {
    const size = Math.max(rect.width, rect.height) + HOLE_PAD * 2;
    return {
      x: rect.x + rect.width / 2 - size / 2,
      y: rect.y + rect.height / 2 - size / 2,
      width: size,
      height: size,
      radius: size / 2,
    };
  }
  return {
    x: rect.x - HOLE_PAD,
    y: rect.y - HOLE_PAD,
    width: rect.width + HOLE_PAD * 2,
    height: rect.height + HOLE_PAD * 2,
    radius: HOLE_RADIUS,
  };
};

const TourOverlay = () => {
  const styles = useStyles(makeStyles);
  const { active, next, skip } = useTour();
  const { targets, registryVersion } = useTourRegistry();
  const insets = useSafeAreaInsets();

  const [frame, setFrame] = useState(null);
  // The last step that was placed: { stepKey, hole } (hole null for a centred
  // card). Stale once the step moves on, until the new target is measured.
  const [shown, setShown] = useState(null);
  const [cardHeight, setCardHeight] = useState(0);

  const fade = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  const step = active?.step ?? null;
  const stepKey = active ? `${active.chapter}.${step.key}` : null;
  const stepRef = useRef(step);
  stepRef.current = step;

  // Find, prepare and measure the step's target. Re-runs when the step changes
  // and when a target joins or leaves the registry.
  useEffect(() => {
    if (!stepKey) {
      setShown(null);
      return undefined;
    }
    const current = stepRef.current;
    if (!current.target) {
      setShown({ stepKey, hole: null });
      return undefined;
    }
    let cancelled = false;
    const giveUp = setTimeout(() => {
      if (!cancelled) setShown(null);
    }, GIVE_UP_MS);
    const entry = targets.current.get(current.target);
    if (entry) {
      (async () => {
        try {
          await entry.prepare?.();
        } catch {
          // A scroll that failed still leaves something to measure.
        }
        for (const wait of MEASURE_DELAYS) {
          await delay(wait);
          if (cancelled) return;
          let rect = null;
          try {
            rect = await entry.measure();
          } catch {
            rect = null;
          }
          if (cancelled) return;
          if (rect) {
            clearTimeout(giveUp);
            setShown({ stepKey, hole: holeFor(rect, current) });
          }
        }
      })();
    }
    return () => {
      cancelled = true;
      clearTimeout(giveUp);
    };
  }, [stepKey, registryVersion, targets]);

  const render = Boolean(active && shown && frame);
  const placed = render && shown.stepKey === stepKey;
  const hole = placed ? shown.hole : null;

  // Fade the card in on every step; the dim stays put between steps.
  useEffect(() => {
    if (!placed) return;
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [placed, stepKey, fade]);

  useEffect(() => {
    if (!render) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [render, pulse]);

  // The phone's back button leaves the tour, the same as Skip.
  useEffect(() => {
    if (!render) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      skip();
      return true;
    });
    return () => sub.remove();
  }, [render, skip]);

  const onFrame = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    setFrame({ width, height });
  }, []);

  if (!active) return null;

  const tapThrough = Boolean(hole) && step.advance === 'tap';
  const isLast = active.index + 1 >= active.total;

  // Card below the hole when it fits above the bottom inset, else above it.
  // Until the card has reported its height it is laid out invisibly.
  let cardTop = 0;
  let caretUp = true; // caret on the card's top edge, pointing up at the hole
  let caretX = 0;
  if (frame && hole) {
    const below = hole.y + hole.height + CARD_GAP;
    const fitsBelow = below + cardHeight <= frame.height - insets.bottom - spacing.md;
    if (fitsBelow) {
      cardTop = below;
    } else {
      cardTop = Math.max(insets.top + spacing.md, hole.y - CARD_GAP - cardHeight);
      caretUp = false;
    }
    const centre = hole.x + hole.width / 2;
    caretX = Math.min(
      Math.max(centre - CARET / 2, CARD_MARGIN + radius.lg),
      frame.width - CARD_MARGIN - radius.lg - CARET
    );
  } else if (frame) {
    cardTop = Math.max(insets.top, (frame.height - cardHeight) / 2);
  }
  const cardReady = cardHeight > 0;

  return (
    <View style={styles.fill} pointerEvents="box-none" onLayout={onFrame}>
      {render && (
        <>
          <Svg width={frame.width} height={frame.height} style={styles.fill} pointerEvents="none">
            <Defs>
              <Mask
                id="tour-hole"
                maskUnits="userSpaceOnUse"
                x="0"
                y="0"
                width={frame.width}
                height={frame.height}
              >
                <Rect x="0" y="0" width={frame.width} height={frame.height} fill="#fff" />
                {hole && (
                  <Rect
                    x={hole.x}
                    y={hole.y}
                    width={hole.width}
                    height={hole.height}
                    rx={hole.radius}
                    ry={hole.radius}
                    fill="#000"
                  />
                )}
              </Mask>
            </Defs>
            <Rect
              x="0"
              y="0"
              width={frame.width}
              height={frame.height}
              fill={DIM}
              mask="url(#tour-hole)"
            />
          </Svg>

          {/* Touch blockers: everything but the hole. On 'next' steps the hole
              is covered as well, so the control under it cannot be set off
              while it is being described. */}
          {hole ? (
            <>
              <Pressable
                onPress={noop}
                style={[styles.block, { top: 0, left: 0, right: 0, height: hole.y }]}
              />
              <Pressable
                onPress={noop}
                style={[styles.block, { top: hole.y + hole.height, left: 0, right: 0, bottom: 0 }]}
              />
              <Pressable
                onPress={noop}
                style={[styles.block, { top: hole.y, left: 0, width: hole.x, height: hole.height }]}
              />
              <Pressable
                onPress={noop}
                style={[
                  styles.block,
                  { top: hole.y, left: hole.x + hole.width, right: 0, height: hole.height },
                ]}
              />
              {!tapThrough && (
                <Pressable
                  onPress={noop}
                  style={[
                    styles.block,
                    { top: hole.y, left: hole.x, width: hole.width, height: hole.height },
                  ]}
                />
              )}
            </>
          ) : (
            <Pressable onPress={noop} style={StyleSheet.absoluteFill} />
          )}

          {hole && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ring,
                {
                  left: hole.x - RING_GAP,
                  top: hole.y - RING_GAP,
                  width: hole.width + RING_GAP * 2,
                  height: hole.height + RING_GAP * 2,
                  borderRadius: hole.radius + RING_GAP,
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }),
                  transform: [
                    { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
                  ],
                },
              ]}
            />
          )}

          {placed && (
            <Animated.View
              pointerEvents="box-none"
              style={[styles.cardWrap, { top: cardTop, opacity: cardReady ? fade : 0 }]}
            >
              {hole && (
                <View
                  pointerEvents="none"
                  style={[
                    styles.caret,
                    { left: caretX - CARD_MARGIN },
                    caretUp ? styles.caretUp : styles.caretDown,
                  ]}
                />
              )}
              <View
                style={styles.card}
                onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
              >
                <Text style={styles.stepLabel}>
                  STEP {active.index + 1} OF {active.total}
                </Text>
                <Text style={styles.title}>{step.title}</Text>
                <Text style={styles.body}>{step.body}</Text>
                <View style={styles.actions}>
                  <TouchableOpacity onPress={skip} activeOpacity={0.7} hitSlop={styles.hitSlop}>
                    <Text style={styles.skip}>Skip tour</Text>
                  </TouchableOpacity>
                  {tapThrough ? (
                    <Text style={styles.hint}>Tap the highlight to continue</Text>
                  ) : (
                    <TouchableOpacity style={styles.next} onPress={next} activeOpacity={0.85}>
                      <Text style={styles.nextText}>
                        {step.primary ?? (isLast ? 'Done' : 'Next')}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </Animated.View>
          )}
        </>
      )}
    </View>
  );
};

const makeStyles = (theme) => StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
  block: { position: 'absolute' },
  ring: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: theme.tabActive,
  },
  cardWrap: {
    position: 'absolute',
    left: CARD_MARGIN,
    right: CARD_MARGIN,
  },
  card: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg + 4,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md - 2,
    paddingBottom: spacing.md - 4,
  },
  // A square turned 45°, half of it hidden behind the card.
  caret: {
    position: 'absolute',
    width: CARET,
    height: CARET,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    transform: [{ rotate: '45deg' }],
  },
  caretUp: { top: -CARET / 2 },
  caretDown: { bottom: -CARET / 2 },
  stepLabel: {
    color: theme.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  title: { color: theme.text, fontSize: 16, fontWeight: '800', marginTop: 4 },
  body: {
    color: theme.textSoft,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm + 4,
  },
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
  skip: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
  hint: { color: theme.tabActive, fontSize: 12, fontWeight: '600' },
  next: {
    backgroundColor: theme.accentFill,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: spacing.md + 2,
  },
  nextText: { color: '#04121C', fontSize: 13, fontWeight: '800' },
});

export default TourOverlay;
