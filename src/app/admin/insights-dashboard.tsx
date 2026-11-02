"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Boxes, Clock3, PackageCheck, RefreshCw, ShoppingBag, Users } from "lucide-react";

type Analytics = {
  period: number;
  generatedAt: string;
  kpis: {
    revenue: number;
    paidOrders: number;
    averageOrderValue: number;
    repeatCustomerCount: number;
    customerCount: number;
    repeatCustomerRate: number;
  };
  trends: Array<{ date: string; revenue: number; orders: number }>;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  categoryRevenue: Array<{ category: string; revenue: number }>;
  topCities: Array<{ city: string; orders: number }>;
  orderStatuses: { awaitingPayment: number; pendingFulfillment: number; cancelledInPeriod: number };
  inventory: {
    activeProducts: number;
    outOfStockProducts: number;
    lowStockProducts: number;
    unitsAvailable: number;
    unmappedActiveProducts: number;
    staleMappedProducts: number;
    lowStockThreshold: number;
    lastStockSyncAt: string | null;
    staleAfterSeconds: number;
  };
};

const periods = [7, 30, 90] as const;
const money = (value: number) => new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
  maximumFractionDigits: 0,
}).format(value);

function RevenueChart({ trends, period, generatedAt }: { trends: Analytics["trends"]; period: number; generatedAt: string }) {
  const grouped = useMemo(() => {
    const daysPerBucket = period === 90 ? 7 : 1;
    const start = new Date(new Date(generatedAt).getTime() - period * 24 * 60 * 60 * 1000);
    const values = new Map<string, { revenue: number; orders: number }>();
    for (let index = 0; index < period; index += daysPerBucket) {
      const date = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
      values.set(date.toISOString().slice(0, 10), { revenue: 0, orders: 0 });
    }
    for (const trend of trends) {
      const date = new Date(`${trend.date}T00:00:00.000Z`);
      const offset = Math.max(0, Math.floor((date.getTime() - start.getTime()) / (daysPerBucket * 24 * 60 * 60 * 1000)));
      const bucketDate = new Date(start.getTime() + offset * daysPerBucket * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const bucket = values.get(bucketDate);
      if (bucket) {
        bucket.revenue += trend.revenue;
        bucket.orders += trend.orders;
      }
    }
    return [...values.entries()].map(([date, values]) => ({ date, ...values }));
  }, [generatedAt, period, trends]);

  const maxRevenue = Math.max(1, ...grouped.map((entry) => entry.revenue));
  const chartWidth = Math.max(1, grouped.length) * 14;
  const chartHeight = 180;
  const points = grouped.map((entry, index) => {
    const x = grouped.length === 1 ? chartWidth / 2 : 8 + index / (grouped.length - 1) * (chartWidth - 16);
    const y = chartHeight - 12 - entry.revenue / maxRevenue * (chartHeight - 28);
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="mt-4">
      {trends.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-slate-700 text-sm text-slate-400">No paid sales in this period yet.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={`Revenue trend for the last ${period} days`} className="h-52 min-w-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="revenue-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity=".35" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0, 1, 2, 3].map((line) => {
                const y = 12 + line * ((chartHeight - 28) / 3);
                return <line key={line} x1="0" x2={chartWidth} y1={y} y2={y} stroke="#26364a" strokeDasharray="3 4" />;
              })}
              {grouped.length > 1 && <polygon points={`0,${chartHeight} ${points} ${chartWidth},${chartHeight}`} fill="url(#revenue-fill)" />}
              <polyline points={points} fill="none" stroke="#38bdf8" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
              {grouped.map((entry, index) => {
                if (!entry.revenue) return null;
                const x = grouped.length === 1 ? chartWidth / 2 : 8 + index / (grouped.length - 1) * (chartWidth - 16);
                const y = chartHeight - 12 - entry.revenue / maxRevenue * (chartHeight - 28);
                return <circle key={entry.date} cx={x} cy={y} r="3" fill="#7dd3fc"><title>{entry.date}: {money(entry.revenue)} · {entry.orders} orders</title></circle>;
              })}
            </svg>
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>{grouped[0]?.date}</span><span>{grouped[Math.floor(grouped.length / 2)]?.date}</span><span>{grouped.at(-1)?.date}</span>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, detail, Icon, tone = "sky" }: {
  label: string;
  value: string;
  detail: string;
  Icon: typeof BarChart3;
  tone?: "sky" | "emerald" | "violet" | "amber";
}) {
  const tones = {
    sky: "border-sky-400/20 bg-sky-400/10 text-sky-200",
    emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    violet: "border-violet-400/20 bg-violet-400/10 text-violet-200",
    amber: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  };
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="mt-3 text-2xl font-bold tracking-tight text-white">{value}</p>
        </div>
        <span className={`rounded-xl border p-2.5 ${tones[tone]}`}><Icon size={18} aria-hidden="true" /></span>
      </div>
      <p className="mt-3 text-xs text-slate-500">{detail}</p>
    </article>
  );
}

