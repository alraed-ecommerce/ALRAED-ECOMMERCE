"use client";

import { useEffect } from "react";

type ProductSearchArguments = {
  query?: string;
  category?: "Badminton" | "Tennis" | "Squash" | "Accessories";
  limit?: number;
};

type ModelContext = {
  registerTool: (tool: {
    name: string;
    description: string;
    inputSchema: {
      type: "object";
      properties: Record<string, unknown>;
      additionalProperties: false;
    };
    execute: (args: ProductSearchArguments) => Promise<unknown>;
  }) => void | Promise<void>;
};

export default function WebMcpTools() {
  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!modelContext || typeof modelContext.registerTool !== "function") return;

    void Promise.resolve(modelContext.registerTool({
      name: "search_products",
      description: "Search the Al Raed Sports catalog by product name or category. Read-only; does not add items to a cart or place an order.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional product name or keyword", maxLength: 100 },
          category: { type: "string", enum: ["Badminton", "Tennis", "Squash", "Accessories"] },
          limit: { type: "integer", minimum: 1, maximum: 20 },
        },
        additionalProperties: false,
      },
      async execute(args) {
        const response = await fetch("/api/products", { cache: "no-store" });
        if (!response.ok) throw new Error("The product catalog could not be loaded.");
        const result: unknown = await response.json();
        if (typeof result !== "object" || result === null || !("products" in result) || !Array.isArray(result.products)) {
          throw new Error("The product catalog returned an invalid response.");
        }

        const query = typeof args.query === "string" ? args.query.trim().toLocaleLowerCase().slice(0, 100) : "";
        const category = args.category;
        const limit = Number.isInteger(args.limit) ? Math.min(20, Math.max(1, args.limit ?? 10)) : 10;
        const products = result.products
          .filter((product): product is Record<string, unknown> => typeof product === "object" && product !== null)
          .filter((product) => (!category || product.category === category)
            && (!query || `${String(product.name ?? "")} ${String(product.brand ?? "")} ${String(product.category ?? "")}`.toLocaleLowerCase().includes(query)))
          .slice(0, limit)
          .map((product) => ({
            name: String(product.name ?? ""),
            brand: String(product.brand ?? ""),
            category: String(product.category ?? ""),
            price: Number(product.price),
            currency: "AED",
            availableStock: Number(product.stock ?? 0),
            url: `${window.location.origin}/prices#product-${encodeURIComponent(String(product.id ?? ""))}`,
          }));

        return { products };
      },
    })).catch((error: unknown) => {
      console.error("Unable to register the Al Raed product search WebMCP tool:", error);
    });
  }, []);

  return null;
}
