import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Items from './pages/Items';
import Suppliers from './pages/Suppliers';
import Clients from './pages/Clients';
import Legal from './pages/Legal';
import Approvals from './pages/Approvals';
import MyActions from './pages/MyActions';
import LocationDashboard from './pages/LocationDashboard';
import Expenses from './pages/Expenses';
import Invoices from './pages/Invoices';
import Assets from './pages/Assets';
import HR from './pages/HR';
import Payroll from './pages/Payroll';
import Projects from './pages/Projects';
import ProjectWizard from './pages/ProjectWizard';
import ProjectDetail from './pages/ProjectDetail';
import BOQ from './pages/BOQ';
import WorkOrders from './pages/WorkOrders';
import SiteManagement from './pages/SiteManagement';
import SiteWorkspace from './pages/SiteWorkspace';
import QHSE from './pages/QHSE';
import HSE from './pages/HSE';
import Schedule from './pages/Schedule';
import Reports from './pages/Reports';
import ProjectDocuments from './pages/ProjectDocuments';
import UnitsSales from './pages/UnitsSales';
import PortalDashboard from './pages/PortalDashboard';
import ProcurementReview from './pages/ProcurementReview';
import { authService } from './services/api';
import './styles/index.css';
import './styles/portal.css';

function ProtectedRoute({ children }) {
  const isAuthenticated = authService.isAuthenticated();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function LandingRedirect() {
  const user = authService.getCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  const portalLanding = {
    consultant: '/consultant-portal', client: '/client-portal',
    subcontractor: '/subcontractor-portal', supplier: '/supplier-portal',
  };
  if (portalLanding[user.role]) return <Navigate to={portalLanding[user.role]} replace />;
  return <Navigate to="/dashboard" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<LandingRedirect />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="consultant-portal" element={<PortalDashboard kind="consultant" />} />
          <Route path="client-portal" element={<PortalDashboard kind="client" />} />
          <Route path="subcontractor-portal" element={<PortalDashboard kind="subcontractor" />} />
          <Route path="supplier-portal" element={<PortalDashboard kind="supplier" />} />
          <Route path="inventory" element={<Items />} />
          <Route path="procurement/comparison" element={<ProcurementReview />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="clients" element={<Clients />} />
          <Route path="legal" element={<Legal />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="my-actions" element={<MyActions />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="assets" element={<Assets />} />
          <Route path="hr" element={<HR />} />
          <Route path="hr/payroll" element={<Payroll />} />
          <Route path="projects" element={<Projects />} />
          {/* Phase 5: the 11-step creation wizard. Declared before the :id
              route so "new" is never read as a project id. */}
          <Route path="projects/new" element={<ProjectWizard />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="projects/:id/boq" element={<BOQ />} />
          <Route path="projects/:id/work-orders" element={<WorkOrders />} />
          <Route path="projects/:id/site" element={<SiteManagement />} />
          <Route path="projects/:id/site-workspace" element={<SiteWorkspace />} />
          <Route path="projects/:id/locations" element={<LocationDashboard />} />
          <Route path="projects/:id/qhse" element={<QHSE />} />
          <Route path="projects/:id/hse" element={<HSE />} />
          <Route path="projects/:id/schedule" element={<Schedule />} />
          <Route path="projects/:id/reports" element={<Reports />} />
          <Route path="projects/:id/documents" element={<ProjectDocuments />} />
          <Route path="projects/:id/units" element={<UnitsSales />} />
          <Route path="settings" element={<div className="page-container"><h1>Settings</h1></div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
