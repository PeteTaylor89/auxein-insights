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
import ContractorTasksScreen from '../screens/ContractorTasksScreen';
import CheckInScreen from '../screens/CheckInScreen';
import SiteSignOnScreen from '../screens/SiteSignOnScreen';
import CreateContractorAssignmentScreen from '../screens/CreateContractorAssignmentScreen';
import ContractorCreateIncidentScreen from '../screens/ContractorCreateIncidentScreen';
import ContractorCreateObservationScreen from '../screens/ContractorCreateObservationScreen';
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
import TimesheetScreen from '../screens/TimesheetScreen';
import TimesheetDayDetailScreen from '../screens/TimesheetDayDetailScreen';
import TimesheetEntryEditScreen from '../screens/TimesheetEntryEditScreen';

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const TaskStack = createNativeStackNavigator();
const ObsStack = createNativeStackNavigator();
const AssetStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();
const ContractsStack = createNativeStackNavigator();
const SignOnStack = createNativeStackNavigator();

const TAB_ICONS = {
  Home: 'home',
  Tasks: 'clipboard',
  Map: 'map',
  Observe: 'search',
  Assets: 'package',
  Relationships: 'briefcase',
  SignOn: 'home',
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
      {/* Signing on to a property is not a general_user feature — it is how
          anybody says "I am here now", and the headcount is only right if
          everyone is in it. Contractors keep their own CheckIn flow instead:
          a ContractorMovement already records their arrival, and a second
          SiteAttendance row would double-count them on the evacuation list. */}
      {!isContractor && (
        <HomeStack.Screen
          name="SiteSignOn"
          component={SiteSignOnScreen}
          options={{ headerShown: false }}
        />
      )}
      <HomeStack.Screen name="CreateVisitor" component={CreateVisitorScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="Visitors" component={VisitorsScreen} options={{ headerShown: false }} />
      {isContractor && (
        <>
          <HomeStack.Screen name="CheckIn" component={CheckInScreen} options={{ title: 'Sign in' }} />
          <HomeStack.Screen
            name="CreateContractorAssignment"
            component={CreateContractorAssignmentScreen}
            options={{ title: 'Log work' }}
          />
          <HomeStack.Screen
            name="ContractorCreateIncident"
            component={ContractorCreateIncidentScreen}
            options={{ title: 'Report incident' }}
          />
          <HomeStack.Screen
            name="ContractorCreateObservation"
            component={ContractorCreateObservationScreen}
            options={{ title: 'Log observation' }}
          />
        </>
      )}
    </HomeStack.Navigator>
  );
}

/**
 * The general_user's whole app: sign on and off, and the three H&S things they
 * can do. A SEPARATE stack rather than the normal one with most screens hidden
 * — a nav bar full of things that are not there reads as a broken app, and a
 * conditional inside every existing stack is how one gets missed.
 */
function SignOnStackNavigator() {
  return (
    <SignOnStack.Navigator screenOptions={stackScreenOptions}>
      <SignOnStack.Screen
        name="SignOnMain"
        component={SiteSignOnScreen}
        options={{ headerShown: false }}
      />
      <SignOnStack.Screen name="CreateIncident" component={CreateIncidentScreen} options={{ headerShown: false }} />
      <SignOnStack.Screen name="CreateRisk" component={CreateRiskScreen} options={{ headerShown: false }} />
      <SignOnStack.Screen name="CreateVisitor" component={CreateVisitorScreen} options={{ headerShown: false }} />
      <SignOnStack.Screen name="Visitors" component={VisitorsScreen} options={{ headerShown: false }} />
      <SignOnStack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: false }} />
    </SignOnStack.Navigator>
  );
}

function TasksStackNavigator() {
  const { isContractor } = useAuth();
  return (
    <TaskStack.Navigator screenOptions={stackScreenOptions}>
      <TaskStack.Screen
        name="TaskList"
        component={isContractor ? ContractorTasksScreen : TasksScreen}
        options={{ title: isContractor ? 'My Work' : 'My Tasks' }}
      />
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
      {!isContractor && (
        <>
          <ProfileStack.Screen name="Timesheet" component={TimesheetScreen} options={{ title: 'Timesheet' }} />
          <ProfileStack.Screen name="TimesheetDayDetail" component={TimesheetDayDetailScreen} options={{ title: 'Day detail' }} />
          <ProfileStack.Screen name="TimesheetEntryEdit" component={TimesheetEntryEditScreen} options={{ title: 'Time entry' }} />
        </>
      )}
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
  const { isContractor, isGeneralUser } = useAuth();
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
      {/* THREE tabs for a general_user, not the normal set with things
          removed: sign on, the map, and their profile. Everything else in this
          app needs a permission they do not hold, and the API would refuse it
          — a tab that always 403s is worse than no tab. */}
      {isGeneralUser ? (
        <>
          <Tab.Screen
            name="SignOn"
            component={SignOnStackNavigator}
            // Labelled Home, not "Sign on": it is this account's home screen and
            // signing on is one of the things it does. The ROUTE keeps its name
            // so it cannot collide with the other branch's Home tab.
            options={{ title: 'Home', headerShown: false }}
          />
          <Tab.Screen name="Map" component={MapScreen} options={{ title: 'Map' }} />
        </>
      ) : (
        <>
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
        </>
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
