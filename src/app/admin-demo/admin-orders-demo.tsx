"use client";

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import {
  BarChart3,
  Bell,
  ClipboardList,
  Grid2X2,
  MoreHorizontal,
  Package,
  Search,
  Settings,
  ShieldCheck,
  Volume2,
  VolumeX,
} from "lucide-react";
import styles from "./admin-orders-demo.module.css";

type OrderStatus = "to-pack" | "packed" | "shipped" | "delivered";
type DemoOrder = {
  id: string;
  customer: string;
  items: string[];
  total: number;
  age: string;
  channel: "Online" | "Instagram" | "WhatsApp";
  status: OrderStatus;
};

const columns: Array<{ id: OrderStatus; title: string; subtitle: string; color: string }> = [
  { id: "to-pack", title: "To pack", subtitle: "Waiting for handoff", color: "amber" },
  { id: "packed", title: "Packed", subtitle: "Ready to ship", color: "blue" },
  { id: "shipped", title: "Shipped", subtitle: "On the way", color: "violet" },
  { id: "delivered", title: "Delivered", subtitle: "Recently completed", color: "green" },
];

const initialOrders: DemoOrder[] = [
  { id: "AR-49518", customer: "Sofia Moreno", items: ["Yonex Astrox 99 Pro", "Overgrip × 2"], total: 675, age: "12 min ago", channel: "Online", status: "to-pack" },
  { id: "AR-49516", customer: "Ethan Haddad", items: ["Court shoes · White / 42"], total: 390, age: "28 min ago", channel: "Instagram", status: "to-pack" },
  { id: "AR-49512", customer: "Mia Gordon", items: ["Aerosensa 30 · 2 tubes"], total: 148, age: "46 min ago", channel: "WhatsApp", status: "to-pack" },
  { id: "AR-49509", customer: "Theo Novak", items: ["Nanoflare 1000Z", "Stringing service"], total: 920, age: "1 hour ago", channel: "Online", status: "packed" },
  { id: "AR-49504", customer: "Amara Nadeem", items: ["Club training bundle"], total: 265, age: "2 hours ago", channel: "Instagram", status: "packed" },
  { id: "AR-49498", customer: "Jacob Brennan", items: ["Tennis backpack"], total: 220, age: "Today, 9:20 am", channel: "Online", status: "shipped" },
  { id: "AR-49491", customer: "Lina Farouk", items: ["Yonex Power Cushion 65"], total: 510, age: "Today, 8:45 am", channel: "WhatsApp", status: "shipped" },
  { id: "AR-49480", customer: "Noah Haddad", items: ["Badminton starter set"], total: 345, age: "Yesterday", channel: "Online", status: "delivered" },
  { id: "AR-49472", customer: "Sara Malik", items: ["Pro tournament racket"], total: 780, age: "Yesterday", channel: "Instagram", status: "delivered" },
];

const formatPrice = (amount: number) =>
  new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 }).format(amount);

