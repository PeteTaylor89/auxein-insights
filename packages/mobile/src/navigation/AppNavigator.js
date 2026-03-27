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
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();
const TaskStack = createNativeStackNavigator();
const ObsStack = createNativeStackNavigator();

const TAB_ICONS = { Home: '🏠', Tasks: '📋', Observe: '🔍', Profile: '👤' };

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
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
