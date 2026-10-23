"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AthleteShowcase from "./AthleteShowcase";
import ProductDetailDialog from "@/components/storefront/ProductDetailDialog";
import { getCartLineKey, hasProductOptions, isFootwearProduct, mapStoreProduct, type CartLine, type StoreProduct } from "@/lib/store-products";
import { startStripeCheckout } from "@/lib/start-checkout";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Heart,
  MapPin,
  Menu,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const line = value as Record<string, unknown>;
  const product = line.product;
  if (typeof product !== "object" || product === null || Array.isArray(product)) return false;
  const item = product as Record<string, unknown>;
  return typeof line.quantity === "number"
    && Number.isSafeInteger(line.quantity)
    && line.quantity > 0
    && typeof item.id === "number"
    && Number.isSafeInteger(item.id)
    && (item.productType === undefined || item.productType === "shoe" || item.productType === "racquet" || item.productType === "other")
    && (item.sizeCategory === undefined || item.sizeCategory === null || item.sizeCategory === "mens" || item.sizeCategory === "womens" || item.sizeCategory === "kids")
    && typeof item.name === "string"
    && typeof item.brand === "string"
    && typeof item.category === "string"
    && typeof item.price === "number"
    && Number.isFinite(item.price)
    && typeof item.image === "string"
    && typeof item.rating === "number"
    && Number.isFinite(item.rating)
    && typeof item.reviews === "number"
    && Number.isSafeInteger(item.reviews)
    && typeof item.stock === "number"
    && Number.isSafeInteger(item.stock)
    && (item.colors === undefined || (Array.isArray(item.colors) && item.colors.every((color) => typeof color === "string")))
    && (item.sizes === undefined || (Array.isArray(item.sizes) && item.sizes.every((size) => typeof size === "string")))
    && (item.unavailableSizes === undefined || (Array.isArray(item.unavailableSizes) && item.unavailableSizes.every((size) => typeof size === "string")))
    && (line.color === undefined || typeof line.color === "string")
    && (line.size === undefined || typeof line.size === "string");
}

const categories = [
  { name: "Badminton", note: "Find your flight", image: "/playerimage.jpeg" },
  { name: "Tennis", note: "Own the court", image: "https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?auto=format&fit=crop&w=900&q=85" },
  { name: "Squash", note: "Play at pace", image: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=900&q=85" },
  { name: "Accessories", note: "The little things", image: "/product1.jpg" },
];

const campaigns = [
  {
    eyebrow: "BADMINTON · NEW ARRIVALS",
    title: <>Fresh gear.<br /><em>Fresh energy.</em></>,
    description: "New badminton essentials have landed. Find your next racket, shoes and court-day favourites.",
    cta: "SHOP NEW ARRIVALS",
    image: "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=2200&q=90",
  },
  {
    eyebrow: "TENNIS ACCESSORIES & GEAR",
    title: <>Gear up.<br /><em>Play on.</em></>,
    description: "From rackets and balls to shoes, bags and accessories, find everything you need for your next match.",
    cta: "SHOP TENNIS GEAR",
    href: "/shop?category=Tennis",
    image: "/tennis-accessories-poster.jpg",
  },
  {
    eyebrow: "PICKLEBALL · COURT ESSENTIALS",
    title: <>Pick your paddle.<br /><em>Own the court.</em></>,
    description: "Shop pickleball paddles, balls and court essentials for your next game.",
    cta: "SHOP PICKLEBALL",
    href: "/shop?category=Pickleball",
    image: "/pickleball-campaign.jpg",
  },
  {
    eyebrow: "TENNIS · RACQUET COLLECTION",
    title: <>Find your<br /><em>winning edge.</em></>,
    description: "Explore tennis racquets and court essentials made for confident serves, sharp returns and every rally.",
    cta: "SHOP TENNIS EQUIPMENT",
    href: "/shop?category=Tennis",
    image: "https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=2200&q=90",
  },
  {
    eyebrow: "BADMINTON · DID YOU KNOW?",
    title: <>Made for<br /><em>every rally.</em></>,
    description: "A feather shuttlecock's 16 feathers help it fly true. Find shuttlecocks selected for your game.",
    cta: "SHOP SHUTTLECOCKS",
    image: "/product2.jpg",
  },
  {
    eyebrow: "TENNIS · PLAYER PLAYBOOK",
    title: <>Split-step.<br /><em>Stay ready.</em></>,
    description: "Time a small split-step as your opponent hits to be ready to move in any direction.",
    cta: "EXPLORE TENNIS GEAR",
    href: "/shop?category=Tennis",
    image: "https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?auto=format&fit=crop&w=2200&q=90",
  },
  {
    eyebrow: "TENNIS · COURT STRATEGY",
    title: <>Own the baseline.<br /><em>Rule the rally.</em></>,
    description: "Build your point from the baseline, move your opponent and step in when the moment is right.",
    cta: "EXPLORE TENNIS GEAR",
    href: "/shop?category=Tennis",
    image: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=2200&q=90",
  },
  {
    eyebrow: "BADMINTON · TENNIS · PICKLEBALL",
    title: <>Play more.<br /><em>Love every point.</em></>,
    description: "From first serve to match point, find the kit that makes every session feel like yours.",
    cta: "FIND YOUR GEAR",
    image: "/product1.jpg",
  },
  {
    eyebrow: "YONEX · TENNIS SHOES",
    title: <>Move with<br /><em>confidence.</em></>,
    description: "Responsive court shoes made to support every split-step, sprint and change of direction.",
    cta: "SHOP TENNIS SHOES",
    href: "/shop?category=Tennis",
    image: "/yonex%20banner.jpg",
    layout: "poster-wide",
  },
  {
    eyebrow: "YONEX · COURT SHOES",
    title: <>Own every<br /><em>step.</em></>,
    description: "Find a secure, comfortable fit for quick footwork and long rallies on court.",
    cta: "EXPLORE COURT SHOES",
    href: "/shop?category=Tennis",
    image: "/yonex%20banner%202.jpg",
    layout: "poster-portrait",
  },
];

const money = (amount: number) =>
  new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 2 }).format(amount);

const configuredWhatsAppNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, "");
const footerWhatsAppUrl = configuredWhatsAppNumber
  ? `https://wa.me/${configuredWhatsAppNumber.startsWith("00") ? configuredWhatsAppNumber.slice(2) : configuredWhatsAppNumber.startsWith("0") ? `971${configuredWhatsAppNumber.slice(1)}` : configuredWhatsAppNumber}`
  : "https://wa.me/?text=Hello%20Al%20Raed%20Sports";

function ProductTile({
  product,
  liked,
  onLike,
  onAdd,
  onView,
  added,
}: {
  product: StoreProduct;
  liked: boolean;
  onLike: (id: number) => void;
  onAdd: (product: StoreProduct) => void;
  onView: (product: StoreProduct) => void;
  added: boolean;
}) {
  return (
    <article className="ar-product">
      <div className="ar-product-image">
        {product.image ? <img src={product.image} alt={product.name} loading="lazy" /> : <span className="ar-product-placeholder">AL RAED<br />SPORTS</span>}
        <button className="ar-product-open" type="button" onClick={() => onView(product)} aria-label={`View details for ${product.name}`} />
        {product.stock <= 3 && product.stock > 0 && <span className="ar-product-badge">LOW STOCK</span>}
        <button className={`ar-wishlist ${liked ? "is-liked" : ""}`} type="button" onClick={() => onLike(product.id)} aria-label={`${liked ? "Remove" : "Add"} ${product.name} ${liked ? "from" : "to"} wishlist`}>
          <Heart size={18} fill={liked ? "currentColor" : "none"} />
        </button>
        <button className="ar-quick-add" type="button" onClick={() => hasProductOptions(product) ? onView(product) : onAdd(product)} disabled={product.stock <= 0} aria-label={`${hasProductOptions(product) ? "Choose options for" : "Add"} ${product.name} ${hasProductOptions(product) ? "" : "to bag"}`}>
          {product.stock <= 0 ? "SOLD OUT" : added ? <><Check size={15} /> ADDED</> : hasProductOptions(product) ? <>CHOOSE OPTIONS <Plus size={15} /></> : <>ADD TO BAG <Plus size={15} /></>}
        </button>
      </div>
      <div className="ar-product-copy">
        <div className="ar-product-kicker"><span>{product.brand || "AL RAED"}</span>{product.rating > 0 && <span>★ {product.rating.toFixed(1)}</span>}</div>
        <h3><button className="ar-product-title-button" type="button" onClick={() => onView(product)}>{product.name}</button></h3>
        <button className="ar-product-details-link" type="button" onClick={() => onView(product)}>VIEW DETAILS <ArrowUpRight size={12} /></button>
        <div className="ar-product-bottom"><strong>{money(product.price)}</strong>{product.stock > 0 && <small>{product.stock < 4 ? `Only ${product.stock} left` : "In stock"}</small>}</div>
      </div>
    </article>
  );
}

