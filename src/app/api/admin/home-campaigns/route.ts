import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { validateHomeCampaign } from "@/lib/home-campaigns";
import { createAdminSupabase, getFirebaseIdentity } from "@/lib/server-auth";

const migrationError = "Run SUPABASE_HOME_CAMPAIGNS_MIGRATION.sql in the Supabase SQL Editor to enable homepage posters.";

function databaseErrorResponse(error: { code?: string; message: string }) {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return NextResponse.json({ error: migrationError }, { status: 503 });
  }
  return NextResponse.json({ error: "Unable to save homepage posters." }, { status: 500 });
}

async function authorize(request: Request) {
  const identity = await getFirebaseIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminEmail(identity.email)) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return null;
}

export async function GET(request: Request) {
  const authError = await authorize(request);
  if (authError) return authError;

  const supabase = createAdminSupabase();
  if (!supabase) return NextResponse.json({ error: "Poster storage is not configured." }, { status: 500 });

  const { data: campaigns, error } = await supabase
    .from("home_campaigns")
    .select("*")
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) return databaseErrorResponse(error);
  return NextResponse.json({ campaigns: campaigns ?? [] }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const authError = await authorize(request);
  if (authError) return authError;

  const supabase = createAdminSupabase();
  if (!supabase) return NextResponse.json({ error: "Poster storage is not configured." }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Enter valid poster details." }, { status: 400 });
  }

  const validation = validateHomeCampaign(body);
  if (!validation.fields) return NextResponse.json({ error: validation.error }, { status: 400 });

  if (body.display_order !== undefined && typeof body.display_order !== "number") {
    return NextResponse.json({ error: "Display order must be a whole number from 0 to 10,000." }, { status: 400 });
  }
  const displayOrder = typeof body.display_order === "number" ? body.display_order : 110;
  if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 10000) {
    return NextResponse.json({ error: "Display order must be a whole number from 0 to 10,000." }, { status: 400 });
  }
  if (body.is_active !== undefined && typeof body.is_active !== "boolean") {
    return NextResponse.json({ error: "Choose whether the poster is published." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("home_campaigns")
    .insert({
      id: crypto.randomUUID(),
      ...validation.fields,
      display_order: displayOrder,
      is_active: body.is_active ?? true,
    })
    .select()
    .single();

  if (error) return databaseErrorResponse(error);
  return NextResponse.json({ campaign: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const authError = await authorize(request);
  if (authError) return authError;

  const supabase = createAdminSupabase();
  if (!supabase) return NextResponse.json({ error: "Poster storage is not configured." }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Enter valid poster details." }, { status: 400 });
  }

  if (typeof body.id !== "string" || !body.id.trim()) {
    return NextResponse.json({ error: "Choose a poster to update." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  const includesCampaignFields = [
    "eyebrow", "title", "title_emphasis", "description", "cta_label", "href", "image_url", "layout",
  ].some((key) => key in body);
  if (includesCampaignFields) {
    const validation = validateHomeCampaign(body);
    if (!validation.fields) return NextResponse.json({ error: validation.error }, { status: 400 });
    Object.assign(update, validation.fields);
  }

  if (body.display_order !== undefined) {
    if (typeof body.display_order !== "number" || !Number.isInteger(body.display_order) || body.display_order < 0 || body.display_order > 10000) {
      return NextResponse.json({ error: "Display order must be a whole number from 0 to 10,000." }, { status: 400 });
    }
    update.display_order = body.display_order;
  }

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== "boolean") {
      return NextResponse.json({ error: "Choose whether the poster is published." }, { status: 400 });
    }
    update.is_active = body.is_active;
  }

  if (!Object.keys(update).length) return NextResponse.json({ error: "Make a poster change before saving." }, { status: 400 });

  update.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("home_campaigns")
    .update(update)
    .eq("id", body.id.trim())
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") return NextResponse.json({ error: "Poster not found." }, { status: 404 });
    return databaseErrorResponse(error);
  }
  return NextResponse.json({ campaign: data });
}

export async function DELETE(request: Request) {
  const authError = await authorize(request);
  if (authError) return authError;

  const supabase = createAdminSupabase();
  if (!supabase) return NextResponse.json({ error: "Poster storage is not configured." }, { status: 500 });

  let body: { id?: unknown };
  try {
    body = await request.json() as { id?: unknown };
  } catch {
    return NextResponse.json({ error: "Choose a poster to delete." }, { status: 400 });
  }

  if (typeof body.id !== "string" || !body.id.trim()) {
    return NextResponse.json({ error: "Choose a poster to delete." }, { status: 400 });
  }

  const { error, count } = await supabase
    .from("home_campaigns")
    .delete({ count: "exact" })
    .eq("id", body.id.trim());

  if (error) return databaseErrorResponse(error);
  if (count === 0) return NextResponse.json({ error: "Poster not found." }, { status: 404 });
  return NextResponse.json({ success: true });
}
