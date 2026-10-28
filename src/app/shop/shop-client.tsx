"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  Filter,
  Heart,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  X,
} from "lucide-react";
import ProductDetailDialog from "@/components/storefront/ProductDetailDialog";
import { getBrandOptions, getCartLineKey, hasProductOptions, isFootwearProduct, mapStoreProduct, normalizeBrand, type CartLine, type StoreProduct } from "@/lib/store-products";
import { startStripeCheckout } from "@/lib/start-checkout";

const categories = ["All", "Badminton", "Tennis", "Squash", "Pickleball", "Accessories"];
const cartKey = "alraed-storefront-cart";

const money = (amount: number) =>
  new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 2 }).format(amount);

function getProductType(product: StoreProduct) {
  if (product.productType === "shoe") return "Court shoes";
  if (product.productType === "racquet") return "Racquets";
  const name = product.name.toLowerCase();
  if (/racket|racquet/.test(name)) return "Racquets";
  if (/shoe|sneaker/.test(name)) return "Court shoes";
  if (/bag|backpack|duffel|cover/.test(name)) return "Bags & covers";
  if (/shuttlecock|ball/.test(name)) return "Balls & shuttles";
  if (/grip|wristband|sock|towel|bottle/.test(name)) return "Training accessories";
  return "Other essentials";
}

function validCart(value: unknown): value is CartLine[] {
  if (!Array.isArray(value)) return false;
  return value.every((line) => {
    if (!line || typeof line !== "object" || !("product" in line) || !("quantity" in line)) return false;
    const entry = line as { product: Partial<StoreProduct>; quantity: unknown; color?: unknown; size?: unknown };
    return Number.isSafeInteger(entry.product.id)
      && typeof entry.product.name === "string"
      && typeof entry.product.brand === "string"
      && typeof entry.product.category === "string"
      && typeof entry.product.price === "number"
      && typeof entry.product.image === "string"
      && (entry.product.productType === undefined || entry.product.productType === "shoe" || entry.product.productType === "racquet" || entry.product.productType === "other")
      && (entry.product.sizeCategory === undefined || entry.product.sizeCategory === null || entry.product.sizeCategory === "mens" || entry.product.sizeCategory === "womens" || entry.product.sizeCategory === "kids")
      && (entry.product.colors === undefined || (Array.isArray(entry.product.colors) && entry.product.colors.every((color) => typeof color === "string")))
      && (entry.product.sizes === undefined || (Array.isArray(entry.product.sizes) && entry.product.sizes.every((size) => typeof size === "string")))
      && (entry.product.unavailableSizes === undefined || (Array.isArray(entry.product.unavailableSizes) && entry.product.unavailableSizes.every((size) => typeof size === "string")))
      && (entry.color === undefined || typeof entry.color === "string")
      && (entry.size === undefined || typeof entry.size === "string")
      && Number.isSafeInteger(entry.quantity)
      && Number(entry.quantity) > 0;
  });
}

function readCart() {
  const stored = window.localStorage.getItem(cartKey);
  if (!stored) return [];
  const parsed: unknown = JSON.parse(stored);
  if (!validCart(parsed)) throw new Error("Your saved bag could not be read. Clear the saved bag and try again.");
  return parsed.map((line) => ({
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
  }));
}

