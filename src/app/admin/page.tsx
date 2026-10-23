"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUp, CalendarDays, Check, ChevronDown, ChevronUp, CircleDot, Filter, Footprints, ImagePlus, LogOut, Minus, Package, PackageCheck, Plus, RefreshCw, Save, Search, ShieldCheck, ShoppingBag, UserRound } from "lucide-react";
import type { User } from "firebase/auth";
import { firebaseEnabled, logoutFirebase, signInWithGoogle, subscribeToAuth } from "@/lib/firebase";

type Product = {
  id: number;
  name: string;
  brand: string;
  category: string;
  sku?: string | null;
  zoho_product_id?: string | null;
  price: number;
  image_url?: string | null;
  stock: number;
  is_active?: boolean;
  description?: string | null;
  colors?: string[];
  sizes?: string[];
  unavailable_sizes?: string[];
  size_stock?: Record<string, number>;
  product_type?: ProductType;
  size_category?: SizeCategory | null;
  created_at?: string;
  zoho_stock_synced_at?: string | null;
};

type Order = {
  id: string;
  customer_name: string;
  customer_phone: string;
  city: string | null;
  address: string | null;
  total: number;
  status: string;
  notes?: string | null;
  created_at: string;
  stripe_payment_intent_id: string | null;
  stripe_payment_method: string | null;
  stripe_paid_at: string | null;
  order_items?: Array<{ id: number; product_id?: number | null; product_name: string; quantity: number; unit_price: number }>;
};

const statusOptions = ["awaiting_payment", "paid", "processing", "shipped", "delivered", "cancelled"];
const productCategories = ["Badminton", "Tennis", "Squash", "Accessories"];
type ProductType = "shoe" | "racquet" | "other";
type SizeCategory = "mens" | "womens" | "kids";

const shoeSizes: Record<SizeCategory, string[]> = {
  mens: Array.from({ length: 14 }, (_, index) => `UK ${index + 2}`),
  womens: Array.from({ length: 10 }, (_, index) => `UK ${index + 2}`),
  kids: Array.from({ length: 10 }, (_, index) => `UK ${index + 2}`),
};

function getProductType(product: Pick<Product, "product_type" | "name">): ProductType {
  if (product.product_type) return product.product_type;
  return /shoe|sneaker/i.test(product.name) ? "shoe" : "other";
}

function parseOptionList(value: string) {
  return value.split(",").map((option) => option.trim()).filter(Boolean);
}

function getSizeStockForCategory(sizeStock: Record<string, number>, category: SizeCategory) {
  return Object.fromEntries(shoeSizes[category].map((size) => [size, Math.max(0, Number(sizeStock[size]) || 0)]));
}

