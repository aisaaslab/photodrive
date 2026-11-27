# Design tokens and breakpoints

Source: the approved Figma design (`02-landing-design-brief.md`, variables "B · Cinematic"). Code: `@theme` in `app/globals.css`
(Tailwind v4 turns each token into utilities). `tests/design-tokens.test.ts` pins the colour values to the design.

## Colour (utilities: `bg-…`, `text-…`, `border-…`, `ring-…`)

| Token | Value | Use |
|---|---|---|
| `canvas` | `#06080c` | page background; text on accent buttons |
| `surface` | `#0d1219` | cards, window body |
| `surface-2` | `#141b26` | raised cards, highlighted plan, title bars, chips |
| `line` | `#222c3a` | 1px borders, dividers |
| `fg` | `#f5f7fa` | headings, primary text |
| `fg-soft` | `#bdc4d1` | body text on dark |
| `fg-muted` | `#9aa6b6` | secondary text |
| `accent` | `#2dabe0` | primary actions, icons, highlights |
| `accent-deep` | `#17509e` | connectors, secondary accents |
| `accent-soft` | `#0e2a3c` | icon tiles, eyebrow pill |
| `accent-hi` | `#5b8cff` | end of the headline gradient (`.text-accent-gradient`) |
| `glass`, `scrim` | white 9 %, black 50 % | glass buttons, buttons over photos |
| `danger`, `success-bright` | `#f87171`, `#34d399` | errors, success on dark |

The legacy light palette (`primary`, `ink`, `body`, `badge-*`) was removed with S6-13, when the last pages using it (the `/lp/*` pages) were re-skinned.

## Type, radii, shadows, width

- Font: `font-display` = Manrope (variable 200 to 800; latin, latin-ext, greek), falling back to IBM Plex Sans. Existing pages keep Plex until S5-12.
- Scale (fluid between a 390 phone and the 1440 canvas): `text-h1` 40 to 80 px (reaches 80 at the 1440 canvas; about 62 at 1024 so the headline stays on two lines) / 800 / -3 %, `text-h2` 32 to 60 / 800 / -2.5 %,
  `text-h2-compact` 28 to 48, `text-lead` 17 to 19 / 1.6. Body 15 to 16 (`text-[15px]` / `text-base`), eyebrow 12 px, 800, uppercase, +12 %.
- Radii: `rounded-tile` 12, `rounded-card` 24, `rounded-panel` 32, `rounded-pill` fully round.
- Shadows: `shadow-glow` (highlighted plan), `shadow-window` (gallery window), `shadow-chip` (floating chips).
- Page width: `max-w-page` = 1280 px content; gutters 16 px on a phone, 32 px from `sm`, 80 px from `xl` (the 1440 canvas).

## Breakpoints (Tailwind defaults, decided D11: responsive from the 1440 design, checked at 1440, 1024 and 390)

| Name | From | Layout intent |
|---|---|---|
| (base) | 0 | phone, 390 is the design target: one column, hamburger nav, stacked cards, 16 px gutters |
| `sm` | 640 | large phone / small tablet: two columns where cards allow |
| `md` | 768 | tablet: two-column bento, steps 2×2, nav still a menu |
| `lg` | 1024 | small laptop: full nav, the desktop layouts at reduced size (checked at exactly 1024) |
| `xl` | 1280 | 80 px gutters, content 1280 (the design as drawn at 1440) |

Greek, German and Dutch strings run 20 to 30 % longer than English: layouts must wrap, never clip or overflow (S6-10 checks all six languages).
Motion: subtle fade-up on load only; every animation is switched off under `prefers-reduced-motion` (S6-11).
