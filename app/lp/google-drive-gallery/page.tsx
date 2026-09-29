import type { Metadata } from "next";
import Image from "next/image";
import { Hero } from "@/components/Hero";
import { LpCta } from "@/components/lp/LpCta";
import { LpFooter, LpNav } from "@/components/lp/LpChrome";
import { CheckCircle, Folder, GoogleDriveIcon } from "@/components/lp/icons";
import { APP_NAME } from "@/lib/branding";

const LP = "google-drive-gallery";
const CTA_LABEL = "Create Your Free Gallery";

const title = `Turn Google Drive Into a Professional Photo Gallery | ${APP_NAME}`;
const description =
  "Your photos are already in Google Drive. Turn any folder into a professional client gallery in minutes, with no re-uploading and no change to your workflow.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `/lp/${LP}` },
  openGraph: { type: "website", title, description, url: `/lp/${LP}` },
  twitter: { card: "summary_large_image", title, description },
};

const NAV = [
  { label: "How It Works", href: "#how" },
  { label: "Use Cases", href: "#use-cases" },
  { label: "Pricing", href: "/#pricing" },
  { label: "FAQ", href: "/faq" },
];

const FOLDERS = ["Wedding", "Portraits", "Events", "Family"];
const CONNECT_STEPS = ["Connect Google Drive", "Choose folder", "Create gallery"];
const WHY = ["Save time.", "Avoid duplicate uploads.", "Keep your existing organization.", "Give clients a professional experience."];
const STORAGE = ["File storage", "Folder organization", "Backup", "Sharing files", "Collaboration"];
const PRESENTATION = ["Professional photo galleries", "Beautiful presentation", "Simple client access", "Photographer branding", "Client-friendly delivery"];

const USE_CASES = [
  { title: "Weddings", text: "Deliver thousands of images from one convenient gallery.", img: "/lp/p-wedding.webp", alt: "Wedding couple embracing in a garden" },
  { title: "Portrait Sessions", text: "Create a polished gallery for every client.", img: "/lp/p-more.webp", alt: "Woman in a blazer photographed in soft light" },
  { title: "Events", text: "Turn event folders into shareable galleries.", img: "/lp/p-portrait.webp", alt: "Guests laughing at an evening event" },
  { title: "Sports", text: "Organize large collections for teams and athletes.", img: "/lp/p-event.webp", alt: "Boy running with a soccer ball at sunset" },
  { title: "Families", text: "Create easy-to-access galleries for families and friends.", img: "/lp/couple-baby.webp", alt: "Couple laughing with their young daughter" },
];

const THUMBS = ["/lp/couple-smiling.webp", "/lp/couple-baby.webp", "/lp/bride.webp", "/lp/couple-wide.webp", "/lp/gallery-hero.webp"];

function Checklist({ items, className = "" }: { items: string[]; className?: string }) {
  return (
    <ul className={`space-y-2.5 ${className}`}>
      {items.map((i) => (
        <li key={i} className="flex items-center gap-2.5 text-stone-700"><CheckCircle />{i}</li>
      ))}
    </ul>
  );
}

function StepCard({ n, heading, text, children }: { n: number; heading: string; text: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-1 flex-col">
      <div className="flex-1 rounded-xl border border-stone-200 bg-white p-5 shadow-md">{children}</div>
      <h3 className="mt-5 text-base font-bold text-stone-900"><span className="text-primary">{n}.</span> {heading}</h3>
      <p className="mt-1 text-sm leading-relaxed text-stone-600">{text}</p>
    </li>
  );
}

const Arrow = () => (
  <span className="hidden items-center self-start pt-24 text-primary lg:flex" aria-hidden>
    <svg className="h-6 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
  </span>
);

