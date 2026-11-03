# AuraGuard

A calm, private migraine diary: one-tap attack timer, 5-step log wizard, live barometric pressure with 48-hour drop forecast, daily check-ins, personal trigger odds, medication effectiveness rankings, MIDAS & HIT-6 questionnaires, and a clinician-ready PDF / CSV report.

All diary data stays in `localStorage` on the user's device. There is no account, backend, analytics, or telemetry.

## Run locally

```sh
npm install
npm run dev
```

Checks:

```sh
npm run typecheck
npm run test
npm run build
```

## Pro tier (offline license keys)

Logging, history, basic insights, MIDAS/HIT-6, and the summary PDF are free forever. Every new install gets a 14-day trial of Pro (personal trigger odds, 48-hour pressure forecast, full clinician report + CSV).

Pro unlocks with an ECDSA-P256-signed license key verified offline in the browser:

1. Generate your signing key pair once (kept in `.keys/license-private.jwk`, git-ignored — back it up safely):
   ```sh
   npm run license:keys
   ```
   Paste the printed public JWK into `LICENSE_PUBLIC_JWK` in `src/lib/pro.ts`.
2. Issue a key for a buyer (omit `days` for a lifetime key):
   ```sh
   npm run license:issue -- buyer@example.com
   npm run license:issue -- buyer@example.com 365
   ```
3. Set `VITE_CHECKOUT_URL` (e.g. a Gumroad, Lemon Squeezy, or Stripe Payment Link) in `.env` before building so the "Get Pro" button opens your checkout.

## Branding

The display name is set in `APP_NAME` in `src/lib/brand.ts`, plus `<title>` in `index.html` and `name` in `public/manifest.webmanifest`.

## Publish

- **GitHub Pages:** `.github/workflows/deploy.yml` builds, tests, and deploys `dist/` on every push to `main` once Pages is set to *GitHub Actions* in the repo's Settings → Pages.
- **Android / Play Store:** the app ships with `manifest.webmanifest`, `sw.js`, and 192/512 maskable icons (`npm run icons`), so it installs directly from Chrome on Android and can be wrapped as a Trusted Web Activity (TWA) via Bubblewrap or PWABuilder.
