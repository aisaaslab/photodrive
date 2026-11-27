import "server-only";
import { escapeHtml } from "@/lib/email";
import type { Lang } from "@/lib/i18n/languages";

/**
 * Customer e-mails about payment events (S2-14, D17). Pure: data in, text out.
 * Wording is a DRAFT in all six languages and needs native review before it is relied on.
 * The messages say what happened and what it means for the customer's access; they never include
 * card details or anything about other users.
 */

export type NoticeKind = "refund_full" | "refund_partial" | "dispute_opened" | "dispute_won" | "dispute_lost" | "payment_failed";

export const NOTICE_KINDS: NoticeKind[] = ["refund_full", "refund_partial", "dispute_opened", "dispute_won", "dispute_lost", "payment_failed"];

export type NoticeData = {
  /** Customer's first name, or empty. */
  name: string;
  appName: string;
  /** Formatted for the customer's language, e.g. "$99.00". */
  amount: string;
  /** Refunded part, formatted; only for partial refunds. */
  refunded?: string;
  /** Formatted access end date, when the customer still has access (and it has an end). */
  accessEnds: string | null;
  /** The customer has lifetime access: nothing here changes it. */
  lifetime?: boolean;
  supportEmail: string;
  /** Where to subscribe or pay again. */
  url: string;
};

type Pack = {
  hello: string; // "Hi {name},"
  helloNoName: string;
  subjects: Record<NoticeKind, string>;
  /** Paragraphs per kind; {access} is replaced by the matching access sentence. */
  body: Record<NoticeKind, string[]>;
  accessUntil: string;
  accessEnded: string;
  accessUnchanged: string;
  accessPaused: string;
  questions: string; // "Questions? Reply to this e-mail or write to {support}."
  signoff: string; // "The {app} team"
};

