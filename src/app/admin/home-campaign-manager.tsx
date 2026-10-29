"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowRight, ImagePlus, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import type { User } from "firebase/auth";
import { homeCampaignLayouts, type HomeCampaign, type HomeCampaignFields, type HomeCampaignLayout } from "@/lib/home-campaigns";

type Props = { user: User };

type CampaignForm = HomeCampaignFields & {
  display_order: string;
  is_active: boolean;
};

const emptyForm = (displayOrder = 110): CampaignForm => ({
  eyebrow: "",
  title: "",
  title_emphasis: "",
  description: "",
  cta_label: "SHOP NOW",
  href: "/shop",
  image_url: "",
  layout: "standard",
  display_order: String(displayOrder),
  is_active: true,
});

const layoutLabels: Record<HomeCampaignLayout, string> = {
  standard: "Classic",
  "poster-wide": "Wide poster",
  "poster-portrait": "Portrait poster",
};

function PosterPreview({ form }: { form: CampaignForm }) {
  return (
    <section aria-labelledby="poster-live-preview-heading" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h4 id="poster-live-preview-heading" className="text-xs font-bold uppercase tracking-[0.16em] text-slate-300">Live preview</h4>
        <span className="text-[10px] font-semibold text-slate-500">Not published until you save</span>
      </div>
      <div className="admin-poster-preview" data-layout={form.layout}>
        {form.image_url
          ? <img src={form.image_url} alt="" className="admin-poster-preview-image" />
          : <div className="admin-poster-preview-empty"><ImagePlus size={24} /><span>Upload an image to preview your poster</span></div>}
        <div className="admin-poster-preview-shade" />
        <div className="admin-poster-preview-copy">
          <p className="admin-poster-preview-eyebrow"><span />{form.eyebrow || "YOUR EYEBROW"}</p>
          <h3>{form.title || "Your title"}<br /><em>{form.title_emphasis || "Your highlighted title"}</em></h3>
          <p className="admin-poster-preview-description">{form.description || "Your description will appear here."}</p>
          <span className="admin-poster-preview-button">{form.cta_label || "BUTTON LABEL"}<ArrowRight size={14} /></span>
        </div>
      </div>
    </section>
  );
}

