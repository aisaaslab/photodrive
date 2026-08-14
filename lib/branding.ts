/**
 * Central branding configuration.
 *
 * All app-wide identity (name, domain, support email, owner legal info)
 * lives here so the app can be re-branded without touching component code.
 *
 * Override any value by setting the matching NEXT_PUBLIC_* variable in .env.local.
 * If a variable is missing, the default placeholder below is used.
 */

export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME || "Galleroo";

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://example.com";

/**
 * Slogan on the social link-preview image (app/opengraph-image.tsx), i.e. the
 * card people see when your link is pasted into a chat or a post. Two short
 * sentences render best — the image puts the second one on its own line.
 */
export const APP_TAGLINE =
  process.env.NEXT_PUBLIC_APP_TAGLINE || "Share your work. Beautifully.";

/** Sub-line under the slogan on the same image. */
export const APP_DESCRIPTION =
  process.env.NEXT_PUBLIC_APP_DESCRIPTION || "Professional galleries for photographers";

export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@example.com";

// These three appear verbatim on the public Terms and Privacy pages, which are
// legal documents naming the business operator. Fill them in via .env.local
// before going live — shipping the placeholders would publish wrong details.
export const OWNER_NAME =
  process.env.NEXT_PUBLIC_OWNER_NAME || "Your Company Name";

export const OWNER_VAT =
  process.env.NEXT_PUBLIC_OWNER_VAT || "Your VAT / tax number";

export const OWNER_ADDRESS =
  process.env.NEXT_PUBLIC_OWNER_ADDRESS || "Your registered address";

/**
 * Local tax authority, if your jurisdiction requires naming one on public terms
 * (Greece requires one, for example). Leave it unset and the row is not shown —
 * most countries, including the US, have no equivalent to state.
 */
export const OWNER_TAX_OFFICE = process.env.NEXT_PUBLIC_OWNER_TAX_OFFICE || "";

export const APP_DOMAIN = APP_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");

/**
 * Public-facing link to an example/demo gallery shown on the homepage.
 * Set NEXT_PUBLIC_DEMO_GALLERY_URL to your own demo gallery URL.
 */
export const DEMO_GALLERY_URL =
  process.env.NEXT_PUBLIC_DEMO_GALLERY_URL || "";
