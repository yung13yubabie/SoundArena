-- 清掉這輪除錯用的暫時 function(diag_list_feedback_policies / diag_list_feedback_grants)。
-- 排查結論:意見回饋的寫入 RLS policy 從頭到尾都是對的,42501 是我自己的診斷腳本多帶了
-- `Prefer: return=representation` 觸發隱含的 SELECT-back,被(當時還沒開放的)SELECT policy
-- 擋下來——不是真的 bug,FeedbackForm.tsx 本來就沒有要求 return=representation。
drop function if exists diag_list_feedback_policies();
drop function if exists diag_list_feedback_grants();
