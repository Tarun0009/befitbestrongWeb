# Frontend Design System

Locked-in design tokens and component patterns for beFitBeStrong.
Every new page/component should match this. If a case genuinely doesn't fit, update this doc first — don't diverge silently.

**Brand direction:** yellow-forward gym eCommerce. Vivid yellow primary + deep warm charcoal text. Neutrals carry a slight warm tint (~40° hue) so the surface feels tonal with the primary instead of a cold-gray-plus-hot-yellow clash.

---

## Design principles

- **Content-first, minimal chrome.** No gradients, no drop shadows, no rounded-2xl bubble cards. Structure comes from thin 1px borders and generous whitespace.
- **One primary action per view.** Buttons compete when there are two "solid" CTAs on the same screen — outline the secondary.
- **Text is the design.** Type hierarchy and spacing carry the layout. Icons are supporting, not decorative.
- **Two-tone by default.** Foreground + background + one accent (border, muted). No third color unless it's semantic (error red, success emerald, warning amber).
- **Data reads left-to-right, actions cluster right.** Nav on the right of the header, actions on the right of a row.

---

## Color tokens (CSS custom properties in `globals.css`)

Semantic-only. Never hardcode hex.

```css
--background        (page background)          /* white — warm-tinted in dark */
--foreground        (default text)             /* deep warm charcoal */
--primary           (main button / anchor)     /* vivid brand yellow */
--primary-foreground(text on primary)          /* deep warm charcoal — reads on yellow */
--primary-emphasis  (brand text on surfaces)   /* darker gold with WCAG text contrast */
--muted             (subtle surfaces)          /* pale warm gray-cream */
--muted-foreground  (secondary text)
--border            (1px separators, outlines) /* warm-tinted light gray */
```

**Semantic status colors** (not tokenized — use Tailwind literals with `-500/10` background + `-600` text + `-500/20` ring):

| State | Bg | Text | Ring |
|---|---|---|---|
| success | `emerald-500/10` | `emerald-600` | `emerald-500/20` |
| warning | `orange-500/10` | `orange-600` | `orange-500/20` |
| error   | `red-50` (border `red-300`) | `red-700` | — |
| neutral | `muted` | `muted-foreground` | `border` |

**Why orange for warning, not amber:** amber is essentially dark yellow — it blends into the primary and status pills stop reading at a glance. Orange preserves the "hot/attention" register while staying visually distinct from the brand.

Dark mode is defined but not yet toggle-driven — keep all colors dark-mode-safe (use tokens, not literal grays).

---

## Typography

Tailwind's default stack + `font-feature-settings: "cv02","cv03","cv04","cv11"` from `globals.css` for humanist letterforms.

| Use | Class |
|---|---|
| Page hero title | `text-5xl font-semibold tracking-tight sm:text-6xl` |
| Section title (h1) | `text-3xl font-semibold` |
| Card title (h2/h3) | `font-medium` (no size bump — use spacing) |
| Body | default (no class) |
| Small / meta | `text-sm text-muted-foreground` |
| Micro / eyebrow | `text-sm uppercase tracking-widest text-muted-foreground` |
| Monospace value | `font-mono` (used for IDs, tokens, SKUs) |
| Inline code | `rounded bg-muted px-1.5 py-0.5 text-sm` (px-1 py-0.5 in dense contexts) |

---

## Spacing

- Page container: `mx-auto max-w-5xl px-6 py-16` (or `py-24` for hero pages).
- Auth pages: `mx-auto max-w-md px-6 py-16` centered vertically via `min-h-[80vh] flex flex-col justify-center`.
- Stack rhythm: `space-y-4` inside forms, `space-y-2` inside a card body, `gap-4` in grids.
- Section gaps: `mt-8` between hero and first section, `mt-16` before the footer/next section.

---

## Component patterns

### Card
```tsx
<div className="rounded-lg border border-border p-5">
  <h3 className="font-medium">Title</h3>
  <p className="mt-2 text-sm text-muted-foreground">Body</p>
</div>
```
- `rounded-lg` (not `rounded-2xl`)
- 1px `border-border`
- `p-5` for content, `p-6` only when the card is a full section
- Never both a border AND a shadow

