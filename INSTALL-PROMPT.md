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
