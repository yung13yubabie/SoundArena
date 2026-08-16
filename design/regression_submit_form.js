// Regression guard for the bug reported 2026-08-09: the submission form's preview card
// was hardcoded regardless of what link was pasted. This script fails loudly if that
// ever regresses (i.e. if two different inputs ever produce the same preview output).
const { chromium } = require('playwright');
const path = require('path');

function assert(cond, msg) {
  if (!cond) { console.error('REGRESSION FAILED:', msg); process.exitCode = 1; }
  else console.log('ok -', msg);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const fileUrl = 'file://' + path.resolve(__dirname, 'prototype.html');
  await page.goto(fileUrl);
  await page.waitForTimeout(800);
  await page.locator('.review-pill', { hasText: '投稿表單' }).click();
  await page.waitForTimeout(300);

  const input = page.locator('input').first();
  const preview = page.locator('.preview-card');

  // Case A: default link (my13u's own song) -> should match, show 抽象善良 / MY
  await input.click({ clickCount: 3 });
  await input.fill('https://suno.com/s/IKWrakvC2p7TUqRZ');
  await input.blur();
  await page.waitForTimeout(1300);
  const textA = await preview.innerText();
  assert(textA.includes('抽象善良') && textA.includes('MY'), 'known-match link shows 抽象善良/MY');
  assert(textA.includes('通過'), 'known-match link shows 身份比對 通過');

  // Case B: a different real link (someone else's song) -> should mismatch, NOT show 抽象善良
  await input.click({ clickCount: 3 });
  await input.fill('https://suno.com/s/hl1nj5kSmsClebsu');
  await input.blur();
  await page.waitForTimeout(1300);
  const textB = await preview.innerText();
  assert(!textB.includes('抽象善良'), 'different link no longer shows the stale 抽象善良 data (the original bug)');
  assert(textB.includes('不通過'), 'mismatched author link shows 身份比對 不通過');

  // Case C: garbage input -> invalid state, not a false "match"
  await input.click({ clickCount: 3 });
  await input.fill('not a url');
  await input.blur();
  await page.waitForTimeout(1300);
  const invalidVisible = await page.locator('.parse-state.error', { hasText: '看不出這是 Suno 分享連結' }).count();
  assert(invalidVisible === 1, 'garbage input shows the invalid-link state');

  // Case D: bug reported 2026-08-09 — the EXPANDED redirect URL form (suno.com/song/{uuid}?sh={code})
  // must parse the same as the short suno.com/s/{code} form; both are real, equivalent Suno URLs.
  await input.click({ clickCount: 3 });
  await input.fill('https://suno.com/song/367c300d-bb3e-4416-8017-829a76fdb36b?sh=IKWrakvC2p7TUqRZ');
  await input.blur();
  await page.waitForTimeout(1300);
  const textD = await preview.innerText();
  assert(textD.includes('抽象善良') && textD.includes('通過'), 'expanded /song/{uuid}?sh={code} URL form parses same as the short /s/{code} form');

  await browser.close();
  console.log(process.exitCode ? '\nREGRESSION SUITE FAILED' : '\nAll regression checks passed');
})();
