# 02 · Landing page brief: Concept B "Cinematic Dark"

The owner selected **Concept B** (the dark one). This file is the build spec. The Figma file
is the visual source of truth; this brief records tokens, structure, behaviour and the gaps
the mock-up does not cover.

## Figma references

- File: https://www.figma.com/design/Aq966rDz8wrtnqVsk5esPB (its title still carries the product's earlier name; the UI says **PhotoDrive**, see D1)
- Page **B · Cinematic Dark** (page id `2:4`), full page frame `5:13`, 1440 px wide.
- Use the Figma MCP (`get_design_context`, `get_screenshot`) on these node ids. Access requires
  the owner's Figma account/connector.

| Section | Node id | Deep link |
|---|---|---|
| Full page | `5:13` | `…/Aq966rDz8wrtnqVsk5esPB?node-id=5-13` |
| Nav + Hero + product preview | `5:14` | `?node-id=5-14` |
| Built-for strip | `5:149` | `?node-id=5-149` |
| How it works | `5:166` | `?node-id=5-166` |
| Features (bento) | `8:2` | `?node-id=8-2` |
| Client experience (lightbox) | `8:100` | `?node-id=8-100` |
| Pricing | `8:151` | `?node-id=8-151` |
| FAQ | `8:256` | `?node-id=8-256` |
| Final CTA | `8:286` | `?node-id=8-286` |
| Footer | `8:296` | `?node-id=8-296` |
| Overview page (comparison of A/B/C) | `2:2` / `11:10` | for context only |

Figma variables live in the collection **"B · Cinematic"** (names below).

> **Mock-up data is illustrative.** Prices ($12 / $99), "Smith Wedding", "248 photos",
> FAQ answers and the 5 "built for" categories are placeholders. Real plans come from admin
> (D2); real FAQ content already exists in `app/faq/page.tsx`: reuse it, do not ship the mock text.

## Design tokens

Brand continuity: `accent` and `accentDeep` are the colours already used in the app
(`#2dabe0`, `#17509e`).

| Token | Hex | Use |
|---|---|---|
| `bg` | `#06080C` | page background, text on accent buttons |
| `surface` | `#0D1219` | cards, window body |
| `surface2` | `#141B26` | raised cards, highlighted plan, title bar, chips |
| `line` | `#222C3A` | 1 px borders, dividers |
| `text` | `#F5F7FA` | headings, primary text |
| `textSoft` | `#BDC4D0` | body text on dark (hero copy, nav links) |
| `muted` | `#9AA6B6` | secondary text |
| `accent` | `#2DABE0` | primary actions, icons, highlights |
| `accentDeep` | `#17509E` | connectors, secondary accents |
| `accentSoft` | `#0E2A3C` | icon tiles, eyebrow pill |
| `glass` | `rgba(255,255,255,.09)` | glass buttons / badge fill |
| `scrim` | `rgba(0,0,0,.5)` | buttons over photography |
| gradient text | `#2DABE0 → #5B8CFF` (left→right) | hero line 2 only |

Contrast notes: accent on `bg` ≈ 7:1; button label on accent uses `bg` (not white).
Verify AA for `muted` on `surface2` during S6-11.

**Typography:** Manrope (400/500/600/700/800). Greek support must be confirmed in S5-01 (D8).

| Role | Size / line | Weight | Tracking |
|---|---|---|---|
| H1 | 80 / 84 | 800 | −3% |
| H2 | 56–60 / 60–64 | 800 | −2.5% |
| H2 (compact, in split sections) | 48 / 52 | 800 | −2.5% |
| Card title | 20–28 / 26–34 | 700 | −1% (large) |
| Body large | 18–19 / 28–30 | 400 | 0 |
| Body | 15–16 / 23–25 | 400–500 | 0 |
| Eyebrow pill | 12 | 800, UPPERCASE | +12% |
| Nav | 15 | 500 | 0 |
| Button | 15–16 | 700 | 0 |

**Layout:** 1440 canvas, 80 px horizontal padding (1280 content), section padding 120 px,
card radius 24, panels 28–36, pills 99, borders 1 px `line`, gaps 12/20/28/44/56/64.

## Sections

1. **Nav**: logo mark (36 px, `accent`, radius 11) + wordmark (800, 22); links How it works / Features / Pricing / FAQ; language switcher; Log in; **Get started** (accent pill). Auth-aware: shows avatar when signed in (as today).
2. **Hero**: full-bleed photo (`gallery-hero`) under two gradients (left→right `bg` α .92 → .25; top→bottom clear → `bg`). Glass badge (Drive logo → image icon, "Gallery in 60 seconds"), two-line H1 (line 2 gradient), subtitle, **Create your gallery** + **View live demo**, three check items (No re-upload · Client needs no account · Photos stay in your Drive).
3. **Product preview**: 1120×560 gallery window (title bar, header, filters, 4×2 photo grid), three floating chips (Favourites, Full resolution, Password protected), 280 px bottom fade into the page.
4. **Built-for strip**: label + 5 chips.
5. **How it works**: eyebrow, H2 "Four steps. One minute.", 4 equal-height step cards joined by arrows.
6. **Features bento**: row 1 = large "Photo & Video Gallery" card (820×380, photo mosaic) + "Live sync with Drive" card; rows 2–3 = six equal cards (Full screen, Favorites, Password; Full-res download, Personal link, Your links).
7. **Client experience**: 700×500 lightbox mock (scrim buttons, prev/next, 5-thumb strip) + copy + 3 bullets.
8. **Pricing**: Monthly/Yearly toggle (with save badge), two 420 px plan cards (highlighted plan: `surface2`, 2 px accent border, glow), "Secure checkout powered by Stripe".
9. **FAQ**: 4 accordion cards, first open.
10. **Final CTA**: 440 px panel, photo + gradient, H2 "Your first gallery in 60 seconds.", button.
11. **Footer**: brand + 3 link columns (Product, Support, Legal), © line, language selector.