export default function AdminOrdersDemo() {
  const [orders, setOrders] = useState(initialOrders);
  const [search, setSearch] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [keyboardDragId, setKeyboardDragId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("Demo board ready. Drag an order card to another column.");
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => () => {
    void audioContextRef.current?.close();
  }, []);

  const playDropSound = () => {
    if (!soundEnabled || typeof window === "undefined" || !window.AudioContext) return;
    const audio = audioContextRef.current ?? new window.AudioContext();
    audioContextRef.current = audio;
    void audio.resume().then(() => {
      const tone = audio.createOscillator();
      const volume = audio.createGain();
      tone.type = "sine";
      tone.frequency.setValueAtTime(620, audio.currentTime);
      tone.frequency.exponentialRampToValueAtTime(410, audio.currentTime + 0.09);
      volume.gain.setValueAtTime(0.0001, audio.currentTime);
      volume.gain.exponentialRampToValueAtTime(0.045, audio.currentTime + 0.012);
      volume.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.11);
      tone.connect(volume);
      volume.connect(audio.destination);
      tone.start();
      tone.stop(audio.currentTime + 0.12);
    }).catch(() => setAnnouncement("The browser could not play the drop sound. You can continue using the demo."));
  };

  const moveOrder = (orderId: string, nextStatus: OrderStatus) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order || order.status === nextStatus) return;
    const target = columns.find((column) => column.id === nextStatus);
    setOrders((current) => current.map((item) => item.id === orderId ? { ...item, status: nextStatus } : item));
    setAnnouncement(`${order.id} moved to ${target?.title ?? nextStatus}.`);
    playDropSound();
  };

  const handleDrop = (event: DragEvent<HTMLElement>, status: OrderStatus) => {
    event.preventDefault();
    const orderId = event.dataTransfer.getData("text/plain") || draggingId;
    if (orderId) moveOrder(orderId, status);
    setDraggingId(null);
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>, order: DemoOrder) => {
    if (event.code === "Space") {
      event.preventDefault();
      setKeyboardDragId((current) => {
        const nextId = current === order.id ? null : order.id;
        setAnnouncement(nextId
          ? `${order.id} selected. Use left and right arrow keys to move it, then press Space to finish.`
          : `${order.id} released.`);
        return nextId;
      });
      return;
    }
    if (event.key === "Escape" && keyboardDragId === order.id) {
      setKeyboardDragId(null);
      setAnnouncement(`${order.id} released without moving.`);
      return;
    }
    if (keyboardDragId !== order.id || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    const currentIndex = columns.findIndex((column) => column.id === order.status);
    const nextIndex = Math.max(0, Math.min(columns.length - 1, currentIndex + (event.key === "ArrowRight" ? 1 : -1)));
    if (nextIndex !== currentIndex) moveOrder(order.id, columns[nextIndex].id);
  };

  const filteredOrders = orders.filter((order) =>
    `${order.id} ${order.customer} ${order.items.join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const packedCount = orders.filter((order) => order.status === "to-pack").length;
  const deliveredCount = orders.filter((order) => order.status === "delivered").length;

  return (
    <main className={styles.app}>
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/admin/products" aria-label="Return to Al Raed admin">
          <span className={styles.brandMark}>AR</span>
          <span>AL RAED <small>SPORTS ADMIN</small></span>
        </Link>
        <div className={styles.workspace}><span className={styles.avatar}>N</span><span>Noor Haddad<small>Store manager</small></span><MoreHorizontal size={17} /></div>
        <p className={styles.navLabel}>WORKSPACE</p>
        <nav className={styles.nav} aria-label="Demo navigation">
          <span><Grid2X2 size={17} /> Dashboard</span>
          <span className={styles.navActive}><ClipboardList size={17} /> Orders <b>{orders.length}</b></span>
          <span><Package size={17} /> Products</span>
          <span><BarChart3 size={17} /> Analytics</span>
        </nav>
        <p className={styles.navLabel}>PREFERENCES</p>
        <nav className={styles.nav} aria-label="Preferences"><span><Settings size={17} /> Settings</span></nav>
        <div className={styles.sidebarBottom}>
          <div className={styles.liveTag}><span /> DEMO MODE</div>
          <p>Sample orders only.<br />Nothing is saved to your store.</p>
        </div>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.breadcrumb}>Workspace <span>/</span> Orders</div>
          <div className={styles.topActions}>
            <button type="button" className={styles.soundToggle} onClick={() => setSoundEnabled((enabled) => !enabled)} aria-pressed={soundEnabled}>
              {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
              Drop sound {soundEnabled ? "on" : "off"}
            </button>
            <button type="button" className={styles.iconButton} aria-label="Notifications"><Bell size={17} /><i /></button>
            <span className={styles.avatar}>N</span>
          </div>
        </header>

        <div className={styles.content}>
          <div className={styles.demoBanner}><ShieldCheck size={16} /><span><strong>Temporary demo</strong> — try moving an order. Changes are only kept in this page.</span></div>
          <div className={styles.pageHeading}>
            <div><p className={styles.eyebrow}>WEDNESDAY, NOVEMBER 4</p><h1>Orders</h1><p className={styles.subtitle}>A simple drag-and-drop view of your fulfillment flow.</p></div>
            <div className={styles.stats}><div><strong>{orders.length}</strong><span>Sample orders</span></div><div><strong>{packedCount}</strong><span>To pack</span></div><div><strong>{deliveredCount}</strong><span>Delivered</span></div></div>
          </div>

          <div className={styles.boardToolbar}>
            <div className={styles.boardLabel}><span className={styles.activeDot} /> Packing board <small>{orders.length} orders</small></div>
            <label className={styles.search}><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search orders or customers" aria-label="Search orders or customers" /></label>
            <Link className={styles.backLink} href="/admin/orders">Open real admin</Link>
          </div>

          <div className={styles.board} aria-label="Order statuses">
            {columns.map((column, index) => {
              const columnOrders = filteredOrders.filter((order) => order.status === column.id);
              return (
                <section
                  key={column.id}
                  className={`${styles.column} ${styles[column.color]}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleDrop(event, column.id)}
                  aria-label={`${column.title}, ${columnOrders.length} orders`}
                >
                  <header className={styles.columnHeader}>
                    <span className={styles.statusDot} />
                    <div><h2>{column.title}</h2><p>{column.subtitle}</p></div>
                    <span className={styles.count}>{columnOrders.length}</span>
                    <MoreHorizontal size={17} />
                  </header>
                  <div className={styles.cardList}>
                    {columnOrders.map((order) => (
                      <article
                        key={order.id}
                        className={`${styles.orderCard} ${draggingId === order.id ? styles.dragging : ""} ${keyboardDragId === order.id ? styles.keyboardDragging : ""}`}
                        draggable
                        tabIndex={0}
                        aria-label={`${order.id}, ${order.customer}, ${formatPrice(order.total)}. Press Space, then left or right arrow to move between columns.`}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", order.id);
                          event.dataTransfer.effectAllowed = "move";
                          setDraggingId(order.id);
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        onKeyDown={(event) => handleCardKeyDown(event, order)}
                      >
                        <div className={styles.cardTop}><span>{order.id}</span><span>{order.age}</span></div>
                        <h3>{order.customer}</h3>
                        <ul>{order.items.map((item) => <li key={item}><span />{item}</li>)}</ul>
                        <div className={styles.cardBottom}><strong>{formatPrice(order.total)}</strong><span className={styles.channel}>{order.channel}</span></div>
                      </article>
                    ))}
                    {columnOrders.length === 0 && <div className={styles.emptyLane}>{search ? "No matching orders" : "Drop an order here"}</div>}
                    {index < columns.length - 1 && <div className={styles.dropHint}>Drop to move to {column.title.toLowerCase()}</div>}
                  </div>
                </section>
              );
            })}
          </div>
          <p className={styles.keyboardHint}>Tip: Focus an order and press <kbd>Space</kbd>, then use <kbd>←</kbd>/<kbd>→</kbd> to move it. Press <kbd>Esc</kbd> to cancel.</p>
          <p className={styles.srOnly} role="status" aria-live="polite">{announcement}</p>
        </div>
      </section>
    </main>
  );
}
