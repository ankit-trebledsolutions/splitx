import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen';
import MyGroupsScreen from '../screens/MyGroupsScreen';
import TripsScreen from '../screens/TripsScreen';
import ExpensesScreen from '../screens/ExpensesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { dark } from '../theme';

const Tab = createBottomTabNavigator();

// Outline glyphs in both states, per the design — only the tint changes.
const ICONS = {
  Home: 'home-outline',
  Groups: 'people-outline',
  Trips: 'briefcase-outline',
  Expenses: 'card-outline',
  Profile: 'person-outline',
};

// Visible height of the bar (icon + label) above the system inset.
const BAR_CONTENT_HEIGHT = 56;
// Padding under the labels on a device with no bottom inset at all.
const BAR_BASE_PADDING = 8;

const MainTabs = () => {
  const insets = useSafeAreaInsets();
  // The app renders edge-to-edge, so the window extends under the system
  // navigation bar. Android 3-button navigation has a ~48dp bar, gesture
  // navigation ~16-24dp, and iOS the home indicator. A fixed height put the
  // bar underneath the buttons in 3-button mode, so we grow the bar by the
  // live inset instead of hardcoding per platform.
  const bottomInset = Math.max(insets.bottom, BAR_BASE_PADDING);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: dark.tabActive,
        tabBarInactiveTintColor: dark.textMuted,
        tabBarStyle: {
          backgroundColor: '#0E1014',
          borderTopColor: dark.border,
          borderTopWidth: 1,
          height: BAR_CONTENT_HEIGHT + bottomInset,
          paddingTop: 6,
          paddingBottom: bottomInset,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={ICONS[route.name]} size={size - 2} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Groups" component={MyGroupsScreen} />
      <Tab.Screen name="Trips" component={TripsScreen} />
      <Tab.Screen name="Expenses" component={ExpensesScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

export default MainTabs;
