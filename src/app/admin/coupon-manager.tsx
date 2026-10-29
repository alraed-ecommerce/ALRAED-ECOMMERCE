"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Pencil, Plus, RefreshCw, Tag, Trash2, X } from "lucide-react";
import type { User } from "firebase/auth";

type Coupon = {
  id: string;
  code: string;
  discount_type: "fixed";
  discount_amount: number;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  minimum_subtotal: number | null;
  maximum_redemptions: number | null;
  redemption_count: number;
  reserved_redemptions: number;
};

type CouponForm = {
  code: string;
  discount_type: "fixed";
  discount_amount: string;
  is_active: boolean;
  starts_at: string;
  expires_at: string;
  minimum_subtotal: string;
  maximum_redemptions: string;
};

const emptyForm = (): CouponForm => ({
  code: "",
  discount_type: "fixed",
  discount_amount: "",
  is_active: true,
  starts_at: "",
  expires_at: "",
  minimum_subtotal: "",
  maximum_redemptions: "",
});
const money = (amount: number) => `AED ${Number(amount).toFixed(2)}`;

export default function CouponManager({ user }: { user: User }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [form, setForm] = useState<CouponForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const request = useCallback(async (url: string, method = "GET", body?: unknown) => {
    const token = await user.getIdToken();
    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    const result = await response.json() as { coupons?: Coupon[]; coupon?: Coupon; error?: string };
    if (!response.ok) throw new Error(result.error || "Unable to update coupons.");
    return result;
  }, [user]);

  const loadCoupons = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await request("/api/admin/coupons");
      setCoupons(result.coupons ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load coupons.");
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCoupons(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCoupons]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
  };

  const editCoupon = (coupon: Coupon) => {
    setEditingId(coupon.id);
    setForm({
      code: coupon.code,
      discount_type: "fixed",
      discount_amount: String(coupon.discount_amount),
      is_active: coupon.is_active,
      starts_at: coupon.starts_at ?? "",
      expires_at: coupon.expires_at ?? "",
      minimum_subtotal: coupon.minimum_subtotal === null ? "" : String(coupon.minimum_subtotal),
      maximum_redemptions: coupon.maximum_redemptions === null ? "" : String(coupon.maximum_redemptions),
    });
    setError("");
    setNotice("");
  };

  const saveCoupon = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        ...form,
        discount_amount: form.discount_amount,
        starts_at: form.starts_at || null,
        expires_at: form.expires_at || null,
        minimum_subtotal: form.minimum_subtotal || null,
        maximum_redemptions: form.maximum_redemptions || null,
      };
      const result = await request("/api/admin/coupons", editingId ? "PATCH" : "POST", {
        ...payload,
        ...(editingId ? { id: editingId } : {}),
      });
      if (!result.coupon) throw new Error("The coupon was not returned after saving.");
      setCoupons((current) => editingId
        ? current.map((coupon) => coupon.id === editingId ? result.coupon! : coupon)
        : [result.coupon!, ...current]);
      setNotice(`${result.coupon.code} ${editingId ? "updated" : "created"} successfully.`);
      resetForm();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this coupon.");
    } finally {
      setSaving(false);
    }
  };

  const toggleCoupon = async (coupon: Coupon) => {
    setBusyId(coupon.id);
    setError("");
    setNotice("");
    try {
      const result = await request("/api/admin/coupons", "PATCH", {
        id: coupon.id,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_amount: coupon.discount_amount,
        is_active: !coupon.is_active,
        starts_at: coupon.starts_at,
        expires_at: coupon.expires_at,
        minimum_subtotal: coupon.minimum_subtotal,
        maximum_redemptions: coupon.maximum_redemptions,
      });
      if (!result.coupon) throw new Error("The coupon status was not returned after saving.");
      setCoupons((current) => current.map((item) => item.id === coupon.id ? result.coupon! : item));
      setNotice(`${coupon.code} ${result.coupon.is_active ? "activated" : "deactivated"}.`);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update coupon status.");
    } finally {
      setBusyId(null);
    }
  };

  const deleteCoupon = async (coupon: Coupon) => {
    if (!window.confirm(`Delete coupon ${coupon.code}? This cannot be undone.`)) return;
    setBusyId(coupon.id);
    setError("");
    setNotice("");
    try {
      await request("/api/admin/coupons", "DELETE", { id: coupon.id });
      setCoupons((current) => current.filter((item) => item.id !== coupon.id));
      if (editingId === coupon.id) resetForm();
      setNotice(`${coupon.code} deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete this coupon.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section id="coupons" className="mb-8 scroll-mt-6 rounded-3xl border border-sky-400/20 bg-slate-900 p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Promotions</p><h2 className="mt-1 text-xl font-bold">Coupon management</h2></div>
        <button type="button" onClick={() => void loadCoupons()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"><RefreshCw size={14} /> Refresh</button>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert">{error}</div>}
      {notice && <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200" role="status"><Check size={15} />{notice}</div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(280px,.8fr)_minmax(0,1.2fr)]">
        <form onSubmit={(event) => void saveCoupon(event)} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-4">
          <div className="flex items-center justify-between"><h3 className="font-semibold">{editingId ? "Edit coupon" : "Create coupon"}</h3>{editingId && <button type="button" onClick={resetForm} aria-label="Cancel editing" className="text-slate-400 hover:text-white"><X size={17} /></button>}</div>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Coupon code
            <input required maxLength={40} value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white" placeholder="SAVE20" autoComplete="off" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Discount type
              <select value={form.discount_type} onChange={(event) => setForm((current) => ({ ...current, discount_type: event.target.value as "fixed" }))} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white"><option value="fixed">Fixed amount (AED)</option></select>
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Discount amount (AED)
              <input required min="0.01" step="0.01" type="number" value={form.discount_amount} onChange={(event) => setForm((current) => ({ ...current, discount_amount: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white" placeholder="20.00" />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Starts on (optional)
              <input type="date" value={form.starts_at} onChange={(event) => setForm((current) => ({ ...current, starts_at: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white" />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Expires on (optional)
              <input type="date" value={form.expires_at} onChange={(event) => setForm((current) => ({ ...current, expires_at: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white" />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Minimum product subtotal (optional)
              <input min="0" step="0.01" type="number" value={form.minimum_subtotal} onChange={(event) => setForm((current) => ({ ...current, minimum_subtotal: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white" placeholder="No minimum" />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Maximum redemptions (optional)
              <input min="1" step="1" type="number" value={form.maximum_redemptions} onChange={(event) => setForm((current) => ({ ...current, maximum_redemptions: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white" placeholder="Unlimited" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} className="accent-sky-400" />Active and available to customers</label>
          <button type="submit" disabled={saving} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-sky-300 disabled:cursor-wait disabled:opacity-50">{saving ? "Saving…" : editingId ? <><Check size={15} /> Save changes</> : <><Plus size={15} /> Create coupon</>}</button>
        </form>

        <div className="space-y-3">
          {loading ? <div className="rounded-2xl border border-slate-800 p-5 text-sm text-slate-400">Loading coupons…</div> : coupons.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">No coupons configured yet.</div> : coupons.map((coupon) => (
            <article key={coupon.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><div className="flex items-center gap-2 font-bold text-white"><Tag size={15} className="text-sky-300" />{coupon.code}</div><div className="mt-1 text-sm text-slate-300">{money(coupon.discount_amount)} fixed discount</div></div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${coupon.is_active ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>{coupon.is_active ? "Active" : "Inactive"}</span>
              </div>
              <div className="mt-3 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
                <span>Expires: {coupon.expires_at ?? "No expiry"}</span>
                <span>Minimum: {coupon.minimum_subtotal === null ? "None" : money(coupon.minimum_subtotal)}</span>
                <span>Redemptions: {coupon.redemption_count}{coupon.maximum_redemptions === null ? " / unlimited" : ` / ${coupon.maximum_redemptions}`}</span>
                {coupon.reserved_redemptions > 0 && <span>{coupon.reserved_redemptions} payment(s) in progress</span>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => editCoupon(coupon)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-sky-400"><Pencil size={13} /> Edit</button>
                <button type="button" onClick={() => void toggleCoupon(coupon)} disabled={busyId === coupon.id} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-sky-400 disabled:opacity-50">{coupon.is_active ? "Deactivate" : "Activate"}</button>
                <button type="button" onClick={() => void deleteCoupon(coupon)} disabled={busyId === coupon.id} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-900/50 px-3 py-2 text-xs text-rose-300 hover:border-rose-500 disabled:opacity-50"><Trash2 size={13} /> Delete</button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
