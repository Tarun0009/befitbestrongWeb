import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * beFitBeStrong seed — gym vertical.
 *
 * Four categories, ~20 products with realistic variants (flavors for
 * supplements, sizes for apparel, weights for equipment). Image URLs come
 * from Unsplash public collections and may occasionally 404 as the source
 * removes photos — swap for real product photography before launch.
 */

interface SeedProduct {
  name: string;
  description: string;
  basePrice: number; // in paise
  compareAtPrice?: number; // MRP, in paise. Renders strike-through + %-off when set.
  dispatchHint?: string;
  images: string[];
  variants: { size?: string; color?: string; stock: number; price?: number }[];
}

const catalog: Record<string, SeedProduct[]> = {
  Supplements: [
    {
      name: "Whey Protein Isolate 1kg",
      description:
        "24g protein per scoop, cold-processed, ~1g fat/carbs. Certified Informed-Sport tested for banned substances. Mixes clean, no chalky finish.",
      basePrice: 249900,
      compareAtPrice: 399900,
      dispatchHint: "Dispatches in 24 hrs",
      images: [
        "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=800",
      ],
      variants: [
        { color: "Chocolate", stock: 40 },
        { color: "Vanilla", stock: 30 },
        { color: "Cookies & Cream", stock: 25 },
      ],
    },
    {
      name: "Creatine Monohydrate 300g",
      description:
        "Pure micronised creatine monohydrate. 5g per serving, 60 servings. No fillers, no flavoring, no ceremony. The single most-studied supplement in sports nutrition.",
      basePrice: 89900,
      compareAtPrice: 119900,
      dispatchHint: "Dispatches in 24 hrs",
      images: [
        "https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=800",
      ],
      variants: [{ stock: 55 }],
    },
    {
      name: "Pre-Workout Pump 300g",
      description:
        "3.2g beta-alanine, 6g citrulline malate, 200mg caffeine per scoop. 30 servings. Not a stimulant bomb — sustained energy without the crash.",
      basePrice: 189900,
      compareAtPrice: 249900,
      images: [
        "https://images.unsplash.com/photo-1579758629938-03607ccdbaba?w=800",
      ],
      variants: [
        { color: "Blue Raspberry", stock: 22 },
        { color: "Watermelon", stock: 18 },
        { color: "Fruit Punch", stock: 14 },
      ],
    },
    {
      name: "BCAA 2:1:1 250g",
      description:
        "Branched-chain aminos — 5g per serving. Sipping-friendly during long sessions or fasted lifts. Naturally sweetened.",
      basePrice: 129900,
      images: [
        "https://images.unsplash.com/photo-1594381898411-846e7d193883?w=800",
      ],
      variants: [
        { color: "Green Apple", stock: 20 },
        { color: "Mango", stock: 16 },
      ],
    },
    {
      name: "Multivitamin — Athlete Formula",
      description:
        "60 tablets. Higher-dose B-complex, D3+K2, magnesium glycinate, zinc picolinate. Formulated for training loads, not desk workers.",
      basePrice: 79900,
      images: [
        "https://images.unsplash.com/photo-1584308972272-9e4e7685e80f?w=800",
      ],
      variants: [{ stock: 40 }],
    },
    {
      name: "Omega-3 Fish Oil 90 caps",
      description:
        "1200mg triglyceride-form fish oil per softgel — 720mg EPA+DHA. IFOS 5-star certified, lemon-oil coating so no fishy burps.",
      basePrice: 99900,
      images: [
        "https://images.unsplash.com/photo-1550572017-edd951b55104?w=800",
      ],
      variants: [{ stock: 30 }],
    },
  ],
  Equipment: [
    {
      name: "Adjustable Dumbbells (2×24kg)",
      description:
        "Twist-lock adjustable dumbbells. 5kg to 24kg per hand in 2.5kg jumps. Replaces a whole rack — footprint of a shoebox.",
      basePrice: 2499900,
      compareAtPrice: 3299900,
      dispatchHint: "Ships in 2-3 days",
      images: [
        "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800",
      ],
      variants: [{ stock: 8 }],
    },
    {
      name: "Cast Iron Kettlebell",
      description:
        "Single-piece cast iron, powder-coated for grip. Wide handle sits well in the rack position.",
      basePrice: 349900,
      images: [
        "https://images.unsplash.com/photo-1517964603305-11c0f6f66012?w=800",
      ],
      variants: [
        { size: "8kg", stock: 20 },
        { size: "12kg", stock: 18 },
        { size: "16kg", stock: 14 },
        { size: "20kg", stock: 10 },
        { size: "24kg", stock: 6 },
      ],
    },
    {
      name: "Foldable Weight Bench",
      description:
        "Flat / incline / decline, 7 back positions. 300kg rated. Folds flat for storage. Rubber feet won't scratch flooring.",
      basePrice: 1299900,
      images: [
        "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800",
      ],
      variants: [{ stock: 5 }],
    },
    {
      name: "Resistance Bands Set (5-piece)",
      description:
        "5 fabric-covered loop bands from 5kg to 45kg resistance. Includes carry bag, door anchor, and handles.",
      basePrice: 179900,
      images: [
        "https://images.unsplash.com/photo-1591741535018-d042766c62eb?w=800",
      ],
      variants: [
        { color: "Black", stock: 25 },
        { color: "Charcoal", stock: 15 },
      ],
    },
    {
      name: "Jump Rope — Weighted",
      description:
        "Adjustable length (up to 3m), 400g handles. Steel cable coated in PVC. HIIT / crossfit staple.",
      basePrice: 149900,
      images: [
        "https://images.unsplash.com/photo-1587380541122-79b9f8e2fe33?w=800",
      ],
      variants: [
        { color: "Black", stock: 30 },
        { color: "Yellow", stock: 20 },
      ],
    },
    {
      name: "Yoga & Recovery Mat 6mm",
      description:
        "TPE, 6mm cushion, 183×61cm. Non-slip both sides — grips on hardwood or tile.",
      basePrice: 249900,
      images: [
        "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800",
      ],
      variants: [
        { color: "Charcoal", stock: 22 },
        { color: "Sand", stock: 16 },
      ],
    },
    {
      name: "Foam Roller — High Density",
      description:
        "45cm high-density EPP foam. Firm enough to bite into the IT band without collapsing. Won't lose shape after months of use.",
      basePrice: 129900,
      images: [
        "https://images.unsplash.com/photo-1591291621086-1e0b78d29ff5?w=800",
      ],
      variants: [{ stock: 28 }],
    },
  ],
  Apparel: [
    {
      name: "Compression Training Tee",
      description:
        "Second-skin fit, 4-way stretch, seamless side panels. Sweat-wicking with mesh under the arms. Cut for lifting mobility, not just aesthetics.",
      basePrice: 149900,
      compareAtPrice: 199900,
      images: [
        "https://images.unsplash.com/photo-1595078475328-1ab05d0a6a0e?w=800",
      ],
      variants: [
        { size: "S", color: "Black", stock: 12 },
        { size: "M", color: "Black", stock: 18 },
        { size: "L", color: "Black", stock: 20 },
        { size: "XL", color: "Black", stock: 12 },
        { size: "M", color: "Charcoal", stock: 10 },
      ],
    },
    {
      name: "Training Shorts 7-inch",
      description:
        "Lightweight woven fabric, built-in liner, zippered phone pocket. 7-inch inseam — squat-friendly without riding up.",
      basePrice: 179900,
      images: [
        "https://images.unsplash.com/photo-1483721310020-03333e577078?w=800",
      ],
      variants: [
        { size: "S", color: "Black", stock: 10 },
        { size: "M", color: "Black", stock: 16 },
        { size: "L", color: "Black", stock: 14 },
        { size: "M", color: "Grey", stock: 10 },
      ],
    },
    {
      name: "Training Joggers",
      description:
        "Tapered fit, cotton-poly-elastane blend. Zippered hand pockets, elasticated cuff. Warm-up ready, cool-down comfortable.",
      basePrice: 249900,
      images: [
        "https://images.unsplash.com/photo-1552902865-b72c031ac5ea?w=800",
      ],
      variants: [
        { size: "M", color: "Black", stock: 12 },
        { size: "L", color: "Black", stock: 16 },
        { size: "XL", color: "Black", stock: 10 },
        { size: "L", color: "Navy", stock: 8 },
      ],
    },
    {
      name: "Oversized Training Hoodie",
      description:
        "400 GSM cotton fleece, dropped shoulder, boxy fit. Kangaroo pocket built for actual hands. Wear it to lift, wear it home.",
      basePrice: 349900,
      images: [
        "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800",
      ],
      variants: [
        { size: "M", color: "Stone", stock: 8 },
        { size: "L", color: "Stone", stock: 10 },
        { size: "XL", color: "Black", stock: 6 },
      ],
    },
  ],
  Accessories: [
    {
      name: "Weightlifting Belt — 4 inch",
      description:
        "Full-grain leather, 10mm thick, single-prong buckle. 4-inch even width — legal for most powerlifting federations.",
      basePrice: 449900,
      images: [
        "https://images.unsplash.com/photo-1620188467120-5042ed1eb5da?w=800",
      ],
      variants: [
        { size: "S (25-30\")", stock: 8 },
        { size: "M (30-36\")", stock: 12 },
        { size: "L (36-42\")", stock: 10 },
        { size: "XL (42-48\")", stock: 6 },
      ],
    },
    {
      name: "Lifting Straps — Cotton",
      description:
        "1.5-inch cotton lasso straps. For deadlift, rack pulls, shrugs — anything where grip fails before the target muscle. Neoprene wrist padding.",
      basePrice: 79900,
      images: [
        "https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=800",
      ],
      variants: [{ stock: 40 }],
    },
    {
      name: "Wrist Wraps — 24 inch",
      description:
        "Stiff woven-elastic wraps, thumb loop + velcro closure. IPF-legal length. Support for heavy pressing without going full brace.",
      basePrice: 89900,
      images: [
        "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=800",
      ],
      variants: [
        { color: "Black", stock: 25 },
        { color: "Red", stock: 12 },
      ],
    },
    {
      name: "Shaker Bottle 700ml",
      description:
        "BPA-free, whisk-ball mixer, leak-proof lid. Wide screw-thread cleans easily. Doesn't smell after a week — actually.",
      basePrice: 39900,
      compareAtPrice: 59900,
      images: [
        "https://images.unsplash.com/photo-1610499232269-84c7bfdb2ceb?w=800",
      ],
      variants: [
        { color: "Black", stock: 50 },
        { color: "Yellow", stock: 30 },
      ],
    },
    {
      name: "Gym Duffel Bag 40L",
      description:
        "Water-resistant coated fabric, dedicated shoe compartment, ventilated wet-clothes pouch. Fits shoes, kit, and a shaker with room left over.",
      basePrice: 349900,
      images: [
        "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800",
      ],
      variants: [
        { color: "Black", stock: 15 },
        { color: "Charcoal", stock: 10 },
      ],
    },
    {
      name: "Training Gloves",
      description:
        "Half-finger, padded palm, silicone grip zones. Wrist strap for extra stability. Reduce calluses without going full sissy.",
      basePrice: 99900,
      images: [
        "https://images.unsplash.com/photo-1583454153931-79f38b41c5d1?w=800",
      ],
      variants: [
        { size: "S", stock: 10 },
        { size: "M", stock: 18 },
        { size: "L", stock: 14 },
      ],
    },
  ],
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  console.log("[seed] wiping catalog tables");
  await prisma.productImage.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();

  const categoryBlurbs: Record<string, string> = {
    Supplements:
      "Protein, creatine, aminos — brands that actually publish their testing.",
    Equipment:
      "Home-gym staples. Adjustable dumbbells, benches, bands, kettlebells.",
    Apparel:
      "Compression, joggers, hoodies — cut for lifting, not lounging.",
    Accessories:
      "Belts, straps, wraps, shakers — the small stuff that outlasts the workout.",
  };

  for (const [categoryName, products] of Object.entries(catalog)) {
    const category = await prisma.category.create({
      data: {
        name: categoryName,
        slug: slugify(categoryName),
        description: categoryBlurbs[categoryName],
      },
    });
    console.log(`[seed] category: ${category.name}`);

    for (const p of products) {
      const product = await prisma.product.create({
        data: {
          name: p.name,
          slug: slugify(p.name),
          description: p.description,
          basePrice: p.basePrice,
          categoryId: category.id,
          images: {
            create: p.images.map((url, i) => ({
              url,
              alt: p.name,
              position: i,
            })),
          },
          variants: {
            create: p.variants.map((v, i) => ({
              sku: `${slugify(p.name)}-${i + 1}`,
              size: v.size,
              color: v.color,
              price: v.price ?? p.basePrice,
              stock: v.stock,
            })),
          },
        },
      });

      // compareAtPrice + dispatchHint via raw SQL — Prisma client types may
      // lag behind schema changes on Windows dev boxes where the query-engine
      // DLL is locked by tsx-watch. Raw update sidesteps that.
      const compareAt = p.compareAtPrice ?? null;
      const hint = p.dispatchHint ?? "Dispatches in 24 hrs";
      await prisma.$executeRaw`
        UPDATE "Product"
           SET "compareAtPrice" = ${compareAt},
               "dispatchHint"   = ${hint}
         WHERE "id" = ${product.id}
      `;
      console.log(`[seed]   → ${product.name}`);
    }
  }

  const counts = {
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    variants: await prisma.productVariant.count(),
    images: await prisma.productImage.count(),
  };
  console.log("[seed] done:", counts);
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