const PACKS: Record<Lang, Pack> = {
  en: {
    hello: "Hi {name},",
    helloNoName: "Hello,",
    subjects: {
      refund_full: "Your refund has been processed",
      refund_partial: "A partial refund has been processed",
      dispute_opened: "A dispute was opened on your payment",
      dispute_won: "Your access has been restored",
      dispute_lost: "An update on your payment dispute",
      payment_failed: "Your payment did not go through",
    },
    body: {
      refund_full: ["We have refunded your payment of {amount}.", "{access}"],
      refund_partial: ["We have refunded {refunded} of your {amount} payment.", "{access}"],
      dispute_opened: [
        "A dispute was opened on your payment of {amount} with your card issuer.",
        "While it is open, the time that payment gave you is on hold. {access}",
        "If this was a mistake, you can withdraw the dispute with your bank, or contact us and we will help.",
      ],
      dispute_won: ["The dispute on your payment of {amount} has been closed in our favour.", "Your access has been restored. {access}"],
      dispute_lost: [
        "The dispute on your payment of {amount} was decided in the cardholder's favour, so the time that payment gave you has been removed.",
        "{access}",
        "If you would like to keep using {app}, you can subscribe again here: {url}",
      ],
      payment_failed: ["Your payment of {amount} for {app} did not go through, so no access was added.", "You can try again here: {url}"],
    },
    accessUntil: "Your {app} access runs until {date}.",
    accessEnded: "Your {app} access has ended.",
    accessUnchanged: "Your access is unchanged.",
    accessPaused: "Your access is paused until the dispute is resolved.",
    questions: "Questions? Reply to this e-mail or write to {support}.",
    signoff: "The {app} team",
  },
  el: {
    hello: "Γεια σου {name},",
    helloNoName: "Γεια σου,",
    subjects: {
      refund_full: "Η επιστροφή χρημάτων σου ολοκληρώθηκε",
      refund_partial: "Ολοκληρώθηκε μερική επιστροφή χρημάτων",
      dispute_opened: "Άνοιξε διαφωνία για την πληρωμή σου",
      dispute_won: "Η πρόσβασή σου επαναφέρθηκε",
      dispute_lost: "Ενημέρωση για τη διαφωνία της πληρωμής σου",
      payment_failed: "Η πληρωμή σου δεν ολοκληρώθηκε",
    },
    body: {
      refund_full: ["Επιστρέψαμε την πληρωμή σου ύψους {amount}.", "{access}"],
      refund_partial: ["Επιστρέψαμε {refunded} από την πληρωμή σου των {amount}.", "{access}"],
      dispute_opened: [
        "Άνοιξε διαφωνία για την πληρωμή σου ύψους {amount} από τον εκδότη της κάρτας σου.",
        "Όσο είναι ανοιχτή, ο χρόνος που σου έδωσε η πληρωμή αυτή είναι σε αναμονή. {access}",
        "Αν έγινε κατά λάθος, μπορείς να ανακαλέσεις τη διαφωνία στην τράπεζά σου ή να επικοινωνήσεις μαζί μας και θα σε βοηθήσουμε.",
      ],
      dispute_won: ["Η διαφωνία για την πληρωμή σου ύψους {amount} έκλεισε υπέρ μας.", "Η πρόσβασή σου επαναφέρθηκε. {access}"],
      dispute_lost: [
        "Η διαφωνία για την πληρωμή σου ύψους {amount} κρίθηκε υπέρ του κατόχου της κάρτας, οπότε αφαιρέθηκε ο χρόνος που σου είχε δώσει η πληρωμή αυτή.",
        "{access}",
        "Αν θέλεις να συνεχίσεις να χρησιμοποιείς το {app}, μπορείς να ξανακάνεις συνδρομή εδώ: {url}",
      ],
      payment_failed: ["Η πληρωμή σου ύψους {amount} για το {app} δεν ολοκληρώθηκε, οπότε δεν προστέθηκε πρόσβαση.", "Μπορείς να προσπαθήσεις ξανά εδώ: {url}"],
    },
    accessUntil: "Η πρόσβασή σου στο {app} ισχύει έως {date}.",
    accessEnded: "Η πρόσβασή σου στο {app} έχει λήξει.",
    accessUnchanged: "Η πρόσβασή σου δεν άλλαξε.",
    accessPaused: "Η πρόσβασή σου είναι σε παύση μέχρι να λυθεί η διαφωνία.",
    questions: "Απορίες; Απάντησε σε αυτό το email ή γράψε στο {support}.",
    signoff: "Η ομάδα του {app}",
  },
  nl: {
    hello: "Hoi {name},",
    helloNoName: "Hallo,",
    subjects: {
      refund_full: "Je terugbetaling is verwerkt",
      refund_partial: "Een gedeeltelijke terugbetaling is verwerkt",
      dispute_opened: "Er is een betwisting geopend op je betaling",
      dispute_won: "Je toegang is hersteld",
      dispute_lost: "Een update over de betwisting van je betaling",
      payment_failed: "Je betaling is niet gelukt",
    },
    body: {
      refund_full: ["We hebben je betaling van {amount} terugbetaald.", "{access}"],
      refund_partial: ["We hebben {refunded} van je betaling van {amount} terugbetaald.", "{access}"],
      dispute_opened: [
        "Er is bij je kaartuitgever een betwisting geopend op je betaling van {amount}.",
        "Zolang die openstaat, staat de tijd die die betaling je gaf in de wacht. {access}",
        "Als dit een vergissing was, kun je de betwisting bij je bank intrekken, of neem contact met ons op, dan helpen we je.",
      ],
      dispute_won: ["De betwisting van je betaling van {amount} is in ons voordeel afgesloten.", "Je toegang is hersteld. {access}"],
      dispute_lost: [
        "De betwisting van je betaling van {amount} is in het voordeel van de kaarthouder beslist, daarom is de tijd die die betaling je gaf verwijderd.",
        "{access}",
        "Wil je {app} blijven gebruiken, dan kun je hier opnieuw abonneren: {url}",
      ],
      payment_failed: ["Je betaling van {amount} voor {app} is niet gelukt, dus er is geen toegang toegevoegd.", "Je kunt het hier opnieuw proberen: {url}"],
    },
    accessUntil: "Je toegang tot {app} loopt tot {date}.",
    accessEnded: "Je toegang tot {app} is verlopen.",
    accessUnchanged: "Je toegang is ongewijzigd.",
    accessPaused: "Je toegang is gepauzeerd tot de betwisting is opgelost.",
    questions: "Vragen? Beantwoord deze e-mail of schrijf naar {support}.",
    signoff: "Het {app}-team",
  },
  de: {
    hello: "Hallo {name},",
    helloNoName: "Hallo,",
    subjects: {
      refund_full: "Deine Rückerstattung wurde verarbeitet",
      refund_partial: "Eine Teilrückerstattung wurde verarbeitet",
      dispute_opened: "Für deine Zahlung wurde eine Beanstandung eingereicht",
      dispute_won: "Dein Zugang wurde wiederhergestellt",
      dispute_lost: "Neuigkeiten zur Beanstandung deiner Zahlung",
      payment_failed: "Deine Zahlung ist nicht durchgegangen",
    },
    body: {
      refund_full: ["Wir haben deine Zahlung über {amount} zurückerstattet.", "{access}"],
      refund_partial: ["Wir haben {refunded} deiner Zahlung über {amount} zurückerstattet.", "{access}"],
      dispute_opened: [
        "Bei deinem Kartenherausgeber wurde eine Beanstandung für deine Zahlung über {amount} eingereicht.",
        "Solange sie offen ist, ruht die Zeit, die dir diese Zahlung gegeben hat. {access}",
        "Falls das ein Irrtum war, kannst du die Beanstandung bei deiner Bank zurückziehen, oder melde dich bei uns und wir helfen dir.",
      ],
      dispute_won: ["Die Beanstandung deiner Zahlung über {amount} wurde zu unseren Gunsten abgeschlossen.", "Dein Zugang wurde wiederhergestellt. {access}"],
      dispute_lost: [
        "Die Beanstandung deiner Zahlung über {amount} wurde zugunsten des Karteninhabers entschieden, daher wurde die Zeit, die diese Zahlung dir gegeben hat, entfernt.",
        "{access}",
        "Wenn du {app} weiter nutzen möchtest, kannst du hier erneut abonnieren: {url}",
      ],
      payment_failed: ["Deine Zahlung über {amount} für {app} ist nicht durchgegangen, daher wurde kein Zugang hinzugefügt.", "Du kannst es hier erneut versuchen: {url}"],
    },
    accessUntil: "Dein {app}-Zugang läuft bis {date}.",
    accessEnded: "Dein {app}-Zugang ist abgelaufen.",
    accessUnchanged: "Dein Zugang bleibt unverändert.",
    accessPaused: "Dein Zugang ruht, bis die Beanstandung geklärt ist.",
    questions: "Fragen? Antworte auf diese E-Mail oder schreibe an {support}.",
    signoff: "Das {app}-Team",
  },
  es: {
    hello: "Hola {name},",
    helloNoName: "Hola,",
    subjects: {
      refund_full: "Tu reembolso se ha procesado",
      refund_partial: "Se ha procesado un reembolso parcial",
      dispute_opened: "Se ha abierto una disputa sobre tu pago",
      dispute_won: "Tu acceso se ha restablecido",
      dispute_lost: "Novedades sobre la disputa de tu pago",
      payment_failed: "Tu pago no se ha completado",
    },
    body: {
      refund_full: ["Hemos reembolsado tu pago de {amount}.", "{access}"],
      refund_partial: ["Hemos reembolsado {refunded} de tu pago de {amount}.", "{access}"],
      dispute_opened: [
        "El emisor de tu tarjeta ha abierto una disputa sobre tu pago de {amount}.",
        "Mientras siga abierta, el tiempo que te dio ese pago queda en espera. {access}",
        "Si fue un error, puedes retirar la disputa en tu banco, o ponte en contacto con nosotros y te ayudaremos.",
      ],
      dispute_won: ["La disputa sobre tu pago de {amount} se ha cerrado a nuestro favor.", "Tu acceso se ha restablecido. {access}"],
      dispute_lost: [
        "La disputa sobre tu pago de {amount} se resolvió a favor del titular de la tarjeta, por lo que se ha retirado el tiempo que te dio ese pago.",
        "{access}",
        "Si quieres seguir usando {app}, puedes volver a suscribirte aquí: {url}",
      ],
      payment_failed: ["Tu pago de {amount} para {app} no se ha completado, así que no se ha añadido acceso.", "Puedes intentarlo de nuevo aquí: {url}"],
    },
    accessUntil: "Tu acceso a {app} es válido hasta el {date}.",
    accessEnded: "Tu acceso a {app} ha terminado.",
    accessUnchanged: "Tu acceso no ha cambiado.",
    accessPaused: "Tu acceso está en pausa hasta que se resuelva la disputa.",
    questions: "¿Preguntas? Responde a este correo o escribe a {support}.",
    signoff: "El equipo de {app}",
  },
  it: {
    hello: "Ciao {name},",
    helloNoName: "Ciao,",
    subjects: {
      refund_full: "Il tuo rimborso è stato elaborato",
      refund_partial: "È stato elaborato un rimborso parziale",
      dispute_opened: "È stata aperta una contestazione sul tuo pagamento",
      dispute_won: "Il tuo accesso è stato ripristinato",
      dispute_lost: "Aggiornamento sulla contestazione del tuo pagamento",
      payment_failed: "Il tuo pagamento non è andato a buon fine",
    },
    body: {
      refund_full: ["Abbiamo rimborsato il tuo pagamento di {amount}.", "{access}"],
      refund_partial: ["Abbiamo rimborsato {refunded} del tuo pagamento di {amount}.", "{access}"],
      dispute_opened: [
        "L'emittente della tua carta ha aperto una contestazione sul tuo pagamento di {amount}.",
        "Finché è aperta, il tempo che quel pagamento ti ha dato è in sospeso. {access}",
        "Se è stato un errore, puoi ritirare la contestazione presso la tua banca, oppure contattaci e ti aiuteremo.",
      ],
      dispute_won: ["La contestazione sul tuo pagamento di {amount} si è chiusa a nostro favore.", "Il tuo accesso è stato ripristinato. {access}"],
      dispute_lost: [
        "La contestazione sul tuo pagamento di {amount} è stata decisa a favore del titolare della carta, quindi il tempo che quel pagamento ti aveva dato è stato rimosso.",
        "{access}",
        "Se vuoi continuare a usare {app}, puoi abbonarti di nuovo qui: {url}",
      ],
      payment_failed: ["Il tuo pagamento di {amount} per {app} non è andato a buon fine, quindi non è stato aggiunto alcun accesso.", "Puoi riprovare qui: {url}"],
    },
    accessUntil: "Il tuo accesso a {app} è valido fino al {date}.",
    accessEnded: "Il tuo accesso a {app} è terminato.",
    accessUnchanged: "Il tuo accesso non è cambiato.",
    accessPaused: "Il tuo accesso è sospeso finché la contestazione non sarà risolta.",
    questions: "Domande? Rispondi a questa e-mail o scrivi a {support}.",
    signoff: "Il team di {app}",
  },
};

