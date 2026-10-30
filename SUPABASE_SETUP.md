# Supabase setup for Al Raed Sports ecommerce

## 1) Create the Supabase project

1. Open https://supabase.com
2. Sign in
3. Click New project
4. Choose project name: `alraed-sports`
5. Choose region: `South Asia (Mumbai)`
6. Create a strong database password
7. Wait for deployment to complete

## 2) Get your keys

1. Open your project dashboard
2. Go to Settings -> API
3. Copy these values:
   - Project URL
   - Publishable key (anon key)
   - Secret key (service role key)

### Add them to your local env file

Add these to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Important:
- use the anon key in frontend code
- use the service role key only on the server
- do not expose the service role key in browser code

## 3) Create the tables in Supabase SQL editor

Open SQL Editor in Supabase and paste this:

```sql
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text unique,
  full_name text,
  email text,
  phone text,
  addresses jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);

create table if not exists products (
  id bigserial primary key,
  name text not null,
  brand text,
  category text check (category in ('Badminton', 'Tennis', 'Squash', 'Accessories')),
  price numeric(10,2) not null,
  image_url text,
  sku text,
  zoho_product_id text,
  rating numeric(3,2) default 0,
  reviews integer default 0,
  stock integer default 0,
  zoho_stock_synced_at timestamptz,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  customer_name text not null,
  customer_phone text not null,
  city text,
  address text,
  notes text,
  total numeric(10,2) not null,
  status text default 'pending',
  created_at timestamptz default now()
);

create table if not exists order_items (
  id bigserial primary key,
  order_id uuid references orders(id) on delete cascade,
  product_id bigint references products(id),
  product_name text not null,
  quantity integer not null,
  unit_price numeric(10,2) not null,
  created_at timestamptz default now()
);
```

## 4) Start with an empty storefront

The storefront reads active products from the `products` table. To hide existing products while keeping their records and order history, run this once in SQL Editor:

```sql
update products set is_active = false where is_active = true;
```

Hidden products remain in admin and can be published again. New products are published automatically after saving.

## 5) Product images

The admin upload accepts JPG, PNG, and WebP files up to 5 MB. Images are stored in the public Supabase Storage bucket `product-images`; the `products.image_url` column stores only the image URL. The bucket is created automatically on the first authenticated admin upload.

This keeps image bytes out of Postgres, avoids inflating database backups, and lets the browser fetch images from object storage. Compress images before upload for faster storefront loading.

## 6) Add row-level security policies

For public product browsing:

```sql
alter table products enable row level security;

create policy "Products are viewable by everyone"
on products for select
using (true);
```

For order tables, keep this server-only:

```sql
alter table orders enable row level security;
alter table order_items enable row level security;
```

Then define server-side insertion logic in API routes; do not allow public insert from browser anon key.

## 7) Apply existing-project migrations

For an existing database, run these files in the Supabase SQL Editor, in order:

1. `SUPABASE_ACCOUNT_MIGRATION.sql`
2. `SUPABASE_ORDER_SAFETY_MIGRATION.sql`
3. `SUPABASE_ZOHO_STOCK_MIGRATION.sql`
4. `SUPABASE_STRIPE_CHECKOUT_MIGRATION.sql`
5. `SUPABASE_PRODUCT_VARIANTS_MIGRATION.sql`
6. `SUPABASE_ORDER_NOTIFICATION_MIGRATION.sql`
7. `SUPABASE_HOME_CAMPAIGNS_MIGRATION.sql`
8. `SUPABASE_ORDER_SUMMARY_COUPONS_MIGRATION.sql`
9. `SUPABASE_ZOHO_STOCK_RECONCILIATION_MIGRATION.sql`

