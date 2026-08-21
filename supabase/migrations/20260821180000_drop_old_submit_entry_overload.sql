-- 真實 PoC 抓到:20260821150000 幫 submit_entry() 加 p_audio_object_key 參數時,
-- 用的是 create or replace,但新舊參數列表不一樣(多了一個參數),Postgres 不會
-- 把它當成「取代同一支函式」,而是額外建立一個重載版本——舊的 8 參數版本沒有被
-- 真的取代,兩個版本同時存在。結果是任何只帶 8 個具名參數呼叫 submit_entry()
-- 的請求(沒有明確帶 p_audio_object_key)都會撞上 PostgREST 「無法決定要呼叫
-- 哪一個重載」的錯誤(PGRST203)。目前 Next.js 這邊的 submitEntry() 一律會帶
-- p_audio_object_key(即使是 null),所以正常流程沒受影響,但這個殘留的舊重載
-- 本身就是個隱患,直接刪掉,只留 9 參數版本。

drop function if exists submit_entry(uuid, uuid, text, text, text, text, text, boolean);
