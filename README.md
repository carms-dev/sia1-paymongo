# BUDOL Marketplace

## Running the E2E tests

The Cypress suite in `cypress/e2e/` checks the real local UI and services against the PostgreSQL database configured in `.env`. It adds records for a dedicated Cypress buyer and shop; it does not delete existing data. The tests create new orders each time they run.

### One-time setup

1. Install Node.js 20, 22, or 24, then install the project dependencies from the repository root:

   ```powershell
   npm.cmd ci
   ```

2. Configure `.env` with the same Supabase/PostgreSQL connection used by the app. Do not commit or share `.env`.
3. Ensure the database schema in `database/schema.sql` has been run.
4. Ensure `.env` contains a PayMongo **test-mode** secret key (`sk_test_...`), a webhook signing secret, and the internal service key. The checkout hand-off tests require internet access and create PayMongo test checkout sessions, but do not submit a payment.
5. Seed the dedicated Cypress buyer, approved test shop, and three fixed-price products. In PowerShell, from the repository root:

   ```powershell
   $env:E2E_TEST_MODE = "1"
   npm.cmd run seed:e2e
   Remove-Item Env:E2E_TEST_MODE
   ```

   The test buyer is `e2e-buyer@example.test` with password `BudolE2EPass123!`. These are test-only credentials; do not use them for a real account.

### Start and run

1. In PowerShell window 1, start all four services and leave this window open:

   ```powershell
   npm.cmd start
   ```

   By default the website is at `http://localhost:3000`. Confirm it responds at `http://localhost:3000/health`.
2. In PowerShell window 2, from the repository root, run the full headless Cypress suite:

   ```powershell
   npm.cmd run test:e2e
   ```

   A successful run contains nine passing E2E scenarios. Cypress has retries disabled and records evidence under `cypress/videos/`.
3. Repeat `npm.cmd run test:e2e` two more times to confirm the suite passes three clean runs in a row.

To run the same suite in Microsoft Edge instead of Cypress's default Electron browser:

```powershell
npm.cmd run test:e2e:edge
```

The PayMongo hand-off test intercepts and records the browser's request to the hosted checkout URL, then aborts that external request. This verifies that the app initiates the redirect without attempting a real payment or relying on Cypress's cross-origin bridge.

If the website uses a non-default port, set it for both processes. For example, before starting the services in window 1:

```powershell
$env:PORT = "8000"
npm.cmd start
```

In window 2, use the matching Cypress URL:

```powershell
$env:CYPRESS_BASE_URL = "http://localhost:8000"
npm.cmd run test:e2e
```

The test for the success page sends a signed test webhook through the Payment Service. It uses `PAYMONGO_WEBHOOK_SECRET` from the Node environment and never passes the secret to the browser. The hand-off tests verify the hosted checkout redirect request but do not load or interact with PayMongo's payment form.

### Optional mock/UI checks

The earlier UI-only account, role, and responsive tests remain available separately. They use mock API data and do not prove that the PostgreSQL-backed checkout works:

```powershell
npm.cmd run test:mock
```

## Test plan and submission notes

See [TEST-PLAN.md](./TEST-PLAN.md) for the mapping from E2E-01 through E2E-09 to the spec files and responsible service area. Replace the author placeholders with the actual group member names before submitting.