The first migration adds saved customer addresses and ensures Firebase user IDs have a non-partial unique index required by profile upserts. If account details fail to save on an existing database, rerun `SUPABASE_ACCOUNT_MIGRATION.sql` in the Supabase SQL Editor. The second adds server-only database functions that create orders using current Supabase product names/prices and atomically mark paid orders while deducting inventory. The third adds normalized unique product SKUs and Zoho product IDs, a stock-sync timestamp, and the server-only function used for atomic Zoho stock updates. The Zoho product ID is stored for admin billing/stock management and is not returned by the public product API. Apply this migration before creating or editing products with that field.

The fourth migration adds Stripe checkout inventory reservations. The latest version of the fifth migration adds admin-configurable product types, racquet colors, audience-specific shoe sizes, and a quantity for every shoe size. In the admin dashboard, choose Shoes, Racquets, or Other gear first. Shoes can use men's UK 2–15 or women's/kids' UK 2–11 sizes; use the plus/minus controls on each size tile to set its stock. The total shoe stock is calculated automatically. Customers see the sizes with stock, and zero-stock sizes are greyed out and cannot be selected. Shoe colors are separate product listings, not selectable variants; racquets may still have color choices. The migration also updates checkout to reserve and deduct shoe inventory by size. Rerun the latest `SUPABASE_PRODUCT_VARIANTS_MIGRATION.sql` if an earlier version was already applied. Existing shoe quantities cannot be safely mapped to sizes, so set actual per-size stock in the admin dashboard after migration; until then, shoe sizes stay unavailable. Shoe stock is managed by size in the admin dashboard rather than Zoho's aggregate stock sync.

The sixth migration adds atomic per-channel order-confirmation delivery state and the optional WhatsApp consent field. Apply it before deploying the email/WhatsApp notification code; setup of the Resend and official WhatsApp Cloud API variables is documented in `README.md`.

The seventh migration creates the homepage poster table and seeds it with the current homepage campaigns. Apply it to enable poster creation, editing, ordering, publishing, and hiding in the admin dashboard. Poster images upload to the existing public `product-images` storage bucket.

The eighth migration creates the private coupon table and adds order-summary fees, discounts, coupon redemption reservations, and checkout-attempt idempotency. Apply it after the Stripe checkout and product-variant migrations. Customers then review a server-priced order summary before Stripe payment; coupons are managed in the authorized admin dashboard. Orders with a product subtotal below AED 200 include AED 10 delivery and AED 2 handling fees. Both fees are waived when the product subtotal is AED 200 or more.

The ninth migration depends on the Zoho stock and Stripe checkout migrations. It installs the corrected stock reconciliation function and the order field used to record a manually created Zoho invoice. Existing orders from before this migration are excluded from automatic deductions to avoid counting historical sales twice; manually reconcile any still-open historical invoices in Zoho before starting stock sync.

Do not use a client-provided price to create orders. The existing `/api/orders` route sends only product IDs and quantities to the database function. The service role key must remain server-only.

## 8) Seed test catalog

To add 10 clearly labeled test products per category, set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, then run:

```sh
npm run seed:test-products
```

The script checks that all 40 Unsplash stock images are available, skips products already seeded by name, and verifies the active count in each category. Products are marked `[TEST]`, have working stock quantities, and are active and orderable; use a non-production Supabase project when testing.

## 9) Production readiness checks

Before launch, test these flows against the intended Supabase project:

1. Publish a product with a known stock quantity and confirm it appears on the storefront.
2. Place an order and confirm the database total uses the product's current database price.
3. Mark the order paid and confirm each product stock is deducted once.
4. Repeat the paid update and confirm stock does not change a second time.
5. Try an order with insufficient stock and confirm it is rejected without changing the order or inventory.
6. Cancel an order and verify the agreed manual stock-restock process.

The current manual-payment flow sends the order request to WhatsApp, where the customer and store agree on payment and fulfilment. Stock is deducted only when the admin confirms the order as paid. Unpaid orders do not reserve inventory, so check availability before confirming payment if inventory is limited.

The service role key must be configured as a server-only environment variable in the production host. Never prefix it with `NEXT_PUBLIC_` or include it in browser code.

