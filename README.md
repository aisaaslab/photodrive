# Galleroo — Complete Guide

**This one file is everything.** It takes you from an unopened folder to a live
website at your own domain, taking payments, with you as the admin. No prior
technical experience is assumed: every button, every link, every word you need
to type is written out.

> 💡 **How to read this:** read it once, top to bottom, **without doing
> anything**. Then come back to the top and execute one step at a time. That way
> nothing surprises you halfway through.

---

## What this is

A complete, working SaaS product. It turns any Google Drive folder into a
private, professional photo gallery for clients — built for photographers,
studios and event shooters who need to deliver work without the mess of
WeTransfer links or raw shared Drive folders.

The photographer connects a Drive folder, and it becomes a gallery with a
shareable link. The client opens the link with no account and no signup,
browses, marks favourites and downloads. The photographer sees exactly which
photos were favourited.

**What makes it unusual:** the photos never leave the photographer's own Google
Drive. Competing platforms make you upload every file to their servers, which
costs storage and hands your clients' files to a third party. Here the images
are served straight from Google, so there is no re-upload, no storage bill, and
the files stay under the owner's control.

---

## What is in this folder

| Path | What it is |
|---|---|
| `README.md` | This file. Everything is in here — the full step-by-step install, the AI prompt, troubleshooting, FAQ, reference. |
| `INSTALL-PROMPT.md` | The same AI setup prompt on its own, so you can copy it without scrolling through this file. |
| `app/`, `components/`, `lib/` | The application source code |
| `public/` | Images, icons, the tutorial video |
| `.env.example` | Template for your credentials — you copy this to `.env.local` |
| `firestore.rules` | Database security rules — you publish these in Step 13. Do not skip it. |
| `email-template.html`, `Galleroo Email Code -EN- embedded.txt` | Marketing email templates, optional |
| `AGENTS.md`, `CLAUDE.md` | Notes for AI coding assistants, so they write correct code for this project |

---

## Quick start, if you are a developer

```bash
cp .env.example .env.local   # then fill in your own keys
npm install
npm run dev                  # http://localhost:3000
```

The app builds and runs with an unfilled `.env.local`, so you can look around
before signing up for anything. Nothing that talks to Google, Firebase or Stripe
will work until you add real credentials. Everything below explains how to get
them.

**Tech stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4
· Firebase Auth + Firestore · Google Drive API (read-only) · Stripe · six
languages built in (English, Greek, Dutch, German, Italian, Spanish).

---

## Optional: let an AI assistant do most of the setup for you

If you use an AI coding assistant that can run commands on your computer —
Claude Code, Cursor's agent mode, or similar — you can hand it the prompt below
and it will work through most of this guide with you. It installs the
dependencies, creates your Firebase project, publishes the database security
rules, creates and locks down your Google Drive API key, registers your Stripe
webhook, pushes all 25 environment variables to Vercel, deploys the site, and
checks its own work at every stage.

**What it cannot do, and will not pretend to do.** It cannot create accounts for
you. It cannot type your passwords. It cannot enter your business or tax details
for Stripe's identity verification, and it cannot enter card or bank details
anywhere. It cannot click Google's or Stripe's consent screens. And there is one
step that has no command-line equivalent at all on any platform: turning on
Google sign-in in the Firebase Console. You will do those parts yourself, in
your own browser, and the assistant will stop and wait each time rather than
guessing. Expect four or five short pauses where it hands control back to you.

Everything in the prompt has been checked against the actual tools. It does not
ask the assistant to run anything that does not exist.

### What is automated, what is assisted, what is on you

| Stage | Who does it |
|---|---|
| Install Node dependencies, first local build, local dev server | **Automated** |
| Creating the Firebase project, registering the web app, reading back its config | **Automated** (after you log in once) |
| Creating the Firestore database and publishing `firestore.rules` | **Automated** |
| Turning on Google sign-in in Firebase | **Manual — browser only, no CLI exists** |
| Downloading the Firebase Admin service-account key | **Assisted** — command exists, or three clicks in the console |
| Enabling the Google Drive API and creating a restricted API key | **Automated** (after you log in once) |
| Creating your Stripe account and passing identity verification | **Manual — 1–2 business days** |
| Getting your Stripe secret key | **Manual — dashboard only, shown once** |
| Registering the Stripe webhook and capturing its signing secret | **Automated** |
| Creating the Vercel project, pushing all 25 env vars, deploying | **Automated** (after you paste a token) |
| Buying a domain and typing DNS records at your registrar | **Manual** |
| Reading back the exact DNS values to type, and waiting for them to propagate | **Assisted** |
| Rebranding the app to your own name | **Assisted** — see the follow-up prompt below |

Two notes before you start. First, this replaces the GitHub steps in Step 8 —
the assistant deploys the folder directly to Vercel, which is simpler. You lose
automatic redeploys on `git push`, which you can add later if you want it.
Second, the assistant is going off-script relative to this guide: the guide
documents the point-and-click path, and the prompt uses command-line tools
instead. Both end in the same place. If anything disagrees, trust this guide.

### The main prompt

Open your assistant in the project folder — the one containing `README.md` and
`package.json` — and paste the prompt below.

Don't have an assistant installed? See **"Installing Claude Code"** near the end
of this file — five minutes, and it walks you through it. The exact same prompt
is also in **`INSTALL-PROMPT.md`** in this folder, on its own, so you can open
that file and copy it in one go instead of selecting it out of this page.

