// src/App.jsx
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@vineyard/shared';
import { api } from '@vineyard/shared';
import AppLayout from './components/AppLayout';
import Home from './pages/Home';
import Login from './pages/Login';
import { ForgotPasswordForm, ResetPasswordForm } from './components/PasswordReset';
import ChangePasswordForm from './components/ChangePasswordForm';
import AcceptInvitation from './components/AcceptInvitation';
import Profile from './pages/Profile';
import Maps from './pages/Maps';
import RiskDashboard from './pages/RiskDashboard';
import CreateRisk from './pages/CreateRisk';
import CreateAction from './pages/CreateAction';
import VisitorRegistration from './pages/VisitorRegistration';
import VisitorManagement from './pages/VisitorManagement';
import CreateIncident from './pages/CreateIncident';
import EditIncident from './pages/EditIncident';
import TrainingModules from './pages/TrainingModules';
import ModuleEditor from './pages/ModuleEditor';
import TakeTraining from './pages/TakeTraining';
import Insights from './pages/Insights';
import TimesheetSystem from './pages/TimesheetSystem';

import PlanNew from  './pages/PlanNew';
import PlanDetail from './pages/PlanDetail';
import RunCapture from './pages/RunCapture';
import ObservationDashboard from './pages/ObservationDashboard';
import PlanEdit from './pages/PlanEdit';
import RunStart from './pages/RunStart';
import AdhocObservationCreate from './pages/AdhocObservationCreate';
import AssetsDashboard from './pages/AssetsDashboard';
import AssetForm from './pages/AssetForm';
import ConsumableForm from './pages/ConsumableForm';
import ContractorManagement from './pages/ContractorManagement';
import Notifications from './pages/Notifications';
import Calendar from './pages/Calendar';
import Reports from './pages/Reports';
import QuickObservation from './pages/QuickObservation';

import TaskTemplateEditor from './pages/TaskTemplateEditor';
import TaskCreationWizard from './pages/TaskCreationWizard';
import TaskQuickCreate from './pages/TaskQuickCreate';
import TaskDetail from './pages/TaskDetail';

// Lazy-load Maps V2 so any module error won't crash the rest of the app
const MapsPageV2 = lazy(() => import('./pages/maps-v2/MapsPage'));
const Admin = lazy(() => import('./pages/Admin'));
const CompanyAdmin = lazy(() => import('./pages/CompanyAdmin'));

