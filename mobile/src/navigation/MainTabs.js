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

const ICONS = {
  Home: ['home', 'home-outline'],
  Groups: ['people', 'people-outline'],
  Trips: ['airplane', 'airplane-outline'],
  Expenses: ['receipt', 'receipt-outline'],
  Profile: ['person', 'person-outline'],
};

const MainTabs = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: dark.accentGreen,
      tabBarInactiveTintColor: dark.textMuted,
      tabBarStyle: {
        backgroundColor: '#070C0F',
        borderTopColor: dark.border,
        borderTopWidth: 1,
        height: Platform.OS === 'ios' ? 84 : 64,
        paddingTop: 6,
        paddingBottom: Platform.OS === 'ios' ? 26 : 8,
      },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      tabBarIcon: ({ focused, color, size }) => {
        const [active, inactive] = ICONS[route.name];
        return <Ionicons name={focused ? active : inactive} size={size - 2} color={color} />;
      },
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