```text
You are helping me install and deploy a Next.js 16 SaaS application called
Galleroo that I have just purchased. I am not a developer. The complete
documentation is in README.md in this folder — read it before you start,
especially Steps 1 through 18.

HOW TO WORK WITH ME
- Work through the installation in order. Run every command you can run.
- Explain in plain English what you are about to do before each stage, in one
  or two sentences. No jargon.
- When you need something only I can do — a browser login, an account signup,
  a credential to paste — STOP, tell me exactly what to do and where to click,
  and wait for my reply. Do not guess a value, do not invent a placeholder,
  and do not skip ahead.
- Never ask me to paste a password. Only ever ask for keys and tokens.
- After each stage, verify it worked with a command and show me the result.
  If verification fails, stop and tell me. Do not continue past a broken stage.
- If a command you expect does not exist in the version installed on my
  machine, say so and ask me rather than improvising a different one.

STAGE 0 — LOCAL INSTALL
1. Check `node --version`. It must be 20.9 or higher. If it is lower, stop and
   tell me to install Node 22 LTS from nodejs.org.
2. Run `cp .env.example .env.local`.
3. Run `npm install`. It will print something like
   "added 577 packages, and audited 578 packages" followed by a vulnerability
   summary mentioning "critical". That summary is normal and the install has
   succeeded. Do NOT run `npm audit fix --force` — it can downgrade Next.js
   and break the build. Tell me plainly that this output is expected.
4. Run `npm run build`. It should succeed even though `.env.local` is empty.
5. Run `npm run dev`, confirm http://localhost:3000 returns HTTP 200, then
   stop the server. Report what you saw.

STAGE 1 — FIREBASE
1. Check whether the Firebase CLI is installed: `firebase --version`. If it is
   missing, run `npm install -g firebase-tools`. Require version 15 or higher.
2. Run `firebase login:list`. If I am not logged in, STOP and tell me to run
   `firebase login` myself in my own terminal. That command cannot be
   automated — it opens a browser, and on a first run it asks two yes/no
   questions before the browser opens. Wait for me to confirm it worked.
3. IMPORTANT: the file `.firebaserc` in this folder contains the placeholder
   project id "your-firebase-project-id". The Firebase CLI will silently adopt
   that placeholder if no project is specified, and commands will then fail
   later with confusing permission errors against a project that does not
   exist. Pass `--project <my real project id>` explicitly on EVERY firebase
   command, and rewrite `.firebaserc` with my real project id once I have one.
4. Ask me what to call the project (6–30 characters, lowercase, letters,
   numbers and hyphens, globally unique). Then run:
     firebase projects:create MY-PROJECT-ID -n "My Gallery" --non-interactive
   Both `-n` and `--non-interactive` are required or the command will hang
   waiting for input. If it fails with a quota error, stop and tell me — free
   Google accounts cap how many projects they can own, and raising that cap is
   a web form I have to fill in.
5. Register a web app:
     firebase apps:create WEB "My Gallery Web" --project MY-PROJECT-ID --non-interactive
   The display name is mandatory here.
6. Read back the config:
     firebase apps:sdkconfig WEB --project MY-PROJECT-ID
   This prints projectId, appId, storageBucket, apiKey, authDomain and
   messagingSenderId. Write those six values into `.env.local` as
   NEXT_PUBLIC_FIREBASE_PROJECT_ID, NEXT_PUBLIC_FIREBASE_APP_ID,
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, NEXT_PUBLIC_FIREBASE_API_KEY,
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN and
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID.
   If you use `--json`, note the payload is nested under `.result.sdkConfig`,
   not at the top level. Run this only AFTER step 5 — with no web app it errors.
7. Create the database. I am in the United States, so use the `nam5` multi-
   region. Quote the database name — the parentheses are shell syntax:
     firebase firestore:databases:create "(default)" --location nam5 --project MY-PROJECT-ID
   Firestore's location can never be changed afterwards, so confirm `nam5` with
   me first if I am not in the US.
8. Publish the security rules. THIS IS CRITICAL AND YOU MUST NOT IMPROVISE IT.
   Run, from this folder:
     firebase deploy --only firestore:rules --project MY-PROJECT-ID --non-interactive
   Deploy the `firestore.rules` file exactly as it ships. Do NOT write your own
   rules, do NOT "improve" them, do NOT paste rules from memory or from a
   tutorial, and do NOT relax them to get something working. That file is what
   stops a logged-in user from granting themselves a paid subscription and from
   reading other people's galleries, which contain client passwords. If you
   believe the rules need changing, stop and ask me. Leave
   `firestore.indexes.json` on disk — the deploy reads it.
9. STOP HERE AND HAND CONTROL TO ME. Tell me to open
   https://console.firebase.google.com, select my project, and go to
   Authentication > Sign-in method > Google > Enable, set a support email, and
   Save. There is no command for this on any platform — the Firebase CLI has no
   auth-provider commands at all, and the underlying API requires an OAuth
   client that only the console can create for me. Without this step nobody,
   including me, can ever sign in. Wait for me to confirm before continuing.
10. The Firebase Admin service-account key. Try the command-line route first:
      gcloud iam service-accounts list --project MY-PROJECT-ID --format="value(email)"
    then grep that list for `firebase-adminsdk` — do not hardcode the address,
    the suffix differs between projects — and run:
      gcloud iam service-accounts keys create ~/sa-key.json --iam-account=THAT-EMAIL --project MY-PROJECT-ID
    If gcloud is not installed or this fails, do not fight it: tell me to go to
    Firebase Console > Project settings > Service accounts > Generate new
    private key, and to tell you where the downloaded file is.
    From that JSON, put `project_id` into FIREBASE_ADMIN_PROJECT_ID,
    `client_email` into FIREBASE_ADMIN_CLIENT_EMAIL, and `private_key` into
    FIREBASE_ADMIN_PRIVATE_KEY. In `.env.local` the private key must be wrapped
    in double quotes with its \n sequences left as literal backslash-n.
    Remember this — it changes when we get to Vercel.
11. Generate a random secret for GALLERY_JWT_SECRET (at least 32 characters)
    and write it into `.env.local`.

STAGE 2 — GOOGLE DRIVE API KEY
1. Check for gcloud: `gcloud version`. If missing, on a Mac run
   `brew install --cask gcloud-cli`; otherwise send me to
   https://cloud.google.com/sdk/docs/install. It is about 415 MB.
2. Run `gcloud auth list`. If it says "No credentialed accounts", STOP and tell
   me to run `gcloud auth login` myself — it opens a browser and I must sign in
   with the SAME Google account that owns the Firebase project.
3. Explain to me that a Firebase project IS a Google Cloud project. We are not
   creating anything new. Confirm my project appears in:
     gcloud projects list --format="table(projectId,name,projectNumber)"
4. Enable both APIs in one command. Enabling the second one is not optional —
   without it, creating the key in the next step fails:
     gcloud services enable drive.googleapis.com apikeys.googleapis.com --project MY-PROJECT-ID
5. Create the key already restricted to Drive, choosing the key id yourself so
   you can read it back later:
     gcloud services api-keys create --project MY-PROJECT-ID --key-id=galleroo-drive-key --display-name="Galleroo Drive" --api-target=service=drive.googleapis.com
   Always pass `--api-target`. Without it this command silently creates an
   unrestricted key that works against every Google API.
   Do NOT try to capture the key value from this command's output — it prints
   to the error stream, not the normal one, and scripting around that fails
   silently.
6. Read the value back with a separate command and write it into `.env.local`:
     gcloud services api-keys get-key-string galleroo-drive-key --project MY-PROJECT-ID --format="value(keyString)"
   That value goes into GOOGLE_DRIVE_API_KEY. This is a DIFFERENT key from
   NEXT_PUBLIC_FIREBASE_API_KEY even though both start with AIza. Never mix
   them up, and never restrict the Firebase key to the Drive API.
7. Verify:
     gcloud services api-keys describe galleroo-drive-key --project MY-PROJECT-ID
     gcloud services list --enabled --project MY-PROJECT-ID | grep drive.googleapis.com
   Use grep here rather than a --filter expression.

STAGE 3 — STRIPE, PART ONE (KEYS)
1. STOP AND HAND CONTROL TO ME. Tell me to create a Stripe account at
   stripe.com if I have not already, and to complete business verification
   (Stripe calls it KYC — legal name, tax ID, address, government ID, bank
   account). Explain that Stripe reviews this and it usually takes 1–2 business
   days, and that no live key exists until it clears. Do not offer to fill any
   of it in. Do not ask me for any of those details.
2. Ask me to go to the Stripe Dashboard, switch to TEST mode, open Developers >
   API keys, reveal the secret key, and paste it to you. It starts with
   `sk_test_`. Put it in STRIPE_SECRET_KEY in `.env.local`.
   We will use test mode for now and switch to live at the very end.
   Note: the publishable key is never used by this app. Ignore it.
3. Set NEXT_PUBLIC_APP_URL and APP_URL to http://localhost:3000 for now.
4. Fill in the remaining branding variables in `.env.local` by asking me for
   them: NEXT_PUBLIC_APP_NAME, NEXT_PUBLIC_APP_TAGLINE,
   NEXT_PUBLIC_APP_DESCRIPTION, NEXT_PUBLIC_SUPPORT_EMAIL,
   NEXT_PUBLIC_OWNER_NAME, NEXT_PUBLIC_OWNER_VAT, NEXT_PUBLIC_OWNER_ADDRESS.
   Leave NEXT_PUBLIC_OWNER_TAX_OFFICE empty — it has no US equivalent and the
   row is hidden when empty. Leave NEXT_PUBLIC_DEMO_GALLERY_URL empty for now.
   The tagline and description appear only on the preview card shown when
   someone pastes my link into a chat — tell me that, because otherwise I will
   never see them and will ship yours.
5. Run `npm run dev`, ask me to sign in at http://localhost:3000/login with
   Google, then tell me to get my user id from Firebase Console >
   Authentication > Users > my row > User UID. Put it in ADMIN_UID.
   Do not look for it in Firestore — that collection is empty until I have
   signed in at least once with the rules published.

STAGE 4 — DEPLOY TO VERCEL
1. Install the CLI if missing: `npm i -g vercel@latest`.
2. STOP AND HAND CONTROL TO ME. Tell me to create a Vercel account, then go to
   vercel.com/account/tokens and create an API token. There is no command that
   can create a token. Tell me to paste it into my shell myself as
   `export VERCEL_TOKEN=...` rather than into the chat, then confirm to you.
   Verify with `vercel whoami`.
3. Link the folder without GitHub:
     vercel link --yes --project galleroo
   `--project` is required when the name differs from the folder name.
4. Push the environment variables. There is no bulk import — you must loop, one
   command per variable, 25 of them. Two things will destroy this if you get
   them wrong:
   - NEVER write `vercel env add NAME production < .env.local`. That is valid
     syntax that sets ONE variable to the entire contents of the file,
     including every other secret, and it does not error.
   - Strip surrounding double quotes from values before sending them. Vercel
     stores quotes literally. FIREBASE_ADMIN_PRIVATE_KEY is quoted in
     `.env.local` on purpose, but it must reach Vercel UNQUOTED, with its
     backslash-n sequences intact, or Firebase Admin cannot parse it and the
     site will build fine and then fail at runtime.
   Use, for each variable, either:
     vercel env add NAME production --value 'THE VALUE' --force --yes
   or, for secrets, pipe the value in on standard input:
     printf '%s' "$val" | vercel env add NAME production --force --yes
   `--yes` is mandatory: without it the command stops and waits for
   confirmation on empty values and on any NEXT_PUBLIC_ name containing "key"
   or "secret", which this project has. One target per command — passing
   `production preview development` together is an error.
   `production` alone is all this deployment needs.
5. Verify with `vercel env ls production` and check the NAMES against
   `.env.example`. You will not be able to see the values — Vercel stores them
   as sensitive by default and they cannot be read back. Tell me this, because
   it means `.env.local` is now my only copy and I should keep it safe.
6. Deploy: `vercel deploy --prod --yes --logs`. The last line of normal output
   is the live URL. Note that env vars only take effect on NEW deployments, so
   variables must be pushed before deploying, and any later change needs
   another deploy.
7. Once I have the real URL, update NEXT_PUBLIC_APP_URL and APP_URL to it in
   both `.env.local` and Vercel, and deploy again.
8. Tell me plainly that Vercel's free Hobby plan is for non-commercial use
   only. This app charges money, so from my first sale I need the Pro plan at
   $20/month. This is a licensing rule, not a technical limit.

STAGE 5 — DOMAIN
1. STOP. I buy the domain myself at a registrar. Do not purchase anything.
2. Once I have it: `vercel domains add MYDOMAIN.com galleroo`
3. Read back the exact DNS records I need to type:
     vercel domains verify MYDOMAIN.com --project galleroo --format=json
   Do NOT tell me a hardcoded IP or `cname.vercel-dns.com` from memory — the
   values are per-project now and an old value sends me to a dead site.
4. I type those records at my registrar. You cannot do this — Vercel's CLI can
   only manage DNS if my nameservers point at Vercel, which mine do not.
5. Poll `vercel domains inspect MYDOMAIN.com` until it verifies, and tell me
   when. It can take up to 24 hours.
6. Then update NEXT_PUBLIC_APP_URL and APP_URL to the real domain in `.env.local`
   and in Vercel, and redeploy.
7. Tell me to add my domain in Firebase Console > Authentication > Settings >
   Authorized domains, or Google sign-in will refuse to work on it. Note that
   `localhost` is already authorized by default on a fresh project, so if
   README Step 7 tells me to add it, that is unnecessary.

STAGE 6 — STRIPE, PART TWO (THE WEBHOOK)
1. Install the Stripe CLI if missing: `npm install -g @stripe/cli`.
2. Authenticate without a browser using the key I already gave you:
   `export STRIPE_API_KEY=...` or pass `--api-key` per command.
   Do not use `stripe config --list` to find a key for the app — the key stored
   there is the CLI's own restricted key, not my account secret key.
3. Register the webhook. Subscribe to exactly ONE event. I have read the code:
   `app/api/stripe/webhook/route.ts` handles only `checkout.session.completed`
   and nothing else. Anything more is dead traffic.
     stripe webhook_endpoints create --url="https://MYDOMAIN.com/api/stripe/webhook" --enabled-events="checkout.session.completed"
   Add `--live` for the live-mode endpoint. `--live` defaults to OFF, so
   without it you have created a test endpoint — and real payments will then
   produce no delivery attempts at all, with no error anywhere.
4. THE SIGNING SECRET. The create command's response contains a `secret` field
   starting with `whsec_`. Capture it immediately — Stripe returns it ONLY at
   creation and `retrieve` will not show it again. Put it in
   STRIPE_WEBHOOK_SECRET.
   CRITICAL: if you ever run `stripe listen` for local testing, it prints its
   own line reading "Ready! Your webhook signing secret is whsec_...". That
   secret belongs to the temporary local tunnel and NOTHING ELSE. It must never
   go into STRIPE_WEBHOOK_SECRET for the deployed site. If it does, every real
   payment silently fails signature verification, Stripe retries for three days
   and gives up, and the customer is charged and never activated. Nothing in
   the app will tell me this is happening. Use only the whsec_ from
   `webhook_endpoints create`.
5. The secret key and the webhook secret must be from the SAME mode. sk_test_
   pairs only with a test whsec_, sk_live_ only with a live one.
6. Verify with `stripe webhook_endpoints list` (and again with `--live`), and
   check that "livemode" and "status" are what we expect.
7. Push STRIPE_WEBHOOK_SECRET to Vercel and redeploy.
8. Tell me to test with a real test-mode checkout using card
   4242 4242 4242 4242, and then to check in Firebase Console that my user
   document actually gained subscriptionStatus: "active". Do not use
   `stripe trigger checkout.session.completed` as the proof — its built-in
   fixture carries no user id, so the app correctly ignores it and still
   returns a green 200. That would be a false pass.

FINAL CHECKS
- Load the live site and confirm the homepage, /login, /faq, /contact,
  /privacy, /terms and /subscribe all load.
- Confirm the legal pages show MY name and address, not "Your Company Name" or
  "Your registered address".
- Confirm I can sign in, reach /dashboard, and reach /dashboard/admin.
- Give me a short written summary of what is done, what I still need to do
  myself, and where my `.env.local` file is — it is now the only copy of
  several secrets that cannot be read back from anywhere.
```

### Follow-up prompt: rebranding the app to your own name

Run this after the site is live and working. Read Step 14 first so you know
what it is doing.

```text
Rebrand this project from "Galleroo" to "MY NEW NAME". The name appears about
165 times across 14 files under app/, components/ and lib/, so this is a
project-wide find and replace, not a single setting.

One thing to get right: make the replace case-SENSITIVE. Filenames under
public/ deliberately avoid the brand name so a replace cannot break them, but a
case-insensitive pass can still rewrite paths and leave images pointing nowhere,
and the verification command below cannot catch that because grep does not
search filenames.

Do this in order:
1. Case-SENSITIVE replace of "Galleroo" across app/, components/ and lib/.
2. Verify with `grep -rn "Galleroo" app components lib` — nothing should come
   back. Then run `ls public` and confirm no filename changed.
3. Run `npm run build`, then `npm run dev`, and load the homepage. Confirm the
   before/after comparison slider shows BOTH images, not one image and one
   blank area. That is the thing most likely to break, so check it specifically.
4. Update NEXT_PUBLIC_APP_NAME, NEXT_PUBLIC_APP_TAGLINE and
   NEXT_PUBLIC_APP_DESCRIPTION in .env.local and in Vercel, then redeploy.
   The tagline and description only ever show on the link-preview card, so tell
   me to paste my URL into a chat once to check them.
```

### Follow-up prompt: switching Stripe from test mode to live

```text
Switch this deployment from Stripe test mode to live mode. My Stripe account
has finished business verification.

1. Ask me to get my LIVE secret key from Stripe Dashboard > Developers > API
   keys with the dashboard in Live mode. It starts with sk_live_. Stripe will
   send me a verification code by email or text first, and it shows the key
   value only once. The publishable key is not used by this app — ignore it.
2. Create a LIVE webhook endpoint. The `--live` flag is what makes it live and
   it defaults to off, so it is easy to get wrong and produce nothing:
     stripe webhook_endpoints create --live --url="https://MYDOMAIN.com/api/stripe/webhook" --enabled-events="checkout.session.completed"
   Subscribe to that one event only.
3. Capture the whsec_ value from that response immediately — Stripe returns it
   only at creation and will never show it again. This is the live signing
   secret. It is a different value from the test one, and it is NOT the secret
   that `stripe listen` prints locally. Getting this wrong means customers pay
   and never get access, with no visible error.
4. Update STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in Vercel — both, and
   both from live mode. Mixing a live key with a test secret fails only in
   production, with real money.
5. Redeploy. Environment variable changes do nothing until a new deployment.
6. Verify: `stripe webhook_endpoints list --live` should show my endpoint with
   livemode true and status enabled. Then tell me to make one real small test
   purchase with my own card and confirm my account was activated, and to
   refund it afterwards from the Stripe Dashboard.
7. Remind me: the webhook URL must be the exact hostname that answers without
   redirecting. If my apex domain redirects to www, register the www version —
   Stripe treats a redirect as a delivery failure.
```

