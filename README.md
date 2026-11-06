This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Badminton catalog

Run `npm run seed:badminton-products` to add the shared list of 20 shoes and 10 accessories to the Badminton category. The script uploads their images to Supabase Storage, saves descriptions, uses listed prices or range midpoints, and starts products with zero stock. Prices are mostly indicative, and suggested models should be verified before sale.

## Stripe card and Apple Pay checkout

Checkout uses Stripe-hosted Checkout in AED. Customers sign in, save a phone number and delivery address under `/account`, then use the cart's **Proceed to payment** button. The server reloads product names, prices, and available stock from Supabase; browser prices are never used to charge a customer. Apple Pay can be offered by Stripe Checkout on supported devices when enabled for the Stripe account.

### Database setup

In the Supabase SQL Editor, apply `SUPABASE_PRODUCT_DETAILS_MIGRATION.sql` before deploying the admin product description/specification changes. Apply `SUPABASE_PRODUCT_IMAGES_MIGRATION.sql` before deploying product gallery uploads and the storefront image slider; it preserves existing product images as the first gallery image. Also run `SUPABASE_STRIPE_CHECKOUT_MIGRATION.sql` after the existing account and order-safety migrations (and after `SUPABASE_ZOHO_STOCK_MIGRATION.sql` if Zoho stock sync is enabled). Then run the latest `SUPABASE_PRODUCT_VARIANTS_MIGRATION.sql` and `SUPABASE_ORDER_SUMMARY_COUPONS_MIGRATION.sql`. If Zoho is enabled, also apply `SUPABASE_ZOHO_STOCK_RECONCILIATION_MIGRATION.sql` after both the Stripe checkout and Zoho stock migrations, then apply `SUPABASE_EU_SHOE_SIZES_MIGRATION.sql` before deploying the new shoe-size UI. To update an existing database to the latest stock behavior, rerun the updated `SUPABASE_ZOHO_STOCK_RECONCILIATION_MIGRATION.sql`; stock sync now mirrors Zoho's available quantity without subtracting paid website orders. Apply `SUPABASE_ORDER_STATUS_AUDIT_MIGRATION.sql` after the order-safety, Stripe checkout, and product-variants migrations and before deploying admin status history. This last migration records all new status changes atomically; earlier status changes cannot be reconstructed. This migration also enables the Orders dashboard's overdue processing/delivery alerts. Apply `SUPABASE_ADMIN_ACTIVITY_MIGRATION.sql` after the order-status audit migration and before deploying the Admin Activity Log. It imports the available order-status history and enables an append-only record of admin product, order, coupon, campaign, and inventory changes. The low-stock warning uses `ZOHO_LOW_STOCK_THRESHOLD` (default 3 units). This shoe-size migration clears old UK size mappings and stock, so record all outstanding paid shoe invoices and wait for active shoe checkouts to complete or expire first; afterward, enter each EU-size Zoho SKU in Admin and run a stock sync. Shoes can be assigned Junior (EU 32–41), Women's (EU 35–45), or Men's / Unisex (EU 36–46) size ranges. Unmapped or never-synced sizes remain unavailable; synced quantities are read-only and stay available until a successful sync updates them. The cart's **Proceed to payment** button opens a server-priced order summary first, showing each selected product and variant, applicable delivery and handling fees, and any active coupon discount. Orders with a product subtotal below AED 200 include AED 10 delivery and AED 2 handling; both fees are waived at AED 200 and above. The final button creates the existing Stripe Checkout session only after the server recalculates and validates the order. Manage fixed AED coupons in the authorized admin dashboard. After manually creating a Zoho invoice for a paid website order, mark it as recorded in Admin; this is a manual tracking step, not automated invoice creation.

Run `npm run test:checkout-pricing` to check currency-fils arithmetic, coupon eligibility and cart validation. Run `npm run test:zoho-stock-sync` to test Zoho SKU matching, per-size shoe sync, and stock persistence after the sync-age alert threshold.
Run `npm run test:shoe-sizes` to validate the supported audience-specific EU size ranges.

### Admin order fulfillment

The Admin sidebar's **Future Implementation** page is a live fulfillment board, not a mock. Paid orders appear under **To pack** (`paid`), and advancing them records **Packed** (`processing`), **Shipped** (`shipped`), then **Delivered** (`delivered`) through the existing audited order-status API. The page shows customer, line items, payment method, payment reference, and payment time. A paid-order notification badge appears in the sidebar and refreshes every 20 seconds while an Admin page is open; the board also refreshes its order details every 20 seconds. It requires the existing `SUPABASE_ORDER_STATUS_AUDIT_MIGRATION.sql`; no additional database migration is needed. The board follows the site's saved light/dark theme and plays a subtle sound after a successful status change.