const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");

/** Which sentence describes the customer's access for this kind of message. */
function accessKey(kind: NoticeKind, hasDate: boolean): keyof Pick<Pack, "accessUntil" | "accessEnded" | "accessUnchanged" | "accessPaused"> | null {
  switch (kind) {
    case "refund_full":
    case "dispute_lost":
      return hasDate ? "accessUntil" : "accessEnded";
    case "refund_partial":
      return hasDate ? "accessUntil" : "accessUnchanged";
    case "dispute_opened":
      return hasDate ? "accessUntil" : "accessPaused";
    case "dispute_won":
      return hasDate ? "accessUntil" : null;
    case "payment_failed":
      return null;
  }
}

export type RenderedNotice = { subject: string; text: string; html: string };

export function renderNotice(kind: NoticeKind, lang: Lang, d: NoticeData): RenderedNotice {
  const p = PACKS[lang] ?? PACKS.en;
  const vars: Record<string, string> = {
    name: d.name, app: d.appName, amount: d.amount, refunded: d.refunded ?? "", date: d.accessEnds ?? "", url: d.url, support: d.supportEmail,
  };
  const key = d.lifetime ? (kind === "payment_failed" || kind === "dispute_won" ? null : "accessUnchanged") : accessKey(kind, d.accessEnds !== null);
  vars.access = key ? fill(p[key], vars) : "";

  const greeting = fill(d.name ? p.hello : p.helloNoName, vars);
  const paragraphs = p.body[kind]
    .map((t) => fill(t, vars).replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 0);
  const footer = fill(p.questions, vars);
  const signoff = fill(p.signoff, vars);

  const text = [greeting, "", ...paragraphs.flatMap((t) => [t, ""]), footer, "", signoff].join("\n");
  const linkify = (t: string) => escapeHtml(t).replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}">${u}</a>`);
  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#1c1917">` +
    `<p>${escapeHtml(greeting)}</p>` +
    paragraphs.map((t) => `<p>${linkify(t)}</p>`).join("") +
    `<p style="color:#57534e">${escapeHtml(footer)}</p><p>${escapeHtml(signoff)}</p></div>`;

  return { subject: fill(p.subjects[kind], vars), text, html };
}