### Follow-up prompt: something is broken after deploying

```text
My deployed site is not working correctly. Diagnose it before changing
anything, and tell me what you find before you fix it.

Work through this in order:
1. `vercel deploy --prod --yes --logs` and read the build output, or pull the
   logs from the most recent deployment. Note that Vercel's free plan keeps
   runtime logs for only one hour.
2. Check that every variable in `.env.example` exists in Vercel:
   `vercel env ls production`. You will see names but not values — that is
   normal, they are stored as sensitive. There are 25 keys.
3. Remember that environment variable changes only apply to NEW deployments.
   If a variable was added after the last deploy, it is not live yet.
4. If Google sign-in fails with "unauthorized domain": my production domain
   must be listed in Firebase Console > Authentication > Settings > Authorized
   domains. Note that localhost is authorized by default, so if a guide tells
   me to add localhost, that is not the problem.
5. If people can pay but never get access, check Stripe's webhook delivery log:
   - a 400 response means the signing secret does not match. The most common
     cause is that a secret printed by `stripe listen` was used instead of the
     one from the registered endpoint. Only the whsec_ returned when the
     endpoint was created is valid in production.
   - a 500 response means the secret is fine and Firestore or the Firebase
     Admin credentials are the problem. Check FIREBASE_ADMIN_PRIVATE_KEY in
     Vercel: it must be stored WITHOUT surrounding double quotes, with its
     backslash-n sequences intact. Quotes are stored literally by Vercel and
     will break it.
   - no delivery attempts at all means the endpoint was created in test mode
     while the payment was live, or the URL redirects.
6. If the database denies everything, confirm the rules were actually
   published: `firebase deploy --only firestore:rules --project MY-PROJECT-ID`.
   Publish the shipped `firestore.rules` file unchanged. Do not write
   replacement rules and do not loosen them to make an error go away — they
   are what stops users from granting themselves a paid subscription and from
   reading other people's galleries and gallery passwords.
7. If the build fails with "Cannot find module", that is a dependency problem,
   not a missing environment variable. Try
   `rm -rf node_modules && npm install`. This app is designed to build with a
   completely empty `.env.local`, so a missing variable never fails the build —
   it fails at runtime instead.
```

---

## How long this takes

| Skill level | Estimated time |
|-------------|----------------|
| First time doing this | **3–4 hours** spread over 1–2 days |
| Some technical comfort | **1.5–2 hours** |
| Developer | **45 minutes** |

You can pause at any step and come back later. Nothing is time-sensitive until Step 11 (Stripe webhook).

---

## How much this will cost you per year

| Item | Cost |
|------|------|
| Domain name | **~$12/year** |
| Firebase | **$0** — the free Spark plan covers thousands of users and cannot bill you unless you upgrade it yourself |
| Google Drive API | **$0** — the free quota is far above what this uses |
| Stripe | **$0 monthly** — Stripe takes a percentage per transaction (2.9% + $0.30 in the US) |
| Vercel hosting | **$0 to start, then $20/month** — see below |

**About the Vercel line, so it does not surprise you.** Viewing galleries costs
you almost no bandwidth: the photos are served straight from Google's CDN, not
through your server. What does pass through your server is the "Download all"
button, which builds a ZIP by pulling every photo through the hosting. A
500-photo wedding gallery is roughly 2.5 GB per download, and the free tier
allows 100 GB a month — so around forty full-gallery downloads.

Separately, Vercel's free Hobby plan **does not permit commercial use** in its
terms. Once you are charging customers, you are meant to be on Pro at $20/month
regardless of your traffic.

**Realistic budget:** ~$12/year while you are setting up and testing, then about
**$20/month plus the domain** once you have paying customers.

---

## Table of Contents

