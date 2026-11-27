import "server-only";
import { escapeHtml } from "@/lib/email";
import type { Lang } from "@/lib/i18n/languages";
import type { ReminderKind } from "@/lib/shared/reminders";

/**
 * Renewal reminder e-mails (S9-03, D3). Pure: data in, text out. Wording is a DRAFT in all six languages and needs native review before
 * it is relied on. What the e-mail says about the galleries follows what the server really does (`lapseEnforced`): while lapse
 * enforcement is off it never mentions galleries going offline, only that nothing is deleted. No card or personal data beyond the
 * customer's first name and their own plan's end date.
 */
export type ReminderData = {
  /** First name, or empty. */
  name: string;
  appName: string;
  /** The day the plan ends, formatted for the customer's language. */
  date: string;
  /** The last day galleries stay online after the plan ended, formatted. */
  graceEnd: string;
  graceDays: number;
  /** Whether a lapsed plan really takes galleries offline after the grace period (GALLERY_LAPSE_ENFORCE). */
  lapseEnforced: boolean;
  supportEmail: string;
  /** Where to renew. */
  url: string;
};

type Pack = {
  hello: string; helloNoName: string;
  subjects: Record<ReminderKind, string>;
  body: Record<ReminderKind, string[]>;
  graceOn: string; lapsedOn: string; lapsedOff: string;
  questions: string; reason: string; signoff: string;
};

