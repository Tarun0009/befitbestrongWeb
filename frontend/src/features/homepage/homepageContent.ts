export interface HomepageValueProp {
  mark: string;
  title: string;
  body: string;
}

export interface HomepageCategoryTile {
  tag: string;
  title: string;
  slug: string;
  imageUrl: string;
  blurb: string;
}

export interface HomepageSpotlightBullet {
  title: string;
  body: string;
}

export interface HomepageContent {
  valueProps: {
    enabled: boolean;
    items: HomepageValueProp[];
  };
  categories: {
    enabled: boolean;
    eyebrow: string;
    title: string;
    ctaLabel: string;
    ctaHref: string;
    items: HomepageCategoryTile[];
  };
  featured: {
    enabled: boolean;
    eyebrow: string;
    title: string;
    ctaLabel: string;
    ctaHref: string;
  };
  recentlyViewedEnabled: boolean;
  spotlightBullets: HomepageSpotlightBullet[];
  support: {
    enabled: boolean;
    eyebrow: string;
    title: string;
    body: string;
    cardBody: string;
    ctaLabel: string;
    ctaHref: string;
  };
}

export const DEFAULT_HOMEPAGE_CONTENT: HomepageContent = {
  valueProps: {
    enabled: true,
    items: [
      { mark: "PIN", title: "Delivery checked", body: "Confirm coverage for your six-digit PIN code." },
      { mark: "\u20B9", title: "Clear pricing", body: "Review the current price and applicable offer at checkout." },
      { mark: "STOCK", title: "Live availability", body: "Product stock is checked before an order is confirmed." },
      { mark: "ORD", title: "Order visibility", body: "Follow status and available actions from your account." },
    ],
  },
  categories: {
    enabled: true,
    eyebrow: "Shop by goal",
    title: "Built for the next session",
    ctaLabel: "All products",
    ctaHref: "/shop",
    items: [
      {
        tag: "Fuel",
        title: "Supplements",
        slug: "supplements",
        imageUrl: "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=900",
        blurb: "Whey, creatine, pre-workout, aminos, and daily health basics.",
      },
      {
        tag: "Iron",
        title: "Equipment",
        slug: "equipment",
        imageUrl: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=900",
        blurb: "Dumbbells, kettlebells, benches, bands, and home-gym staples.",
      },
      {
        tag: "Uniform",
        title: "Apparel",
        slug: "apparel",
        imageUrl: "https://images.unsplash.com/photo-1595078475328-1ab05d0a6a0e?w=900",
        blurb: "Compression tees, shorts, joggers, and layers cut for training.",
      },
      {
        tag: "Kit",
        title: "Accessories",
        slug: "accessories",
        imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=900",
        blurb: "Belts, wraps, straps, shakers, gloves, and the small useful stuff.",
      },
    ],
  },
  featured: {
    enabled: true,
    eyebrow: "Best sellers",
    title: "What lifters are adding to cart",
    ctaLabel: "See new drops",
    ctaHref: "/shop?sort=newest",
  },
  recentlyViewedEnabled: true,
  spotlightBullets: [
    { title: "No hidden blends", body: "Supplements favor full labels, useful dosages, and products you can compare." },
    { title: "Home-gym ready", body: "Equipment is selected for compact setups, repeat use, and sensible shipping." },
    { title: "Training-first fits", body: "Apparel is judged by movement, sweat, and repeat washing before the mirror." },
  ],
  support: {
    enabled: true,
    eyebrow: "Customer care",
    title: "Help before and after checkout",
    body: "Find clear guidance for delivery, payments, returns, cancellations, and account access.",
    cardBody: "Need help with an order or choosing the right product?",
    ctaLabel: "Visit customer support",
    ctaHref: "/support",
  },
};
