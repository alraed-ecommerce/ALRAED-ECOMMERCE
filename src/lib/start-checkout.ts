import type { CartLine } from "@/lib/store-products";

export async function startStripeCheckout(cart: CartLine[], navigate: (href: string) => void) {
  if (!cart.length) throw new Error("Your shopping bag is empty.");
  navigate("/checkout/summary");
}
