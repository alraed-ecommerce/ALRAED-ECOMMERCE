import assert from "node:assert/strict";
import test from "node:test";

const { validateHomeCampaign } = await import("../src/lib/home-campaigns.ts");

const validCampaign = {
  eyebrow: "NEW ARRIVALS",
  title: "Fresh gear.",
  title_emphasis: "Fresh energy.",
  description: "New court essentials are here.",
  cta_label: "SHOP NOW",
  href: "/shop?category=Badminton",
  image_url: "https://images.example.com/campaign.webp",
  layout: "poster-wide",
};

test("campaign validation preserves safe poster fields", () => {
  assert.deepEqual(validateHomeCampaign(validCampaign), { fields: validCampaign });
});

test("campaign validation accepts same-site paths for images and links", () => {
  assert.deepEqual(validateHomeCampaign({
    ...validCampaign,
    href: "/shop",
    image_url: "/campaign.jpg",
  }), {
    fields: { ...validCampaign, href: "/shop", image_url: "/campaign.jpg" },
  });
});

test("campaign validation rejects unsafe links and oversized text", () => {
  assert.match(validateHomeCampaign({ ...validCampaign, href: "javascript:alert(1)" }).error, /secure HTTPS link/);
  assert.match(validateHomeCampaign({ ...validCampaign, image_url: "//tracker.example/image.jpg" }).error, /site image path/);
  assert.match(validateHomeCampaign({ ...validCampaign, title: "x".repeat(101) }).error, /Title is required/);
});

test("campaign validation rejects unsupported layouts and malformed payloads", () => {
  assert.match(validateHomeCampaign({ ...validCampaign, layout: "custom-html" }).error, /valid poster design/);
  assert.match(validateHomeCampaign(null).error, /valid poster details/);
});
