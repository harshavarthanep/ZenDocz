# ZenDocz

A privacy-first, offline-capable notes app. Free forever on your own device, or synced everywhere with a free cloud account.

This build is a **production-hardening pass** over the previous one. The headline change: **the app no longer loses your work.** Three separate paths that silently destroyed unsaved edits have been fixed, and a crash-recovery journal now stands behind every keystroke.

## Files in this package

| File | Notes |
|---|---|
| `index.html` | The whole app. |
| `sw.js` | Service worker (v6). |
| `manifest.json` | PWA manifest. |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` | **New — these were referenced but missing, which broke both the PWA install prompt and the offline cache.** |

Drop all of them in the root of your GitHub Pages repo. No build step.

---

## What was fixed

### The data-loss bugs (the reason you asked)

**1. Typing into a note while another note was still saving destroyed what you typed.**
This is the "the note I had open lost its text" bug. After a save finished, the code re-read whatever was in the editor *at that moment* and marked it as saved — but by then you had often switched notes and started typing in a new one. Those new keystrokes were fingerprinted as "already saved" and never written. The status pill said **Saved**. The text was gone on reload, with nothing to restore from.

A save is now bound to a **snapshot** captured synchronously at the moment it starts: which note, and exactly what text. When the write completes, only *that* content is marked saved, and only if the editor still holds it. Anything typed in the meantime is saved next.

**2. Deleting a note threw away everything typed in the seconds before.**
"Move to trash" copied the note from the last version the server had sent back, not from the editor. Recent edits went into neither the live note nor the trash copy — not recoverable, even from Trash. It now copies the live editor.

**3. Nothing survived a crash.**
There was no local journal at all. If the tab died, the battery ran out, or a save failed, unsaved text simply ceased to exist.

Every edit is now written to an on-device **write-ahead journal** within ~400ms — long before any network call. An entry is deleted only once the identical content is confirmed saved. On next launch, anything left over is compared against what the database actually holds, and genuine losses are offered back:

> **Unsaved work recovered** — ZenDocz found edits on this device that never reached your notes.
> *Restore all* / *Keep saved versions* (the unsaved copies go to Trash rather than being destroyed)

Choosing "keep saved versions" never destroys anything — the recovered text is parked in Trash for 30 days.

**4. Related fixes in the same area**
- A failed save used to retry *whatever note was open 4 seconds later*, so the note that actually failed was never retried. Retries are now bound to the failed snapshot, with exponential backoff, and survive note switches.
- Offline edits were held in memory only and lost on refresh. They now go to the journal and sync when you reconnect.
- A save that landed after you deleted a note **recreated the note you had just deleted**. It no longer can.
- The realtime listener could repaint the editor over unsaved local edits whenever a save was slow, queued, or offline.
- On a shared note, the listener repainted mid-keystroke and wrote the overwrite back — destroying what you were typing with no warning.
- Resolving a comment sent *only* the note body, then marked the title, star, folder and margins as saved too. A rename made in the same moment was lost permanently and no later save could detect it.
- Trash's 30-day auto-purge treated a missing date as "1970" and **permanently deleted that note the instant you opened Trash**, with no confirmation. It now repairs the date instead.
- Opening a note with damaged content left the app pointing at the new note while still showing the old note's text — the next keystroke wrote one over the other. Opening is now all-or-nothing.
- Renaming a note to a name already in use silently reverted the rename; two competing handlers cancelled each other out. The auto-numbering ("Name (2)") now actually happens.

### Crashes and robustness

- **Global error boundary.** One broken feature can no longer take down the app or block saving. Errors are logged (`zdErrorLog()` in the console shows the last 30), shown once, and the editor is verified still writable afterwards.
- **Isolated startup.** The six startup steps ran as bare sequential statements; one throw meant theme, sidebar, accent colour and search all silently failed to restore. Each is isolated now.
- **Boot guard.** If Quill or Firebase fails to load, you used to get a blank white page. You now get an explanation and a retry button.
- **Escape key crashed the app repeatedly.** Four Escape handlers referenced modals that later patch layers delete at runtime, so every Escape press threw. Fixed.
- **The font-size box crashed on every click outside the editor** (it read the selection without checking it existed).
- **The guided tour crashed in a loop** when its markup was absent.
- Voice capture leaked microphone streams: speech recognition restarts itself about once a minute, and a slow permission grant could orphan the previous stream, leaving the mic indicator lit for the rest of the session.

### Security & privacy

- **Stored injection in the Vault viewer (removed).** A secret containing a `"` broke out of an inline `onclick` and ran as HTML, with access to the in-memory decryption key. That whole feature was already dead code (see below), so it is gone.
- **Location is now opt-in.** The weather backdrop is on by default and used to request precise GPS — and failing that, post your IP to two third-party lookup services — automatically, before you had done anything. In a private notes app that is the wrong default. It now asks once, when you open the weather panel, and explains where the data goes. Declining changes nothing else.
- Backup import validated almost nothing. A malformed file could create notes Quill cannot render and notes invisible in the Matrix view. Shapes are validated and there is an 80 MB guard.
- CSV import used `forEach(async …)`, so rows were fired off unawaited, the success count was reported before anything was written, and failed rows vanished silently.

