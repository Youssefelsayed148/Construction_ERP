const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

test.skip(process.env.E2E_PILOT !== '1', 'real local pilot only; set E2E_PILOT=1 and REACT_APP_API_URL to the localhost API');

const credentialsPath = path.resolve(__dirname, '..', '..', '.staging-users.json');
const accounts = new Map(process.env.E2E_PILOT === '1'
  ? JSON.parse(fs.readFileSync(credentialsPath, 'utf8')).accounts.map((account) => [account.key, account]) : []);
const locale = process.env.E2E_PILOT_LOCALE === 'ar' ? 'ar' : 'en';
const tag = `UI-${Date.now().toString(36)}`;

async function signIn(page, key) {
  if (page.url() === 'about:blank') await page.goto('/login');
  await page.evaluate(() => { localStorage.removeItem('token'); localStorage.removeItem('user'); });
  await page.goto('/login');
  const account = accounts.get(key);
  await page.locator('#login-email').fill(account.email);
  await page.locator('#login-password').fill(account.password);
  const loginResponse = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/api/auth/login'));
  await page.locator('form button[type="submit"]').click();
  expect((await loginResponse).status(), 'pilot login response').toBe(200);
  await expect(page).not.toHaveURL(/\/login$/);
}

async function openWorkspace(page, projectId) {
  await page.goto(`/projects/${projectId}/operations`);
  await page.getByRole('tab', { name: 'Procurement' }).click();
  await expect(page.locator('.procurement-section-nav')).toBeVisible();
}

async function selectOptionWithText(select, text) {
  const options = select.locator('option');
  const count = await options.count();
  for (let i = 0; i < count; i += 1) {
    if ((await options.nth(i).textContent()).includes(text)) {
      await select.selectOption(await options.nth(i).getAttribute('value'));
      return;
    }
  }
  throw new Error(`No option matched ${text}`);
}

async function firstValue(select) {
  const value = await select.locator('option').nth(1).getAttribute('value');
  if (!value) throw new Error(`No selectable option in ${await select.getAttribute('id')}`);
  await select.selectOption(value);
  return value;
}

async function expectPost(page, endpoint, action) {
  const pending = page.waitForResponse((response) => {
    const request = response.request();
    const pathname = new URL(response.url()).pathname;
    return request.method() === 'POST' && (endpoint instanceof RegExp ? endpoint.test(pathname) : pathname.endsWith(endpoint));
  });
  await action();
  const response = await pending;
  const result = await response.json();
  expect(response.status(), `${endpoint} response status${result.error_code ? ` (${result.error_code})` : ''}${result.error ? `: ${result.error}` : ''}`).toBeLessThan(300);
  return result;
}

async function openStage(page, index) {
  await page.locator('.procurement-section-nav button').nth(index).click();
}

