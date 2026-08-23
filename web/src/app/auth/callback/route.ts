import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { safeNextPath } from "@/lib/loginRedirect";

// PUT /guilds/{guild.id}/members/{user.id} — the actual mechanism behind the
// `guilds.join` scope (SPEC.md 第1節). Silently no-ops until DISCORD_GUILD_ID
// is configured; never blocks login on failure.
//
// SA-005 通知功能需要知道「這個使用者的 Discord 帳號是誰」才能私訊——
// profiles.discord_user_id 這個欄位從建表以來就沒有任何程式碼寫入過(見
// 20260816120000_host_identity_and_privacy.sql 的註解),這裡順便補上。這個欄位
// 設計上是純 service_role 存取(20260816121000 migration:連 profile 擁有者自己都
// 不給查),一般 RLS-bound 的 authenticated client 寫不進去,要用 service_role。
async function joinDiscordGuild(userId: string, providerToken: string) {
  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!guildId || !botToken) return;

  try {
    const meResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${providerToken}` },
    });
    if (!meResponse.ok) return;
    const me: { id: string } = await meResponse.json();

    const serviceClient = createServiceClient();
    await serviceClient.from("profiles").update({ discord_user_id: me.id }).eq("id", userId);

    await fetch(`https://discord.com/api/guilds/${guildId}/members/${me.id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_token: providerToken }),
    });
  } catch {
    // Non-fatal — the user is still logged in even if guild join fails.
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  const { session } = data;
  if (session.user.app_metadata.provider === "discord" && session.provider_token) {
    await joinDiscordGuild(session.user.id, session.provider_token);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
