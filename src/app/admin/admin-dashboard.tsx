"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, ArrowUp, BarChart3, CalendarDays, Check, ChevronDown, ChevronUp, CircleDot, ClipboardList, Clock3, FileSpreadsheet, Filter, Footprints, History, ImagePlus, LogOut, MessageCircle, Package, PackageCheck, PanelsTopLeft, Plus, RefreshCw, Save, Search, ShieldCheck, Tag } from "lucide-react";
import type { User } from "firebase/auth";
import { firebaseEnabled, logoutFirebase, signInWithGoogle, subscribeToAuth } from "@/lib/firebase";
import { ALRAED_WHATSAPP_CONTACT, createWhatsAppOrderConfirmationLink, normalizeWhatsAppPhone } from "@/lib/whatsapp";
import { getLowStockProducts, getOverdueOrders, type OrderStatusHistoryEntry } from "@/lib/order-operations";
import { getShoeSizes, isShoeSizeCategory, shoeSizeCategories, shoeSizesByCategory, type ShoeSizeCategory } from "@/lib/shoe-sizes";
import { mapStoreProduct, type StoreProduct } from "@/lib/store-products";
import ProductDetailDialog from "@/components/storefront/ProductDetailDialog";
import HomeCampaignManager from "./home-campaign-manager";
import CouponManager from "./coupon-manager";
import InsightsDashboard from "./insights-dashboard";
import OrderFulfillmentBoard from "./order-fulfillment-board";
import ActivityLog from "./activity-log";

type AdminSection = "insights" | "products" | "orders" | "posters" | "coupons" | "fulfillment" | "activity";

const adminSections: Array<{ id: AdminSection; href: string; label: string; description: string; Icon: typeof Package }> = [
  { id: "insights", href: "/admin/insights", label: "Insights", description: "Sales and operations", Icon: BarChart3 },
  { id: "products", href: "/admin/products", label: "Products", description: "Catalog and inventory", Icon: Package },
  { id: "orders", href: "/admin/orders", label: "Orders", description: "Customer purchases", Icon: ClipboardList },
  { id: "posters", href: "/admin/posters", label: "Campaigns", description: "Homepage content", Icon: PanelsTopLeft },
  { id: "coupons", href: "/admin/coupons", label: "Coupons", description: "Discount codes", Icon: Tag },
  { id: "fulfillment", href: "/admin/fulfillment", label: "Future Implementation", description: "Order fulfillment tracking", Icon: PackageCheck },
  { id: "activity", href: "/admin/activity", label: "Activity Log", description: "Admin change history", Icon: History },
];
const sectionIntros: Record<AdminSection, string> = {
  insights: "Track sales performance, customer trends, order operations, and inventory health.",
  products: "Manage product listings, pricing, and Zoho inventory mappings.",
  orders: "Review customer purchases and keep fulfillment moving.",
  posters: "Create and organize the campaigns featured on your homepage.",
  coupons: "Create discount codes and track their use.",
  fulfillment: "Track paid orders from packing through courier handoff and delivery.",
  activity: "Review the history of changes made by authorized administrators.",
};

type Product = {
  id: number;
  name: string;
  brand: string;
  category: string;
  sku?: string | null;
  zoho_product_id?: string | null;
  price: number;
  image_url?: string | null;
  image_urls?: string[] | null;
  stock: number;
  is_active?: boolean;
  description?: string | null;
  specifications?: Record<string, string> | null;
  colors?: string[];
  sizes?: string[];
  unavailable_sizes?: string[];
  size_stock?: Record<string, number>;
  zoho_size_skus?: Record<string, string>;
  zoho_size_stock_synced_at?: Record<string, string>;
  product_type?: ProductType;
  size_category?: SizeCategory | null;
  created_at?: string;
  zoho_stock_synced_at?: string | null;
};

type Order = {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  city: string | null;
  address: string | null;
  total: number;
  status: string;
  notes?: string | null;
  created_at: string;
  stripe_payment_intent_id: string | null;
  stripe_payment_method: string | null;
  stripe_paid_at: string | null;
  zoho_invoice_recorded_at?: string | null;
  whatsapp_order_updates_opt_in: boolean;
  status_history?: OrderStatusHistoryEntry[];
  order_items?: Array<{ id: number; product_id?: number | null; product_name: string; quantity: number; unit_price: number }>;
};

type PreparedOrdersReport = {
  sourceOrders: Order[];
  attempt: number;
  href: string;
  fileName: string;
  orderCount: number;
};

function OrdersExportButton({ orders }: { orders: Order[] }) {
  const [report, setReport] = useState<PreparedOrdersReport | null>(null);
  const [reportError, setReportError] = useState<{ sourceOrders: Order[]; attempt: number; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let preparedHref: string | null = null;

    void import("./order-report")
      .then(({ prepareOrderReportDownload }) => prepareOrderReportDownload(orders))
      .then((preparedReport) => {
        preparedHref = preparedReport.href;
        if (cancelled) {
          URL.revokeObjectURL(preparedReport.href);
          return;
        }
        setReport({ ...preparedReport, sourceOrders: orders, attempt });
        setReportError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setReportError({
            sourceOrders: orders,
            attempt,
            message: error instanceof Error ? error.message : "The order report could not be generated. Please try again.",
          });
        }
      });

    return () => {
      cancelled = true;
      if (preparedHref) URL.revokeObjectURL(preparedHref);
    };
  }, [attempt, orders]);

  const currentReport = report?.sourceOrders === orders && report.attempt === attempt ? report : null;
  const currentError = reportError?.sourceOrders === orders && reportError.attempt === attempt ? reportError.message : null;

  return (
    <>
      {currentReport ? (
        <a
          href={currentReport.href}
          download={currentReport.fileName}
          onClick={() => setNotice(`Order report download started with ${currentReport.orderCount} order${currentReport.orderCount === 1 ? "" : "s"}.`)}
          className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-400"
          aria-label="Export all orders as an Excel workbook"
        >
          <FileSpreadsheet size={15} aria-hidden="true" />
          Export all orders
        </a>
      ) : (
        currentError ? (
          <button type="button" onClick={() => setAttempt((current) => current + 1)} className="inline-flex items-center gap-2 rounded-full border border-rose-400/40 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/10" aria-label="Retry preparing the Orders Excel export">
            <RefreshCw size={14} aria-hidden="true" />
            Retry export
          </button>
        ) : (
          <button type="button" disabled className="inline-flex cursor-not-allowed items-center gap-2 rounded-full bg-sky-500 px-3 py-2 text-xs font-semibold text-slate-950 opacity-50" aria-label="Export all orders as an Excel workbook" aria-busy="true">
            <FileSpreadsheet size={15} aria-hidden="true" />
            Preparing export...
          </button>
        )
      )}
      {notice && <span className="basis-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200" role="status">{notice}</span>}
      {currentError && <span className="basis-full rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" role="alert">{currentError}</span>}
    </>
  );
}

const statusOptions = ["awaiting_payment", "paid", "processing", "shipped", "delivered", "cancelled"];
const productCategories = ["Badminton", "Tennis", "Squash", "Accessories"];
type ProductType = "shoe" | "racquet" | "other";
type SizeCategory = ShoeSizeCategory | "tshirts" | "shorts" | "socks";
type ProductSpecification = { label: string; value: string };
type SizeEditorValues = {
  stock: Record<string, number>;
  skus: Record<string, string>;
  syncedAt: Record<string, string>;
};

const sizesByCategory: Record<SizeCategory, string[]> = {
  ...shoeSizesByCategory,
  tshirts: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
  shorts: ["S", "M", "L", "XL", "XLL"],
  socks: ["Small", "Medium", "Large"],
};
const apparelSizeCategories: SizeCategory[] = ["tshirts", "shorts", "socks"];
const isZohoSizeProduct = (productType: ProductType, sizeCategory: SizeCategory | null | undefined) =>
  (productType === "shoe" && isShoeSizeCategory(sizeCategory))
  || (productType === "other" && sizeCategory !== null && sizeCategory !== undefined && apparelSizeCategories.includes(sizeCategory));
const getSizes = (sizeCategory: SizeCategory) => sizesByCategory[sizeCategory];
function getProductType(product: Pick<Product, "product_type" | "name">): ProductType {
  if (product.product_type) return product.product_type;
  return /shoe|sneaker/i.test(product.name) ? "shoe" : "other";
}

function parseOptionList(value: string) {
  return value.split(",").map((option) => option.trim()).filter(Boolean);
}

function getSpecificationRows(specifications?: Record<string, string> | null): ProductSpecification[] {
  const rows = Object.entries(specifications ?? {}).map(([label, value]) => ({ label, value }));
  return rows.length ? rows : [{ label: "", value: "" }];
}

