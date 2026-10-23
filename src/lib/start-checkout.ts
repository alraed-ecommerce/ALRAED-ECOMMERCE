import { auth } from "@/lib/firebase";
import type { CartLine } from "@/lib/store-products";

export async function startStripeCheckout(cart: CartLine[], navigate: (href: string) => void) {
  if (auth) await auth.authStateReady();
  const user = auth?.currentUser;
  if (!user) {
    navigate("/account");
    return;
  }

  const token = await user.getIdToken();
  const profileResponse = await fetch("/api/profile", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const profileResult = await profileResponse.json() as {
    profile?: {
      phone?: string | null;
      addresses?: Array<{ city?: string; address?: string; is_default?: boolean }> | null;
    };
    error?: string;
  };
  if (!profileResponse.ok) throw new Error(profileResult.error || "Unable to verify your delivery details.");

  const defaultAddress = profileResult.profile?.addresses?.find((address) => address.is_default);
  if (!profileResult.profile?.phone?.trim() || !defaultAddress?.city?.trim() || !defaultAddress.address?.trim()) {
    navigate("/account?checkout=details");
    return;
  }

  const response = await fetch("/api/checkout/session", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      products: cart.map(({ product, quantity, color, size }) => ({
        product: { id: product.id },
        quantity,
        ...(color ? { color } : {}),
        ...(size ? { size } : {}),
      })),
    }),
  });
  const result = await response.json() as { url?: string; error?: string };
  if (!response.ok) throw new Error(result.error || "Unable to start secure checkout.");
  if (!result.url) throw new Error("Secure checkout did not return a payment link.");

  window.location.assign(result.url);
}
