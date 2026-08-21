-- 用 diag_list_duplicate_overloads() 系統性掃過整個 schema,確認 submit_entry()
-- 的舊重載已經清乾淨,只剩下這一個殘留:check_suno_verify_rate_limit() 從無參數
-- 改成 (p_code text) 時,舊的無參數版本沒有被清掉。這個不會造成實際的呼叫歧義
-- (0 個參數 vs 必填 1 個參數,PostgREST 不會混淆),但留著是死程式碼,一併清掉。
-- 診斷用的 diag_list_duplicate_overloads() 也在這裡一起清掉,不留在 codebase 裡。

drop function if exists check_suno_verify_rate_limit();
drop function if exists diag_list_duplicate_overloads();
