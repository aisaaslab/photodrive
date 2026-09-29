import type { Metadata } from "next";
import Image from "next/image";
import { LpCta } from "@/components/lp/LpCta";
import { LpFooter, LpNav } from "@/components/lp/LpChrome";
import { Hero } from "@/components/Hero";
import { BeforeAfter } from "@/components/lp/Mockups";
import { Check, CheckCircle, Dash, GoogleDriveIcon } from "@/components/lp/icons";
import { APP_NAME } from "@/lib/branding";

const title = `A Simpler Pixieset Alternative for Google Drive | ${APP_NAME}`;
const description =
  "Turn your Google Drive folders into professional client photo galleries. No re-uploading, no moving your photos, no complicated migration.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/lp/pixieset-alternative" },
  openGraph: { type: "website", title, description, url: "/lp/pixieset-alternative" },
  twitter: { card: "summary_large_image", title, description },
};

const LP = "pixieset-alternative";
const NAV = [
  { label: "How It Works", href: "#how" },
  { label: "Compare", href: "#compare" },
  { label: "Pricing", href: "/#pricing" },
  { label: "FAQ", href: "/faq" },
];

const CTA_LABEL = "Create Your Free Gallery";

const FLOW = [
  { label: "Google Drive", sub: "Your storage", icon: <GoogleDriveIcon className="h-9 w-9" /> },
  {
    label: APP_NAME,
    sub: "Your presentation layer",
    icon: (
      <svg className="h-9 w-9 text-[#1d6fe8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
      </svg>
    ),
  },
  {
    label: "Client Gallery",
    sub: "Your clients",
    icon: (
      <svg className="h-9 w-9 text-stone-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 4.5h16.5a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5H3.75a1.5 1.5 0 01-1.5-1.5V6a1.5 1.5 0 011.5-1.5z" />
      </svg>
    ),
  },
];

// [feature, PhotoDrive, Pixieset]
const ROWS: [string, boolean, boolean][] = [
  ["Works with your Google Drive folders", true, false],
  ["Keep photos in Google Drive", true, false],
  ["No re-uploading required", true, false],
  ["Professional client galleries", true, true],
  ["Photo delivery", true, true],
  ["Online proofing", false, true],
  ["Print & digital sales", false, true],
  ["Website tools", false, true],
  ["Studio/business tools", false, true],
  ["Simple Google Drive workflow", true, false],
];

const STEPS = ["Connect your Google Drive.", "Choose your folder.", "Create your gallery.", "Send your client the link."];

const PERSONAS = [
  { title: "Wedding Photographers", text: "Deliver entire wedding galleries without moving your photos.", img: "/lp/p-wedding.webp", alt: "Wedding couple embracing in a garden" },
  { title: "Portrait Photographers", text: "Give clients a beautiful way to view their finished session.", img: "/lp/p-more.webp", alt: "Woman in a blazer photographed in soft light" },
  { title: "Event Photographers", text: "Turn event folders into professional galleries.", img: "/lp/p-portrait.webp", alt: "Guests laughing at an evening event" },
  { title: "And More…", text: "Sports, school, family and all types of photographers.", img: "/lp/p-event.webp", alt: "Boy running with a soccer ball at sunset" },
];