### PWA / offline

- **The missing icons broke everything downstream.** `sw.js` precached with `addAll()`, which is all-or-nothing, so the 404 on `icon-192.png` silently failed the *entire* install-time cache — the app never had an offline shell. The same missing icons could stop Chrome firing the install prompt. Real icons now ship, and the worker caches files individually so one missing file can't take down the rest.
- **Offline never really worked.** The old worker skipped every cross-origin request, so with no network the page loaded with no styling and no editor. The app's runtime (Tailwind, Quill, Firebase SDK, fonts) is now cached. Firestore's live data channels are still deliberately excluded.
- The offline fallback returned the app's HTML for *any* failed request, so a missing image resolved to a page of HTML. Now limited to real navigations.
- The cache grew without limit; runtime entries are capped and trimmed.
- A new deploy silently took over open tabs. You now get a "new version — reload when convenient" notice, and it never reloads while you have unsaved work.

### Layout: desktop, tablet, mobile, foldable

Verified with real browser screenshots at 280 / 320 / 375 / 390 / 540 / 740×360 / 768 / 820 / 850 / 1024 / 1280 / 1920.

- **The page could be dragged sideways at every single screen size.** The splash screen animates out to `scale(1.07)` and stayed there forever behind the app. It is now retired from the layout once it fades. Horizontal overflow is 0 everywhere.
- **Two panels were wider than a phone.** The reference panel (350px) and Deep Think panel (290px) had no mobile sizing at all and pushed content off-screen on every phone. They now cap to the screen and slide with a transform instead of stretching the document.
- **The sidebar could start hidden on a desktop.** `.sidebar-closed` and Tailwind's `md:transform-none` have identical specificity, so which one won depended on whether the Tailwind CDN had finished loading. Settled explicitly.
- **Foldables.** Nothing in the app went below 360px; a Galaxy Fold cover screen is 280. Grids with fixed minimum tracks forced sideways scrolling. Added ≤400px and ≤340px handling, plus real `viewport-segments` support for hinged devices.
- **The 768–850px dead band.** Tailwind switches at 768px, the app's own CSS at 850px. Between the two, a hard-coded 794px ruler shell sat next to an expanded sidebar and squeezed the page.
- `100vh` → `100dvh` where the mobile address bar was causing jumps.
- **Notch support was inert.** Seven rules used `env(safe-area-inset-*)`, but without `viewport-fit=cover` those always resolve to `0`. Enabled it — and added the top/left insets the header and sidebar needed, so enabling it doesn't push them under the status bar.
- **Pinch-zoom re-enabled.** `user-scalable=no` was an accessibility failure; the iOS focus-zoom it was avoiding is handled properly with a 16px input rule instead.
- Touch targets grown to a 40px minimum hit area on coarse pointers (most icon buttons were 26–32px), without changing how anything looks.
- Added visible keyboard focus rings, `prefers-reduced-motion` support, and a print stylesheet.

### Weight and dead code

