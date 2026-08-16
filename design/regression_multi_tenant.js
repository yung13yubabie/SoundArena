const { chromium } = require('playwright');
const path = require('path');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok -', msg);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const fileUrl = 'file://' + path.resolve(__dirname, 'prototype.html');
  await page.goto(fileUrl);
  await page.waitForTimeout(800);

  // --- Discovery: default view + filter interaction ---
  await page.screenshot({ path: 'screenshots/11_discovery.png', fullPage: true });
  const allCount = await page.locator('.stage-inner .glass').count();
  await page.locator('.review-pill.active ~ .review-pill', { hasText: '即將開始' }).click().catch(async () => {
    await page.locator('button', { hasText: '即將開始' }).first().click();
  });
  await page.waitForTimeout(300);
  const filteredCount = await page.locator('.stage-inner .glass').count();
  assert(filteredCount < allCount, `Discovery 篩選「即將開始」後卡片數變少（${allCount} -> ${filteredCount}）`);
  await page.screenshot({ path: 'screenshots/11b_discovery_filtered.png', fullPage: true });
  // empty-state filter
  await page.locator('button', { hasText: '全部' }).first().click();
  await page.waitForTimeout(200);

  // --- 擂台: report flow ---
  await page.locator('.review-pill', { hasText: '擂台' }).click();
  await page.waitForTimeout(300);
  await page.locator('button', { hasText: '檢舉此比賽' }).click();
  await page.waitForTimeout(200);
  await page.locator('textarea').fill('測試檢舉理由');
  await page.locator('button', { hasText: '送出檢舉' }).click();
  await page.waitForTimeout(200);
  const reportConfirmed = await page.locator('text=檢舉已送出').count();
  assert(reportConfirmed === 1, '送出檢舉後顯示確認回饋');
  await page.screenshot({ path: 'screenshots/04d_list_report_sent.png', fullPage: true });

  // --- AdminShell: viewpoint toggle ---
  await page.locator('.review-pill', { hasText: '審核後台' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/08d_review_organizer_view.png', fullPage: true });
  await page.locator('.switch').first().click();
  await page.waitForTimeout(300);
  const platformNavVisible = await page.locator('.admin-nav-item', { hasText: '檢舉處理' }).count();
  assert(platformNavVisible === 1, '切到 PlatformAdmin 視角後側欄出現「檢舉處理」項目');
  await page.locator('.admin-nav-item', { hasText: '檢舉處理' }).click();
  await page.waitForTimeout(300);
  const reportRows = await page.locator('.admin-main .glass').count();
  assert(reportRows >= 2, 'PlatformAdmin 檢舉處理頁顯示待處理檢舉清單');
  await page.screenshot({ path: 'screenshots/08e_platform_reports.png', fullPage: true });
  // resolve one report
  await page.locator('button', { hasText: '標記已處理' }).first().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/08f_platform_report_resolved.png', fullPage: true });

  await page.locator('.admin-nav-item', { hasText: '全站比賽' }).click();
  await page.waitForTimeout(300);
  const allCompRows = await page.locator('.admin-main tbody tr').count();
  assert(allCompRows >= 3, 'PlatformAdmin 全站比賽頁列出多個 Organizer 的比賽');
  await page.screenshot({ path: 'screenshots/08g_platform_competitions.png', fullPage: true });

  await browser.close();
  console.log(process.exitCode ? '\nFAILED' : '\nAll batch-3 checks passed');
})();
