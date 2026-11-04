"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { Activity, ArrowLeft, ArrowRight, Clock3, RefreshCw } from "lucide-react";

type ActivityEntry = {
  id: number;
  actor_name: string;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string;
  details: Record<string, unknown>;
  created_at: string;
};

type ActivityResponse = {
  activities: ActivityEntry[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

const actionLabels: Record<string, string> = {
  "order.status_changed": "Changed Order Status",
  "order.notes_updated": "Updated order notes",
  "order.zoho_invoice_recorded": "Recorded Zoho invoice",
  "product.created": "Created product",
  "product.updated": "Updated product",
  "coupon.created": "Created coupon",
  "coupon.updated": "Updated coupon",
  "coupon.deleted": "Deleted coupon",
  "campaign.created": "Created campaign",
  "campaign.updated": "Updated campaign",
  "campaign.deleted": "Deleted campaign",
  "inventory.synced": "Synced inventory",
};

const readable = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const fieldLabels: Record<string, string> = {
  eyebrow: "Short heading",
  title: "Main heading",
  title_emphasis: "Highlighted heading",
  description: "Description",
  cta_label: "Button text",
  href: "Button link",
  image_url: "Main image",
  image_urls: "Product images",
  layout: "Display style",
  display_order: "Display position",
  is_active: "Website visibility",
  name: "Product name",
  brand: "Brand",
  category: "Category",
  price: "Price",
  compare_at_price: "Original price",
  stock: "Stock quantity",
  size_stock: "Stock by size",
  sku: "Product code",
  product_type: "Product type",
  size_category: "Size type",
  sizes: "Available sizes",
  colors: "Available colors",
  unavailable_sizes: "Unavailable sizes",
  specifications: "Product specifications",
  discount_type: "Discount type",
  discount_amount: "Discount amount",
  starts_at: "Start date",
  expires_at: "Expiry date",
  minimum_subtotal: "Minimum purchase",
  maximum_redemptions: "Maximum uses",
  status: "Order status",
  notes: "Order notes",
  zoho_invoice_recorded_at: "Invoice record",
};

const fieldLabel = (field: string) => fieldLabels[field] ?? readable(field);

function activityValue(field: string, value: unknown) {
  if (field === "is_active" && typeof value === "boolean") return value ? "Shown on website" : "Hidden from website";
  if (field === "href" || field === "image_url") return "Updated";
  if (field === "image_urls" && Array.isArray(value)) return `${value.length} image${value.length === 1 ? "" : "s"}`;
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null) return "Cleared";
  return String(value);
}

function activityDetailRows(entry: ActivityEntry) {
  const changes = entry.details.changes;
  const source = changes && typeof changes === "object" && !Array.isArray(changes)
    ? changes as Record<string, unknown>
    : entry.details;

  return Object.entries(source)
    .filter(([field]) => !["changedFields", "summary", "updated_at"].includes(field))
    .map(([field, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const change = value as Record<string, unknown>;
        if ("from" in change || "to" in change) {
          return [
            fieldLabel(field),
            `${readable(String(change.from ?? "Unknown"))} → ${readable(String(change.to ?? "Unknown"))}`,
          ];
        }
        return [fieldLabel(field), "Updated"];
      }
      return [fieldLabel(field), activityValue(field, value)];
    });
}

function activityDescription(entry: ActivityEntry) {
  const details = entry.details;
  if (entry.action === "order.status_changed") {
    const change = details.changes && typeof details.changes === "object"
      ? (details.changes as Record<string, unknown>).status
      : null;
    const statusChange = change && typeof change === "object" ? change as Record<string, unknown> : details;
    if (statusChange.from !== undefined || statusChange.to !== undefined) {
      return `${readable(String(statusChange.from ?? "Unknown"))} → ${readable(String(statusChange.to ?? "Unknown"))}`;
    }
  }
  if (Array.isArray(details.changedFields)) {
    return `Updated: ${details.changedFields.filter((field): field is string => typeof field === "string").map(fieldLabel).join(", ")}`;
  }
  if (typeof details.summary === "string") return details.summary;
  if (typeof details.status === "string") return readable(details.status);
  if (details.changes && typeof details.changes === "object" && !Array.isArray(details.changes)) {
    const changes = details.changes as Record<string, unknown>;
    const entries = Object.entries(changes).filter(([field]) => field !== "updated_at");
    if (entries.length === 0) return "";
    return entries.slice(0, 3).map(([field, value]) => {
      if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return `${fieldLabel(field)}: ${activityValue(field, value)}`;
      }
      return `${fieldLabel(field)} updated`;
    }).join(" · ") + (entries.length > 3 ? ` · +${entries.length - 3} more` : "");
  }
  return "";
}

