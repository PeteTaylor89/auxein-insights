// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@vineyard/shared';
import { api } from '@vineyard/shared';
import Home from './pages/Home';
import Login from './pages/Login';
import { ForgotPasswordForm, ResetPasswordForm } from './components/PasswordReset';
import ChangePasswordForm from './components/ChangePasswordForm'; 
import AcceptInvitation from './components/AcceptInvitation'; 
import Profile from './pages/Profile';
import Maps from './pages/Maps';
import Tasks from './pages/Tasks';
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
import ObservationDashboard from './pages/ObservationDashboard'
import PlanEdit from './pages/PlanEdit'

// Protected route component
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

// Auth route component - redirects to home if already authenticated
function AuthRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
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
      {/* Protected routes that require authentication */}
      <Route path="/" element={
        <ProtectedRoute>
          <Home />
        </ProtectedRoute>
      } />
      
      <Route path="/tasks" element={
        <ProtectedRoute>
          <Tasks />
        </ProtectedRoute>
      } />

      <Route path="/profile" element={
        <ProtectedRoute>
          <Profile />
        </ProtectedRoute>
      } />

      <Route path="/maps" element={
        <ProtectedRoute>
          <Maps />
        </ProtectedRoute>
      } />

      {/* Change password - protected route for logged-in users */}
      <Route path="/change-password" element={
        <ProtectedRoute>
          <ChangePasswordForm />
        </ProtectedRoute>
      } />

      {/* Auth routes - redirect to home if already authenticated */}
      <Route path="/login" element={
        <AuthRoute>
          <Login />
        </AuthRoute>
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




      <Route path="/observations/runs/:id" element={
        <ProtectedRoute>
          <RunCapture  />
        </ProtectedRoute>
      } />

      <Route path="/observations/runcapture/:id" element={
        <ProtectedRoute>
          <RunCapture  />
        </ProtectedRoute>
      } />




      <Route path="/training/take/:recordId" element={<TakeTraining />} />



      {/* Password reset routes - available to everyone */}
      <Route path="/forgot-password" element={<ForgotPasswordForm />} />
      <Route path="/reset-password" element={<ResetPasswordForm />} />
      <Route path="/accept-invitation" element={<AcceptInvitation />} />
      {/* Catch all route - redirect to login or home based on auth status */}
      <Route path="*" element={
        <ProtectedRoute>
          <Navigate to="/" replace />
        </ProtectedRoute>
      } />
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