export default function GoogleDriveGalleryPage() {
  return (
    <main className="bg-white text-stone-900">
      <LpNav lp={LP} links={NAV} />

      <Hero
        lp={LP}
        titleClassName="text-4xl lg:text-[2.5rem]"
        title={<>Turn Google Drive Into a<br />Professional Photo Gallery</>}
        description="Your photos are already in Google Drive. Now give them a better presentation."
        bullets={["No re-uploading your photos.", "No moving your files.", "No changing your workflow."]}
        driveCard={{ caption: "(Your photos are already here)" }}
      />

      {/* FLOW */}
      <section id="how" className="scroll-mt-20 border-t border-stone-100 px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">From Google Drive Folder to Client Gallery</h2>
          <ol className="mt-10 flex flex-col gap-8 lg:flex-row lg:gap-4">
            <StepCard n={1} heading="Your Google Drive Folder" text="Your photos are already organized and ready to go.">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink"><GoogleDriveIcon className="h-5 w-5" /> Google Drive</div>
              <ul className="divide-y divide-stone-100 text-sm text-stone-700">
                {FOLDERS.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 py-2"><Folder />{f}</li>
                ))}
              </ul>
            </StepCard>
            <Arrow />
            <StepCard n={2} heading="Create Your Gallery" text={`${APP_NAME} turns your folder into a professional gallery.`}>
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
                <Image src="/icon.png" alt="" width={24} height={24} className="h-6 w-6" /> {APP_NAME}
              </div>
              <Checklist items={CONNECT_STEPS} className="text-sm" />
            </StepCard>
            <Arrow />
            <StepCard n={3} heading="Share With Your Client" text="Send a simple link and let your client enjoy the gallery.">
              <p className="mb-2 text-xs font-semibold text-stone-700">Your Client Gallery</p>
              <div className="relative aspect-[16/10] overflow-hidden rounded-md">
                <Image src="/lp/gallery-hero.webp" alt="A finished client gallery" fill sizes="320px" className="object-cover" />
              </div>
              <div className="mt-1.5 grid grid-cols-5 gap-1">
                {THUMBS.map((src) => (
                  <div key={src} className="relative aspect-square overflow-hidden rounded-sm">
                    <Image src={src} alt="" fill sizes="60px" className="object-cover" />
                  </div>
                ))}
              </div>
            </StepCard>
          </ol>
        </div>
      </section>

      {/* WHY UPLOAD AGAIN: photo bleeds to the page edge on md+ */}
      <section className="relative bg-gradient-to-r from-blue-50 to-white">
        <div className="relative aspect-[4/3] md:absolute md:inset-y-0 md:left-0 md:aspect-auto md:w-1/2">
          <Image src="/lp/couple-wide.webp" alt="Smiling couple at sunset, delivered in a client gallery" fill sizes="(min-width:768px) 50vw, 100vw" className="object-cover" />
        </div>
        <div className="relative mx-auto max-w-6xl md:min-h-[360px]">
          <div className="flex flex-col justify-center px-5 py-12 md:ml-[50%] md:min-h-[360px] md:px-12">
            <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Why Upload Your Photos Again?</h2>
            <p className="mt-4 text-stone-600">Your photos are already safely organized in Google Drive. You don&apos;t need another place to store the same files.</p>
            <Checklist items={WHY} className="mt-6" />
          </div>
        </div>
      </section>

      {/* STORAGE + PRESENTATION */}
      <section className="px-5 py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1fr_0.8fr]">
          <div>
            <h3 className="flex items-center gap-2.5 text-base font-bold text-ink"><GoogleDriveIcon className="h-7 w-7" /> Google Drive = Your Storage</h3>
            <ul className="mt-4 space-y-2 text-sm text-stone-600">
              {STORAGE.map((i) => <li key={i} className="flex items-center gap-2"><span className="text-emerald-500" aria-hidden>✓</span>{i}</li>)}
            </ul>
          </div>
          <div className="lg:border-l lg:border-stone-200 lg:pl-10">
            <h3 className="flex items-center gap-2.5 text-base font-bold text-ink"><Image src="/icon.png" alt="" width={28} height={28} className="h-7 w-7" /> {APP_NAME} = Your Presentation</h3>
            <ul className="mt-4 space-y-2 text-sm text-stone-600">
              {PRESENTATION.map((i) => <li key={i} className="flex items-center gap-2"><span className="text-emerald-500" aria-hidden>✓</span>{i}</li>)}
            </ul>
          </div>
          <div className="rounded-2xl bg-blue-50 p-6 text-center">
            <p className="font-bold text-ink">You don&apos;t have to choose.</p>
            <p className="mt-1 text-sm text-stone-600">Use Google Drive for storage.<br />Use {APP_NAME} for presentation.</p>
            <div className="mt-5 flex items-center justify-center gap-3" aria-hidden>
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow"><GoogleDriveIcon className="h-7 w-7" /></span>
              <span className="text-xl text-stone-400">+</span>
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow"><Image src="/icon.png" alt="" width={28} height={28} className="h-7 w-7" /></span>
            </div>
            <p className="mt-3 text-sm font-semibold text-ink">Storage + Presentation</p>
          </div>
        </div>
      </section>

      {/* USE CASES */}
      <section id="use-cases" className="scroll-mt-20 border-t border-stone-100 px-5 pb-16 pt-16 sm:pb-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">What Can You Use {APP_NAME} For?</h2>
          <ul className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {USE_CASES.map((u) => (
              <li key={u.title}>
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg">
                  <Image src={u.img} alt={u.alt} fill sizes="(min-width:1024px) 220px, 50vw" className="object-cover" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-stone-900">{u.title}</h3>
                <p className="mt-1 text-sm leading-snug text-stone-600">{u.text}</p>
              </li>
            ))}
          </ul>
          <div className="mt-12 text-center">
            <LpCta lp={LP} placement="mid">{CTA_LABEL}</LpCta>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative isolate overflow-hidden px-5 py-16 text-white">
        <Image src="/images/hero/hero-bg.webp" alt="" fill sizes="100vw" className="-z-10 object-cover" />
        <div className="absolute inset-0 -z-10 bg-[#0f2a3d]/85" aria-hidden />
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 text-center lg:flex-row lg:justify-between lg:text-left">
          <div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">Ready to Upgrade Your Photo Delivery?</h2>
            <p className="mt-3 max-w-lg text-blue-50/90">Don&apos;t upload them again. Turn your folder into a professional client gallery today.</p>
            <div className="mt-6 flex items-center justify-center gap-3 lg:justify-start">
              <span className="inline-block rounded-lg bg-white px-3 py-1.5">
                <Image src="/logo.png" alt={APP_NAME} width={240} height={56} className="h-7 w-auto" />
              </span>
              <span className="text-sm text-blue-50/80">Your Google Drive photos. Your professional gallery.</span>
            </div>
          </div>
          <div className="text-center">
            <LpCta lp={LP} placement="final">{CTA_LABEL}</LpCta>
            <p className="mt-2 text-xs text-blue-50/80">No credit card required.</p>
          </div>
        </div>
      </section>

      <LpFooter />
    </main>
  );
}
