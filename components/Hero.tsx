import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { LpCta } from "@/components/lp/LpCta";
import { Folder, GoogleDriveIcon } from "@/components/lp/icons";

const THUMBS = [1, 2, 3, 4, 5, 6];

export type HeroProps = {
  /** Landing-page variant id, reported with CTA clicks. */
  lp: string;
  badge?: string;
  title: React.ReactNode;
  /** Override the headline size (default matches the v1 spec). */
  titleClassName?: string;
  description: string;
  bullets: string[];
  /** Drive card: list `folders`, or show a one-line `caption` under the title. */
  driveCard: { folders?: string[]; caption?: string };
};

export function Hero(props: HeroProps) {
  return (
    <section className="relative isolate overflow-hidden">
      <HeroBackground />
      <div className="relative z-10 mx-auto grid max-w-[1200px] items-center gap-12 px-6 py-16 sm:py-24 lg:grid-cols-2">
        <HeroContent {...props} />
        <HeroDeviceCluster driveCard={props.driveCard} />
      </div>
    </section>
  );
}

/* Decorative photo; the fade is CSS so the image itself stays untouched. */
function HeroBackground() {
  return (
    <div className="absolute inset-0 -z-10">
      <Image src="/images/hero/hero-bg.webp" alt="" fill priority sizes="100vw" className="object-cover" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#fff_0%,#fff_30%,rgb(255_255_255/0.7)_50%,rgb(255_255_255/0)_100%)]" />
    </div>
  );
}

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-ink">
      <CheckCircle2 size={18} className="shrink-0 text-success" aria-hidden />
      {children}
    </li>
  );
}

function HeroContent({ lp, badge, title, titleClassName = "text-4xl lg:text-5xl", description, bullets }: HeroProps) {
  return (
    <div>
      {badge && (
        <span className="mb-5 inline-block rounded-full bg-badge-bg px-3 py-1 text-xs font-semibold text-badge-text">{badge}</span>
      )}
      <h1 className={`font-extrabold leading-tight text-ink ${titleClassName}`}>{title}</h1>
      <p className="mt-5 max-w-md text-lg text-body">{description}</p>
      <ul className="mt-6 space-y-2.5">
        {bullets.map((b) => (
          <CheckItem key={b}>{b}</CheckItem>
        ))}
      </ul>
      <div className="mt-9">
        <LpCta lp={lp} placement="hero" className="w-full sm:w-auto">Create Your Free Gallery</LpCta>
        <p className="mt-3 text-sm text-body">No credit card required.</p>
      </div>
    </div>
  );
}

function HeroDeviceCluster({ driveCard }: { driveCard: HeroProps["driveCard"] }) {
  return (
    <div className="relative mx-auto w-full max-w-[380px] lg:max-w-[520px]">
      <DriveCard {...driveCard} />
      <LaptopMockup />
      <PhoneMockup />
    </div>
  );
}

/* Real DOM, not a screenshot. Above the laptop on small screens, overlapping it on lg+. */
function DriveCard({ folders, caption }: HeroProps["driveCard"]) {
  return (
    <div className="relative z-20 mx-auto mb-4 w-56 rounded-xl bg-white p-4 shadow-lg lg:absolute lg:-top-6 lg:right-8 lg:mb-0">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <GoogleDriveIcon className="h-5 w-5" /> Google Drive
      </div>
      {caption && <p className="mt-1 text-xs text-body">{caption}</p>}
      {folders && (
        <ul className="mt-2 space-y-1 text-xs text-body">
          {folders.map((f) => (
            <li key={f} className="flex items-center gap-2"><Folder />{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LaptopMockup() {
  return (
    <div className="relative z-0">
      <div className="rounded-t-xl bg-neutral-900 p-3">
        <div className="relative flex aspect-[16/10] flex-col overflow-hidden rounded-md bg-white">
          <div className="relative flex-1">
            <Image src="/images/hero/gallery-laptop.webp" alt="" fill priority sizes="(min-width:1024px) 500px, 380px" className="object-cover" />
          </div>
          <div className="grid grid-cols-6 gap-1 bg-white p-2">
            {THUMBS.map((n) => (
              <div key={n} className="relative aspect-square overflow-hidden rounded-sm">
                <Image src={`/images/hero/thumb-${n}.webp`} alt="" fill sizes="80px" className="object-cover" />
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* base with centered notch */}
      <div className="relative mx-auto h-3 rounded-b-lg bg-neutral-800">
        <div className="absolute left-1/2 top-0 h-1 w-16 -translate-x-1/2 rounded-b-md bg-neutral-600" />
      </div>
    </div>
  );
}

function PhoneMockup() {
  return (
    <div className="absolute -bottom-6 -right-10 z-10 hidden aspect-[9/19.5] w-32 rounded-[28px] bg-neutral-900 p-1.5 shadow-xl sm:block">
      <div className="relative h-full overflow-hidden rounded-[22px]">
        <Image src="/images/hero/gallery-phone.webp" alt="" fill sizes="128px" className="object-cover" />
      </div>
    </div>
  );
}
