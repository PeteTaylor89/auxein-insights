// navigation/AppNavigator.js — Main app navigation (bottom tabs + stacks)
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import { colors, fontSize } from '../styles/theme';

import HomeScreen from '../screens/HomeScreen';
import TasksScreen from '../screens/TasksScreen';
import TaskDetailScreen from '../screens/TaskDetailScreen';
import ObservationsScreen from '../screens/ObservationsScreen';
import SpotCaptureScreen from '../screens/SpotCaptureScreen';
import AssetsScreen from '../screens/AssetsScreen';
import AssetDetailScreen from '../screens/AssetDetailScreen';
import ProfileScreen from '../screens/ProfileScreen';
import NotificationsScreen from '../screens/NotificationsScreen';

const Tab = createBottomTabNavigator();
const TaskStack = createNativeStackNavigator();
const ObsStack = createNativeStackNavigator();
const AssetStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();

const TAB_ICONS = { Home: '🏠', Tasks: '📋', Observe: '🔍', Assets: '⚙️', Profile: '👤' };

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.primary,
  headerTitleStyle: { fontWeight: '600', fontSize: fontSize.md },
};

function TasksStackNavigator() {
  return (
    <TaskStack.Navigator screenOptions={stackScreenOptions}>
      <TaskStack.Screen name="TaskList" component={TasksScreen} options={{ title: 'My Tasks' }} />
      <TaskStack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: 'Task Detail' }} />
    </TaskStack.Navigator>
  );
}

function ObservationsStackNavigator() {
  return (
    <ObsStack.Navigator screenOptions={stackScreenOptions}>
      <ObsStack.Screen name="ObsList" component={ObservationsScreen} options={{ title: 'Observations' }} />
      <ObsStack.Screen name="SpotCapture" component={SpotCaptureScreen} options={{ title: 'Capture Spot' }} />
    </ObsStack.Navigator>
  );
}

function AssetsStackNavigator() {
  return (
    <AssetStack.Navigator screenOptions={stackScreenOptions}>
      <AssetStack.Screen name="AssetList" component={AssetsScreen} options={{ title: 'Assets' }} />
      <AssetStack.Screen name="AssetDetail" component={AssetDetailScreen} options={{ title: 'Asset Detail' }} />
    </AssetStack.Navigator>
  );
}

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={stackScreenOptions}>
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} options={{ title: 'Profile' }} />
      <ProfileStack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
    </ProfileStack.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>
            {TAB_ICONS[route.name] || '•'}
          </Text>
        ),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: '500' },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.primary,
        headerTitleStyle: { fontWeight: '600', fontSize: fontSize.md },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Tasks" component={TasksStackNavigator} options={{ headerShown: false }} />
      <Tab.Screen name="Observe" component={ObservationsStackNavigator} options={{ headerShown: false }} />
      <Tab.Screen name="Assets" component={AssetsStackNavigator} options={{ headerShown: false }} />
      <Tab.Screen name="Profile" component={ProfileStackNavigator} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}
