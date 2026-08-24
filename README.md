# ZenDocz

A privacy-first, offline-capable notes app with two ways to use it — free forever on your own device, or synced everywhere with a free cloud account. This package contains two identical builds of the same app:

- `single-file/` — everything in one `index.html`. Drop it anywhere and it works.
- `modular/` — the same app split into `index.html` + `styles.css` + `app.js` + `vendor/qrcode.js`, for teams who want normal file-by-file diffs and editing.

Both are fully functional, feature-identical, and installable as a PWA (Add to Home Screen / desktop install icon). `manifest.json` and `sw.js` are included in both.

## What changed in this pass

- Rebranded ZenDocs → **ZenDocz** throughout (title, manifest, service worker, in-app strings, exported file names).
- Removed roughly 1,500 lines of dead/commented-out legacy code (old superseded feature versions the app had accumulated over many revisions) and verified the app still parses and runs cleanly afterward.
- Fixed a real theme-flash bug: dark/light mode is now applied to the page *before* anything paints (a blocking script at the very top of `<head>`), instead of only after the ~20,000-line app script finished running. The auth/login screen and dashboard chrome no longer flash the wrong theme for a frame.
- Fixed a second, unrelated dark-mode bug: "Auto day/night theme" (a feature that silently retheme's the app based on real sunrise/sunset) could fire its full-screen transition animation on the welcome/sign-in screen, before anyone had even opened the app. It's now (a) off by default for new installs, and (b) physically incapable of firing before someone has actually signed in / entered Local mode.
- Found and fixed a genuine pre-existing bug in the off-thread search feature: a `\n` inside a Web Worker's source template literal was being converted to a real newline character before the worker ever parsed it, corrupting a regular expression and silently crashing the worker (search still worked, just always fell back to the slower on-thread path). Escaped correctly now.
- Added a **new welcome / storage-mode screen** as the true first screen of the app — "On this device" vs "Sync everywhere" — replacing the old direct-to-sign-in flow.
- Added a genuine **Local ("On this device") storage mode**: a from-scratch, Firestore-API-compatible engine backed by IndexedDB, so the entire existing feature set (notes, folders, tags, templates, kanban, canvas, trackers, the encrypted vault, trash, comments) works completely unchanged with zero network and zero account. Optionally, on Chrome/Edge/Opera desktop, it can also mirror every note as a real, human-readable JSON file inside a folder you pick ("File System Access" API) — with a graceful IndexedDB-only fallback everywhere else (Firefox, Safari, all mobile browsers).
- The existing **Export / Import backup** feature (JSON) now works identically in both modes — it's the universal way to move a whole vault to a new device or browser, regardless of storage mode.
- Added genuine **online/offline detection** (`navigator.onLine` + events) for Cloud mode, on top of the existing manual "pause sync" toggle — Local mode is exempt entirely since it never needs the network.
- Added a **Settings panel** (new) surfacing storage mode, folder mirror connect/disconnect, backup export/import, plan/billing status, and sign-out — previously scattered or missing entirely.
- Added an **optional, feature-flagged monetization module** for Cloud accounts only (Local mode is always free, unconditionally): a trial timer, a paywall with a UPI payment link + generated QR code (rendered fully offline by a vendored, MIT-licensed QR library — no third-party service call), a bank-transfer details block, and a manual "I've paid, here's my reference number" claim flow. See **Billing setup** below — this ships **disabled**.
- Sharing/collaboration correctly remains a Cloud-only feature (it inherently needs a shared backend) and now says so clearly instead of silently failing in Local mode.
- General responsiveness pass across mobile / tablet / desktop widths (verified with real browser screenshots, not just code review).

## Before you deploy

### 1. Firebase config — sensitive-ish, handle with care
`firebaseConfig` (near the top of the app script) is a **client-side Firebase web config**. Google's own docs say this is fine to ship in client code — it's not a secret key — but it *is* a real pointer to your project, so:
- Don't reuse this exact config for an unrelated project.
- Before going live, lock the API key down to your own domain(s) in the Firebase console (APIs & Services → Credentials → key restrictions), and make sure your **Firestore Security Rules** actually enforce per-user access (`users/{uid}` readable/writable only by `uid`, `shared_docs/{id}` readable by anyone but only writable by the owner). This app assumes those rules exist; it doesn't ship them, since your existing project already has data under this config.

### 2. Billing / monetization — OFF by default, and contains placeholders
Search the app for `ZD_MONETIZATION` (single file: one `const` block near the top of the script; modular: same, near the top of `app.js`). Every payment-related field is a placeholder:

- `upi.id`, `upi.payeeName` — **your real UPI ID.** Sensitive — this is a real payment destination.
- `bank.accountName`, `bank.accountNumber`, `bank.ifsc`, `bank.bankName` — **your real bank details.** Sensitive for the same reason. Treat this file with the same care you'd give any document containing your bank account number.
- `adminEmails`, `supportEmail`, `priceLabel` — cosmetic/config, not sensitive.
- `enabled: false` — the whole paywall is inert until you flip this to `true`. Nothing about Local mode is ever affected by this flag.

**How "payment verification" actually works here:** this is intentionally *not* a payment-gateway integration — there's no per-transaction fee and no third party sits between you and your customer, exactly as asked. A customer pays you directly (UPI / bank transfer / whatever you list) and submits their transaction reference in-app; that reference is written to `users/{uid}.billing.paymentClaims` in Firestore. **You verify it manually** and flip that user to Pro by setting `users/{uid}.billing.plan = "pro"` in the Firebase console. This is a deliberate, honest trade-off: a fully automated *and* third-party-free verification isn't really possible (automated verification is what payment gateways exist to do). The alternative — letting a signed-in client write `plan: "pro"` on its own account — would be trivial for anyone to fake, so the app doesn't offer that shortcut.

### 3. Local mode browser support
The optional "also save as files in a folder I choose" feature uses the File System Access API, currently supported in Chrome, Edge, and Opera on desktop only. Everywhere else (Firefox, Safari, all mobile browsers), Local mode still works completely — notes are stored in IndexedDB — just without the extra folder mirror. The universal Export/Import (JSON) always works everywhere and is the recommended way to move notes to a new device regardless of browser.

### 4. Deploying
Either build is 100% static — no server/build step required. Push either folder to a GitHub repo and serve it with GitHub Pages, Vercel, Netlify, or Cloudflare Pages. Make sure `manifest.json`'s `start_url`/`scope` and the service-worker registration path match wherever you host it (both currently assume the app lives at the root of its domain, i.e. `./`).

## Known scope boundaries (so expectations are accurate)

This was a large, focused engineering pass on the areas you called out specifically — branding, the two storage modes, the login/loading theme bug, offline behavior, and monetization scaffolding — done as a careful refactor of your existing ~20,000-line app rather than a ground-up rewrite, to avoid breaking the large feature set you'd already built (kanban board, calendar, canvas/graph view, encrypted vault, CV builder, study/deep-think modes, habit trackers, meeting transcription, and more all continue to work, now storage-mode-agnostic). Those individual feature modules were not each independently re-audited line-by-line in this pass. If you want a deeper pass on any specific one of them, that's a good next request.
