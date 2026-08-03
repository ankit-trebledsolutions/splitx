import React from 'react';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
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

const MainTabs = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: dark.tabActive,
      tabBarInactiveTintColor: dark.textMuted,
      tabBarStyle: {
        backgroundColor: '#0E1014',
        borderTopColor: dark.border,
        borderTopWidth: 1,
        height: Platform.OS === 'ios' ? 84 : 64,
        paddingTop: 6,
        paddingBottom: Platform.OS === 'ios' ? 26 : 8,
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

export default MainTabs;
