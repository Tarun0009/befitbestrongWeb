# Admin UI system

The admin console uses a scoped visual system so improvements do not alter the
storefront. The shared scope is applied by `AdminShell` through
`admin-workspace` and `admin-content`.

## Layout

- Desktop navigation: fixed 288px sidebar.
- Content width: maximum 1500px with responsive 16px, 24px, and 40px gutters.
- Page-section rhythm: 20–24px on compact screens and 24–32px on desktop.
- Operational cards: 16px radius, subtle warm border, white surface, low shadow.
- Dense data tables remain horizontally scrollable instead of collapsing columns.

## Typography

- Admin-only system sans stack headed by Inter and Segoe UI.
- Page titles: 20–24px, semibold, tight tracking.
- Section titles: 18–20px, semibold.
- Body and form copy: 14–15px with 1.55 line height.
- Labels and metadata: 11–13px; uppercase labels use increased tracking.
- Numeric table values use tabular figures.

## Controls

- Primary inputs use a 44px target height and 12px radius.
- Hover, focus, disabled, pending, error, and success states remain visible.
- Business-sensitive settings use explicit Save actions.
- Immediate toggles are limited to single-purpose status changes.
- Destructive actions retain confirmation and red semantic treatment.

## Responsive and accessibility rules

- The sidebar becomes a keyboard-dismissible mobile drawer.
- The header keeps the page title and primary actions visible at small widths.
- Focus rings use the brand yellow and are never removed.
- Reduced-motion preferences disable nonessential animation.
- Empty, loading, and error states preserve page spacing to reduce layout shift.

## Review checklist

- Check 360px, 768px, 1024px, and 1440px widths.
- Verify long names, email addresses, currency, and PIN data do not overflow.
- Confirm tables remain scrollable and actions remain reachable by keyboard.
- Confirm admin selectors do not change storefront components.