// Protected route component
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading, initialLoading } = useAuth();

  if (loading || initialLoading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

// Auth route component - redirects to home if already authenticated
function AuthRoute({ children }) {
  const { isAuthenticated, loading, initialLoading } = useAuth();

  if (loading || initialLoading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}

// App setup with router
function AppRoutes() {
  return (
    <Routes>
      {/* Routes with app layout (header + footer) */}
      <Route element={<AppLayout />}>
        {/* Protected routes that require authentication */}
        <Route path="/" element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        } />

        <Route path="/profile" element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        } />

        <Route path="/notifications" element={
          <ProtectedRoute>
            <Notifications />
          </ProtectedRoute>
        } />

        <Route path="/calendar" element={
          <ProtectedRoute>
            <Calendar />
          </ProtectedRoute>
        } />

        <Route path="/reports" element={
          <ProtectedRoute>
            <Reports />
          </ProtectedRoute>
        } />

        <Route path="/maps" element={
          <ProtectedRoute>
            <Maps />
          </ProtectedRoute>
        } />

        <Route path="/maps-v2" element={
          <ProtectedRoute>
            <Suspense fallback={<div className="loading-screen">Loading Maps...</div>}>
              <MapsPageV2 />
            </Suspense>
          </ProtectedRoute>
        } />

        <Route path="/admin" element={
          <ProtectedRoute>
            <Suspense fallback={<div className="loading-screen">Loading...</div>}>
              <Admin />
            </Suspense>
          </ProtectedRoute>
        } />

        <Route path="/company-admin" element={
          <ProtectedRoute>
            <Suspense fallback={<div className="loading-screen">Loading...</div>}>
              <CompanyAdmin />
            </Suspense>
          </ProtectedRoute>
        } />

        <Route path="/change-password" element={
          <ProtectedRoute>
            <ChangePasswordForm />
          </ProtectedRoute>
        } />

        <Route path="/RiskDashboard" element={
          <ProtectedRoute>
            <RiskDashboard />
          </ProtectedRoute>
        } />

        <Route path="/Insights" element={
          <ProtectedRoute>
            <Insights />
          </ProtectedRoute>
        } />

        <Route path="/risks/create" element={
          <ProtectedRoute>
            <CreateRisk />
          </ProtectedRoute>
        } />

        <Route path="/actions/create" element={
          <ProtectedRoute>
            <CreateAction />
          </ProtectedRoute>
        } />

        <Route path="/incidents/create" element={
          <ProtectedRoute>
            <CreateIncident />
          </ProtectedRoute>
        } />

        <Route path="/incidents/:incidentId/edit" element={
          <ProtectedRoute>
            <EditIncident />
          </ProtectedRoute>
        } />

        <Route path="/visitors" element={<VisitorRegistration />} />
        <Route path="/admin/visitors" element={<VisitorManagement />} />

        <Route path="/admin/contractors" element={
          <ProtectedRoute>
            <ContractorManagement />
          </ProtectedRoute>
        } />

        <Route path="/training" element={
          <ProtectedRoute>
            <TrainingModules />
          </ProtectedRoute>
        } />

        <Route path="/training/modules/:moduleId/edit" element={
          <ProtectedRoute>
            <ModuleEditor />
          </ProtectedRoute>
        } />

        <Route path="/timesheets" element={
          <ProtectedRoute>
            <TimesheetSystem />
          </ProtectedRoute>
        } />

        <Route path="/observations" element={
          <ProtectedRoute>
            <ObservationDashboard  />
          </ProtectedRoute>
        } />

        <Route path="/planobservation" element={
          <ProtectedRoute>
            <PlanNew />
          </ProtectedRoute>
        } />

        <Route path="/plandetail/:id" element={
          <ProtectedRoute>
            <PlanDetail />
          </ProtectedRoute>
        } />

        <Route path="/planedit/:id" element={
          <ProtectedRoute>
            <PlanEdit />
          </ProtectedRoute>
        } />

        <Route path="/observations/runstart/:planId" element={
          <ProtectedRoute>
            <RunStart  />
          </ProtectedRoute>
        } />

        <Route path="/observations/runcapture/:id" element={
          <ProtectedRoute>
            <RunCapture  />
          </ProtectedRoute>
        } />

        <Route path="/observations/quick" element={
          <ProtectedRoute>
            <QuickObservation />
          </ProtectedRoute>
        } />

        <Route path="/observations/adhoc" element={
          <ProtectedRoute>
            <AdhocObservationCreate  />
          </ProtectedRoute>
        } />

        <Route path="/assets" element={
          <ProtectedRoute>
            <AssetsDashboard  />
          </ProtectedRoute>
        } />

        <Route path="/assets/equipment/new" element={
          <ProtectedRoute>
            <AssetForm  />
          </ProtectedRoute>
        } />

        <Route path="/assets/equipment/:id/edit" element={
          <ProtectedRoute>
            <AssetForm  />
          </ProtectedRoute>
        } />

        <Route path="/assets/consumables/new" element={
          <ProtectedRoute>
            <ConsumableForm  />
          </ProtectedRoute>
        } />

        <Route path="/assets/consumables/:id/edit" element={
          <ProtectedRoute>
            <ConsumableForm  />
          </ProtectedRoute>
        } />

        <Route path="/tasks/templates/new" element={
          <ProtectedRoute>
            <TaskTemplateEditor  />
          </ProtectedRoute>
        } />

        <Route path="/tasks/templates/:id/edit" element={
          <ProtectedRoute>
            <TaskTemplateEditor  />
          </ProtectedRoute>
        } />

        <Route path="/tasks/new" element={
          <ProtectedRoute>
            <TaskQuickCreate />
          </ProtectedRoute>
        } />

        <Route path="/tasks/new/advanced" element={
          <ProtectedRoute>
            <TaskCreationWizard />
          </ProtectedRoute>
        } />

        <Route path="/tasks/create" element={
          <ProtectedRoute>
            <TaskCreationWizard />
          </ProtectedRoute>
        } />

        <Route path="/tasks/:taskId" element={
          <ProtectedRoute>
            <TaskDetail />
          </ProtectedRoute>
        } />

        <Route path="/training/take/:recordId" element={<TakeTraining />} />

        {/* Catch all route - redirect to login or home based on auth status */}
        <Route path="*" element={
          <ProtectedRoute>
            <Navigate to="/" replace />
          </ProtectedRoute>
        } />
      </Route>

      {/* Routes WITHOUT app layout (no header/footer) */}
      <Route path="/login" element={
        <AuthRoute>
          <Login />
        </AuthRoute>
      } />
      <Route path="/forgot-password" element={<ForgotPasswordForm />} />
      <Route path="/reset-password" element={<ResetPasswordForm />} />
      <Route path="/accept-invitation" element={<AcceptInvitation />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
