import { NextResponse } from "next/server";
import { getPublicCatalogProducts } from "@/lib/server-catalog";

const protocolVersion = "2025-03-26";
const productCategories = ["Badminton", "Tennis", "Squash", "Accessories"] as const;
type ProductCategory = (typeof productCategories)[number];
const siteUrl = process.env.SEO_SITE_URL ?? "https://alraedshop.com";
const searchTool = {
  name: "search_products",
  description: "Search the Al Raed Sports catalog by product name or category. Read-only; does not add items to a cart or place an order.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Optional product name or keyword", maxLength: 100 },
      category: { type: "string", enum: productCategories },
      limit: { type: "integer", minimum: 1, maximum: 20 },
    },
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
};

type JsonRpcId = string | number;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Accept, Content-Type, MCP-Protocol-Version",
};

function rpcResponse(id: JsonRpcId | null, result: unknown, status = 200) {
  return NextResponse.json({ jsonrpc: "2.0", id, result }, { status, headers: corsHeaders });
}

function rpcError(id: JsonRpcId | null, code: number, message: string, status = 200) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status, headers: corsHeaders });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProductCategory(value: unknown): value is ProductCategory {
  return productCategories.some((category) => category === value);
}

async function searchProducts(input: unknown) {
  if (!isRecord(input)) return { error: "Tool arguments must be an object." };

  const query = input.query === undefined ? "" : input.query;
  const category = input.category;
  const limit = input.limit === undefined ? 10 : input.limit;
  if (typeof query !== "string" || query.length > 100) {
    return { error: "query must be a string of 100 characters or fewer." };
  }
  if (category !== undefined && !isProductCategory(category)) {
    return { error: "category is not supported." };
  }
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 20) {
    return { error: "limit must be an integer from 1 to 20." };
  }

  const products = await getPublicCatalogProducts();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = products
    .filter((product) => (!category || product.category === category)
      && (!normalizedQuery || `${product.name} ${product.brand} ${product.category}`.toLocaleLowerCase().includes(normalizedQuery)))
    .slice(0, limit)
    .map((product) => ({
      name: product.name,
      brand: product.brand,
      category: product.category,
      price: product.price,
      currency: "AED",
      url: new URL(`/prices#product-${product.id}`, siteUrl).toString(),
    }));

  return { products: matches };
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return rpcError(null, -32600, "Content-Type must be application/json.", 415);
  }

  const rawBody = await request.text();
  if (rawBody.length > 32_768) {
    return rpcError(null, -32600, "Request body is too large.", 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return rpcError(null, -32700, "Invalid JSON.", 400);
  }

  if (!isRecord(body) || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return rpcError(null, -32600, "Invalid JSON-RPC request.", 400);
  }

  const id = typeof body.id === "string" || typeof body.id === "number" ? body.id : null;
  if (id === null && body.method.startsWith("notifications/")) {
    return new Response(null, { status: 202, headers: corsHeaders });
  }
  if (id === null) {
    return rpcError(null, -32600, "A request id is required.", 400);
  }

  if (body.method === "initialize") {
    return rpcResponse(id, {
      protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: "com.alraedshop/storefront", version: "1.0.0" },
    });
  }
  if (body.method === "server/discover") {
    return rpcResponse(id, {
      resultType: "complete",
      supportedVersions: [protocolVersion],
      capabilities: { tools: {} },
      _meta: {
        "io.modelcontextprotocol/serverInfo": {
          name: "com.alraedshop/storefront",
          version: "1.0.0",
        },
      },
      instructions: "Use tools/list to inspect search_products. It searches public products and prices only; it cannot change carts or place orders.",
      ttlMs: 3600000,
      cacheScope: "public",
    });
  }
  if (body.method === "ping") {
    return rpcResponse(id, {});
  }
  if (body.method === "tools/list") {
    return rpcResponse(id, { tools: [searchTool] });
  }
  if (body.method === "tools/call") {
    const params = isRecord(body.params) ? body.params : {};
    if (params.name !== searchTool.name) {
      return rpcError(id, -32602, "Unknown tool.");
    }

    try {
      const result = await searchProducts(params.arguments);
      if ("error" in result) {
        return rpcResponse(id, {
          content: [{ type: "text", text: result.error }],
          isError: true,
        });
      }
      return rpcResponse(id, {
        content: [{ type: "text", text: JSON.stringify(result) }],
      });
    } catch (error) {
      console.error("MCP product search failed:", error);
      return rpcError(id, -32603, "The product catalog is temporarily unavailable.");
    }
  }

  return rpcError(id, -32601, "Method not found.");
}

export function GET() {
  return new Response("This MCP endpoint accepts POST requests.", {
    status: 405,
    headers: { ...corsHeaders, Allow: "POST, OPTIONS", "Content-Type": "text/plain; charset=utf-8" },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
