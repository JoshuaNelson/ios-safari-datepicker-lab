import { test, expect, Page, Locator } from '@playwright/test';
import { VERSIONS } from '../serve.mjs';

const only = process.env.V; // e.g. V=fix8-final
const press = (isMobile: boolean, loc: Locator) => isMobile ? loc.tap() : loc.click();
const fieldFor = (page: Page, id: string) => page.locator(`#${id}`).locator('xpath=..').locator('.dp-field');
const openPop = (page: Page) => page.locator('.dp-pop:not([hidden])');

async function arrows(page: Page, isMobile: boolean, id: string) {
  await press(isMobile, fieldFor(page, id));
  const pop = openPop(page);
  await expect(pop).toBeVisible();
  const title = pop.locator('.dp-head strong');
  const start = (await title.textContent())!;
  for (let i = 0; i < 3; i++) {
    await press(isMobile, pop.getByRole('button', { name: 'Next month' }));
    await expect(pop, 'popup stays open after Next').toBeVisible();
  }
  await expect(title).not.toHaveText(start);
  for (let i = 0; i < 3; i++) await press(isMobile, pop.getByRole('button', { name: 'Previous month' }));
  await expect(title).toHaveText(start);
  return { pop, title };
}

for (const v of Object.keys(VERSIONS).filter(n => !only || n === only)) {
  test.describe(v, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/?v=${v}`);
      await expect(page.locator('meta[name="picker-version"]')).toHaveAttribute('content', v);
    });

    test('hello "Your date": arrows, pick a day, reopen, close', async ({ page, isMobile, browserName }) => {
      const { pop, title } = await arrows(page, isMobile, 'hello-date');
      await press(isMobile, pop.getByRole('button', { name: 'Next month' }));
      await press(isMobile, pop.getByRole('button', { name: 'Next month' }));   // the month after the reserved week
      const month = (await title.textContent())!;
      await press(isMobile, pop.locator('.dp-day:not(:disabled):not(.is-busy):not(.is-soon)').first());
      await expect(pop).toBeHidden();
      expect(await page.locator('#hello-date').inputValue()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      await press(isMobile, fieldFor(page, 'hello-date'));
      await expect(openPop(page).locator('.dp-head strong')).toHaveText(month);
      await expect(openPop(page).locator('.dp-day[aria-pressed="true"]')).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(openPop(page)).toBeHidden();
      await press(isMobile, fieldFor(page, 'hello-date'));
      await expect(openPop(page)).toBeVisible();
      // Emulated iPhone WebKit on Linux never turns a tap on plain text into a click, but real iOS Safari does
      // (verified in the iOS Simulator lab, 2026-11-15), so this one check is skipped only in that emulation.
      if (!(isMobile && browserName === 'webkit')) {
        await press(isMobile, page.locator('#heading'));
        await expect(openPop(page), 'tapping outside closes the calendar').toBeHidden();
      }
    });

    test('step 3 "Timing": earliest month locked, arrows', async ({ page, isMobile, browserName }) => {
      await press(isMobile, fieldFor(page, 'quote-date'));
      await expect(openPop(page).getByRole('button', { name: 'Previous month' })).toBeDisabled();
      await page.keyboard.press('Escape');
      await arrows(page, isMobile, 'quote-date');
    });

    test('layout: a reserved week stays inside the calendar, calendar on screen', async ({ page, isMobile, browserName }) => {
      await press(isMobile, fieldFor(page, 'hello-date'));
      await press(isMobile, openPop(page).getByRole('button', { name: 'Next month' }));
      await expect(openPop(page).locator('.dp-day.is-busy')).toHaveCount(7);
      const m = await openPop(page).evaluate(pop => {
        const g = pop.querySelector('.dp-grid')!, vw = document.documentElement.clientWidth, r = pop.getBoundingClientRect();
        return { gridOverflow: g.scrollWidth - g.clientWidth, left: Math.round(r.left), right: Math.round(r.right), next: Math.round(pop.querySelector('[aria-label="Next month"]')!.getBoundingClientRect().right), vw };
      });
      await test.info().attach('layout', { body: JSON.stringify(m), contentType: 'application/json' });
      await page.screenshot({ path: test.info().outputPath('reserved-week.png') });
      expect(m.gridOverflow, 'day grid fits').toBeLessThanOrEqual(1);
      expect(m.left).toBeGreaterThanOrEqual(0);
      expect(m.right, 'calendar not off the right edge').toBeLessThanOrEqual(m.vw);
      expect(m.next, 'Next arrow on screen').toBeLessThanOrEqual(m.vw);
    });
  });
}
