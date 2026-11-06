"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Clock3, PackageCheck } from "lucide-react";
import type { User } from "firebase/auth";
import { subscribeToAuth } from "@/lib/firebase";
import { trackEcommerceEvent } from "@/lib/google-analytics";

type ConfirmedOrder = {
  id: string;
  total: number;
  status: string;
  stripe_payment_intent_id: string | null;
  stripe_payment_method: string | null;
  stripe_paid_at: string | null;
  order_items: Array<{ id: number; product_name: string; quantity: number; unit_price: number }>;
};

export default function CheckoutSuccessPage() {
  const [sessionId] = useState<string | null>(() => typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("session_id"));
  const [user, setUser] = useState<User | null>(null);
  const [order, setOrder] = useState<ConfirmedOrder | null>(null);
  const [state, setState] = useState<"loading" | "confirmed" | "waiting" | "error">("loading");
  const [error, setError] = useState("");
  const purchaseTrackedOrderIds = useRef(new Set<string>());

  useEffect(() => subscribeToAuth((currentUser) => {
    setUser(currentUser);
    if (!sessionId) {
      setError("The payment return link is missing its checkout reference.");
      setState("error");
    } else if (!currentUser) {
      setError("Sign in to the same account you used at checkout to view payment confirmation.");
      setState("error");
    }
  }), [sessionId]);

  useEffect(() => {
    if (!user || !sessionId) return;

    let active = true;
    let attempts = 0;
    const checkPayment = async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/checkout/status?session_id=${encodeURIComponent(sessionId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const result = await response.json() as { order?: ConfirmedOrder; error?: string };
        if (!response.ok) throw new Error(result.error || "Unable to verify the payment.");
        if (!active) return;

        setOrder(result.order ?? null);
        if (result.order?.status === "paid" || result.order?.stripe_payment_intent_id || result.order?.stripe_paid_at) {
          if (result.order && !purchaseTrackedOrderIds.current.has(result.order.id)) {
            purchaseTrackedOrderIds.current.add(result.order.id);
            const purchaseKey = `alraed-ga-purchase-${result.order.id}`;
            let alreadyTracked = false;
            try {
              alreadyTracked = window.localStorage.getItem(purchaseKey) === "sent";
              if (!alreadyTracked) window.localStorage.setItem(purchaseKey, "sent");
            } catch (storageError) {
              console.error("Unable to persist the analytics purchase deduplication key.", storageError);
            }
            if (!alreadyTracked) {
              trackEcommerceEvent("purchase", {
                transaction_id: result.order.id,
                currency: "AED",
                value: Number(result.order.total),
                items: result.order.order_items.map((item) => ({
                  item_name: item.product_name,
                  price: Number(item.unit_price),
                  quantity: item.quantity,
                })),
              });
            }
          }
          try {
            window.localStorage.removeItem("alraed-storefront-cart");
            window.dispatchEvent(new Event("alraed-cart-update"));
          } catch (storageError) {
            console.error("Unable to clear the browser cart after a confirmed payment.", storageError);
          }
          setState("confirmed");
          return true;
        }

        attempts += 1;
        if (attempts >= 30) {
          setState("waiting");
          return true;
        }
        setState("loading");
        return false;
      } catch (checkError) {
        if (!active) return true;
        setError(checkError instanceof Error ? checkError.message : "Unable to verify the payment.");
        setState("error");
        return true;
      }
    };

    let timer: number | undefined;
    const poll = async () => {
      if (await checkPayment()) return;
      timer = window.setTimeout(() => void poll(), 2000);
    };
    void poll();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [user, sessionId]);

  return (
    <main className="account-page checkout-result-page">
      <header className="account-header"><Link className="account-brand" href="/"><span className="account-brand-mark">AR</span><span>AL RAED <strong>SPORTS</strong></span></Link><Link className="account-back" href="/shop">Continue shopping <ArrowRight size={15} /></Link></header>
      <section className="checkout-result-card">
        {state === "confirmed" ? <><span className="checkout-result-icon is-success"><Check size={26} /></span><p className="account-kicker">PAYMENT CONFIRMED</p><h1>Thank you for<br /><em>your order.</em></h1><p className="checkout-result-copy">Your payment is verified and your order is confirmed. We’ve updated the inventory and saved your order details.</p>{order && <div className="checkout-confirmation-details"><div><span>Order</span><strong>#{order.id.slice(0, 8).toUpperCase()}</strong></div><div><span>Total paid</span><strong>AED {Number(order.total).toLocaleString()}</strong></div><div><span>Payment method</span><strong>{order.stripe_payment_method || "Card"}</strong></div>{order.stripe_payment_intent_id && <div><span>Payment reference</span><strong>{order.stripe_payment_intent_id}</strong></div>}</div>}<Link className="account-primary-button checkout-result-action" href="/account/orders">VIEW MY ORDERS <ArrowRight size={15} /></Link></>
          : state === "waiting" ? <><span className="checkout-result-icon"><Clock3 size={26} /></span><p className="account-kicker">PAYMENT RECEIVED</p><h1>Confirming<br /><em>your order.</em></h1><p className="checkout-result-copy">Stripe is still sending the secure payment confirmation. Your order page will update as soon as verification completes. Please keep this page open or check again in My Orders.</p><Link className="account-primary-button checkout-result-action" href="/account/orders">CHECK MY ORDERS <ArrowRight size={15} /></Link></>
            : state === "error" ? <><span className="checkout-result-icon"><PackageCheck size={26} /></span><p className="account-kicker">CHECKOUT STATUS</p><h1>We’re checking<br /><em>your payment.</em></h1><p className="checkout-result-copy">{error}</p><Link className="account-primary-button checkout-result-action" href="/account/orders">GO TO MY ORDERS <ArrowRight size={15} /></Link><Link className="account-back" href="/account">Sign in to your account</Link></>
              : <><span className="checkout-result-icon"><Clock3 size={26} /></span><p className="account-kicker">SECURE CHECKOUT</p><h1>Verifying<br /><em>your payment.</em></h1><p className="checkout-result-copy">We’re waiting for Stripe’s signed payment confirmation before marking this order paid.</p></>}
      </section>
    </main>
  );
}
