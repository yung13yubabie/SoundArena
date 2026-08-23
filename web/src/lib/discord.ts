import "server-only";

// SA-005 通知功能:私訊需要 bot 跟收件人在同一個伺服器(DISCORD_GUILD_ID),這是
// Discord 平台本身的限制,不是這裡加的規則——沒有共同伺服器,或收件人自己把
// 「允許來自伺服器成員的私訊」關掉,Discord 會回 403,這裡讓它安靜失敗,呼叫端
// 決定要不要 log,不擋任何使用者操作。
export async function sendDiscordDm(discordUserId: string, content: string): Promise<void> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) throw new Error("DISCORD_BOT_TOKEN not configured");

  const channelResponse = await fetch("https://discord.com/api/users/@me/channels", {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient_id: discordUserId }),
  });
  if (!channelResponse.ok) {
    throw new Error(`failed to open DM channel: ${channelResponse.status} ${await channelResponse.text()}`);
  }
  const channel: { id: string } = await channelResponse.json();

  const messageResponse = await fetch(`https://discord.com/api/channels/${channel.id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });
  if (!messageResponse.ok) {
    throw new Error(`failed to send DM: ${messageResponse.status} ${await messageResponse.text()}`);
  }
}

const VIEW_CHANNEL = 1 << 10;
const SEND_MESSAGES = 1 << 11;
const READ_MESSAGE_HISTORY = 1 << 16;
const MEMBER_CHANNEL_ACCESS = VIEW_CHANNEL | SEND_MESSAGES | READ_MESSAGE_HISTORY;

function discordChannelName(competitionName: string): string {
  const slug = competitionName
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return (slug || "competition").slice(0, 90);
}

// 建立比賽時開一個私人文字頻道——預設對 @everyone 隱藏(deny VIEW_CHANNEL),只有
// 主辦人跟後續報名的人透過 grantDiscordChannelAccess() 個別開放,不是整個伺服器都看得到。
//
// 真實 PoC 踩到的坑:一開始只設定「@everyone 看不到」,沒有另外允許 Bot 自己看得到——
// Discord 的權限計算裡,頻道層級的 deny 會蓋過 Bot 在伺服器層級的權限(MANAGE_CHANNELS/
// MANAGE_ROLES 都一樣,只要看不到這個頻道,連編輯這個頻道的權限覆寫都會被拒絕,GET/PUT
// 都回 403)。必須在建立頻道的同一次呼叫裡,順便把 Bot 自己加進權限覆寫清單。
export async function createCompetitionChannel(guildId: string, competitionName: string): Promise<string> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) throw new Error("DISCORD_BOT_TOKEN not configured");

  const meResponse = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bot ${botToken}` } });
  if (!meResponse.ok) {
    throw new Error(`failed to resolve bot user id: ${meResponse.status} ${await meResponse.text()}`);
  }
  const bot: { id: string } = await meResponse.json();

  const response = await fetch(`https://discord.com/api/guilds/${guildId}/channels`, {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: discordChannelName(competitionName),
      type: 0,
      permission_overwrites: [
        { id: guildId, type: 0, deny: String(VIEW_CHANNEL) },
        { id: bot.id, type: 1, allow: String(MEMBER_CHANNEL_ACCESS) },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`failed to create competition channel: ${response.status} ${await response.text()}`);
  }
  const channel: { id: string } = await response.json();
  return channel.id;
}

// 報名成功(或主辦人建立比賽當下)後,把這個人加進頻道的可視範圍——用頻道層級
// 的權限覆寫,不是把人拉進伺服器(guilds.join 那個是另一件事,兩者互相獨立)。
export async function grantDiscordChannelAccess(channelId: string, discordUserId: string): Promise<void> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) throw new Error("DISCORD_BOT_TOKEN not configured");

  const response = await fetch(`https://discord.com/api/channels/${channelId}/permissions/${discordUserId}`, {
    method: "PUT",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: 1, allow: String(MEMBER_CHANNEL_ACCESS) }),
  });
  if (!response.ok) {
    throw new Error(`failed to grant channel access: ${response.status} ${await response.text()}`);
  }
}
