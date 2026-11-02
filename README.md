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

In the Supabase SQL Editor, apply `SUPABASE_PRODUCT_DETAILS_MIGRATION.sql` before deploying the admin product description/specification changes. Also run `SUPABASE_STRIPE_CHECKOUT_MIGRATION.sql` after the existing account and order-safety migrations (and after `SUPABASE_ZOHO_STOCK_MIGRATION.sql` if Zoho stock sync is enabled). Then run the latest `SUPABASE_PRODUCT_VARIANTS_MIGRATION.sql` and `SUPABASE_ORDER_SUMMARY_COUPONS_MIGRATION.sql`. If Zoho is enabled, also apply `SUPABASE_ZOHO_STOCK_RECONCILIATION_MIGRATION.sql` after both the Stripe checkout and Zoho stock migrations. The cart's **Proceed to payment** button opens a server-priced order summary first, showing each selected product and variant, applicable delivery and handling fees, and any active coupon discount. Orders with a product subtotal below AED 200 include AED 10 delivery and AED 2 handling; both fees are waived at AED 200 and above. The final button creates the existing Stripe Checkout session only after the server recalculates and validates the order. Manage fixed AED coupons in the authorized admin dashboard. Shoe stock is mapped to a separate Zoho SKU for each size; Zoho sync is read-only and mapped size quantities cannot be edited in Admin. Unmapped or never-synced sizes remain unavailable; previously synced stock stays available until a successful sync updates it. After manually creating a Zoho invoice for a paid website order, mark it as recorded in Admin; this is a manual tracking step, not automated invoice creation.

Run `npm run test:checkout-pricing` to check currency-fils arithmetic, coupon eligibility and cart validation. Run `npm run test:zoho-stock-sync` to test Zoho SKU matching, per-size shoe sync, and stock persistence after the sync-age alert threshold.

### Admin business insights

Authorized admins can open **Admin → Insights** to review paid revenue, paid order count, average order value, repeat-customer rate, revenue trend, best-selling products, sales by category and city, current fulfillment workload, and inventory health. The 7-, 30-, and 90-day filters apply to sales and period-based order metrics. Inventory and open-order counts are current snapshots. Revenue uses the final order total saved in Supabase; products without a Zoho mapping and products with low or empty stock are highlighted for follow-up. Insights are aggregated on the server and require the same Firebase admin authorization as the rest of the admin workspace.

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
