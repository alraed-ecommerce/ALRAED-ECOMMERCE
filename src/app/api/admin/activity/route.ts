import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { createAdminSupabase, getFirebaseIdentity } from "@/lib/server-auth";

export async function GET(request: Request) {
  const identity = await getFirebaseIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!isAdminEmail(identity.email)) return NextResponse.json({ error: "Access denied." }, { status: 403 });

  const supabase = createAdminSupabase();
  if (!supabase) return NextResponse.json({ error: "Activity log storage is not configured." }, { status: 503 });

  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = 50;
  const from = (page - 1) * pageSize;
  const { data, error, count } = await supabase
    .from("admin_activity_log")
    .select("id, actor_name, actor_email, action, entity_type, entity_id, entity_label, details, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) {
    console.error("Unable to load admin activity.", error.message);
    if (error.code === "42P01" || error.code === "PGRST205") {
      return NextResponse.json({ error: "Run SUPABASE_ADMIN_ACTIVITY_MIGRATION.sql in Supabase to enable the Activity Log." }, { status: 503 });
    }
    return NextResponse.json({ error: "Unable to load the Activity Log." }, { status: 500 });
  }

  return NextResponse.json({
    activities: data ?? [],
    page,
    pageSize,
    total: count ?? 0,
    hasMore: (count ?? 0) > from + (data?.length ?? 0),
  }, { headers: { "Cache-Control": "no-store" } });
}
