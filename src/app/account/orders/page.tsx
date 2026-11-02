"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock3, MapPin, PackageCheck, ShoppingBag } from "lucide-react";
import type { User } from "firebase/auth";
import { subscribeToAuth } from "@/lib/firebase";
import OrderProgress from "@/components/account/OrderProgress";

type OrderItem = { id: number; product_name: string; quantity: number; unit_price: number };
type Order = {
  id: string;
  total: number;
  status: string;
  city: string | null;
  address: string | null;
  created_at: string;
  stripe_payment_intent_id: string | null;
  stripe_payment_method: string | null;
  stripe_paid_at: string | null;
  order_items: OrderItem[];
};

const formatOrderStatus = (status: string) => {
  const labels: Record<string, string> = {
    pending: "Pending",
    awaiting_payment: "Awaiting payment",
    paid: "Paid",
    processing: "Processing",
    shipped: "Shipped",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };
  return labels[status.toLowerCase()] ?? status;
};

export default function MyOrdersPage() {
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => subscribeToAuth((currentUser) => {
    setUser(currentUser);
    if (!currentUser) {
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    void (async () => {
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch("/api/orders", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const result = await response.json() as { orders?: Order[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Unable to load your orders.");
        setOrders(result.orders ?? []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load your orders.");
      } finally {
        setLoading(false);
      }
    })();
  }), []);

  return (
    <main className="account-page">
      <header className="account-header">
        <Link className="account-brand" href="/"><span className="account-brand-mark">AR</span><span>AL RAED <strong>SPORTS</strong></span></Link>
        <Link className="account-back" href="/account"><ArrowLeft size={15} /> My account</Link>
      </header>
      <div className="account-shell">
        <div className="account-page-heading">
          <div><p className="account-kicker">YOUR AL RAED ACCOUNT</p><h1>My <em>orders</em></h1></div>
          <Link className="account-logout" href="/shop"><ShoppingBag size={15} /> Shop gear</Link>
        </div>

        {loading ? <div className="account-loading" role="status">Loading your orders…</div>
          : !user ? <section className="orders-empty"><PackageCheck size={23} /><strong>Sign in to view your orders</strong><p>Your order history and payment confirmations are private to your account.</p><Link href="/account">Go to sign in <ArrowRight size={14} /></Link></section>
            : error ? <div className="account-alert" role="alert">{error}</div>
              : orders.length ? <div className="my-orders-list">{orders.map((order) => (
                <article className="account-panel my-order-card" key={order.id}>
                  <div className="my-order-heading">
                    <div><p className="account-kicker">ORDER</p><h2>#{order.id.slice(0, 8).toUpperCase()}</h2><time>{new Date(order.created_at).toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" })}</time></div>
                    <span className={`order-status status-${order.status.toLowerCase()}`}><Clock3 size={12} />{formatOrderStatus(order.status)}</span>
                  </div>
                  <OrderProgress status={order.status} />
                  <div className="order-items">{order.order_items?.map((item) => <div key={item.id}><span>{item.product_name} <small>× {item.quantity}</small></span><strong>AED {(Number(item.unit_price) * item.quantity).toLocaleString()}</strong></div>)}</div>
                  <div className="order-delivery"><MapPin size={13} /><span>{[order.address, order.city].filter(Boolean).join(", ") || "Delivery location unavailable"}</span></div>
                  <div className="my-order-total"><span>Order total</span><strong>AED {Number(order.total).toLocaleString()}</strong></div>
                  {(order.status === "paid" || order.stripe_payment_intent_id || order.stripe_paid_at) && <div className="my-order-payment" role="status">
                    <strong><PackageCheck size={15} /> Payment confirmed</strong>
                    <span>{order.stripe_payment_method || "Payment confirmed"}</span>
                    {order.stripe_paid_at && <time>Paid {new Date(order.stripe_paid_at).toLocaleString("en-AE")}</time>}
                    {order.stripe_payment_intent_id && <small>Stripe reference: {order.stripe_payment_intent_id}</small>}
                  </div>}
                </article>
              ))}</div> : <section className="orders-empty"><PackageCheck size={23} /><strong>No orders yet</strong><p>Your orders and payment confirmations will appear here.</p><Link href="/shop">Explore the collection <ArrowRight size={14} /></Link></section>}

        <footer className="account-footer"><span>AL RAED SPORTS / MY ORDERS</span><Link href="/">Back to the store <ArrowRight size={14} /></Link></footer>
      </div>
    </main>
  );
}