function ProductTypeSelector({ value, onChange }: { value: ProductType | ""; onChange: (value: ProductType) => void }) {
  const options: Array<{ value: ProductType; label: string; description: string; Icon: typeof Footprints }> = [
    { value: "shoe", label: "Shoes", description: "UK sizes by audience", Icon: Footprints },
    { value: "racquet", label: "Racquets", description: "Color options, no shoe sizes", Icon: CircleDot },
    { value: "other", label: "Other gear", description: "Standard product listing", Icon: Package },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Choose product type">
      {options.map(({ value: option, label, description, Icon }) => (
        <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${value === option ? "border-sky-400 bg-sky-400/10 text-white" : "border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-500"}`}>
          <Icon size={19} className={value === option ? "text-sky-300" : "text-slate-500"} />
          <span><strong className="block text-sm">{label}</strong><small className="text-[10px]">{description}</small></span>
          {value === option && <Check size={15} className="ml-auto text-sky-300" />}
        </button>
      ))}
    </div>
  );
}

function ShoeSizeSelector({
  category,
  onCategoryChange,
  sizeStock,
  onChangeSizeStock,
  idPrefix,
}: {
  category: SizeCategory;
  onCategoryChange: (value: SizeCategory) => void;
  sizeStock: Record<string, number>;
  onChangeSizeStock: (size: string, quantity: number) => void;
  idPrefix: string;
}) {
  const audiences: Array<{ value: SizeCategory; label: string }> = [
    { value: "mens", label: "Men's" },
    { value: "womens", label: "Women's" },
    { value: "kids", label: "Kids" },
  ];

  return (
    <div className="admin-size-stock">
      <div className="admin-size-stock-heading">
        <div>
          <h3>Stock by shoe size</h3>
          <p>Set the quantity for each size. Zero-stock sizes will be disabled for customers. Add each shoe colorway as a separate product with its own image.</p>
        </div>
        <div className="admin-size-audience" role="group" aria-label="Shoe size range">
          {audiences.map((audience) => <button key={audience.value} type="button" aria-pressed={category === audience.value} onClick={() => onCategoryChange(audience.value)}>{audience.label}</button>)}
        </div>
      </div>
      <div className="admin-size-stock-grid">
        {shoeSizes[category].map((size) => {
          const quantity = sizeStock[size] ?? 0;
          const hasStock = quantity > 0;
          return (
            <div key={`${idPrefix}-${category}-${size}`} className={`admin-size-stock-card${hasStock ? " is-stocked" : ""}`}>
              <div className="admin-size-stock-card-heading">
                <span className="admin-size-label">{size}</span>
                <span className={`admin-size-status${hasStock ? " is-stocked" : ""}`}>{hasStock ? "In stock" : "Out of stock"}</span>
              </div>
              <div className="admin-size-stepper" role="group" aria-label={`${size} quantity`}>
                <button type="button" onClick={() => onChangeSizeStock(size, Math.max(0, quantity - 1))} aria-label={`Decrease ${size} quantity`} disabled={quantity === 0} className="admin-size-stepper-button">
                  <Minus size={17} aria-hidden="true" />
                </button>
                <output aria-live="polite" aria-label={`${quantity} pairs for ${size}`} className="admin-size-quantity">{quantity}</output>
                <button type="button" onClick={() => onChangeSizeStock(size, Math.min(100000, quantity + 1))} aria-label={`Increase ${size} quantity`} disabled={quantity >= 100000} className="admin-size-stepper-button">
                  <Plus size={17} aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="admin-size-stock-footer">
        <span>{Object.values(sizeStock).reduce((total, quantity) => total + quantity, 0)} pairs total</span>
        <span>UK {category === "mens" ? "2–15" : "2–11"}</span>
      </div>
    </div>
  );
}

const money = (value: number) => `AED ${Number(value).toLocaleString()}`;
const statusLabel = (status: string) => status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [editingProductName, setEditingProductName] = useState("");
  const [editingProductCategory, setEditingProductCategory] = useState("Badminton");
  const [editingProductType, setEditingProductType] = useState<ProductType>("other");
  const [editingSizeCategory, setEditingSizeCategory] = useState<SizeCategory>("mens");
  const [editingSizeStock, setEditingSizeStock] = useState<Record<string, number>>({});
  const [editingProductSku, setEditingProductSku] = useState("");
  const [editingZohoProductId, setEditingZohoProductId] = useState("");
  const [editingProductColors, setEditingProductColors] = useState("");
  const [editingProductStock, setEditingProductStock] = useState("0");
  const [savingEditedProductId, setSavingEditedProductId] = useState<number | null>(null);
  const [productNotice, setProductNotice] = useState<string | null>(null);
  const [syncingInventory, setSyncingInventory] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("");
  const [orderDateFilter, setOrderDateFilter] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productListView, setProductListView] = useState<"recent" | "all">("recent");
  const [productVisibility, setProductVisibility] = useState<"all" | "live" | "hidden">("all");
  const [productForm, setProductForm] = useState({
    product_type: "" as ProductType | "",
    size_category: "mens" as SizeCategory,
    name: "",
    brand: "",
    category: "Badminton",
    sku: "",
    zoho_product_id: "",
    colors: "",
    size_stock: {} as Record<string, number>,
    price: "",
    stock: "10",
    image_url: "",
  });
  const [savingProduct, setSavingProduct] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const visibleOrders = orders.filter((order) => {
    const matchesName = order.customer_name.toLowerCase().includes(orderSearch.trim().toLowerCase());
    const matchesStatus = !orderStatusFilter || order.status === orderStatusFilter;
    const matchesDate = !orderDateFilter || new Date(order.created_at).toISOString().slice(0, 10) === orderDateFilter;
    return matchesName && matchesStatus && matchesDate;
  });

  const recentlySoldProductIds = useMemo(() => {
    const productIds = new Set(products.map((product) => product.id));
    const productIdsByName = new Map(products.map((product) => [product.name.trim().toLocaleLowerCase(), product.id]));
    const recentIds: number[] = [];

    for (const order of orders) {
      if (!["paid", "processing", "shipped", "delivered"].includes(order.status)) continue;
      for (const item of order.order_items ?? []) {
        const productId = item.product_id && productIds.has(item.product_id)
          ? item.product_id
          : productIdsByName.get(item.product_name.trim().toLocaleLowerCase());
        if (productId === undefined || recentIds.includes(productId)) continue;
        recentIds.push(productId);
        if (recentIds.length === 3) return recentIds;
      }
    }

    return recentIds;
  }, [orders, products]);

  const matchingProducts = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase();
    return products.filter((product) => {
      if (productVisibility === "live" && !product.is_active) return false;
      if (productVisibility === "hidden" && product.is_active) return false;
      if (!query) return true;

      return [
        product.name,
        product.brand,
        product.category,
        String(product.id),
        product.zoho_product_id ?? "",
      ].some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [productSearch, productVisibility, products]);

  const visibleProducts = useMemo(() => {
    if (productListView === "all" || productSearch.trim()) return matchingProducts;
    const recentIdSet = new Set(recentlySoldProductIds);
    return matchingProducts.filter((product) => recentIdSet.has(product.id));
  }, [matchingProducts, productListView, productSearch, recentlySoldProductIds]);

  const changeFormSizeCategory = (sizeCategory: SizeCategory) => {
    setProductForm((current) => ({ ...current, size_category: sizeCategory, size_stock: getSizeStockForCategory(current.size_stock, sizeCategory) }));
  };

  const changeEditingSizeCategory = (sizeCategory: SizeCategory) => {
    setEditingSizeCategory(sizeCategory);
    setEditingSizeStock((current) => getSizeStockForCategory(current, sizeCategory));
  };

  const loadOrders = async (token: string) => {
    const response = await fetch("/api/admin/orders", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load orders.");
    setOrders(result.orders ?? []);
  };

  const loadProducts = async (token: string) => {
    const response = await fetch("/api/admin/products", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load products.");
    setProducts(result.products ?? []);
  };

  useEffect(() => {
    return subscribeToAuth(async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch("/api/admin/session", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const result = await response.json();

        if (!response.ok || !result.admin) {
          setIsAdmin(false);
          setAuthError(result.error || "Access denied.");
          setLoading(false);
          return;
        }

        setIsAdmin(true);
        setAuthError(null);
        await Promise.all([loadOrders(token), loadProducts(token)]);
      } catch (error) {
        setIsAdmin(false);
        setAuthError(error instanceof Error ? error.message : "Unable to verify admin access.");
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const handleGoogleAdminLogin = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sign in with Google.");
    } finally {
      setSigningIn(false);
    }
  };

  const handleLogout = async () => {
    await logoutFirebase();
    setIsAdmin(false);
    setUser(null);
    router.push("/");
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    if (!user) return;
    setBusyOrderId(orderId);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update order.");
      setOrders((current) => current.map((order) => order.id === orderId ? { ...order, status } : order));
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to update order.");
    } finally {
      setBusyOrderId(null);
    }
  };

  const saveProduct = async () => {
    if (!user) return;
    if (!productForm.product_type) {
      setAuthError("Choose whether this product is shoes, a racquet, or other gear.");
      return;
    }
    if (productForm.product_type === "shoe" && !Object.values(productForm.size_stock).some((quantity) => quantity > 0)) {
      setAuthError("Add stock to at least one shoe size.");
      return;
    }
    setSavingProduct(true);
    setAuthError(null);

    try {
      const token = await user.getIdToken();
      const payload = {
        ...productForm,
        size_category: productForm.product_type === "shoe" ? productForm.size_category : null,
        sku: productForm.sku.trim(),
        zoho_product_id: productForm.zoho_product_id.trim(),
        price: Number(productForm.price),
        ...(productForm.product_type !== "shoe" ? { stock: Number(productForm.stock) } : {}),
        colors: productForm.product_type === "racquet" ? parseOptionList(productForm.colors) : [],
        size_stock: productForm.product_type === "shoe" ? getSizeStockForCategory(productForm.size_stock, productForm.size_category) : {},
      };

      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save product.");

      setProducts((current) => [result.product, ...current]);
      setProductForm({
        product_type: "",
        size_category: "mens",
        name: "",
        brand: "",
        category: "Badminton",
        sku: "",
        zoho_product_id: "",
        colors: "",
        size_stock: {},
        price: "",
        stock: "10",
        image_url: "",
      });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to save product.");
    } finally {
      setSavingProduct(false);
    }
  };

  const syncZohoInventory = async () => {
    if (!user) return;
    setSyncingInventory(true);
    setAuthError(null);
    setProductNotice(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/inventory/zoho-sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to sync Zoho stock.");
      await loadProducts(token);
      const unmatched = result.unmatchedWebsiteSkus as string[] | undefined;
      const unmatchedSummary = unmatched?.length
        ? ` ${unmatched.length} unmatched SKU${unmatched.length === 1 ? "" : "s"}: ${unmatched.slice(0, 5).join(", ")}${unmatched.length > 5 ? ", ..." : ""}.`
        : "";
      setProductNotice(`Zoho stock synced for ${result.updatedProductCount} product${result.updatedProductCount === 1 ? "" : "s"}.${unmatchedSummary}`);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sync Zoho stock.");
    } finally {
      setSyncingInventory(false);
    }
  };

  const uploadProductImage = async (file?: File) => {
    if (!user || !file) return;
    setUploadingImage(true);
    setAuthError(null);
    try {
      const token = await user.getIdToken();
      const formData = new FormData();
      formData.set("image", file);
      const response = await fetch("/api/admin/product-image", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to upload product image.");
      setProductForm((current) => ({ ...current, image_url: result.imageUrl }));
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to upload product image.");
    } finally {
      setUploadingImage(false);
    }
  };

  const toggleProductEditor = (product: Product) => {
    if (editingProductId === product.id) {
      setEditingProductId(null);
      return;
    }
    setEditingProductId(product.id);
    setEditingProductType(getProductType(product));
    setEditingSizeCategory(product.size_category ?? "mens");
    setEditingSizeStock(product.size_stock ?? {});
    setEditingProductName(product.name);
    setEditingProductCategory(productCategories.includes(product.category) ? product.category : "Accessories");
    setEditingProductSku(product.sku ?? "");
    setEditingZohoProductId(product.zoho_product_id ?? "");
    setEditingProductColors(product.colors?.join(", ") ?? "");
    setEditingProductStock(String(product.stock));
  };

  const saveProductEditor = async (product: Product, isActive = Boolean(product.is_active)) => {
    if (!user) return;
    const name = editingProductName.trim();
    const stock = Number(editingProductStock);
    if (!name || !productCategories.includes(editingProductCategory) || (editingProductType !== "shoe" && (!Number.isInteger(stock) || stock < 0))) {
      setAuthError("Enter a product name, valid category, and a whole-number stock quantity of zero or more.");
      return;
    }

    setSavingEditedProductId(product.id);
    setAuthError(null);
    setProductNotice(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/products", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: product.id,
          product_type: editingProductType,
          size_category: editingProductType === "shoe" ? editingSizeCategory : null,
          name,
          category: editingProductCategory,
          sku: editingProductSku,
          zoho_product_id: editingZohoProductId,
          colors: editingProductType === "racquet" ? parseOptionList(editingProductColors) : [],
          ...(editingProductType === "shoe"
            ? { size_stock: getSizeStockForCategory(editingSizeStock, editingSizeCategory) }
            : { stock, sizes: [], unavailable_sizes: [] }),
          is_active: isActive,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save product changes.");
      setProducts((current) => current.map((item) => item.id === product.id ? result.product : item));
      setProductNotice(`${name} ${isActive ? "is now published" : "has been hidden"}.`);
      setEditingProductId(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to save product changes.");
    } finally {
      setSavingEditedProductId(null);
    }
  };

  if (!user && !loading) {
    return (
      <main className="admin-dashboard min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
        <div className="max-w-lg w-full rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-sky-300">Admin access required</p>
          <h1 className="text-4xl font-black tracking-tight mb-4">Al Raed Sports Commerce</h1>
          <p className="mb-6 text-sm text-slate-300">Only the approved admin account can access this dashboard.</p>
          {authError && <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{authError}</div>}
          <button
            type="button"
            onClick={() => void handleGoogleAdminLogin()}
            className="w-full rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-sky-200 disabled:opacity-60"
            disabled={!firebaseEnabled || signingIn}
          >
            {signingIn ? "Connecting..." : "Continue with Google"}
          </button>
          <div className="mt-6 text-xs text-slate-400">Authorized admin email: alraedsportsuae@gmail.com</div>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="admin-dashboard min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-sky-200">Checking admin access...</div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="admin-dashboard min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
        <div className="max-w-lg w-full rounded-3xl border border-rose-500/30 bg-slate-900 p-8">
          <ShieldCheck className="mb-4 text-rose-400" />
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-rose-300">Access denied</p>
          <h1 className="text-3xl font-black mb-4">This account is not authorized.</h1>
          <p className="mb-6 text-slate-300">Use the approved admin Google account to continue.</p>
          <div className="flex gap-3">
            <Link href="/" className="rounded-full border border-slate-700 px-4 py-2 text-sm text-white">Back to store</Link>
            <button type="button" onClick={() => void handleLogout()} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900">Sign out</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-dashboard min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-300">Admin dashboard</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Al Raed Sports Commerce</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a href="#add-product" className="inline-flex items-center gap-2 rounded-full bg-sky-400 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-sky-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400">
              <Plus size={15} /> Add new product
            </a>
            <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200">Storefront <ArrowRight size={14} /></Link>
            <a href="#customer-orders" className="inline-flex items-center gap-2 rounded-full bg-sky-400 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-sky-300">
              <ShoppingBag size={14} /> View orders <span className="rounded-full bg-slate-950/15 px-2 py-0.5 text-xs">{orders.length}</span>
            </a>
            <button type="button" onClick={() => void handleLogout()} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950">
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </header>

        {authError && <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{authError}</div>}

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <a href="#customer-orders" className="rounded-3xl border border-slate-800 bg-slate-900 p-5 transition hover:border-sky-400/60 hover:bg-slate-900/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
            <div className="flex items-center justify-between text-slate-400"><ShoppingBag size={18} /> Orders</div>
            <div className="mt-4 text-3xl font-black">{orders.length}</div>
            <div className="mt-2 text-xs font-semibold text-sky-300">Review customer orders →</div>
          </a>
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center justify-between text-slate-400"><PackageCheck size={18} /> Products</div>
            <div className="mt-4 text-3xl font-black">{products.length}</div>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center justify-between text-slate-400"><UserRound size={18} /> Admin</div>
            <div className="mt-4 text-sm font-semibold text-sky-200">{user?.email ?? "Signed in"}</div>
          </div>
        </div>

        <section id="customer-orders" className="mb-8 scroll-mt-6 rounded-3xl border border-sky-400/20 bg-slate-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Order management</p>
              <h2 className="mt-1 text-xl font-bold">Customer orders</h2>
            </div>
            <span className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300">{visibleOrders.length} of {orders.length}</span>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(170px,220px)_minmax(170px,220px)]">
            <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 text-slate-400">
              <Search size={16} />
              <input value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} className="w-full bg-transparent py-2.5 text-sm text-white outline-none" placeholder="Search customer name" aria-label="Search customer by name" />
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 text-slate-400">
              <Filter size={16} />
              <select value={orderStatusFilter} onChange={(event) => setOrderStatusFilter(event.target.value)} className="w-full bg-transparent py-2.5 text-sm text-white outline-none" aria-label="Filter orders by status">
                <option value="">All statuses</option>
                {statusOptions.map((option) => <option key={option} value={option}>{option === "awaiting_payment" ? "Unpaid" : statusLabel(option)}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 text-slate-400">
              <CalendarDays size={16} />
              <input type="date" value={orderDateFilter} onChange={(event) => setOrderDateFilter(event.target.value)} className="w-full bg-transparent py-2.5 text-sm text-white outline-none" aria-label="Filter orders by date" />
            </label>
          </div>

          <div className="space-y-3">
            {orders.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">No orders yet.</div> : visibleOrders.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">No orders match these filters.</div> : visibleOrders.map((order) => (
              <div key={order.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Order #{order.id.slice(0, 8).toUpperCase()}</div>
                    <div className="mt-1 text-lg font-bold text-white">{order.customer_name}</div>
                    <div className="text-sm text-slate-400">{order.customer_phone} · {order.city || "City not set"}</div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="text-right">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Total</div>
                      <div className="text-lg font-bold text-white">{money(order.total)}</div>
                    </div>
                    <select
                      value={order.status}
                      onChange={(event) => void updateOrderStatus(order.id, event.target.value)}
                      className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                      disabled={busyOrderId === order.id}
                    >
                      {statusOptions.map((option) => (
                        <option key={option} value={option}>{statusLabel(option)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {(order.address || order.notes) && (
                  <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">
                    {order.address && <div>{order.address}</div>}
                    {order.notes && <div className="mt-1 text-slate-400">Note: {order.notes}</div>}
                  </div>
                )}

                {(order.status === "paid" || order.stripe_payment_intent_id || order.stripe_paid_at) && (
                  <div className="mt-3 grid gap-1 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-3 text-sm text-emerald-100">
                    <strong>Payment confirmed{order.stripe_payment_method ? ` · ${order.stripe_payment_method}` : ""}</strong>
                    {order.stripe_paid_at && <span className="text-xs text-emerald-200/70">Paid {new Date(order.stripe_paid_at).toLocaleString()}</span>}
                    {order.stripe_payment_intent_id && <span className="break-all text-xs text-emerald-200/70">Stripe reference: {order.stripe_payment_intent_id}</span>}
                  </div>
                )}

                <div className="mt-3 space-y-2">
                  {(order.order_items ?? []).map((item) => (
                    <div key={item.id} className="flex items-center justify-between border-t border-slate-800 pt-2 text-sm text-slate-300">
                      <span>{item.product_name} × {item.quantity}</span>
                      <span>{money(Number(item.unit_price) * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_1.6fr]">
          <section id="add-product" className="scroll-mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300">Product setup</p><h2 className="mt-1 text-xl font-bold">Add a product</h2><p className="mt-1 text-xs text-slate-400">Choose a type first to get the right options.</p></div>
              <Plus size={18} className="mt-1 text-sky-300" />
            </div>
            <div className="space-y-5">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">1. What are you adding?</h3>
                <ProductTypeSelector value={productForm.product_type} onChange={(product_type) => setProductForm((current) => ({ ...current, product_type }))} />
              </section>
              {productForm.product_type && (
                <>
                  <section className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Product name
                      <input value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" placeholder={productForm.product_type === "shoe" ? "e.g. Court shoe model" : productForm.product_type === "racquet" ? "e.g. Astrox 99 Pro" : "Product name"} />
                    </label>
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Brand
                      <input value={productForm.brand} onChange={(event) => setProductForm((current) => ({ ...current, brand: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" placeholder="e.g. Yonex" />
                    </label>
                  </section>
                  {productForm.product_type === "racquet" && (
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Colors
                      <input value={productForm.colors} onChange={(event) => setProductForm((current) => ({ ...current, colors: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" placeholder="Separate racquet colors with commas: Black, White, Navy" />
                    </label>
                  )}
                  {productForm.product_type === "shoe" && (
                    <ShoeSizeSelector
                      category={productForm.size_category}
                      onCategoryChange={changeFormSizeCategory}
                      sizeStock={productForm.size_stock}
                      onChangeSizeStock={(size, quantity) => setProductForm((current) => ({ ...current, size_stock: { ...current.size_stock, [size]: quantity } }))}
                      idPrefix="new-shoe"
                    />
                  )}
                  <section className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Zoho SKU <span className="font-normal text-slate-500">Optional · exact match</span>
                      <input value={productForm.sku} onChange={(event) => setProductForm((current) => ({ ...current, sku: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" placeholder="Zoho SKU" />
                    </label>
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Zoho product ID <span className="font-normal text-slate-500">Admin only</span>
                      <input value={productForm.zoho_product_id} onChange={(event) => setProductForm((current) => ({ ...current, zoho_product_id: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" placeholder="Zoho product ID" />
                    </label>
                  </section>
                  <section className="grid gap-3 sm:grid-cols-3">
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Sports category
                      <select value={productForm.category} onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white">
                        {productCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                      </select>
                    </label>
                    {productForm.product_type !== "shoe" && <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Quantity in stock
                      <input value={productForm.stock} onChange={(event) => setProductForm((current) => ({ ...current, stock: event.target.value }))} type="number" min="0" step="1" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" placeholder="10" />
                    </label>}
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Price (AED)
                      <input value={productForm.price} onChange={(event) => setProductForm((current) => ({ ...current, price: event.target.value }))} type="number" min="0" step="0.01" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" placeholder="0.00" />
                    </label>
                  </section>
                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Product image</h3>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-300 hover:border-sky-400">
                      <ImagePlus size={18} className="shrink-0 text-sky-300" />
                      <span className="min-w-0 flex-1 truncate">{uploadingImage ? "Uploading image..." : productForm.image_url ? "Image uploaded. Choose another" : "Upload JPG, PNG or WebP · max 5 MB"}</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploadingImage} onChange={(event) => void uploadProductImage(event.target.files?.[0])} />
                    </label>
                    {productForm.image_url && <img src={productForm.image_url} alt="Product preview" className="h-40 w-full rounded-xl border border-slate-800 bg-slate-950 object-contain" />}
                  </section>
                  <button type="button" onClick={() => void saveProduct()} disabled={savingProduct || uploadingImage || !productForm.image_url} className="w-full rounded-2xl bg-sky-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60">
                    {savingProduct ? "Saving product..." : "Save product"}
                  </button>
                </>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Current products</h2>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300">{visibleProducts.length} shown · {products.length} total</span>
                <button hidden type="button" onClick={() => void syncZohoInventory()} disabled={syncingInventory} className="inline-flex items-center gap-2 rounded-full border border-sky-400/40 px-3 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-400/10 disabled:opacity-50">
                  <RefreshCw size={14} className={syncingInventory ? "animate-spin" : ""} />
                  {syncingInventory ? "Syncing Zoho..." : "Sync Zoho stock"}
                </button>
              </div>
            </div>
            {productNotice && <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200" role="status">{productNotice}</div>}
            <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 text-slate-400">
                <Search size={16} />
                <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} className="w-full bg-transparent py-2.5 text-sm text-white outline-none" placeholder="Search name, brand, category, ID or Zoho ID" aria-label="Search products by name, brand, category, product ID, or Zoho product ID" />
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 text-slate-400">
                <Filter size={16} />
                <select value={productListView} onChange={(event) => setProductListView(event.target.value as "recent" | "all")} className="bg-transparent py-2.5 text-sm text-white outline-none" aria-label="Choose recent or all products">
                  <option value="recent">Recently sold (3)</option>
                  <option value="all">Show all products</option>
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 text-slate-400">
                <Filter size={16} />
                <select value={productVisibility} onChange={(event) => setProductVisibility(event.target.value as "all" | "live" | "hidden")} className="bg-transparent py-2.5 text-sm text-white outline-none" aria-label="Filter products by visibility">
                  <option value="all">Live + hidden</option>
                  <option value="live">Live only</option>
                  <option value="hidden">Hidden only</option>
                </select>
              </label>
            </div>
            <div className="space-y-3">
              {products.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">No products yet.</div> : visibleProducts.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">{productSearch.trim() ? "No products match this search." : productListView === "recent" ? "No recent sales found. Choose Show all products to browse inventory." : "No products match this visibility filter."}</div> : visibleProducts.map((product) => (
                <div key={product.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
                  <button type="button" onClick={() => toggleProductEditor(product)} aria-expanded={editingProductId === product.id} className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-slate-900">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-800">
                      {product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">IMG</div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-white">{product.name}</div>
                      <div className="text-xs text-slate-400">{product.brand} · {product.category} · {getProductType(product)} · {product.is_active ? "Live" : "Hidden"} · SKU: {product.sku || "not linked"}</div>
                      <div className="mt-1 text-[11px] text-slate-500">Product ID: {product.id} · Zoho Product ID: {product.zoho_product_id || "not linked"}</div>
                      <div className="mt-1 text-xs text-sky-200">{money(product.price)} · Stock: {product.stock}</div>
                      {getProductType(product) === "shoe" && product.size_stock ? <div className="mt-1 text-[11px] text-slate-400">By size: {Object.entries(product.size_stock).filter(([, quantity]) => quantity > 0).map(([size, quantity]) => `${size}: ${quantity}`).join(" · ") || "All sizes out of stock"}</div> : (product.colors?.length || product.sizes?.length) ? <div className="mt-1 text-[11px] text-slate-400">{product.colors?.length ? `Colors: ${product.colors.join(", ")}` : ""}{product.colors?.length && product.sizes?.length ? " · " : ""}{product.sizes?.length ? `Sizes: ${product.sizes.join(", ")}` : ""}{product.unavailable_sizes?.length ? ` · Out of stock: ${product.unavailable_sizes.join(", ")}` : ""}</div> : null}
                      {product.zoho_stock_synced_at && <div className="mt-1 text-[11px] text-slate-500">Zoho synced {new Date(product.zoho_stock_synced_at).toLocaleString()}</div>}
                    </div>
                    {editingProductId === product.id ? <ChevronUp size={18} className="shrink-0 text-slate-400" /> : <ChevronDown size={18} className="shrink-0 text-slate-400" />}
                  </button>
                  {editingProductId === product.id && (
                    <div className="grid gap-4 border-t border-slate-800 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(190px,0.7fr)]">
                      <div className="space-y-2 sm:col-span-2">
                        <span className="text-xs font-semibold text-slate-400">Product type</span>
                        <ProductTypeSelector value={editingProductType} onChange={setEditingProductType} />
                      </div>
                      <label className="grid gap-2 text-xs font-semibold text-slate-400">
                        Product name
                        <input value={editingProductName} onChange={(event) => setEditingProductName(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400" />
                      </label>
                      <label className="grid gap-2 text-xs font-semibold text-slate-400">
                        Category
                        <select value={editingProductCategory} onChange={(event) => setEditingProductCategory(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400">
                          {productCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                        </select>
                      </label>
                      {editingProductType === "racquet" && <label className="grid gap-2 text-xs font-semibold text-slate-400 sm:col-span-2">
                        Colors <span className="font-normal text-slate-500">Separate colors with commas</span>
                        <input value={editingProductColors} onChange={(event) => setEditingProductColors(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400" placeholder="Black, White, Red" />
                      </label>}
                      {editingProductType === "shoe" && <div className="sm:col-span-2">
                        <ShoeSizeSelector
                          category={editingSizeCategory}
                          onCategoryChange={changeEditingSizeCategory}
                          sizeStock={editingSizeStock}
                          onChangeSizeStock={(size, quantity) => setEditingSizeStock((current) => ({ ...current, [size]: quantity }))}
                          idPrefix={`edit-shoe-${product.id}`}
                        />
                      </div>}
                      <label className="grid gap-2 text-xs font-semibold text-slate-400">
                        Zoho SKU
                        <input value={editingProductSku} onChange={(event) => setEditingProductSku(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400" placeholder="Enter the exact Zoho item SKU" />
                      </label>
                      <label className="grid gap-2 text-xs font-semibold text-slate-400">
                        Zoho Product ID
                        <input value={editingZohoProductId} onChange={(event) => setEditingZohoProductId(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400" placeholder="Zoho product ID (admin only)" />
                      </label>
                      {editingProductType !== "shoe" && <div className="grid gap-2 text-xs font-semibold text-slate-400">
                        <label htmlFor={`stock-${product.id}`}>Stock quantity{product.sku ? " (managed by Zoho)" : ""}</label>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setEditingProductStock((stock) => String(Math.max(0, Number(stock || 0) - 1)))} disabled={Boolean(product.sku) || Number(editingProductStock) <= 0} aria-label="Decrease stock by one" className="h-10 w-10 rounded-lg border border-slate-700 bg-slate-900 text-lg text-white disabled:opacity-40">-</button>
                          <input id={`stock-${product.id}`} value={editingProductStock} onChange={(event) => setEditingProductStock(event.target.value)} type="number" min="0" step="1" disabled={Boolean(product.sku)} className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-center text-sm text-white outline-none focus:border-sky-400 disabled:opacity-60" />
                          <button type="button" onClick={() => setEditingProductStock((stock) => String(Number(stock || 0) + 1))} disabled={Boolean(product.sku)} aria-label="Increase stock by one" className="h-10 w-10 rounded-lg border border-slate-700 bg-slate-900 text-lg text-white disabled:opacity-40">+</button>
                        </div>
                        {product.sku && <p className="text-[11px] font-normal text-slate-500">Stock updates from Zoho when the scheduled sync runs.</p>}
                      </div>}
                      <div className="flex flex-wrap gap-2 sm:col-span-2">
                        <button type="button" onClick={() => void saveProductEditor(product)} disabled={savingEditedProductId === product.id} className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-60"><Save size={15} /> Save changes</button>
                        <button type="button" onClick={() => void saveProductEditor(product, !product.is_active)} disabled={savingEditedProductId === product.id} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{savingEditedProductId === product.id ? "Saving..." : product.is_active ? "Save & hide" : "Save & publish"}</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

      </div>
      <button className="ar-floating-button ar-floating-top admin-back-to-top" type="button" aria-label="Scroll to top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
        <ArrowUp size={15} />
      </button>
    </main>
  );
}
