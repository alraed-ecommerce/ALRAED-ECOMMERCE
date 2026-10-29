import { auth } from "@/lib/firebase";
import type { CartLine } from "@/lib/store-products";

export async function startStripeCheckout(cart: CartLine[], navigate: (href: string) => void) {
  if (!cart.length) throw new Error("Your shopping bag is empty.");
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

  navigate("/checkout/summary");
}