const PACKS: Record<Lang, Pack> = {
  en: {
    hello: "Hi {name},", helloNoName: "Hello,",
    subjects: { expiring14: "Your {app} plan ends in 14 days", expiring3: "Your {app} plan ends in 3 days", lapsed: "Your {app} plan has ended" },
    body: {
      expiring14: ["Your {app} plan ends on {date}.", "Renew here so you can keep creating galleries and delivering to your clients without a break: {url}", "{grace}"],
      expiring3: ["Your {app} plan ends in 3 days, on {date}.", "Renew here to keep everything running: {url}", "{grace}"],
      lapsed: ["Your {app} plan ended on {date}.", "{lapsedNote}", "Renew here to pick up where you left off: {url}"],
    },
    graceOn: "After your plan ends, your galleries stay online for another {days} days. Nothing is ever deleted.",
    lapsedOn: "Your galleries stay online until {graceEnd}. After that, visitors see a page saying the gallery is temporarily unavailable. Nothing is deleted, and renewing brings everything back right away.",
    lapsedOff: "Your galleries and photos are kept. Nothing has been deleted.",
    questions: "Questions? Reply to this e-mail or write to {support}.", reason: "You are receiving this because you have a {app} account.", signoff: "The {app} team",
  },
  el: {
    hello: "Γεια σου {name},", helloNoName: "Γεια σου,",
    subjects: { expiring14: "Το πακέτο σου στο {app} λήγει σε 14 ημέρες", expiring3: "Το πακέτο σου στο {app} λήγει σε 3 ημέρες", lapsed: "Το πακέτο σου στο {app} έχει λήξει" },
    body: {
      expiring14: ["Το πακέτο σου στο {app} λήγει στις {date}.", "Ανανέωσέ το εδώ για να συνεχίσεις να δημιουργείς γκαλερί και να παραδίδεις στους πελάτες σου χωρίς διακοπή: {url}", "{grace}"],
      expiring3: ["Το πακέτο σου στο {app} λήγει σε 3 ημέρες, στις {date}.", "Ανανέωσέ το εδώ για να συνεχίσουν όλα να λειτουργούν: {url}", "{grace}"],
      lapsed: ["Το πακέτο σου στο {app} έληξε στις {date}.", "{lapsedNote}", "Ανανέωσέ το εδώ για να συνεχίσεις από εκεί που σταμάτησες: {url}"],
    },
    graceOn: "Μετά τη λήξη του πακέτου σου, οι γκαλερί σου παραμένουν διαθέσιμες για άλλες {days} ημέρες. Τίποτα δεν διαγράφεται ποτέ.",
    lapsedOn: "Οι γκαλερί σου παραμένουν διαθέσιμες έως {graceEnd}. Μετά, οι επισκέπτες βλέπουν σελίδα ότι η γκαλερί δεν είναι προσωρινά διαθέσιμη. Τίποτα δεν διαγράφεται και η ανανέωση τα επαναφέρει αμέσως.",
    lapsedOff: "Οι γκαλερί και οι φωτογραφίες σου διατηρούνται. Τίποτα δεν έχει διαγραφεί.",
    questions: "Ερωτήσεις; Απάντησε σε αυτό το e-mail ή γράψε στο {support}.", reason: "Λαμβάνεις αυτό το μήνυμα επειδή έχεις λογαριασμό στο {app}.", signoff: "Η ομάδα του {app}",
  },
  nl: {
    hello: "Hoi {name},", helloNoName: "Hallo,",
    subjects: { expiring14: "Je {app}-abonnement loopt over 14 dagen af", expiring3: "Je {app}-abonnement loopt over 3 dagen af", lapsed: "Je {app}-abonnement is verlopen" },
    body: {
      expiring14: ["Je {app}-abonnement loopt af op {date}.", "Verleng hier om zonder onderbreking galerijen te blijven maken en aan je klanten te leveren: {url}", "{grace}"],
      expiring3: ["Je {app}-abonnement loopt over 3 dagen af, op {date}.", "Verleng hier zodat alles blijft werken: {url}", "{grace}"],
      lapsed: ["Je {app}-abonnement is verlopen op {date}.", "{lapsedNote}", "Verleng hier om verder te gaan waar je gebleven was: {url}"],
    },
    graceOn: "Nadat je abonnement afloopt, blijven je galerijen nog {days} dagen online. Er wordt nooit iets verwijderd.",
    lapsedOn: "Je galerijen blijven online tot {graceEnd}. Daarna zien bezoekers een pagina dat de galerie tijdelijk niet beschikbaar is. Er wordt niets verwijderd en na verlengen is alles meteen terug.",
    lapsedOff: "Je galerijen en foto's blijven bewaard. Er is niets verwijderd.",
    questions: "Vragen? Antwoord op deze e-mail of schrijf naar {support}.", reason: "Je ontvangt dit omdat je een {app}-account hebt.", signoff: "Het {app}-team",
  },
  de: {
    hello: "Hallo {name},", helloNoName: "Hallo,",
    subjects: { expiring14: "Dein {app}-Abo läuft in 14 Tagen ab", expiring3: "Dein {app}-Abo läuft in 3 Tagen ab", lapsed: "Dein {app}-Abo ist abgelaufen" },
    body: {
      expiring14: ["Dein {app}-Abo läuft am {date} ab.", "Verlängere hier, damit du ohne Unterbrechung Galerien erstellen und an deine Kunden ausliefern kannst: {url}", "{grace}"],
      expiring3: ["Dein {app}-Abo läuft in 3 Tagen ab, am {date}.", "Verlängere hier, damit alles weiterläuft: {url}", "{grace}"],
      lapsed: ["Dein {app}-Abo ist am {date} abgelaufen.", "{lapsedNote}", "Verlängere hier und mach dort weiter, wo du aufgehört hast: {url}"],
    },
    graceOn: "Nach Ablauf deines Abos bleiben deine Galerien noch {days} Tage online. Es wird nie etwas gelöscht.",
    lapsedOn: "Deine Galerien bleiben bis {graceEnd} online. Danach sehen Besucher eine Seite, dass die Galerie vorübergehend nicht verfügbar ist. Es wird nichts gelöscht, und nach der Verlängerung ist sofort alles wieder da.",
    lapsedOff: "Deine Galerien und Fotos bleiben erhalten. Es wurde nichts gelöscht.",
    questions: "Fragen? Antworte auf diese E-Mail oder schreibe an {support}.", reason: "Du erhältst diese E-Mail, weil du ein {app}-Konto hast.", signoff: "Das {app}-Team",
  },
  es: {
    hello: "Hola {name},", helloNoName: "Hola,",
    subjects: { expiring14: "Tu plan de {app} termina en 14 días", expiring3: "Tu plan de {app} termina en 3 días", lapsed: "Tu plan de {app} ha terminado" },
    body: {
      expiring14: ["Tu plan de {app} termina el {date}.", "Renueva aquí para seguir creando galerías y entregando a tus clientes sin interrupciones: {url}", "{grace}"],
      expiring3: ["Tu plan de {app} termina en 3 días, el {date}.", "Renueva aquí para que todo siga funcionando: {url}", "{grace}"],
      lapsed: ["Tu plan de {app} terminó el {date}.", "{lapsedNote}", "Renueva aquí para retomar donde lo dejaste: {url}"],
    },
    graceOn: "Cuando termine tu plan, tus galerías seguirán en línea otros {days} días. Nunca se elimina nada.",
    lapsedOn: "Tus galerías siguen en línea hasta el {graceEnd}. Después, los visitantes verán una página que indica que la galería no está disponible temporalmente. No se elimina nada y, al renovar, todo vuelve al instante.",
    lapsedOff: "Tus galerías y fotos se conservan. No se ha eliminado nada.",
    questions: "¿Preguntas? Responde a este correo o escribe a {support}.", reason: "Recibes este correo porque tienes una cuenta de {app}.", signoff: "El equipo de {app}",
  },
  it: {
    hello: "Ciao {name},", helloNoName: "Ciao,",
    subjects: { expiring14: "Il tuo piano {app} scade tra 14 giorni", expiring3: "Il tuo piano {app} scade tra 3 giorni", lapsed: "Il tuo piano {app} è scaduto" },
    body: {
      expiring14: ["Il tuo piano {app} scade il {date}.", "Rinnova qui per continuare a creare gallerie e a consegnare ai tuoi clienti senza interruzioni: {url}", "{grace}"],
      expiring3: ["Il tuo piano {app} scade tra 3 giorni, il {date}.", "Rinnova qui per far continuare a funzionare tutto: {url}", "{grace}"],
      lapsed: ["Il tuo piano {app} è scaduto il {date}.", "{lapsedNote}", "Rinnova qui per riprendere da dove avevi lasciato: {url}"],
    },
    graceOn: "Dopo la scadenza del piano, le tue gallerie restano online per altri {days} giorni. Non viene mai eliminato nulla.",
    lapsedOn: "Le tue gallerie restano online fino al {graceEnd}. Dopo, i visitatori vedono una pagina che indica che la galleria è temporaneamente non disponibile. Non viene eliminato nulla e, rinnovando, tutto torna subito.",
    lapsedOff: "Le tue gallerie e le tue foto vengono conservate. Non è stato eliminato nulla.",
    questions: "Domande? Rispondi a questa e-mail o scrivi a {support}.", reason: "Ricevi questa e-mail perché hai un account {app}.", signoff: "Il team di {app}",
  },
};