### Admin activity log

The Admin **Activity Log** at `/admin/activity` records who changed products, orders, coupons, homepage campaigns, and inventory, along with timestamps and changed fields. Order status history already in `order_status_history` is imported when `SUPABASE_ADMIN_ACTIVITY_MIGRATION.sql` is applied. Activity attribution uses each allowlisted admin's Firebase display name and email; admin access remains invite-only through `ADMIN_EMAILS`. Scheduled inventory syncs are identified as automated system actions. The log is append-only and its API is restricted to authorized admins.

### Admin business insights

Authorized admins can open **Admin → Insights** to review paid revenue, paid order count, average order value, repeat-customer rate, revenue trend, best-selling products, sales by category and city, current fulfillment workload, and inventory health. The Orders page also highlights paid orders awaiting processing for more than 24 hours, shipped orders without delivery confirmation after 3 days, and active products at or below the configured low-stock threshold. These alert windows use payment and audited status timestamps; older transitions without a known timestamp are not flagged. The 7-, 30-, and 90-day filters apply to sales and period-based order metrics. Inventory and open-order counts are current snapshots. Revenue uses the final order total saved in Supabase; products without a Zoho mapping and products with low or empty stock are highlighted for follow-up. Insights are aggregated on the server and require the same Firebase admin authorization as the rest of the admin workspace.

### Local test setup

1. In Stripe Dashboard, switch to **Test mode** and copy the test secret key (`sk_test_...`). Never put secret keys in browser code, Git, or chat.
2. Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `NEXT_PUBLIC_SITE_URL=http://localhost:3000` to `.env.local`. Use the Stripe CLI signing secret for local webhook testing; do not use a dashboard webhook secret for local forwarding.
3. Install and authenticate the Stripe CLI, then run `stripe listen --forward-to localhost:3000/api/checkout/webhook`. Copy the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET` and restart the Next.js dev server.
4. Start the site with `npm run dev`, sign in with Google, and complete a phone number and delivery address in `/account`.
5. Add an in-stock product to the bag and proceed to payment. In Stripe Checkout, use test card `4242 4242 4242 4242`, a future expiry date, any CVC, and any postal code. Test cancellation and session expiry too.
6. Confirm the order is paid at `/account/orders` and in the admin dashboard. Verify that the exact item quantities were deducted once from Supabase; replayed webhook events must not deduct them again.

### Hostinger deployment and live setup

Deploy this as a Next.js **Web App**, not a static site. In Hostinger, connect the GitHub repository and deploy the intended branch (currently `main`) with the Next.js preset, Node.js 22.x, npm, `npm run build`, and `.next` as the output directory. Set the required variables from `.env.example` in Hostinger's environment-variable settings before building; keep secrets server-side and out of Git. The app continues to use Supabase, Firebase, Stripe, and Zoho without moving their data.

Start with the Hostinger temporary HTTPS domain and Stripe test-mode keys. Set `NEXT_PUBLIC_SITE_URL` to that temporary domain, add it to Firebase Authentication's authorized domains, and create a Stripe **test-mode** webhook at `<temporary-domain>/api/checkout/webhook` for `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, and `checkout.session.async_payment_failed`. Store that endpoint's signing secret as `STRIPE_WEBHOOK_SECRET` in Hostinger and redeploy. Verify Google sign-in, admin access, image upload, Zoho stock sync, test checkout, and successful webhook delivery before changing the live domain.

After staging passes, attach the production domain to the Hostinger Web App, enable HTTPS, update `NEXT_PUBLIC_SITE_URL` and Firebase's authorized domains, and redeploy. Preserve existing DNS records used for email. Before accepting live payments, complete Stripe account verification, confirm with Stripe and ADCB that the intended payout account is acceptable, switch to live Stripe keys, and create a separate live-mode webhook endpoint and signing secret. Keep test and live credentials separate. Hostinger deployments from GitHub occur only when a push is made to a branch configured for deployment.

The admin dashboard displays the confirmed payment method, paid time, and Stripe PaymentIntent reference. The application does not store card numbers or CVCs.

