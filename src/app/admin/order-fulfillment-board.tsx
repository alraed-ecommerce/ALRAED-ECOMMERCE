"use client";

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { ArrowRight, Check, Clock3, PackageCheck, Truck } from "lucide-react";
import styles from "./order-fulfillment-board.module.css";

type FulfillmentStatus = "paid" | "processing" | "shipped" | "delivered";
type FulfillmentOrder = {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  city: string | null;
  address: string | null;
  total: number;
  status: string;
  created_at: string;
  stripe_payment_intent_id: string | null;
  stripe_payment_method: string | null;
  stripe_paid_at: string | null;
  order_items?: Array<{ id: number; product_name: string; quantity: number; unit_price: number }>;
};

const stages: Array<{
  status: FulfillmentStatus;
  label: string;
  description: string;
  Icon: typeof PackageCheck;
}> = [
  { status: "paid", label: "To pack", description: "Payment confirmed · awaiting packing", Icon: PackageCheck },
  { status: "processing", label: "Packed", description: "Packed · ready for courier", Icon: PackageCheck },
  { status: "shipped", label: "Shipped", description: "Handed to courier · in transit", Icon: Truck },
  { status: "delivered", label: "Delivered", description: "Received by customer", Icon: Check },
];

const money = (amount: number) =>
  new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 2 }).format(amount);

const dateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-AE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Not recorded";

