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

In the Supabase SQL Editor, run `SUPABASE_STRIPE_CHECKOUT_MIGRATION.sql` after the existing account and order-safety migrations (and after `SUPABASE_ZOHO_STOCK_MIGRATION.sql` if Zoho stock sync is enabled). Then run the latest `SUPABASE_PRODUCT_VARIANTS_MIGRATION.sql`. In the admin dashboard, shoe stock is entered per UK size with plus/minus controls; the product total is calculated from those quantities. Customers see each size's available quantity, and zero-stock sizes are greyed out and cannot be selected. Shoe colors are separate product listings; racquets can still have color options. Size stock is reserved at checkout and deducted per size only after a signed Stripe payment webhook confirms payment. If this migration was already run, run the latest version again. Existing shoe stock cannot be safely assigned to sizes automatically, so allocate the actual quantities in the admin dashboard after migration. The Zoho stock sync remains for non-shoe aggregate stock; shoe inventory is managed by size in the admin dashboard.

### Local test setup

1. In Stripe Dashboard, switch to **Test mode** and copy the test secret key (`sk_test_...`). Never put secret keys in browser code, Git, or chat.
2. Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `NEXT_PUBLIC_SITE_URL=http://localhost:3000` to `.env.local`. Use the Stripe CLI signing secret for local webhook testing; do not use a dashboard webhook secret for local forwarding.
3. Install and authenticate the Stripe CLI, then run `stripe listen --forward-to localhost:3000/api/checkout/webhook`. Copy the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET` and restart the Next.js dev server.
4. Start the site with `npm run dev`, sign in with Google, and complete a phone number and delivery address in `/account`.
5. Add an in-stock product to the bag and proceed to payment. In Stripe Checkout, use test card `4242 4242 4242 4242`, a future expiry date, any CVC, and any postal code. Test cancellation and session expiry too.
6. Confirm the order is paid at `/account/orders` and in the admin dashboard. Verify that the exact item quantities were deducted once from Supabase; replayed webhook events must not deduct them again.

### Vercel and live setup

1. Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `NEXT_PUBLIC_SITE_URL` in Vercel Project Settings → Environment Variables. Initially use test-mode values and the production site URL, for example `https://your-domain.example`.
2. In Stripe Dashboard, create a webhook endpoint for `https://your-domain.example/api/checkout/webhook`, select `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, and `checkout.session.async_payment_failed`, then copy its signing secret into Vercel as `STRIPE_WEBHOOK_SECRET`.
3. Deploy/redeploy after adding the variables. Run a full test-mode order against the deployed site and verify both the customer order history and admin order details.
4. Before accepting live payments, complete Stripe account verification, confirm with Stripe and ADCB that the intended payout account is acceptable, switch to live Stripe keys, and create a separate live-mode webhook endpoint and signing secret. Keep test and live credentials separate.

The admin dashboard displays the confirmed payment method, paid time, and Stripe PaymentIntent reference. The application does not store card numbers or CVCs.

### Order confirmation notifications

Customer notifications run only from the signed Stripe webhook after the order has been marked `paid` by `mark_stripe_order_paid`. Per-channel notification state is stored on the order and claimed atomically, so a repeated webhook does not resend completed notifications. Failed deliveries are recorded and retried on a later webhook; abandoned `sending` claims can be retried after 15 minutes. Orders with no customer email are recorded as skipped without affecting the paid order.

1. Apply `SUPABASE_ORDER_NOTIFICATION_MIGRATION.sql` after the Stripe checkout and product-variants migrations. It adds delivery state columns and the optional WhatsApp consent field; no existing order/profile data is removed.
2. Create a Resend account, verify the sending domain/address, and add these server-only variables to `.env.local` and the production host:

   ```env
   RESEND_API_KEY=re_...
   EMAIL_FROM=Al Raed Sports <orders@your-verified-domain.example>
   ```

   Resend is used directly through its server API; its key and sender are never exposed to the browser. Email requests include a stable order-based idempotency key.
3. Restart the app and use Stripe test mode plus the Stripe CLI webhook forwarding described above. Run `node --experimental-strip-types --test scripts/test-order-notifications.mjs` for local delivery-gate, duplicate, missing-email, and provider-failure tests.
4. Optional WhatsApp confirmations use the official Meta WhatsApp Cloud API. Create a WhatsApp Business Platform app/registered sending number, generate a server-side access token with message permissions, and submit an approved **utility** template. Configure the approved template with four body variables in this order: customer name, order number, amount, confirmation message. Add:

   ```env
   WHATSAPP_ACCESS_TOKEN=...
   WHATSAPP_PHONE_NUMBER_ID=...
   WHATSAPP_TEMPLATE_NAME=order_confirmation
   WHATSAPP_TEMPLATE_LANGUAGE=en
   WHATSAPP_GRAPH_API_VERSION=v26.0
   ```

   Customers must explicitly opt in under Account → Personal details before WhatsApp messages are sent. If WhatsApp is not configured or a customer has not opted in, only WhatsApp delivery is skipped; payment confirmation and email behavior are unaffected. A WhatsApp API failure is recorded independently and will not cause an already-sent email to be sent again.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
