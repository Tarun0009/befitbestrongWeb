"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  useAdminGetSiteConfigQuery,
  useAdminUpdateSiteConfigMutation,
  type AdminSiteConfig,
  type AdminSiteConfigPatch,
  type HeroSlide,
  type RewardTier,
} from "@/lib/siteConfigApi";
import { useAdminListProductsQuery } from "@/lib/catalogApi";

const emptySlide = (): HeroSlide => ({
  eyebrow: "beFitBeStrong",
  headline: "Fuel, gear, and kit for serious training.",
  highlight: "Built for the work",
  subtitle:
    "Supplements, home gym equipment, apparel, and accessories selected for lifters who read the label and use the gear.",
  primaryLabel: "Shop now",
  primaryHref: "/shop",
  secondaryLabel: "Explore supplements",
  secondaryHref: "/shop?category=supplements",
  imageUrl: null,
});

export default function AdminHomepagePage() {
  const { data, isLoading } = useAdminGetSiteConfigQuery();
  const [update, { isLoading: saving }] = useAdminUpdateSiteConfigMutation();

  const [draft, setDraft] = useState<AdminSiteConfig | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (data?.config) {
      setDraft({
        ...data.config,
        heroSlides: data.config.heroSlides ?? [],
        rewardTiers: data.config.rewardTiers ?? [],
      });
    }
  }, [data]);

  if (isLoading || !draft) {
    return <div className="h-40 animate-pulse rounded-lg bg-muted" />;
  }

  const set = <K extends keyof AdminSiteConfig>(
    key: K,
    value: AdminSiteConfig[K],
  ) => setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!draft || !data?.config) return;
    setStatus(null);
    const patch: AdminSiteConfigPatch = {};
    for (const k of Object.keys(draft) as Array<keyof AdminSiteConfig>) {
      if (k === "id" || k === "createdAt" || k === "updatedAt") continue;
      const current = draft[k];
      const original = data.config[k];
      const isEqual = Array.isArray(current)
        ? JSON.stringify(current) === JSON.stringify(original ?? [])
        : current === original;
      if (!isEqual) {
        (patch as Record<string, unknown>)[k] = current;
      }
    }
    if (Object.keys(patch).length === 0) {
      setStatus("Nothing to save.");
      return;
    }
    try {
      await update(patch).unwrap();
      setStatus("Saved. Homepage refreshed.");
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      setStatus(e.data?.error?.message ?? "Save failed.");
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-10">
      <header>
        <h2 className="text-2xl font-semibold">Homepage & announcement</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Marketing-editable content for the storefront hero, rewards ticker,
          featured products, and spotlight.
        </p>
      </header>

      <Section
        title="Announcement bar"
        description="Yellow strip above the header. Turn off to hide it site-wide."
      >
        <Toggle
          label="Show announcement bar"
          checked={draft.announcementEnabled}
          onChange={(v) => set("announcementEnabled", v)}
        />
        <Field label="Message">
          <input
            type="text"
            required
            value={draft.announcementText}
            onChange={(e) => set("announcementText", e.target.value)}
            className={inputCls}
            maxLength={240}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Promo code (optional)">
            <input
              type="text"
              value={draft.announcementCode ?? ""}
              onChange={(e) => set("announcementCode", e.target.value || null)}
              className={inputCls}
              maxLength={40}
            />
          </Field>
          <Field label="CTA label">
            <input
              type="text"
              value={draft.announcementCtaText ?? ""}
              onChange={(e) => set("announcementCtaText", e.target.value || null)}
              className={inputCls}
              maxLength={40}
            />
          </Field>
        </div>
        <Field label="CTA link">
          <input
            type="text"
            value={draft.announcementCtaHref ?? ""}
            onChange={(e) => set("announcementCtaHref", e.target.value || null)}
            className={inputCls}
          />
        </Field>
      </Section>

      <Section
        title="Fallback hero"
        description="Used when no carousel slides are configured. Also keeps old content compatible."
      >
        <Field label="Eyebrow">
          <input
            type="text"
            required
            value={draft.heroEyebrow}
            onChange={(e) => set("heroEyebrow", e.target.value)}
            className={inputCls}
            maxLength={60}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Headline">
            <input
              type="text"
              required
              value={draft.heroHeadline}
              onChange={(e) => set("heroHeadline", e.target.value)}
              className={inputCls}
              maxLength={120}
            />
          </Field>
          <Field label="Highlighted phrase">
            <input
              type="text"
              value={draft.heroHighlight ?? ""}
              onChange={(e) => set("heroHighlight", e.target.value || null)}
              className={inputCls}
              maxLength={80}
            />
          </Field>
        </div>
        <Field label="Subtitle">
          <textarea
            required
            value={draft.heroSubtitle}
            onChange={(e) => set("heroSubtitle", e.target.value)}
            rows={2}
            className={inputCls}
            maxLength={400}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Primary CTA label">
            <input
              type="text"
              required
              value={draft.heroPrimaryLabel}
              onChange={(e) => set("heroPrimaryLabel", e.target.value)}
              className={inputCls}
              maxLength={60}
            />
          </Field>
          <Field label="Primary CTA link">
            <input
              type="text"
              required
              value={draft.heroPrimaryHref}
              onChange={(e) => set("heroPrimaryHref", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Secondary CTA label">
            <input
              type="text"
              value={draft.heroSecondaryLabel ?? ""}
              onChange={(e) => set("heroSecondaryLabel", e.target.value || null)}
              className={inputCls}
              maxLength={60}
            />
          </Field>
          <Field label="Secondary CTA link">
            <input
              type="text"
              value={draft.heroSecondaryHref ?? ""}
              onChange={(e) => set("heroSecondaryHref", e.target.value || null)}
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Hero carousel slides"
        description="Optional image-backed slides for the homepage hero. Leave empty to use the fallback hero."
      >
        <HeroSlidesEditor
          slides={draft.heroSlides}
          onChange={(slides) => set("heroSlides", slides)}
        />
      </Section>

      <Section
        title="Rewards ticker"
        description="Thresholds are in rupees and render below the announcement bar."
      >
        <RewardTiersEditor
          tiers={draft.rewardTiers}
          onChange={(tiers) => set("rewardTiers", tiers)}
        />
      </Section>

      <Section
        title="Featured products"
        description="Ordered list surfaced on the homepage. Leave empty to show newest products automatically."
      >
        <FeaturedPicker
          selected={draft.featuredProductIds}
          onChange={(ids) => set("featuredProductIds", ids)}
        />
      </Section>

      <Section
        title="Spotlight section"
        description="Callout below the featured grid. Toggle off to hide it entirely."
      >
        <Toggle
          label="Show spotlight"
          checked={draft.spotlightEnabled}
          onChange={(v) => set("spotlightEnabled", v)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Eyebrow">
            <input
              type="text"
              value={draft.spotlightEyebrow ?? ""}
              onChange={(e) => set("spotlightEyebrow", e.target.value || null)}
              className={inputCls}
              maxLength={40}
            />
          </Field>
          <Field label="Title">
            <input
              type="text"
              value={draft.spotlightTitle ?? ""}
              onChange={(e) => set("spotlightTitle", e.target.value || null)}
              className={inputCls}
              maxLength={120}
            />
          </Field>
        </div>
        <Field label="Body">
          <textarea
            value={draft.spotlightBody ?? ""}
            onChange={(e) => set("spotlightBody", e.target.value || null)}
            rows={3}
            className={inputCls}
            maxLength={400}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="CTA label">
            <input
              type="text"
              value={draft.spotlightCtaLabel ?? ""}
              onChange={(e) => set("spotlightCtaLabel", e.target.value || null)}
              className={inputCls}
              maxLength={40}
            />
          </Field>
          <Field label="CTA link">
            <input
              type="text"
              value={draft.spotlightCtaHref ?? ""}
              onChange={(e) => set("spotlightCtaHref", e.target.value || null)}
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      <div className="flex items-center gap-3 rounded-lg border border-border p-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
        {status && <span className="text-sm text-muted-foreground">{status}</span>}
      </div>
    </form>
  );
}

function HeroSlidesEditor({
  slides,
  onChange,
}: {
  slides: HeroSlide[];
  onChange: (slides: HeroSlide[]) => void;
}) {
  function updateSlide<K extends keyof HeroSlide>(
    index: number,
    key: K,
    value: HeroSlide[K],
  ) {
    onChange(slides.map((slide, i) => (i === index ? { ...slide, [key]: value } : slide)));
  }

  return (
    <div className="space-y-4">
      {slides.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No slides yet. The homepage will use the fallback hero.
        </p>
      ) : (
        slides.map((slide, index) => (
          <div key={index} className="rounded-lg border border-border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Slide {index + 1}</p>
              <button
                type="button"
                onClick={() => onChange(slides.filter((_, i) => i !== index))}
                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
              >
                Remove
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Eyebrow">
                <input value={slide.eyebrow} onChange={(e) => updateSlide(index, "eyebrow", e.target.value)} maxLength={60} className={inputCls} />
              </Field>
              <Field label="Headline">
                <input value={slide.headline} onChange={(e) => updateSlide(index, "headline", e.target.value)} maxLength={120} className={inputCls} />
              </Field>
              <Field label="Highlighted phrase">
                <input value={slide.highlight ?? ""} onChange={(e) => updateSlide(index, "highlight", e.target.value || null)} maxLength={80} className={inputCls} />
              </Field>
              <Field label="Image URL">
                <input type="url" value={slide.imageUrl ?? ""} onChange={(e) => updateSlide(index, "imageUrl", e.target.value || null)} placeholder="https://..." className={inputCls} />
              </Field>
            </div>
            <Field label="Subtitle">
              <textarea value={slide.subtitle} onChange={(e) => updateSlide(index, "subtitle", e.target.value)} rows={2} maxLength={400} className={inputCls} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Primary CTA label">
                <input value={slide.primaryLabel} onChange={(e) => updateSlide(index, "primaryLabel", e.target.value)} maxLength={60} className={inputCls} />
              </Field>
              <Field label="Primary CTA link">
                <input value={slide.primaryHref} onChange={(e) => updateSlide(index, "primaryHref", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Secondary CTA label">
                <input value={slide.secondaryLabel ?? ""} onChange={(e) => updateSlide(index, "secondaryLabel", e.target.value || null)} maxLength={60} className={inputCls} />
              </Field>
              <Field label="Secondary CTA link">
                <input value={slide.secondaryHref ?? ""} onChange={(e) => updateSlide(index, "secondaryHref", e.target.value || null)} className={inputCls} />
              </Field>
            </div>
          </div>
        ))
      )}
      <button
        type="button"
        disabled={slides.length >= 6}
        onClick={() => onChange([...slides, emptySlide()])}
        className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40"
      >
        Add slide
      </button>
    </div>
  );
}

function RewardTiersEditor({
  tiers,
  onChange,
}: {
  tiers: RewardTier[];
  onChange: (tiers: RewardTier[]) => void;
}) {
  function updateTier<K extends keyof RewardTier>(
    index: number,
    key: K,
    value: RewardTier[K],
  ) {
    onChange(tiers.map((tier, i) => (i === index ? { ...tier, [key]: value } : tier)));
  }

  return (
    <div className="space-y-3">
      {tiers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reward tiers configured.</p>
      ) : (
        tiers.map((tier, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[160px_1fr_auto]">
            <input
              type="number"
              min={0}
              value={tier.threshold}
              onChange={(e) => updateTier(index, "threshold", Number(e.target.value) || 0)}
              className={inputCls}
              aria-label="Threshold in rupees"
            />
            <input
              value={tier.reward}
              onChange={(e) => updateTier(index, "reward", e.target.value)}
              maxLength={80}
              className={inputCls}
              aria-label="Reward"
            />
            <button
              type="button"
              onClick={() => onChange(tiers.filter((_, i) => i !== index))}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              Remove
            </button>
          </div>
        ))
      )}
      <button
        type="button"
        disabled={tiers.length >= 8}
        onClick={() => onChange([...tiers, { threshold: 999, reward: "Free shaker bottle" }])}
        className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40"
      >
        Add reward tier
      </button>
    </div>
  );
}

function FeaturedPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const { data } = useAdminListProductsQuery({
    search: search || undefined,
    limit: 12,
  });

  const byId = new Map(data?.items.map((p) => [p.id, p]) ?? []);

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else if (selected.length < 12) {
      onChange([...selected, id]);
    }
  }

  function move(id: string, dir: -1 | 1) {
    const idx = selected.indexOf(id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= selected.length) return;
    const next = [...selected];
    const tmp = next[idx] as string;
    next[idx] = next[j] as string;
    next[j] = tmp;
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Selected ({selected.length}/12)</p>
        {selected.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No featured products chosen. The homepage will use newest products.
          </p>
        ) : (
          <ol className="mt-2 space-y-2">
            {selected.map((id, i) => {
              const p = byId.get(id);
              return (
                <li
                  key={id}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="w-5 text-xs tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate">
                    {p?.name ?? (
                      <span className="text-muted-foreground">
                        Product no longer available
                      </span>
                    )}
                  </span>
                  <button type="button" onClick={() => move(id, -1)} disabled={i === 0} className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-40">
                    Up
                  </button>
                  <button type="button" onClick={() => move(id, 1)} disabled={i === selected.length - 1} className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-40">
                    Down
                  </button>
                  <button type="button" onClick={() => toggle(id)} className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted">
                    Remove
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="rounded-lg border border-border p-4">
        <label className="block">
          <span className="text-sm font-medium">Add products</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or slug..."
            className={inputCls}
          />
        </label>
        <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1">
          {(data?.items ?? []).map((p) => {
            const included = selected.includes(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={
                    included
                      ? "flex w-full items-center justify-between gap-3 rounded-md bg-primary/10 px-3 py-2 text-left text-sm ring-1 ring-inset ring-primary/20"
                      : "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                  }
                >
                  <span className="truncate">
                    <span className="font-medium">{p.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {p.category.name}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {included ? "Selected" : "Add"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border p-5">
      <div className="mb-4">
        <h3 className="font-medium">{title}</h3>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

const inputCls =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30";
