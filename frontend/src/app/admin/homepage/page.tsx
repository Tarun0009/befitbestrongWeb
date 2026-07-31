"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  useAdminGetSiteConfigQuery,
  useAdminUpdateHomepageSectionMutation,
  useAdminUpdateSiteConfigMutation,
  type AdminHomepageSectionUpdate,
  type AdminSiteConfig,
  type AdminSiteConfigPatch,
  type HeroSlide,
  type RewardTier,
} from "@/lib/siteConfigApi";
import { useAdminListProductsQuery } from "@/lib/catalogApi";
import { hasChangedFields } from "@/lib/changedFields";

import {
  DEFAULT_HOMEPAGE_CONTENT,
  type HomepageCategoryTile,
  type HomepageContent,
  type HomepageSpotlightBullet,
  type HomepageValueProp,
} from "@/features/homepage/homepageContent";
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
  const [updateSiteConfig] = useAdminUpdateSiteConfigMutation();
  const [updateHomepageSection] = useAdminUpdateHomepageSectionMutation();

  const [draft, setDraft] = useState<AdminSiteConfig | null>(null);
  const [baseline, setBaseline] = useState<AdminSiteConfig | null>(null);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [sectionStatus, setSectionStatus] = useState<
    Record<string, { message: string; error: boolean }>
  >({});

  useEffect(() => {
    if (data?.config && !draft) {
      const normalized = {
        ...data.config,
        heroSlides: data.config.heroSlides ?? [],
        rewardTiers: data.config.rewardTiers ?? [],
        homepageContent:
          data.config.homepageContent ?? DEFAULT_HOMEPAGE_CONTENT,
      };
      setDraft(normalized);
      setBaseline(normalized);
    }
  }, [data, draft]);

  if (isLoading || !draft || !baseline) {
    return <div className="h-40 animate-pulse rounded-lg bg-muted" />;
  }

  const set = <K extends keyof AdminSiteConfig>(
    key: K,
    value: AdminSiteConfig[K],
  ) => setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const announcementPatch = buildSiteConfigPatch(draft, baseline, [
    "announcementEnabled",
    "announcementText",
    "announcementCode",
    "announcementCtaText",
    "announcementCtaHref",
  ]);
  const fallbackHeroPatch = buildSiteConfigPatch(draft, baseline, [
    "heroEyebrow",
    "heroHeadline",
    "heroHighlight",
    "heroSubtitle",
    "heroPrimaryLabel",
    "heroPrimaryHref",
    "heroSecondaryLabel",
    "heroSecondaryHref",
  ]);
  const carouselPatch = buildSiteConfigPatch(draft, baseline, ["heroSlides"]);
  const rewardsPatch = buildSiteConfigPatch(draft, baseline, ["rewardTiers"]);
  const featuredPatch = buildSiteConfigPatch(draft, baseline, [
    "featuredProductIds",
  ]);
  const spotlightPatch = buildSiteConfigPatch(draft, baseline, [
    "spotlightEnabled",
    "spotlightEyebrow",
    "spotlightTitle",
    "spotlightBody",
    "spotlightCtaLabel",
    "spotlightCtaHref",
  ]);

  async function saveSiteSection(
    section: string,
    patch: AdminSiteConfigPatch,
  ) {
    if (Object.keys(patch).length === 0) return;
    setSavingSection(section);
    setSectionStatus((current) => omitKey(current, section));
    try {
      const response = await updateSiteConfig(patch).unwrap();
      const keys = Object.keys(patch) as Array<keyof AdminSiteConfigPatch>;
      setBaseline((current) => {
        if (!current) return current;
        const next = { ...current };
        for (const key of keys) {
          (next as unknown as Record<string, unknown>)[key] =
            response.config[key];
        }
        return next;
      });
      setSectionStatus((current) => ({
        ...current,
        [section]: { message: "Saved and published.", error: false },
      }));
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      setSectionStatus((current) => ({
        ...current,
        [section]: {
          message: e.data?.error?.message ?? "This section could not be saved.",
          error: true,
        },
      }));
    } finally {
      setSavingSection(null);
    }
  }

  async function saveHomepageContentSection(
    section: keyof HomepageContent,
  ) {
    if (!draft) return;
    const sectionKey = `homepage-${section}`;
    setSavingSection(sectionKey);
    setSectionStatus((current) => omitKey(current, sectionKey));
    try {
      const request = {
        section,
        value: draft.homepageContent[section],
      } as AdminHomepageSectionUpdate;
      const response = await updateHomepageSection(request).unwrap();
      setBaseline((current) =>
        current
          ? {
              ...current,
              homepageContent: {
                ...current.homepageContent,
                [section]: response.config.homepageContent[section],
              },
            }
          : current,
      );
      setSectionStatus((current) => ({
        ...current,
        [sectionKey]: { message: "Saved and published.", error: false },
      }));
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      setSectionStatus((current) => ({
        ...current,
        [sectionKey]: {
          message: e.data?.error?.message ?? "This section could not be saved.",
          error: true,
        },
      }));
    } finally {
      setSavingSection(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6">
        <h2 className="text-2xl font-semibold">Homepage & announcement</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Control storefront banners, imagery, merchandising sections, support
          content, rewards, and featured products without a code deployment.
        </p>
        <p className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
          Each card saves independently and sends only its changed fields.
        </p>
      </header>

      <Section
        title="Announcement bar"
        description="Yellow strip above the header. Turn off to hide it site-wide."
        dirty={hasChangedFields(announcementPatch)}
        saving={savingSection === "announcement"}
        status={sectionStatus.announcement}
        onSave={() => saveSiteSection("announcement", announcementPatch)}
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
        dirty={hasChangedFields(fallbackHeroPatch)}
        saving={savingSection === "fallback-hero"}
        status={sectionStatus["fallback-hero"]}
        onSave={() => saveSiteSection("fallback-hero", fallbackHeroPatch)}
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
        dirty={hasChangedFields(carouselPatch)}
        saving={savingSection === "hero-carousel"}
        status={sectionStatus["hero-carousel"]}
        onSave={() => saveSiteSection("hero-carousel", carouselPatch)}
      >
        <HeroSlidesEditor
          slides={draft.heroSlides}
          onChange={(slides) => set("heroSlides", slides)}
        />
      </Section>

      <Section
        title="Rewards ticker"
        description="Thresholds are in rupees and render below the announcement bar."
        dirty={hasChangedFields(rewardsPatch)}
        saving={savingSection === "rewards"}
        status={sectionStatus.rewards}
        onSave={() => saveSiteSection("rewards", rewardsPatch)}
      >
        <RewardTiersEditor
          tiers={draft.rewardTiers}
          onChange={(tiers) => set("rewardTiers", tiers)}
        />
      </Section>

      <HomepageContentEditor
        content={draft.homepageContent}
        original={baseline.homepageContent}
        onChange={(content) => set("homepageContent", content)}
        onSave={saveHomepageContentSection}
        savingSection={savingSection}
        sectionStatus={sectionStatus}
      />

      <Section
        title="Featured products"
        description="Ordered list surfaced on the homepage. Leave empty to show newest products automatically."
        dirty={hasChangedFields(featuredPatch)}
        saving={savingSection === "featured-products"}
        status={sectionStatus["featured-products"]}
        onSave={() => saveSiteSection("featured-products", featuredPatch)}
      >
        <FeaturedPicker
          selected={draft.featuredProductIds}
          onChange={(ids) => set("featuredProductIds", ids)}
        />
      </Section>

      <Section
        title="Spotlight section"
        description="Callout below the featured grid. Toggle off to hide it entirely."
        dirty={hasChangedFields(spotlightPatch)}
        saving={savingSection === "spotlight"}
        status={sectionStatus.spotlight}
        onSave={() => saveSiteSection("spotlight", spotlightPatch)}
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

    </div>
  );
}

function HomepageContentEditor({
  content,
  original,
  onChange,
  onSave,
  savingSection,
  sectionStatus,
}: {
  content: HomepageContent;
  original: HomepageContent;
  onChange: (content: HomepageContent) => void;
  onSave: (section: keyof HomepageContent) => Promise<void>;
  savingSection: string | null;
  sectionStatus: Record<string, { message: string; error: boolean }>;
}) {
  function updateValueProp<K extends keyof HomepageValueProp>(
    index: number,
    key: K,
    value: HomepageValueProp[K],
  ) {
    const items = content.valueProps.items.map((item, itemIndex) =>
      itemIndex === index ? { ...item, [key]: value } : item,
    );
    onChange({
      ...content,
      valueProps: { ...content.valueProps, items },
    });
  }

  function updateCategory<K extends keyof HomepageCategoryTile>(
    index: number,
    key: K,
    value: HomepageCategoryTile[K],
  ) {
    const items = content.categories.items.map((item, itemIndex) =>
      itemIndex === index ? { ...item, [key]: value } : item,
    );
    onChange({
      ...content,
      categories: { ...content.categories, items },
    });
  }

  function updateSpotlightBullet<K extends keyof HomepageSpotlightBullet>(
    index: number,
    key: K,
    value: HomepageSpotlightBullet[K],
  ) {
    onChange({
      ...content,
      spotlightBullets: content.spotlightBullets.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    });
  }

  return (
    <>
      <Section
        title="Trust strip"
        description="Short customer promises displayed directly below the hero."
        dirty={valuesDiffer(content.valueProps, original.valueProps)}
        saving={savingSection === "homepage-valueProps"}
        status={sectionStatus["homepage-valueProps"]}
        onSave={() => onSave("valueProps")}
      >
        <Toggle
          label="Show trust strip"
          checked={content.valueProps.enabled}
          onChange={(enabled) =>
            onChange({
              ...content,
              valueProps: { ...content.valueProps, enabled },
            })
          }
        />
        {content.valueProps.items.map((item, index) => (
          <div
            key={"value-" + index}
            className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-[120px_1fr_2fr_auto]"
          >
            <Field label="Badge">
              <input
                required
                value={item.mark}
                onChange={(event) =>
                  updateValueProp(index, "mark", event.target.value)
                }
                maxLength={12}
                className={inputCls}
              />
            </Field>
            <Field label="Title">
              <input
                required
                value={item.title}
                onChange={(event) =>
                  updateValueProp(index, "title", event.target.value)
                }
                maxLength={80}
                className={inputCls}
              />
            </Field>
            <Field label="Message">
              <input
                required
                value={item.body}
                onChange={(event) =>
                  updateValueProp(index, "body", event.target.value)
                }
                maxLength={240}
                className={inputCls}
              />
            </Field>
            <EditorActions
              index={index}
              count={content.valueProps.items.length}
              onMove={(direction) =>
                onChange({
                  ...content,
                  valueProps: {
                    ...content.valueProps,
                    items: moveItem(content.valueProps.items, index, direction),
                  },
                })
              }
              onRemove={() =>
                onChange({
                  ...content,
                  valueProps: {
                    ...content.valueProps,
                    items: content.valueProps.items.filter(
                      (_, itemIndex) => itemIndex !== index,
                    ),
                  },
                })
              }
            />
          </div>
        ))}
        <AddButton
          label="Add trust item"
          disabled={content.valueProps.items.length >= 6}
          onClick={() =>
            onChange({
              ...content,
              valueProps: {
                ...content.valueProps,
                items: [
                  ...content.valueProps.items,
                  {
                    mark: "NEW",
                    title: "Customer promise",
                    body: "Explain this promise in one clear sentence.",
                  },
                ],
              },
            })
          }
        />
      </Section>

      <Section
        title="Category artwork"
        description="Control the category section copy, tile order, images, and destinations."
        dirty={valuesDiffer(content.categories, original.categories)}
        saving={savingSection === "homepage-categories"}
        status={sectionStatus["homepage-categories"]}
        onSave={() => onSave("categories")}
      >
        <Toggle
          label="Show category section"
          checked={content.categories.enabled}
          onChange={(enabled) =>
            onChange({
              ...content,
              categories: { ...content.categories, enabled },
            })
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Eyebrow">
            <input required value={content.categories.eyebrow} onChange={(event) => onChange({ ...content, categories: { ...content.categories, eyebrow: event.target.value } })} maxLength={60} className={inputCls} />
          </Field>
          <Field label="Section title">
            <input required value={content.categories.title} onChange={(event) => onChange({ ...content, categories: { ...content.categories, title: event.target.value } })} maxLength={120} className={inputCls} />
          </Field>
          <Field label="CTA label">
            <input required value={content.categories.ctaLabel} onChange={(event) => onChange({ ...content, categories: { ...content.categories, ctaLabel: event.target.value } })} maxLength={60} className={inputCls} />
          </Field>
          <Field label="CTA link">
            <input required value={content.categories.ctaHref} onChange={(event) => onChange({ ...content, categories: { ...content.categories, ctaHref: event.target.value } })} className={inputCls} />
          </Field>
        </div>
        {content.categories.items.map((item, index) => (
          <div
            key={"category-" + index}
            className="rounded-xl border border-border p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Tile {index + 1}</p>
              <EditorActions
                index={index}
                count={content.categories.items.length}
                onMove={(direction) =>
                  onChange({
                    ...content,
                    categories: {
                      ...content.categories,
                      items: moveItem(
                        content.categories.items,
                        index,
                        direction,
                      ),
                    },
                  })
                }
                onRemove={() =>
                  onChange({
                    ...content,
                    categories: {
                      ...content.categories,
                      items: content.categories.items.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    },
                  })
                }
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
              <div className="overflow-hidden rounded-lg border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl}
                  alt=""
                  className="aspect-[4/3] h-full w-full object-cover"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Label">
                  <input required value={item.tag} onChange={(event) => updateCategory(index, "tag", event.target.value)} maxLength={40} className={inputCls} />
                </Field>
                <Field label="Title">
                  <input required value={item.title} onChange={(event) => updateCategory(index, "title", event.target.value)} maxLength={80} className={inputCls} />
                </Field>
                <Field label="Category slug">
                  <input required value={item.slug} onChange={(event) => updateCategory(index, "slug", event.target.value.toLowerCase())} maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" className={inputCls} />
                </Field>
                <Field label="Image URL">
                  <input type="url" required value={item.imageUrl} onChange={(event) => updateCategory(index, "imageUrl", event.target.value)} className={inputCls} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Description">
                    <textarea required value={item.blurb} onChange={(event) => updateCategory(index, "blurb", event.target.value)} rows={2} maxLength={240} className={inputCls} />
                  </Field>
                </div>
              </div>
            </div>
          </div>
        ))}
        <AddButton
          label="Add category tile"
          disabled={content.categories.items.length >= 8}
          onClick={() =>
            onChange({
              ...content,
              categories: {
                ...content.categories,
                items: [
                  ...content.categories.items,
                  {
                    tag: "Collection",
                    title: "New category",
                    slug: "new-category",
                    imageUrl:
                      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=900",
                    blurb: "Describe what customers will find in this collection.",
                  },
                ],
              },
            })
          }
        />
      </Section>

      <Section
        title="Featured products presentation"
        description="The products are selected below; these fields control the section heading and CTA."
        dirty={valuesDiffer(content.featured, original.featured)}
        saving={savingSection === "homepage-featured"}
        status={sectionStatus["homepage-featured"]}
        onSave={() => onSave("featured")}
      >
        <Toggle label="Show featured products" checked={content.featured.enabled} onChange={(enabled) => onChange({ ...content, featured: { ...content.featured, enabled } })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Eyebrow"><input required value={content.featured.eyebrow} onChange={(event) => onChange({ ...content, featured: { ...content.featured, eyebrow: event.target.value } })} maxLength={60} className={inputCls} /></Field>
          <Field label="Title"><input required value={content.featured.title} onChange={(event) => onChange({ ...content, featured: { ...content.featured, title: event.target.value } })} maxLength={120} className={inputCls} /></Field>
          <Field label="CTA label"><input required value={content.featured.ctaLabel} onChange={(event) => onChange({ ...content, featured: { ...content.featured, ctaLabel: event.target.value } })} maxLength={60} className={inputCls} /></Field>
          <Field label="CTA link"><input required value={content.featured.ctaHref} onChange={(event) => onChange({ ...content, featured: { ...content.featured, ctaHref: event.target.value } })} className={inputCls} /></Field>
        </div>
      </Section>

      <Section
        title="Spotlight cards"
        description="Supporting cards displayed beside the spotlight content."
        dirty={valuesDiffer(content.spotlightBullets, original.spotlightBullets)}
        saving={savingSection === "homepage-spotlightBullets"}
        status={sectionStatus["homepage-spotlightBullets"]}
        onSave={() => onSave("spotlightBullets")}
      >
        {content.spotlightBullets.map((item, index) => (
          <div key={"spotlight-" + index} className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-[1fr_2fr_auto]">
            <Field label="Title"><input required value={item.title} onChange={(event) => updateSpotlightBullet(index, "title", event.target.value)} maxLength={100} className={inputCls} /></Field>
            <Field label="Message"><input required value={item.body} onChange={(event) => updateSpotlightBullet(index, "body", event.target.value)} maxLength={240} className={inputCls} /></Field>
            <EditorActions index={index} count={content.spotlightBullets.length} onMove={(direction) => onChange({ ...content, spotlightBullets: moveItem(content.spotlightBullets, index, direction) })} onRemove={() => onChange({ ...content, spotlightBullets: content.spotlightBullets.filter((_, itemIndex) => itemIndex !== index) })} />
          </div>
        ))}
        <AddButton label="Add spotlight card" disabled={content.spotlightBullets.length >= 6} onClick={() => onChange({ ...content, spotlightBullets: [...content.spotlightBullets, { title: "New benefit", body: "Explain the customer benefit clearly." }] })} />
      </Section>

      <Section
        title="Recently viewed"
        description="Customer-specific browsing history shown below featured products."
        dirty={content.recentlyViewedEnabled !== original.recentlyViewedEnabled}
        saving={savingSection === "homepage-recentlyViewedEnabled"}
        status={sectionStatus["homepage-recentlyViewedEnabled"]}
        onSave={() => onSave("recentlyViewedEnabled")}
      >
        <Toggle label="Show recently viewed products" checked={content.recentlyViewedEnabled} onChange={(recentlyViewedEnabled) => onChange({ ...content, recentlyViewedEnabled })} />
      </Section>

      <Section
        title="Customer support callout"
        description="Final homepage support section and its action."
        dirty={valuesDiffer(content.support, original.support)}
        saving={savingSection === "homepage-support"}
        status={sectionStatus["homepage-support"]}
        onSave={() => onSave("support")}
      >
        <Toggle label="Show support callout" checked={content.support.enabled} onChange={(enabled) => onChange({ ...content, support: { ...content.support, enabled } })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Eyebrow"><input required value={content.support.eyebrow} onChange={(event) => onChange({ ...content, support: { ...content.support, eyebrow: event.target.value } })} maxLength={60} className={inputCls} /></Field>
          <Field label="Title"><input required value={content.support.title} onChange={(event) => onChange({ ...content, support: { ...content.support, title: event.target.value } })} maxLength={120} className={inputCls} /></Field>
        </div>
        <Field label="Description"><textarea required value={content.support.body} onChange={(event) => onChange({ ...content, support: { ...content.support, body: event.target.value } })} rows={2} maxLength={400} className={inputCls} /></Field>
        <Field label="Support card message"><input required value={content.support.cardBody} onChange={(event) => onChange({ ...content, support: { ...content.support, cardBody: event.target.value } })} maxLength={240} className={inputCls} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="CTA label"><input required value={content.support.ctaLabel} onChange={(event) => onChange({ ...content, support: { ...content.support, ctaLabel: event.target.value } })} maxLength={60} className={inputCls} /></Field>
          <Field label="CTA link"><input required value={content.support.ctaHref} onChange={(event) => onChange({ ...content, support: { ...content.support, ctaHref: event.target.value } })} className={inputCls} /></Field>
        </div>
      </Section>
    </>
  );
}

function valuesDiffer(left: unknown, right: unknown) {
  if (Object.is(left, right)) return false;
  if (left === null || right === null) return true;
  if (typeof left !== "object" || typeof right !== "object") return true;
  return JSON.stringify(left) !== JSON.stringify(right);
}

function buildSiteConfigPatch(
  current: AdminSiteConfig,
  original: AdminSiteConfig,
  keys: Array<keyof AdminSiteConfigPatch>,
) {
  const patch: AdminSiteConfigPatch = {};
  for (const key of keys) {
    if (valuesDiffer(current[key], original[key])) {
      (patch as Record<string, unknown>)[key] = current[key];
    }
  }
  return patch;
}

function omitKey<T>(current: Record<string, T>, key: string) {
  const next = { ...current };
  delete next[key];
  return next;
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
}

function AddButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40">
      {label}
    </button>
  );
}

function EditorActions({
  index,
  count,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-end gap-1">
      <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-40">Up</button>
      <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-40">Down</button>
      <button type="button" onClick={onRemove} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">Remove</button>
    </div>
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
              <EditorActions
                index={index}
                count={slides.length}
                onMove={(direction) =>
                  onChange(moveItem(slides, index, direction))
                }
                onRemove={() =>
                  onChange(slides.filter((_, i) => i !== index))
                }
              />
            </div>
            {slide.imageUrl && (
              <div className="mb-4 overflow-hidden rounded-xl border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slide.imageUrl}
                  alt=""
                  loading="lazy"
                  className="aspect-[16/6] w-full object-cover"
                />
              </div>
            )}
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
  dirty,
  saving,
  status,
  onSave,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  dirty: boolean;
  saving: boolean;
  status?: { message: string; error: boolean };
  onSave: () => void | Promise<void>;
}) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (dirty && !saving) void onSave();
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={saving}
      className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white shadow-[0_10px_35px_rgba(23,23,20,0.04)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/[0.06] px-5 py-4 sm:px-6">
        <div>
          <h3 className="font-semibold tracking-tight">{title}</h3>
          {description && (
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        <span
          className={
            dirty
              ? "rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-800"
              : "rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700"
          }
        >
          {dirty ? "Unsaved" : "Up to date"}
        </span>
      </div>
      <div className="space-y-4 px-5 py-5 sm:px-6">{children}</div>
      <div className="flex min-h-16 flex-wrap items-center gap-3 border-t border-black/[0.06] bg-[#faf9f6] px-5 py-3 sm:px-6">
        <button
          type="submit"
          disabled={!dirty || saving}
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving section…" : "Save this section"}
        </button>
        {status && (!dirty || status.error) && (
          <span
            role={status.error ? "alert" : "status"}
            className={status.error ? "text-sm text-red-700" : "text-sm text-emerald-700"}
          >
            {status.message}
          </span>
        )}
      </div>
    </form>
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
  "mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-[#faf9f6] px-3 py-2 text-sm outline-none transition focus:border-foreground/20 focus:bg-white focus:ring-2 focus:ring-primary/35";
