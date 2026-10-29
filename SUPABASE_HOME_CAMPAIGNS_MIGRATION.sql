create table if not exists public.home_campaigns (
  id text primary key,
  eyebrow text not null,
  title text not null,
  title_emphasis text not null,
  description text not null,
  cta_label text not null,
  href text not null default '/shop',
  image_url text not null,
  layout text not null default 'standard'
    check (layout in ('standard', 'poster-wide', 'poster-portrait')),
  display_order integer not null default 100
    check (display_order between 0 and 10000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists home_campaigns_active_order_idx
  on public.home_campaigns (is_active, display_order, id);

alter table public.home_campaigns enable row level security;
revoke all on public.home_campaigns from anon, authenticated;
grant all on public.home_campaigns to service_role;

insert into public.home_campaigns
  (id, eyebrow, title, title_emphasis, description, cta_label, href, image_url, layout, display_order)
values
  ('badminton-new-arrivals', 'BADMINTON · NEW ARRIVALS', 'Fresh gear.', 'Fresh energy.', 'New badminton essentials have landed. Find your next racket, shoes and court-day favourites.', 'SHOP NEW ARRIVALS', '/shop', 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=2200&q=90', 'standard', 10),
  ('tennis-accessories', 'TENNIS ACCESSORIES & GEAR', 'Gear up.', 'Play on.', 'From rackets and balls to shoes, bags and accessories, find everything you need for your next match.', 'SHOP TENNIS GEAR', '/shop?category=Tennis', '/tennis-accessories-poster.jpg', 'standard', 20),
  ('pickleball-court-essentials', 'PICKLEBALL · COURT ESSENTIALS', 'Pick your paddle.', 'Own the court.', 'Shop pickleball paddles, balls and court essentials for your next game.', 'SHOP PICKLEBALL', '/shop?category=Pickleball', '/pickleball-campaign.jpg', 'standard', 30),
  ('tennis-racquet-collection', 'TENNIS · RACQUET COLLECTION', 'Find your', 'winning edge.', 'Explore tennis racquets and court essentials made for confident serves, sharp returns and every rally.', 'SHOP TENNIS EQUIPMENT', '/shop?category=Tennis', 'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=2200&q=90', 'standard', 40),
  ('badminton-shuttlecocks', 'BADMINTON · DID YOU KNOW?', 'Made for', 'every rally.', 'A feather shuttlecock''s 16 feathers help it fly true. Find shuttlecocks selected for your game.', 'SHOP SHUTTLECOCKS', '/shop', '/product2.jpg', 'standard', 50),
  ('tennis-player-playbook', 'TENNIS · PLAYER PLAYBOOK', 'Split-step.', 'Stay ready.', 'Time a small split-step as your opponent hits to be ready to move in any direction.', 'EXPLORE TENNIS GEAR', '/shop?category=Tennis', 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?auto=format&fit=crop&w=2200&q=90', 'standard', 60),
  ('tennis-court-strategy', 'TENNIS · COURT STRATEGY', 'Own the baseline.', 'Rule the rally.', 'Build your point from the baseline, move your opponent and step in when the moment is right.', 'EXPLORE TENNIS GEAR', '/shop?category=Tennis', 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=2200&q=90', 'standard', 70),
  ('every-point', 'BADMINTON · TENNIS · PICKLEBALL', 'Play more.', 'Love every point.', 'From first serve to match point, find the kit that makes every session feel like yours.', 'FIND YOUR GEAR', '/shop', '/product1.jpg', 'standard', 80),
  ('yonex-tennis-shoes', 'YONEX · TENNIS SHOES', 'Move with', 'confidence.', 'Responsive court shoes made to support every split-step, sprint and change of direction.', 'SHOP TENNIS SHOES', '/shop?category=Tennis', '/yonex%20banner.jpg', 'poster-wide', 90),
  ('yonex-court-shoes', 'YONEX · COURT SHOES', 'Own every', 'step.', 'Find a secure, comfortable fit for quick footwork and long rallies on court.', 'EXPLORE COURT SHOES', '/shop?category=Tennis', '/yonex%20banner%202.jpg', 'poster-portrait', 100)
on conflict (id) do nothing;
