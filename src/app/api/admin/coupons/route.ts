import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { validateCouponInput } from "@/lib/coupons";
import { createAdminSupabase, getFirebaseIdentity } from "@/lib/server-auth";

async function authorize(request: Request) {
  const identity = await getFirebaseIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminEmail(identity.email)) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return null;
}

function databaseError(error: { code?: string; message: string }) {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return NextResponse.json({ error: "Run SUPABASE_ORDER_SUMMARY_COUPONS_MIGRATION.sql to enable coupon management." }, { status: 503 });
  }
  if (error.code === "23505") return NextResponse.json({ error: "A coupon with that code already exists." }, { status: 409 });
  return NextResponse.json({ error: "Unable to save coupons right now." }, { status: 500 });
}

export async function GET(request: Request) {
  const authError = await authorize(request);
  if (authError) return authError;
  const supabase = createAdminSupabase();
  if (!supabase) return NextResponse.json({ error: "Coupon storage is not configured." }, { status: 503 });

  const { data, error } = await supabase
    .from("checkout_coupons")
    .select("id, code, discount_type, discount_amount, is_active, starts_at, expires_at, minimum_subtotal, maximum_redemptions, redemption_count, reserved_redemptions")
    .order("created_at", { ascending: false });
  if (error) return databaseError(error);
  return NextResponse.json({ coupons: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const authError = await authorize(request);
  if (authError) return authError;
  const supabase = createAdminSupabase();
  if (!supabase) return NextResponse.json({ error: "Coupon storage is not configured." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Enter valid coupon details." }, { status: 400 });
  }
  const validation = validateCouponInput(body);
  if (!validation.coupon) return NextResponse.json({ error: validation.error }, { status: 400 });

  const { data, error } = await supabase
    .from("checkout_coupons")
    .insert(validation.coupon)
    .select()
    .single();
  if (error) return databaseError(error);
  return NextResponse.json({ coupon: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const authError = await authorize(request);
  if (authError) return authError;
  const supabase = createAdminSupabase();
  if (!supabase) return NextResponse.json({ error: "Coupon storage is not configured." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Enter valid coupon details." }, { status: 400 });
  }
  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) {
    return NextResponse.json({ error: "Choose a coupon to update." }, { status: 400 });
  }
  const validation = validateCouponInput(body);
  if (!validation.coupon) return NextResponse.json({ error: validation.error }, { status: 400 });

  const { data, error } = await supabase
    .from("checkout_coupons")
    .update({ ...validation.coupon, updated_at: new Date().toISOString() })
    .eq("id", body.id)
    .select()
    .single();
  if (error?.code === "PGRST116") return NextResponse.json({ error: "Coupon not found." }, { status: 404 });
  if (error) return databaseError(error);
  return NextResponse.json({ coupon: data });
}

export async function DELETE(request: Request) {
  const authError = await authorize(request);
  if (authError) return authError;
  const supabase = createAdminSupabase();
  if (!supabase) return NextResponse.json({ error: "Coupon storage is not configured." }, { status: 503 });

  let body: { id?: unknown };
  try {
    body = await request.json() as { id?: unknown };
  } catch {
    return NextResponse.json({ error: "Choose a coupon to delete." }, { status: 400 });
  }
  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) {
    return NextResponse.json({ error: "Choose a coupon to delete." }, { status: 400 });
  }

  const { data: coupon, error: loadError } = await supabase
    .from("checkout_coupons")
    .select("id, reserved_redemptions")
    .eq("id", body.id)
    .maybeSingle();
  if (loadError) return databaseError(loadError);
  if (!coupon) return NextResponse.json({ error: "Coupon not found." }, { status: 404 });
  if (coupon.reserved_redemptions > 0) {
    return NextResponse.json({ error: "This coupon cannot be deleted while a payment is in progress. Deactivate it instead." }, { status: 409 });
  }

  const { error } = await supabase.from("checkout_coupons").delete().eq("id", body.id);
  if (error) return databaseError(error);
  return NextResponse.json({ success: true });
}
