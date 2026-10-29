import { NextResponse } from "next/server";
import { normalizeDefaultAddresses } from "@/lib/account-addresses";
import { createAdminSupabase, getFirebaseIdentity } from "@/lib/server-auth";

const unauthorized = () => NextResponse.json({ error: "Please sign in to access your account." }, { status: 401 });

export async function GET(request: Request) {
  try {
    const identity = await getFirebaseIdentity(request);
    if (!identity) return unauthorized();

    const supabase = createAdminSupabase();
    if (!supabase) return NextResponse.json({ error: "Account storage is not configured." }, { status: 500 });

    const { data: profile, error } = await supabase
      .from("profiles")
      .upsert({ firebase_uid: identity.uid, email: identity.email, full_name: identity.name }, { onConflict: "firebase_uid" })
      .select("id, firebase_uid, full_name, email, phone, addresses, whatsapp_order_updates_opt_in")
      .single();

    if (error?.code === "42703") {
      return NextResponse.json({ error: "Account setup is incomplete. Run SUPABASE_ACCOUNT_MIGRATION.sql and SUPABASE_ORDER_NOTIFICATION_MIGRATION.sql in the Supabase SQL Editor, then refresh this page." }, { status: 503 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile });
  } catch {
    return NextResponse.json({ error: "Unable to load your account right now." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const identity = await getFirebaseIdentity(request);
    if (!identity) return unauthorized();

    const supabase = createAdminSupabase();
    if (!supabase) return NextResponse.json({ error: "Account storage is not configured." }, { status: 500 });

    const body = await request.json() as { phone?: unknown; addresses?: unknown; whatsappOrderUpdatesOptIn?: unknown };
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) {
      return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
    }

    if (!Array.isArray(body.addresses) || body.addresses.length === 0 || body.addresses.length > 10) {
      return NextResponse.json({ error: "Add at least one delivery address." }, { status: 400 });
    }

    const addresses = body.addresses.map((value) => {
      const address = value as Record<string, unknown>;
      return {
        id: typeof address.id === "string" ? address.id.slice(0, 80) : crypto.randomUUID(),
        label: typeof address.label === "string" ? address.label.trim().slice(0, 40) : "",
        city: typeof address.city === "string" ? address.city.trim().slice(0, 80) : "",
        address: typeof address.address === "string" ? address.address.trim().slice(0, 300) : "",
        is_default: address.is_default === true,
      };
    });

    if (addresses.some((address) => !address.label || !address.city || !address.address)) {
      return NextResponse.json({ error: "Complete the label, city, and street address for every address." }, { status: 400 });
    }

    const normalizedAddresses = normalizeDefaultAddresses(addresses);

    const { data: profile, error } = await supabase
      .from("profiles")
      .upsert({
        firebase_uid: identity.uid,
        email: identity.email,
        full_name: identity.name,
        phone,
        addresses: normalizedAddresses,
        whatsapp_order_updates_opt_in: body.whatsappOrderUpdatesOptIn === true,
      }, { onConflict: "firebase_uid" })
      .select("id, firebase_uid, full_name, email, phone, addresses, whatsapp_order_updates_opt_in")
      .single();

    if (error?.code === "42703") {
      return NextResponse.json({ error: "Account setup is incomplete. Run SUPABASE_ACCOUNT_MIGRATION.sql and SUPABASE_ORDER_NOTIFICATION_MIGRATION.sql in the Supabase SQL Editor, then refresh this page." }, { status: 503 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile });
  } catch {
    return NextResponse.json({ error: "Unable to save your account right now." }, { status: 500 });
  }
}