const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });

  const fileUrl = 'file://' + path.resolve(__dirname, 'prototype.html');
  await page.goto(fileUrl);
  await page.waitForTimeout(1500);

  await page.screenshot({ path: 'screenshots/01_login.png' });

  const labels = ['登入','報名','投稿表單','擂台','投票','評審評分'];
  const files = ['01_login','02_register','03_submit','04_list','05_vote','06_judge'];
  for (let i = 0; i < labels.length; i++) {
    const btn = await page.locator('.review-pill', { hasText: labels[i] });
    await btn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `screenshots/${files[i]}.png`, fullPage: true });
  }

  // interact: submit screen loading state (trigger is now onBlur, not onFocus)
  await page.locator('.review-pill', { hasText: '投稿表單' }).click();
  await page.waitForTimeout(200);
  const submitInput = page.locator('input').first();
  await submitInput.click({ clickCount: 3 });
  await submitInput.fill('https://suno.com/s/IKWrakvC2p7TUqRZ');
  await submitInput.blur();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/03b_submit_loading.png' });
  await page.waitForTimeout(1300);
  await page.screenshot({ path: 'screenshots/03c_submit_done.png' });
  // also capture the mismatch (error) branch introduced by the fix
  await submitInput.click({ clickCount: 3 });
  await submitInput.fill('https://suno.com/s/hl1nj5kSmsClebsu');
  await submitInput.blur();
  await page.waitForTimeout(1300);
  await page.screenshot({ path: 'screenshots/03d_submit_mismatch.png' });

  // list screen: expand round 2, show empty round 3
  await page.locator('.review-pill', { hasText: '擂台' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/04b_list_collapsed.png', fullPage: true });
  const round2 = await page.locator('.round-header', { hasText: '第 2 輪' });
  await round2.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/04c_list_expanded.png', fullPage: true });

  // vote screen: empty state toggle
  await page.locator('.review-pill', { hasText: '投票' }).click();
  await page.waitForTimeout(200);
  await page.locator('button', { hasText: '檢視空狀態' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/05b_vote_empty.png', fullPage: true });

  // judge screen: interact with boss bonus slider + formula
  await page.locator('.review-pill', { hasText: '評審評分' }).click();
  await page.waitForTimeout(200);
  await page.locator('button', { hasText: '查看計算方式' }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/06b_judge_formula.png', fullPage: true });

  // --- 第二批：個人狀態 / 審核後台 / 賽制建立 / 時程設定 ---
  await page.locator('.review-pill', { hasText: '個人狀態' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/07_status.png', fullPage: true });

  await page.locator('.review-pill', { hasText: '審核後台' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/08_review.png', fullPage: true });
  // interact: identity-mismatch row -> 人工放行
  await page.locator('button', { hasText: '人工放行' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/08b_review_after_override.png', fullPage: true });
  // empty state toggle
  await page.locator('button', { hasText: '檢視空狀態' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/08c_review_empty.png', fullPage: true });

  await page.locator('.review-pill', { hasText: '賽制建立' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/09_format.png', fullPage: true });
  // sidebar collapse toggle
  await page.locator('.admin-toggle').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/09b_format_collapsed_sidebar.png', fullPage: true });
  await page.locator('.admin-toggle').click();
  await page.waitForTimeout(200);
  // break the weight sum: change a weighted input on the first ScoreEditor (Competition 預設規則)
  const firstWeightInput = page.locator('.score-editor-row input[type=number]').first();
  await firstWeightInput.fill('55');
  await firstWeightInput.blur();
  await page.waitForTimeout(200);
  const badSumVisible = await page.locator('.weight-sum-bar.bad').count();
  console.log('weight-sum-bar shows invalid state after edit:', badSumVisible > 0);
  await page.screenshot({ path: 'screenshots/09c_format_weight_invalid.png', fullPage: true });
  // toggle a round's scoring override switch on (round 1, which starts off)
  await page.locator('.switch').first().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/09d_format_override_on.png', fullPage: true });

  await page.locator('.review-pill', { hasText: '時程設定' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/10_schedule.png', fullPage: true });
  const dateErrors = await page.locator('.date-error').count();
  console.log('schedule screen shows', dateErrors, 'boundary error(s) with the seeded bad dates');

  await browser.close();

  console.log('ERRORS:', JSON.stringify(errors, null, 2));
  console.log('DONE');
})();
