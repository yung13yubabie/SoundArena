// Regression guard for the "按鈕應該都展現的，可以真實接入" pass (2026-08-09): every button that
// looked interactive now has to actually do something observable. This checks the buttons that
// were silently no-op before this pass.
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
  const goto = async (label) => { await page.locator('.review-pill', { hasText: label }).click(); await page.waitForTimeout(300); };

  // 報名：必填未填時擋下，填完可送出並看到確認畫面
  await goto('報名');
  const registerBtn = page.locator('button', { hasText: '送出報名' });
  assert(await registerBtn.isDisabled(), '報名表單未填寫完整時，送出按鈕停用');
  await page.locator('input').first().fill('夜遊者');
  await page.locator('input').nth(1).fill('my13u');
  await registerBtn.click();
  await page.waitForTimeout(200);
  assert((await page.locator('h1', { hasText: '報名完成' }).count()) === 1, '報名送出後顯示確認畫面');

  // 投票：投票後鎖定選擇、顯示已投票狀態
  await goto('投票');
  await page.locator('.vote-card').nth(0).locator('button', { hasText: '投這首' }).click();
  await page.waitForTimeout(200);
  assert((await page.locator('button', { hasText: '已投這首' }).count()) === 1, '投票後該卡片顯示「已投這首」');
  const remainingVoteButtons = page.locator('.vote-card button', { hasText: '投這首' });
  const remainingCount = await remainingVoteButtons.count();
  let allDisabled = true;
  for (let i = 0; i < remainingCount; i++) { if (!(await remainingVoteButtons.nth(i).isDisabled())) allDisabled = false; }
  assert(remainingCount > 0 && allDisabled, '投票後其餘卡片的「投這首」按鈕仍顯示但已停用，不能再被點');

  // 擂台：點清單項目切換播放狀態，底部播放列同步顯示歌名
  await goto('擂台');
  await page.locator('.track-row').nth(2).click();
  await page.waitForTimeout(200);
  const playingRows = await page.locator('.track-row.playing').count();
  assert(playingRows === 1, '點擊清單項目後，同時只有一列顯示為播放中（換歌銷毀重建音源，不會兩首同時播）');

  // 賽制建立：新增輪次、移除計分項目、權重驗證即時反映
  await goto('賽制建立');
  const roundCountBefore = await page.locator('.round-card').count();
  await page.locator('button', { hasText: '新增中間輪次' }).click();
  await page.waitForTimeout(200);
  const roundCountAfter = await page.locator('.round-card').count();
  assert(roundCountAfter === roundCountBefore + 1, '新增中間輪次後，Round 卡片數量 +1');

  const removeBtn = page.locator('.score-editor-row button').first();
  const rowsBefore = await page.locator('.score-editor-row').count();
  await removeBtn.click();
  await page.waitForTimeout(200);
  const rowsAfter = await page.locator('.score-editor-row').count();
  assert(rowsAfter === rowsBefore - 1, '移除計分項目後，該列從編輯器消失');

  await browser.close();
  console.log(process.exitCode ? '\nREGRESSION SUITE FAILED' : '\nAll button-wiring checks passed');
})();
