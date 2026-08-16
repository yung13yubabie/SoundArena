import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RegisterForm } from "./RegisterForm";

// SPEC.md 第2節「存取順序(硬性)」：未登入不得進入報名頁。src/proxy.ts already
// redirects at the routing layer; this is the defense-in-depth check Next.js's
// own docs recommend doing inside the route itself too.
export default async function RegisterPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/login");
  }

  return <RegisterForm />;
}
