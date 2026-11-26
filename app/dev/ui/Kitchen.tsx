"use client";

import { useState } from "react";
import { ArrowRight, Download, Heart, Image as ImageIcon, Lock } from "lucide-react";
import { Accordion } from "@/components/ui/Accordion";
import { Badge } from "@/components/ui/Badge";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { IconTile } from "@/components/ui/IconTile";
import { Input } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Tabs } from "@/components/ui/Tabs";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { Toggle } from "@/components/ui/Toggle";

const VARIANTS: ButtonVariant[] = ["primary", "glass", "scrim", "outline", "ghost", "danger"];

function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5 border-t border-line py-10">
      <div><h2 className="text-2xl font-bold text-fg">{title}</h2>{note && <p className="mt-1 text-sm text-fg-muted">{note}</p>}</div>
      {children}
    </section>
  );
}

function ToastButtons() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" onClick={() => toast("Link copied")}>Success toast</Button>
      <Button variant="outline" onClick={() => toast("Could not save your changes", "error")}>Error toast</Button>
    </div>
  );
}

export function Kitchen() {
  const [on, setOn] = useState(true);
  const [tab, setTab] = useState("all");
  const [chip, setChip] = useState(false);
  return (
    <ToastProvider>
      <main className="min-h-screen bg-canvas font-display text-fg">
        <div className="mx-auto max-w-page px-4 py-12 sm:px-8">
          <h1 className="text-h2-compact font-extrabold">UI kitchen sink</h1>
          <p className="mt-2 max-w-xl text-fg-soft">Every primitive, with its variants and states. Hover and press Tab to see the hover and focus states; disabled and loading are shown directly.</p>

          <Block title="Button" note="primary, glass and scrim (over photos), outline, ghost, danger × sm, md, lg; disabled; loading; as a link; with icons.">
            <div className="flex flex-wrap items-center gap-3">
              {VARIANTS.map((v) => <Button key={v} variant={v}>{v}</Button>)}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button><Button size="md">Medium</Button><Button size="lg" iconRight={<ArrowRight className="size-5" />}>Create your gallery</Button>
              <Button href="#links" variant="outline">As a link</Button>
              <Button iconLeft={<Download className="size-4" />} variant="ghost">Download all</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {VARIANTS.map((v) => <Button key={v} variant={v} disabled>{v} disabled</Button>)}
              <Button loading>Loading</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-card bg-[linear-gradient(135deg,#5b4b3a,#2a3340)] p-6"><Button variant="glass" size="lg">View live demo</Button><Button variant="glass">Glass on a photo</Button></div>
          </Block>

          <Block title="Pill, Chip, Badge">
            <div className="flex flex-wrap items-center gap-3"><Pill>How it works</Pill><Pill>Features</Pill></div>
            <div className="flex flex-wrap items-center gap-3"><Chip>Weddings</Chip><Chip>Portraits</Chip><Chip active={chip} onClick={() => setChip((v) => !v)}>Click me ({chip ? "on" : "off"})</Chip></div>
            <div className="flex flex-wrap items-center gap-3"><Badge>Most popular</Badge><Badge>Save 31%</Badge><Badge tone="neutral">Neutral</Badge><Badge tone="success">Paid</Badge><Badge tone="danger">Failed</Badge></div>
          </Block>

          <Block title="Card, IconTile">
            <div className="grid gap-5 md:grid-cols-3">
              <Card hoverable><IconTile><ImageIcon /></IconTile><h3 className="mt-5 text-xl font-bold">Default, hoverable</h3><p className="mt-2 text-fg-soft">Hover for the accent border.</p></Card>
              <Card tone="raised"><IconTile size="lg"><Heart /></IconTile><h3 className="mt-5 text-xl font-bold">Raised</h3><p className="mt-2 text-fg-soft">Surface 2 for chips and windows.</p></Card>
              <Card tone="highlight"><IconTile size="sm"><Lock /></IconTile><h3 className="mt-5 text-xl font-bold">Highlight</h3><p className="mt-2 text-fg-soft">The recommended plan: accent border and glow.</p></Card>
            </div>
          </Block>

          <Block title="Input" note="default, with hint, with error, disabled.">
            <div className="grid gap-5 md:grid-cols-2">
              <Input label="Gallery name" placeholder="Smith Wedding 2026" />
              <Input label="Google Drive link" hint="Share the folder with “Anyone with the link”." placeholder="https://drive.google.com/…" />
              <Input label="Password" type="password" defaultValue="abc" error="Use at least 6 characters." />
              <Input label="Disabled" disabled defaultValue="Cannot edit" />
            </div>
          </Block>

          <Block title="Toggle, Tabs" note="Tabs: arrow keys, Home and End move between tabs.">
            <div className="flex items-center gap-4"><Toggle checked={on} onChange={setOn} label="Allow downloads" /><span className="text-fg-soft">Allow downloads: {on ? "on" : "off"}</span><Toggle checked={false} onChange={() => {}} label="Disabled" disabled /></div>
            <Tabs label="Filter" value={tab} onChange={setTab} items={[{ id: "all", label: "All", count: 248 }, { id: "fav", label: "Favorites", count: 12 }, { id: "dl", label: "Download all" }]} />
          </Block>

          <Block title="Accordion" note="First item open. Several can be open.">
            <Accordion defaultOpen={["a"]} items={[
              { id: "a", question: "Do my clients need an account?", answer: "No. Your client opens the link and sees the gallery." },
              { id: "b", question: "Where are my photos stored?", answer: "In your own Google Drive. Nothing is uploaded again." },
              { id: "c", question: "Is billing recurring?", answer: "No. It is a one-time payment for the period you choose." },
            ]} />
          </Block>

          <Block title="SectionHeader">
            <SectionHeader eyebrow="Pricing" title="Simple pricing. No surprises." lead="One-time payment, no auto-renewal." />
            <SectionHeader align="left" compact eyebrow="Client experience" title="A calm, fast, branded space for your clients." />
          </Block>

          <Block title="Toast"><ToastButtons /></Block>
          <div id="links" />
        </div>
      </main>
    </ToastProvider>
  );
}
