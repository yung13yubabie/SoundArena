-- 業界導師制(mentor_system)移除——確認過整個 repo(含所有 SQL)完全沒有任何程式碼
-- 引用這個 key,純粹是 /admin/format 頁面可以打勾的空殼標籤,沒有配對/評分邏輯。
-- 先清掉可能存在的 round_format_blocks 掛載(理論上應該是0筆,防禦性處理),
-- 再從目錄表移除,/admin/format 的特殊機制清單會自動少一個選項(目錄是動態查表)。
delete from round_format_blocks
where format_block_id = (select id from format_blocks where key = 'mentor_system');

delete from format_blocks where key = 'mentor_system';