function ShopProductCard({
  product,
  onView,
  onAdd,
  added,
  liked,
  onLike,
}: {
  product: StoreProduct;
  onView: (product: StoreProduct) => void;
  onAdd: (product: StoreProduct) => void;
  added: boolean;
  liked: boolean;
  onLike: (id: number) => void;
}) {
  return (
    <article className="ar-shop-product">
      <div className="ar-shop-product-image">
        <button type="button" className="ar-shop-product-open" onClick={() => onView(product)} aria-label={`View ${product.name} details`}>
          {product.image ? <img src={product.image} alt={product.name} loading="lazy" /> : <span className="ar-product-placeholder">AL RAED<br />SPORTS</span>}
        </button>
        {product.stock > 0 && product.stock < 4 && <span className="ar-shop-stock-badge">ONLY {product.stock} LEFT</span>}
        <button className={`ar-shop-wishlist ${liked ? "is-liked" : ""}`} type="button" onClick={() => onLike(product.id)} aria-label={`${liked ? "Remove" : "Add"} ${product.name} ${liked ? "from" : "to"} wishlist`}>
          <Heart size={17} fill={liked ? "currentColor" : "none"} />
        </button>
        <button className="ar-shop-quick-add" type="button" onClick={() => onAdd(product)} disabled={product.stock < 1}>
          {product.stock < 1 ? "SOLD OUT" : added ? <><Check size={14} /> ADDED TO BAG</> : hasProductOptions(product) ? <>CHOOSE OPTIONS <Plus size={14} /></> : <>QUICK ADD <Plus size={14} /></>}
        </button>
      </div>
      <div className="ar-shop-product-copy">
        <div className="ar-shop-product-meta"><span>{product.brand || "AL RAED SPORTS"}</span><span>{getProductType(product)}</span></div>
        <button className="ar-shop-product-title" type="button" onClick={() => onView(product)}>{product.name.replace(/^\[TEST\]\s*/, "")}</button>
        <div className="ar-shop-product-bottom"><strong>{money(product.price)}</strong><span>{product.stock > 0 ? "IN STOCK" : "SOLD OUT"}</span></div>
      </div>
    </article>
  );
}

