"use client";

import { useLanguage } from "@/lib/i18n";

const ICONS = [
  // Data safe - shield check
  <svg key="0" className="w-5 h-5 text-[#33A39A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.96 11.96 0 0 1 3.6 6 12 12 0 0 0 3 9.75c0 5.59 3.82 10.29 9 11.62 5.18-1.33 9-6.03 9-11.62 0-1.31-.21-2.57-.6-3.75h-.15a11.96 11.96 0 0 1-8.25-3.29Z" /></svg>,
  // No client account - link
  <svg key="1" className="w-5 h-5 text-[#33A39A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>,
  // Link stays live - clock
  <svg key="2" className="w-5 h-5 text-[#33A39A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>,
  // One-time, no lock-in - check circle
  <svg key="3" className="w-5 h-5 text-[#33A39A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>,
];

type Card = { title: string; text: string };
const CONTENT: Record<string, { label: string; title: string; cards: Card[] }> = {
  el: {
    label: "Γιατί Galleroo", title: "Φτιαγμένο για επαγγελματίες φωτογράφους",
    cards: [
      { title: "Τα δεδομένα σου ασφαλή", text: "Δεν αποθηκεύουμε τις φωτογραφίες σου. Μένουν στο δικό σου Google Drive." },
      { title: "Ο πελάτης δεν χρειάζεται λογαριασμό", text: "Καμία εγγραφή, καμία εφαρμογή. Ανοίγει απλώς το link σου, από οποιαδήποτε συσκευή." },
      { title: "Το link μένει ζωντανό", text: "Ο πελάτης επιστρέφει στη gallery όποτε θέλει. Δεν λήγει από μόνο του." },
      { title: "Εφάπαξ, χωρίς δεσμεύσεις", text: "Μία πληρωμή τον χρόνο. Καμία κρυφή ή αυτόματη χρέωση." },
    ],
  },
  en: {
    label: "Why Galleroo", title: "Built for professional photographers",
    cards: [
      { title: "Your data stays safe", text: "We don't store your photos. They live in your own Google Drive." },
      { title: "No account for your client", text: "No sign-up, no app. They just open your link, from any device." },
      { title: "The link stays live", text: "Your client can revisit the gallery whenever they want. It doesn't expire on its own." },
      { title: "One-time, no lock-in", text: "One payment per year. No hidden or automatic charges." },
    ],
  },
  nl: {
    label: "Waarom Galleroo", title: "Gemaakt voor professionele fotografen",
    cards: [
      { title: "Je gegevens blijven veilig", text: "We slaan je foto's niet op. Ze blijven in je eigen Google Drive." },
      { title: "Geen account voor je klant", text: "Geen registratie, geen app. Ze openen gewoon je link, op elk apparaat." },
      { title: "De link blijft actief", text: "Je klant kan de galerij bezoeken wanneer hij wil. Hij verloopt niet vanzelf." },
      { title: "Eenmalig, geen verplichtingen", text: "Eén betaling per jaar. Geen verborgen of automatische kosten." },
    ],
  },
  de: {
    label: "Warum Galleroo", title: "Gemacht für professionelle Fotografen",
    cards: [
      { title: "Deine Daten bleiben sicher", text: "Wir speichern deine Fotos nicht. Sie bleiben in deinem eigenen Google Drive." },
      { title: "Kein Konto für deinen Kunden", text: "Keine Registrierung, keine App. Er öffnet einfach deinen Link, auf jedem Gerät." },
      { title: "Der Link bleibt aktiv", text: "Dein Kunde kann die Galerie jederzeit erneut besuchen. Er läuft nicht von selbst ab." },
      { title: "Einmalig, ohne Bindung", text: "Eine Zahlung pro Jahr. Keine versteckten oder automatischen Kosten." },
    ],
  },
  es: {
    label: "Por qué Galleroo", title: "Hecho para fotógrafos profesionales",
    cards: [
      { title: "Tus datos están seguros", text: "No almacenamos tus fotos. Permanecen en tu propio Google Drive." },
      { title: "Sin cuenta para tu cliente", text: "Sin registro, sin app. Solo abren tu enlace, desde cualquier dispositivo." },
      { title: "El enlace sigue activo", text: "Tu cliente puede volver a la galería cuando quiera. No caduca por sí solo." },
      { title: "Pago único, sin ataduras", text: "Un pago al año. Sin cargos ocultos ni automáticos." },
    ],
  },
  it: {
    label: "Perché Galleroo", title: "Creato per fotografi professionisti",
    cards: [
      { title: "I tuoi dati al sicuro", text: "Non salviamo le tue foto. Restano nel tuo Google Drive." },
      { title: "Nessun account per il cliente", text: "Niente registrazione, niente app. Apre semplicemente il tuo link, da qualsiasi dispositivo." },
      { title: "Il link resta attivo", text: "Il cliente può rivedere la galleria quando vuole. Non scade da solo." },
      { title: "Pagamento unico, nessun vincolo", text: "Un pagamento all'anno. Nessun costo nascosto o automatico." },
    ],
  },
};

export function TrustSection() {
  const { lang } = useLanguage();
  const c = CONTENT[lang] ?? CONTENT.en;
  return (
    <section className="py-16 sm:py-28 px-6 border-t border-white/5">
      <div className="max-w-6xl mx-auto">
        <p className="text-base font-semibold tracking-[0.2em] uppercase text-white mb-5 text-center">{c.label}</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          {c.title}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {c.cards.map((card, i) => (
            <div key={card.title} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
              <div className="w-11 h-11 rounded-xl bg-[#2D6A6A]/15 border border-[#2D6A6A]/20 flex items-center justify-center mb-4">
                {ICONS[i]}
              </div>
              <h3 className="text-white font-semibold mb-2" style={{ fontFamily: "var(--font-brand), sans-serif" }}>{card.title}</h3>
              <p className="text-stone-400 text-sm leading-relaxed">{card.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