### Button

Primary (single per view):
```tsx
<button className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-60">
  Log in
</button>
```

Outline / secondary:
```tsx
<button className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">
  Log out
</button>
```

Ghost (nav links, inline):
```tsx
<Link className="rounded-md px-3 py-1.5 hover:bg-muted">Account</Link>
```

Disabled state: `disabled:opacity-60` (not a color swap).

### Form field
```tsx
<label className="block">
  <span className="text-sm font-medium">Email</span>
  <input
    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30"
  />
</label>
```
- Label uses `block` + `text-sm font-medium`
- Input has `mt-1` from its label
- Focus ring is `primary/30` — never a border-color change on focus
- Error message goes BELOW the field in `text-red-600 text-sm`, or in a page-level banner (see below)

### Error banner
```tsx
<div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
  {message}
</div>
```

### Status pill
```tsx
<span className="rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ring-emerald-500/20 bg-emerald-500/10 text-emerald-600">
  Shipped
</span>
```

### Row (key-value inside a card)
```tsx
<div className="flex justify-between gap-3 text-sm">
  <span className="text-muted-foreground">Label</span>
  <span className="max-w-[60%] truncate font-mono">value</span>
</div>
```

---

## Layout patterns

### Root layout
`<Header />` (border-b) at top, page content below. Header is:
```tsx
<header className="border-b border-border">
  <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
    <Link className="font-semibold">brand</Link>
    <nav className="flex items-center gap-4 text-sm">...</nav>
  </div>
</header>
```

### Hero page (landing)
- Eyebrow: uppercase tracking-widest muted, `text-sm`
- H1: `text-5xl/6xl font-semibold tracking-tight`
- Sub: `text-lg text-muted-foreground` max-width `max-w-2xl`
- Content grid: `grid gap-4 sm:grid-cols-2`

### Two-column info page (account / detail)
- H1 + description at top
- `grid gap-4 sm:grid-cols-2` of cards
- Each card is left-labeled Rows

### Grid list (catalog listing)
- `grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
- Each cell: image (aspect-square, rounded-lg border), name (truncate), price (font-medium tabular-nums), category (text-xs muted)
- No hover shadow — a `hover:border-foreground/40` on the outer border is the affordance

### Product detail
- Two-column at md+: `grid md:grid-cols-2 gap-8`
- Left: image gallery (main image + thumb strip)
- Right: name, price, variant selector, add-to-cart, description

### Table (admin lists)
- Full-width `<table>` with `border-separate border-spacing-y-2`
- No zebra stripes; rely on `border-b border-border`
- Row hover: `hover:bg-muted/50`
- Actions column right-aligned

### Empty state
Card with muted foreground, one sentence + a single action button.

---

## Numeric display

- Currency: `basePrice / 100` (paise → rupees), formatted `₹{n.toLocaleString("en-IN")}`. Use `font-medium tabular-nums`.
- Small helper `formatINR(paise: number)` should live in `@/lib/format.ts` — reuse it everywhere.
- Stock, counts: `tabular-nums` in tables so digits align.

---

## Interaction feedback

- Loading list/grid: skeleton is a grid of `bg-muted animate-pulse rounded-lg h-40` blocks matching the real grid columns.
- Loading text: `Loading…` in `text-sm text-muted-foreground`. No spinners on primary buttons — swap the label instead (`Log in` → `Logging in…`) with `disabled` state.
- Optimistic mutations: keep the old row visible with `opacity-60` until the response returns.

---

## Not allowed (guard rails)

- ❌ Drop shadows (`shadow-*`)
- ❌ `rounded-2xl` / `rounded-3xl` — max `rounded-lg`
- ❌ Gradient backgrounds
- ❌ Emojis in UI copy (unless user explicitly asks)
- ❌ Icon-only buttons without `aria-label`
- ❌ Direct hex colors — use tokens
- ❌ Multiple "solid" (`bg-primary`) buttons in one view
- ❌ `text-gray-*` — use `muted-foreground`

---

## When adding a new pattern

1. Try to compose from existing patterns first.
2. If genuinely new, add it to this doc BEFORE writing the component.
3. Prefer to widen an existing pattern over inventing a parallel one.
