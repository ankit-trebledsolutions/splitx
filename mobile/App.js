import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { StreamVideoProvider } from './src/context/StreamVideoProvider';
import { ActiveCallProvider } from './src/context/ActiveCallProvider';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StreamVideoProvider>
          <ActiveCallProvider>
            <NavigationContainer>
              <StatusBar style="dark" />
              <RootNavigator />
            </NavigationContainer>
          </ActiveCallProvider>
        </StreamVideoProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