## Gaps the mock-up does not cover (must be resolved in S6-00)

| Gap | Resolution |
|---|---|
| Current page has **DemoForm** (paste a Drive link → 10-minute demo), **tutorial video**, **TrustSection** ("Why PhotoDrive") and **compare slider**; none are in the mock-up (D14). | Add Figma frames for "Try it now" strip, video block and trust cards in Concept B style; slider optional. |
| **Mobile (390 px) and tablet** not designed (D11). | Add 390 px frames for hero, bento, pricing, nav before S6-03. |
| **Greek / German / Dutch** text is longer. | Check each section at 1440/1024/390 in all six languages (S6-10). |
| **States**: hover/focus/active, toggle, accordion, loading and empty pricing (no plans yet), error. | Specify in build; fallback card when no public plans. |
| **Signed-in vs signed-out nav**, language switcher design. | Reuse current behaviour, restyle. |
| Landing promises **"link stays live / doesn't expire"** and **"no automatic charges"** (TrustSection). | Copy must match decision D3 before shipping. |

## Component inventory (build once in `components/ui` + `components/landing`)

`Button` (primary / glass / ghost), `Pill`/`Eyebrow`, `Chip`, `IconTile`, `Card`,
`SectionHeader`, `NavBar` (client island), `Footer`, `GalleryWindow` (static mock),
`FloatingChip`, `StepCard`, `FeatureCard`, `Lightbox mock`, `BillingToggle` (client island),
`PlanCard`, `FaqItem` (accessible disclosure), `CtaPanel`, `LanguageSwitcher` (existing, restyle).

## Behaviour and data

- **Prices instantly:** server component reads public plans (`listPublicPlans()`), cached with a
  tag; admin plan changes revalidate it (S6-02). Pair monthly/yearly tiers and discount
  percentage using the existing `buildTiers` / `discountPct` logic, moved to
  `lib/shared/pricing.ts` with unit tests. Show the toggle only when both intervals exist
  (as today). Format money with `lib/shared/money.ts` (D4).
- **Copy:** reuse existing i18n keys wherever they exist (`nav`, `hero`, `how`, `features`,
  `pricing`, `cta`, `footer`, `demo`, trust cards). New strings (below) must be added in all six
  languages.
- **Pricing wording:** keep "One-time payment · no auto-renewal" (true of the billing model) and
  add "Secure checkout powered by Stripe".
- **Analytics:** keep `SiteAnalytics`, tracking IDs and `trackPurchase` behaviour untouched.
- **Motion:** subtle fade-up on load only, respect `prefers-reduced-motion`.
- **Images:** map from the repo (`public/lp/*`, `public/*`):

| Mock-up image | Repo file |
|---|---|
| hero + lightbox | `public/lp/gallery-hero.webp` |
| final CTA | `public/lp/couple-wide.webp` |
| wedding / bride / couple / party / sport / portrait | `public/lp/p-wedding.webp`, `bride.webp`, `couple-smiling.webp`, `p-portrait.webp`, `p-event.webp`, `p-more.webp` |
| baby photo | `public/lp/couple-baby.webp` |

  Hero image must be `priority`; all others lazy; provide `sizes`.

### New strings needed in all six languages (EN source)

Hero badge "Gallery in 60 seconds" · "Create your gallery" · "View live demo" · "Built for" +
categories (Weddings, Portraits, Events, Sports, Corporate) · Client-experience section
(eyebrow, headline, paragraph, three bullets) · "Everything your clients expect. Nothing they
don't need." · "Secure checkout powered by Stripe" · "Most popular" · "Save N%" · mock window labels.
FAQ and trust copy already exist: reuse them.

## Responsive rules (derived from desktop; confirm against S6-00 mobile frames)

| Breakpoint | Rules |
|---|---|
| ≥1280 | as designed |
| 1024–1279 | content width 960; H1 64/68; bento row 1 stacks "Live sync" under gallery card |
| 768–1023 | nav → hamburger; H1 52/56; steps 2×2 (hide arrows); bento 2 columns; plan cards side by side at 340 |
| <768 | single column; H1 40/44; product window shows 2×2 grid, floating chips hidden; plans stacked; pricing toggle full width; footer columns stack; section padding 72 |

## Acceptance (S6-14 sign-off)

- Visual match to Figma node-by-node at 1440; approved deviations logged in the sprint file.
- Lighthouse (mobile, throttled): LCP ≤ 2.5 s, CLS ≤ 0.1, Accessibility ≥ 95, SEO ≥ 95.
- Prices present in the initial HTML (view-source check), no layout shift when they render.
- WCAG AA contrast, visible focus rings, keyboard-operable toggle/accordion/nav, alt text, reduced motion.
- Six languages checked at 1440/1024/390 without clipping or overflow.
- Existing analytics events and demo flow still work.
