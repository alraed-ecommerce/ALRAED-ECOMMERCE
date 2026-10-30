"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import testProductDetails from "@/lib/test-product-details.json";
import { isFootwearProduct, type StoreProduct } from "@/lib/store-products";

type ProductDetails = { description: string; specifications: Record<string, string> };

const demoProductDetails: Record<string, { description: string; specifications: string[][] }> = testProductDetails;

function getProductDetails(product: StoreProduct): ProductDetails {
  const demoDetails = demoProductDetails[product.name];
  if (demoDetails) {
    return {
      description: demoDetails.description,
      specifications: Object.fromEntries(demoDetails.specifications),
    };
  }

  const categoryDetails: Record<string, string> = {
    Badminton: "Selected for fast footwork, sharp reactions and the rhythm of the rally. A dependable choice for your next training session or match.",
    Tennis: "Court-ready equipment selected to help you find your rhythm from first serve through match point.",
    Squash: "Built for quick movement and close-quarters control. A practical pick for training days and competitive rallies.",
    Accessories: "A considered court-side essential, selected to keep your kit organised and your next session running smoothly.",
  };

  return {
    description: product.description || `${product.name} by ${product.brand || "Al Raed Sports"}. ${categoryDetails[product.category] ?? "A court-ready essential, selected for your next session."}`,
    specifications: {
      Brand: product.brand || "Al Raed Sports",
      Category: product.category,
      Inventory: product.stock > 0 ? `${product.stock} in stock` : "Currently unavailable",
      "Technical specifications": "Contact us to confirm product-specific details",
    },
  };
}

const money = (amount: number) =>
  new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 }).format(amount);

