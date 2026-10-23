"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Clock3, LogOut, MapPin, PackageCheck, Plus, Save, ShieldCheck, UserRound } from "lucide-react";
import type { User } from "firebase/auth";
import { firebaseEnabled, logoutFirebase, signInWithGoogle, subscribeToAuth } from "@/lib/firebase";

type Address = {
  id: string;
  label: string;
  city: string;
  address: string;
  is_default: boolean;
};

type CustomerProfile = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  addresses: Address[] | null;
  whatsapp_order_updates_opt_in: boolean;
};

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

const emptyAddress = (): Omit<Address, "id"> => ({ label: "Home", city: "", address: "", is_default: true });

const formatOrderStatus = (status: string) => {
  const normalized = status.toLowerCase();
  const map: Record<string, string> = {
    pending: "Pending",
    awaiting_payment: "Awaiting payment",
    paid: "Paid",
    processing: "Processing",
    shipped: "Shipped",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };
  return map[normalized] ?? status;
};

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [phone, setPhone] = useState("");
  const [whatsappOrderUpdatesOptIn, setWhatsappOrderUpdatesOptIn] = useState(false);
  const [addressDraft, setAddressDraft] = useState(emptyAddress());
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressFormOpen, setAddressFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checkoutDetailsRequired, setCheckoutDetailsRequired] = useState(false);

  useEffect(() => {
    return subscribeToAuth((currentUser) => {
      setCheckoutDetailsRequired(new URLSearchParams(window.location.search).get("checkout") === "details");
      setUser(currentUser);
      if (!currentUser) {
        setLoading(false);
        setIsAdmin(false);
        setProfile(null);
        setOrders([]);
        return;
      }

      setIsAdmin(false);
      setLoading(true);
      setError(null);
      void (async () => {
        try {
          const token = await currentUser.getIdToken();
          const headers = { Authorization: `Bearer ${token}` };
          void fetch("/api/admin/session", { headers, cache: "no-store" })
            .then(async (response) => {
              if (response.status === 401 || response.status === 403) {
                setIsAdmin(false);
                return;
              }
              if (!response.ok) throw new Error(`Admin access check failed with status ${response.status}.`);
              const result = await response.json() as { admin?: boolean };
              setIsAdmin(result.admin === true);
            })
            .catch((adminError: unknown) => {
              setIsAdmin(false);
              console.error("Unable to verify admin menu access.", adminError);
            });
          const [profileResponse, ordersResponse] = await Promise.all([
            fetch("/api/profile", { headers, cache: "no-store" }),
            fetch("/api/orders", { headers, cache: "no-store" }),
          ]);
          const profileResult = await profileResponse.json();
          const ordersResult = await ordersResponse.json();
          if (!profileResponse.ok) throw new Error(profileResult.error || "Unable to load your account.");
          if (!ordersResponse.ok) throw new Error(ordersResult.error || "Unable to load your order history.");

          const loadedProfile = profileResult.profile as CustomerProfile;
          setProfile(loadedProfile);
          setPhone(loadedProfile.phone ?? "");
          setWhatsappOrderUpdatesOptIn(loadedProfile.whatsapp_order_updates_opt_in === true);
          setOrders(ordersResult.orders ?? []);
          const hasDeliveryAddress = loadedProfile.addresses?.some((address) => (
            address.is_default && address.city.trim() && address.address.trim()
          ));
          if (!loadedProfile.addresses?.length || (
            new URLSearchParams(window.location.search).get("checkout") === "details" && !hasDeliveryAddress
          )) setAddressFormOpen(true);
        } catch (loadError) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load your account.");
        } finally {
          setLoading(false);
        }
      })();
    });
  }, []);

  const saveProfile = async () => {
    if (!user || !profile) return;
    setSaving(true);
    setError(null);
    setNotice(null);

    const addresses = [...(profile.addresses ?? [])];
    if (addressFormOpen) {
      const nextAddress: Address = {
        ...addressDraft,
        id: editingAddressId ?? crypto.randomUUID(),
        label: addressDraft.label.trim(),
        city: addressDraft.city.trim(),
        address: addressDraft.address.trim(),
      };
      if (!nextAddress.label || !nextAddress.city || !nextAddress.address) {
        setError("Complete the address label, city, and street address before saving.");
        setSaving(false);
        return;
      }
      const currentIndex = addresses.findIndex((address) => address.id === editingAddressId);
      if (currentIndex >= 0) addresses[currentIndex] = nextAddress;
      else addresses.push(nextAddress);
      if (nextAddress.is_default) {
        addresses.forEach((address) => { address.is_default = address.id === nextAddress.id; });
      }
      if (addresses.length === 1) addresses[0].is_default = true;
    }

    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ phone, addresses, whatsappOrderUpdatesOptIn }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save your account.");
      setProfile(result.profile);
      setPhone(result.profile.phone ?? "");
      setWhatsappOrderUpdatesOptIn(result.profile.whatsapp_order_updates_opt_in === true);
      setAddressFormOpen(false);
      setEditingAddressId(null);
      setCheckoutDetailsRequired(false);
      if (new URLSearchParams(window.location.search).has("checkout")) router.replace("/account");
      setNotice("Your account details are saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save your account.");
    } finally {
      setSaving(false);
    }
  };

  const setDefaultAddress = async (addressId: string) => {
    if (!profile || !user) return;
    setProfile({ ...profile, addresses: profile.addresses?.map((address) => ({ ...address, is_default: address.id === addressId })) ?? [] });
    setAddressFormOpen(false);
    setEditingAddressId(null);
    const nextAddresses = profile.addresses?.map((address) => ({ ...address, is_default: address.id === addressId })) ?? [];
    setSaving(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ phone, addresses: nextAddresses, whatsappOrderUpdatesOptIn }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update your default address.");
      setProfile(result.profile);
      setWhatsappOrderUpdatesOptIn(result.profile.whatsapp_order_updates_opt_in === true);
      setNotice("Default delivery address updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update your default address.");
    } finally {
      setSaving(false);
    }
  };

  const editAddress = (address: Address) => {
    setEditingAddressId(address.id);
    setAddressDraft({ label: address.label, city: address.city, address: address.address, is_default: address.is_default });
    setAddressFormOpen(true);
    setNotice(null);
  };

  const addAddress = () => {
    setEditingAddressId(null);
    setAddressDraft({ ...emptyAddress(), is_default: !profile?.addresses?.length });
    setAddressFormOpen(true);
    setNotice(null);
  };

  const handleSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Unable to sign in with Google.");
    } finally {
      setSigningIn(false);
    }
  };

  const handleLogout = async () => {
    await logoutFirebase();
    router.replace("/");
  };

  const hasDeliveryAddress = Boolean(profile?.addresses?.some((address) => (
    address.is_default && address.city.trim() && address.address.trim()
  )));
  const profileComplete = Boolean(profile?.phone?.trim() && hasDeliveryAddress);

  useEffect(() => {
    if (!checkoutDetailsRequired || loading) return;
    const timer = window.setTimeout(() => {
      document.querySelector(".account-field.is-required")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [checkoutDetailsRequired, loading, profile, addressFormOpen]);

  return (
    <main className="account-page">
      <header className="account-header">
        <Link className="account-brand" href="/" aria-label="Al Raed Sports home"><span className="account-brand-mark">AR</span><span>AL RAED <strong>SPORTS</strong></span></Link>
        <Link className="account-back" href="/"><ArrowLeft size={16} /> Continue shopping</Link>
      </header>

      {!user && !loading ? (
        <section className="account-signin">
          <UserRound size={22} />
          <p className="account-kicker">YOUR AL RAED ACCOUNT</p>
          <h1>Everything for<br /><em>your next order.</em></h1>
          <p>Sign in to manage your delivery details and keep every order in one place.</p>
          {error && <div className="account-alert" role="alert">{error}</div>}
          <button className="account-primary-button" onClick={handleSignIn} disabled={!firebaseEnabled || signingIn}>
            <span className="google-mark">G</span>{signingIn ? "Connecting..." : "Continue with Google"}
          </button>
        </section>
      ) : loading ? (
        <div className="account-loading" role="status">Loading your account…</div>
      ) : (
        <div className="account-shell">
          <div className="account-page-heading">
            <div><p className="account-kicker">YOUR AL RAED ACCOUNT</p><h1>Account <em>overview</em></h1></div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <Link href="/admin" className="account-logout" style={{ display: "inline-flex" }}><ShieldCheck size={16} /> Admin</Link>
              )}
              <button className="account-logout" onClick={handleLogout}><LogOut size={16} /> Sign out</button>
            </div>
          </div>

          {error && <div className="account-alert" role="alert">{error}</div>}
          {notice && <div className="account-notice" role="status"><Check size={15} /> {notice}</div>}
          {checkoutDetailsRequired && <div className="account-alert account-checkout-required" role="alert">Please enter your details to continue with your order.</div>}

          {!profileComplete && <div className="account-setup-banner"><span><PackageCheck size={19} /></span><div><strong>Complete your profile to order</strong><p>Add your phone number and a delivery address. We’ll use these details automatically at checkout.</p></div></div>}

          <div className="account-grid">
            <section className="account-panel personal-panel">
              <div className="account-panel-heading"><div><p className="account-kicker">01 / CUSTOMER</p><h2>Personal details</h2></div><UserRound size={18} /></div>
              <label className="account-field"><span>Full name</span><input value={profile?.full_name ?? user?.displayName ?? ""} readOnly /><small>Your name comes from Google and cannot be changed here.</small></label>
              <label className="account-field"><span>Email address</span><input value={profile?.email ?? user?.email ?? ""} readOnly /></label>
              <label className={`account-field${checkoutDetailsRequired && !phone.trim() ? " is-required" : ""}`}><span>Phone number</span><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="05xxxxxxxx or +9715xxxxxxxx" autoComplete="tel" inputMode="tel" /></label>
              <label className="account-checkbox"><input type="checkbox" checked={whatsappOrderUpdatesOptIn} onChange={(event) => setWhatsappOrderUpdatesOptIn(event.target.checked)} /><span>Send order confirmations to me on WhatsApp (optional)</span></label>
            </section>

            <section className="account-panel addresses-panel">
              <div className="account-panel-heading"><div><p className="account-kicker">02 / DELIVERY</p><h2>Saved addresses</h2></div><button className="account-icon-action" onClick={addAddress} aria-label="Add a delivery address"><Plus size={18} /></button></div>
              <div className="address-list">
                {profile?.addresses?.map((address) => (
                  <article className={`address-card${address.is_default ? " is-default" : ""}`} key={address.id}>
                    <div className="address-card-top"><span className="address-label"><MapPin size={14} />{address.label}</span>{address.is_default && <span className="default-tag">DEFAULT</span>}</div>
                    <strong>{address.city}</strong><p>{address.address}</p>
                    <div className="address-actions"><button onClick={() => editAddress(address)}>Edit address</button>{!address.is_default && <button onClick={() => void setDefaultAddress(address.id)} disabled={saving}>Make default</button>}</div>
                  </article>
                ))}
                {!profile?.addresses?.length && <p className="account-empty-inline">Add a delivery address to make checkout quicker.</p>}
              </div>
              {addressFormOpen && (
                <div className="address-editor">
                  <div className="address-editor-heading"><strong>{editingAddressId ? "Edit address" : "New delivery address"}</strong><button onClick={() => { setAddressFormOpen(false); setEditingAddressId(null); }} aria-label="Cancel address editing">×</button></div>
                  <label className={`account-field${checkoutDetailsRequired && !hasDeliveryAddress ? " is-required" : ""}`}><span>Address label</span><input value={addressDraft.label} onChange={(event) => setAddressDraft((current) => ({ ...current, label: event.target.value }))} placeholder="Home, work..." /></label>
                  <label className={`account-field${checkoutDetailsRequired && !hasDeliveryAddress ? " is-required" : ""}`}><span>City / Emirate</span><input value={addressDraft.city} onChange={(event) => setAddressDraft((current) => ({ ...current, city: event.target.value }))} placeholder="Abu Dhabi" /></label>
                  <label className={`account-field${checkoutDetailsRequired && !hasDeliveryAddress ? " is-required" : ""}`}><span>Street address</span><textarea value={addressDraft.address} onChange={(event) => setAddressDraft((current) => ({ ...current, address: event.target.value }))} placeholder="Area, street, building, apartment" rows={3} /></label>
                  <label className="account-checkbox"><input type="checkbox" checked={addressDraft.is_default} onChange={(event) => setAddressDraft((current) => ({ ...current, is_default: event.target.checked }))} /><span>Set as default delivery address</span></label>
                </div>
              )}
              <button className="account-primary-button account-save-button" onClick={() => void saveProfile()} disabled={saving || (!addressFormOpen && !profile?.addresses?.length)}>
                <Save size={15} /> {saving ? "Saving..." : addressFormOpen ? "Save account and address" : "Save phone number"}
              </button>
            </section>

            <section className="account-panel orders-panel">
              <div className="account-panel-heading"><div><p className="account-kicker">03 / YOUR ACTIVITY</p><h2>Order history</h2></div><Link className="account-orders-link" href="/account/orders">MY ORDERS <ArrowRight size={13} /></Link></div>
              {orders.length ? <div className="order-list">{orders.map((order) => (
                <article className="order-card" key={order.id}>
                  <div className="order-card-heading"><div><span>ORDER</span><strong>#{order.id.slice(0, 8).toUpperCase()}</strong></div><span className={`order-status status-${order.status.toLowerCase()}`}><Clock3 size={12} />{formatOrderStatus(order.status)}</span></div>
                  <div className="order-items">{order.order_items?.map((item) => <div key={item.id}><span>{item.product_name} <small>× {item.quantity}</small></span><strong>AED {(Number(item.unit_price) * item.quantity).toLocaleString()}</strong></div>)}</div>
                  <div className="order-delivery"><MapPin size={13} /><span>{order.city} · {order.address}</span></div>
                  <div className="order-card-footer"><time>{new Date(order.created_at).toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" })}</time><strong>AED {Number(order.total).toLocaleString()}</strong></div>
                  {(order.status === "paid" || order.stripe_payment_intent_id || order.stripe_paid_at) && <div className="order-payment-summary"><strong>Payment confirmed</strong><span>{order.stripe_payment_method || "Payment confirmed"}</span>{order.stripe_paid_at && <time>{new Date(order.stripe_paid_at).toLocaleDateString("en-AE")}</time>}</div>}
                </article>
              ))}</div> : <div className="orders-empty"><PackageCheck size={23} /><strong>No orders yet</strong><p>Your orders and payment confirmations will appear here.</p><Link href="/shop">Explore the collection <ArrowRight size={14} /></Link></div>}
            </section>
          </div>

          <footer className="account-footer"><span>AL RAED SPORTS / CUSTOMER ACCOUNT</span><Link href="/">Back to the store <ArrowRight size={14} /></Link></footer>
        </div>
      )}
    </main>
  );
}