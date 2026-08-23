-- 建立比賽自動開一個私人 Discord 頻道,報名後自動把人加進去(頻道層級權限覆寫,
-- 不是拉進伺服器——guilds.join 那個是登入時的另一件事)。這個欄位由伺服器端
-- (service_role,呼叫 Discord API 拿到真的 channel id 之後才寫入)維護,不開放給
-- authenticated 直接改——比照 profiles.discord_user_id 同一套理由:讓使用者能自己
-- 改這個值,等於能讓自己的比賽指向任意頻道,是真實的隱私/正確性風險,不只是理論上。
alter table competitions add column discord_channel_id text;
