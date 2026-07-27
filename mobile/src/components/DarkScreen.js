import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { dark } from '../theme';

// Dark scaffold for the non-auth screens: flat deep background (#05070A) with
// cards raised on #0E1014, per the dashboard design.
const DarkScreen = ({ children, edges = ['top'], style }) => (
  <View style={styles.screen}>
    <StatusBar style="light" />
    <SafeAreaView style={[styles.flex, style]} edges={edges}>
      {children}
    </SafeAreaView>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: dark.background },
  flex: { flex: 1 },
});

export default DarkScreen;
