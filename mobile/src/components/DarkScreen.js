import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import SplashGlow from '../assets/splash-glow.svg';

// Dark scaffold for the non-auth screens: same glow background as AuthLayout,
// but without the logo/title block so each screen owns its own header.
const DarkScreen = ({ children, edges = ['top'], style }) => (
  <View style={styles.screen}>
    <SplashGlow
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
      style={StyleSheet.absoluteFill}
    />
    <StatusBar style="light" />
    <SafeAreaView style={[styles.flex, style]} edges={edges}>
      {children}
    </SafeAreaView>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A' },
  flex: { flex: 1 },
});

export default DarkScreen;