### Google Search Console and Analytics

The public sitemap is available at `https://alraedshop.com/sitemap.xml`, and `https://alraedshop.com/robots.txt` points crawlers to it while disallowing admin, account, checkout, and API routes. The robots file includes `Content-Signal: search=yes, ai-train=no`. Public information pages include `/about`, `/contact`, `/prices`, `/terms`, and `/privacy`; `/prices` renders live product prices and Product/Offer JSON-LD on the server. `/llms.txt` summarizes these resources, and the homepage negotiates a Markdown representation at `/index.md` for requests accepting `text/markdown`. Set `SEO_SITE_URL` to the canonical production origin on the hosting provider. If Google Search Console provides an HTML-tag verification token, set it as `GOOGLE_SITE_VERIFICATION`; Domain property verification by DNS TXT is also supported and does not require this variable.

The homepage advertises its Markdown and `llms.txt` alternatives with `Link` response headers. WebMCP-capable browsers receive a feature-detected, read-only `search_products` tool. A read-only MCP Streamable HTTP endpoint is available at `/api/mcp`, with its MCP Server Card at `/.well-known/mcp/server-card.json`; the endpoint supports protocol version `2025-03-26`, reports its tools capability through `server/discover`, and exposes product search only. It does not expose cart, account, or checkout actions. The current MCP Server Card schema (SEP-2127) conveys purpose and capabilities through its description and remote endpoint; it intentionally leaves tool enumeration to MCP runtime discovery rather than a card-level `capabilities` field.

To enable Google Analytics 4, create a GA4 web data stream and set its `G-...` Measurement ID as `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` in the hosting provider's environment settings, then rebuild and redeploy. Tracking is disabled unless this valid ID is configured. The site sends page views, product views, add-to-cart events, and deduplicated purchase events after the paid order is verified on the checkout return page. Add consent controls appropriate to the site's privacy obligations before enabling analytics where required.

### Order confirmation notifications

Customer notifications run only from the signed Stripe webhook after the order has been marked `paid` by `mark_stripe_order_paid`. Per-channel notification state is stored on the order and claimed atomically, so a repeated webhook does not resend completed notifications. Failed deliveries are recorded and retried on a later webhook; abandoned `sending` claims can be retried after 15 minutes. If a provider is not configured, its channel stays pending so a Stripe webhook can be resent after configuration. Orders with no customer email are recorded as skipped without affecting the paid order.

1. Apply `SUPABASE_ORDER_NOTIFICATION_MIGRATION.sql` after the Stripe checkout and product-variants migrations. It adds delivery state columns and the optional WhatsApp consent field; no existing order/profile data is removed.
2. Create a Resend account, verify the sending domain/address, and add these server-only variables to `.env.local` and the production host. `.env.example` contains placeholder entries for local setup:

   ```env
   RESEND_API_KEY=re_...
   EMAIL_FROM=Al Raed Sports <orders@your-verified-domain.example>
   ```

   Resend is used directly through its server API; its key and sender are never exposed to the browser. Email requests include a stable order-based idempotency key.
3. Restart the app and use Stripe test mode plus the Stripe CLI webhook forwarding described above. Run `node --experimental-strip-types --test scripts/test-order-notifications.mjs` for local delivery-gate, duplicate, missing-email, and provider-failure tests.
4. Optional WhatsApp confirmations use the official Meta WhatsApp Cloud API. Create a WhatsApp Business Platform app/registered sending number, generate a server-side access token with message permissions, and submit an approved **utility** template. Configure the approved template with four body variables in this order: customer name, order number, amount, confirmation message. Add the values to `.env.local` and the production host:

   ```env
   WHATSAPP_ACCESS_TOKEN=...
   WHATSAPP_PHONE_NUMBER_ID=...
   WHATSAPP_TEMPLATE_NAME=order_confirmation
   WHATSAPP_TEMPLATE_LANGUAGE=en
   WHATSAPP_GRAPH_API_VERSION=v26.0
   ```

   Customers must explicitly opt in under Account → Personal details before WhatsApp messages are sent. If WhatsApp is not configured, delivery stays pending for a later webhook retry; if a customer has not opted in, only WhatsApp delivery is skipped. Payment confirmation and email behavior are unaffected. A WhatsApp API failure is recorded independently and will not cause an already-sent email to be sent again.

## Next.js deployment

See the Hostinger deployment steps above. For framework-specific behavior, refer to the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying).
