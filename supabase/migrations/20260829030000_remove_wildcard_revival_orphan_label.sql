-- Codex 第二輪對抗式審查 Finding 5(中)的修復。「敗部復活戰」(special.
-- wildcard_revival)這個 round 層級的勾選標籤是孤兒節點:真正驅動外卡復活的
-- WildcardRevivalPanel 是競賽層級元件(AdminFormatClient.tsx),完全不看任何
-- round 的 special 值;open_wildcard_revival_event() 的資料庫驗證也完全不查
-- round_format_blocks/format_blocks。也就是說勾選任一輪的「敗部復活戰」不會
-- 啟用任何功能、不勾選也一樣可以正常開外卡投票——比業界導師制那種純標籤更容易
-- 誤導主辦人,因為它「看起來」像是接上了。查證過整個 web/src 沒有任何程式碼
-- 引用這個 special key 本身(只有真正的 wildcard_revival_events/_candidates/
-- _votes 表跟對應 RPC,那些是外卡復活功能本體,不受影響),移除即可,前端目錄
-- 是動態查表,不需要程式碼異動。
delete from round_format_blocks
where format_block_id = (select id from format_blocks where key = 'wildcard_revival');

delete from format_blocks where key = 'wildcard_revival';