export default function ProductDetailDialog({
  product,
  onClose,
  onAdd,
}: {
  product: StoreProduct | null;
  onClose: () => void;
  onAdd: (product: StoreProduct, quantity: number, options: { color?: string; size?: string }) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selection, setSelection] = useState({ productId: 0, quantity: 1, color: "", size: "" });
  const quantity = product && selection.productId === product.id ? selection.quantity : 1;
  const selectedColor = product && selection.productId === product.id ? selection.color : "";
  const selectedSize = product && selection.productId === product.id ? selection.size : "";
  const changeQuantity = (update: number | ((value: number) => number)) => {
    if (!product) return;
    setSelection((current) => ({
      productId: product.id,
      quantity: typeof update === "function" ? update(current.productId === product.id ? current.quantity : 1) : update,
      color: current.productId === product.id ? current.color : "",
      size: current.productId === product.id ? current.size : "",
    }));
  };
  const changeColor = (color: string) => {
    if (!product) return;
    setSelection((current) => ({
      productId: product.id,
      quantity: current.productId === product.id ? current.quantity : 1,
      color,
      size: current.productId === product.id ? current.size : "",
    }));
  };
  const changeSize = (size: string) => {
    if (!product) return;
    setSelection((current) => ({
      productId: product.id,
      quantity: 1,
      color: current.productId === product.id ? current.color : "",
      size,
    }));
  };
  const details = product ? getProductDetails(product) : null;
  const needsSize = product ? isFootwearProduct(product) : false;
  const selectedStock = product
    ? needsSize
      ? selectedSize ? product.sizeStock[selectedSize] ?? 0 : 0
      : product.stock
    : 0;
  const hasMissingOptions = Boolean(product && (
    (product.colors.length > 0 && !needsSize && !selectedColor)
    || (needsSize && (!product.sizes.length || !selectedSize))
    || (product.sizes.length > 0 && !selectedSize)
    || (product.unavailableSizes.includes(selectedSize))
    || (needsSize && selectedStock < 1)
  ));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (product) {
      if (!dialog.open) dialog.showModal();
    }
    if (!product && dialog.open) dialog.close();
  }, [product]);

  return (
    <dialog
      ref={dialogRef}
      className="ar-product-dialog"
      aria-labelledby="ar-product-detail-title"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        dialogRef.current?.close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
    >
      {product && details && (
        <>
          <div className="ar-product-detail-visual">
            {product.image ? <img src={product.image} alt={product.name} /> : <span className="ar-product-placeholder">AL RAED<br />SPORTS</span>}
            <span className="ar-product-detail-category">{product.category}</span>
          </div>
          <section className="ar-product-detail-content">
            <button className="ar-product-detail-close" type="button" aria-label="Close product details" onClick={() => dialogRef.current?.close()}><X size={20} /></button>
            <p className="ar-eyebrow">{product.brand || "AL RAED SPORTS"} · {product.category.toUpperCase()}</p>
            <h2 id="ar-product-detail-title">{product.name.replace(/^\[TEST\]\s*/, "")}</h2>
            <p className="ar-product-detail-description">{details.description}</p>
            <div className="ar-product-detail-price">
              <strong>{money(product.price)}</strong>
              <span className={product.stock > 0 && product.stockStatus !== "unavailable" ? "is-in-stock" : "is-out-of-stock"}>{product.stockStatus === "unavailable" ? "STOCK TEMPORARILY UNAVAILABLE" : product.stock > 0 ? `${product.stock} IN STOCK` : "CURRENTLY UNAVAILABLE"}</span>
            </div>
            {(product.colors.length > 0 || product.sizes.length > 0 || needsSize) && (
              <div className="ar-product-variants">
                {product.colors.length > 0 && !needsSize && (
                  <label>
                    <span>COLOR</span>
                    <select value={selectedColor} onChange={(event) => changeColor(event.target.value)} aria-label={`Choose a color for ${product.name}`}>
                      <option value="">Choose a color</option>
                      {product.colors.map((color) => <option key={color} value={color}>{color}</option>)}
                    </select>
                  </label>
                )}
                {needsSize && product.sizes.length > 0 ? (
                  <label>
                    <span>SIZE</span>
                    <div className="ar-product-size-options" role="group" aria-label={`Choose a size for ${product.name}`}>
                      {product.sizes.map((size) => {
                        const availableQuantity = product.sizeStock[size] ?? 0;
                        const unavailable = product.unavailableSizes.includes(size) || availableQuantity < 1;
                        return <button key={size} type="button" className={selectedSize === size ? "is-selected" : ""} aria-pressed={selectedSize === size} aria-label={`${size}${unavailable ? ", out of stock" : `, ${availableQuantity} available`}`} disabled={unavailable} onClick={() => changeSize(size)}>{size}<span>{unavailable ? "OUT OF STOCK" : `${availableQuantity} AVAILABLE`}</span></button>;
                      })}
                    </div>
                  </label>
                ) : product.sizes.length > 0 ? (
                  <label>
                    <span>SIZE</span>
                    <select value={selectedSize} onChange={(event) => changeSize(event.target.value)} aria-label={`Choose a size for ${product.name}`}>
                      <option value="">Choose a size</option>
                      {product.sizes.map((size) => <option key={size} value={size} disabled={product.unavailableSizes.includes(size)}>{size}{product.unavailableSizes.includes(size) ? " — Out of stock" : ""}</option>)}
                    </select>
                  </label>
                ) : needsSize ? null : null}
                {needsSize && product.sizes.length === 0 && <p role="status">Sizes have not been added yet. Please check back soon.</p>}
              </div>
            )}
            <div className="ar-product-specs">
              <div className="ar-product-specs-heading"><h3>Product details</h3><span>{Object.keys(details.specifications).length} DETAILS</span></div>
              {Object.entries(details.specifications).map(([label, value]) => (
                <div className="ar-product-spec-row" key={label}><span>{label}</span><strong>{value}</strong></div>
              ))}
            </div>
            <div className="ar-product-detail-buy">
              <div className="ar-detail-quantity" aria-label="Choose quantity">
                <button type="button" aria-label="Decrease quantity" onClick={() => changeQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1}><Minus size={15} /></button>
                <span aria-live="polite">{quantity}</span>
                <button type="button" aria-label="Increase quantity" onClick={() => changeQuantity((value) => Math.min(Math.min(selectedStock, 50), value + 1))} disabled={quantity >= Math.min(selectedStock, 50)}><Plus size={15} /></button>
              </div>
              <button className="ar-button ar-button-light ar-product-detail-add" type="button" onClick={() => onAdd(product, quantity, { color: needsSize ? undefined : selectedColor || undefined, size: selectedSize || undefined })} disabled={selectedStock < 1 || quantity > selectedStock || hasMissingOptions || product.stockStatus === "unavailable"}>
                {product.stockStatus === "unavailable" ? "UNAVAILABLE" : product.stock < 1 ? "SOLD OUT" : <>ADD TO BAG · {money(product.price * quantity)} <ShoppingBag size={16} /></>}
              </button>
            </div>
            <p className="ar-product-detail-footnote">UAE-wide delivery · Availability shown from current stock</p>
          </section>
        </>
      )}
    </dialog>
  );
}
