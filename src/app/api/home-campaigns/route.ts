import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAdminSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Poster storage is not configured." }, { status: 503 });
  }

  const { data: campaigns, error } = await supabase
    .from("home_campaigns")
    .select("id, eyebrow, title, title_emphasis, description, cta_label, href, image_url, layout, display_order, is_active")
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    const missingTable = error.code === "42P01" || error.code === "PGRST205";
    return NextResponse.json({
      error: missingTable ? "Apply SUPABASE_HOME_CAMPAIGNS_MIGRATION.sql to enable admin-managed posters." : "Unable to load homepage posters.",
    }, { status: missingTable ? 503 : 500 });
  }

  return NextResponse.json({ campaigns: campaigns ?? [] }, {
    headers: { "Cache-Control": "no-store" },
  });
}
