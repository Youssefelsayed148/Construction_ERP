import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { installFetch, renderScreen, signIn } from '../testing/harness';

import Dashboard from './Dashboard';
import Items from './Items';
import Suppliers from './Suppliers';
import Clients from './Clients';
import Legal from './Legal';
import Approvals from './Approvals';
import MyActions from './MyActions';
import Expenses from './Expenses';
import Invoices from './Invoices';
import Assets from './Assets';
import HR from './HR';
import Payroll from './Payroll';
import Projects from './Projects';
import ProjectDetail from './ProjectDetail';
import BOQ from './BOQ';
import WorkOrders from './WorkOrders';
import SiteManagement from './SiteManagement';
import SiteWorkspace from './SiteWorkspace';
import QHSE from './QHSE';
import HSE from './HSE';
import Schedule from './Schedule';
import Reports from './Reports';
import Handover from './Handover';
import ProjectDocuments from './ProjectDocuments';
import UnitsSales from './UnitsSales';
import ProjectOperations from './ProjectOperations';
import LocationDashboard from './LocationDashboard';
import ProcurementReview from './ProcurementReview';
import AgentActivity from './AgentActivity';
import PortalDashboard from './PortalDashboard';

// Screen contract (Phase 4): with an empty API a screen renders its page (never a blank page and never a crash),
// and when the API fails it shows a visible error (role="alert"), not a blank page or a silent zero.
const P = '/projects/1';
const R = '/projects/:id/*';
const SCREENS = [
  ['Dashboard', <Dashboard />],
  ['Items (inventory)', <Items />],
  ['Suppliers', <Suppliers />],
  ['Clients', <Clients />],
  ['Legal', <Legal />],
  ['Approvals', <Approvals />],
  ['MyActions', <MyActions />],
  ['Expenses', <Expenses />],
  ['Invoices', <Invoices />],
  ['Assets', <Assets />],
  ['HR', <HR />],
  ['Payroll', <Payroll />],
  ['Projects', <Projects />],
  ['ProjectDetail', <ProjectDetail />, P, R],
  ['BOQ', <BOQ />, P, R],
  ['WorkOrders', <WorkOrders />, P, R],
  ['SiteManagement', <SiteManagement />, P, R],
  ['SiteWorkspace', <SiteWorkspace />, P, R],
  ['QHSE', <QHSE />, P, R],
  ['HSE', <HSE />, P, R],
  ['Schedule', <Schedule />, P, R],
  ['Reports', <Reports />, P, R],
  ['Handover', <Handover />, P, R],
  ['ProjectDocuments', <ProjectDocuments />, P, R],
  ['UnitsSales', <UnitsSales />, P, R],
  ['ProjectOperations', <ProjectOperations />, P, R],
  ['LocationDashboard', <LocationDashboard />, P, R],
  ['ProcurementReview', <ProcurementReview />],
  ['AgentActivity', <AgentActivity />],
  ['PortalDashboard (client)', <PortalDashboard kind="client" />],
];

beforeEach(() => { signIn('owner'); jest.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { jest.restoreAllMocks(); delete global.fetch; });

describe.each(SCREENS)('%s', (name, element, path = '/', route = '*') => {
  test('empty API: renders a page, not a blank screen', async () => {
    installFetch('empty');
    const { container } = renderScreen(element, { path, route });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await waitFor(() => expect(container.textContent.trim().length).toBeGreaterThan(0));
    expect(container.querySelector('h1, h2, h3, [role="heading"]')).not.toBeNull();
  });

  test('failing API: shows a visible error, not blank or zero', async () => {
    installFetch('error');
    renderScreen(element, { path, route });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await screen.findAllByRole('alert', {}, { timeout: 2500 });
  });
});