export default function PixiesetAlternativePage() {
  return (
    <main className="bg-white text-stone-900">
      <LpNav lp={LP} links={NAV} />

      <Hero
        lp={LP}
        badge="PIXIESET ALTERNATIVE"
        title={<>Looking for a Simpler<br />Pixieset Alternative?</>}
        description="Turn your Google Drive folders into professional client photo galleries — without re-uploading your photos."
        bullets={["No re-uploading.", "No moving your photos.", "No complicated migration."]}
        driveCard={{ folders: ["Wedding Photos", "Family Session", "Events", "Portraits"] }}
      />

      {/* HOW IT WORKS */}
      <section id="how" className="scroll-mt-20 border-t border-stone-100 px-5 py-16 sm:py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-[#0f2447] sm:text-4xl">
              Your Photos. Your Google Drive. A Better Client Experience.
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-stone-600">
              You already have a workflow. You edit your photos, you organize them in Google Drive, and you deliver them to your clients. {APP_NAME} simply adds the missing piece: a professional gallery your clients will love.
            </p>
            <ol className="mt-10 flex items-start gap-2 sm:gap-4" aria-label="How it works">
              {FLOW.map((s, i) => (
                <li key={s.label} className="flex flex-1 items-start gap-2 sm:gap-4">
                  <div className="flex flex-1 flex-col items-center text-center">
                    {s.icon}
                    <p className="mt-2 text-sm font-semibold text-stone-900">{s.label}</p>
                    <p className="text-xs text-stone-500">({s.sub})</p>
                  </div>
                  {i < FLOW.length - 1 && <span className="mt-3 text-stone-300" aria-hidden>→</span>}
                </li>
              ))}
            </ol>
          </div>
          <BeforeAfter />
        </div>
      </section>

      {/* COMPARISON */}
      <section id="compare" className="scroll-mt-20 border-t border-stone-100 bg-stone-50 px-5 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-extrabold tracking-tight text-[#0f2447]">{APP_NAME} vs. Pixieset</h2>
          <p className="mt-3 max-w-3xl text-stone-600">
            Pixieset offers a full suite of photography business tools. {APP_NAME} focuses on one thing — turning your Google Drive folders into beautiful client galleries.
          </p>
          <div className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
            <div className="min-w-0">
              <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <caption className="sr-only">Feature comparison between {APP_NAME} and Pixieset</caption>
                  <thead>
                    <tr className="border-b border-stone-200 bg-stone-50 text-stone-700">
                      <th scope="col" className="px-4 py-3 font-semibold">Feature</th>
                      <th scope="col" className="px-4 py-3 text-center font-semibold">{APP_NAME}</th>
                      <th scope="col" className="px-4 py-3 text-center font-semibold">Pixieset</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map(([f, a, b]) => (
                      <tr key={f} className="border-b border-stone-100 last:border-0">
                        <th scope="row" className="px-4 py-3 font-normal text-stone-700">{f}</th>
                        <td className="px-4 py-3 text-center">{a ? <Check /> : <Dash />}</td>
                        <td className="px-4 py-3 text-center">{b ? <Check className="h-4 w-4 text-stone-400" /> : <Dash />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-stone-500">
                Comparison based on publicly available information, last reviewed September 2026. Features and plans change, so check each provider&apos;s website. Pixieset is a trademark of its respective owner; {APP_NAME} is not affiliated with or endorsed by Pixieset.
              </p>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-gradient-to-b from-blue-50 to-white p-7 shadow-sm">
              <h3 className="text-2xl font-extrabold leading-tight text-[#0f2447]">Stop Uploading the Same Photos Twice.</h3>
              <p className="mt-4 leading-relaxed text-stone-600">
                You&apos;ve already spent time editing and organizing your images. Why download them from Google Drive, then upload them to another platform, just to create a gallery?
              </p>
              <ul className="mt-6 space-y-3">
                {STEPS.map((s) => (
                  <li key={s} className="flex items-center gap-2.5 text-stone-800"><CheckCircle />{s}</li>
                ))}
              </ul>
              <LpCta lp={LP} placement="mid" className="mt-8 w-full sm:w-auto">{CTA_LABEL}</LpCta>
            </div>
          </div>
        </div>
      </section>

      {/* PERSONAS */}
      <section className="border-t border-stone-100 px-5 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-extrabold tracking-tight text-[#0f2447] sm:text-3xl">Perfect for Photographers Who Use Google Drive</h2>
          <ul className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {PERSONAS.map((p) => (
              <li key={p.title}>
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg">
                  <Image src={p.img} alt={p.alt} fill sizes="(min-width:1024px) 280px, 50vw" className="object-cover" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-stone-900">{p.title}</h3>
                <p className="mt-1 text-sm leading-snug text-stone-600">{p.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="bg-[#0f2447] px-5 py-14 text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 text-center lg:flex-row lg:justify-between lg:text-left">
          <div>
            <span className="mx-auto inline-block rounded-lg bg-white px-3 py-1.5 lg:mx-0">
              <Image src="/logo.png" alt={APP_NAME} width={240} height={56} className="h-8 w-auto" />
            </span>
            <p className="mt-3 text-sm text-blue-100/80">Your Google Drive photos. Your professional gallery.</p>
          </div>
          <div>
            <h2 className="text-2xl font-extrabold">Ready to See the Difference?</h2>
            <p className="mt-2 max-w-md text-sm text-blue-100/80">
              Your photos are already in Google Drive. Give them a professional gallery without uploading them again.
            </p>
          </div>
          <div className="text-center">
            <LpCta lp={LP} placement="final" variant="light">{CTA_LABEL}</LpCta>
            <p className="mt-2 text-xs text-blue-100/70">No credit card required.</p>
          </div>
        </div>
      </section>

      <LpFooter />
    </main>
  );
}