test(`real P2P browser chain completes (${locale.toUpperCase()})`, async ({ page }, testInfo) => {
  test.setTimeout(240000);
  const isMobile = testInfo.project.name.startsWith('mobile');
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1280, height: 900 });
  await page.addInitScript((choice) => localStorage.setItem('locale', choice), locale);
  await signIn(page, 'procurement_officer');
  const projectId = await page.evaluate(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    return [...new Set((user.policy_permissions || []).map((grant) => grant.project_id).filter((id) => id != null))][0];
  });
  expect(projectId).toBeTruthy();
  await openWorkspace(page, projectId);

  // Requester creates a material-backed PR and submits it.
  const materialId = await firstValue(page.locator('#pr-material'));
  const title = `${tag} foundation cement`;
  await page.locator('#pr-title').fill(title);
  await page.locator('#pr-description').fill(`${tag} cement for foundation pour`);
  await page.locator('#pr-qty').fill('1');
  await page.locator('#pr-unit').fill('bag');
  await page.locator('#pr-price').fill('400');
  await page.locator('#pr-priority').selectOption('normal');
  const prResponse = await expectPost(page, '/procurement/pr', () => page.locator('#pr-title').locator('xpath=ancestor::form').locator('button').last().click());
  const prId = prResponse.data.id;
  const requestRow = () => page.locator('.procurement-request-actions').filter({ hasText: title });
  await expect(requestRow()).toBeVisible();
  const submittedPr = await expectPost(page, `/procurement/pr/${prId}/submit`, () => requestRow().locator('button.btn-sm').nth(1).click());

  // Separate budget and procurement actors advance the configured workflow steps.
  let prStatus = submittedPr.data.status;
  for (let i = 0; i < 4; i += 1) {
    if (prStatus === 'procurement') break;
    const actor = prStatus === 'budget_check' ? 'workflow_budget' : 'workflow_checker';
    await signIn(page, actor);
    await openWorkspace(page, projectId);
    await openStage(page, 0);
    const approve = requestRow().locator('button.btn-primary');
    const decision = await expectPost(page, `/procurement/pr/${prId}/decide`, () => approve.click());
    prStatus = decision.data.status;
  }
  expect(prStatus).toBe('procurement');

  // Requester raises an RFQ, invites two suppliers and records two quotations.
  await signIn(page, 'procurement_officer');
  await openWorkspace(page, projectId);
  await openStage(page, 1);
  await page.locator('#rfq-title').fill(`${tag} foundation RFQ`);
  await selectOptionWithText(page.locator('#rfq-pr'), title);
  await page.locator('#rfq-material').selectOption(materialId);
  await page.locator('#rfq-description').fill(`${tag} cement`);
  await page.locator('#rfq-qty').fill('1');
  await page.locator('#rfq-unit').fill('bag');
  const rfqResponse = await expectPost(page, '/procurement/rfq', () => page.locator('#rfq-title').locator('xpath=ancestor::form').locator('button').last().click());
  const rfqId = rfqResponse.data.id;

  const supplierChecks = page.locator('input[name="supplier_ids"]');
  await expect.poll(() => supplierChecks.count()).toBeGreaterThanOrEqual(2);
  const availableSupplierIds = await supplierChecks.evaluateAll((elements) => elements.map((element) => element.value).slice(0, 2));
  expect(availableSupplierIds).toHaveLength(2);
  await page.locator('#rfq-select').selectOption(String(rfqId));
  await supplierChecks.nth(0).check();
  await supplierChecks.nth(1).check();
  await expectPost(page, `/procurement/rfq/${rfqId}/vendors`, () => page.locator('#rfq-select').locator('xpath=ancestor::form').locator('button').last().click());

  await page.locator('#quote-rfq').selectOption(String(rfqId));
  await expect(page.locator('#quote-line option')).toHaveCount(2);
  const quoteIds = [];
  for (let i = 0; i < availableSupplierIds.length; i += 1) {
    await page.locator('#quote-supplier').selectOption(availableSupplierIds[i]);
    await firstValue(page.locator('#quote-line'));
    await page.locator('#quote-price').fill(i === 0 ? '350' : '340');
    await page.locator('#quote-lead').fill('5');
    await page.locator('#quote-pay-terms').fill('30 days');
    await page.locator('#quote-delivery-terms').fill('Deliver to pilot site');
    const quote = await expectPost(page, `/procurement/rfq/${rfqId}/quotations`, () => page.locator('#quote-price').locator('xpath=ancestor::form').locator('button').last().click());
    quoteIds.push(quote.data.id);
  }

  // Requester records the award recommendation; the owner acts as the separate checker.
  await openStage(page, 2);
  await page.locator('#comparison-rfq').selectOption(String(rfqId));
  await page.locator('#award-quote').selectOption(String(quoteIds[1]));
  await page.locator('#award-justification').fill(`${tag} lowest compliant quote`);
  const recCreate = page.waitForResponse((response) => response.request().method() === 'POST'
    && new URL(response.url()).pathname.endsWith(`/procurement/rfq/${rfqId}/award-recommendations`));
  const recSubmit = page.waitForResponse((response) => response.request().method() === 'POST'
    && /\/procurement\/award-recommendations\/\d+\/submit$/.test(new URL(response.url()).pathname));
  await page.locator('#award-justification').locator('xpath=ancestor::form').locator('button').last().click();
  const rec = await (await recCreate).json();
  expect((await recSubmit).status()).toBeLessThan(300);
  const recommendationId = rec.data.id;

  await signIn(page, 'workflow_owner');
  await openWorkspace(page, projectId);
  await openStage(page, 2);
  const recommendationAction = page.locator('.procurement-action').filter({ hasText: rec.data.recommendation_number });
  await expectPost(page, `/procurement/award-recommendations/${recommendationId}/decide`, () => recommendationAction.locator('button.btn-primary').click());

  // Requester creates the PO from the selected quotation; the checker starts and completes approval.
  await signIn(page, 'procurement_officer');
  await openWorkspace(page, projectId);
  await openStage(page, 3);
  await page.locator('#po-rfq').selectOption(String(rfqId));
  await page.locator('#po-quote').selectOption(String(quoteIds[1]));
  await selectOptionWithText(page.locator('#po-pr'), title);
  const poResponse = await expectPost(page, '/procurement/po', () => page.locator('#po-tax').locator('xpath=ancestor::form').locator('button').last().click());
  const poId = poResponse.data.id;

  await signIn(page, 'workflow_owner');
  await openWorkspace(page, projectId);
  await openStage(page, 3);
  await page.locator('#po-action-select').selectOption(String(poId));
  await expect(page.locator('.procurement-grid section.card').nth(1).locator('p')).toContainText('draft');
  const issueResult = await expectPost(page, `/procurement/po/${poId}/issue`, () => page.locator('.procurement-action-row button.btn-primary').click());
  let poStatus = issueResult.data.status;
  for (let i = 0; i < 4; i += 1) {
    if (poStatus === 'issued') break;
    const actor = poStatus === 'draft' ? 'workflow_owner' : poStatus === 'financial_authority' ? 'finance_manager' : 'workflow_checker';
    await signIn(page, actor);
    await openWorkspace(page, projectId);
    await openStage(page, 3);
    await page.locator('#po-action-select').selectOption(String(poId));
    const approve = page.locator('.procurement-action-row button.btn-primary');
    const decision = await expectPost(page, `/procurement/po/${poId}/decide`, () => approve.click());
    poStatus = decision.data.status;
  }
  expect(poStatus).toBe('issued');

  // Record receipt, obtain a different checker decision on the MIR, and post the GRN.
  await openStage(page, 4);
  await page.locator('#delivery-po').selectOption(String(poId));
  await expect(page.locator('#delivery-line option')).toHaveCount(2);
  await firstValue(page.locator('#delivery-line'));
  await firstValue(page.locator('#delivery-warehouse'));
  await page.locator('#delivery-qty').fill('1');
  const deliveryResponse = await expectPost(page, '/procurement/deliveries', () => page.locator('#delivery-qty').locator('xpath=ancestor::form').locator('button').last().click());
  const deliveryId = deliveryResponse.data.id;
  const deliveryAction = page.locator('.procurement-action').filter({ hasText: deliveryResponse.data.delivery_number });
  const mirResponse = await expectPost(page, `/procurement/deliveries/${deliveryId}/mir`, () => deliveryAction.locator('button.btn-sm').click());

  await signIn(page, 'workflow_checker');
  await openWorkspace(page, projectId);
  await openStage(page, 4);
  const pendingMir = page.locator('.procurement-action').filter({ hasText: mirResponse.data.mir_number });
  await expectPost(page, /\/procurement\/mir\/\d+\/decide$/, () => pendingMir.locator('button.btn-sm').first().click());

  await signIn(page, 'workflow_owner');
  await openWorkspace(page, projectId);
  await openStage(page, 4);
  const acceptedMir = page.locator('.procurement-action').filter({ hasText: mirResponse.data.mir_number });
  const grnResponse = await expectPost(page, /\/procurement\/mir\/\d+\/grn$/, () => acceptedMir.locator('button.btn-sm').first().click());
  expect(grnResponse.data).toBeTruthy();

  // Requester records a three-way matched supplier invoice; the checker approves it and allocates payment.
  await signIn(page, 'procurement_officer');
  await openWorkspace(page, projectId);
  await openStage(page, 5);
  await page.locator('#invoice-po').selectOption(String(poId));
  await expect(page.locator('#invoice-line option')).toHaveCount(2);
  await firstValue(page.locator('#invoice-line'));
  const invoiceNumber = `${tag}-INV`;
  await page.locator('#invoice-number').fill(invoiceNumber);
  await page.locator('#invoice-date').fill(new Date().toISOString().slice(0, 10));
  await page.locator('#invoice-qty').fill('1');
  await page.locator('#invoice-price').fill('340');
  await page.locator('#invoice-total').fill('340');
  await page.locator('#invoice-tax').fill('0');
  const invoiceResponse = await expectPost(page, '/procurement/invoices', () => page.locator('#invoice-number').locator('xpath=ancestor::form').locator('button').last().click());
  const invoiceId = invoiceResponse.data.invoice?.id || invoiceResponse.data.id;
  await expect(page.getByText(invoiceNumber, { exact: true })).toBeVisible();

  await signIn(page, 'workflow_owner');
  await openWorkspace(page, projectId);
  await openStage(page, 5);
  const invoiceAction = page.locator('.procurement-action').filter({ hasText: invoiceNumber });
  await expect(invoiceAction.locator('button')).toHaveCount(1);
  await expectPost(page, `/procurement/invoices/${invoiceId}/approve`, () => invoiceAction.locator('button').first().click());

  await page.locator('#payment-supplier').selectOption(availableSupplierIds[1]);
  await page.locator('#payment-amount').fill('340');
  await page.locator('#payment-date').fill(new Date().toISOString().slice(0, 10));
  await page.locator('#payment-invoice').selectOption(String(invoiceId));
  const allocation = page.waitForResponse((response) => response.request().method() === 'POST'
    && /\/finance-ledger\/payments\/\d+\/allocate$/.test(new URL(response.url()).pathname));
  const paymentResponse = await expectPost(page, '/payments', () => page.locator('#payment-amount').locator('xpath=ancestor::form').locator('button').last().click());
  expect(paymentResponse.data.id).toBeTruthy();
  expect((await allocation).status()).toBeLessThan(300);
  await expect(page.locator('.procurement-action-row')).not.toContainText('requestFailed');
});

test('unassigned pilot user is denied the procurement project API', async ({ page }) => {
  await page.addInitScript((choice) => localStorage.setItem('locale', choice), locale);
  await signIn(page, 'procurement_officer');
  const projectId = await page.evaluate(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    return [...new Set((user.policy_permissions || []).map((grant) => grant.project_id).filter((id) => id != null))][0];
  });
  expect(projectId).toBeTruthy();
  await signIn(page, 'unassigned');
  const status = await page.evaluate(async ({ id, apiBase }) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${apiBase}/api/procurement/project/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.status;
  }, { id: projectId, apiBase: process.env.REACT_APP_API_URL || '' });
  expect(status).toBe(403);
});
