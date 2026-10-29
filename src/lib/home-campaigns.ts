export const homeCampaignLayouts = ["standard", "poster-wide", "poster-portrait"] as const;

export type HomeCampaignLayout = (typeof homeCampaignLayouts)[number];

export type HomeCampaignFields = {
  eyebrow: string;
  title: string;
  title_emphasis: string;
  description: string;
  cta_label: string;
  href: string;
  image_url: string;
  layout: HomeCampaignLayout;
};

export type HomeCampaign = HomeCampaignFields & {
  id: string;
  display_order: number;
  is_active: boolean;
};

export function validateHomeCampaign(value: unknown): { fields?: HomeCampaignFields; error?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Enter valid poster details." };
  }

  const body = value as Record<string, unknown>;
  const textFields = [
    ["eyebrow", 80, "Eyebrow"],
    ["title", 100, "Title"],
    ["title_emphasis", 100, "Highlighted title"],
    ["description", 300, "Description"],
    ["cta_label", 40, "Button label"],
  ] as const;
  const fields: Record<string, string> = {};

  for (const [key, limit, label] of textFields) {
    const text = body[key];
    if (typeof text !== "string" || !text.trim() || text.trim().length > limit) {
      return { error: `${label} is required and must be ${limit} characters or fewer.` };
    }
    fields[key] = text.trim();
  }

  const href = typeof body.href === "string" ? body.href.trim() : "";
  if (!isSafeCampaignUrl(href, true)) {
    return { error: "Use a site path or a secure HTTPS link for the button." };
  }

  const imageUrl = typeof body.image_url === "string" ? body.image_url.trim() : "";
  if (!isSafeCampaignUrl(imageUrl, true)) {
    return { error: "Upload an image or enter a site image path or secure HTTPS image URL." };
  }

  if (typeof body.layout !== "string" || !homeCampaignLayouts.includes(body.layout as HomeCampaignLayout)) {
    return { error: "Choose a valid poster design." };
  }

  return {
    fields: {
      eyebrow: fields.eyebrow,
      title: fields.title,
      title_emphasis: fields.title_emphasis,
      description: fields.description,
      cta_label: fields.cta_label,
      href,
      image_url: imageUrl,
      layout: body.layout as HomeCampaignLayout,
    },
  };
}

function isSafeCampaignUrl(value: string, allowExternal: boolean): boolean {
  if (!value || value.length > 512 || /[\u0000-\u001f\\]/.test(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  if (!allowExternal) return false;
  if (!/^https:\/\//i.test(value)) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}
