import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import SplixLogo from '../components/SplixLogo';
import SplashGlow from '../assets/splash-glow.svg';
import SplashChevrons from '../assets/splash-chevrons.svg';
import Wordmark from '../assets/wordmark.svg';

const { width, height } = Dimensions.get('window');

// Both assets were exported from a 402 x 874 Figma frame.
const FRAME_W = 402;
const CHEVRON_RATIO = 639 / FRAME_W;

const SplashScreen = () => (
  <View style={styles.container}>
    <StatusBar style="light" />
    <SplashGlow
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
      style={StyleSheet.absoluteFill}
    />
    <SplashChevrons
      width={width}
      height={width * CHEVRON_RATIO}
      style={styles.chevrons}
    />
    <View style={styles.brandRow}>
      <SplixLogo size={88} />
      <Wordmark width={141} height={56} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevrons: {
    position: 'absolute',
    left: 0,
    top: (height - width * CHEVRON_RATIO) / 2,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
});

export default SplashScreen;
