"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, LockKeyhole, MapPin, Plus, Tag, Trash2, UserRound } from "lucide-react";
import type { User } from "firebase/auth";
import { firebaseEnabled, signInWithGoogle, subscribeToAuth } from "@/lib/firebase";
import type { CartLine } from "@/lib/store-products";

type QuoteItem = {
  productId: number;
  name: string;
  imageUrl: string | null;
  quantity: number;
  color: string | null;
  size: string | null;
  unitPrice: number;
  lineTotal: number;
};

type Quote = {
  items: QuoteItem[];
  coupon: { code: string; discount: number } | null;
  subtotal: number;
  deliveryFee: number;
  handlingFee: number;
  discount: number;
  total: number;
};

type SavedAddress = { id: string; label: string; city: string; address: string; is_default: boolean };
type SavedProfile = {
  phone: string | null;
  addresses: SavedAddress[] | null;
  whatsapp_order_updates_opt_in?: boolean;
};

const cartKey = "alraed-storefront-cart";
const couponKey = "alraed-checkout-coupon";
const attemptKey = "alraed-checkout-attempt";
const money = (amount: number) => `AED ${amount.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isCompleteSavedAddress = (address: SavedAddress) =>
  typeof address.id === "string" && Boolean(address.id.trim())
  && typeof address.city === "string" && Boolean(address.city.trim())
  && typeof address.address === "string" && Boolean(address.address.trim());

function isCartLine(value: unknown): value is CartLine {
  if (!value || typeof value !== "object") return false;
  const line = value as Partial<CartLine>;
  return Boolean(line.product && Number.isSafeInteger(line.product.id) && line.product.id > 0
    && typeof line.product.name === "string" && typeof line.product.image === "string"
    && Number.isSafeInteger(line.quantity) && Number(line.quantity) > 0
    && (line.color === undefined || typeof line.color === "string")
    && (line.size === undefined || typeof line.size === "string"));
}

function readCart() {
  const stored = window.localStorage.getItem(cartKey);
  if (!stored) return [];
  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed) || !parsed.every(isCartLine)) {
    throw new Error("Your saved bag could not be read. Return to the store and refresh your bag.");
  }
  return parsed;
}

export default function OrderSummaryPage() {
  const [user, setUser] = useState<User | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [profile, setProfile] = useState<SavedProfile | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLabel, setAddressLabel] = useState("Home");
  const [city, setCity] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [appliedCouponCode, setAppliedCouponCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [couponLoading, setCouponLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const [couponMessage, setCouponMessage] = useState("");
  const [couponError, setCouponError] = useState("");
  const quoteErrorRef = useRef("");

  const refreshQuote = useCallback(async (currentUser: User, lines: CartLine[], code: string) => {
    if (!lines.length) {
      setQuote(null);
      setError("");
      return null;
    }

    setQuoteLoading(true);
    setError("");
    quoteErrorRef.current = "";
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch("/api/checkout/quote", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          products: lines.map(({ product, quantity, color, size }) => ({
            productId: product.id,
            quantity,
            ...(color ? { color } : {}),
            ...(size ? { size } : {}),
          })),
          couponCode: code,
        }),
        cache: "no-store",
      });
      const result = await response.json() as Quote & { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to verify your order.");
      setQuote(result);
      return result;
    } catch (quoteError) {
      quoteErrorRef.current = quoteError instanceof Error ? quoteError.message : "Unable to verify your order.";
      setQuote(null);
      setError(quoteErrorRef.current);
      return null;
    } finally {
      setQuoteLoading(false);
    }
  }, []);

  useEffect(() => subscribeToAuth((currentUser) => {
    setUser(currentUser);
    if (!currentUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch("/api/profile", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const result = await response.json() as { profile?: SavedProfile; error?: string };
        if (!response.ok || !result.profile) throw new Error(result.error || "Unable to load your delivery details.");
        const validAddresses = result.profile.addresses?.filter(isCompleteSavedAddress) ?? [];
        const selectedAddress = validAddresses.find((address) => address.is_default) ?? validAddresses[0];
        setProfile(result.profile);
        setPhone(result.profile.phone ?? "");
        setSelectedAddressId(selectedAddress?.id ?? crypto.randomUUID());
        setAddressLabel(selectedAddress?.label || "Home");
        setCity(selectedAddress?.city ?? "");
        setStreetAddress(selectedAddress?.address ?? "");
      } catch (profileError) {
        setError(profileError instanceof Error ? profileError.message : "Unable to verify your delivery details.");
      } finally {
        setLoading(false);
      }
    })();
  }), []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setCart(readCart());
        const savedCoupon = window.sessionStorage.getItem(couponKey) ?? "";
        setAppliedCouponCode(savedCoupon);
        setCouponInput(savedCoupon);
      } catch (cartError) {
        setError(cartError instanceof Error ? cartError.message : "Unable to load your bag.");
      } finally {
        setCartLoaded(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!user || !cartLoaded) return;
    const timer = window.setTimeout(() => void refreshQuote(user, cart, appliedCouponCode), 0);
    return () => window.clearTimeout(timer);
  }, [user, cart, cartLoaded, appliedCouponCode, refreshQuote]);

  useEffect(() => {
    const synchronizeCart = () => {
      try {
        setCart(readCart());
      } catch (cartError) {
        setError(cartError instanceof Error ? cartError.message : "Unable to load your bag.");
      }
    };
    window.addEventListener("storage", synchronizeCart);
    window.addEventListener("alraed-cart-update", synchronizeCart);
    return () => {
      window.removeEventListener("storage", synchronizeCart);
      window.removeEventListener("alraed-cart-update", synchronizeCart);
    };
  }, []);

  const applyCoupon = async () => {
    if (!user || !cart.length || !couponInput.trim()) {
      setCouponError("Enter a coupon code.");
      return;
    }
    const previousQuote = quote;
    setCouponLoading(true);
    setCouponError("");
    setCouponMessage("");
    const result = await refreshQuote(user, cart, couponInput.trim());
    if (result?.coupon) {
      const code = result.coupon.code;
      setAppliedCouponCode(code);
      setCouponInput(code);
      window.sessionStorage.setItem(couponKey, code);
      setCouponMessage(`${code} applied. You saved ${money(result.discount)}.`);
    } else {
      setCouponError(quoteErrorRef.current || "That coupon could not be applied.");
      setQuote(previousQuote);
      setError("");
    }
    setCouponLoading(false);
  };

  const removeCoupon = () => {
    setAppliedCouponCode("");
    setCouponInput("");
    setCouponMessage("");
    setCouponError("");
    window.sessionStorage.removeItem(couponKey);
  };

  const continueWithGoogle = async () => {
    setSigningIn(true);
    setError("");
    try {
      await signInWithGoogle();
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Unable to sign in with Google.");
    } finally {
      setSigningIn(false);
    }
  };

  const addDeliveryAddress = () => {
    setSelectedAddressId(crypto.randomUUID());
    setAddressLabel("Home");
    setCity("");
    setStreetAddress("");
  };

  const proceedToPayment = async () => {
    if (!user || !quote || paymentLoading) return;
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length < 9 || phoneDigits.length > 15) {
      setError("Enter a valid phone number before continuing.");
      return;
    }
    if (!addressLabel.trim() || !city.trim() || !streetAddress.trim()) {
      setError("Complete the address label, city, and street address before continuing.");
      return;
    }
    setPaymentLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const addressId = selectedAddressId || crypto.randomUUID();
      const addresses = (profile?.addresses ?? []).filter(isCompleteSavedAddress)
        .map((address) => ({ ...address, is_default: address.id === addressId }));
      const currentAddressIndex = addresses.findIndex((address) => address.id === addressId);
      const deliveryAddress: SavedAddress = {
        id: addressId,
        label: addressLabel.trim(),
        city: city.trim(),
        address: streetAddress.trim(),
        is_default: true,
      };
      if (currentAddressIndex >= 0) addresses[currentAddressIndex] = deliveryAddress;
      else addresses.push(deliveryAddress);

      const profileResponse = await fetch("/api/profile", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          addresses,
          whatsappOrderUpdatesOptIn: profile?.whatsapp_order_updates_opt_in === true,
        }),
      });
      const profileResult = await profileResponse.json() as { profile?: SavedProfile; error?: string };
      if (!profileResponse.ok || !profileResult.profile) {
        throw new Error(profileResult.error || "Unable to save your delivery details.");
      }
      setProfile(profileResult.profile);
      setSelectedAddressId(addressId);

      const checkoutFingerprint = JSON.stringify({
        products: cart.map(({ product, quantity, color, size }) => [product.id, quantity, color ?? null, size ?? null]),
        coupon: appliedCouponCode,
        address: addressId,
      });
      let savedAttempt: { fingerprint: string; id: string } | null = null;
      try {
        const storedAttempt = window.sessionStorage.getItem(attemptKey);
        savedAttempt = storedAttempt ? JSON.parse(storedAttempt) as { fingerprint: string; id: string } : null;
      } catch {
        window.sessionStorage.removeItem(attemptKey);
      }
      let checkoutAttemptId = savedAttempt?.fingerprint === checkoutFingerprint ? savedAttempt.id : null;
      if (!checkoutAttemptId) {
        checkoutAttemptId = crypto.randomUUID();
        window.sessionStorage.setItem(attemptKey, JSON.stringify({ fingerprint: checkoutFingerprint, id: checkoutAttemptId }));
      }
      const response = await fetch("/api/checkout/session", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          products: cart.map(({ product, quantity, color, size }) => ({
            product: { id: product.id },
            quantity,
            ...(color ? { color } : {}),
            ...(size ? { size } : {}),
          })),
          couponCode: appliedCouponCode,
          addressId,
          checkoutAttemptId,
        }),
      });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok) {
        if (response.headers.get("X-Checkout-Retry") === "new-attempt") {
          window.sessionStorage.removeItem(attemptKey);
        }
        throw new Error(result.error || "Unable to start secure checkout.");
      }
      if (!result.url) throw new Error("Secure checkout did not return a payment link.");
      window.sessionStorage.removeItem(attemptKey);
      window.location.assign(result.url);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Unable to start secure checkout.");
      setPaymentLoading(false);
    }
  };

  const savedAddresses = profile?.addresses?.filter(isCompleteSavedAddress) ?? [];
  const busy = loading || !cartLoaded || quoteLoading;

  return (
    <main className="account-page checkout-summary-page">
      <header className="account-header">
        <Link className="account-brand" href="/" aria-label="Al Raed Sports home"><span className="account-brand-mark">AR</span><span>AL RAED <strong>SPORTS</strong></span></Link>
        <Link className="account-back" href="/shop"><ArrowLeft size={15} /> Return to your bag</Link>
      </header>
      <div className="account-shell checkout-summary-shell">
        <div className="account-page-heading">
          <div><p className="account-kicker">SECURE CHECKOUT / 01</p><h1>Review your <em>order.</em></h1></div>
          <span className="checkout-summary-secure"><LockKeyhole size={15} /> Secure payment by Stripe</span>
        </div>

        {error && <div className="account-alert" role="alert">{error}</div>}
        {busy ? <div className="account-loading" role="status">Verifying your order and current prices…</div> : cart.length === 0 ? (
          <section className="checkout-summary-empty account-panel">
            <Tag size={24} /><h2>Your bag is empty</h2><p>Add products to your bag before reviewing your order.</p>
            <Link className="account-primary-button" href="/shop">CONTINUE SHOPPING <ArrowRight size={15} /></Link>
          </section>
        ) : (
          <div className="checkout-summary-layout">
            <section className="account-panel checkout-summary-items">
              <div className="account-panel-heading"><div><p className="account-kicker">YOUR SELECTION</p><h2>Items ({quote?.items.length ?? cart.length})</h2></div></div>
              <div className="checkout-summary-item-list">
                {quote?.items.map((item, index) => (
                  <article className="checkout-summary-item" key={`${item.productId}-${index}`}>
                    <div className="checkout-summary-image">
                      {item.imageUrl ? <Image src={item.imageUrl} alt="" width={100} height={100} unoptimized /> : <Tag size={20} />}
                    </div>
                    <div className="checkout-summary-item-copy">
                      <strong>{item.name}</strong>
                      {(item.color || item.size) && <span>{[item.color && `Color: ${item.color}`, item.size && `Size: ${item.size}`].filter(Boolean).join(" · ")}</span>}
                      <span>Qty {item.quantity} · {money(item.unitPrice)} each</span>
                    </div>
                    <strong className="checkout-summary-line-total">{money(item.lineTotal)}</strong>
                  </article>
                ))}
                {!user && cart.map((line, index) => (
                  <article className="checkout-summary-item" key={`${line.product.id}-${index}`}>
                    <div className="checkout-summary-image">
                      {line.product.image ? <Image src={line.product.image} alt="" width={100} height={100} unoptimized /> : <Tag size={20} />}
                    </div>
                    <div className="checkout-summary-item-copy">
                      <strong>{line.product.name}</strong>
                      {(line.color || line.size) && <span>{[line.color && `Color: ${line.color}`, line.size && `Size: ${line.size}`].filter(Boolean).join(" · ")}</span>}
                      <span>Qty {line.quantity} · {money(line.product.price)} each</span>
                    </div>
                    <strong className="checkout-summary-line-total">{money(line.product.price * line.quantity)}</strong>
                  </article>
                ))}
              </div>
              <div className="checkout-summary-address">
                <div className="checkout-summary-address-heading">
                  <div><strong>Delivery details</strong><span>Add your phone number and the address for this order.</span></div>
                  {user && <button className="checkout-add-address" type="button" onClick={addDeliveryAddress} disabled={paymentLoading}><Plus size={13} /> ADD ADDRESS</button>}
                </div>
                {!user ? (
                  <div className="checkout-inline-signin">
                    <UserRound size={20} />
                    <div><strong>Sign in to continue your order</strong><p>Your order and delivery details will be saved to your account.</p></div>
                    <button className="account-primary-button" type="button" onClick={() => void continueWithGoogle()} disabled={!firebaseEnabled || signingIn}>
                      {signingIn ? <><LoaderCircle size={15} className="checkout-spinning" /> CONNECTING…</> : <><span className="google-mark">G</span> CONTINUE WITH GOOGLE</>}
                    </button>
                  </div>
                ) : (
                  <>
                    {savedAddresses.length > 0 ? (
                      <div className="checkout-address-options" role="group" aria-label="Choose a saved delivery address">
                        {savedAddresses.map((address) => (
                          <button
                            type="button"
                            key={address.id}
                            className={`checkout-address-option${selectedAddressId === address.id ? " is-selected" : ""}`}
                            onClick={() => {
                              setSelectedAddressId(address.id);
                              setAddressLabel(address.label || "Home");
                              setCity(address.city);
                              setStreetAddress(address.address);
                            }}
                            aria-pressed={selectedAddressId === address.id}
                            disabled={paymentLoading}
                          >
                            <MapPin size={16} aria-hidden="true" />
                            <span><strong>{address.label || "Delivery address"}{address.is_default ? " · Default" : ""}</strong><small>{address.city} · {address.address}</small></span>
                            <span className="checkout-address-check" aria-hidden="true">{selectedAddressId === address.id ? <Check size={14} /> : null}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="checkout-delivery-fields">
                      <label className="account-field"><span>Phone number</span><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="05xxxxxxxx or +9715xxxxxxxx" autoComplete="tel" inputMode="tel" disabled={paymentLoading} /></label>
                      <label className="account-field"><span>Address label</span><input value={addressLabel} onChange={(event) => setAddressLabel(event.target.value)} placeholder="Home, work..." autoComplete="address-line1" disabled={paymentLoading} /></label>
                      <label className="account-field"><span>City / Emirate</span><input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Abu Dhabi" autoComplete="address-level1" disabled={paymentLoading} /></label>
                      <label className="account-field"><span>Street address</span><textarea value={streetAddress} onChange={(event) => setStreetAddress(event.target.value)} placeholder="Area, street, building, apartment" rows={3} autoComplete="street-address" disabled={paymentLoading} /></label>
                    </div>
                  </>
                )}
              </div>
            </section>

            <aside className="account-panel checkout-summary-totals">
              <div className="account-panel-heading"><div><p className="account-kicker">PAYMENT DETAILS</p><h2>Order total</h2></div></div>
              <form className="checkout-coupon-form" onSubmit={(event) => { event.preventDefault(); void applyCoupon(); }}>
                <label htmlFor="checkout-coupon">Coupon code</label>
                <div className="checkout-coupon-input">
                  <input id="checkout-coupon" value={couponInput} onChange={(event) => setCouponInput(event.target.value)} placeholder="Enter code" autoComplete="off" disabled={!user || couponLoading || paymentLoading || Boolean(quote?.coupon)} />
                  {quote?.coupon ? (
                    <button type="button" onClick={removeCoupon} disabled={couponLoading || paymentLoading} aria-label="Remove coupon"><Trash2 size={16} /></button>
                  ) : (
                    <button type="submit" disabled={!user || couponLoading || paymentLoading || !couponInput.trim()}>{couponLoading ? <LoaderCircle size={16} className="checkout-spinning" /> : "Apply"}</button>
                  )}
                </div>
              </form>
              {couponError && <p className="checkout-coupon-message is-error" role="alert">{couponError}</p>}
              {couponMessage && <p className="checkout-coupon-message" role="status"><Check size={14} /> {couponMessage}</p>}
              {quote?.coupon && <p className="checkout-applied-coupon"><Tag size={13} /> {quote.coupon.code} applied <button type="button" onClick={removeCoupon}>Remove</button></p>}

              <div className="checkout-price-rows">
                <div><span>Product subtotal</span><strong>{quote ? money(quote.subtotal) : "—"}</strong></div>
                <div><span>Delivery fee</span><strong>{quote ? quote.deliveryFee > 0 ? money(quote.deliveryFee) : "FREE" : "—"}</strong></div>
                <div><span>Handling fee</span><strong>{quote ? quote.handlingFee > 0 ? money(quote.handlingFee) : "FREE" : "—"}</strong></div>
                {quote?.coupon && <div className="checkout-discount-row"><span>Coupon discount</span><strong>− {money(quote.discount)}</strong></div>}
                <div className="checkout-final-total"><span>Total payable</span><strong>{quote ? money(quote.total) : "—"}</strong></div>
              </div>
              <p className="checkout-summary-delivery-note">Delivery fees and handling are included in the total above. You can confirm your address before paying.</p>
              {!user && <p className="checkout-summary-delivery-note">Sign in to verify current prices and apply offers.</p>}

              {error && <p className="checkout-summary-error" role="alert">{error}</p>}
              <button className="account-primary-button checkout-pay-button" type="button" onClick={() => void proceedToPayment()} disabled={!user || !quote || paymentLoading || quoteLoading}>
                {paymentLoading ? <><LoaderCircle size={16} className="checkout-spinning" /> SAVING DETAILS…</> : <>SAVE DETAILS &amp; PROCEED TO PAYMENT <ArrowRight size={16} /></>}
              </button>
              <p className="checkout-summary-payment-note"><LockKeyhole size={13} /> Final prices and coupon eligibility are verified securely before payment.</p>
              <Link className="checkout-summary-back-link" href="/shop"><ArrowLeft size={14} /> Change items in your bag</Link>
            </aside>
          </div>
        )}
      </div>
      <footer className="account-footer"><Link href="/account">My account</Link><Link href="/shop">Continue shopping</Link></footer>
    </main>
  );
}
