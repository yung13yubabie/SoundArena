import { createClient } from "@/lib/supabase/server";
import { FeedbackForm } from "./FeedbackForm";
import { redirectToLogin } from "@/lib/loginRedirect";

export default async function FeedbackPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirectToLogin("/feedback");
  }

  return <FeedbackForm />;
}
