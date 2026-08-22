import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/loginRedirect";

// PUT /guilds/{guild.id}/members/{user.id} — the actual mechanism behind the
// `guilds.join` scope (SPEC.md 第1節). Silently no-ops until DISCORD_GUILD_ID
// is configured; never blocks login on failure.
async function joinDiscordGuild(providerToken: string) {
  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!guildId || !botToken) return;

  try {
    const meResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${providerToken}` },
    });
    if (!meResponse.ok) return;
    const me: { id: string } = await meResponse.json();

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
    await joinDiscordGuild(session.provider_token);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