export default function OrderFulfillmentBoard({
  orders,
  busyOrderId,
  newPaidOrderAlert,
  onDismissAlert,
  onStatusChange,
}: {
  orders: FulfillmentOrder[];
  busyOrderId: string | null;
  newPaidOrderAlert: number;
  onDismissAlert: () => void;
  onStatusChange: (orderId: string, status: FulfillmentStatus) => Promise<boolean>;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [keyboardDragId, setKeyboardDragId] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => () => {
    void audioContextRef.current?.close();
  }, []);

  const playStatusSound = async () => {
    if (typeof window === "undefined" || !window.AudioContext) return;
    try {
      const audio = audioContextRef.current ?? new window.AudioContext();
      audioContextRef.current = audio;
      await audio.resume();
      const tone = audio.createOscillator();
      const volume = audio.createGain();
      tone.type = "sine";
      tone.frequency.setValueAtTime(620, audio.currentTime);
      tone.frequency.exponentialRampToValueAtTime(450, audio.currentTime + 0.09);
      volume.gain.setValueAtTime(0.0001, audio.currentTime);
      volume.gain.exponentialRampToValueAtTime(0.035, audio.currentTime + 0.012);
      volume.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.11);
      tone.connect(volume);
      volume.connect(audio.destination);
      tone.start();
      tone.stop(audio.currentTime + 0.12);
    } catch (error) {
      console.error("Could not play the order status sound.", error);
    }
  };

  const moveToNextStage = async (order: FulfillmentOrder) => {
    if (busyOrderId) return;
    const currentIndex = stages.findIndex((stage) => stage.status === order.status);
    const nextStage = stages[currentIndex + 1];
    if (nextStage && await onStatusChange(order.id, nextStage.status)) await playStatusSound();
  };

  const handleDrop = (event: DragEvent<HTMLElement>, status: FulfillmentStatus) => {
    event.preventDefault();
    const orderId = event.dataTransfer.getData("text/plain") || draggingId;
    const order = orders.find((item) => item.id === orderId);
    if (order && !busyOrderId) {
      const currentIndex = stages.findIndex((stage) => stage.status === order.status);
      const targetIndex = stages.findIndex((stage) => stage.status === status);
      if (targetIndex === currentIndex + 1) void onStatusChange(order.id, status).then((updated) => updated ? playStatusSound() : undefined);
    }
    setDraggingId(null);
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>, order: FulfillmentOrder) => {
    if (event.code === "Space") {
      event.preventDefault();
      setKeyboardDragId((current) => current === order.id ? null : order.id);
      return;
    }
    if (event.key === "Escape" && keyboardDragId === order.id) {
      setKeyboardDragId(null);
      return;
    }
    if (keyboardDragId !== order.id || event.key !== "ArrowRight" || busyOrderId) return;
    event.preventDefault();
    void moveToNextStage(order);
  };

  const activeOrders = orders.filter((order): order is FulfillmentOrder & { status: FulfillmentStatus } =>
    stages.some((stage) => stage.status === order.status),
  );
  const paidOrders = activeOrders.filter((order) => order.status === "paid").length;

  return (
    <section className={`${styles.fulfillment} admin-fulfillment`}>
      <div className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>ORDER TRACKING &amp; FULFILLMENT</p>
          <h2>Future Implementation</h2>
          <p>Move each paid order through packing, courier handoff, and delivery. Every update is saved to the order record.</p>
        </div>
        <div className={styles.summary}>
          <strong>{activeOrders.length}</strong><span>Orders in workflow</span>
          {paidOrders > 0 && <span className={styles.newCount}>{paidOrders} to pack</span>}
        </div>
      </div>

      <div className={styles.workflowNote}>
        <Clock3 size={16} aria-hidden="true" />
        Paid orders appear in “To pack”. Advancing a card records the matching order status and its history in the database.
      </div>

      {newPaidOrderAlert > 0 && (
        <div className={styles.newOrderAlert} role="status" aria-live="polite">
          <strong>{newPaidOrderAlert === 1 ? "New paid order" : `${newPaidOrderAlert} new paid orders`}</strong>
          <span>{newPaidOrderAlert === 1 ? "A new order is ready to pack." : "New orders are ready to pack."}</span>
          <button type="button" onClick={onDismissAlert}>Dismiss</button>
        </div>
      )}
      {activeOrders.length === 0 ? (
        <div className={styles.emptyState}>
          <PackageCheck size={26} aria-hidden="true" />
          <strong>No paid orders to track yet</strong>
          <span>Newly paid orders will appear in the “To pack” column.</span>
        </div>
      ) : (
        <div className={styles.board} aria-label="Order fulfillment stages">
          {stages.map(({ status, label, description, Icon }, stageIndex) => {
            const stageOrders = activeOrders.filter((order) => order.status === status);
            return (
              <section
                key={status}
                className={`${styles.column} ${styles[`stage${stageIndex}`] ?? ""}`}
                aria-label={`${label}, ${stageOrders.length} orders`}
                onDragOver={(event) => {
                  if (draggingId) event.preventDefault();
                }}
                onDrop={(event) => handleDrop(event, status)}
              >
                <header className={styles.columnHeading}>
                  <span className={styles.stageIcon}><Icon size={16} aria-hidden="true" /></span>
                  <div><h3>{label}</h3><p>{description}</p></div>
                  <span className={styles.count}>{stageOrders.length}</span>
                </header>
                <div className={styles.orderList}>
                  {stageOrders.map((order) => {
                    const isSaving = busyOrderId === order.id;
                    const isBusy = busyOrderId !== null;
                    const orderReference = order.id.slice(-8).toUpperCase();
                    const paymentReference = order.stripe_payment_intent_id || `Order ${orderReference}`;
                    const nextStage = stages[stageIndex + 1];
                    return (
                      <article
                        key={order.id}
                        className={`${styles.orderCard} ${draggingId === order.id ? styles.dragging : ""} ${keyboardDragId === order.id ? styles.keyboardDragging : ""}`}
                        draggable={!isBusy && status !== "delivered"}
                        tabIndex={0}
                        aria-busy={isSaving}
                        aria-label={`Order ${orderReference}, ${order.customer_name}, ${money(order.total)}, ${label}. Press Space, then right arrow to advance.`}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", order.id);
                          event.dataTransfer.effectAllowed = "move";
                          setDraggingId(order.id);
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        onKeyDown={(event) => handleCardKeyDown(event, order)}
                      >
                        <div className={styles.cardTop}><span>ORDER · {orderReference}</span><span>{dateTime(order.created_at)}</span></div>
                        <h4>{order.customer_name}</h4>
                        <div className={styles.customerMeta}>
                          {order.customer_phone && <span>{order.customer_phone}</span>}
                          {(order.city || order.address) && <span>{[order.address, order.city].filter(Boolean).join(", ")}</span>}
                        </div>
                        <ul className={styles.items}>
                          {(order.order_items ?? []).map((item) => (
                            <li key={item.id}>
                              <span>{item.quantity} × {item.product_name}</span>
                              <strong>{money(item.quantity * item.unit_price)}</strong>
                            </li>
                          ))}
                          {(order.order_items?.length ?? 0) === 0 && <li><span>Order items unavailable</span></li>}
                        </ul>
                        <div className={styles.total}><span>Paid total</span><strong>{money(order.total)}</strong></div>
                        <dl className={styles.paymentInfo}>
                          <div><dt>Payment</dt><dd>{order.stripe_payment_method || (order.stripe_payment_intent_id ? "Stripe" : "Confirmed")}</dd></div>
                          <div><dt>Reference</dt><dd title={paymentReference}>{paymentReference}</dd></div>
                          <div><dt>Paid at</dt><dd>{dateTime(order.stripe_paid_at)}</dd></div>
                        </dl>
                        {nextStage && (
                          <button
                            type="button"
                            className={styles.advanceButton}
                            disabled={isBusy}
                            onClick={() => void moveToNextStage(order)}
                            aria-label={`Move order ${orderReference} to ${nextStage.label}`}
                          >
                            {isSaving ? "Saving…" : <>Move to {nextStage.label} <ArrowRight size={14} aria-hidden="true" /></>}
                          </button>
                        )}
                        {status === "delivered" && <div className={styles.deliveredLabel}><Check size={14} aria-hidden="true" /> Delivered</div>}
                      </article>
                    );
                  })}
                  {stageOrders.length === 0 && <div className={styles.emptyColumn}>Drop the next order here</div>}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <p className={styles.keyboardHint}>Keyboard: focus an order, press <kbd>Space</kbd>, then <kbd>→</kbd> to advance. Drag-and-drop is available on pointer devices.</p>
    </section>
  );
}