const fill = (t: string, vars: Record<string, string>) => t.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

export type RenderedReminder = { subject: string; text: string; html: string };

export function renderReminder(kind: ReminderKind, lang: Lang, d: ReminderData): RenderedReminder {
  const p = PACKS[lang] ?? PACKS.en;
  const vars: Record<string, string> = {
    name: d.name, app: d.appName, date: d.date, graceEnd: d.graceEnd, days: String(d.graceDays), url: d.url, support: d.supportEmail,
  };
  vars.grace = d.lapseEnforced ? fill(p.graceOn, vars) : "";
  vars.lapsedNote = fill(d.lapseEnforced ? p.lapsedOn : p.lapsedOff, vars);

  const greeting = fill(d.name ? p.hello : p.helloNoName, vars);
  const paragraphs = p.body[kind].map((t) => fill(t, vars).replace(/\s+/g, " ").trim()).filter((t) => t.length > 0);
  const footer = fill(p.questions, vars);
  const reason = fill(p.reason, vars);
  const signoff = fill(p.signoff, vars);

  const text = [greeting, "", ...paragraphs.flatMap((t) => [t, ""]), footer, "", signoff, "", reason].join("\n");
  const linkify = (t: string) => escapeHtml(t).replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}">${u}</a>`);
  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#1c1917">` +
    `<p>${escapeHtml(greeting)}</p>` +
    paragraphs.map((t) => `<p>${linkify(t)}</p>`).join("") +
    `<p style="color:#57534e">${escapeHtml(footer)}</p><p>${escapeHtml(signoff)}</p>` +
    `<p style="color:#a8a29e;font-size:12px">${escapeHtml(reason)}</p></div>`;

  return { subject: fill(p.subjects[kind], vars), text, html };
}