function ScrollFilm({
  src,
  eyebrow,
  title,
  description,
  sectionLabel,
  ctaLabel,
  ctaHref,
  mobileSrc,
  align = "left",
}: {
  src: string;
  eyebrow: string;
  title: React.ReactNode;
  description: string;
  sectionLabel: string;
  ctaLabel: string;
  ctaHref: string;
  mobileSrc: string;
  align?: "left" | "right";
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<number | null>(null);
  const [playbackError, setPlaybackError] = useState(false);
  const [scrollDriven, setScrollDriven] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    const video = videoRef.current;
    if (!section || !video) return;

    const hasMouseOrTrackpad = window.matchMedia("(hover: hover) and (pointer: fine)");
    let activeScrollMode: boolean | null = null;
    let playbackObserver: IntersectionObserver | null = null;

    const updateFrame = () => {
      frameRef.current = null;
      if (!video.duration || !Number.isFinite(video.duration)) return;
      const scrollRange = Math.max(1, section.offsetHeight - window.innerHeight);
      const scrollProgress = Math.min(1, Math.max(0, -section.getBoundingClientRect().top / scrollRange));
      const easedProgress = 1 - Math.pow(1 - scrollProgress, 3);
      const targetTime = easedProgress * video.duration;
      if (Math.abs(video.currentTime - targetTime) > 0.02) video.currentTime = targetTime;
    };
    const scheduleFrame = () => {
      if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(updateFrame);
    };
    const pausePlayback = () => video.pause();
    const showPlaybackError = (error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error(`Unable to play the ${sectionLabel} video.`, error);
      setPlaybackError(true);
    };
    const onPlaying = () => setPlaybackError(false);
    const onVideoError = () => showPlaybackError(video.error);
    const updatePlaybackMode = () => {
      const useScrollAnimation = hasMouseOrTrackpad.matches;
      if (activeScrollMode === useScrollAnimation) return;
      activeScrollMode = useScrollAnimation;
      setScrollDriven(useScrollAnimation);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      const source = useScrollAnimation ? src : mobileSrc;
      const sourceUrl = new URL(source, document.baseURI).href;
      if (video.src !== sourceUrl) {
        video.src = source;
        video.load();
      }

      if (useScrollAnimation) {
        playbackObserver?.disconnect();
        playbackObserver = null;
        video.removeEventListener("playing", onPlaying);
        video.removeEventListener("error", onVideoError);
        video.autoplay = false;
        video.loop = false;
        video.pause();
        video.addEventListener("play", pausePlayback);
        video.addEventListener("loadedmetadata", scheduleFrame);
        window.addEventListener("scroll", scheduleFrame, { passive: true });
        window.addEventListener("resize", scheduleFrame);
        if (video.readyState >= 1) updateFrame();
        return;
      }

      video.removeEventListener("play", pausePlayback);
      video.removeEventListener("loadedmetadata", scheduleFrame);
      window.removeEventListener("scroll", scheduleFrame);
      window.removeEventListener("resize", scheduleFrame);
      video.autoplay = true;
      video.loop = true;
      video.addEventListener("playing", onPlaying);
      video.addEventListener("error", onVideoError);
      playbackObserver = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch((error: unknown) => {
            showPlaybackError(error);
          });
        } else {
          video.pause();
        }
      });
      playbackObserver.observe(section);
    };

    updatePlaybackMode();
    hasMouseOrTrackpad.addEventListener("change", updatePlaybackMode);

    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      playbackObserver?.disconnect();
      hasMouseOrTrackpad.removeEventListener("change", updatePlaybackMode);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onVideoError);
      video.removeEventListener("play", pausePlayback);
      video.removeEventListener("loadedmetadata", scheduleFrame);
      window.removeEventListener("scroll", scheduleFrame);
      window.removeEventListener("resize", scheduleFrame);
    };
  }, [mobileSrc, sectionLabel, src]);

  const retryPlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    setPlaybackError(false);
    if (video.error) video.load();
    video.play().catch((error: unknown) => {
      console.error(`Unable to play the ${sectionLabel} video.`, error);
      setPlaybackError(true);
    });
  };
  return (
    <section ref={sectionRef} className={`ar-scroll-film ${align === "right" ? "is-right" : ""}`} aria-label={sectionLabel}>
      <div className="ar-scroll-film-stage">
        <video ref={videoRef} className="ar-scroll-film-video" src={mobileSrc} autoPlay loop muted playsInline preload="metadata" aria-label={sectionLabel} />
        {playbackError && <button className="ar-video-retry" type="button" onClick={retryPlayback}>TAP TO PLAY VIDEO <ArrowRight size={15} /></button>}
        <div className="ar-scroll-film-shade" />
        <div className="ar-scroll-film-copy">
          <p className="ar-eyebrow"><span /> {eyebrow}</p>
          <h2>{title}</h2>
          <p>{description}</p>
          <Link className="ar-button ar-button-light" href={ctaHref}>{ctaLabel} <ArrowRight size={16} /></Link>
          <span className="ar-scroll-film-hint"><span /> {scrollDriven ? "SCROLL TO FEEL THE DIFFERENCE" : "VIDEO PLAYS AUTOMATICALLY"}</span>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const router = useRouter();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "error">("loading");
  const [catalogError, setCatalogError] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [cartReady, setCartReady] = useState(false);
  const [wishlist, setWishlist] = useState<number[]>([]);
  const [wishlistReady, setWishlistReady] = useState(false);
  const [campaignIndex, setCampaignIndex] = useState(0);
  const [justAdded, setJustAdded] = useState<number[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<StoreProduct | null>(null);
  const [announcementIndex, setAnnouncementIndex] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/products", { cache: "no-store" })
      .then(async (response) => {
        const result: { products?: Array<Record<string, unknown>>; error?: string } = await response.json();
        if (!response.ok) throw new Error(result.error || "The product catalog could not be loaded.");
        return result.products ?? [];
      })
      .then((rows) => {
        if (!active) return;
        setProducts(rows.map(mapStoreProduct));
        setCatalogState("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCatalogError(error instanceof Error ? error.message : "The product catalog could not be loaded.");
        setCatalogState("error");
      });

    const restoreTimer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem("alraed-storefront-cart");
        if (saved) {
          const parsedCart: unknown = JSON.parse(saved);
          if (Array.isArray(parsedCart)) {
            setCart(parsedCart.filter(isCartLine).map((line) => ({
              ...line,
              product: {
                ...line.product,
                productType: line.product.productType ?? (/shoe|sneaker/i.test(line.product.name) ? "shoe" : /racket|racquet/i.test(line.product.name) ? "racquet" : "other"),
                sizeCategory: line.product.sizeCategory ?? null,
                colors: line.product.colors ?? [],
                sizes: line.product.sizes ?? [],
                unavailableSizes: line.product.unavailableSizes ?? [],
                sizeStock: line.product.sizeStock ?? {},
              },
            })));
          }
        }
        const savedWishlist = localStorage.getItem("alraed-storefront-wishlist");
        if (savedWishlist) {
          const parsedWishlist: unknown = JSON.parse(savedWishlist);
          if (Array.isArray(parsedWishlist)) setWishlist(parsedWishlist.filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0));
        }
      } catch {
        localStorage.removeItem("alraed-storefront-cart");
        localStorage.removeItem("alraed-storefront-wishlist");
      }
      setCartReady(true);
      setWishlistReady(true);
    });

    return () => {
      active = false;
      window.clearTimeout(restoreTimer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCampaignIndex((index) => (index + 1) % campaigns.length);
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setAnnouncementIndex((index) => (index + 1) % 3), 4500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (cartReady) localStorage.setItem("alraed-storefront-cart", JSON.stringify(cart));
  }, [cart, cartReady]);

  useEffect(() => {
    if (wishlistReady) localStorage.setItem("alraed-storefront-wishlist", JSON.stringify(wishlist));
  }, [wishlist, wishlistReady]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!cartOpen && !menuOpen && !selectedProduct) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCartOpen(false);
        setMenuOpen(false);
        setSelectedProduct(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [cartOpen, menuOpen, selectedProduct]);

  const filteredProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = activeCategory === "All" || product.category.toLowerCase() === activeCategory.toLowerCase();
    const matchesSearch = !query || `${product.name} ${product.brand} ${product.category}`.toLowerCase().includes(query.toLowerCase());
    return matchesCategory && matchesSearch;
  }), [products, activeCategory, query]);

  const newArrivals = products.slice(0, 10);
  const bestSellers = [...products].sort((a, b) => b.rating - a.rating || b.reviews - a.reviews).slice(0, 10);
  const cartCount = cart.reduce((count, line) => count + line.quantity, 0);
  const cartTotal = cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  const suggestions = query ? products.filter((product) => `${product.name} ${product.brand} ${product.category}`.toLowerCase().includes(query.toLowerCase())).slice(0, 5) : [];

  const addToCart = useCallback((product: StoreProduct, requestedQuantity = 1, options: { color?: string; size?: string } = {}) => {
    if (product.stock < 1) return false;
    if ((product.colors.length > 0 && !options.color)
      || ((product.sizes.length > 0 || isFootwearProduct(product)) && !options.size)) return false;
    const newLine = { product, quantity: requestedQuantity, ...options };
    const newLineKey = getCartLineKey(newLine);
    const existingLine = cart.find((line) => getCartLineKey(line) === newLineKey);
    const otherVariantQuantity = cart.reduce((total, line) => (
      line.product.id === product.id && getCartLineKey(line) !== newLineKey ? total + line.quantity : total
    ), 0);
    const availableForVariant = Math.min(Math.max(0, product.stock - otherVariantQuantity), 50);
    if (availableForVariant < 1) return false;
    setCart((items) => {
      const existing = items.find((line) => getCartLineKey(line) === newLineKey);
      if (existing) {
        const otherQuantity = items.reduce((total, line) => (
          line.product.id === product.id && getCartLineKey(line) !== newLineKey ? total + line.quantity : total
        ), 0);
        const maximum = Math.min(Math.max(0, product.stock - otherQuantity), 50);
        return items.map((line) => getCartLineKey(line) === newLineKey ? { ...line, product, quantity: Math.min(line.quantity + requestedQuantity, maximum) } : line);
      }
      return [...items, { ...newLine, quantity: Math.min(requestedQuantity, availableForVariant) }];
    });
    if (existingLine && existingLine.quantity >= availableForVariant) return false;
    setJustAdded((items) => [...items.filter((id) => id !== product.id), product.id]);
    window.setTimeout(() => setJustAdded((items) => items.filter((id) => id !== product.id)), 1500);
    return true;
  }, [cart]);

  const changeQuantity = (lineKey: string, delta: number) => setCart((items) => items.flatMap((line) => {
    if (getCartLineKey(line) !== lineKey) return [line];
    const otherVariantQuantity = items.reduce((total, otherLine) => (
      otherLine.product.id === line.product.id && getCartLineKey(otherLine) !== lineKey ? total + otherLine.quantity : total
    ), 0);
    const maximum = Math.min(Math.max(0, line.product.stock - otherVariantQuantity), 50);
    const next = Math.min(line.quantity + delta, maximum);
    if (next > 0) return [{ ...line, quantity: next }];
    return delta < 0 ? [] : [line];
  }));

  const toggleWishlist = (id: number) => setWishlist((items) => {
    const next = items.includes(id) ? items.filter((item) => item !== id) : [...items, id];
    return next;
  });

  const scrollRail = (direction: "left" | "right") => railRef.current?.scrollBy({ left: direction === "right" ? 520 : -520, behavior: "smooth" });
  const selectCategory = (name: string) => {
    setMenuOpen(false);
    navRef.current?.querySelectorAll("details").forEach((details) => { details.open = false; });
    router.push(name === "All" ? "/shop" : `/shop?category=${encodeURIComponent(name)}`);
  };
  const closeNavDropdowns = () => navRef.current?.querySelectorAll("details").forEach((details) => { details.open = false; });
  const openNavDropdownOnHover = (event: MouseEvent<HTMLDetailsElement>) => {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) event.currentTarget.open = true;
  };
  const closeNavDropdownOnLeave = (event: MouseEvent<HTMLDetailsElement>) => {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) event.currentTarget.open = false;
  };
  const viewProduct = (product: StoreProduct) => {
    closeNavDropdowns();
    setMenuOpen(false);
    setSearchOpen(false);
    setSelectedProduct(product);
  };
  const addProductDetailsToCart = (product: StoreProduct, quantity: number, options: { color?: string; size?: string }) => {
    if (!addToCart(product, quantity, options)) return;
    setSelectedProduct(null);
    setCartOpen(true);
  };
  const openFavourites = () => {
    closeNavDropdowns();
    setMenuOpen(false);
    document.getElementById("player-favourites")?.scrollIntoView({ behavior: "smooth" });
  };
  const menuProducts = (categoryName?: string) => {
    const matchingProducts = categoryName
      ? products.filter((product) => product.category.toLowerCase() === categoryName.toLowerCase())
      : products;
    return matchingProducts.slice(0, 3);
  };
  const renderMenuProducts = (categoryName?: string) => {
    const picks = menuProducts(categoryName);
    if (picks.length === 0) {
      const category = categories.find((item) => item.name === categoryName);
      return (
        <div className="ar-mega-empty-card">
          <img src={category?.image ?? categories[0].image} alt="" />
          <span>{categoryName ? `MADE FOR ${categoryName.toUpperCase()}` : "MADE FOR YOUR GAME"}</span>
          <strong>Find your next favourite.</strong>
          <button type="button" onClick={() => { closeNavDropdowns(); setMenuOpen(false); document.querySelector(".ar-categories")?.scrollIntoView({ behavior: "smooth" }); }}>EXPLORE THE SPORTS <ArrowRight size={13} /></button>
        </div>
      );
    }

    return (
      <div className="ar-mega-product-grid">
        {picks.map((product) => (
          <article className="ar-mega-product" key={product.id}>
            <button className="ar-mega-product-image" type="button" onClick={() => viewProduct(product)} aria-label={`View details for ${product.name}`}>
              {product.image ? <img src={product.image} alt={product.name} /> : <span>AL RAED</span>}
              <span className={`ar-mega-stock ${product.stock > 0 ? "is-available" : ""}`}>{product.stock > 0 ? (product.stock < 4 ? `ONLY ${product.stock} LEFT` : "IN STOCK") : "SOLD OUT"}</span>
            </button>
            <small>{product.brand || "AL RAED SPORTS"}</small>
            <strong>{product.name}</strong>
            <div><span>{money(product.price)}</span><button type="button" onClick={() => addToCart(product)} disabled={product.stock < 1} aria-label={`Add ${product.name} to bag`}><Plus size={14} /></button></div>
          </article>
        ))}
      </div>
    );
  };

  const handleStripeCheckout = async () => {
    setCheckoutBusy(true);
    setCheckoutError("");
    try {
      await startStripeCheckout(cart, (href) => router.push(href));
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Unable to start secure checkout.");
      setCheckoutBusy(false);
    }
  };

  const campaign = campaigns[campaignIndex];
  const showCampaign = (nextIndex: number) => {
    if (nextIndex === campaignIndex) return;
    setCampaignIndex(nextIndex);
  };
  const productList = query || activeCategory !== "All" ? filteredProducts : newArrivals;
  const productHeading = query ? "Search results" : activeCategory === "All" ? "Just landed" : `${activeCategory} essentials`;

  return (
    <main className="ar-store">
      <div className="ar-announcement" aria-live="polite">
        <button type="button" aria-label="Previous announcement" onClick={() => setAnnouncementIndex((index) => (index + 2) % 3)}><ArrowLeft size={14} /></button>
        <p>{[
          <>MADE FOR THE UAE <span>·</span> FREE DELIVERY ON ORDERS OVER AED 200</>,
          <>YOUR GAME, DELIVERED <span>·</span> QUICK UAE-WIDE SHIPPING</>,
          <>NEED A HAND? <span>·</span> OUR TEAM KNOWS THEIR RACQUETS</>,
        ][announcementIndex]}</p>
        <button type="button" aria-label="Next announcement" onClick={() => setAnnouncementIndex((index) => (index + 1) % 3)}><ArrowRight size={14} /></button>
      </div>

      <header className="ar-header">
        <button className="ar-mobile-menu" type="button" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        <Link className="ar-wordmark" href="/" aria-label="Al Raed Sports home"><img className="ar-brand-logo" src="/IMG_8477.jpg%2010-33-16-710.jpg" alt="" /><span>AL RAED<small>SPORTS</small></span></Link>
        <nav className={`ar-nav ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation" ref={navRef}>
          <details className="ar-nav-dropdown ar-shop-dropdown" onMouseEnter={openNavDropdownOnHover} onMouseLeave={closeNavDropdownOnLeave}>
            <summary>SHOP <ChevronDown size={13} /></summary>
            <div className="ar-mega-menu ar-shop-mega">
              <div className="ar-mega-links"><small>FIND YOUR GAME</small><button type="button" onClick={() => selectCategory("All")}>Shop everything <ArrowRight size={14} /></button>{categories.map((category) => <button type="button" key={category.name} onClick={() => selectCategory(category.name)}>{category.name}<ArrowRight size={14} /></button>)}<span>PLAYER-APPROVED PICKS, RIGHT HERE IN THE UAE.</span></div>
              <div className="ar-mega-showcase"><div className="ar-mega-showcase-heading"><Sparkles size={15} /><span>{products.length ? "IN THE SHOP RIGHT NOW" : "CURATED FOR THE COURT"}</span></div>{renderMenuProducts()}</div>
            </div>
          </details>
          {categories.map((category) => <details className="ar-nav-dropdown ar-category-dropdown" key={category.name} onMouseEnter={openNavDropdownOnHover} onMouseLeave={closeNavDropdownOnLeave}>
            <summary>{category.name.toUpperCase()}<ChevronDown size={12} /></summary>
            <div className="ar-mega-menu ar-category-mega">
              <div className="ar-mega-links"><small>EXPLORE {category.name.toUpperCase()}</small><button type="button" onClick={() => selectCategory(category.name)}>Shop all {category.name.toLowerCase()} <ArrowRight size={14} /></button><button type="button" onClick={openFavourites}>Player favourites <ArrowRight size={14} /></button><button type="button" onClick={() => { closeNavDropdowns(); setMenuOpen(false); document.querySelector(".ar-categories")?.scrollIntoView({ behavior: "smooth" }); }}>Explore every sport <ArrowRight size={14} /></button><span>{category.note.toUpperCase()} · SELECTED FOR YOUR GAME</span></div>
              <div className="ar-mega-showcase"><div className="ar-mega-showcase-heading"><Sparkles size={15} /><span>{menuProducts(category.name).length ? "IN STOCK & READY TO PLAY" : "A FEW COURT-SIDE IDEAS"}</span></div>{renderMenuProducts(category.name)}</div>
            </div>
          </details>)}
          <a href="#new-season" onClick={() => setMenuOpen(false)}>OUR STORY</a>
        </nav>
        <div className="ar-header-actions">
          <form className={`ar-search ${searchOpen ? "is-open" : ""}`} role="search" onSubmit={(event) => { event.preventDefault(); setSearchOpen(false); router.push(query.trim() ? `/shop?q=${encodeURIComponent(query.trim())}` : "/shop"); }}>
            <button className="ar-search-trigger" type="button" aria-label="Search products" aria-expanded={searchOpen} onClick={() => setSearchOpen((open) => !open)}><Search size={17} /></button>
            <input ref={searchRef} type="search" placeholder="Find your next favourite" aria-label="Search products" value={query} onFocus={() => setSearchOpen(true)} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setSearchOpen(false); }} />
            {query && <button className="ar-clear-search" type="button" aria-label="Clear search" onClick={() => { setQuery(""); searchRef.current?.focus(); }}><X size={14} /></button>}
            {searchOpen && suggestions.length > 0 && <div className="ar-search-results">{suggestions.map((product) => <button type="button" key={product.id} onClick={() => viewProduct(product)}><span>{product.name}</span><small>{product.brand} · VIEW DETAILS</small></button>)}</div>}
          </form>
          <Link className="ar-account" href="/account" aria-label="My account"><span>MY ACCOUNT</span><ArrowUpRight className="ar-account-desktop-icon" size={17} /><UserRound className="ar-account-mobile-icon" size={18} aria-hidden="true" /></Link>
          <button className="ar-bag-button" type="button" onClick={() => setCartOpen(true)} aria-label={`Open shopping bag, ${cartCount} items`}><ShoppingBag size={19} /><span>BAG</span><b>{cartCount}</b></button>
        </div>
      </header>

      <div className="ar-subnav" aria-label="Shop links"><span>THE UAE&apos;S HOME FOR RACQUET SPORTS</span><a href="#service">SHOP WITH CONFIDENCE <ArrowUpRight size={12} /></a></div>

      <aside className="ar-preview-notice" aria-label="Website development status">
        <span className="ar-preview-label">DEVELOPMENT PREVIEW</span>
        <h2>THIS WEBSITE IS UNDER DEVELOPMENT</h2>
        <p>Products, options and checkout are for demonstration only. Orders and payments are not currently being processed.</p>
      </aside>

      <section className="ar-hero" data-campaign-layout={campaign.layout ?? "standard"} aria-label="Featured campaign">
        <img key={campaign.image} className={`ar-hero-image${campaign.layout ? ` ar-hero-image-${campaign.layout}` : ""}`} src={campaign.image} alt="" />
        <div className="ar-hero-shade" />
        <div className="ar-hero-copy" key={campaignIndex}>
          <p className="ar-eyebrow"><span /> {campaign.eyebrow}</p>
          <h1>{campaign.title}</h1>
          <p className="ar-hero-description">{campaign.description}</p>
          <Link className="ar-button ar-button-light" href={campaign.href ?? "/shop"}>{campaign.cta}<ArrowRight size={16} /></Link>
        </div>
        <div className="ar-hero-controls" aria-label="Campaign slides">{campaigns.map((item, index) => <button className={index === campaignIndex ? "is-active" : ""} type="button" key={item.eyebrow} aria-label={`Show campaign ${index + 1} of ${campaigns.length}`} aria-pressed={index === campaignIndex} onClick={() => showCampaign(index)} />)}</div>
        <a className="ar-hero-scroll" href="#service"><ArrowDown size={14} /> SCROLL TO EXPLORE</a>
      </section>

      <section className="ar-service-strip" id="service" aria-label="Shopping benefits">
        <div><span>01</span><div><strong>MADE FOR THE UAE</strong><small>Local know-how, local support</small></div></div>
        <div><span>02</span><div><strong>REAL PLAYER ADVICE</strong><small>We play. We get it.</small></div></div>
        <div><span>03</span><div><strong>SECURE CHECKOUT</strong><small>Shop with confidence</small></div></div>
        <div><span>04</span><div><strong>READY WHEN YOU ARE</strong><small>Fast delivery across the UAE</small></div></div>
      </section>

      <section className="ar-categories ar-section">
        <div className="ar-section-heading"><div><p className="ar-eyebrow">PICK YOUR PLAY</p><h2>Every game<br />has its <em>gear.</em></h2></div><p className="ar-section-note">Whether it&apos;s your first rally or your thousandth, start with the good stuff.</p></div>
        <div className="ar-category-grid">{categories.map((category, index) => <button className={`ar-category-card${category.name === "Badminton" ? " is-badminton" : ""}`} type="button" key={category.name} onClick={() => selectCategory(category.name)}>
          <img src={category.image} alt="" loading="lazy" /><span className="ar-category-index">0{index + 1}</span><span className="ar-category-copy"><small>{category.note}</small><strong>{category.name}</strong></span><span className="ar-category-arrow"><ArrowUpRight size={18} /></span>
        </button>)}</div>
      </section>

      <ScrollFilm
        src="/animation3.mp4"
        eyebrow="VICTOR · YONEX · MADE FOR YOUR GAME"
        title={<>Choose your<br /><em>weapon.</em></>}
        description="Every rally starts somewhere. Explore performance racquets and court shoes from the brands players trust."
        sectionLabel="Choose your equipment"
        ctaLabel="FIND YOUR NEXT RACQUET"
        ctaHref="/shop?category=Badminton"
        mobileSrc="/animation3-mobile.mp4"
      />

      <AthleteShowcase onBrowse={() => selectCategory("Badminton")} />

      <section className="ar-products-section ar-section" id="shop-the-game">
        <div className="ar-products-top">
          <div><p className="ar-eyebrow">{query ? "A GOOD PLACE TO START" : "FRESH FROM THE COURT"}</p><h2>{productHeading}<span className="ar-heading-star">✳</span></h2></div>
          <div className="ar-product-controls"><div className="ar-filter-tabs" aria-label="Filter products by sport">{["All", "Badminton", "Tennis", "Squash", "Accessories"].map((category) => <button className={activeCategory === category ? "is-active" : ""} key={category} type="button" aria-pressed={activeCategory === category} onClick={() => { setActiveCategory(category); setQuery(""); }}>{category}</button>)}</div><div className="ar-rail-buttons"><button type="button" aria-label="Scroll products left" onClick={() => scrollRail("left")}><ChevronLeft size={18} /></button><button type="button" aria-label="Scroll products right" onClick={() => scrollRail("right")}><ChevronRight size={18} /></button></div></div>
        </div>
        {catalogState === "loading" ? <div className="ar-status"><span className="ar-loader" />Finding your next favourite…</div> : catalogState === "error" ? <div className="ar-status ar-status-error" role="alert"><strong>We couldn&apos;t reach the shop right now.</strong><span>{catalogError}</span><button type="button" onClick={() => window.location.reload()}>TRY AGAIN <ArrowRight size={14} /></button></div> : productList.length === 0 ? <div className="ar-status">No products match this search just yet. Try another sport or search term.</div> : <div className="ar-product-rail" ref={railRef}>{productList.map((product) => <ProductTile key={product.id} product={product} liked={wishlist.includes(product.id)} onLike={toggleWishlist} onAdd={addToCart} onView={viewProduct} added={justAdded.includes(product.id)} />)}</div>}
        <div className="ar-products-foot"><span>MADE FOR THE MATCH. AND EVERYTHING BEFORE IT.</span></div>
      </section>

      <ScrollFilm
        src="/animation2.mp4"
        eyebrow="THE NEXT RALLY"
        title={<>Find your<br /><em>edge.</em></>}
        description="Scroll through the motion and discover equipment made for your most committed moments."
        sectionLabel="Find your edge"
        ctaLabel="EXPLORE ALL GEAR"
        ctaHref="/shop"
        mobileSrc="/animation2-mobile.mp4"
        align="right"
      />

      <section className="ar-editorial" id="new-season">
        <div className="ar-editorial-photo"><img src="https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=1800&q=90" alt="A badminton player reaching for a shot on court" loading="lazy" /><span>YOUR GAME<br />IS A GOOD<br />PLACE TO BE.</span></div>
        <div className="ar-editorial-copy"><p className="ar-eyebrow">MORE THAN A SHOP</p><h2>We know<br />that <em>feeling.</em></h2><p>That first clean hit. One more game after the sun goes down. The kit that just feels right. Al Raed is here for the love of the rally—wherever you&apos;re starting, and wherever you&apos;re headed.</p><Link className="ar-button ar-button-outline" href="#ar-store-list">FIND A STORE <ArrowUpRight size={16} /></Link><span className="ar-editorial-mark">SINCE DAY ONE <i>✳</i></span></div>
      </section>

      <section className="ar-bestsellers ar-section" id="player-favourites">
        <div className="ar-section-heading"><div><p className="ar-eyebrow">THE COURT&apos;S FAVOURITES</p><h2>Player <em>approved.</em></h2></div><Link className="ar-text-link" href="/shop">SHOP ALL GEAR <ArrowRight size={16} /></Link></div>
        <div className="ar-best-grid">{bestSellers.slice(0, 4).map((product) => <ProductTile key={product.id} product={product} liked={wishlist.includes(product.id)} onLike={toggleWishlist} onAdd={addToCart} onView={viewProduct} added={justAdded.includes(product.id)} />)}</div>
      </section>

      <section className="ar-store-visit" aria-labelledby="ar-store-visit-title">
        <div className="ar-store-visit-intro">
          <p className="ar-eyebrow">TRY IT IN PERSON</p>
          <h2 id="ar-store-visit-title">Feel the<br /><em>difference.</em></h2>
          <p>Not sure which racquet is right for your game? Visit one of our stores, pick up the latest gear and get closer to your next best match.</p>
          <a className="ar-button ar-button-light" href="#ar-store-list">FIND A STORE <ArrowRight size={16} /></a>
        </div>
        <div className="ar-store-list" id="ar-store-list">
          <a className="ar-store-card" href="https://www.google.com/maps/search/?api=1&query=Al+Raed+Sports+Madinat+Zayed" target="_blank" rel="noreferrer">
            <span className="ar-store-number">01</span><div><MapPin size={18} /><h3>Al Raed Sports<br />Madinat Zayed</h3><p>United Arab Emirates <ArrowRight size={14} /></p></div>
          </a>
          <a className="ar-store-card" href="https://www.google.com/maps/search/?api=1&query=Alraed+Sports+Shop+UAE" target="_blank" rel="noreferrer">
            <span className="ar-store-number">02</span><div><MapPin size={18} /><h3>Alraed Sports<br />Shop</h3><p>United Arab Emirates <ArrowRight size={14} /></p></div>
          </a>
          <a className="ar-store-card" href="https://www.google.com/maps/search/?api=1&query=Yonex+Store+Bahrain" target="_blank" rel="noreferrer">
            <span className="ar-store-number">03</span><div><MapPin size={18} /><h3>Yonex Store<br />Bahrain</h3><p>Kingdom of Bahrain <ArrowRight size={14} /></p></div>
          </a>
        </div>
      </section>

      <section className="ar-brands ar-section" aria-labelledby="ar-brands-title">
        <div className="ar-section-heading">
          <div><p className="ar-eyebrow">TRUSTED BY PLAYERS</p><h2 id="ar-brands-title">Brands that<br /><em>move with you.</em></h2></div>
          <Link className="ar-text-link" href="/shop">ALL BRANDS <ArrowRight size={16} /></Link>
        </div>
        <div className="ar-brand-list" aria-label="Featured brands">
          <div className="ar-brand-list-track">
            <div className="ar-brand-list-group">
              {["YONEX", "LI-NING", "VICTOR", "APACS", "WILSON", "HEAD", "ADIDAS"].map((brand) => <Link key={brand} href={`/shop?q=${encodeURIComponent(brand)}`}>{brand}</Link>)}
            </div>
            <div className="ar-brand-list-group" aria-hidden="true">
              {["YONEX", "LI-NING", "VICTOR", "APACS", "WILSON", "HEAD", "ADIDAS"].map((brand) => <span key={brand}>{brand}</span>)}
            </div>
          </div>
        </div>
        <div className="ar-brand-marquee" aria-label="Racquets, court shoes, strings and grips, player apparel, pickleball paddles, pickleballs, court bags, training essentials">
          <div className="ar-brand-marquee-track">
            {[0, 1].map((copy) => <div className="ar-brand-marquee-group" aria-hidden={copy === 1} key={copy}>
              {["RACQUETS", "COURT SHOES", "STRINGS & GRIPS", "PLAYER APPAREL", "PICKLEBALL PADDLES", "PICKLEBALLS", "COURT BAGS", "TRAINING ESSENTIALS"].map((item) => <span key={item}>{item}<i>✦</i></span>)}
            </div>)}
          </div>
        </div>
      </section>

      <footer className="ar-footer ar-footer-rich">
        <div className="ar-footer-brand">
          <Link className="ar-wordmark ar-footer-logo" href="/" aria-label="Al Raed Sports home"><img className="ar-brand-logo" src="/IMG_8477.jpg%2010-33-16-710.jpg" alt="" /><span>AL RAED<small>SPORTS</small></span></Link>
          <p>Premium sports equipment<br /><span>for the UAE in motion.</span></p>
          <nav className="ar-footer-socials" aria-label="Connect with Al Raed Sports">
            <a href="https://www.facebook.com/alraedsports/" target="_blank" rel="noreferrer" aria-label="Visit Al Raed Sports on Facebook">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 21v-8h2.7l.4-3.1h-3.1v-2c0-.9.3-1.6 1.6-1.6h1.7V3.5c-.3 0-1.4-.1-2.6-.1-2.6 0-4.4 1.6-4.4 4.5v2H7v3.1h2.8v8h3.7Z" fill="currentColor" /></svg>
            </a>
            <a href="https://www.instagram.com/al_raed_sports/?hl=en" target="_blank" rel="noreferrer" aria-label="Visit Al Raed Sports on Instagram">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="17.6" cy="6.7" r="1.1" fill="currentColor" /></svg>
            </a>
            <a className="ar-footer-whatsapp" href={footerWhatsAppUrl} target="_blank" rel="noreferrer" aria-label="Reach Al Raed Sports on WhatsApp">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 11.7a8.2 8.2 0 0 1-12.1 7.2L3 20l1.2-5a8.2 8.2 0 1 1 16-3.3Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M8.4 8.2c.2-.5.5-.5.8-.5h.5c.2 0 .4.1.5.4l.7 1.6c.1.2.1.4-.1.6l-.5.6c-.2.2-.2.4 0 .7.7 1.1 1.5 1.8 2.7 2.4.3.1.5.1.7-.1l.7-.8c.2-.2.4-.3.7-.2l1.6.8c.3.1.4.3.4.5 0 .4-.2 1.2-.7 1.6-.5.4-1.1.6-1.8.5-1-.2-2.2-.6-3.8-1.7-1.3-.9-2.2-2-2.8-3.2-.6-1.2-.6-2.1-.4-2.7.2-.3.5-.7.8-.9Z" fill="currentColor" /></svg>
              <span>WHATSAPP</span>
            </a>
          </nav>
        </div>
        <nav className="ar-footer-column" aria-label="Shop links">
          <h3>SHOP</h3><Link href="/shop">All products</Link><Link href="/shop?category=Badminton">Badminton</Link><Link href="/shop?category=Tennis">Tennis</Link><Link href="/shop?category=Squash">Squash</Link>
        </nav>
        <nav className="ar-footer-column" aria-label="Equipment links">
          <h3>ESSENTIALS</h3><Link href="/shop?q=racquet">Racquets</Link><Link href="/shop?q=shoe">Court shoes</Link><Link href="/shop?q=grip">Strings &amp; grips</Link><Link href="/shop?q=apparel">Socks &amp; apparel</Link>
        </nav>
        <nav className="ar-footer-column" aria-label="More links">
          <h3>DISCOVER</h3><Link href="/shop">Shop all gear</Link><Link href="/account">Your account</Link><a href="#ar-store-list">Find a store</a><a href="https://alraedgroup.ae" target="_blank" rel="noreferrer">Al Raed Group</a>
        </nav>
        <div className="ar-footer-newsletter">
          <h3>STAY IN THE GAME</h3>
          <p>New drops, player edits and store news.</p>
          <Link href="/shop">EXPLORE THE LATEST <ArrowRight size={15} /></Link>
        </div>
        <div className="ar-copyright">
          <span>© {new Date().getFullYear()} AL RAED SPORTS</span><span>AN AL RAED GROUP OF COMPANIES BUSINESS</span><span>MADE FOR THE UAE</span>
        </div>
      </footer>

      <div className="ar-floating-actions" aria-label="Quick actions">
        <button className="ar-floating-button ar-floating-top" type="button" aria-label="Scroll to top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><ArrowUp size={15} /></button>
        <Link className="ar-floating-button ar-floating-shop" href="/shop" aria-label="Open shop"><ShoppingBag size={15} /></Link>
        <button className="ar-floating-button ar-floating-cart" type="button" onClick={() => setCartOpen(true)} aria-label={`Open shopping bag, ${cartCount} items`}><ShoppingCart size={15} />{cartCount > 0 && <b>{cartCount}</b>}</button>
      </div>

      <ProductDetailDialog key={selectedProduct?.id ?? "closed"} product={selectedProduct} onClose={() => setSelectedProduct(null)} onAdd={addProductDetailsToCart} />

      {cartOpen && <div className="ar-drawer-backdrop" onClick={() => setCartOpen(false)}>
        <aside className="ar-cart-drawer" role="dialog" aria-modal="true" aria-labelledby="ar-cart-title" onClick={(event) => event.stopPropagation()}>
          <div className="ar-cart-heading"><div><p className="ar-eyebrow">YOUR GAME, GATHERED</p><h2 id="ar-cart-title">Your bag <span>({cartCount})</span></h2></div><button type="button" aria-label="Close bag" onClick={() => setCartOpen(false)}><X /></button></div>
          {checkoutError && <p className="ar-shop-cart-error" role="alert">{checkoutError} <Link href="/account">My account</Link></p>}
          {cart.length === 0 ? <div className="ar-empty-cart"><ShoppingBag size={30} /><strong>A little room for something good.</strong><p>Your bag is waiting for its first match-ready pick.</p><Link className="ar-button ar-button-light" href="/shop" onClick={() => setCartOpen(false)}>FIND YOUR GEAR <ArrowRight size={15} /></Link></div> : <>
            <div className="ar-cart-items">{cart.map((line) => {
              const { product, quantity, color, size } = line;
              const lineKey = getCartLineKey(line);
              return <article className="ar-cart-line" key={lineKey}><div className="ar-cart-image">{product.image && <img src={product.image} alt="" />}</div><div className="ar-cart-line-copy"><small>{product.brand}</small><strong>{product.name.replace(/^\[TEST\]\s*/, "")}</strong>{(color || size) && <span>{[color && `Color: ${color}`, size && `Size: ${size}`].filter(Boolean).join(" · ")}</span>}<span>{money(product.price)}</span><div className="ar-quantity"><button type="button" aria-label={`Remove one ${product.name}`} onClick={() => changeQuantity(lineKey, -1)}><Minus size={13} /></button><span>{quantity}</span><button type="button" aria-label={`Add one ${product.name}`} onClick={() => changeQuantity(lineKey, 1)} disabled={quantity >= Math.min(product.stock, 50)}><Plus size={13} /></button></div></div><button className="ar-remove-line" type="button" aria-label={`Remove ${product.name}`} onClick={() => setCart((items) => items.filter((item) => getCartLineKey(item) !== lineKey))}><X size={16} /></button></article>;
            })}</div>
            <div className="ar-cart-bottom"><div><span>SUBTOTAL</span><strong>{money(cartTotal)}</strong></div><small>Secure card checkout. Apple Pay appears automatically on supported devices.</small><button className="ar-button ar-button-light ar-checkout" type="button" onClick={() => void handleStripeCheckout()} disabled={checkoutBusy}>{checkoutBusy ? "OPENING SECURE CHECKOUT..." : "PROCEED TO PAYMENT"} <ArrowRight size={16} /></button></div>
          </>}
        </aside>
      </div>}
    </main>
  );
}
