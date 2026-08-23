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