function RankedBars({ items, valueLabel }: { items: Array<{ name: string; value: number; detail?: string }>; valueLabel: (value: number) => string }) {
  const maximum = Math.max(1, ...items.map((item) => item.value));
  if (items.length === 0) return <p className="py-8 text-center text-sm text-slate-500">There is no data for this period yet.</p>;
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.name}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-slate-200">{item.name}</span>
            <span className="shrink-0 text-slate-400">{valueLabel(item.value)}{item.detail ? <small className="ml-2 text-slate-500">{item.detail}</small> : null}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-sky-400" style={{ width: `${Math.max(3, item.value / maximum * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function InsightsDashboard({ user }: { user: User }) {
  const [period, setPeriod] = useState<(typeof periods)[number]>(30);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setRefreshing(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/admin/analytics?period=${period}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load business insights.");
        if (active) setAnalytics(result as Analytics);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load business insights.");
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    void load();
    return () => { active = false; };
  }, [period, refreshToken, user]);

  if (loading && !analytics) {
    return <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">Loading business insights…</div>;
  }
  if (!analytics) {
    return (
      <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-5 text-sm text-rose-100" role="alert">
        <p>{error || "Business insights could not be loaded."}</p>
        <button type="button" onClick={() => setRefreshToken((current) => current + 1)} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-rose-300/30 px-3 py-2 font-semibold hover:bg-rose-300/10"><RefreshCw size={14} />Try again</button>
      </div>
    );
  }

  const stockAlertCount = analytics.inventory.outOfStockProducts + analytics.inventory.lowStockProducts;
  const lowStockLabel = analytics.inventory.lowStockThreshold > 0
    ? `Low stock (1–${analytics.inventory.lowStockThreshold})`
    : "Low-stock threshold disabled";
  return (
    <section className="space-y-5" aria-label="Business insights">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div>
          <p className="font-semibold text-white">Business overview</p>
          <p className="mt-1 text-xs text-slate-400">Sales are based on paid orders. Inventory is read from Zoho stock sync.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {periods.map((option) => (
            <button key={option} type="button" onClick={() => setPeriod(option)} aria-pressed={period === option} className={`rounded-full px-3 py-2 text-xs font-semibold transition ${period === option ? "bg-sky-400 text-slate-950" : "border border-slate-700 text-slate-300 hover:bg-slate-800"}`}>
              {option} days
            </button>
          ))}
          <button type="button" onClick={() => setRefreshToken((current) => current + 1)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50" aria-label="Refresh insights">
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">{error} Showing the last successfully loaded data.</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Paid revenue" value={money(analytics.kpis.revenue)} detail={`Across ${analytics.kpis.paidOrders} paid orders · last ${period} days`} Icon={BarChart3} tone="emerald" />
        <MetricCard label="Paid orders" value={analytics.kpis.paidOrders.toLocaleString()} detail="Confirmed payments, excluding unpaid and cancelled orders" Icon={ShoppingBag} />
        <MetricCard label="Average order value" value={money(analytics.kpis.averageOrderValue)} detail="Average total per paid order" Icon={Activity} tone="violet" />
        <MetricCard label="Repeat customers" value={`${analytics.kpis.repeatCustomerRate}%`} detail={`${analytics.kpis.repeatCustomerCount} of ${analytics.kpis.customerCount} identifiable customers ordered more than once`} Icon={Users} tone="amber" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,.85fr)]">
        <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="font-semibold text-white">Revenue trend</h2><p className="mt-1 text-xs text-slate-400">Paid-order totals · AED</p></div>
            <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><ArrowUpRight size={14} /> {analytics.kpis.paidOrders} orders</span>
          </div>
          <RevenueChart trends={analytics.trends} period={period} generatedAt={analytics.generatedAt} />
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center gap-2"><Clock3 size={17} className="text-sky-300" /><h2 className="font-semibold text-white">Order pipeline</h2></div>
          <p className="mt-1 text-xs text-slate-400">Current open work and cancellations in the selected period.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4"><p className="text-xs text-amber-200">Awaiting payment · current</p><p className="mt-2 text-2xl font-bold text-white">{analytics.orderStatuses.awaitingPayment}</p></div>
            <div className="rounded-xl border border-sky-400/20 bg-sky-400/5 p-4"><p className="text-xs text-sky-200">Paid, awaiting fulfillment · current</p><p className="mt-2 text-2xl font-bold text-white">{analytics.orderStatuses.pendingFulfillment}</p></div>
            <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-4"><p className="text-xs text-rose-200">Cancelled · last {period} days</p><p className="mt-2 text-2xl font-bold text-white">{analytics.orderStatuses.cancelledInPeriod}</p></div>
          </div>
        </article>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-5 flex items-center gap-2"><PackageCheck size={17} className="text-sky-300" /><div><h2 className="font-semibold text-white">Top products</h2><p className="mt-1 text-xs text-slate-400">Ranked by item revenue in the selected period</p></div></div>
          <RankedBars items={analytics.topProducts.map((item) => ({ name: item.name, value: item.revenue, detail: `${item.quantity} sold` }))} valueLabel={money} />
        </article>
        <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-5 flex items-center gap-2"><Boxes size={17} className="text-violet-300" /><div><h2 className="font-semibold text-white">Revenue by category</h2><p className="mt-1 text-xs text-slate-400">Based on products in paid orders</p></div></div>
          <RankedBars items={analytics.categoryRevenue.map((item) => ({ name: item.category, value: item.revenue }))} valueLabel={money} />
        </article>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]">
        <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-5 flex items-center gap-2"><AlertTriangle size={17} className="text-amber-300" /><div><h2 className="font-semibold text-white">Inventory health</h2><p className="mt-1 text-xs text-slate-400">Active products · stock from Zoho sync</p></div></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><p className="text-xs text-slate-400">Active catalog</p><p className="mt-2 text-2xl font-bold text-white">{analytics.inventory.activeProducts}</p></div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><p className="text-xs text-slate-400">Units available</p><p className="mt-2 text-2xl font-bold text-white">{analytics.inventory.unitsAvailable}</p></div>
            <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-4"><p className="text-xs text-rose-200">Out of stock</p><p className="mt-2 text-2xl font-bold text-white">{analytics.inventory.outOfStockProducts}</p></div>
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4"><p className="text-xs text-amber-200">{lowStockLabel}</p><p className="mt-2 text-2xl font-bold text-white">{analytics.inventory.lowStockProducts}</p></div>
          </div>
          {stockAlertCount > 0 && <p className="mt-4 flex items-center gap-2 text-sm text-amber-200"><ArrowDownRight size={15} />{stockAlertCount} active products need a stock check.</p>}
          {analytics.inventory.unmappedActiveProducts > 0 && <p className="mt-2 text-sm text-rose-200">{analytics.inventory.unmappedActiveProducts} active products have no Zoho mapping.</p>}
          {analytics.inventory.staleMappedProducts > 0 && <p className="mt-2 text-sm text-amber-200">{analytics.inventory.staleMappedProducts} mapped products have no successful Zoho sync within {Math.max(1, Math.round(analytics.inventory.staleAfterSeconds / 60))} minutes.</p>}
          <p className="mt-3 text-xs text-slate-500">{analytics.inventory.lastStockSyncAt
            ? `Most recent product stock sync: ${new Date(analytics.inventory.lastStockSyncAt).toLocaleString()}`
            : "No successful Zoho product stock sync is recorded yet."}</p>
        </article>
        <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-5 flex items-center gap-2"><Users size={17} className="text-emerald-300" /><div><h2 className="font-semibold text-white">Top customer cities</h2><p className="mt-1 text-xs text-slate-400">Paid orders in the selected period</p></div></div>
          <RankedBars items={analytics.topCities.map((item) => ({ name: item.city, value: item.orders }))} valueLabel={(value) => `${value} orders`} />
        </article>
      </div>

      <p className="text-right text-xs text-slate-500">Updated {new Date(analytics.generatedAt).toLocaleString()}</p>
    </section>
  );
}