export default function ShopClient({ initialCategory, initialQuery }: { initialCategory: string; initialQuery: string }) {
  const router = useRouter();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "error">("loading");
  const [catalogError, setCatalogError] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [query, setQuery] = useState(initialQuery);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [showOutOfStock, setShowOutOfStock] = useState(false);
  const [minimumPrice, setMinimumPrice] = useState("");
  const [maximumPrice, setMaximumPrice] = useState("");
  const [sort, setSort] = useState("featured");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<StoreProduct | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartError, setCartError] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [addedIds, setAddedIds] = useState<number[]>([]);
  const [wishlist, setWishlist] = useState<number[]>([]);
  const [notice, setNotice] = useState("");

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
        const savedWishlist = window.localStorage.getItem("alraed-storefront-wishlist");
        if (savedWishlist) {
          const parsed: unknown = JSON.parse(savedWishlist);
          if (Array.isArray(parsed) && parsed.every((id) => Number.isSafeInteger(id) && id > 0)) setWishlist(parsed);
        }
        setCart(readCart());
      } catch (error) {
        setCartError(error instanceof Error ? error.message : "Your saved bag could not be loaded.");
      }
    });
    return () => {
      active = false;
      window.clearTimeout(restoreTimer);
    };
  }, []);

  useEffect(() => {
    const synchronizeCart = () => {
      try {
        setCart(readCart());
        setCartError("");
      } catch (error) {
        setCartError(error instanceof Error ? error.message : "Your saved bag could not be loaded.");
      }
    };
    window.addEventListener("storage", synchronizeCart);
    window.addEventListener("alraed-cart-update", synchronizeCart);
    return () => {
      window.removeEventListener("storage", synchronizeCart);
      window.removeEventListener("alraed-cart-update", synchronizeCart);
    };
  }, []);

  useEffect(() => {
    if (!cartOpen && !filtersOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCartOpen(false);
        setFiltersOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [cartOpen, filtersOpen]);

  const typeOptions = useMemo(() => {
    const categoryProducts = products.filter((product) => category === "All" || product.category === category);
    const counts = new Map<string, number>();
    categoryProducts.forEach((product) => {
      const type = getProductType(product);
      counts.set(type, (counts.get(type) ?? 0) + 1);
    });
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [products, category]);

  const brandOptions = useMemo(() => {
    return getBrandOptions(products, category);
  }, [products, category]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const minimum = minimumPrice === "" ? 0 : Number(minimumPrice);
    const maximum = maximumPrice === "" ? Number.POSITIVE_INFINITY : Number(maximumPrice);
    const filtered = products.filter((product) => {
      const matchesCategory = category === "All" || product.category === category;
      const matchesSearch = !normalizedQuery || `${product.name} ${product.brand} ${product.category} ${getProductType(product)}`.toLowerCase().includes(normalizedQuery);
      const matchesType = selectedTypes.length === 0 || selectedTypes.includes(getProductType(product));
      const matchesBrand = selectedBrands.length === 0 || selectedBrands.includes(normalizeBrand(product.brand || "AL RAED SPORTS"));
      const matchesStock = showOutOfStock || product.stock > 0;
      return matchesCategory && matchesSearch && matchesType && matchesBrand && matchesStock && product.price >= minimum && product.price <= maximum;
    });
    if (sort === "price-low") return filtered.sort((a, b) => a.price - b.price);
    if (sort === "price-high") return filtered.sort((a, b) => b.price - a.price);
    if (sort === "name") return filtered.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "stock") return filtered.sort((a, b) => b.stock - a.stock);
    return filtered;
  }, [products, category, query, selectedTypes, selectedBrands, showOutOfStock, minimumPrice, maximumPrice, sort]);

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  const categoryLabel = category === "All" ? "Shop all gear" : `${category} equipment`;
  const activeFilterCount = selectedTypes.length + selectedBrands.length + (showOutOfStock ? 1 : 0) + (minimumPrice !== "" || maximumPrice !== "" ? 1 : 0);

  const persistCart = useCallback((nextCart: CartLine[]) => {
    try {
      window.localStorage.setItem(cartKey, JSON.stringify(nextCart));
      setCart(nextCart);
      setCartError("");
      window.dispatchEvent(new Event("alraed-cart-update"));
      return true;
    } catch {
      setCartError("Your bag could not be saved. Check your browser storage settings and try again.");
      return false;
    }
  }, []);

  const addToCart = useCallback((product: StoreProduct, quantity = 1, options: { color?: string; size?: string } = {}) => {
    if (product.stock < 1) return false;
    if ((product.colors.length > 0 && !options.color)
      || ((product.sizes.length > 0 || isFootwearProduct(product)) && !options.size)) return false;
    let currentCart: CartLine[];
    try {
      currentCart = readCart();
    } catch (error) {
      setCartError(error instanceof Error ? error.message : "Your saved bag could not be read.");
      return false;
    }
    const newLine = { product, quantity: Math.min(quantity, product.stock, 50), ...options };
    const newLineKey = getCartLineKey(newLine);
    const existing = currentCart.find((line) => getCartLineKey(line) === newLineKey);
    const otherVariantQuantity = currentCart.reduce((total, line) => (
      line.product.id === product.id && getCartLineKey(line) !== newLineKey ? total + line.quantity : total
    ), 0);
    const availableForVariant = Math.min(Math.max(0, product.stock - otherVariantQuantity), 50);
    if (availableForVariant < 1) return false;
    const nextCart = existing
      ? currentCart.map((line) => getCartLineKey(line) === newLineKey
        ? { ...line, product, quantity: Math.min(line.quantity + quantity, availableForVariant) }
        : line)
      : [...currentCart, { ...newLine, quantity: Math.min(quantity, availableForVariant) }];
    if (!persistCart(nextCart)) return false;
    setAddedIds((current) => [...current.filter((id) => id !== product.id), product.id]);
    setNotice(`${product.name.replace(/^\[TEST\]\s*/, "")} added to your bag`);
    window.setTimeout(() => {
      setAddedIds((current) => current.filter((id) => id !== product.id));
      setNotice("");
    }, 1800);
    return true;
  }, [persistCart]);

  const changeQuantity = (lineKey: string, delta: number) => {
    const nextCart = cart.flatMap((line) => {
      if (getCartLineKey(line) !== lineKey) return [line];
      const otherVariantQuantity = cart.reduce((total, otherLine) => (
        otherLine.product.id === line.product.id && getCartLineKey(otherLine) !== lineKey ? total + otherLine.quantity : total
      ), 0);
      const maximum = Math.min(Math.max(0, line.product.stock - otherVariantQuantity), 50);
      const quantity = Math.min(line.quantity + delta, maximum);
      if (quantity > 0) return [{ ...line, quantity }];
      return delta < 0 ? [] : [line];
    });
    persistCart(nextCart);
  };

  const clearFilters = () => {
    setSelectedTypes([]);
    setSelectedBrands([]);
    setShowOutOfStock(false);
    setMinimumPrice("");
    setMaximumPrice("");
    setQuery("");
  };

  const updateCategory = (nextCategory: string) => {
    setCategory(nextCategory);
    setSelectedTypes([]);
    const url = new URL(window.location.href);
    if (nextCategory === "All") url.searchParams.delete("category");
    else url.searchParams.set("category", nextCategory);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  };

  const toggleValue = (value: string, values: string[], update: (values: string[]) => void) => {
    update(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  };

  const checkout = async () => {
    setCheckoutBusy(true);
    setCheckoutError("");
    try {
      await startStripeCheckout(cart, (href) => router.push(href));
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Unable to start secure checkout.");
      setCheckoutBusy(false);
    }
  };

  return (
    <main className="ar-store ar-shop-page">
      <div className="ar-announcement"><span>MADE FOR THE UAE</span><span>·</span><span>FREE DELIVERY ON ORDERS OVER AED 200</span></div>
      <header className="ar-header ar-shop-header">
        <Link className="ar-wordmark" href="/" aria-label="Al Raed Sports home"><img className="ar-brand-logo" src="/IMG_8477.jpg%2010-33-16-710.jpg" alt="" /><span>AL RAED<small>SPORTS</small></span></Link>
        <div className="ar-shop-header-actions">
          <Link className="ar-shop-home-link" href="/"><ArrowLeft size={14} /><span>HOME</span></Link>
          <button className="ar-bag-button" type="button" onClick={() => setCartOpen(true)} aria-label={`Open shopping bag, ${cartCount} items`}>
            <ShoppingBag size={19} /><span>BAG</span><span className="ar-bag-count">{cartCount}</span>
          </button>
        </div>
      </header>

      <div className="ar-shop-intro">
        <div className="ar-shop-breadcrumb"><Link href="/">HOME</Link><span>/</span><span>SHOP</span>{category !== "All" && <><span>/</span><span>{category.toUpperCase()}</span></>}</div>
        <div className="ar-shop-title-row">
          <div><p className="ar-eyebrow">FIND YOUR NEXT FAVOURITE</p><h1>{categoryLabel}<span>✳</span></h1><p className="ar-shop-subtitle">Good gear for the games you love. Find your next court-side favourite.</p></div>
          <div className="ar-shop-count"><strong>{filteredProducts.length}</strong><span>{filteredProducts.length === 1 ? "PRODUCT" : "PRODUCTS"}</span></div>
        </div>
        <div className="ar-shop-category-tabs" aria-label="Filter by sport">
          {categories.map((item) => <button type="button" className={category === item ? "is-active" : ""} aria-pressed={category === item} onClick={() => updateCategory(item)} key={item}>{item === "All" ? "ALL GEAR" : item}</button>)}
        </div>
      </div>

      <div className="ar-shop-layout">
        <div className={`ar-shop-mobile-filter-backdrop ${filtersOpen ? "is-open" : ""}`} onClick={() => setFiltersOpen(false)} />
        <aside className={`ar-shop-sidebar ${filtersOpen ? "is-open" : ""}`} aria-label="Product filters">
          <div className="ar-shop-sidebar-heading"><div><SlidersHorizontal size={15} /><strong>FILTER & REFINE</strong></div><button type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)}><X size={18} /></button></div>
          {(selectedTypes.length > 0 || selectedBrands.length > 0 || showOutOfStock || minimumPrice || maximumPrice) && <button className="ar-shop-clear" type="button" onClick={clearFilters}>CLEAR ALL FILTERS <X size={12} /></button>}
          <details className="ar-shop-filter-group" open>
            <summary>Product type <ChevronDown size={14} /></summary>
            <div className="ar-shop-filter-options">{typeOptions.map(([type, count]) => (
              <label key={type}><input type="checkbox" checked={selectedTypes.includes(type)} onChange={() => toggleValue(type, selectedTypes, setSelectedTypes)} /><span>{type}</span><small>{count}</small></label>
            ))}</div>
          </details>
          <details className="ar-shop-filter-group" open>
            <summary>Availability <ChevronDown size={14} /></summary>
            <label className="ar-shop-toggle"><input type="checkbox" checked={showOutOfStock} onChange={(event) => setShowOutOfStock(event.target.checked)} /><span>Show out of stock</span></label>
          </details>
          <details className="ar-shop-filter-group" open>
            <summary>Price <ChevronDown size={14} /></summary>
            <div className="ar-shop-price-fields">
              <label><span>MIN AED</span><input type="number" min="0" inputMode="numeric" placeholder="0" value={minimumPrice} onChange={(event) => setMinimumPrice(event.target.value)} aria-label="Minimum price in AED" /></label>
              <span>—</span>
              <label><span>MAX AED</span><input type="number" min="0" inputMode="numeric" placeholder="Any" value={maximumPrice} onChange={(event) => setMaximumPrice(event.target.value)} aria-label="Maximum price in AED" /></label>
            </div>
          </details>
          <details className="ar-shop-filter-group" open>
            <summary>Brand <ChevronDown size={14} /></summary>
            <div className="ar-shop-filter-options">{brandOptions.map(([brandKey, brand, count]) => (
              <label key={brandKey}><input type="checkbox" checked={selectedBrands.includes(brandKey)} onChange={() => toggleValue(brandKey, selectedBrands, setSelectedBrands)} /><span>{brand}</span><small>{count}</small></label>
            ))}</div>
          </details>
          <div className="ar-shop-sidebar-note"><span>✳</span><p>Chosen for the court.<br />Ready for your next game.</p></div>
        </aside>

        <section className="ar-shop-results" aria-label="Shop products">
          <div className="ar-shop-toolbar">
            <button className="ar-shop-filter-trigger" type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)}>
              <Filter size={15} /> FILTER {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
            </button>
            <label className="ar-shop-search"><Search size={15} /><input type="search" placeholder="Search products" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search products" />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X size={13} /></button>}</label>
            <label className="ar-shop-sort"><span>SORT BY</span><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort products">
              <option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name</option><option value="stock">Availability</option>
            </select><ChevronDown size={14} /></label>
          </div>

          {catalogState === "loading" ? <div className="ar-shop-state"><span className="ar-loader" /><p>Finding your next favourite…</p></div>
            : catalogState === "error" ? <div className="ar-shop-state ar-shop-error" role="alert"><strong>We couldn&apos;t reach the shop right now.</strong><p>{catalogError}</p><button type="button" onClick={() => window.location.reload()}>TRY AGAIN <ArrowRight size={14} /></button></div>
              : filteredProducts.length === 0 ? <div className="ar-shop-empty"><span>✳</span><h2>No gear found.</h2><p>Try adjusting the filters or searching for a different court essential.</p><button className="ar-button ar-button-outline" type="button" onClick={clearFilters}>CLEAR FILTERS <X size={14} /></button></div>
                : <div className="ar-shop-grid">{filteredProducts.map((product) => <ShopProductCard key={product.id} product={product} onView={setSelectedProduct} onAdd={(item) => hasProductOptions(item) ? setSelectedProduct(item) : addToCart(item)} added={addedIds.includes(product.id)} liked={wishlist.includes(product.id)} onLike={(id) => {
                  const next = wishlist.includes(id) ? wishlist.filter((item) => item !== id) : [...wishlist, id];
                  setWishlist(next);
                  try { window.localStorage.setItem("alraed-storefront-wishlist", JSON.stringify(next)); }
                  catch { setNotice("Your wishlist could not be saved in browser storage."); }
                }} />)}</div>}
          <div className="ar-shop-bottom-note"><span>MADE FOR THE MATCH. AND EVERYTHING BEFORE IT.</span><span>{filteredProducts.length} {filteredProducts.length === 1 ? "PICK" : "PICKS"} TO EXPLORE</span></div>
        </section>
      </div>

      <footer className="ar-shop-footer"><Link className="ar-wordmark" href="/"><img className="ar-brand-logo" src="/IMG_8477.jpg%2010-33-16-710.jpg" alt="" /><span>AL RAED<small>SPORTS</small></span></Link><p>For the love of the rally.<br /><span>Made for players across the UAE.</span></p><Link href="/">BACK TO THE STOREFRONT <ArrowUpRight size={14} /></Link></footer>

      <div className="ar-floating-actions ar-floating-actions-shop" aria-label="Quick actions">
        <button className="ar-floating-button ar-floating-top" type="button" aria-label="Scroll to top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><ArrowUp size={15} /></button>
        <button className="ar-floating-button ar-floating-cart" type="button" onClick={() => setCartOpen(true)} aria-label={`Open shopping bag, ${cartCount} items`}><ShoppingBag size={15} />{cartCount > 0 && <b>{cartCount}</b>}</button>
      </div>

      <ProductDetailDialog key={selectedProduct?.id ?? "closed"} product={selectedProduct} onClose={() => setSelectedProduct(null)} onAdd={(product, quantity, options) => {
        if (addToCart(product, quantity, options)) {
          setSelectedProduct(null);
          setCartOpen(true);
        }
      }} />

      {notice && <div className="ar-shop-notice" role="status"><Check size={15} />{notice}</div>}

      {cartOpen && <div className="ar-drawer-backdrop" onClick={() => setCartOpen(false)}>
        <aside className="ar-cart-drawer" role="dialog" aria-modal="true" aria-labelledby="ar-cart-title" onClick={(event) => event.stopPropagation()}>
          <div className="ar-cart-heading"><div><p className="ar-eyebrow">YOUR GAME, GATHERED</p><h2 id="ar-cart-title">Your bag <span>({cartCount})</span></h2></div><button type="button" aria-label="Close bag" onClick={() => setCartOpen(false)}><X /></button></div>
          {cartError && <p className="ar-shop-cart-error" role="alert">{cartError}</p>}
          {checkoutError && <p className="ar-shop-cart-error" role="alert">{checkoutError} <Link href="/account">My account</Link></p>}
          {cart.length === 0 ? <div className="ar-empty-cart"><ShoppingBag size={30} /><strong>A little room for something good.</strong><p>Your bag is waiting for its first match-ready pick.</p><button type="button" className="ar-button ar-button-light" onClick={() => setCartOpen(false)}>KEEP EXPLORING <ArrowRight size={15} /></button></div> : <>
            <div className="ar-cart-items">{cart.map((line) => {
              const { product, quantity, color, size } = line;
              const lineKey = getCartLineKey(line);
              return <article className="ar-cart-line" key={lineKey}><div className="ar-cart-image">{product.image && <img src={product.image} alt="" />}</div><div className="ar-cart-line-copy"><small>{product.brand}</small><strong>{product.name.replace(/^\[TEST\]\s*/, "")}</strong><span>{[color && `Color: ${color}`, size && `Size: ${size}`].filter(Boolean).join(" · ") || money(product.price)}</span>{(color || size) && <span>{money(product.price)}</span>}<div className="ar-quantity"><button type="button" aria-label={`Remove one ${product.name}`} onClick={() => changeQuantity(lineKey, -1)}><Minus size={13} /></button><span>{quantity}</span><button type="button" aria-label={`Add one ${product.name}`} onClick={() => changeQuantity(lineKey, 1)} disabled={quantity >= Math.min(product.stock, 50)}><Plus size={13} /></button></div></div><button className="ar-remove-line" type="button" aria-label={`Remove ${product.name}`} onClick={() => persistCart(cart.filter((item) => getCartLineKey(item) !== lineKey))}><X size={16} /></button></article>;
            })}</div>
            <div className="ar-cart-bottom"><div><span>SUBTOTAL</span><strong>{money(cartTotal)}</strong></div><small>Secure card checkout. Apple Pay appears automatically on supported devices.</small><button className="ar-button ar-button-light ar-checkout" type="button" onClick={() => void checkout()} disabled={checkoutBusy}>{checkoutBusy ? "OPENING SECURE CHECKOUT..." : "PROCEED TO PAYMENT"} <ArrowRight size={16} /></button></div>
          </>}
        </aside>
      </div>}
    </main>
  );
}