## 10) Mirror Zoho Inventory stock

The website can mirror available stock from Zoho Inventory by matching a product's saved Zoho item ID (preferred after first match) or exact SKU. This is a one-way, read-only Zoho integration: the website never creates Zoho invoices or changes Zoho stock. The sync adds available quantities at all configured Zoho locations. Unmatched products keep their prior database stock but are marked unavailable in the storefront while Zoho is enabled, and API/data errors stop the run before stock is changed.

1. Apply `SUPABASE_ZOHO_STOCK_MIGRATION.sql`, `SUPABASE_STRIPE_CHECKOUT_MIGRATION.sql`, and `SUPABASE_PRODUCT_VARIANTS_MIGRATION.sql`, then apply `SUPABASE_ZOHO_STOCK_RECONCILIATION_MIGRATION.sql`. Complete any other prerequisite migrations in the ordered list above.
2. Before the first sync, resolve any outstanding orders from before the reconciliation migration in Zoho. Historical orders are excluded from automatic deductions to prevent old website sales being deducted twice.
3. Add the exact Zoho item SKU or item ID to each website product in Admin. SKUs are trimmed, case-insensitive, and unique in the website catalog. When a product first matches by SKU, its Zoho item ID is saved and becomes the stable mapping for later syncs. Products without real Zoho mappings are deliberately left unavailable while Zoho is enabled.

```env
ZOHO_CLIENT_ID=...
ZOHO_CLIENT_SECRET=...
ZOHO_REFRESH_TOKEN=...
ZOHO_ORGANIZATION_ID=...
ZOHO_LOCATION_IDS=location_id_1,location_id_2
ZOHO_ACCOUNTS_URL=https://accounts.zoho.com
ZOHO_API_URL=https://www.zohoapis.com
ZOHO_STOCK_MAX_AGE_SECONDS=900
ZOHO_LOW_STOCK_THRESHOLD=3
CRON_SECRET=...
```

Use the OAuth and API domains for the Zoho data center where the account is registered. `ZOHO_API_URL` is a fallback; Zoho's OAuth response API domain takes precedence. `ZOHO_LOCATION_IDS` is a comma-separated list of locations whose available stock should be combined. Never place these credentials in `NEXT_PUBLIC_` variables or share them in chat.
4. Use **Sync Zoho stock** in the admin dashboard for a manual run. To automate it, configure a scheduler to call `GET https://<your-domain>/api/inventory/zoho-sync` with `Authorization: Bearer <CRON_SECRET>`. The endpoint also supports `POST` for an authenticated admin or scheduler. Choose an interval supported by your hosting plan; no schedule is deployed automatically.

`ZOHO_STOCK_MAX_AGE_SECONDS` accepts 60–86,400 seconds (default 900); checkout rejects non-shoe Zoho-managed products if their mapping is missing or the latest verified sync is too old. `ZOHO_LOW_STOCK_THRESHOLD` accepts 0–1,000 (default 3) and controls the storefront's low-stock display. Successful rows record `zoho_stock_synced_at`; the admin dashboard displays it. For availability, the integration uses Zoho's per-location `location_available_stock` values. If Zoho omits required location data, returns duplicate matching items, or the sync cannot be saved atomically, the run reports an error and leaves stock unchanged.

After manually creating an invoice for a paid website order in Zoho, use **Record Zoho invoice** on that order in Admin. This does not create an invoice or send data to Zoho. It tells subsequent syncs that Zoho already deducted the sale, preventing a second deduction. Do not mark the invoice before creating it. Shoes remain managed by per-size website stock and are excluded from the aggregate Zoho sync.

## Summary

- Firebase Auth handles Google sign-in.
- Supabase stores products, customer profiles, and orders.
- Supabase Storage stores uploaded product images.
- The Next.js server creates orders from database prices and validates stock.
- WhatsApp is used to coordinate payment manually.
