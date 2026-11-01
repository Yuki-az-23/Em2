// One visitor goes through the door as a participant, two people talk in the
// simulator, the chat ends, and the card it produced is found and embraced on
// the wall. Everything runs against the real local stack (npm run demo).
import { test, expect } from '@playwright/test';

const handleIn = async (pane) => {
  const text = await pane.innerText();
  return /קוראים לך (\S+)\./.exec(text)?.[1];
};

test('door, simulator, wall', async ({ page }) => {
  // the door
  await page.goto('/');
  await page.getByLabel(/איך לקרוא לך/).fill('אלה כהן');
  await page.getByText('אני בוטח באות שלי').click();
  const sim = page.getByTestId('simulator-link');
  await expect(sim).toBeVisible();
  await sim.click();

  // the simulator: A has been greeted and asked to consent
  const a = page.getByTestId('pane-a');
  const b = page.getByTestId('pane-b');
  await expect(a).toContainText('מסכים');
  const handleA = await handleIn(a);
  expect(handleA).toBeTruthy();

  const sayIn = async (pane, testid, text) => {
    await page.getByTestId(`${testid}-input`).fill(text);
    await page.getByTestId(`${testid}-input`).press('Enter');
    await expect(pane).toContainText(text);
  };

  const tap = async (pane, testid, label) => {
    await pane.getByTestId(`${testid}-key`).filter({ hasText: label }).click();
    await expect(pane).toContainText(label);
  };

  await sayIn(a, 'pane-a', 'מסכים');
  await expect(a).toContainText('איזה רגש');
  await tap(a, 'pane-a', 'אמון');
  await expect(a).toContainText('ואיזה צבע?');
  await tap(a, 'pane-a', 'ליים');
  await expect(a).toContainText('נרשם: אמון, ליים');
  await expect(a.getByTestId('pane-a-key')).toHaveCount(0);
  await sayIn(a, 'pane-a', '/invite');
  await a.getByTestId('hand-over').click();
  await expect(b).toContainText('קוראים לך');
  const handleB = await handleIn(b);
  await sayIn(b, 'pane-b', 'מסכים');
  await tap(b, 'pane-b', 'עצב');
  await tap(b, 'pane-b', 'כחול');
  await expect(b).toContainText(`${handleA} נכנס`);
  await expect(a).toContainText(`${handleB} נכנס`);

  await sayIn(a, 'pane-a', 'זוכר את החוף בחיפה? הים היה שטוח.');
  await expect(b).toContainText(`${handleA}: זוכר את החוף בחיפה? הים היה שטוח.`);
  await sayIn(b, 'pane-b', 'זוכר. אמרת שמותר להתחיל מחדש.');
  await expect(a).toContainText(`${handleB}: זוכר. אמרת שמותר להתחיל מחדש.`);
  await sayIn(a, 'pane-a', '/end');
  await expect(b).toContainText('השיחה נסגרה');

  // the wall: enter at the card's state (trust/lime and sad/blue meet at feared/green), find it, embrace it
  await page.goto('/wall');
  await page.evaluate(() => localStorage.setItem('hermes.visitor', JSON.stringify({ emotion: 'feared', color: 'green' })));
  await page.reload();
  const card = page.getByTestId('wall-card').filter({ hasText: handleA }).filter({ hasText: handleB });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).not.toContainText('אלה');
  await expect(card).not.toContainText('חיפה');
  await expect(card).toContainText('0 חיבוקים');
  await card.getByRole('button', { name: 'לחבק' }).click();
  await expect(card).toContainText('1 חיבוקים');
});
