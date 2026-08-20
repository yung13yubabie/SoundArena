-- 上一支 migration 補齊時間窗/審核狀態檢查後,自己重跑迴歸測試才發現:連正常合法的
-- 投票都被擋下來,不是邏輯錯——是可見度問題。castVote() 沒有走 SECURITY DEFINER RPC
-- (直接 insert votes,一直是這樣),trigger 用 SECURITY INVOKER(預設),所以 trigger
-- 內部查 registrations/submissions 時,是用「投票的人」的權限去查,而
-- registrations 的 public 讀取政策是 `is_public = true`——投票人通常跟被投的人完全
-- 沒關係,is_public 又是投稿者自己的隱私設定,不是「這場投票有沒有效」的條件,
-- 兩者被誤關聯在一起,導致 trigger 内部的 join 完全查不到資料,连合法投票也一起擋掉。
-- 修法:trigger function 改成 security definer,內部驗證邏輯本來就不會把資料回傳給
-- 呼叫者(只會 raise exception 或放行),不會造成資料外洩,可以放心繞過 RLS 讀取。

alter function check_vote_validity() security definer set search_path = public;