function serializeSpecifications(rows: ProductSpecification[]) {
  const specifications: Record<string, string> = {};
  const labels = new Set<string>();
  for (const row of rows) {
    const label = row.label.trim();
    const value = row.value.trim();
    if (!label && !value) continue;
    if (!label || !value) {
      return { values: undefined, error: "Complete or remove each product specification row." };
    }
    if (labels.has(label.toLocaleLowerCase())) {
      return { values: undefined, error: "Specification names must be unique." };
    }
    labels.add(label.toLocaleLowerCase());
    specifications[label] = value;
  }
  return { values: specifications, error: undefined };
}

function ProductSpecificationsEditor({
  rows,
  onChange,
  idPrefix,
}: {
  rows: ProductSpecification[];
  onChange: (rows: ProductSpecification[]) => void;
  idPrefix: string;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={`${idPrefix}-specification-${index}`} className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]">
          <label className="grid gap-1.5 text-xs font-semibold text-slate-400">
            Specification name
            <input
              value={row.label}
              onChange={(event) => onChange(rows.map((item, rowIndex) => rowIndex === index ? { ...item, label: event.target.value } : item))}
              maxLength={60}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400"
              placeholder="e.g. Material"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-400">
            Specification detail
            <input
              value={row.value}
              onChange={(event) => onChange(rows.map((item, rowIndex) => rowIndex === index ? { ...item, value: event.target.value } : item))}
              maxLength={500}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400"
              placeholder="e.g. Graphite composite"
            />
          </label>
          <button
            type="button"
            onClick={() => onChange(rows.length === 1 ? [{ label: "", value: "" }] : rows.filter((_, rowIndex) => rowIndex !== index))}
            className="self-end rounded-xl border border-slate-700 px-3 py-2.5 text-xs font-semibold text-slate-300 hover:border-rose-400 hover:text-rose-200"
            aria-label={`Remove specification ${index + 1}`}
          >
            Remove
          </button>
        </div>
      ))}
      {rows.length < 30 && (
        <button
          type="button"
          onClick={() => onChange([...rows, { label: "", value: "" }])}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-sky-200 hover:border-sky-400"
        >
          <Plus size={14} /> Add specification
        </button>
      )}
    </div>
  );
}

