"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { HeroSlide, PublicSiteConfig } from "@/lib/siteConfigApi";

interface HeroCarouselProps {
  config: PublicSiteConfig | undefined;
}

const DEFAULT_HERO_IMAGE =
  "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1800&auto=format&fit=crop&q=85";

function legacyHero(config: PublicSiteConfig | undefined): HeroSlide {
  const hero = config?.hero;
  return {
    eyebrow: hero?.eyebrow ?? "beFitBeStrong",
    headline: hero?.headline ?? "Fuel, gear, and kit for serious training.",
    highlight: hero?.highlight ?? "Built for the work",
    subtitle:
      hero?.subtitle ??
      "Supplements, home gym equipment, apparel, and accessories selected for lifters who read the label and use the gear.",
    primaryLabel: hero?.primary.label ?? "Shop now",
    primaryHref: hero?.primary.href ?? "/shop",
    secondaryLabel: hero?.secondary?.label ?? "Explore supplements",
    secondaryHref: hero?.secondary?.href ?? "/shop?category=supplements",
  };
}

export function HeroCarousel({ config }: HeroCarouselProps) {
  const slides = useMemo(() => {
    const configured =
      config?.heroSlides?.filter((slide) => slide.headline.trim()) ?? [];
    return configured.length > 0 ? configured : [legacyHero(config)];
  }, [config]);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const slide = slides[active] ?? slides[0] ?? legacyHero(config);
  const preferredImage = slide.imageUrl || DEFAULT_HERO_IMAGE;
  const [imageSrc, setImageSrc] = useState<string | null>(preferredImage);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) setPaused(true);
  }, []);

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % slides.length);
    }, 5500);
    return () => window.clearInterval(timer);
  }, [paused, slides.length]);

  useEffect(() => {
    setActive(0);
  }, [slides.length]);

  useEffect(() => {
    setImageSrc(preferredImage);
  }, [preferredImage]);

  function handleImageError() {
    if (imageSrc !== DEFAULT_HERO_IMAGE) {
      setImageSrc(DEFAULT_HERO_IMAGE);
      return;
    }
    setImageSrc(null);
  }

  return (
    <section
      className="relative min-h-[68vh] overflow-hidden border-b border-border bg-foreground text-background sm:min-h-[72vh]"
      aria-label="Homepage promotions"
      aria-roledescription="carousel"
    >
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(245,184,0,0.22),transparent_35%),linear-gradient(135deg,#242018_0%,#0d0d0c_55%,#050505_100%)]"
        aria-hidden="true"
      />
      {imageSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt=""
          width={1800}
          height={1200}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          aria-hidden="true"
          onError={handleImageError}
        />
      )}
      <div
        className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/25"
        aria-hidden="true"
      />

      <div className="relative mx-auto flex min-h-[68vh] max-w-6xl flex-col justify-end px-6 pb-14 pt-28 sm:min-h-[72vh] sm:pb-16">
        <p className="max-w-fit rounded-md bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary-foreground">
          {slide.eyebrow}
        </p>
        <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-[1.05] sm:text-6xl lg:text-7xl">
          {slide.headline}
          {slide.highlight && (
            <span className="mt-2 block text-primary">{slide.highlight}</span>
          )}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-white/80 sm:text-lg">
          {slide.subtitle}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={slide.primaryHref}
            className="rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:brightness-95"
          >
            {slide.primaryLabel}
          </Link>
          {slide.secondaryLabel && slide.secondaryHref && (
            <Link
              href={slide.secondaryHref}
              className="rounded-md border border-white/40 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              {slide.secondaryLabel}
            </Link>
          )}
        </div>

        {slides.length > 1 && (
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <div className="flex gap-2" aria-label="Choose featured slide">
              {slides.map((item, index) => (
                <button
                  key={item.headline + "-" + index}
                  type="button"
                  onClick={() => setActive(index)}
                  className={
                    index === active
                      ? "h-2.5 w-8 rounded-full bg-primary"
                      : "h-2.5 w-2.5 rounded-full bg-white/50 hover:bg-white/80"
                  }
                  aria-label={"Show slide " + (index + 1)}
                  aria-current={index === active ? "true" : undefined}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPaused((current) => !current)}
              className="rounded-md border border-white/40 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/10"
              aria-pressed={paused}
            >
              {paused ? "Play slides" : "Pause slides"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
