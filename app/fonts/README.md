# Self-hosted fonts

These files are copied unmodified from the `@fontsource` npm packages (which ship the files Google Fonts serves),
so the app and `next build` never contact Google. `../fonts.css` declares them (with `unicode-range`, `font-display: swap`).
All five families are licensed under the SIL Open Font License 1.1 (the licence text is in `LICENSES/`).

| Family | Package | Version | Used for | Files |
|---|---|---|---|---|
| ibm-plex-sans | `@fontsource/ibm-plex-sans` | 5.3.0 | UI text (`--font-sans`): 400/500/600/700, latin + greek | 8 |
| playfair-display | `@fontsource-variable/playfair-display` | 5.3.0 | gallery title: serif (`--font-title-serif`), variable weight, latin | 1 |
| dancing-script | `@fontsource-variable/dancing-script` | 5.3.0 | gallery title: script (`--font-title-script`), variable weight, latin | 1 |
| poppins | `@fontsource/poppins` | 5.3.0 | gallery title: modern (`--font-title-modern`): 600/700, latin | 2 |
| space-mono | `@fontsource/space-mono` | 5.3.0 | gallery title: mono (`--font-title-mono`): 400/700, latin | 2 |