- **Quill was shipping unminified** — `quill.js` (437 KB) instead of `quill.min.js` (215 KB). Same library. **–222 KB on every first load.**
- **The Vault and Web Clipper were dead.** Later patch layers delete their markup, strip their menu entries and remove them from the feature list at runtime — but ~180 lines of their JavaScript stayed, including the XSS above. Removed. *(If you ever stored Vault secrets, the ciphertext is still in Firestore under `users/{uid}/vault` — nothing was deleted from your data. It has been unreachable from the UI since the Locked Notes feature replaced it, well before this pass.)*
- **~90 lines of superseded CSS removed** (V6.0's grid header and rounding pass, and one generation of the sidebar views row — each fully overridden by V6.1/V6.2). This was verified, not assumed: the app was rendered before and after across 6 views × 3 viewports and all 18 comparisons came out **pixel-identical**.
- Two dead menu entries that were injected and then removed again a few hundred lines later.

---

## Before you deploy

### 1. Firebase config — sensitive-ish, handle with care
`firebaseConfig` (near the top of the app script) is a **client-side Firebase web config**. Google's own docs say this is fine to ship in client code — it is not a secret key — but it *is* a real pointer to your project:

- Don't reuse this exact config for an unrelated project.
- Lock the API key to your own domain(s) in the Firebase console (APIs & Services → Credentials → key restrictions).
- Make sure your **Firestore Security Rules** actually enforce per-user access (`users/{uid}` readable/writable only by `uid`; `shared_docs/{id}` readable by anyone but writable only by the owner). The app assumes those rules exist.

### 2. Billing / monetization — OFF by default, contains placeholders
Search for `ZD_MONETIZATION` near the top of the script. Every payment field is a placeholder:

- `upi.id`, `upi.payeeName` — **your real UPI ID. Sensitive — a real payment destination.**
- `bank.accountName`, `bank.accountNumber`, `bank.ifsc`, `bank.bankName` — **your real bank details. Sensitive.** Treat this file with the care you'd give any document containing your bank account number.
- `adminEmails`, `supportEmail`, `priceLabel` — cosmetic.
- `enabled: false` — the paywall is inert until you flip this. Local mode is never affected.

**How verification works:** deliberately not a payment-gateway integration, so there is no per-transaction fee and no third party between you and your customer. A customer pays you directly and submits their reference in-app; it lands in `users/{uid}.billing.paymentClaims`. **You verify manually** and set `users/{uid}.billing.plan = "pro"` in the Firebase console. Fully automated *and* third-party-free verification is not really possible — letting the client write `plan: "pro"` itself would be trivial to fake, so the app doesn't offer that shortcut.

### 3. Local mode browser support
"Also save as files in a folder I choose" uses the File System Access API — Chrome, Edge and Opera on desktop. Everywhere else Local mode still works fully (IndexedDB), just without the folder mirror. Export/Import (JSON) works everywhere.

**Known gap, not yet fixed:** a folder handle's permission usually reverts after a browser restart, and the app only *checks* the permission rather than re-requesting it. Settings will keep saying "Connected" while nothing is actually being written to disk. Don't rely on that folder as your only backup — use Export.

### 4. Deploying
Static. Push these files to a GitHub repo and serve with GitHub Pages, Vercel, Netlify or Cloudflare Pages. `manifest.json`'s `start_url`/`scope` and the service-worker path assume the app is at the root of its domain (`./`).

---

## Recommended next steps

Not done here because they carry more regression risk than a hardening pass should:

1. **Replace the Tailwind Play CDN with a precompiled stylesheet.** It's ~400 KB and compiles CSS in the browser on every single load. A prebuilt file is about 40 KB and removes the flash of unstyled content. Biggest remaining performance win by a wide margin. *(`npx tailwindcss -i in.css -o tailwind.css --minify` with the config already in `<head>`, then replace the script tag — but check that no class names are assembled dynamically at runtime first.)*
2. **Defer the Firebase SDK in Local mode.** Local-mode users download ~500 KB of Firebase they never use. Not trivial: `firebase.firestore.FieldValue` sentinels are used throughout, including by the local engine.
3. **One z-index scale.** Roughly ten pairs of unrelated modals share the same z-index by accident.
4. **Per-path write queue in the local engine.** Two overlapping writes to the same note in Local mode still race at the IndexedDB layer — much narrower than the bugs fixed above, but real.
5. **Batches in the local engine aren't atomic.** A batch that fails partway leaves some operations applied, unlike real Firestore. Currently only reachable via folder deletion.

## Scope note

This pass focused on data integrity, crash resistance, layout across devices, and the PWA. The large feature set (kanban, calendar, canvas, graph view, trackers, CV builder, study mode, meeting transcription, Ask-your-notes, and the rest) was smoke-tested — every view opens, renders and closes cleanly with no console errors — but each module was not independently re-audited line by line. If you want a deep pass on a specific one, that's a good next request.
