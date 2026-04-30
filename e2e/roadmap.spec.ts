import { test, expect } from '@playwright/test';

/**
 * Roadmap Snapshot + Rewind smoke tests.
 *
 * Run against a live ClearGo instance (local dev server, preview, or staging):
 *   E2E_BASE_URL=http://localhost:3000 \
 *   E2E_AUTH_COOKIE='lr_session=…' \
 *   npx playwright test e2e/roadmap.spec.ts
 *
 * Both env vars are required; tests are skipped if either is missing so CI
 * without secrets doesn't fail. The cookie skips the magic-link flow.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? '';
const AUTH_COOKIE = process.env.E2E_AUTH_COOKIE ?? '';

test.beforeEach(async ({ context }) => {
  test.skip(!BASE_URL, 'E2E_BASE_URL not set — skipping roadmap e2e');
  test.skip(!AUTH_COOKIE, 'E2E_AUTH_COOKIE not set — skipping authenticated tests');

  // Parse `name=value; name2=value2` into Playwright cookie objects.
  const url = new URL(BASE_URL);
  const cookies = AUTH_COOKIE.split(';')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const eq = c.indexOf('=');
      return {
        name: c.slice(0, eq),
        value: c.slice(eq + 1),
        domain: url.hostname,
        path: '/',
        httpOnly: false,
        secure: url.protocol === 'https:',
        sameSite: 'Lax' as const,
      };
    });
  await context.addCookies(cookies);
});

test.describe('Roadmap Snapshot page', () => {
  test('loads with title and either snapshot data or empty-state', async ({ page }) => {
    await page.goto(`${BASE_URL}/portfolio/snapshot`);
    await expect(page.getByRole('heading', { name: 'Roadmap Snapshot' })).toBeVisible();

    // Either we see the flag-disabled message, the empty-state, or actual snapshot UI.
    const flagDisabled = page.getByText(
      /Enable the .Roadmap Rewind. feature flag/i,
    );
    const emptyState = page.getByText(/No weekly roadmap snapshots/i);
    const snapshotTable = page.getByRole('table');

    await expect(flagDisabled.or(emptyState).or(snapshotTable).first()).toBeVisible({
      timeout: 15000,
    });
  });
});

test.describe('Roadmap Rewind page', () => {
  test('loads with title and movement summary cards or empty-state', async ({ page }) => {
    await page.goto(`${BASE_URL}/portfolio/rewind`);
    await expect(page.getByRole('heading', { name: 'Roadmap Rewind' })).toBeVisible();

    const flagDisabled = page.getByText(
      /Enable the .Roadmap Rewind. feature flag/i,
    );
    const emptyState = page.getByText(/No roadmap snapshots yet/i);
    const summaryCards = page.getByText(/Quarter-to-date/i);

    await expect(flagDisabled.or(emptyState).or(summaryCards).first()).toBeVisible({
      timeout: 15000,
    });
  });

  test('opens the period drill-in modal when a summary card is clicked', async ({ page }) => {
    await page.goto(`${BASE_URL}/portfolio/rewind`);

    const card = page.getByText(/Quarter-to-date/i).first();
    const cardVisible = await card.isVisible().catch(() => false);
    test.skip(!cardVisible, 'No movement data on this environment; modal cannot open.');

    await card.click();
    const modalTitle = page.getByText(/release movements/i).first();
    await expect(modalTitle).toBeVisible({ timeout: 5000 });
  });
});