function ProductTypeSelector({ value, onChange }: { value: ProductType | ""; onChange: (value: ProductType) => void }) {
  const options: Array<{ value: ProductType; label: string; description: string; Icon: typeof Footprints }> = [
    { value: "shoe", label: "Shoes", description: "UK sizes by audience", Icon: Footprints },
    { value: "racquet", label: "Racquets", description: "Color options, no shoe sizes", Icon: CircleDot },
    { value: "other", label: "Accessories & apparel", description: "Optional apparel sizes", Icon: Package },
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

function ZohoSizeSkuSelector({
  category,
  onCategoryChange,
  sizeCategories,
  title,
  sizeStock,
  sizeSkus,
  sizeSyncedAt,
  onChangeSizeSku,
  idPrefix,
}: {
  category: SizeCategory;
  onCategoryChange: (value: SizeCategory) => void;
  sizeCategories: readonly SizeCategory[];
  title: string;
  sizeStock: Record<string, number>;
  sizeSkus: Record<string, string>;
  sizeSyncedAt: Record<string, string>;
  onChangeSizeSku: (size: string, sku: string) => void;
  idPrefix: string;
}) {
  const audiences: Array<{ value: SizeCategory; label: string }> = [
    { value: "junior", label: "Junior" },
    { value: "womens", label: "Women's" },
    { value: "mens", label: "Men's / Unisex" },
    { value: "tshirts", label: "T-shirts" },
    { value: "shorts", label: "Shorts" },
    { value: "socks", label: "Socks" },
  ];

  return (
    <div className="admin-size-stock">
      <div className="admin-size-stock-heading">
        <div>
          <h3>{title}</h3>
          <p>Enter the matching Zoho item SKU for each size. Stock is managed by Zoho and cannot be changed here. Unmapped sizes stay unavailable until synced.</p>
        </div>
        <div className="admin-size-audience" role="group" aria-label="Shoe size range">
          {sizeCategories.length > 1 && audiences.filter((audience) => sizeCategories.includes(audience.value)).map((audience) => <button key={audience.value} type="button" aria-pressed={category === audience.value} onClick={() => onCategoryChange(audience.value)}>{audience.label}</button>)}
        </div>
      </div>
      <div className="admin-size-stock-grid">
        {getSizes(category).map((size) => {
          const quantity = sizeStock[size] ?? 0;
          const hasStock = quantity > 0;
          const sku = sizeSkus[size] ?? "";
          return (
            <div key={`${idPrefix}-${category}-${size}`} className={`admin-size-stock-card${hasStock ? " is-stocked" : ""}`}>
              <div className="admin-size-stock-card-heading">
                <span className="admin-size-label">{size}</span>
                <span className={`admin-size-status${hasStock ? " is-stocked" : ""}`}>{sku ? sizeSyncedAt[size] ? hasStock ? "Zoho stock" : "Out of stock" : "Awaiting sync" : "Add SKU"}</span>
              </div>
              <label className="sr-only" htmlFor={`${idPrefix}-${category}-${size}-sku`}>Zoho SKU for {size}</label>
              <input
                id={`${idPrefix}-${category}-${size}-sku`}
                value={sku}
                onChange={(event) => onChangeSizeSku(size, event.target.value)}
                maxLength={128}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white outline-none focus:border-sky-400"
                placeholder="Zoho item SKU"
              />
              <output className="admin-size-quantity-readonly" aria-label={`${quantity} units for ${size}`}>{quantity}</output>
              {sku && <p className="text-[10px] text-slate-500">Read-only · updated by Zoho sync</p>}
            </div>
          );
        })}
      </div>
      <div className="admin-size-stock-footer">
        <span>Stock managed by Zoho</span>
        <span>{isShoeSizeCategory(category) ? `${getShoeSizes(category)[0]}–${getShoeSizes(category).at(-1)}` : `${getSizes(category).length} sizes`}</span>
      </div>
    </div>
  );
}

const money = (value: number) => `AED ${Number(value).toLocaleString()}`;
const statusLabel = (status: string) => status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

export default function AdminDashboard({ section }: { section: AdminSection }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [paidOrderCount, setPaidOrderCount] = useState(0);
  const [newPaidOrderAlert, setNewPaidOrderAlert] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [lowStockThreshold, setLowStockThreshold] = useState(3);
  const [operationsError, setOperationsError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [editingProductName, setEditingProductName] = useState("");
  const [editingProductBrand, setEditingProductBrand] = useState("");
  const [editingProductPrice, setEditingProductPrice] = useState("");
  const [editingProductCategory, setEditingProductCategory] = useState("Badminton");
  const [editingProductType, setEditingProductType] = useState<ProductType>("other");
  const [editingSizeCategory, setEditingSizeCategory] = useState<SizeCategory | null>("mens");
  const [editingSizeValuesByCategory, setEditingSizeValuesByCategory] = useState<Partial<Record<SizeCategory, SizeEditorValues>>>({});
  const [editingProductSku, setEditingProductSku] = useState("");
  const [editingZohoProductId, setEditingZohoProductId] = useState("");
  const [editingProductColors, setEditingProductColors] = useState("");
  const [editingProductDescription, setEditingProductDescription] = useState("");
  const [editingProductSpecifications, setEditingProductSpecifications] = useState<ProductSpecification[]>([{ label: "", value: "" }]);
  const [editingProductImages, setEditingProductImages] = useState<string[]>([]);
  const [previewProduct, setPreviewProduct] = useState<StoreProduct | null>(null);
  const [savingEditedProductId, setSavingEditedProductId] = useState<number | null>(null);
  const [productNotice, setProductNotice] = useState<string | null>(null);
  const [stockReportError, setStockReportError] = useState<string | null>(null);
  const [downloadingStockReport, setDownloadingStockReport] = useState(false);
  const [syncingInventory, setSyncingInventory] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("");
  const [orderDateFilter, setOrderDateFilter] = useState("");
  const [orderQueueFilter, setOrderQueueFilter] = useState<"all" | "awaiting_payment" | "paid" | "shipped">("all");
  const [productSearch, setProductSearch] = useState("");
  const [productListView, setProductListView] = useState<"recent" | "all">("all");
  const [productVisibility, setProductVisibility] = useState<"all" | "live" | "hidden">("all");
  const [productForm, setProductForm] = useState({
    product_type: "" as ProductType | "",
    size_category: null as SizeCategory | null,
    name: "",
    brand: "",
    category: "Badminton",
    sku: "",
    zoho_product_id: "",
    zoho_size_skus: {} as Record<string, string>,
    price: "",
    image_url: "",
    image_urls: [] as string[],
    description: "",
    specifications: [{ label: "", value: "" }] as ProductSpecification[],
  });
  const [newSizeSkusByCategory, setNewSizeSkusByCategory] = useState<Partial<Record<SizeCategory, Record<string, string>>>>({});
  const [savingProduct, setSavingProduct] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const orderStatusesRef = useRef(new Map<string, string>());
  const hasLoadedOrderSnapshotRef = useRef(false);
  const paidOrderIdsRef = useRef(new Set<string>());
  const hasLoadedPaidOrderIdsRef = useRef(false);

  const visibleOrders = orders.filter((order) => {
    const matchesName = order.customer_name.toLowerCase().includes(orderSearch.trim().toLowerCase());
    const matchesStatus = !orderStatusFilter || order.status === orderStatusFilter;
    const matchesDate = !orderDateFilter || new Date(order.created_at).toISOString().slice(0, 10) === orderDateFilter;
    const matchesQueue = orderQueueFilter === "all" || order.status === orderQueueFilter;
    return matchesName && matchesStatus && matchesDate && matchesQueue;
  });
  const paidOrdersNeedingProcessing = orders.filter((order) => order.status === "paid").length;
  const ordersAwaitingPayment = orders.filter((order) => order.status === "awaiting_payment").length;
  const ordersOnTheWay = orders.filter((order) => order.status === "shipped").length;
  const overdueOrders = getOverdueOrders(orders, now);
  const lowStockProducts = operationsError ? [] : getLowStockProducts(products, lowStockThreshold);
  const editingSizeValues = editingSizeCategory
    ? editingSizeValuesByCategory[editingSizeCategory] ?? { stock: {}, skus: {}, syncedAt: {} }
    : { stock: {}, skus: {}, syncedAt: {} };
  const previewSizes = productForm.size_category ? getSizes(productForm.size_category) : [];
  const productPreview = mapStoreProduct({
    id: -1,
    name: productForm.name.trim() || "Your product name",
    brand: productForm.brand.trim() || "Your brand",
    category: productForm.category,
    price: Number(productForm.price) || 0,
    image_url: productForm.image_url,
    image_urls: productForm.image_urls,
    description: productForm.description.trim(),
    specifications: Object.fromEntries(productForm.specifications.filter(({ label, value }) => label.trim() && value.trim()).map(({ label, value }) => [label.trim(), value.trim()])),
    product_type: productForm.product_type || "other",
    size_category: productForm.size_category,
    sizes: previewSizes,
    size_stock: Object.fromEntries(previewSizes.map((size) => [size, 5])),
    stock: 5,
    stock_status: "verified",
  });
  const previewProductDetails = {
    description: productPreview.description || `${productPreview.name} by ${productPreview.brand || "Al Raed Sports"}. ${({
      Badminton: "Selected for fast footwork, sharp reactions and the rhythm of the rally. A dependable choice for your next training session or match.",
      Tennis: "Court-ready equipment selected to help you find your rhythm from first serve through match point.",
      Squash: "Built for quick movement and close-quarters control. A practical pick for training days and competitive rallies.",
      Accessories: "A considered court-side essential, selected to keep your kit organised and your next session running smoothly.",
    } as Record<string, string>)[productPreview.category] ?? "A court-ready essential, selected for your next session."}`,
    specifications: Object.keys(productPreview.specifications).length > 0
      ? productPreview.specifications
      : { Brand: productPreview.brand || "Al Raed Sports", Category: productPreview.category },
  };
  const productCardPreviews = [
    ...products.filter((product) => product.is_active && product.image_url).slice(0, 2).map((product) => ({
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      price: product.price,
      image: product.image_url ?? "",
      isDraft: false,
    })),
    {
      id: productPreview.id,
      name: productPreview.name,
      brand: productPreview.brand,
      category: productPreview.category,
      price: productPreview.price,
      image: productPreview.image,
      isDraft: true,
    },
  ];

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
        product.sku ?? "",
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
    setProductForm((current) => ({
      ...current,
      size_category: sizeCategory,
      zoho_size_skus: newSizeSkusByCategory[sizeCategory] ?? {},
    }));
  };

  const changeEditingSizeCategory = (sizeCategory: SizeCategory | null) => {
    setEditingSizeCategory(sizeCategory);
  };

  const exportStockReport = async () => {
    setDownloadingStockReport(true);
    setProductNotice(null);
    setStockReportError(null);
    try {
      const { downloadStockReport } = await import("./stock-report");
      const { shoeCount, racketCount } = await downloadStockReport(products);
      setProductNotice(`Stock report downloaded: ${shoeCount} shoe${shoeCount === 1 ? "" : "s"} and ${racketCount} racket${racketCount === 1 ? "" : "s"}.`);
    } catch (error) {
      setStockReportError(error instanceof Error ? error.message : "The stock report could not be generated. Please try again.");
    } finally {
      setDownloadingStockReport(false);
    }
  };

  const applyOrderSnapshot = useCallback((nextOrders: Order[]) => {
    if (hasLoadedOrderSnapshotRef.current) {
      const newPaidOrders = nextOrders.filter((order) => order.status === "paid" && orderStatusesRef.current.get(order.id) !== "paid");
      if (newPaidOrders.length > 0) setNewPaidOrderAlert(newPaidOrders.length);
    }
    orderStatusesRef.current = new Map(nextOrders.map((order) => [order.id, order.status]));
    hasLoadedOrderSnapshotRef.current = true;
    const paidOrders = nextOrders.filter((order) => order.status === "paid");
    paidOrderIdsRef.current = new Set(paidOrders.map((order) => order.id));
    hasLoadedPaidOrderIdsRef.current = true;
    setPaidOrderCount(paidOrders.length);
    setOrders(nextOrders);
  }, []);

  const loadOrders = useCallback(async (token: string) => {
    const response = await fetch("/api/admin/orders", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load orders.");
    applyOrderSnapshot((result.orders ?? []) as Order[]);
  }, [applyOrderSnapshot]);

  const loadFulfillmentOrders = useCallback(async (token: string) => {
    const response = await fetch("/api/admin/orders?view=fulfillment", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load fulfillment orders.");
    applyOrderSnapshot((result.orders ?? []) as Order[]);
  }, [applyOrderSnapshot]);

  const loadProducts = async (token: string) => {
    const response = await fetch("/api/admin/products", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load products.");
    setProducts(result.products ?? []);
    setLowStockThreshold(Number.isInteger(result.lowStockThreshold) ? result.lowStockThreshold : 3);
  };

  useEffect(() => {
    const initialUpdate = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.clearTimeout(initialUpdate);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    return subscribeToAuth(async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setIsAdmin(false);
        hasLoadedOrderSnapshotRef.current = false;
        orderStatusesRef.current.clear();
        paidOrderIdsRef.current.clear();
        hasLoadedPaidOrderIdsRef.current = false;
        setPaidOrderCount(0);
        setOrders([]);
        setNewPaidOrderAlert(0);
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
        if (section === "products") {
          await Promise.all([loadOrders(token), loadProducts(token)]);
        } else if (section === "orders") {
          await loadOrders(token);
          try {
            await loadProducts(token);
            setOperationsError(null);
          } catch (error) {
            setOperationsError(error instanceof Error ? error.message : "Unable to load current inventory warnings.");
          }
        } else if (section === "fulfillment") {
          await loadFulfillmentOrders(token);
        }
      } catch (error) {
        setIsAdmin(false);
        setAuthError(error instanceof Error ? error.message : "Unable to verify admin access.");
      } finally {
        setLoading(false);
      }
    });
  }, [loadFulfillmentOrders, loadOrders, section]);

  useEffect(() => {
    if (!user || !isAdmin || section !== "fulfillment") return;
    let active = true;
    let loadingOrders = false;
    const refreshOrders = async () => {
      if (loadingOrders) return;
      loadingOrders = true;
      try {
        const token = await user.getIdToken();
        await loadFulfillmentOrders(token);
      } catch (error) {
        if (active) setAuthError(error instanceof Error ? error.message : "Unable to refresh fulfillment orders.");
      } finally {
        loadingOrders = false;
      }
    };
    const interval = window.setInterval(() => void refreshOrders(), 20_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [isAdmin, loadFulfillmentOrders, section, user]);

  useEffect(() => {
    if (!user || !isAdmin || section === "fulfillment") return;
    let active = true;
    let loadingNotifications = false;
    const refreshPaidOrderNotifications = async () => {
      if (loadingNotifications) return;
      loadingNotifications = true;
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/admin/orders?view=fulfillment-notifications", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to refresh paid-order notifications.");
        if (!active) return;
        const paidOrderIds = Array.isArray(result.paidOrderIds)
          ? result.paidOrderIds.filter((id: unknown): id is string => typeof id === "string")
          : [];
        if (hasLoadedPaidOrderIdsRef.current) {
          const newlyPaidCount = paidOrderIds.filter((id: string) => !paidOrderIdsRef.current.has(id)).length;
          if (newlyPaidCount > 0) setNewPaidOrderAlert(newlyPaidCount);
        }
        paidOrderIdsRef.current = new Set(paidOrderIds);
        hasLoadedPaidOrderIdsRef.current = true;
        setPaidOrderCount(paidOrderIds.length);
      } catch (error) {
        if (active) setAuthError(error instanceof Error ? error.message : "Unable to refresh paid-order notifications.");
      } finally {
        loadingNotifications = false;
      }
    };
    void refreshPaidOrderNotifications();
    const interval = window.setInterval(() => void refreshPaidOrderNotifications(), 20_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [isAdmin, section, user]);

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

  const updateOrderStatus = async (orderId: string, status: string): Promise<boolean> => {
    if (!user) return false;
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
      try {
        if (section === "fulfillment") await loadFulfillmentOrders(token);
        else await loadOrders(token);
      } catch {
        setAuthError("Order status was updated, but its history could not be refreshed. Reload the page to verify the latest activity.");
      }
      return true;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to update order.");
      return false;
    } finally {
      setBusyOrderId(null);
    }
  };

  const recordZohoInvoice = async (orderId: string) => {
    if (!user || !window.confirm("Only continue after you have created this order's invoice in Zoho. This action records the invoice date but does not create an invoice. Have you created it?")) return;
    setBusyOrderId(orderId);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, recordZohoInvoice: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to record the Zoho invoice.");
      setOrders((current) => current.map((order) => order.id === orderId
        ? { ...order, zoho_invoice_recorded_at: result.order.zoho_invoice_recorded_at }
        : order));
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to record the Zoho invoice.");
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
    const hasMappedSizeSku = Object.values(productForm.zoho_size_skus).some((sku) => sku.trim().length > 0);
    if (isZohoSizeProduct(productForm.product_type, productForm.size_category) && !hasMappedSizeSku) {
      setAuthError("Add a Zoho SKU to at least one size. Stock is managed by Zoho.");
      return;
    }
    if (!isZohoSizeProduct(productForm.product_type, productForm.size_category) && !productForm.sku.trim() && !productForm.zoho_product_id.trim()) {
      setAuthError("Enter the exact Zoho SKU or item ID. Stock is managed by Zoho.");
      return;
    }
    const specifications = serializeSpecifications(productForm.specifications);
    if (specifications.error) {
      setAuthError(specifications.error);
      return;
    }
    setSavingProduct(true);
    setAuthError(null);

    try {
      const token = await user.getIdToken();
      const payload = {
        ...productForm,
        sku: productForm.sku.trim(),
        zoho_product_id: productForm.zoho_product_id.trim(),
        price: Number(productForm.price),
        description: productForm.description.trim(),
        specifications: specifications.values,
      };

      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save product.");

      setProducts((current) => [result.product, ...current]);
      setNewSizeSkusByCategory({});
      setProductForm({
        product_type: "",
        size_category: null,
        name: "",
        brand: "",
        category: "Badminton",
        sku: "",
        zoho_product_id: "",
        zoho_size_skus: {},
        price: "",
        image_url: "",
        image_urls: [],
        description: "",
        specifications: [{ label: "", value: "" }],
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
      const updatedSizes = Number(result.updatedSizeCount ?? 0);
      const sizeSummary = updatedSizes > 0 ? ` (${updatedSizes} shoe size${updatedSizes === 1 ? "" : "s"} synced)` : "";
      setProductNotice(`Zoho stock synced for ${result.updatedProductCount} mapped product${result.updatedProductCount === 1 ? "" : "s"}${sizeSummary}.${unmatchedSummary}`);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sync Zoho stock.");
    } finally {
      setSyncingInventory(false);
    }
  };

  const uploadProductImage = async (file?: File, manageUploadingState = true, editingProductId?: number): Promise<boolean> => {
    if (!user || !file) return false;
    if (manageUploadingState) setUploadingImage(true);
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
      if (editingProductId === undefined) {
        setProductForm((current) => ({
          ...current,
          image_url: current.image_url || result.imageUrl,
          image_urls: [...current.image_urls, result.imageUrl],
        }));
      } else {
        setEditingProductImages((current) => [...current, result.imageUrl]);
      }
      return true;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to upload product image.");
      return false;
    } finally {
      if (manageUploadingState) setUploadingImage(false);
    }
  };

  const uploadProductImages = async (fileList?: FileList | null, editingProductId?: number) => {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    const currentImages = editingProductId === undefined ? productForm.image_urls : editingProductImages;
    if (currentImages.length + files.length > 10) {
      setAuthError("A product can have up to 10 images.");
      return;
    }
    setUploadingImage(true);
    setAuthError(null);
    try {
      for (const file of files) {
        if (!await uploadProductImage(file, false, editingProductId)) break;
      }
    } finally {
      setUploadingImage(false);
    }
  };

  const toggleProductEditor = (product: Product) => {
    if (uploadingImage) return;
    if (editingProductId === product.id) {
      setEditingProductId(null);
      return;
    }
    const sizeCategory = product.size_category ?? (getProductType(product) === "shoe" ? "mens" : null);
    setEditingProductId(product.id);
    setEditingProductType(getProductType(product));
    setEditingSizeCategory(sizeCategory);
    setEditingSizeValuesByCategory(sizeCategory ? {
      [sizeCategory]: {
        stock: product.size_stock ?? {},
        skus: product.zoho_size_skus ?? {},
        syncedAt: product.zoho_size_stock_synced_at ?? {},
      },
    } : {});
    setEditingProductName(product.name);
    setEditingProductBrand(product.brand);
    setEditingProductPrice(String(product.price));
    setEditingProductCategory(productCategories.includes(product.category) ? product.category : "Accessories");
    setEditingProductSku(product.sku ?? "");
    setEditingZohoProductId(product.zoho_product_id ?? "");
    setEditingProductColors(product.colors?.join(", ") ?? "");
    setEditingProductDescription(product.description ?? "");
    setEditingProductSpecifications(getSpecificationRows(product.specifications));
    setEditingProductImages(product.image_urls?.length ? product.image_urls : product.image_url ? [product.image_url] : []);
  };

  const saveProductEditor = async (product: Product, isActive = Boolean(product.is_active)) => {
    if (!user) return;
    const name = editingProductName.trim();
    const brand = editingProductBrand.trim();
    const price = Number(editingProductPrice);
    if (!name || !brand || !productCategories.includes(editingProductCategory)) {
      setAuthError("Enter a product name, brand, and valid category.");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setAuthError("Enter a valid product price.");
      return;
    }
    if (isZohoSizeProduct(editingProductType, editingSizeCategory) && !Object.values(editingSizeValues.skus).some((sku) => sku.trim())) {
      setAuthError("Add a Zoho SKU to at least one size. Stock is managed by Zoho.");
      return;
    }
    if (!isZohoSizeProduct(editingProductType, editingSizeCategory) && !editingProductSku.trim() && !editingZohoProductId.trim()) {
      setAuthError("Enter the exact Zoho SKU or item ID. Stock is managed by Zoho.");
      return;
    }
    const specifications = serializeSpecifications(editingProductSpecifications);
    if (specifications.error) {
      setAuthError(specifications.error);
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
          image_url: editingProductImages[0] ?? "",
          image_urls: editingProductImages,
          product_type: editingProductType,
          size_category: isZohoSizeProduct(editingProductType, editingSizeCategory) ? editingSizeCategory : null,
          name,
          brand,
          price,
          category: editingProductCategory,
          sku: editingProductSku,
          zoho_product_id: editingZohoProductId,
          colors: editingProductType === "racquet" ? parseOptionList(editingProductColors) : [],
          description: editingProductDescription.trim(),
          specifications: specifications.values,
          ...(editingProductType === "shoe"
            ? {
            zoho_size_skus: editingSizeValues.skus,
            }
          : { sizes: [], unavailable_sizes: [] }),
          is_active: isActive,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save product changes.");
      setProducts((current) => current.map((item) => item.id === product.id ? result.product : item));
      setProductNotice(isActive === Boolean(product.is_active)
        ? `${name} changes saved.`
        : `${name} ${isActive ? "is now published" : "has been hidden"}.`);
      setEditingProductId(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to save product changes.");
    } finally {
      setSavingEditedProductId(null);
    }
  };

  const activeSection = adminSections.find((item) => item.id === section) ?? adminSections[0];

  if (!user && !loading) {
    return (
      <main className="admin-dashboard admin-gate min-h-screen flex items-center justify-center px-6">
        <div className="admin-gate-card max-w-lg w-full rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-sky-300">Admin access required</p>
          <h1 className="text-4xl font-black tracking-tight mb-4">Al Raed Sports Commerce</h1>
          <p className="mb-6 text-sm text-slate-300">Only the approved admin account can access this dashboard.</p>
          {authError && <div role="alert" className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{authError}</div>}
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
      <main className="admin-dashboard admin-gate min-h-screen flex items-center justify-center">
        <div className="admin-loading"><span aria-hidden="true" />Checking admin access...</div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="admin-dashboard admin-gate min-h-screen flex items-center justify-center px-6">
        <div className="admin-gate-card admin-gate-denied max-w-lg w-full rounded-3xl border border-rose-500/30 bg-slate-900 p-8">
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
    <main className="admin-dashboard min-h-screen">
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <Link href="/" className="admin-brand" aria-label="Al Raed Sports home">
            <img className="admin-brand-mark" src="/IMG_8477.jpg%2010-33-16-710.jpg" alt="" />
            <span className="admin-brand-name"><strong>AL RAED</strong><small>SPORTS COMMERCE</small></span>
          </Link>
          <p className="admin-sidebar-label">WORKSPACE</p>
          <nav aria-label="Admin pages" className="admin-nav">
            {adminSections.map(({ id, href, label, description, Icon }) => (
              <Link key={id} href={href} aria-current={section === id ? "page" : undefined} className={`admin-nav-link${section === id ? " is-active" : ""}`}>
                <span className="admin-nav-icon"><Icon size={18} aria-hidden="true" /></span>
                <span className="admin-nav-copy"><strong>{label}</strong><small>{description}</small></span>
                {id === "fulfillment" && paidOrderCount > 0 && (
                  <span className="admin-nav-count" aria-label={`${paidOrderCount} paid orders to pack`} aria-live="polite">
                    {paidOrderCount}
                  </span>
                )}
                {section === id && <span className="admin-nav-indicator" aria-hidden="true" />}
              </Link>
            ))}
          </nav>
          <div className="admin-sidebar-footer">
            <span className="admin-status-dot" aria-hidden="true" />
            <span><strong>Admin access</strong><small>Secure workspace</small></span>
          </div>
        </aside>

        <div className="admin-main">
          <header className="admin-topbar">
            <div className="admin-breadcrumb"><span>Workspace</span><ArrowRight size={13} aria-hidden="true" /><strong>{activeSection.label}</strong></div>
            <div className="admin-topbar-actions">
              <Link href="/" className="admin-store-link">View storefront <ArrowRight size={14} aria-hidden="true" /></Link>
              <span className="admin-user">
                <span className="admin-user-avatar">{(user?.displayName || user?.email || "A").slice(0, 1).toUpperCase()}</span>
                <span className="admin-user-copy"><strong>{user?.displayName || "Administrator"}</strong><small>{user?.email}</small></span>
              </span>
              <button type="button" onClick={() => void handleLogout()} className="admin-logout"><LogOut size={15} aria-hidden="true" /><span>Sign out</span></button>
            </div>
          </header>

          <div className="admin-content">
            <div className="admin-page-heading">
              <div>
                <p className="admin-page-eyebrow">AL RAED <span>/</span> ADMINISTRATION</p>
                <h1>{activeSection.label}</h1>
                <p>{sectionIntros[section]}</p>
              </div>
            </div>

        {authError && <div role="alert" className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{authError}</div>}

        {section === "posters" && user && <HomeCampaignManager user={user} />}
        {section === "coupons" && user && <CouponManager user={user} />}
        {section === "insights" && user && <InsightsDashboard user={user} />}
        {section === "activity" && user && <ActivityLog user={user} />}
        {section === "fulfillment" && <OrderFulfillmentBoard
          orders={orders}
          busyOrderId={busyOrderId}
          newPaidOrderAlert={newPaidOrderAlert}
          onDismissAlert={() => setNewPaidOrderAlert(0)}
          onStatusChange={updateOrderStatus}
        />}

        {section === "orders" && <section id="customer-orders" className="mb-8 scroll-mt-6 rounded-3xl border border-sky-400/20 bg-slate-900 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Order management</p>
              <h2 className="mt-1 text-xl font-bold">Customer orders</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300">{visibleOrders.length} of {orders.length}</span>
              {orders.length > 0
                ? <OrdersExportButton orders={orders} />
                : <button type="button" disabled className="inline-flex cursor-not-allowed items-center gap-2 rounded-full bg-sky-500 px-3 py-2 text-xs font-semibold text-slate-950 opacity-50" aria-label="Export all orders as an Excel workbook"><FileSpreadsheet size={15} aria-hidden="true" />No orders to export</button>}
            </div>
          </div>

          <section className="admin-operations-panel mb-5" aria-label="Operational alerts">
            <div className="admin-operations-heading">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">Operational visibility</p>
                <h3 className="mt-1 text-base font-bold text-white">Needs attention</h3>
              </div>
              <span className="text-xs text-slate-400">Processing &gt; 24 hours · delivery &gt; 3 days · stock ≤ {lowStockThreshold}</span>
            </div>
            {operationsError && <p className="admin-operations-error" role="alert">Inventory warnings unavailable: {operationsError}</p>}
            <div className="admin-operations-grid">
              <article className="admin-operations-card">
                <div className="admin-operations-card-heading">
                  <Clock3 size={16} aria-hidden="true" />
                  <strong>Processing overdue</strong>
                  <span>{overdueOrders.processing.length}</span>
                </div>
                {overdueOrders.processing.length === 0 ? <p className="admin-operations-empty">No paid orders overdue for processing.</p> : (
                  <ul>
                    {overdueOrders.processing.slice(0, 4).map((order) => {
                      const paidAt = order.stripe_paid_at ?? order.status_history?.find((entry) => entry.new_status === "paid")?.changed_at;
                      return (
                        <li key={order.id}>
                          <button type="button" onClick={() => {
                            setOrderSearch(order.customer_name);
                            setOrderStatusFilter("");
                            setOrderDateFilter("");
                            setOrderQueueFilter("all");
                          }}>
                            <span>#{order.id.slice(0, 8).toUpperCase()} · {order.customer_name}</span>
                            <small>Paid {paidAt ? new Date(paidAt).toLocaleString() : "date unavailable"}</small>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </article>
              <article className="admin-operations-card">
                <div className="admin-operations-card-heading">
                  <PackageCheck size={16} aria-hidden="true" />
                  <strong>Delivery follow-up</strong>
                  <span>{overdueOrders.delivery.length}</span>
                </div>
                {overdueOrders.delivery.length === 0 ? <p className="admin-operations-empty">No shipped orders overdue for delivery.</p> : (
                  <ul>
                    {overdueOrders.delivery.slice(0, 4).map((order) => {
                      const shippedAt = order.status_history?.find((entry) => entry.new_status === "shipped")?.changed_at;
                      return (
                        <li key={order.id}>
                          <button type="button" onClick={() => {
                            setOrderSearch(order.customer_name);
                            setOrderStatusFilter("");
                            setOrderDateFilter("");
                            setOrderQueueFilter("all");
                          }}>
                            <span>#{order.id.slice(0, 8).toUpperCase()} · {order.customer_name}</span>
                            <small>Shipped {shippedAt ? new Date(shippedAt).toLocaleString() : "date unavailable"}</small>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </article>
              <article className="admin-operations-card">
                <div className="admin-operations-card-heading">
                  <AlertTriangle size={16} aria-hidden="true" />
                  <strong>Low stock</strong>
                  <span>{operationsError ? "—" : lowStockProducts.length}</span>
                </div>
                {operationsError ? <p className="admin-operations-empty">Current stock could not be loaded.</p> : lowStockProducts.length === 0 ? <p className="admin-operations-empty">No active products are at or below the threshold.</p> : (
                  <ul>
                    {lowStockProducts.slice(0, 4).map((product) => (
                      <li key={product.id}>
                        <Link href="/admin/products">
                          <span>{product.name}</span>
                          <small>{product.stock} unit{product.stock === 1 ? "" : "s"} remaining</small>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </div>
            {(overdueOrders.processing.length > 4 || overdueOrders.delivery.length > 4 || lowStockProducts.length > 4) && (
              <p className="admin-operations-overflow">Showing the first 4 items in each alert. Use the order and product lists to review the rest.</p>
            )}
          </section>

          <div className="admin-order-queues mb-4" role="group" aria-label="Order queues">
            {([
              { id: "all", label: "All orders", count: orders.length },
              { id: "awaiting_payment", label: "Awaiting payment", count: ordersAwaitingPayment },
              { id: "paid", label: "Needs processing", count: paidOrdersNeedingProcessing },
              { id: "shipped", label: "In delivery", count: ordersOnTheWay },
            ] as const).map((queue) => (
              <button
                type="button"
                key={queue.id}
                className={`admin-order-queue${orderQueueFilter === queue.id ? " is-active" : ""}`}
                onClick={() => { setOrderQueueFilter(queue.id); setOrderStatusFilter(""); }}
                aria-pressed={orderQueueFilter === queue.id}
              >
                <span>{queue.label}</span><strong>{queue.count}</strong>
              </button>
            ))}
            <p>Paid orders need customer confirmation and an invoice before you start processing.</p>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(170px,220px)_minmax(170px,220px)]">
            <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 text-slate-400">
              <Search size={16} />
              <input value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} className="w-full bg-transparent py-2.5 text-sm text-white outline-none" placeholder="Search customer name" aria-label="Search customer by name" />
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 text-slate-400">
              <Filter size={16} />
              <select value={orderStatusFilter} onChange={(event) => { setOrderStatusFilter(event.target.value); setOrderQueueFilter("all"); }} className="w-full bg-transparent py-2.5 text-sm text-white outline-none" aria-label="Filter orders by status">
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
            {orders.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">No orders yet.</div> : visibleOrders.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">{orderQueueFilter === "paid" ? "No paid orders are waiting for processing." : "No orders match these filters."}</div> : visibleOrders.map((order) => (
              <div key={order.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Order #{order.id.slice(0, 8).toUpperCase()}</div>
                    <div className="mt-1 text-lg font-bold text-white">{order.customer_name}</div>
                    <div className="text-sm text-slate-400">{order.customer_phone || "Phone unavailable"} · {order.city || "City not set"}</div>
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

                {(order.status === "paid" || order.status === "processing" || order.status === "shipped" || order.status === "delivered" || order.stripe_payment_intent_id || order.stripe_paid_at) && (
                  <div className="admin-payment-confirmation mt-3 grid gap-1 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-3 text-sm text-emerald-100">
                    <strong>Payment confirmed{order.stripe_payment_method ? ` · ${order.stripe_payment_method}` : ""}</strong>
                    {order.stripe_paid_at && <span className="text-xs text-emerald-200/70">Paid {new Date(order.stripe_paid_at).toLocaleString()}</span>}
                    {order.stripe_payment_intent_id && <span className="break-all text-xs text-emerald-200/70">Stripe reference: {order.stripe_payment_intent_id}</span>}
                  </div>
                )}

                {(order.status === "paid" || order.status === "processing" || order.status === "shipped" || order.status === "delivered") && (
                  <div className="admin-order-action-panel mt-3 rounded-xl border border-sky-900/60 bg-sky-950/20 p-3 text-sm text-sky-100">
                    <span className="admin-order-action-copy">{order.zoho_invoice_recorded_at
                      ? `Zoho invoice recorded ${new Date(order.zoho_invoice_recorded_at).toLocaleString()}`
                      : "After creating this order’s invoice manually in Zoho, record it here as an administrative reference."}</span>
                    <div className="admin-order-action-buttons">
                      {!order.zoho_invoice_recorded_at && (
                        <button
                          type="button"
                          onClick={() => void recordZohoInvoice(order.id)}
                          disabled={busyOrderId === order.id}
                          className="admin-action-button admin-action-secondary"
                        >
                          {busyOrderId === order.id ? "Recording…" : "Record Zoho invoice"}
                        </button>
                      )}
                      {(() => {
                        const whatsappHref = createWhatsAppOrderConfirmationLink(order);
                        const recipientIsValid = Boolean(order.customer_phone && normalizeWhatsAppPhone(order.customer_phone));
                        const canOpenWhatsApp = order.whatsapp_order_updates_opt_in && Boolean(whatsappHref);
                        const unavailableReason = !order.whatsapp_order_updates_opt_in
                          ? "Customer has not opted in to WhatsApp order updates."
                          : !recipientIsValid
                            ? "A valid customer WhatsApp number is not available."
                            : "Complete order items are not available for a confirmation message.";

                        return canOpenWhatsApp ? (
                          <a
                            href={whatsappHref ?? undefined}
                            target="_blank"
                            rel="noreferrer"
                            className="admin-action-button admin-action-whatsapp"
                            aria-label={`Open WhatsApp confirmation for ${order.customer_name}`}
                          >
                            <MessageCircle size={16} aria-hidden="true" />
                            WhatsApp confirmation
                          </a>
                        ) : (
                          <div className="admin-whatsapp-unavailable">
                            <button
                              type="button"
                              disabled
                              title={unavailableReason}
                              className="admin-action-button admin-action-secondary"
                            >
                              <MessageCircle size={16} aria-hidden="true" />
                              WhatsApp unavailable
                            </button>
                            <span className="text-xs text-amber-200">{unavailableReason}</span>
                          </div>
                        );
                      })()}
                      {order.status === "paid" && (
                        <button
                          type="button"
                          onClick={() => void updateOrderStatus(order.id, "processing")}
                          disabled={busyOrderId === order.id}
                          className="admin-action-button admin-action-primary"
                        >
                          <PackageCheck size={15} aria-hidden="true" />
                          {busyOrderId === order.id ? "Updating…" : "Start processing"}
                        </button>
                      )}
                    </div>
                    <p className="admin-order-action-note text-xs text-slate-400">
                      When available, review and send the WhatsApp draft from the admin account ({ALRAED_WHATSAPP_CONTACT}). Mark processing after the customer has been contacted.
                    </p>
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

                <details className="admin-status-history">
                  <summary><Clock3 size={14} aria-hidden="true" />Status history <span>{order.status_history?.length ?? 0}</span></summary>
                  {order.status_history?.length ? (
                    <ol>
                      {[...order.status_history].reverse().map((entry) => (
                        <li key={entry.id}>
                          <strong>{statusLabel(entry.previous_status)} <ArrowRight size={12} aria-hidden="true" /> {statusLabel(entry.new_status)}</strong>
                          <span>{entry.changed_by_email || "Automated system"} · {new Date(entry.changed_at).toLocaleString()}</span>
                        </li>
                      ))}
                    </ol>
                  ) : <p>No tracked status changes. Older changes from before audit tracking are not available.</p>}
                </details>
              </div>
            ))}
          </div>
        </section>}

        {section === "products" && <div className="grid gap-6 xl:grid-cols-[1.1fr_1.6fr]">
          <section id="add-product" className="scroll-mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300">Product setup</p><h2 className="mt-1 text-xl font-bold">Add a product</h2><p className="mt-1 text-xs text-slate-400">Choose a type first to get the right options.</p></div>
              <Plus size={18} className="mt-1 text-sky-300" />
            </div>
            <div className="space-y-5">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">1. What are you adding?</h3>
                <ProductTypeSelector value={productForm.product_type} onChange={(product_type) => {
                  setNewSizeSkusByCategory({});
                  setProductForm((current) => ({
                    ...current,
                    product_type,
                    size_category: product_type === "shoe" ? (isShoeSizeCategory(current.size_category) ? current.size_category : "mens") : null,
                    zoho_size_skus: {},
                  }));
                }} />
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
                  {productForm.product_type === "other" && <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Product sizes
                    <select value={apparelSizeCategories.includes(productForm.size_category as SizeCategory) ? productForm.size_category! : ""} onChange={(event) => {
                      const category = event.target.value as SizeCategory | "";
                      setProductForm((current) => ({
                        ...current,
                        size_category: category || null,
                        zoho_size_skus: category ? newSizeSkusByCategory[category] ?? {} : {},
                      }));
                    }} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white">
                      <option value="">No size (racquets & accessories)</option>
                      <option value="tshirts">T-shirts</option>
                      <option value="shorts">Shorts</option>
                      <option value="socks">Socks</option>
                    </select>
                  </label>}
                  {productForm.product_type && isZohoSizeProduct(productForm.product_type, productForm.size_category) && productForm.size_category && (
                    <ZohoSizeSkuSelector
                      category={productForm.size_category}
                      onCategoryChange={changeFormSizeCategory}
                      sizeCategories={productForm.product_type === "shoe" ? shoeSizeCategories : [productForm.size_category]}
                      title={productForm.product_type === "shoe" ? "Zoho stock by shoe size" : "Zoho stock by apparel size"}
                      sizeStock={{}}
                      sizeSkus={productForm.zoho_size_skus}
                      sizeSyncedAt={{}}
                      onChangeSizeSku={(size, sku) => {
                        const category = productForm.size_category;
                        if (!category) return;
                        setProductForm((current) => ({
                          ...current,
                          zoho_size_skus: { ...current.zoho_size_skus, [size]: sku },
                        }));
                        setNewSizeSkusByCategory((current) => ({
                          ...current,
                          [category]: { ...(current[category] ?? {}), [size]: sku },
                        }));
                      }}
                      idPrefix="new-size"
                    />
                  )}
                  {!isZohoSizeProduct(productForm.product_type, productForm.size_category) && productForm.product_type !== "shoe" && <section className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Zoho SKU <span className="font-normal text-slate-500">Exact match</span>
                      <input value={productForm.sku} onChange={(event) => setProductForm((current) => ({ ...current, sku: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" placeholder="Zoho SKU" />
                    </label>
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Zoho product ID <span className="font-normal text-slate-500">Admin only</span>
                      <input value={productForm.zoho_product_id} onChange={(event) => setProductForm((current) => ({ ...current, zoho_product_id: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" placeholder="Zoho product ID" />
                    </label>
                    <p className="text-[11px] text-slate-500 sm:col-span-2">Enter the exact Zoho SKU or item ID. Stock is managed by Zoho and will appear after sync.</p>
                  </section>}
                  <section className="grid gap-3 sm:grid-cols-3">
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Sports category
                      <select value={productForm.category} onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white">
                        {productCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Price (AED)
                      <input value={productForm.price} onChange={(event) => setProductForm((current) => ({ ...current, price: event.target.value }))} type="number" min="0" step="0.01" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" placeholder="0.00" />
                    </label>
                  </section>
                  <section className="space-y-3">
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Product description
                      <textarea value={productForm.description} onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))} maxLength={3000} rows={4} className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400" placeholder="Describe the product and its benefits for shoppers." />
                    </label>
                    <div className="space-y-2">
                      <div><h3 className="text-xs font-semibold text-slate-300">Technical specifications</h3><p className="mt-1 text-[11px] text-slate-500">Add the details you want customers to see, such as material, weight, balance, or fit.</p></div>
                      <ProductSpecificationsEditor rows={productForm.specifications} onChange={(specifications) => setProductForm((current) => ({ ...current, specifications }))} idPrefix="new-product" />
                    </div>
                  </section>
                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Product image</h3>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-300 hover:border-sky-400">
                      <ImagePlus size={18} className="shrink-0 text-sky-300" />
                      <span className="min-w-0 flex-1 truncate">{uploadingImage ? "Uploading images..." : productForm.image_urls.length ? `${productForm.image_urls.length} of 10 images · Add more` : "Upload JPG, PNG or WebP · max 5 MB each · up to 10 images"}</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={uploadingImage} onChange={(event) => { void uploadProductImages(event.target.files); event.target.value = ""; }} />
                    </label>
                    {productForm.image_urls.length > 0 && <div className="admin-product-image-list">
                      {productForm.image_urls.map((imageUrl, index) => (
                        <div className="admin-product-image-item" key={imageUrl}>
                          <img src={imageUrl} alt={`Product image ${index + 1}`} />
                          <div>
                            <strong>{index === 0 ? "Cover image" : `Image ${index + 1}`}</strong>
                            {index !== 0 && <button type="button" onClick={() => setProductForm((current) => ({ ...current, image_url: imageUrl, image_urls: [imageUrl, ...current.image_urls.filter((image) => image !== imageUrl)] }))}>Make cover</button>}
                            <button type="button" aria-label={`Remove product image ${index + 1}`} onClick={() => setProductForm((current) => {
                              const image_urls = current.image_urls.filter((image) => image !== imageUrl);
                              return { ...current, image_urls, image_url: current.image_url === imageUrl ? image_urls[0] ?? "" : current.image_url };
                            })}>Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>}
                    <p className="text-[11px] leading-relaxed text-slate-500">Images keep their original proportions and fit inside the store frames without being cropped. A sharp, centered square or portrait photo on a clean background works best.</p>
                  </section>
                  <section className="admin-product-live-previews" aria-label="Live storefront previews">
                    <div className="admin-product-live-previews-heading">
                      <div><h3>Live storefront preview</h3><p>Updates as you edit. See the draft beside live products, then click it to open the full details.</p></div>
                      <span>PREVIEW ONLY</span>
                    </div>
                    <div className="admin-product-preview-grid">
                      <article className="admin-product-preview-panel">
                        <h4>Shopping page card</h4>
                        <div className="admin-storefront-card-preview ar-store">
                          <div className="admin-storefront-card-grid">
                            {productCardPreviews.map((preview) => (
                              <article className={`ar-shop-product${preview.isDraft ? " is-draft" : ""}`} key={preview.id}>
                                <div className="ar-shop-product-image">
                                  {preview.isDraft ? <button type="button" className="ar-shop-product-open" onClick={() => setPreviewProduct(productPreview)} aria-label="Open product details preview">
                                    {preview.image ? <img src={preview.image} alt="" /> : <span className="ar-product-placeholder">AL RAED<br />SPORTS</span>}
                                  </button> : preview.image ? <img src={preview.image} alt="" /> : <span className="ar-product-placeholder">AL RAED<br />SPORTS</span>}
                                </div>
                                <div className="ar-shop-product-copy">
                                  <div className="ar-shop-product-meta"><span>{preview.brand || "AL RAED SPORTS"}</span><span>{preview.category.toUpperCase()}</span></div>
                                  {preview.isDraft ? <button className="ar-shop-product-title" type="button" onClick={() => setPreviewProduct(productPreview)}>{preview.name.replace(/^\[TEST\]\s*/, "")}</button> : <strong className="admin-storefront-preview-title">{preview.name}</strong>}
                                  <div className="ar-shop-product-bottom"><strong>{money(preview.price)}</strong></div>
                                </div>
                              </article>
                            ))}
                          </div>
                        </div>
                      </article>
                      <article className="admin-product-preview-panel">
                        <h4>Product details box</h4>
                        <div className="admin-storefront-detail-preview ar-store">
                          <div className="ar-product-detail-visual">
                            {productPreview.image ? <img src={productPreview.image} alt="" /> : <span className="ar-product-placeholder">AL RAED<br />SPORTS</span>}
                            <span className="ar-product-detail-category">{productPreview.category}</span>
                          </div>
                          <section className="ar-product-detail-content">
                            <p className="ar-eyebrow">{productPreview.brand || "AL RAED SPORTS"} · {productPreview.category.toUpperCase()}</p>
                            <h2>{productPreview.name.replace(/^\[TEST\]\s*/, "")}</h2>
                            <p className="ar-product-detail-description">{previewProductDetails.description}</p>
                            <div className="ar-product-detail-price"><strong>{money(productPreview.price)}</strong><span className="is-in-stock">IN STOCK</span></div>
                            <div className="admin-product-preview-specs">
                              {Object.entries(previewProductDetails.specifications).slice(0, 2).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
                            </div>
                            <p className="admin-product-preview-note">Click the shopping card to test the full details dialog.</p>
                          </section>
                        </div>
                      </article>
                    </div>
                  </section>
                  <button type="button" onClick={() => void saveProduct()} disabled={savingProduct || uploadingImage || !productForm.image_url} className="admin-action-button admin-action-primary w-full">
                    <Save size={16} aria-hidden="true" />
                    {savingProduct ? "Saving product..." : "Save product"}
                  </button>
                </>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="admin-product-toolbar mb-4">
              <div className="admin-product-toolbar-heading">
                <h2 className="text-xl font-bold">Current products</h2>
                <span className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300">{visibleProducts.length} shown · {products.length} total</span>
              </div>
              <div className="admin-product-toolbar-actions">
                <button type="button" onClick={() => void exportStockReport()} disabled={downloadingStockReport || products.length === 0} className="admin-action-button admin-action-secondary" aria-label="Download stock report as an Excel workbook">
                  <FileSpreadsheet size={15} aria-hidden="true" />
                  {downloadingStockReport ? "Preparing report..." : "Download stock report"}
                </button>
                <button type="button" onClick={() => void syncZohoInventory()} disabled={syncingInventory} className="admin-action-button admin-action-primary">
                  <RefreshCw size={14} className={syncingInventory ? "animate-spin" : ""} />
                  {syncingInventory ? "Syncing Zoho..." : "Sync Zoho stock"}
                </button>
              </div>
            </div>
            {productNotice && <div className="admin-zoho-stock-confirmation mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200" role="status">{productNotice}</div>}
            {stockReportError && <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" role="alert">{stockReportError}</div>}
            <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 text-slate-400">
                <Search size={16} />
                <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} className="w-full bg-transparent py-2.5 text-sm text-white outline-none" placeholder="Search name, brand, category, product ID, Zoho SKU or Zoho product ID" aria-label="Search products by name, brand, category, product ID, Zoho SKU, or Zoho product ID" />
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
                  <button type="button" onClick={() => toggleProductEditor(product)} disabled={uploadingImage} aria-expanded={editingProductId === product.id} className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-slate-900 disabled:cursor-wait disabled:opacity-60">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-800">
                      {product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">IMG</div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-white">{product.name}</div>
                      <div className="text-xs text-slate-400">{product.brand} · {product.category} · {getProductType(product)} · {product.is_active ? "Live" : "Hidden"} · SKU: {product.sku || "not linked"}</div>
                      <div className="mt-1 text-[11px] text-slate-500">Product ID: {product.id} · Zoho Product ID: {product.zoho_product_id || "not linked"}</div>
                      <div className="mt-1 text-xs text-sky-200">{money(product.price)} · Stock: {product.stock}</div>
                      {product.size_stock && Object.keys(product.size_stock).length ? <div className="mt-1 text-[11px] text-slate-400">By size: {Object.entries(product.size_stock).filter(([, quantity]) => quantity > 0).map(([size, quantity]) => `${size}: ${quantity}`).join(" · ") || "All sizes out of stock"}</div> : (product.colors?.length || product.sizes?.length) ? <div className="mt-1 text-[11px] text-slate-400">{product.colors?.length ? `Colors: ${product.colors.join(", ")}` : ""}{product.colors?.length && product.sizes?.length ? " · " : ""}{product.sizes?.length ? `Sizes: ${product.sizes.join(", ")}` : ""}{product.unavailable_sizes?.length ? ` · Out of stock: ${product.unavailable_sizes.join(", ")}` : ""}</div> : null}
                      {product.zoho_stock_synced_at && <div className="mt-1 text-[11px] text-slate-500">Zoho synced {new Date(product.zoho_stock_synced_at).toLocaleString()}</div>}
                    </div>
                    {editingProductId === product.id ? <ChevronUp size={18} className="shrink-0 text-slate-400" /> : <ChevronDown size={18} className="shrink-0 text-slate-400" />}
                  </button>
                  {editingProductId === product.id && (
                    <div className="grid gap-4 border-t border-slate-800 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(190px,0.7fr)]">
                      <div className="space-y-2 sm:col-span-2">
                        <span className="text-xs font-semibold text-slate-400">Product type</span>
                        <ProductTypeSelector value={editingProductType} onChange={(productType) => {
                          if (productType === editingProductType) return;
                          setEditingProductType(productType);
                          setEditingSizeCategory(productType === "shoe" ? (isShoeSizeCategory(editingSizeCategory) ? editingSizeCategory : "mens") : (editingSizeCategory && apparelSizeCategories.includes(editingSizeCategory) ? editingSizeCategory : productType === "other" ? "tshirts" : null));
                          setEditingSizeValuesByCategory({});
                        }} />
                      </div>
                      <label className="grid gap-2 text-xs font-semibold text-slate-400">
                        Product name
                        <input value={editingProductName} onChange={(event) => setEditingProductName(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400" />
                      </label>
                      <label className="grid gap-2 text-xs font-semibold text-slate-400">
                        Brand
                        <input value={editingProductBrand} onChange={(event) => setEditingProductBrand(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400" placeholder="e.g. Yonex or Victor" />
                      </label>
                      <label className="grid gap-2 text-xs font-semibold text-slate-400">
                        Price (AED)
                        <input value={editingProductPrice} onChange={(event) => setEditingProductPrice(event.target.value)} type="number" min="0.01" step="0.01" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400" />
                      </label>
                      <label className="grid gap-2 text-xs font-semibold text-slate-400">
                        Category
                        <select value={editingProductCategory} onChange={(event) => setEditingProductCategory(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400">
                          {productCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                        </select>
                      </label>
                      <label className="grid gap-2 text-xs font-semibold text-slate-400 sm:col-span-2">
                        Product description
                        <textarea value={editingProductDescription} onChange={(event) => setEditingProductDescription(event.target.value)} maxLength={3000} rows={4} className="w-full resize-y rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400" placeholder="Describe the product and its benefits for shoppers." />
                      </label>
                      <div className="space-y-2 sm:col-span-2">
                        <div><h3 className="text-xs font-semibold text-slate-300">Technical specifications</h3><p className="mt-1 text-[11px] text-slate-500">These details appear in the product information on your storefront.</p></div>
                        <ProductSpecificationsEditor rows={editingProductSpecifications} onChange={setEditingProductSpecifications} idPrefix={`edit-product-${product.id}`} />
                      </div>
                      <section className="space-y-2 sm:col-span-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Product image gallery</h3>
                        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-300 hover:border-sky-400">
                          <ImagePlus size={18} className="shrink-0 text-sky-300" />
                          <span className="min-w-0 flex-1 truncate">{uploadingImage ? "Uploading images..." : `${editingProductImages.length} of 10 images · Add more`}</span>
                          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={uploadingImage} onChange={(event) => { void uploadProductImages(event.target.files, product.id); event.target.value = ""; }} />
                        </label>
                        <div className="admin-product-image-list">
                          {editingProductImages.map((imageUrl, index) => (
                            <div className="admin-product-image-item" key={imageUrl}>
                              <img src={imageUrl} alt={`Product image ${index + 1}`} />
                              <div>
                                <strong>{index === 0 ? "Cover image" : `Image ${index + 1}`}</strong>
                                {index !== 0 && <button type="button" onClick={() => setEditingProductImages((current) => [imageUrl, ...current.filter((image) => image !== imageUrl)])}>Make cover</button>}
                                <button type="button" disabled={editingProductImages.length <= 1} aria-label={`Remove product image ${index + 1}`} onClick={() => setEditingProductImages((current) => current.filter((image) => image !== imageUrl))}>Remove</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                      {editingProductType === "racquet" && <label className="grid gap-2 text-xs font-semibold text-slate-400 sm:col-span-2">
                        Colors <span className="font-normal text-slate-500">Separate colors with commas</span>
                        <input value={editingProductColors} onChange={(event) => setEditingProductColors(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400" placeholder="Black, White, Red" />
                      </label>}
                      {editingProductType === "other" && <label className="grid gap-2 text-xs font-semibold text-slate-400 sm:col-span-2">Product sizes
                        <select value={editingSizeCategory && apparelSizeCategories.includes(editingSizeCategory) ? editingSizeCategory : ""} onChange={(event) => {
                          const category = event.target.value as SizeCategory | "";
                          changeEditingSizeCategory(category || null);
                        }} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400">
                          <option value="">No size (racquets & accessories)</option>
                          <option value="tshirts">T-shirts</option>
                          <option value="shorts">Shorts</option>
                          <option value="socks">Socks</option>
                        </select>
                      </label>}
                      {isZohoSizeProduct(editingProductType, editingSizeCategory) && editingSizeCategory && <div className="sm:col-span-2">
                        <ZohoSizeSkuSelector
                          category={editingSizeCategory}
                          onCategoryChange={changeEditingSizeCategory}
                          sizeCategories={editingProductType === "shoe" ? shoeSizeCategories : [editingSizeCategory]}
                          title={editingProductType === "shoe" ? "Zoho stock by shoe size" : "Zoho stock by apparel size"}
                          sizeStock={editingSizeValues.stock}
                          sizeSkus={editingSizeValues.skus}
                          sizeSyncedAt={editingSizeValues.syncedAt}
                          onChangeSizeSku={(size, sku) => {
                            const category = editingSizeCategory;
                            if (!category) return;
                            setEditingSizeValuesByCategory((current) => {
                              const values = current[category] ?? { stock: {}, skus: {}, syncedAt: {} };
                              const syncedAt = { ...values.syncedAt };
                              delete syncedAt[size];
                              return {
                                ...current,
                                [category]: {
                                  ...values,
                                  skus: { ...values.skus, [size]: sku },
                                  syncedAt,
                                },
                              };
                            });
                          }}
                          idPrefix={`edit-size-${product.id}`}
                        />
                      </div>}
                      {!isZohoSizeProduct(editingProductType, editingSizeCategory) && editingProductType !== "shoe" && <><label className="grid gap-2 text-xs font-semibold text-slate-400">
                        Zoho SKU
                        <input value={editingProductSku} onChange={(event) => setEditingProductSku(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400" placeholder="Enter the exact Zoho item SKU" />
                      </label>
                      <label className="grid gap-2 text-xs font-semibold text-slate-400">
                        Zoho Product ID
                        <input value={editingZohoProductId} onChange={(event) => setEditingZohoProductId(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400" placeholder="Zoho product ID (admin only)" />
                      </label></>}
                      {(isZohoSizeProduct(editingProductType, editingSizeCategory) || (product.sku || product.zoho_product_id)) && <p className="text-xs text-slate-400 sm:col-span-2">Zoho stock is read-only and updates during stock sync.</p>}
                      <div className="flex flex-wrap gap-2 sm:col-span-2">
                        <button type="button" onClick={() => void saveProductEditor(product)} disabled={savingEditedProductId === product.id || uploadingImage} className="admin-action-button admin-action-primary"><Save size={15} aria-hidden="true" /> Save changes</button>
                        <button type="button" onClick={() => void saveProductEditor(product, !product.is_active)} disabled={savingEditedProductId === product.id || uploadingImage} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{savingEditedProductId === product.id ? "Saving..." : product.is_active ? "Save & hide" : "Save & publish"}</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>}

          </div>
        </div>
      </div>
      {section === "products" && <ProductDetailDialog product={previewProduct} onClose={() => setPreviewProduct(null)} onAdd={() => setPreviewProduct(null)} />}
      <button className="ar-floating-button ar-floating-top admin-back-to-top" type="button" aria-label="Scroll to top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
        <ArrowUp size={15} />
      </button>
    </main>
  );
}
