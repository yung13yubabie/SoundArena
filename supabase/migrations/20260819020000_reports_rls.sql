-- reports 表從 init_schema 就開了 RLS,但從來沒有任何 policy——這輪技術債掃描抓到
-- ReportButton(web/src/components/ReportButton.tsx)完全是前端假裝成功(setSent(true)
-- 純本地 state,沒有任何 API 呼叫),就算接上真的寫入也會被 RLS 完全擋下(zero policy = 沒人
-- 能寫)。這裡先補上「檢舉」這個動作需要的 policy;PlatformAdmin 端的檢舉處理清單(AdminShell
-- 的「platform-reports」畫面)目前還沒有真人是 is_platform_admin=true,是不可能被觸發到的
-- 死路徑,這輪刻意不動它,只補「送出檢舉」這一半。

create policy "reports insertable by authenticated users" on reports for insert with check (
  auth.uid() = reporter_id
  and exists (select 1 from competitions c where c.id = reports.competition_id and c.is_public = true)
);

create policy "reports readable by platform admin" on reports for select using (is_platform_admin());

create policy "reports updatable by platform admin" on reports for update using (is_platform_admin()) with check (is_platform_admin());
