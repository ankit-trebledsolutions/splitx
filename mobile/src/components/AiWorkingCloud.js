import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dark } from '../theme';

const SPARKLE_BLUE = '#4A8CFF';

const FLOAT_MS = 1400; // one way: up, or back down
const STEP_MS = 260; // delay between one sparkle lighting up and the next
const TWINKLE_MS = 520;

// Where each sparkle sits around the cloud, and how big it is, as fractions of `size`.
const SPARKLES = [
  { key: 'top-right', top: 0, right: 0, scale: 0.36 },
  { key: 'top-left', top: 0.16, left: 0, scale: 0.28 },
  { key: 'bottom-right', bottom: 0, right: 0.14, scale: 0.24 },
];

/**
 * The "AI is working" mark: a cloud that floats and breathes while three
 * sparkles twinkle around it in turn. `size` is the cloud's icon size, so the
 * same component serves the slim banner (18) and the Itinerary tab (72).
 * Transform and opacity only, so every frame stays on the native driver.
 */
const AiWorkingCloud = ({ size = 72, style }) => {
  const float = useRef(new Animated.Value(0)).current;
  const twinkles = useRef(SPARKLES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const drift = (toValue) =>
      Animated.timing(float, {
        toValue,
        duration: FLOAT_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      });
    const bob = Animated.loop(Animated.sequence([drift(1), drift(0)]));

    // The TypingDots recipe: each value pulses 0 -> 1 -> 0, one after another.
    const pulse = (value) =>
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: TWINKLE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: TWINKLE_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]);
    const twinkle = Animated.loop(
      Animated.sequence([Animated.stagger(STEP_MS, twinkles.map(pulse)), Animated.delay(STEP_MS)])
    );

    bob.start();
    twinkle.start();
    return () => {
      bob.stop();
      twinkle.stop();
    };
  }, [float, twinkles]);

  // A 4px rise suits the large cloud; the banner's small one gets half of it.
  const rise = size >= 36 ? -4 : -2;
  const place = (fraction) => (fraction === undefined ? undefined : fraction * size);

  return (
    <View style={[styles.wrap, { width: size * 1.5, height: size * 1.3 }, style]}>
      <Animated.View
        style={{
          transform: [
            { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, rise] }) },
            { scale: float.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) },
          ],
        }}
      >
        <Ionicons name="cloud" size={size} color={dark.accentGreen} />
      </Animated.View>

      {SPARKLES.map((sparkle, index) => (
        <Animated.View
          key={sparkle.key}
          pointerEvents="none"
          style={[
            styles.sparkle,
            {
              top: place(sparkle.top),
              bottom: place(sparkle.bottom),
              left: place(sparkle.left),
              right: place(sparkle.right),
              opacity: twinkles[index],
              transform: [
                {
                  scale: twinkles[index].interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.6, 1.1],
                  }),
                },
              ],
            },
          ]}
        >
          <Ionicons
            name="sparkles"
            size={Math.max(6, Math.round(size * sparkle.scale))}
            color={SPARKLE_BLUE}
          />
        </Animated.View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  sparkle: { position: 'absolute' },
});

export default AiWorkingCloud;
