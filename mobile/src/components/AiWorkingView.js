import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import AiWorkingCloud from './AiWorkingCloud';
import { dark, spacing } from '../theme';

const CAPTIONS = [
  'Reading your trip details',
  'Mapping each day',
  'Picking places to eat',
  'Checking the timings',
];
const CAPTION_MS = 4000;
const FADE_MS = 450;
const SLOTS = [0, 1];

/**
 * Fills the Itinerary tab while AI plans a trip that has no days yet, so the
 * wait reads as work in progress rather than as an empty itinerary. It is an
 * ordinary view, not an overlay: every other tab stays usable meanwhile.
 *   title: the same line the banner shows ("AI is planning your itinerary").
 */
const AiWorkingView = ({ title }) => {
  // Two stacked lines take turns. The hidden one is handed the next caption,
  // then the pair cross-fades: `mix` is 0 while the first shows, 1 for the second.
  const mix = useRef(new Animated.Value(0)).current;
  const turn = useRef(0);
  const [lines, setLines] = useState([0, 1]);

  useEffect(() => {
    const timer = setInterval(() => {
      turn.current += 1;
      const slot = turn.current % SLOTS.length;
      const caption = turn.current % CAPTIONS.length;
      setLines((prev) => prev.map((shown, index) => (index === slot ? caption : shown)));
      Animated.timing(mix, {
        toValue: slot,
        duration: FADE_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start();
    }, CAPTION_MS);
    return () => {
      clearInterval(timer);
      mix.stopAnimation();
    };
  }, [mix]);

  const fades = [mix.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), mix];

  return (
    <View style={styles.wrap}>
      <AiWorkingCloud size={72} />
      <Text style={styles.title}>{title}</Text>

      <View style={styles.captions}>
        {SLOTS.map((slot) => (
          <Animated.Text key={slot} style={[styles.caption, { opacity: fades[slot] }]}>
            {CAPTIONS[lines[slot]]}
          </Animated.Text>
        ))}
      </View>

      <Text style={styles.subtext}>About a minute. You can keep using the app.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    // Keeps the group optically centred above the floating "+" button.
    paddingBottom: 100,
  },
  title: {
    color: dark.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.md,
  },
  captions: { alignSelf: 'stretch', height: 20, marginTop: spacing.sm },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    color: dark.accentGreen,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  subtext: {
    color: dark.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});

export default AiWorkingView;
