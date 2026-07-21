import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';
import SplixLogo from '../components/SplixLogo';

const { width, height } = Dimensions.get('window');

// Large faint chevron outlines echoing the logo mark, per the Figma splash.
const BackgroundChevrons = () => (
  <Svg
    width={width}
    height={height}
    viewBox={`0 0 ${width} ${height}`}
    style={StyleSheet.absoluteFill}
  >
    <Path
      d={`M ${width * 0.55} ${-height * 0.05}
          L ${width * 0.12} ${height * 0.28}
          L ${width * 0.55} ${height * 0.6}`}
      stroke="rgba(255,255,255,0.07)"
      strokeWidth="1.5"
      fill="none"
    />
    <Path
      d={`M ${width * 0.42} ${height * 0.3}
          L ${width * 0.95} ${height * 0.62}
          L ${width * 0.42} ${height * 0.95}`}
      stroke="rgba(255,255,255,0.07)"
      strokeWidth="1.5"
      fill="none"
    />
  </Svg>
);

const SplashScreen = () => (
  <LinearGradient
    colors={['#0A1614', '#060D11', '#03070B']}
    start={{ x: 0.1, y: 0 }}
    end={{ x: 0.9, y: 1 }}
    style={styles.container}
  >
    <StatusBar style="light" />
    <BackgroundChevrons />
    <View style={styles.brandRow}>
      <SplixLogo size={88} />
      <Text style={styles.wordmark}>Splix</Text>
    </View>
  </LinearGradient>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  wordmark: {
    color: '#FFFFFF',
    fontSize: 56,
    fontWeight: '800',
    letterSpacing: 1,
  },
});

export default SplashScreen;