export default function HomeCampaignManager({ user }: Props) {
  const [campaigns, setCampaigns] = useState<HomeCampaign[]>([]);
  const [form, setForm] = useState<CampaignForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadCampaigns = async () => {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/home-campaigns", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = await response.json() as { campaigns?: HomeCampaign[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to load homepage posters.");
      if (active) setCampaigns(result.campaigns ?? []);
    };

    void loadCampaigns()
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load homepage posters.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [user]);

  const resetForm = (displayOrder = Math.max(100, ...campaigns.map((campaign) => campaign.display_order)) + 10) => {
    setForm(emptyForm(displayOrder));
    setEditingId(null);
  };

  const uploadPosterImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const image = event.target.files?.[0];
    event.target.value = "";
    if (!image) return;

    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const token = await user.getIdToken();
      const formData = new FormData();
      formData.set("image", image);
      const response = await fetch("/api/admin/product-image", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json() as { imageUrl?: string; error?: string };
      if (!response.ok || !result.imageUrl) throw new Error(result.error || "Unable to upload poster image.");
      setForm((current) => ({ ...current, image_url: result.imageUrl! }));
      setNotice("Poster image uploaded.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload poster image.");
    } finally {
      setUploading(false);
    }
  };

  const saveCampaign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/home-campaigns", {
        method: editingId ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          display_order: Number(form.display_order),
          ...(editingId ? { id: editingId } : {}),
        }),
      });
      const result = await response.json() as { campaign?: HomeCampaign; error?: string };
      if (!response.ok || !result.campaign) throw new Error(result.error || "Unable to save poster.");
      setCampaigns((current) => {
        const next = editingId
          ? current.map((campaign) => campaign.id === editingId ? result.campaign! : campaign)
          : [...current, result.campaign!];
        return next.sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id));
      });
      setNotice(editingId ? "Poster changes saved." : "Poster created.");
      resetForm(Math.max(result.campaign.display_order, ...campaigns.map((campaign) => campaign.display_order), 100) + 10);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save poster.");
    } finally {
      setSaving(false);
    }
  };

  const editCampaign = (campaign: HomeCampaign) => {
    setEditingId(campaign.id);
    setForm({
      eyebrow: campaign.eyebrow,
      title: campaign.title,
      title_emphasis: campaign.title_emphasis,
      description: campaign.description,
      cta_label: campaign.cta_label,
      href: campaign.href,
      image_url: campaign.image_url,
      layout: campaign.layout,
      display_order: String(campaign.display_order),
      is_active: campaign.is_active,
    });
    setError(null);
    setNotice(null);
    document.getElementById("home-campaign-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const updateCampaign = async (campaign: HomeCampaign, update: { is_active?: boolean; display_order?: number }) => {
    setError(null);
    setNotice(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/home-campaigns", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: campaign.id, ...update }),
      });
      const result = await response.json() as { campaign?: HomeCampaign; error?: string };
      if (!response.ok || !result.campaign) throw new Error(result.error || "Unable to update poster.");
      setCampaigns((current) => current.map((item) => item.id === campaign.id ? result.campaign! : item)
        .sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id)));
      setNotice(update.is_active === undefined
        ? "Poster order updated."
        : update.is_active ? "Poster published." : "Poster hidden.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update poster.");
    }
  };

  const deleteCampaign = async (campaign: HomeCampaign) => {
    if (!window.confirm(`Delete "${campaign.title} ${campaign.title_emphasis}"? This cannot be undone.`)) return;
    setError(null);
    setNotice(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/home-campaigns", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: campaign.id }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to delete poster.");
      setCampaigns((current) => current.filter((item) => item.id !== campaign.id));
      if (editingId === campaign.id) resetForm();
      setNotice("Poster deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete poster.");
    }
  };

  const updateField = <K extends keyof CampaignForm>(key: K, value: CampaignForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const inputClass = "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400";
  const labelClass = "grid gap-1.5 text-xs font-semibold text-slate-400";

  return (
    <section id="home-posters" className="mb-8 scroll-mt-6 rounded-3xl border border-sky-400/20 bg-slate-900 p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Homepage content</p>
          <h2 className="mt-1 text-xl font-bold">Featured posters</h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-400">Edit each field and review the live poster preview before you publish. Use display order to arrange the carousel.</p>
        </div>
        <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">{campaigns.filter((campaign) => campaign.is_active).length} published · {campaigns.length} total</span>
      </div>

      {error && <div role="alert" className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
      {notice && <div role="status" className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{notice}</div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="space-y-3">
          {loading ? <p className="rounded-2xl border border-slate-800 p-4 text-sm text-slate-400">Loading posters...</p>
            : campaigns.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">No posters found. Create one to get started.</p>
              : campaigns.map((campaign) => (
                <article key={campaign.id} className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-3 sm:flex-row sm:items-center">
                  <img src={campaign.image_url} alt="" className="h-24 w-full rounded-xl bg-slate-900 object-cover sm:w-36" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold text-white">{campaign.title} {campaign.title_emphasis}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${campaign.is_active ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>{campaign.is_active ? "PUBLISHED" : "HIDDEN"}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{campaign.eyebrow} · {layoutLabels[campaign.layout]} · Order {campaign.display_order}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{campaign.description}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
                    <button type="button" onClick={() => editCampaign(campaign)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-2 text-xs font-semibold text-white hover:border-sky-400"><Pencil size={13} /> Edit</button>
                    <button type="button" onClick={() => void updateCampaign(campaign, { is_active: !campaign.is_active })} className="rounded-lg border border-slate-700 px-2.5 py-2 text-xs font-semibold text-slate-300 hover:border-sky-400">{campaign.is_active ? "Hide" : "Publish"}</button>
                    <button type="button" onClick={() => void deleteCampaign(campaign)} aria-label={`Delete ${campaign.title} ${campaign.title_emphasis}`} className="inline-flex items-center justify-center rounded-lg border border-rose-900/70 px-2.5 py-2 text-xs text-rose-300 hover:border-rose-500"><Trash2 size={13} /></button>
                  </div>
                </article>
              ))}
        </div>

        <form
          id="home-campaign-editor"
          onSubmit={(event) => void saveCampaign(event)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.target instanceof HTMLInputElement && !["checkbox", "file"].includes(event.target.type)) {
              event.preventDefault();
            }
          }}
          className="scroll-mt-5 rounded-2xl border border-slate-800 bg-slate-950 p-4"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-white">{editingId ? "Edit poster" : "Create a poster"}</h3>
              <p className="mt-1 text-xs text-slate-400">Your preview updates as you edit. Review it before publishing.</p>
            </div>
            {editingId && <button type="button" onClick={() => resetForm()} aria-label="Cancel editing" className="rounded-lg border border-slate-700 p-2 text-slate-300"><X size={15} /></button>}
          </div>

          <div className="space-y-3">
            <div className={labelClass}>Poster image
              <span className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700 px-3 py-2.5 text-sm font-semibold text-white hover:border-sky-400">
                  <ImagePlus size={16} /> {uploading ? "Uploading..." : "Upload image"}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void uploadPosterImage(event)} disabled={uploading} />
                </label>
                <span className="text-xs font-normal text-slate-500">JPG, PNG, or WebP · up to 5 MB</span>
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>Eyebrow<input required maxLength={80} value={form.eyebrow} onChange={(event) => updateField("eyebrow", event.target.value)} className={inputClass} placeholder="TENNIS · NEW ARRIVALS" /></label>
              <label className={labelClass}>Button label<input required maxLength={40} value={form.cta_label} onChange={(event) => updateField("cta_label", event.target.value)} className={inputClass} placeholder="SHOP NOW" /></label>
              <label className={labelClass}>Title<input required maxLength={100} value={form.title} onChange={(event) => updateField("title", event.target.value)} className={inputClass} placeholder="Fresh gear." /></label>
              <label className={labelClass}>Highlighted title<input required maxLength={100} value={form.title_emphasis} onChange={(event) => updateField("title_emphasis", event.target.value)} className={inputClass} placeholder="Fresh energy." /></label>
            </div>

            <label className={labelClass}>Description<textarea required maxLength={300} rows={3} value={form.description} onChange={(event) => updateField("description", event.target.value)} className={inputClass} placeholder="Tell shoppers what is new." /></label>
            <PosterPreview form={form} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>Button destination<input required maxLength={512} value={form.href} onChange={(event) => updateField("href", event.target.value)} className={inputClass} placeholder="/shop?category=Tennis" /></label>
              <label className={labelClass}>Design
                <select value={form.layout} onChange={(event) => updateField("layout", event.target.value as HomeCampaignLayout)} className={inputClass}>
                  {homeCampaignLayouts.map((layout) => <option key={layout} value={layout}>{layoutLabels[layout]}</option>)}
                </select>
              </label>
              <label className={labelClass}>Display order<input required type="number" min="0" max="10000" step="1" value={form.display_order} onChange={(event) => updateField("display_order", event.target.value)} className={inputClass} /></label>
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-300"><input type="checkbox" checked={form.is_active} onChange={(event) => updateField("is_active", event.target.checked)} className="h-4 w-4 accent-sky-400" /> Publish on homepage</label>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button type="submit" disabled={saving || uploading || loading} className="inline-flex items-center gap-2 rounded-xl bg-sky-400 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50">
                {editingId ? <Save size={15} /> : <Plus size={15} />}{saving ? "Saving..." : form.is_active ? editingId ? "Save & publish changes" : "Publish poster" : editingId ? "Save hidden poster" : "Create hidden poster"}
              </button>
              {editingId && <button type="button" onClick={() => resetForm()} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300">Cancel</button>}
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