**Part A — Before you start**
1. [What this app does](#1-what-this-app-does)
2. [What you'll need](#2-what-youll-need-prerequisites)
3. [Concepts you should understand](#3-concepts-you-should-understand-5-minutes-of-reading)
4. [Map of all the accounts you'll create](#4-map-of-all-the-accounts-youll-create)

**Part B — Local setup (do this first)**
5. [Step 1 — Install Node.js](#step-1--install-nodejs-on-your-computer)
6. [Step 2 — Unzip the project & install dependencies](#step-2--unzip-the-project--install-dependencies)
7. [Step 3 — Create your Firebase project](#step-3--create-your-firebase-project)
8. [Step 4 — Enable the Google Drive API](#step-4--enable-the-google-drive-api)
9. [Step 5 — Create your Stripe account](#step-5--create-your-stripe-account)
10. [Step 6 — Fill in your `.env.local` file](#step-6--fill-in-your-envlocal-file)
11. [Step 7 — Run the app locally to verify it works](#step-7--run-the-app-locally-to-verify-it-works)

**Part C — Go online**
12. [Step 8 — Create your GitHub account & upload the code](#step-8--create-your-github-account--upload-the-code)
13. [Step 9 — Deploy to Vercel (free hosting)](#step-9--deploy-to-vercel-free-hosting)
14. [Step 10 — Buy a domain & connect it](#step-10--buy-a-domain--connect-it)
15. [Step 11 — Set up the Stripe webhook](#step-11--set-up-the-stripe-webhook)
16. [Step 12 — Make yourself the admin](#step-12--make-yourself-the-admin)
17. [Step 13 — Lock down the database (security rules)](#step-13--lock-down-the-database-security-rules)

**Part D — Make it yours**
18. [Step 14 — Customize the app name everywhere](#step-14--customize-the-app-name-everywhere)
19. [Step 15 — Change the subscription price](#step-15--change-the-subscription-price)
20. [Step 16 — Change logo and favicon](#step-16--change-logo-and-favicon)
21. [Step 17 — Adapt the legal pages to your country](#step-17--adapt-the-legal-pages-to-your-country)

**Part E — Going live**
22. [Step 18 — Switch from Test mode to Live mode](#step-18--switch-from-test-mode-to-live-mode)
23. [Final checklist before sharing with customers](#final-checklist-before-sharing-with-customers)

**Part F — Reference**
24. [Troubleshooting common errors](#troubleshooting-common-errors)
25. [FAQ](#faq)
26. [Glossary of terms](#glossary-of-terms)
27. [Complete list of `.env` variables](#complete-list-of-env-variables)
28. [How to update the app later](#how-to-update-the-app-later)
29. [Installing Claude Code](#installing-claude-code)

> The AI setup prompt itself lives near the top of this file, under
> [Optional: let an AI assistant do most of the setup for you](#optional-let-an-ai-assistant-do-most-of-the-setup-for-you),
> and on its own in `INSTALL-PROMPT.md`.

---

# Part A — Before you start

## 1. What this app does

This is a **subscription-based website for photographers**. Here's how it works in plain English:

1. A photographer signs up on your website using their Google account
2. They pay a yearly subscription fee (you set the price — the code ships at €89/year)
3. They paste a link to a Google Drive folder containing photos
4. The app turns it into a beautiful gallery
5. They share the gallery link with their client
6. The client views the photos in full screen, can mark favorites, and download in full resolution

**Your role as the owner:** you run the website, you keep all the subscription money. You also have an admin panel where you can see all users and their galleries.

The app is **white-label**: your own brand name, logo, colours and legal details go on it. "Galleroo" is only a placeholder, but it is written into the marketing copy in roughly 165 places across 14 files, so replacing it is one global find/replace rather than a single setting. Step 14 walks through it and gives you a command to verify none were missed.

---

## 2. What you'll need (prerequisites)

Before starting, gather these things. You can collect them as you go, but having them ready saves time.

### Hardware & software
- ✅ A computer (Windows, Mac, or Linux)
- ✅ A stable internet connection
- ✅ A modern web browser (Chrome, Firefox, Safari, or Edge — Chrome is recommended)

### Accounts you'll create during this guide
- ✅ A **Google account** (you probably already have one — your Gmail)
- ✅ A **GitHub account** (free, takes 2 minutes)
- ✅ A **Vercel account** (free, sign in with GitHub — takes 30 seconds)
- ✅ A **Stripe account** (free, requires business info)
- ✅ A **domain registrar account** (e.g. Namecheap, Cloudflare — to buy your domain)

### Money you'll spend
- ✅ ~**$12** for the domain (one-time per year)
- ✅ A credit/debit card for Stripe verification (Stripe doesn't charge you — just verifies the card)

### Information you should decide BEFORE starting
- ✅ What is the **name** of your app? (e.g. `PhotoShare`, `GalleryPro`, `ClientFolio`)
- ✅ What **domain** do you want? (e.g. `photoshare.com`)
- ✅ What **support email** will you use? (e.g. `support@photoshare.com`)
- ✅ What **price** do you want to charge per year? (the code ships at €89)
- ✅ What **currency**? (EUR, USD, JPY, etc.)
- ✅ Your **legal business name, address, and tax ID** (these go on the Terms of Service and Privacy Policy pages)

> 📝 **Write these down on a piece of paper before starting.** You'll need them many times.

---

## 3. Concepts you should understand (5 minutes of reading)

Don't skip this section. Understanding these concepts will save you hours of confusion later.

### What is a "server" and what is "hosting"?

When you visit `google.com`, your browser connects to a computer somewhere in the world that sends back the Google website. That computer is called a **server**. **Hosting** means renting space on a server so the world can visit your website.

In this guide, your **hosting provider** is **Vercel** — they give you a free server.

### What is a "domain"?

A domain is the address of your website, like `google.com` or `mygallery.com`. You **buy** domains from companies called **registrars** (Namecheap, GoDaddy, Cloudflare, etc.). You don't own them forever — you rent them yearly, usually for $10–15/year.

### What is "DNS"?

DNS is like the phone book of the internet. When you buy a domain, you need to tell the world "this domain points to this server." That's done by adding **DNS records** at your registrar. Vercel will tell you exactly which records to add.

### What is "Firebase"?

Firebase is a free service by Google that gives you two things this app needs:
1. **Authentication** — letting users sign in with their Google account
2. **Database** — storing your gallery information (titles, links, passwords)

You don't need to write any database code — the app does it for you. You just need to create a Firebase project so the app has somewhere to store data.

### What is "Stripe"?

Stripe is the company that handles credit card payments. When a photographer pays for a subscription, Stripe processes the money and sends it to your bank account (minus a small fee — 2.9% + $0.30 per transaction).

### What is an "API key"?

An API key is a long secret string that proves to another service "I'm allowed to talk to you." For example, the Google Drive API key proves to Google "this website is allowed to read Drive folders."

These keys are **secret** — like passwords. You never share them publicly. In this guide we'll store them in a file called `.env.local`.

### What is "GitHub"?

GitHub is where your code lives online. You upload your code to GitHub, and Vercel pulls it from there to deploy. Think of it as Google Drive but for source code.

### What is the "Terminal" / "Command line"?

The Terminal is a black window where you type commands instead of clicking buttons. It looks scary but it's just typing simple commands. You'll use it briefly for installing dependencies and uploading code to GitHub.

### What are "environment variables"?

Environment variables (or "env vars") are settings that the app reads when it starts. Things like "what's my Stripe key?" or "what's my app name?" live in env vars instead of being hardcoded in the code. This way you can change them without touching code.

There are two places where env vars live:
- **Locally** in a file called `.env.local` on your computer
- **Online** in Vercel's web dashboard (so the live server can use them too)

You'll set the same values in both places.

---

## 4. Map of all the accounts you'll create

Here's a visual map of what connects to what. Don't memorize this — just keep it in mind as you go.

```
                    ┌──────────────────┐
                    │   YOUR COMPUTER  │
                    │  (Node.js + ZIP) │
                    └────────┬─────────┘
                             │ uploads code
                             ▼
                    ┌──────────────────┐
                    │     GitHub       │
                    │   (your code)    │
                    └────────┬─────────┘
                             │ deploys
                             ▼
                    ┌──────────────────┐
                    │     Vercel       │  ← your live website lives here
                    │ (free hosting)   │  ← env vars live here
                    └────────┬─────────┘
                             │
              ┌──────────────┼───────────────────┐
              ▼              ▼                   ▼
     ┌──────────────┐ ┌──────────────┐  ┌──────────────────┐
     │   Firebase   │ │    Stripe    │  │  Google Drive API│
     │ (auth + DB)  │ │  (payments)  │  │   (read photos)  │
     └──────────────┘ └──────────────┘  └──────────────────┘

                    ┌──────────────────┐
                    │  Domain Registrar│  ← points your domain to Vercel
                    │  (e.g. Namecheap)│
                    └──────────────────┘
```

---

# Part B — Local setup (do this first)

The goal of Part B is to make the app run on your own computer, so you know it works before putting it online.

---

## Step 1 — Install Node.js on your computer

**🎯 Goal:** install the tool that runs the app on your computer.
**⏱ Time:** 5 minutes.
**💡 What is Node.js?** A program that runs JavaScript code outside of a browser. The app is built with JavaScript, so it needs Node.js to run.

### Steps

1. Open your web browser and go to: **https://nodejs.org/**
2. You'll see a page with two big green buttons. Click the **LEFT one labeled "LTS"** (it shows a version number like `22.x.x LTS`). LTS means "Long Term Support" — it's the most stable version.
3. A file downloads (`.msi` on Windows, `.pkg` on Mac).
4. **Double-click the downloaded file.**
5. An installer window opens. Click **Next** → **Next** → **Accept the license** → **Next** → **Install**. Use the default settings — don't change anything.
6. Wait for installation (~1 minute). Click **Finish**.

### Verify it works

You need to open a **Terminal** window:

- **Windows:** press the `Windows` key, type `cmd`, press Enter. A black window opens.
- **Mac:** press `Cmd + Space`, type `Terminal`, press Enter.
- **Linux:** you know how.

In the terminal, type **exactly** this and press Enter:

```
node --version
```

**✅ What you should see:** something like `v22.11.0`. It must be **20.9 or higher** — Next.js 16 refuses to start below that. Node 22 LTS is the safe choice. If you see v16.x.x or v18.x.x, install a newer Node from the link above and run the command again.

**❌ Common mistakes:**
- You see "command not found" or "is not recognized" → Node.js didn't install correctly. **Solution:** restart your computer and try the install again.
- You see an older version like `v16.x.x` → you have an old Node.js. **Solution:** download the latest LTS from nodejs.org again.

---

## Step 2 — Unzip the project & install dependencies

**🎯 Goal:** unpack the project files and let Node.js download the libraries it needs.
**⏱ Time:** 5 minutes (mostly waiting).
**💡 What we're doing:** the ZIP you received has source code but is missing the third-party libraries it uses (it would be too big otherwise). The `npm install` command downloads those libraries.

### Steps

1. Find the ZIP file the seller sent you (probably named something like `galleroo.zip`).
2. **Move it to a place you can find easily** — I recommend the `Documents` folder.
3. **Right-click → Extract** (Windows) or **double-click** (Mac). A folder appears next to the ZIP.
4. **Rename the folder** to something simple like `mygallery` (avoid spaces and special characters in the name).
5. Open your terminal (see Step 1).
6. Type `cd ` (with a space after it), then **drag and drop** the folder onto the terminal window. The full path is pasted automatically. Press Enter.
   - On Mac it looks like: `cd /Users/yourname/Documents/mygallery`
   - On Windows it looks like: `cd C:\Users\yourname\Documents\mygallery`
7. Verify you're in the right place by typing:
   ```
   ls
   ```
   (on Windows use `dir` instead)

   **✅ What you should see:** a list of file and folder names including `app`, `components`, `lib`, `package.json`, `README.md`, etc.

   **❌ If you see "package.json" missing:** you `cd`'d into the wrong folder. Go back and `cd` into the folder that contains `package.json`.

8. Now install the dependencies. Type:
   ```
   npm install
   ```
   and press Enter.

**⏳ What happens:** the terminal scrolls a lot of text. This takes 1–3 minutes depending on your internet speed. You may see **yellow warnings** — ignore them, they're normal.

**✅ What you should see at the end:**
```
added 412 packages in 2m
```
(the numbers will vary)

**❌ Common mistakes:**
- "command not found: npm" → Node.js install didn't work. Go back to Step 1.
- "EACCES: permission denied" on Mac → run `sudo npm install` instead and enter your Mac password.
- Lots of red text and the install fails → run `npm install --legacy-peer-deps` instead.
- Internet drops mid-install → just run `npm install` again.

After this step, a new folder called `node_modules` appears. It's large (~600 MB). That's normal — those are all the libraries the app uses.

---

## Step 3 — Create your Firebase project

**🎯 Goal:** create the database and authentication system the app will use.
**⏱ Time:** 15 minutes.
**💡 What we're doing:** Firebase will store your gallery data and handle user sign-ins. It's free.

### 3a. Create the project (3 min)

1. Open your browser, go to: **https://console.firebase.google.com**
2. Sign in with the Google account you want to use for this app. ⚠️ **Use a Google account you control long-term**, not a temporary one.
3. You'll see a page with a big card that says **"Create a project"** (or "Add project" if you already have other Firebase projects). Click it.
4. **"Enter your project name"** — type something like `mygallery-prod`. It doesn't need to match your final brand name. Click **Continue**.
5. Firebase shows a Project ID auto-generated below your name (e.g. `mygallery-prod-abc123`). **Write this down** — you'll need it later.
6. Next screen: **"Google Analytics for your Firebase project"**. Toggle it **OFF** (we don't need it). Click **Create project**.
7. Wait ~30 seconds while Firebase sets up. When you see **"Your new project is ready"**, click **Continue**.

**✅ What you should see:** the Firebase project dashboard with your project name at the top.

### 3b. Enable Google Sign-In (3 min)

This lets photographers sign in with their Google account.

1. In the left sidebar, click **Build** to expand it.
2. Click **Authentication**.
3. You'll see a page that says "Get started with Firebase Authentication." Click the **"Get started"** button.
4. A list of sign-in providers appears. Click **Google** (the first one with the Google logo).
5. A panel slides in from the right. Toggle **"Enable"** to ON (it turns blue).
6. **"Project support email"** — click the dropdown and select your email address.
7. Click **Save** at the bottom right.

**✅ What you should see:** Google now shows as **"Enabled"** with a green icon in the providers list.

### 3c. Create the Firestore Database (3 min)

This is where your gallery data will be stored.

1. In the left sidebar, still under **Build**, click **Firestore Database**.
2. You'll see a page that says "Get started with Cloud Firestore." Click **"Create database"**.
3. **"Secure your data"** dialog appears. Select **"Start in production mode"** (this is safer — we'll set up proper rules later). Click **Next**.
4. **"Cloud Firestore location"** dialog appears. Pick a location close to your customers:
   - If your customers are in Europe → choose `europe-west1` (Belgium) or `europe-west3` (Frankfurt)
   - If in USA → choose `us-central1` or `us-east1`
   - If in Asia → choose `asia-northeast1` (Tokyo) or `asia-south1` (Mumbai)
   - ⚠️ **This cannot be changed later.** Take a moment to choose.
5. Click **Enable**. Wait ~30 seconds.

**✅ What you should see:** an empty database with tabs "Data", "Rules", "Indexes", "Usage".

### 3d. Get your client-side Firebase config (5 min)

These are 6 settings the app needs to talk to your Firebase. You'll copy them to `.env.local` later.

1. At the top left of the Firebase Console, find the **gear icon ⚙** next to "Project Overview". Click it.
2. From the dropdown, click **Project settings**.
3. On the Project settings page, scroll down to the section **"Your apps"**.
4. You'll see an icon picker: **iOS / Android / Web / Unity**. Click the **Web** icon (it looks like `</>`).
5. **"Add Firebase to your web app"** dialog opens.
6. **"App nickname"** — type anything, like `mygallery-web`. Don't check "Also set up Firebase Hosting." Click **Register app**.
7. Now you see a code block on the right side with text like:
   ```js
   const firebaseConfig = {
     apiKey: "AIzaSyXXX...",
     authDomain: "mygallery-prod-abc.firebaseapp.com",
     projectId: "mygallery-prod-abc",
     storageBucket: "mygallery-prod-abc.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef"
   };
   ```

8. **Open a new text file** on your computer (Notepad on Windows, TextEdit on Mac). Save it as `keys.txt`. Carefully copy each value into it like this:
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY = AIzaSyXXX...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = mygallery-prod-abc.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID = mygallery-prod-abc
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = mygallery-prod-abc.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = 123456789
   NEXT_PUBLIC_FIREBASE_APP_ID = 1:123456789:web:abcdef
   ```
   ⚠️ **Be careful — no spaces or extra quotes**. Just the value as it appears in the code.

9. Back in Firebase, click **Continue to console**.

**✅ What you should see:** you're back in Project settings with a card showing your registered web app.

### 3e. Get the Firebase Admin key (server-side credentials) (3 min)

This is the **most important secret** in this guide. The Admin key lets your server talk to Firebase with full permissions.

⚠️ **WARNING:** never share this key with anyone, never paste it in a chat, never put it in code that goes to GitHub.

1. Still in Project settings, click the **"Service accounts"** tab at the top.
2. Click the button **"Generate new private key"**.
3. A confirmation popup appears warning you to keep the file safe. Click **"Generate key"**.
4. A JSON file downloads to your computer (named something like `mygallery-prod-abc123-firebase-adminsdk-xxxxx.json`).
5. **Move this file to a safe place** outside the project folder (e.g. `Documents/secret-keys/`). Do NOT put it inside the project folder.
6. Open the JSON file with Notepad or TextEdit. You'll see something like:
   ```json
   {
     "type": "service_account",
     "project_id": "mygallery-prod-abc",
     "private_key_id": "0496305c01dbce67...",
     "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n",
     "client_email": "firebase-adminsdk-xxxxx@mygallery-prod-abc.iam.gserviceaccount.com",
     ...
   }
   ```
7. Open your `keys.txt` file and add these THREE lines (carefully copy the values):
   ```
   FIREBASE_ADMIN_PROJECT_ID = mygallery-prod-abc
   FIREBASE_ADMIN_CLIENT_EMAIL = firebase-adminsdk-xxxxx@mygallery-prod-abc.iam.gserviceaccount.com
   FIREBASE_ADMIN_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
   ```

   ⚠️ **For the private key:** keep the **double quotes** around it. Keep the **`\n` characters** as literal text (don't replace them with real new lines). Copy the value EXACTLY as it appears in the JSON, including the `BEGIN` and `END` markers.

**✅ What you should see:** your `keys.txt` file now has 9 Firebase values (6 from 3d + 3 from 3e).

**❌ Common mistakes:**
- Removing the `\n` from the private key → it won't work
- Not wrapping the private key in `"..."` → it won't work
- Sharing the JSON file → anyone with this file can access your Firebase

---

## Step 4 — Enable the Google Drive API

**🎯 Goal:** allow the app to read photos from users' Google Drive folders.
**⏱ Time:** 5 minutes.
**💡 What we're doing:** Google requires you to "turn on" the Drive API for your project and generate a special key (different from the Firebase keys).

### Steps

1. Go to: **https://console.cloud.google.com**
2. Sign in with the same Google account you used for Firebase.
3. **At the top of the page**, near the Google Cloud logo, there's a **project selector dropdown**. Click it.
4. In the popup, find and select **the same project name** you created in Firebase (Firebase automatically creates a matching Google Cloud project — e.g. `mygallery-prod-abc`). If you don't see it, click the **"All" tab** in the popup.
5. Once selected, the project name appears at the top.
6. **Open the menu** — click the **three horizontal lines ☰** at the very top-left of the page.
7. From the menu, click **"APIs & Services"** → **"Library"**.
8. A search box appears. Type **"Google Drive API"** and press Enter.
9. Click the result that says **"Google Drive API"** with the Google Drive logo.
10. Click the blue **"Enable"** button. Wait ~10 seconds while it activates.
11. After it's enabled, you're on the API details page. In the left sidebar click **"Credentials"** (or in the breadcrumb at top, click "APIs & Services" then "Credentials").
12. At the top of the Credentials page, click **"+ CREATE CREDENTIALS"** and choose **"API key"**.
13. A popup appears with your new API key (starts with `AIza...`). **Copy this key** and paste it into your `keys.txt`:
    ```
    GOOGLE_DRIVE_API_KEY = AIzaSy...
    ```
14. **Restrict the key** (important for security):
    - In the popup, click **"Edit API key"**.
    - On the edit page, find the section **"API restrictions"**.
    - Select **"Restrict key"**.
    - In the dropdown that appears, check **only "Google Drive API"**.
    - Scroll down and click **"Save"**.

**✅ What you should see:** the API key now shows "Google Drive API" under "API restrictions" instead of "None".

**❌ Common mistakes:**
- You're in the wrong Google Cloud project → check the selector at the top.
- You forgot to restrict the key → still works but is a security risk. Restrict it.

---

## Step 5 — Create your Stripe account

**🎯 Goal:** set up the payment processor that will collect subscription fees.
**⏱ Time:** 10 minutes for the account, plus 1–2 days for Stripe to verify your business (you can continue with Test mode while waiting).
**💡 What we're doing:** Stripe handles all the credit card processing. When someone subscribes, Stripe takes the money, takes a small fee (2.9% + $0.30), and sends the rest to your bank.

### 5a. Register (3 min)

1. Go to: **https://dashboard.stripe.com/register**
2. Fill in:
   - **Email** — use a business email you'll keep long-term
   - **Full name**
   - **Country** — your country (this matters for tax handling!)
   - **Password** — make a strong one
3. Click **Create account**.
4. Stripe sends a verification email. Open it and click the verification link.

### 5b. Get your TEST API keys (2 min)

Stripe has two "modes": **Test** (fake money, for development) and **Live** (real money). Start with Test.

1. Once verified, you're on the Stripe Dashboard.
2. **At the top-right corner**, look for a toggle labeled **"Test mode"**. ⚠️ **Make sure it's ON (orange).**
3. In the left sidebar, click **"Developers"** → **"API keys"**.
4. You see two keys. This app only needs the **Secret key** — checkout is created
   entirely on the server, so the publishable key is never used. Ignore it.
   - **Secret key** — starts with `sk_test_...`. This is SECRET. Click **"Reveal test key"**, then copy.
5. Add it to your `keys.txt`:
   ```
   STRIPE_SECRET_KEY = sk_test_...
   ```

### 5c. Webhook secret — skip for now

You'll get this **after deploying** (Step 11). For now, add this placeholder to your `keys.txt`:
```
STRIPE_WEBHOOK_SECRET = whsec_placeholder_we_will_replace_this_in_step_11
```

### 5d. Business activation (do this in parallel — takes 1–2 days)

To accept **real money** later, Stripe needs to verify your business:

1. In Stripe Dashboard, click **"Activate account"** at the top of the screen.
2. Fill in:
   - Legal business name and address
   - Tax ID (your country's equivalent of VAT number / SSN / EIN)
   - Bank account where you want money sent (IBAN for EU, routing+account for USA)
   - ID document for identity verification (passport or driver's license photo)
3. Submit. Stripe usually approves within 1–2 business days.
4. While waiting, you can continue this entire guide using **Test mode**.

---

## Step 6 — Fill in your `.env.local` file

**🎯 Goal:** put all the keys you collected into a single configuration file the app reads.
**⏱ Time:** 10 minutes.
**💡 What we're doing:** the app looks for a file called `.env.local` to know its settings. We'll create it from a template (`.env.example`) and fill in your values.

### Steps

1. Open the project folder in your file explorer (Windows Explorer / Mac Finder).
2. You'll see a file called **`.env.example`**. (If hidden files are not visible: on Mac press `Cmd + Shift + .` to toggle visibility. On Windows: View → Show → Hidden items.)
3. **Make a copy of this file in the same folder.** Rename the copy to **`.env.local`** (with a dot at the start).
   - Mac/Linux Terminal way: in the project folder run `cp .env.example .env.local`
   - GUI way: right-click `.env.example` → Copy → right-click empty space → Paste → rename to `.env.local`
4. Open `.env.local` in a text editor:
   - On Mac: right-click → Open With → TextEdit (or use VS Code if you have it)
   - On Windows: right-click → Open With → Notepad
   - ⚠️ Don't use Word — it adds formatting that breaks the file.

5. The file looks like a list of `KEY=value` pairs. Fill in **every value** from your `keys.txt`. Be careful:
   - **No spaces around the `=`** — write `KEY=value`, not `KEY = value`.
   - **No quotes** except for the Firebase private key which MUST be in double quotes.
   - **No trailing comments** at the end of lines (anything after `#` is ignored).

   Example of what your filled-in file should look like (with fake values for illustration):
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyABCdefGHI123jkl456
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=mygallery-prod-abc.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=mygallery-prod-abc
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=mygallery-prod-abc.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
   NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123def456

   FIREBASE_ADMIN_PROJECT_ID=mygallery-prod-abc
   FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxx@mygallery-prod-abc.iam.gserviceaccount.com
   FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADAN...\n-----END PRIVATE KEY-----\n"

   GOOGLE_DRIVE_API_KEY=AIzaSyDEF456ghi789JKL012

   STRIPE_SECRET_KEY=sk_test_51ABCD...
   STRIPE_WEBHOOK_SECRET=whsec_placeholder_we_will_replace_this_in_step_11

   NEXT_PUBLIC_APP_URL=http://localhost:3000
   APP_URL=http://localhost:3000

   ADMIN_UID=

   GALLERY_JWT_SECRET=
   ```

### Generate the JWT secret

The `GALLERY_JWT_SECRET` is a random string the app uses to sign gallery-access tokens. You need to generate one.

**Mac / Linux:** in Terminal, run:
```
openssl rand -base64 32
```
Copy the output (something like `xY8j+/abcdef...=`) and paste it after `GALLERY_JWT_SECRET=`.

**Windows (no openssl):** go to https://www.random.org/strings/?num=1&len=32&digits=on&upperalpha=on&loweralpha=on&unique=on&format=html&rnd=new and use the string generated.

### Branding (your name, your email, your legal info)

At the bottom of `.env.local`, fill in these values with **your** info:

```env
NEXT_PUBLIC_APP_NAME=MyGallery
NEXT_PUBLIC_SUPPORT_EMAIL=support@mygallery.com
NEXT_PUBLIC_OWNER_NAME=YOUR FULL LEGAL NAME
NEXT_PUBLIC_OWNER_VAT=YOUR_TAX_ID_NUMBER
NEXT_PUBLIC_OWNER_ADDRESS=Your business street, City, Country
NEXT_PUBLIC_DEMO_GALLERY_URL=
```

These appear:
- `APP_NAME` → throughout the website (header, footer, page titles, emails)
- `SUPPORT_EMAIL` → on Contact, FAQ, Privacy, Terms pages
- `OWNER_NAME` / `OWNER_VAT` / `OWNER_ADDRESS` → on Terms of Service & Privacy Policy

6. **Save the file.** On Mac: `Cmd + S`. On Windows: `Ctrl + S`.

**✅ What you should see:** `.env.local` exists in your project folder with all values filled in.

**❌ Common mistakes:**
- Putting quotes around values that don't need them
- Removing the quotes from `FIREBASE_ADMIN_PRIVATE_KEY` — keep them!
- Replacing the `\n` in the private key with actual line breaks — keep them as `\n`
- Saving as `.env.local.txt` (Notepad does this) — make sure the file has NO `.txt` extension

---

## Step 7 — Run the app locally to verify it works

**🎯 Goal:** make sure everything works on your computer before going online.
**⏱ Time:** 5 minutes.
**💡 What we're doing:** start the development server on your computer. If everything is configured correctly, you can open it in your browser.

### Steps

1. In your terminal (still inside the project folder), type:
   ```
   npm run dev
   ```
   and press Enter.

2. Wait ~10–20 seconds. You'll see output like:
   ```
   ▲ Next.js 16.x.x
   - Local:        http://localhost:3000
   - Network:      ...

    ✓ Ready in 14s
   ```

3. Open your browser and go to: **http://localhost:3000**

**✅ What you should see:** the homepage of the app with your `NEXT_PUBLIC_APP_NAME` displayed.

### Test that everything works

Try these in order:

1. **Click "Sign in" / "Login" button.** Click "Sign in with Google." Choose your Google account.
   - ✅ You should land on a dashboard.
   - ❌ Error "unauthorized-domain"? → go to Firebase Console → Authentication → Settings → Authorized domains → and add `localhost`.

2. **Make yourself the admin — do this now, or the next test cannot pass.**

   Creating a gallery requires an active subscription, and yours is empty. The
   admin account is exempt, so set that up before going further.

   - You just signed in, so your account now exists. Go to **Firebase Console →
     Authentication → Users**.
   - Find the row with your email and copy the **User UID** (a long string like
     `aB3dEfGhIjKlMnOpQrStUvWxYz12`).
   - Open `.env.local` and paste it in:
     ```
     ADMIN_UID=the_uid_you_just_copied
     ```
   - Save, then **stop the server** (`Ctrl + C` in the terminal) and run
     `npm run dev` again. Environment variables are only read at startup.

   > ❌ If you skip this, the next step shows you a €89 payment box instead of
   > creating the gallery. That is the paywall doing its job, not a bug.

3. **Create a test gallery.**
   - In your Google Drive, create a folder (e.g. "Test Gallery") and add 3–5 photos.
   - Right-click the folder → Share → "Anyone with the link" → Copy link.
   - Back in the app: click "New Gallery" → paste the link → give it a title → optionally set a password → Create.
   - ✅ Gallery should be created and visible in the dashboard.

4. **Open the gallery.**
   - Click on the gallery you just created.
   - ✅ Your photos should display in a grid.

If all four work — congratulations, your keys are correct. Stop the server with **Ctrl + C** in the terminal.

If anything fails, see the [Troubleshooting](#troubleshooting-common-errors) section near the end.

---

# Part C — Go online

The goal of Part C is to take your working local app and put it on the internet at your own domain.

---

## Step 8 — Create your GitHub account & upload the code

**🎯 Goal:** put your code in a place Vercel can access it.
**⏱ Time:** 15 minutes.
**💡 What we're doing:** Vercel deploys code that lives on GitHub. So we need to upload your project to GitHub first.

### 8a. Create GitHub account (3 min)

1. Go to: **https://github.com/signup**
2. Enter your email → click **Continue**
3. Create a password → click **Continue**
4. Choose a username (e.g. `yourname-dev`) → click **Continue**
5. Verify you're not a robot (puzzle challenge).
6. Check your email for a verification code → enter it on GitHub.

**✅ What you should see:** the GitHub homepage with your username at the top right.

### 8b. Create a private repository (2 min)

1. At the top-right corner of GitHub, click the **"+" icon** → **"New repository"**.
2. **Repository name:** `mygallery` (or whatever).
3. **Description:** (optional) "My white-label gallery SaaS"
4. **Visibility:** click **"Private"** (very important — don't make it public!)
5. Leave everything else unchecked.
6. Click **"Create repository"**.

**✅ What you should see:** an empty repository page with instructions for uploading code. **Keep this page open** — you'll need the URL.

### 8c. Configure Git on your computer (3 min)

Git is a separate tool from GitHub. If you've never used it before:

**Check if Git is installed.** In your terminal:
```
git --version
```

- If you see a version number → installed. Continue.
- If not installed:
  - **Mac:** macOS includes Git. Just open Terminal and type `git --version`. The first time, macOS may prompt you to install developer tools — click Install. Wait 5 minutes.
  - **Windows:** download from https://git-scm.com/download/win and install with defaults.
  - **Linux:** `sudo apt install git` or `sudo yum install git`.

Now configure your name and email (these appear in commits):
```
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### 8d. Upload the project to GitHub (5 min)

In your terminal, inside the project folder (same place you ran `npm install`):

⚠️ **First, verify `.env.local` won't be uploaded.** It's in `.gitignore` so it's excluded automatically. To double-check:
```
cat .gitignore
```
You should see `.env*` in the list. Good.

Now upload:

```
git init
git add .
git commit -m "Initial commit"
git branch -M main
```

Look at the GitHub repository page you opened earlier. Find the URL — it looks like:
```
https://github.com/your-username/mygallery.git
```

Then in the terminal (REPLACE `your-username/mygallery.git` with YOUR actual URL):

```
git remote add origin https://github.com/your-username/mygallery.git
git push -u origin main
```

The first time you push, GitHub asks for authentication:
- A browser window opens asking you to log in → log in.
- If it fails, you may need to create a Personal Access Token (PAT):
  1. GitHub → Settings (top-right avatar) → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)
  2. Give it a name, set expiration "No expiration" (or 90 days), check the **`repo`** scope, click Generate
  3. Copy the token — you won't see it again
  4. In the terminal, when asked for password, paste this token

**✅ What you should see:** terminal shows lines like `Writing objects: 100% (412/412), done.` and `* [new branch] main → main`.

Refresh the GitHub repository page → your code should now appear there.

**❌ Common mistakes:**
- Pushed `.env.local` by accident → see "I accidentally pushed secrets to GitHub" in [Troubleshooting](#troubleshooting-common-errors).
- Authentication failed → make sure you generated a Personal Access Token, not your password.

---

## Step 9 — Deploy to Vercel (free hosting)

**🎯 Goal:** get a live URL on the internet for your app.
**⏱ Time:** 10 minutes.
**💡 What we're doing:** Vercel connects to your GitHub, downloads your code, runs the build, and hosts it on a `*.vercel.app` URL. From now on, every time you push to GitHub, Vercel auto-redeploys.

### Steps

1. Go to: **https://vercel.com/signup**
2. Click **"Continue with GitHub"**.
3. GitHub asks to authorize Vercel → click **Authorize Vercel**.
4. Vercel asks for some info (name, etc.) → fill it in.
5. On the next page select the **Free Hobby plan**.

You're now on the Vercel dashboard.

6. Click the **"Add New..."** button (top-right) → **"Project"**.
7. **"Import Git Repository"** — you see your GitHub repos listed. If you don't see your `mygallery` repo:
   - Click **"Adjust GitHub App Permissions"**
   - Select your account → allow access to your repos → save
   - Come back to Vercel
8. Find `mygallery` in the list and click **"Import"**.
9. **"Configure Project"** page appears:
   - **Project Name:** keep as-is or change.
   - **Framework Preset:** should auto-detect as **Next.js**. ✅
   - **Root Directory:** leave as `.`.
   - **Build Settings:** leave defaults.
10. **VERY IMPORTANT — Environment Variables:** click to expand the **"Environment Variables"** section.

    You now need to add **EVERY** key from your `.env.local` file. One by one:
    - **Name** field: paste the key name (e.g. `NEXT_PUBLIC_FIREBASE_API_KEY`)
    - **Value** field: paste the value
    - Click **Add**
    - Repeat for every key in your `.env.local`

    **Tip:** open `.env.local` in a text editor next to Vercel so you can copy-paste each one.

    Special cases:
    - For `FIREBASE_ADMIN_PRIVATE_KEY`: paste the entire value **including the double quotes and `\n` characters** exactly as in `.env.local`.
    - For `NEXT_PUBLIC_APP_URL` and `APP_URL`: for now, use the placeholder `https://YOUR-PROJECT.vercel.app` (you'll update this in Step 10).

11. Once all env vars are added, click **"Deploy"** at the bottom.

⏳ Vercel now builds your app. This takes 2–4 minutes. You see logs scrolling.

**✅ What you should see:**
- A confetti animation 🎉
- A success message
- A preview of your live site
- A URL like `https://mygallery-abc123.vercel.app`

12. **Click that URL** to open your live website.

**❌ Common mistakes:**
- Build fails with "Cannot find module..." → this is a code or dependency problem, not a missing key. See the "Module not found" entry in Troubleshooting. Missing environment variables do not break the build; they surface later, when the running site tries to reach Firebase or Stripe.
- Build succeeds but app crashes when you visit → `FIREBASE_ADMIN_PRIVATE_KEY` is malformed. Edit it in Vercel → make sure the `\n` characters are preserved.
- Page is blank → check the **"Function Logs"** in Vercel for the actual error.

### After deployment — update env vars

13. Go back to Vercel → click your project → **Settings** → **Environment Variables**.
14. Find `NEXT_PUBLIC_APP_URL`. Click the **"..."** (three dots) → **Edit**. Change to your actual Vercel URL (e.g. `https://mygallery-abc123.vercel.app`). Save.
15. Do the same for `APP_URL`.
16. Now you need to **redeploy** for the new values to take effect:
    - Go to the **Deployments** tab.
    - On the most recent deployment, click the **three dots (...)** → **Redeploy**.
    - Confirm by clicking **Redeploy** in the popup.
    - Wait 2 minutes.

17. Also update Firebase to allow your new domain:
    - Go to **Firebase Console → Authentication → Settings → Authorized domains**
    - Click **"Add domain"** → paste `mygallery-abc123.vercel.app` (whatever Vercel gave you) → Add.

Now test the live site: sign in, create a gallery, etc. Should work the same as locally.

---

## Step 10 — Buy a domain & connect it

**🎯 Goal:** replace the ugly Vercel URL with your own beautiful domain.
**⏱ Time:** 15 minutes (plus 30 minutes to 24 hours of DNS propagation).
**💡 What we're doing:** buy a domain from a registrar, then add DNS records that point it to Vercel.

### 10a. Buy a domain (5 min)

I recommend **Cloudflare Registrar** (cheapest, no markup) or **Namecheap** (easy interface).

1. Go to **https://www.cloudflare.com/products/registrar/** (or **https://www.namecheap.com**)
2. Create an account if needed.
3. Search for the domain you want, e.g. `mygallery.com`.
4. If available, add to cart.
5. Checkout and pay. ~$10–15.

**✅ What you should see:** an email confirming your purchase, and the domain in your registrar dashboard.

### 10b. Connect the domain to Vercel (10 min + DNS wait)

1. Go to Vercel → your project → **Settings** → **Domains**.
2. In the input field, type your domain (e.g. `mygallery.com`) → click **Add**.
3. Vercel shows a popup asking you to choose:
   - **Add `mygallery.com`** (the apex/naked domain)
   - **Recommended:** also add **`www.mygallery.com`** for the `www` variant
   - Add both.
4. Vercel now shows DNS records you need to add at your registrar:
   - For the apex domain (`mygallery.com`): an **A record** pointing to `76.76.21.21`
   - For the `www`: a **CNAME** pointing to `cname.vercel-dns.com`

5. Go back to your registrar's dashboard:
   - **Cloudflare:** select your domain → DNS → Records → Add record
   - **Namecheap:** Manage → Advanced DNS → Add new record
   - **GoDaddy:** My Products → DNS → Add

6. Add the records EXACTLY as Vercel shows them:
   - First record: Type=`A`, Name=`@` (means apex), Value=`76.76.21.21`, TTL=`Auto`
   - Second record: Type=`CNAME`, Name=`www`, Value=`cname.vercel-dns.com`, TTL=`Auto`
7. Save.

⏳ DNS propagation takes anywhere from 5 minutes to 24 hours. Usually 15–30 minutes.

8. Refresh the Vercel Domains page periodically. When you see a green checkmark next to your domain, it's live.

**✅ What you should see:** typing `https://mygallery.com` in your browser shows your app.

### 10c. Update env vars again

Now that your real domain is connected:

1. Vercel → Settings → Environment Variables:
   - `NEXT_PUBLIC_APP_URL` → change to `https://mygallery.com`
   - `APP_URL` → change to `https://mygallery.com`
2. Firebase → Authentication → Authorized domains: add `mygallery.com` and `www.mygallery.com`.
3. **Redeploy** the Vercel project.

**❌ Common mistakes:**
- DNS records added but Vercel doesn't verify → wait longer. Some registrars take hours.
- Apex domain not working but www is → the A record at the apex didn't propagate. Recheck Cloudflare/Namecheap.
- HTTPS doesn't work yet → Vercel automatically generates the SSL certificate, but only after DNS resolves. Wait.

---

## Step 11 — Set up the Stripe webhook

**🎯 Goal:** tell Stripe to notify your app when a payment succeeds.
**⏱ Time:** 5 minutes.
**💡 What we're doing:** when a user pays, Stripe sends a message to your app saying "payment X was successful." Your app activates their subscription. The webhook is that message channel.

### Steps

1. Go to: **https://dashboard.stripe.com**
2. Ensure **Test mode is ON** (orange toggle, top-right).
3. Left sidebar → **Developers** → **Webhooks**.
4. Click **"Add endpoint"** (or "+ Add destination").
5. **Endpoint URL:** type `https://mygallery.com/api/stripe/webhook` (use YOUR domain).
6. **Description:** (optional) "Subscription activation"
7. **Events to send:** click **"+ Select events"**:
   - In the search box, type `checkout.session.completed`
   - Check that one event
   - Click **"Add events"**
8. Click **"Add endpoint"** at the bottom.

9. You're now on the new webhook's page. Find **"Signing secret"** in the right column.
10. Click **"Reveal"** → copy the value (starts with `whsec_...`).

11. Go to Vercel → Settings → Environment Variables → find `STRIPE_WEBHOOK_SECRET` → Edit → paste the new value → Save.

12. **Redeploy** the project from the Deployments tab.

### Test that it works

1. Open `https://mygallery.com` → sign in → go to dashboard.
2. Click to subscribe (or whatever your subscribe flow is).
3. On the Stripe Checkout page, use these TEST card details:
   - **Card number:** `4242 4242 4242 4242`
   - **Expiry:** any future date (e.g. 12/30)
   - **CVC:** any 3 digits (e.g. 123)
   - **ZIP/Postal:** any (e.g. 12345)
4. Submit. You should be redirected back to your app.
5. Your subscription should show as **Active**.
6. Go to Stripe → Webhooks → your endpoint → **"Recent deliveries"**. You should see a successful delivery (200 status).

**✅ Success indicators:** subscription active + webhook delivered successfully.

**❌ If the webhook fails:**
- 401/403 error → `STRIPE_WEBHOOK_SECRET` doesn't match. Re-copy from Stripe.
- 500 error → check Vercel function logs.
- Subscription not activating → check Firestore Database → `users` collection → your user document.

---

## Step 12 — Make yourself the admin

**🎯 Goal:** set yourself as the admin so you can access the admin panel.
**⏱ Time:** 3 minutes.
**💡 What we're doing:** the admin user has access to a special panel where you can see all users and galleries. We're telling the app which user that is.

### Steps

You already found this UID back in Step 7 and put it in your local `.env.local`.
Vercel does not read that file, so you have to set it there too.

1. Open your local `.env.local` and copy the value of `ADMIN_UID`.
   - Lost it? Go to **Firebase Console → Authentication → Users**, find the row
     with your email, and copy the **User UID**.
2. Go to Vercel → your project → **Settings → Environment Variables** → find
   `ADMIN_UID` → **Edit** → paste the value → **Save**.
3. **Redeploy** the project (Deployments → the newest one → ⋯ → Redeploy).
   Environment variables only take effect on a new deployment.

After redeploy, sign in again, then type the admin URL into your browser:
`https://yourdomain.com/dashboard/admin`. There is deliberately no link to it
anywhere in the interface, so bookmark it.

**✅ What you should see:** the admin URL opens a panel listing all users, their galleries and their subscription status.

---

## Step 13 — Lock down the database (security rules)

**🎯 Goal:** stop the browser reading data it should never see.
**⏱ Time:** 3 minutes.
**💡 What we're doing:** Firestore starts either wide open or fully closed. The
project ships with a ready-made ruleset. You are going to publish that file — do
not write your own.

> **Do not skip this step, and do not substitute a different ruleset.** Gallery
> documents hold your customers' gallery passwords. Publish permissive rules and
> anyone can read every password in your database straight from a browser
> console, and any signed-in visitor can give themselves a free subscription.

### Steps

1. In your project folder, open the file **`firestore.rules`** (it sits in the
   root, next to `package.json`). Select everything and copy it.
2. Open **Firebase Console** → your project → **Firestore Database** → **Rules** tab (at the top).
3. **Replace ALL the existing text** in the editor with what you just copied.
4. Click **"Publish"** at the top-right, then confirm.

**✅ What you should see:** the rules version timestamp updates to "now", and the
last rule inside the editor reads:

```
match /{document=**} {
  allow read, write: if false;
}
```

If you do not see that line, you pasted the wrong text. Go back to step 1.

These rules mean:
- A signed-in user can read and update only their **own** `users/{uid}` document,
  and can never write the billing fields (`subscriptionStatus`,
  `subscriptionExpiresAt`, `compGranted`, `stripeCustomerId`). Only your server
  and the Stripe webhook set those.
- **No browser can read or write gallery documents at all.** Your public gallery
  pages still work perfectly: the server loads them with the Firebase Admin SDK,
  which bypasses these rules by design. Only the browser is locked out.

---

# Part D — Make it yours

Now the app works under your domain. Time to personalize it.

---

## Step 14 — Customize the app name everywhere

**🎯 Goal:** change "Galleroo" placeholder name to your brand name throughout the entire app.
**⏱ Time:** 10 minutes.

### Method 1 (Easy — partial): via environment variable

You already set `NEXT_PUBLIC_APP_NAME=MyGallery` in `.env.local` and Vercel. That
handles the places that read the name dynamically — nav bar, page titles, the
gallery header, the social preview image.

### Method 2 (Required for full branding): one global find/replace

That is not everything. "Galleroo" is also written directly into the marketing
copy — and the copy exists six times over, once per language. Across the project
it appears **about 165 times in 14 files**, mostly in `lib/i18n/index.tsx` but
also in `app/page.tsx`, `components/TrustSection.tsx`, `app/subscribe/page.tsx`,
`app/login/page.tsx` and a handful of others.

Do not hunt for them one by one. Run a **single global find/replace across the
whole project folder** — that is what the steps below do, and it is why they use
the project-wide search rather than opening individual files.

**Using VS Code (recommended) — free editor:**

1. Download VS Code: https://code.visualstudio.com
2. Install and open it.
3. **File** → **Open Folder** → select your project folder.
4. Press **Ctrl+Shift+F** (Mac: **Cmd+Shift+F**) to open the global Find & Replace.
5. **Click the `Aa` icon in the search box first** to turn on Match Case. Without it,
   the replace also rewrites lowercase filenames and you end up with a broken image.
6. In the search box type: `Galleroo`
7. In the replace box type: your brand name, e.g. `MyGallery`
8. Click the **"Replace All"** button (icon looks like two arrows).
9. Confirm by clicking "Replace" in the popup.
10. **Save all changes**: **Ctrl+K, S** (Mac: **Cmd+Option+S**).

**Without VS Code (manual):** open each of the 14 files and replace within it.
Slow and easy to miss one — VS Code's project-wide replace above is strongly
recommended instead.

### Check your work

In your terminal, inside the project folder, run:

```
grep -rn "Galleroo" app components lib
```

**✅ What you should see:** nothing at all. Any line that still prints is a spot
the replace missed — open that file and fix it.

(On Windows without `grep`, use VS Code's search box: search `Galleroo` again and
confirm it reports "No results".)

### Push the changes

In your terminal, inside the project:
```
git add .
git commit -m "Rebrand to MyGallery"
git push
```

Vercel auto-detects the push and redeploys (~2 min).

**✅ What you should see:** the app now uses your brand name everywhere.

---

## Step 15 — Change the subscription price

**🎯 Goal:** set your own annual subscription price.
**⏱ Time:** 5 minutes.

### Steps

1. In your code editor, open the file: `app/api/stripe/checkout/route.ts`
2. Search the file for `unit_amount`. You will find:
   ```ts
   unit_amount: 8900,
   ```
   That is **€89.00** — the amount is in cents. A few lines above it, in the same
   block, sits `currency: "eur"`.

3. Change `unit_amount`:
   - The number is in **cents** (i.e. divide by 100 for the displayed price)
   - €89 → `8900`
   - $149 → `14900` (with `currency: "usd"`)
   - ¥9900 → `9900` (JPY doesn't use cents, but Stripe expects the raw integer for JPY too)
4. Change `currency` to your currency code (`eur`, `usd`, `gbp`, `jpy`, `chf`, etc.).
5. Save.

### Also update the price shown on screen

The price you **charge** and the price you **advertise** are set in different
places. Change only the one above and your site will advertise €89 while
charging something else — which, in the EU, is a problem.

Search the whole project for `€89` and change every hit. There are five, across
four files:

| File | What it is |
|---|---|
| `app/page.tsx` | price on the landing page |
| `app/subscribe/page.tsx` | price on the subscribe page |
| `components/dashboard/NewGalleryForm.tsx` | price in the in-dashboard upsell |
| `components/dashboard/NewGalleryForm.tsx` | a struck-through `€199` "before" price, with a hardcoded `-55%` badge on the next line. Change both together or delete both, otherwise the discount is wrong |
| `app/dashboard/admin/page.tsx` | `const ANNUAL_PRICE = 89;` — feeds only the revenue estimate in your own admin panel, but leave it stale and your reports are wrong |

There is no price string in `lib/i18n/index.tsx`, so nothing to change there.

Check your work before deploying:

```
grep -rn "8900\|€89\|ANNUAL_PRICE" app components lib
```

Every hit should show your new price.

### Push the changes

```
git add .
git commit -m "Update price to $149"
git push
```

Vercel auto-redeploys.

---

## Step 16 — Change logo and favicon

**🎯 Goal:** replace the default text logo with your brand identity.
**⏱ Time:** 15 minutes.

### Favicon (the tiny icon in browser tabs)

You need 2 files:
- `favicon.ico` — 32×32 pixels
- `apple-icon.png` — 180×180 pixels

Create them using a free tool like:
- **https://realfavicongenerator.net** (best — upload one image, get all sizes)
- **https://favicon.io** (simple, free)

Then:
1. Replace `app/favicon.ico` with yours.
2. Replace `app/apple-icon.png` with yours.

### Text logo

The logo is currently your brand name written as plain text in
`components/LogoLink.tsx` — Step 14's find/replace already changed it from
"Galleroo" to your name. To use an image instead:

1. Save your logo in `public/logo.png` (recommended: 200×60 pixels, transparent background)
2. Open `components/LogoLink.tsx`
3. The file shows your brand name in **two** places: once inside an `<a>` tag and
   once inside a `<Link>` tag. Replace **only the text** in both, leaving the
   surrounding tags alone — they carry the click behaviour, and deleting them
   breaks the logo's smooth-scroll on the homepage. Put this in place of the text:
   ```tsx
   <img src="/logo.png" alt="MyGallery" className="h-8 w-auto" />
   ```
   Replace `MyGallery` with your own brand name, in quotes. Write it as a literal
   string exactly as shown — this file does not import `APP_NAME`, so writing
   `alt={APP_NAME}` makes `npm run build` fail with "Cannot find name 'APP_NAME'".
4. Save.

### Push the changes

```
git add .
git commit -m "Custom logo and favicon"
git push
```

---

## Step 17 — Adapt the legal pages to your country

**🎯 Goal:** make Terms of Service & Privacy Policy compliant with your country's laws.
**⏱ Time:** 30 minutes (or longer if you consult a lawyer — recommended).

### What's already done

The current Terms & Privacy pages are written in a generic style with placeholders. They pull your name, VAT, and address from environment variables.

### What you should adapt

1. **Hosting provider disclosure:** in `app/privacy/page.tsx`, there's a section listing third-party "Data Processors." It currently says "Hosting Provider" with a placeholder. Replace it with:

   ```
   <p>Vercel Inc. — USA. Policy: https://vercel.com/legal/privacy-policy</p>
   ```

2. **Country-specific law:** the i18n file (`lib/i18n/index.tsx`) mentions "provider's jurisdiction" generically. If you're in Japan, you may want to update sections about:
   - APPI (Act on Protection of Personal Information) — Japan's privacy law
   - Reference to the Personal Information Protection Commission (PPC)
   - Local consumer protection laws

3. **Cooling-off period:** in EU, customers have a 14-day right to cancel. In other countries, different rules. Adjust your refund policy accordingly.

4. **Get legal review.** I strongly recommend showing the Terms and Privacy to a lawyer in your country. The base text gives you 80% — the last 20% needs local expertise.

### Push the changes

```
git add .
git commit -m "Country-specific legal updates"
git push
```

---

# Part E — Going live

---

## Step 18 — Switch from Test mode to Live mode

**🎯 Goal:** start accepting real money.
**⏱ Time:** 10 minutes (after Stripe activation is approved).

### Prerequisites

- Stripe has approved your business activation (you'll get an email).
- You've tested the full flow in Test mode and everything works.

### Steps

1. Go to https://dashboard.stripe.com → toggle **"Test mode" OFF** (top-right). Now you're in Live mode.

2. **Developers → API keys**. Copy:
   - **Secret key** — Reveal → copy. Starts with `sk_live_...`

3. **Developers → Webhooks** → Add endpoint (just like Step 11):
   - URL: `https://mygallery.com/api/stripe/webhook`
   - Event: `checkout.session.completed`
   - After creating, reveal the **Signing secret** (starts with `whsec_...`)

4. In Vercel → Environment Variables → update **TWO** keys:
   - `STRIPE_SECRET_KEY` → new `sk_live_...`
   - `STRIPE_WEBHOOK_SECRET` → new `whsec_...` (from the live webhook)

5. **Redeploy** the project.

6. Do ONE small real test — pay yourself a $1 subscription using your real credit card. Verify everything works. (You can refund it from Stripe Dashboard afterward.)

---

## Final checklist before sharing with customers

Run through this entire list before promoting your site:

### Functionality
- [ ] Homepage loads at your domain (no errors)
- [ ] Sign in with Google works
- [ ] Creating a gallery works (with a real Google Drive folder)
- [ ] Gallery opens and photos display correctly
- [ ] Password-protected galleries work (set a password on a test gallery, open in incognito)
- [ ] Mobile view looks good (open your domain on your phone)
- [ ] Language switcher works (top-right)
- [ ] Subscription checkout works (live mode, real card)
- [ ] After payment, subscription shows as **Active** in dashboard
- [ ] Stripe webhook receives event (Stripe → Webhooks → Recent deliveries)
- [ ] Admin panel accessible at `/dashboard/admin` (you only)
- [ ] Email template renders correctly (test by triggering whatever email-sending action exists)

### Branding
- [ ] No "Galleroo" or other placeholder strings anywhere
- [ ] Your brand name appears in header, footer, page titles
- [ ] Logo and favicon are your own
- [ ] Support email is your real email
- [ ] Legal pages show your real name, address and tax ID (not "Your Company Name" or "Your registered address")

### Legal & Compliance
- [ ] Terms of Service references your country's law
- [ ] Privacy Policy lists Vercel as hosting provider (or wherever you host)
- [ ] Lawyer reviewed the legal pages (recommended)
- [ ] You have a way to receive support emails

### Technical
- [ ] Firestore security rules are published (Step 13)
- [ ] All env vars are set in Vercel
- [ ] `.env.local` is in `.gitignore` (NEVER pushed to GitHub)
- [ ] HTTPS works (green padlock in browser)
- [ ] Domain redirects properly (e.g. `mygallery.com` and `www.mygallery.com` both work)

If everything checks out — **you're live. Congratulations! 🎉**

---

# Part F — Reference

---

## Troubleshooting common errors

### "Firebase: Error (auth/unauthorized-domain)"

**Cause:** the domain you're using is not in Firebase's allow list.
**Fix:** Firebase Console → Authentication → Settings → Authorized domains → Add domain → enter your domain → Save.

### Stripe webhook is not firing

**Cause:** wrong URL, wrong secret, or wrong event configuration.
**Fix:**
1. Stripe → Webhooks → click your endpoint → "Recent deliveries" → see why it failed
2. Verify URL is `https://yourdomain.com/api/stripe/webhook` (with HTTPS, not HTTP, not localhost)
3. Verify `STRIPE_WEBHOOK_SECRET` in Vercel matches the value in Stripe ("Signing secret")
4. Verify event `checkout.session.completed` is selected

### "FIREBASE_ADMIN_PRIVATE_KEY" errors on Vercel

**Cause:** the key is malformed.
**Fix:** in Vercel → Environment Variables → edit `FIREBASE_ADMIN_PRIVATE_KEY`:
- Must be wrapped in double quotes: `"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"`
- The `\n` must be **literal backslash-n** characters, not actual line breaks
- Copy directly from your `.env.local` or from the JSON file

### Page is blank after deploy

**Cause:** runtime error.
**Fix:** Vercel → Deployments → click the latest → "View Function Logs" → look for the error message.

### "Module not found" errors during build

**Cause:** missing dependency.
**Fix:**
```
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
git add .
git commit -m "Re-lock dependencies"
git push
```

### Google Drive: "API key not valid"

**Cause:** Drive API not enabled, or key restrictions don't include Drive API.
**Fix:**
1. Google Cloud Console → APIs & Services → Library → verify "Google Drive API" is Enabled
2. APIs & Services → Credentials → click your API key → check API restrictions include "Google Drive API"

### Stripe: "No such webhook endpoint"

**Cause:** `STRIPE_WEBHOOK_SECRET` doesn't match.
**Fix:** Stripe → Webhooks → open your endpoint → "Reveal" the Signing secret → copy → update in Vercel → Redeploy.

### Privacy/Terms pages show "Your Company Name" or "Your registered address"

**Cause:** `NEXT_PUBLIC_OWNER_*` env vars are not set in Vercel (or you forgot to redeploy).
**Fix:** Vercel → Settings → Environment Variables → add `NEXT_PUBLIC_OWNER_NAME`, `NEXT_PUBLIC_OWNER_VAT`, `NEXT_PUBLIC_OWNER_ADDRESS` → Redeploy.

### I accidentally pushed secrets to GitHub

⚠️ **CRITICAL.** Anyone who finds your repo can steal your keys.

**Fix:**
1. **Immediately rotate** every leaked key:
   - Firebase: Project Settings → Service accounts → Delete the old key, generate a new one
   - Google Drive API: Cloud Console → Credentials → Delete the leaked key, create a new one
   - Stripe: Dashboard → API keys → Roll the keys
   - JWT secret: regenerate with `openssl rand -base64 32`
2. Update all of them in Vercel.
3. Then clean up GitHub:
   - **Easiest:** delete the entire repo and create a fresh one (only works if you just pushed)
   - **Proper:** use `git filter-branch` or BFG Repo-Cleaner to remove from history

### "ENOSPC: no space left on device"

**Cause:** your hard drive is full (probably `node_modules` is huge).
**Fix:** delete old `node_modules` folders, empty Trash, etc.

### DNS doesn't propagate

**Cause:** registrar slow to update, or wrong records.
**Fix:**
1. Use https://dnschecker.org to see if your DNS is visible globally
2. Verify the A record points to `76.76.21.21` and CNAME `www` → `cname.vercel-dns.com`
3. Wait up to 24 hours

---

## FAQ

### How many users can I have on the free Vercel tier?
Vercel free tier allows ~100 GB bandwidth/month. Each gallery viewing uses small bandwidth (Drive photos are served directly from Google's servers, not Vercel). Realistic estimate: **100–500 active users** before hitting limits.

### When should I upgrade Vercel to Pro?
Pro is $20/month per team member. Upgrade when:
- You exceed 100 GB bandwidth
- You need function execution > 10s (large galleries)
- You want better analytics

### How do I update the app when the seller releases new features?
The seller would give you a new ZIP or push to a shared GitHub repo. To update:
1. Replace your local files with the new version (keep your `.env.local`)
2. Run `npm install`
3. Test locally with `npm run dev`
4. `git add . && git commit -m "Update" && git push`
5. Vercel auto-redeploys

### How do I back up my database?
Firebase has built-in export:
1. Firebase Console → Firestore → Backups (top tab)
2. Schedule daily backups (free, included)

### How much does Stripe take?
- **Standard:** 2.9% + $0.30 per successful transaction
- **EU cards:** 1.5% + €0.25
- **International cards:** +1% on top of standard

### Can I let users sign in without Google?
Currently only Google is supported. Adding email/password auth requires code changes in `components/auth/`.

### Can I add more languages?
Yes — `lib/i18n/index.tsx` has 6 languages (Greek, English, Dutch, German, Italian, Spanish). To add Japanese:
1. Open the file → find the language block structure
2. Copy an existing language (e.g. `en`) → rename to `ja` → translate values
3. Add `"ja"` to the `Lang` type at the top of the file

### How do I cut off a customer's access?
There is no Stripe subscription to cancel — payments are one-time, and access is
a 365-day expiry this app writes itself. Cancelling anything in Stripe would not
touch it.

Do it in your own admin panel instead:

1. Go to `https://yourdomain.com/dashboard/admin`
2. Find the user and click their row to expand it
3. Under **Access / Subscription:** click **Revoke**

Their access ends immediately. If you also want to give the money back, issue a
refund separately in the Stripe Dashboard — the two are independent.

The same row has **Free lifetime** and **+1 year**, which is how you grant access
without a payment.

### How do I see how much money I'm making?
Stripe Dashboard → Home → see daily/monthly revenue, charts, etc.

### What if Stripe holds a payment for review?
Stripe sometimes flags suspicious transactions. They notify you via email. Just provide whatever info they ask.

### How do I delete a user's data on request (GDPR / CCPA)?
**Point them at the button — it already exists.** Signed in, they go to their
dashboard and use **Delete my account**. It removes their login, their profile
record and every gallery they own, in one action. That is the whole request
satisfied, with no work from you.

Only if they cannot sign in do you do it by hand:

1. Firebase Console → Authentication → Users → find user → Delete
2. Firebase Console → Firestore → `users` collection → delete that user's document
3. Firebase Console → Firestore → `galleries` collection → find `photographerId == theirUID` → delete each

**One thing to set up separately.** The try-it-out demo box on your homepage
records each visitor's IP address in a `demo_galleries` collection, to stop one
person spamming it. Those rows carry no account and are never matched to a user,
so they are not part of the deletion above — but nothing removes them either, and
they accumulate. Two things to do before you launch:

- Mention it in your Privacy Policy (Step 17).
- In Firebase Console → Firestore → **Time-to-live**, add a TTL policy on the
  `demo_galleries` collection using the `expiresAt` field, so Google deletes them
  for you.

---

## Glossary of terms

- **API key**: secret string that authenticates one service to another.
- **CNAME**: a DNS record that maps one domain name to another.
- **CLI**: Command Line Interface — typing commands instead of clicking.
- **Deployment**: putting your code on a server so the world can access it.
- **DNS**: the system that translates `mygallery.com` to an IP address.
- **Environment variable / env var**: a configuration value the app reads at startup.
- **Firestore**: the database we use, part of Firebase.
- **JWT**: JSON Web Token, a way to securely sign small pieces of data.
- **OAuth**: a protocol for logging in via another service (we use it for Google Sign-In).
- **Repository / repo**: a folder in GitHub that holds your code.
- **SDK**: Software Development Kit — a library that helps you talk to a service.
- **SSL/TLS**: encryption that makes URLs start with `https://` (vs. `http://`).
- **Webhook**: a URL that another service calls when something happens (e.g. Stripe → app when payment succeeds).

---

## Complete list of `.env` variables

| Variable | Type | Where you get it |
|----------|------|------------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Public | Firebase → Project Settings → Web app config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Public | Same as above |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Public | Same as above |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Public | Same as above |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Public | Same as above |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Public | Same as above |
| `FIREBASE_ADMIN_PROJECT_ID` | **Secret** | Service account JSON → `project_id` |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | **Secret** | Service account JSON → `client_email` |
| `FIREBASE_ADMIN_PRIVATE_KEY` | **Secret** | Service account JSON → `private_key` (with quotes + `\n`) |
| `GOOGLE_DRIVE_API_KEY` | **Secret** | Google Cloud Console → APIs & Services → Credentials |
| `STRIPE_SECRET_KEY` | **Secret** | Stripe → Developers → API keys → Secret (Reveal) |
| `STRIPE_WEBHOOK_SECRET` | **Secret** | Stripe → Webhooks → your endpoint → Signing secret |
| `NEXT_PUBLIC_APP_URL` | Public | Your domain, e.g. `https://mygallery.com` |
| `APP_URL` | Server-only | Same value as above. Not secret, but never reaches the browser. |
| `ADMIN_UID` | Server-only | Firebase Console → Authentication → Users → your row → User UID |
| `GALLERY_JWT_SECRET` | **Secret** | Generated via `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_NAME` | Public | Your app's name (e.g. `MyGallery`) |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Public | Your support email |
| `NEXT_PUBLIC_OWNER_NAME` | Public | Your legal name |
| `NEXT_PUBLIC_OWNER_VAT` | Public | Your tax ID |
| `NEXT_PUBLIC_OWNER_ADDRESS` | Public | Your business address |
| `NEXT_PUBLIC_OWNER_TAX_OFFICE` | Public | (Optional) Local tax authority, only where the law requires naming one. Leave empty in the US and the row disappears. |
| `NEXT_PUBLIC_APP_TAGLINE` | Public | (Optional) Slogan on the social link-preview card |
| `NEXT_PUBLIC_APP_DESCRIPTION` | Public | (Optional) Sub-line on that same card |
| `NEXT_PUBLIC_DEMO_GALLERY_URL` | Public | (Optional) URL of a public demo gallery |

**Note:** "Public" means the value is compiled into the browser bundle and is
visible to anyone who inspects your page — that is fine, these are meant to be
seen. "Server-only" means it never reaches the browser, but it is not a secret
either. "Secret" means it must NEVER be exposed.

---

## How to update the app later

When the seller releases an update (bug fix or new feature):

1. **Backup your work first:**
   - Make sure your `.env.local` is safe somewhere
   - Optional: download a copy of your current project as a zip

2. **Get the new version:**
   - The seller sends you a new ZIP, or
   - The seller asks you to do `git pull` from a shared repo

3. **Apply the update locally:**
   - Replace your project files with the new version (keep `.env.local` and your customizations to logo, prices, etc.)
   - Run `npm install` to update dependencies
   - Run `npm run dev` and test locally

4. **Deploy to production:**
   ```
   git add .
   git commit -m "Update to v1.X"
   git push
   ```
   Vercel auto-redeploys.

5. **Test on production:** verify nothing broke.

---

## Installing Claude Code

This is the assistant referred to at the top of this guide, in *"Optional: let
an AI assistant do most of the setup for you"*. Install it first, then paste the
main prompt from that section — or from `INSTALL-PROMPT.md`, the separate file
in this folder that contains nothing but that prompt.

1. Go to **https://claude.com/claude-code**
2. Click **"Get started"** and follow the installation instructions:
   - **Mac/Linux:** open Terminal and run `curl -fsSL https://claude.ai/install.sh | bash`
   - **Windows:** download the installer from the site
3. Open Terminal and go to your project folder — the one containing this
   `README.md` file. For example: `cd ~/Downloads/galleroo`
4. Type **`claude`** and press Enter
5. The first time, it asks you to sign in to your Anthropic account. Follow the
   prompts. Claude Code needs a paid Claude plan or API credit.
6. Paste the main prompt and let it work.

> Claude Code asks your permission before each command. Read what it is about to
> do and approve only what you understand. If it asks for a password, say no —
> nothing in this installation requires you to give it one.

### One more prompt: changing the price

The app ships at €89 per year. To change the amount or the currency, run this
after the site is live:

```text
Change the price from €89 to $X (put your own number here) everywhere it
appears in this project:
- app/api/stripe/checkout/route.ts — unit_amount and currency. Note that
  unit_amount is in cents, so $99 is 9900.
- app/page.tsx
- app/subscribe/page.tsx
- components/dashboard/NewGalleryForm.tsx — including the struck-through €199
  "was" price and its -55% badge, which both need recalculating
- app/dashboard/admin/page.tsx — the ANNUAL_PRICE constant, which is what the
  admin revenue figures are calculated from

Keep mode: "payment". Do NOT convert it to mode: "subscription" — the webhook
at app/api/stripe/webhook/route.ts has no renewal handling, so renewals would
silently stop working and customers would lose access without any error.

Then run npm run build, update nothing in .env, and redeploy.
```

---

**That's everything.** If you've made it this far and your final checklist is green — congratulations, you're running a SaaS business. 🚀

Good luck!
#   p h o t o d r i v e  
 