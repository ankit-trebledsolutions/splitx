import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { dark } from '../theme';

// Dark scaffold for the non-auth screens: flat deep background (#05070A) with
// cards raised on #0E1014, per the dashboard design.
//
// The app draws edge-to-edge, so the window runs underneath the system
// navigation bar (48dp with Android's 3-button navigation). Both edges are
// padded by default so nothing sits under it. Pass edges={['top']} only when
// something else already clears the bottom: a screen inside the tab bar, or
// one whose own bottom bar pads itself (the chat composer).
//
// The inner View matters: a child pinned with position 'absolute' measures
// from its parent's edge and ignores that parent's padding, so pinned footers
// and floating buttons need a parent that already ends above the inset.
// For the screens that clear the bottom inset themselves.
export const TOP_ONLY = ['top'];
const BOTH = ['top', 'bottom'];

const DarkScreen = ({ children, edges = BOTH, style }) => (
  <View style={styles.screen}>
    <StatusBar style="light" />
    <SafeAreaView style={styles.flex} edges={edges}>
      <View style={[styles.flex, style]}>{children}</View>
    </SafeAreaView>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: dark.background },
  flex: { flex: 1 },
});

export default DarkScreen;
