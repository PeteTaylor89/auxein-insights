// navigation/AppNavigator.js — Main app navigation (bottom tabs + stacks)
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontSize } from '../styles/theme';
import { useAuth } from '../contexts/AuthContext';

import HomeScreen from '../screens/HomeScreen';
import ContractorHomeScreen from '../screens/ContractorHomeScreen';
import ContractorProfileScreen from '../screens/ContractorProfileScreen';
import EditContractorProfileScreen from '../screens/EditContractorProfileScreen';
import EditContractorInsuranceScreen from '../screens/EditContractorInsuranceScreen';
import ChangeContractorPasswordScreen from '../screens/ChangeContractorPasswordScreen';
import UploadInsuranceDocScreen from '../screens/UploadInsuranceDocScreen';
import TasksScreen from '../screens/TasksScreen';
import TaskDetailScreen from '../screens/TaskDetailScreen';
import ObservationsScreen from '../screens/ObservationsScreen';
import SpotCaptureScreen from '../screens/SpotCaptureScreen';
import AssetsScreen from '../screens/AssetsScreen';
import AssetDetailScreen from '../screens/AssetDetailScreen';
import ProfileScreen from '../screens/ProfileScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import CreateIncidentScreen from '../screens/CreateIncidentScreen';
import CreateAssetScreen from '../screens/CreateAssetScreen';
import CreateRiskScreen from '../screens/CreateRiskScreen';
import CreateTaskScreen from '../screens/CreateTaskScreen';
import CreateVisitorScreen from '../screens/CreateVisitorScreen';
import VisitorsScreen from '../screens/VisitorsScreen';
import MapScreen from '../screens/MapScreen';
import RelationshipsScreen from '../screens/RelationshipsScreen';
import RelationshipDetailScreen from '../screens/RelationshipDetailScreen';

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const TaskStack = createNativeStackNavigator();
const ObsStack = createNativeStackNavigator();
const AssetStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();
const ContractsStack = createNativeStackNavigator();

const TAB_ICONS = {
  Home: 'home',
  Tasks: 'clipboard',
  Map: 'map',
  Observe: 'search',
  Assets: 'package',
  Relationships: 'briefcase',
  Profile: 'user',
};

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.primary,
  headerTitleStyle: { fontWeight: '600', fontSize: fontSize.md },
  headerShadowVisible: false,
};

function HomeStackNavigator() {
  const { isContractor } = useAuth();
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions}>
      <HomeStack.Screen
        name="HomeMain"
        component={isContractor ? ContractorHomeScreen : HomeScreen}
        options={{ headerShown: false }}
      />
      <HomeStack.Screen name="CreateIncident" component={CreateIncidentScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="CreateRisk" component={CreateRiskScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="CreateVisitor" component={CreateVisitorScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="Visitors" component={VisitorsScreen} options={{ headerShown: false }} />
    </HomeStack.Navigator>
  );
}

function TasksStackNavigator() {
  return (
    <TaskStack.Navigator screenOptions={stackScreenOptions}>
      <TaskStack.Screen name="TaskList" component={TasksScreen} options={{ title: 'My Tasks' }} />
      <TaskStack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: 'Task Detail' }} />
      <TaskStack.Screen name="CreateTask" component={CreateTaskScreen} options={{ headerShown: false }} />
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
      <AssetStack.Screen name="CreateAsset" component={CreateAssetScreen} options={{ headerShown: false }} />
    </AssetStack.Navigator>
  );
}

function ContractsStackNavigator() {
  return (
    <ContractsStack.Navigator screenOptions={stackScreenOptions}>
      <ContractsStack.Screen
        name="ContractsList"
        component={RelationshipsScreen}
        options={{ headerShown: false }}
      />
      <ContractsStack.Screen
        name="RelationshipDetail"
        component={RelationshipDetailScreen}
        options={{ title: 'Contract' }}
      />
    </ContractsStack.Navigator>
  );
}

function ProfileStackNavigator() {
  const { isContractor } = useAuth();
  return (
    <ProfileStack.Navigator screenOptions={stackScreenOptions}>
      <ProfileStack.Screen
        name="ProfileMain"
        component={isContractor ? ContractorProfileScreen : ProfileScreen}
        options={{ title: 'Profile' }}
      />
      <ProfileStack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
      {isContractor && (
        <>
          <ProfileStack.Screen
            name="EditContractorProfile"
            component={EditContractorProfileScreen}
            options={{ title: 'Edit profile' }}
          />
          <ProfileStack.Screen
            name="EditContractorInsurance"
            component={EditContractorInsuranceScreen}
            options={{ title: 'Insurance' }}
          />
          <ProfileStack.Screen
            name="ChangeContractorPassword"
            component={ChangeContractorPasswordScreen}
            options={{ title: 'Change password' }}
          />
          <ProfileStack.Screen
            name="UploadInsuranceDoc"
            component={UploadInsuranceDocScreen}
            options={{ title: 'Add document' }}
          />
        </>
      )}
    </ProfileStack.Navigator>
  );
}

export default function AppNavigator() {
  // Android 3-button nav / gesture bar lives in the bottom safe-area inset.
  // Bake it into the tab bar so the labels don't get covered by system chrome.
  const insets = useSafeAreaInsets();
  const { isContractor } = useAuth();
  const tabContentHeight = 62;
  const tabContentPadBottom = 8;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => (
          <Feather
            name={TAB_ICONS[route.name] || 'circle'}
            size={26}
            color={focused ? colors.primary : colors.textMuted}
          />
        ),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingTop: 6,
          height: tabContentHeight + tabContentPadBottom + insets.bottom,
          paddingBottom: tabContentPadBottom + insets.bottom,
        },
        tabBarLabelStyle: { fontSize: fontSize.sm, fontWeight: '500' },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.primary,
        headerTitleStyle: { fontWeight: '600', fontSize: fontSize.md },
        headerShadowVisible: false,
      })}
    >
      <Tab.Screen name="Home" component={HomeStackNavigator} options={{ headerShown: false }} />
      <Tab.Screen name="Tasks" component={TasksStackNavigator} options={{ headerShown: false }} />
      <Tab.Screen name="Map" component={MapScreen} options={{ title: 'Map' }} />
      {!isContractor && (
        <Tab.Screen name="Observe" component={ObservationsStackNavigator} options={{ headerShown: false }} />
      )}
      {isContractor ? (
        <Tab.Screen
          name="Relationships"
          component={ContractsStackNavigator}
          options={{ title: 'Contracts', headerShown: false }}
        />
      ) : (
        <Tab.Screen name="Assets" component={AssetsStackNavigator} options={{ headerShown: false }} />
      )}
      <Tab.Screen
        name="Profile"
        component={ProfileStackNavigator}
        options={{ headerShown: false }}
        listeners={({ navigation }) => ({
          // Tapping the Profile tab always returns to ProfileMain.
          // Otherwise, deep-linking into Notifications via the Home bell leaves
          // the stack on Notifications across tab switches.
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('Profile', { screen: 'ProfileMain' });
          },
        })}
      />
    </Tab.Navigator>
  );
}