export default function ActivityLog({ user }: { user: User }) {
  const [result, setResult] = useState<ActivityResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadActivities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/admin/activity?page=${page}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = await response.json() as ActivityResponse & { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to load admin activity.");
      setResult(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load admin activity.");
    } finally {
      setLoading(false);
    }
  }, [page, user]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadActivities(), 0);
    return () => window.clearTimeout(timer);
  }, [loadActivities]);

  return (
    <section className="admin-activity-log">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Audit trail</p>
          <h2 className="mt-1 text-xl font-bold">Admin activity</h2>
          <p className="mt-1 text-xs text-slate-400">A timestamped record of changes made by authorized admins.</p>
        </div>
        <button type="button" onClick={() => void loadActivities()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" /> Refresh
        </button>
      </div>

      {error && <div role="alert" className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

      {loading && !result ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">Loading admin activity…</div>
      ) : result?.activities.length ? (
        <>
          <ol className="grid gap-3">
            {result.activities.map((entry) => (
              <li key={entry.id} className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-sky-300">
                  <Activity size={17} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <strong className="activity-action-label">{actionLabels[entry.action] ?? readable(entry.action)}</strong>
                    <time className="inline-flex items-center gap-1 text-[10px] text-slate-400" dateTime={entry.created_at}>
                      <Clock3 size={11} aria-hidden="true" />{new Date(entry.created_at).toLocaleString()}
                    </time>
                  </div>
                  {entry.entity_type === "order" && entry.entity_id ? (
                    <>
                      <p className="activity-order-id">Order #{entry.entity_id.slice(-8).toUpperCase()}</p>
                      {entry.entity_label.toUpperCase() !== `ORDER ${entry.entity_id.slice(-8).toUpperCase()}` && (
                        <p className="activity-entity-label">{entry.entity_label}</p>
                      )}
                    </>
                  ) : (
                    <p className="activity-entity-label">{entry.entity_label}</p>
                  )}
                  <p className="activity-summary">{activityDescription(entry) || readable(entry.entity_type)}</p>
                  <p className="mt-2 text-[10px] text-slate-500">{entry.actor_name}{entry.actor_email && entry.actor_name !== entry.actor_email ? ` · ${entry.actor_email}` : ""}</p>
                  {activityDetailRows(entry).length > 0 && (
                    <details className="activity-details">
                      <summary>View change details</summary>
                      <dl className="activity-details-panel">
                        {activityDetailRows(entry).map(([field, value]) => (
                          <div key={field}>
                            <dt>{field}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-400">
            <span>{result.total.toLocaleString()} recorded action{result.total === 1 ? "" : "s"} · Page {page}</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1 || loading} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 disabled:opacity-40"><ArrowLeft size={13} aria-hidden="true" /> Newer</button>
              <button type="button" onClick={() => setPage((current) => current + 1)} disabled={!result.hasMore || loading} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 disabled:opacity-40">Older <ArrowRight size={13} aria-hidden="true" /></button>
            </div>
          </div>
        </>
      ) : !error ? (
        <div className="grid justify-items-center gap-2 rounded-2xl border border-dashed border-slate-700 bg-slate-900 p-10 text-center">
          <Activity size={24} className="text-sky-300" aria-hidden="true" />
          <strong className="text-sm text-slate-200">No admin activity recorded yet</strong>
          <span className="text-xs text-slate-400">New admin changes will appear here after the activity-log migration is applied.</span>
        </div>
      ) : null}
    </section>
  );
}
