import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminActivityIdentity = {
  uid: string;
  email: string | null;
  name: string | null;
};

export type AdminActivityEntry = {
  actor_uid: string | null;
  actor_email: string | null;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string;
  details: Record<string, unknown>;
};

export async function recordAdminActivity(
  supabase: SupabaseClient,
  actor: AdminActivityIdentity | null,
  activity: Omit<AdminActivityEntry, "actor_uid" | "actor_email" | "actor_name">,
) {
  const { error } = await supabase.from("admin_activity_log").insert({
    actor_uid: actor?.uid ?? null,
    actor_email: actor?.email ?? null,
    actor_name: actor?.name?.trim() || actor?.email || "Automated system",
    ...activity,
  });
  return error;
}

export function activityLogFailureResponse(action: string) {
  console.error(`The ${action} was saved, but its admin activity could not be recorded.`);
  return Response.json({
    error: `The ${action} was saved, but its audit record could not be written. Do not retry the change; refresh and check the Activity Log.`,
    actionApplied: true,
  }, { status: 503 });
}
