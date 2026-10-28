# Photobooth Upgrade Report — 2026-10-28

Branch: `upgrade/production-hardening` (uncommitted changes on top of `1cda6ee`).
Scope: full audit of ticket desk (laptop), booth (Pi 4 2 GB + Camera Module 3 Wide), editing station (iPad),
the Express server, and the Pi camera service, followed by fixes and negative testing.

---

## 0. Do these first (you, not code)

1. **Rotate the Razorpay keys.** The live key secret was hard-coded in `server/routes/payments.ts` and is in
   the GitHub history of `github.com/puraaaab/photobooth`. Anyone with the repo can create/inspect orders and
   forge payment signatures. Generate new keys, put them only in `.env`. If the repo is public, make it private
   (removing the file from history is not enough once it has been seen).
2. Set `STAFF_PIN` in `.env` (or read the generated one in `data/staff-pin.txt`) and tell only attendants.
3. Change the admin PIN from `1234` on every device (Admin panel → Security).
4. Run production mode at events: `npm run build` then `npm start` (one port, 3847). The Pi kiosk script now
   points there instead of the Vite dev server.

---

## 1. Bugs & vulnerabilities found and fixed

Verified with a 52-case negative test suite. Run against the original code, 37 of 48 applicable checks failed.
Two attacks were reproduced end-to-end on the old code: copying the real `.env` (with the Razorpay secret)
into a web-served folder, and writing a file outside the data directory.

### Critical — security
| # | Issue | Where | Fix |
|---|---|---|---|
| 1 | Live Razorpay secret hard-coded as fallback (and in client) | `server/routes/payments.ts`, `src/utils/razorpay.ts` | Keys only from env; payments disabled if missing |
| 2 | **Remote code execution**: ticket code from URL put into `exec("explorer ...")` | `POST /api/tickets/:code/open-folder` | 4-digit validation + `spawn` without shell + staff-only |
| 3 | **Arbitrary file write** via `../` in `sessionId`/`filename` | `POST /api/export/save-strip` | Strict id/filename validation, `safeJoin`, data-URL only |
| 4 | **Arbitrary file read**: `dataUrl` could be a local path, copied into a served folder | `vaultManager.saveStrip` | Disk copy only for internal callers |
| 5 | Path traversal via ticket code into vault dirs | `vaultManager.getTicketDir` | Rejects non 4-digit codes |
| 6 | `cors({origin: true})` — any internet website open on the laptop could call every API (incl. #2) | `server/index.ts` | Only localhost/private-LAN origins |
| 7 | No authorization anywhere: any device on the Wi-Fi could issue free tickets, mark PAID, wipe the queue, delete tickets, edit template source code, read revenue | all ticket routes | `requireStaff`: server machine or `X-Staff-Pin` (brute-force lockout) |
| 8 | Any non-empty `x-admin-auth` header listed every session | `GET /api/session` | Staff check |
| 9 | `/session/:id/update` could overwrite the upload token / ticket binding | `sessions.ts` | Server-owned fields stripped |

### Critical — money
| # | Issue | Fix |
|---|---|---|
| 10 | Razorpay amount chosen by the browser; `verify-payment` trusted the client's `ticketId`/`planType` → pay ₹1, get the ₹179 plan | Server price list; plan/ticket/amount read from the Razorpay order; constant-time signature check; replay guard |
| 11 | iPad upsell: guest taps "I HAVE PAID via UPI" / "Confirm cash" → plan upgraded and printed, no money | Attendant must enter staff PIN (checked by server) |
| 12 | Copies selector 1–10 with no plan check → ₹99 ticket printing 20 strips | Copies capped to what the plan covers |
| 13 | Print button could be pressed repeatedly | Reprints need staff PIN |
| 14 | A shot ticket (`EDITING`) could be re-entered at the booth → unlimited sessions per ticket | Server-enforced lifecycle + booth check |
| 15 | Rejected payment update fell back to "offline mode" and marked the ticket PAID locally anyway | Server refusal is final |

### High — reliability (things that break at a busy event)
| # | Issue | Fix |
|---|---|---|
| 16 | Pi booth leaked every captured photo blob (~30–60 MB/session) → Chromium on a 2 GB Pi dies after a few dozen guests | Blobs released after upload / next session |
| 17 | Camera preview loop torn down every second during countdown (inline callbacks in effect deps); webcam fallback stopped/restarted each tick → black flicker, missed shots | Callbacks held in refs |
| 18 | "X" during the shoot discarded all photos **and** left the ticket stuck `IN_BOOTH` forever | Finishes early and uploads; 0-photo tickets can be resumed |
| 19 | Booth crash mid-shoot → ticket `IN_BOOTH` → "already in a booth session", guest blocked | `IN_BOOTH` with 0 photos is resumable |
| 20 | Session-create failure invented a `local-…` id → every upload rejected, photos silently lost | Booth refuses to start and tells the guest to get staff |
| 21 | `session:created` broadcast made the **editing iPad drop the current guest's work** whenever the booth started the next guest | Only adopted when the editor is idle |
| 22 | Socket gave up after 5 reconnects → a 30 s Wi-Fi blip disconnected a station until reload | Infinite reconnection |
| 23 | QR download / email / SMS **never worked** in browser mode: nothing saved the strip on the server → 404 | Editor uploads the strip when sharing/printing |
| 24 | Pi offline → every proxied preview frame triggered a full /24 subnet scan | 15 s negative cache |
| 25 | Email/SMS worker could overlap itself → duplicate sends | Busy guard |
| 26 | `pi-setup/camera-server.js` crashed at startup (`ZOOM_ROI` undefined) | Fixed |
| 27 | Vault copy failure deleted the uploaded original and returned 500 | Vault errors no longer lose the photo |
| 28 | Malformed JSON → HTML stack trace; unknown `/api` → HTML | JSON errors |

### Photo quality — the camera was never used properly
The Camera Module 3 Wide is a 12 MP IMX708 with PDAF autofocus and sensor HDR. All three camera servers
(`pi-camera.py`, `pi-camera.js`, `camera-server.js`) "captured" by returning the latest **1280×720 MJPEG video
frame**, with the denoiser turned off (`cdn_off` → noisy skin in indoor light).

New `public/pi-camera.py` (picamera2, preinstalled on Pi OS Bookworm):
- Preview: 768×432 lores stream → Pi 4 **hardware** MJPEG encoder (much less CPU and Wi-Fi than 720p @ 35 fps polling).
- Stills: **2304×1296 from the sensor's 2×2 binned mode**: real ISP still output, 3.3× the pixels of before,
  lower noise, still fast enough for a shot every 2 s. Use `STILL_W=4608 STILL_H=2592` for 12 MP.
- Zoom via `ScalerCrop`: no camera restart and no black frames.
- `CAMERA_HDR=1` for backlit venues (sensor HDR, Camera Module 3 only).
- Falls back to the old rpicam-vid mode automatically. Same HTTP API, so nothing else changed.
- Tested against a mocked picamera2. **Still needs a test on the real Pi** (see §4).

For an A5 two-strip sheet, each photo slot is about 2.6″×1.75″ → ~780×525 px at 300 dpi. 2304×1296 gives ~3×
headroom for cropping and zoom, so full 12 MP isn't needed for strips.

### Performance
- Station-based code splitting: main bundle 1,387 KB → 778 KB; the Pi loads only +52 KB for the booth screen.
- Single-port production serving (`npm start`): no Vite dev server on event day.

---

## 2. Not fixed yet — prioritized roadmap

### P0 (before charging customers at scale)
1. **Move printing to the laptop.** The iPad prints with `window.print()` → the iOS AirPrint dialog, where the
   guest can still change the copy count, so #12/#13 are only partly closed. Build a server-side print queue:
   the iPad sends the rendered A5 sheet → the laptop prints silently (Windows: SumatraPDF `-print-to "<printer>"
   -silent`, or the printer's own CLI). That also gives you print history and accurate paper counts per ticket.
2. **Guest delivery that works off-Wi-Fi.** The QR points to `http://<laptop-ip>:3847/...`, so it only works if
   the guest's phone is on your Wi-Fi, which it usually isn't. Options:
   (a) upload strips to cloud storage (Cloudflare R2 / S3) and QR a short link;
   (b) WhatsApp delivery (WhatsApp Business API via Gupshup/Interakt/Twilio). Plain SMS to Indian numbers needs
   DLT registration, so Twilio SMS as currently written will mostly fail.
3. **Booth code guessing.** Codes are random 4-digit. With 20 people waiting, a random guess hits someone's
   paid ticket 1 time in 450, and there's no lockout at the booth. Add a lockout after 5 wrong codes per minute,
   or use a QR on the printed pass scanned by the Pi camera.
4. **Upload auth.** `X-Booth-Internal: true` still skips the per-session token on `/api/photos/upload`.
   Store the token in the booth/editor session and drop the header.

### P1 (product)
5. Pi kiosk hardening: overlayroot / read-only SD (power cuts corrupt SD cards), hardware watchdog, a
   systemd health check that restarts Chromium if `/health` stops updating, and a cooling case (sustained
   capture throttles a bare Pi 4).
6. Non-destructive filters: the Pi bakes the CSS filter and the mirror into the original JPEG. Keep originals
   clean and apply looks in the editor, so "Raw" is always recoverable. Make mirror-on-print a setting.
7. Operator dashboard: live throughput (guests/hour), average booth and editing times, printer paper/ink
   counters, revenue by payment method, and an end-of-day cash-vs-UPI reconciliation printout.
8. Privacy (DPDP Act 2023): phone numbers are sent to every station in the ticket list; show a consent line
   at the desk; auto-delete sessions/vault after N days (the cleanup route exists, so schedule it).
9. Tidy-up: `electron/` is a stale fork of `server/` (not wired to any script). `scripts/` holds ~70 one-off
   analysis scripts. `public/templates/backup_before_4200/` (369 MB) is copied into every build. Move it out:
   `mkdir archive; git mv public/templates/backup_before_4200 archive/`.

### P2 (growth)
10. Event mode: branded overlays per client (weddings/corporate), private gallery per event, client-uploaded logo.
11. GIF/boomerang from the burst. You already shoot ~45 frames; a looping GIF is a cheap digital upsell.
12. Admin-editable plans and prices instead of the `99/149/179` constants spread across ~8 files.

---

## 3. Pricing, paper and "dark patterns" — honest take

### Paper math with A5 two-up
One A5 sheet = exactly 2 strips. Your current plans:

| Plan | Strips | Printed on | Paper used | Waste |
|---|---|---|---|---|
| ₹99 | 2 | 1 × A5 | 1 A5 | 0 |
| ₹149 | 3 | A4 5-up | 1 A4 (= 2 A5) | **2 strip slots blank (40%)** |
| ₹179 | 5 | A4 5-up | 1 A4 | 0 |

The ₹149 plan and the "+₹49 for 3 strips" upsell are the paper-wasting ones. On A5 stock, sell **even**
strip counts so every sheet is full:

| Suggested | Strips | Sheets | Role |
|---|---|---|---|
| ₹99 | 2 | 1 A5 | entry |
| ₹169 | 4 | 2 A5 | **target** ("Most popular"; ₹42/strip vs ₹50) |
| ₹229 | 6 | 3 A5 | decoy/anchor for groups |
| +₹59 at editing station | +2 strips | +1 A5 | upsell: costs you ~₹10–15 in paper+ink |
| +₹39 digital pack | all originals + GIF via link | 0 | pure margin, no paper |

If 1 strip is designed on a 2-up plan, the code already auto-duplicates it onto the second half (no waste).
I didn't change prices in code. That's your call; tell me the final table and I'll update it everywhere.

### Which tactics are fine and which can get you in trouble
India's CCPA *Guidelines for Prevention and Regulation of Dark Patterns, 2023* name 13 banned patterns,
including **drip pricing**, **bait and switch**, **false urgency**, **basket sneaking**, **confirm shaming**,
**forced action** and **nagging**. Applied to this app:

- ✅ **Fine and effective:** decoy/anchor pricing ("BEST VALUE"), sensible defaults (pre-selecting the
  4-strip plan), bundles, showing the per-strip saving, a real "Most popular" label, and an upsell offered when
  the guest wants more.
- ⚠️ **Risky right now:** the flow lets guests *design* 3–5 strips with no price shown ("+ PRINT EXTRA STRIP"
  has no ₹), then blocks printing behind a payment modal. That is close to drip pricing / bait-and-switch, and
  in a photobooth it also produces the angry review "they held my photos hostage". Fix: show the price on the
  button at the moment the strip is added ("+ Extra strip · ₹59"). It converts as well and is defensible.
- ⚠️ Fake scarcity ("only 3 slots left today"), countdowns that reset, and "No thanks, I don't like memories"
  style decline buttons are explicitly listed. Don't add them.
- ✅ "Pay ₹39 to also get it on WhatsApp" at the moment of joy (right after the preview) is your highest-margin
  honest upsell.

---

## 4. How to verify on the real hardware

```bash
# On the Pi (once):
bash pi-setup/setup-kiosk-client.sh <laptop-ip>        # installs picamera2 + pi-camera.py service + kiosk
sudo systemctl restart photobooth-camera
curl localhost:8081/health      # expect "backend":"picamera2","still":"2304x1296"
curl -o t.jpg -X POST localhost:8081/capture && python3 -c "from PIL import Image;print(Image.open('t.jpg').size)"
journalctl -u photobooth-camera -n 50   # check for "Control … not supported" lines
```
On the laptop: `npm run build && npm start`, issue a ticket, shoot at the booth, edit and print on the iPad,
try the cash upgrade (should ask for the staff PIN), try re-entering the same code at the booth (should be
refused), scan the QR with a phone on the same Wi-Fi.

Negative test suite: `tests/negative.mjs` (`npm run test:negative`, server start command in the file header).

---

## 5. Round 2 — pricing, printing, payments, discovery (2026-10-28)

### Pricing (implemented)
| Plan | Strips | A5 sheets |
|---|---|---|
| ₹99 | 2 | 1 |
| ₹169 (default, "Most popular") | 4 | 2 |
| ₹229 ("Best value") | 6 | 3 |
| Editing-station add-on | +2 per sheet | **+₹79 per sheet** |

The add-on is ₹79, not the ₹59 from my first table. At ₹59, buying ₹99 and then adding a sheet (₹158) would
undercut the ₹169 plan, so nobody would pick it at the desk. The add-on has to cost more than the plan step (₹70).
To change it, edit `EXTRA_SHEET_PRICE` in `src/constants/pricing.ts`. That file feeds the desk, the iPad,
server validation and the Razorpay price allowlist. Old ₹149/₹179 tickets keep their 3/5-strip allowance.
The digital pack (+₹39) isn't sold yet: the QR download only works on the booth Wi-Fi, so it would sell
something guests can't reliably receive.

### Printing: iPad → existing laptop → Wi-Fi printer (no new hardware)
- The laptop talks **IPP** (the protocol behind AirPrint) to the printer over the same Wi-Fi, so the laptop can sit anywhere.
- The guest still taps Print on the iPad. No iOS dialog, `copies=1` is set by the server, A5 media is requested.
- **Server-side quota per ticket** (`data/print-ledger.json`): plan strips only, reprints need the staff PIN, unpaid tickets can't print.
- Formats: PDF (multi-page) → JPEG → **PWG raster** (own encoder). Your Brother HL-L2350DW turned out to accept
  only PWG/URF, so PWG raster is what makes "any AirPrint printer" true. The encoder is verified pixel-exact (`npm run test:pwg`).
- The printer is found automatically at startup. If its IP changes, the server looks for the same model again.
- Ticket desk → **Printer & devices** button: status, ink levels, search, test page.
- Not tested on a real printer (I didn't print on yours without asking). Do one **Print test page** from the panel.

### Automatic payment confirmation
| Where | Before | Now |
|---|---|---|
| Desk UPI | Static QR to personal UPI ID, operator taps "Received" | One-time Razorpay QR for the exact amount, **auto-confirms and issues the pass** |
| iPad upgrade UPI | Static QR + "I have paid" | Same auto QR; unlocks and prints on confirmation |
| Razorpay checkout | Confirmed only if the page stayed open | Also confirmed by the background reconciler |
| Cash | Manual | Manual (staff); a machine can't see cash |

Falls back to the old static QR + staff confirmation if Razorpay QR Codes isn't enabled on the account.
Not tested against live Razorpay. Test with **test-mode keys** (`rzp_test_…`) first; QR Codes may need enabling in the dashboard.
Gap: if the desk tab is closed after a guest pays a *new-ticket* QR, the payment is recorded
(`data/pending-payments.json`) but the ticket isn't issued automatically.

### Devices finding each other
- **Pi → laptop:** `find-server.sh` at every boot (last known → mDNS → subnet scan). A watchdog re-finds the
  laptop if it disappears for about 60 s and restarts Chromium if it crashes. No IP needed in setup.
- **Laptop → Pi:** the camera service announces itself every 10 s; background scan as fallback; requests never wait on a scan.
- **Booth page → camera:** `localhost` on the Pi itself. All hardcoded `192.168.29.x` addresses removed.
- **Laptop's own address** ignores virtual adapters (Hyper-V/WSL/VPN), which could otherwise put the wrong IP in QR codes.
- **iPad → laptop:** scan the QR in the Printer & devices panel.
- Still recommended: a **DHCP reservation** for the laptop on the venue router, or carry your own travel router so all
  devices are always on the same network. Venue Wi-Fi often has *client isolation*, which blocks devices from seeing
  each other; no software can get around that.
- Photo transfer (Pi → laptop) is unchanged: uploaded over Wi-Fi after the shoot, verified by count.

Tests: `tests/negative.mjs` (52), `tests/print.mjs` (14, fake printer), `tests/pwg-raster.test.ts`. Start
test servers with `PRINTER_AUTOSETUP=0` so they never adopt a real printer.

---

## 6. Final gap sweep — "more prints than paid for" (2026-10-28)

Every print, export, ticket and payment path was checked for ways to get output without paying for it.

| # | Gap | Fix |
|---|---|---|
| 1 | Preview "copies" popup (up to 10) had no price or plan check; its value carried into printing | Prices shown per option (included / +₹79 / +₹158 / ask staff); export screen re-checks at Print |
| 2 | Copies over the plan printed free | Paid unlock (same popup as extra strips); copies apply after payment |
| 3 | **AirPrint mode** relied on a per-screen flag: leaving and re-entering the export screen gave free reprints; no-ticket and unpaid prints passed | Server `/api/print/authorize` with the same per-ticket ledger as network printing; fails closed if the laptop is unreachable |
| 4 | SAVE JPEG/PDF exported full print sheets to the guest iPad (reprint from Photos/Files) | Staff PIN |
| 5 | Guests could switch paper layout / auto-duplicate (more physical strips, wrong paper) | Staff PIN |
| 6 | "+ PRINT EXTRA STRIP" had no price (drip pricing) | Button shows "+₹79" or "INCLUDED" |
| 7 | 4-digit ticket codes could be guessed endlessly | 6 wrong codes per device → 3-minute lockout (staff exempt) |
| 8 | Upgrade payments applied the plan the browser *claimed* | Plan derived from the amount actually paid (`planFromPayment`) |
| 9 | Desk QR paid but desk tab closed → money received, no pass | Server auto-issues the pass after 90 s (marked "Auto-issued") |
| 10 | Guest "free walk-in pass" (on by default) = free session; server refusal fell back to a fake local ticket | Off by default; a server refusal is never turned into a local ticket; desk shows errors |
| 11 | Booth blocked only unpaid *cash* tickets; server let any unpaid ticket enter the booth | Any unpaid ticket refused, on the booth and the server |
| 12 | Dormant Electron silent-print path skipped all checks | Uses the same server authorization |

Tests: `tests/negative.mjs` (56), `tests/print.mjs` (21, incl. AirPrint authorize), `tests/pwg-raster.test.ts`,
`tests/plan-from-payment.test.ts`.

**Still open, by design or needing hardware:**
- AirPrint mode: the iOS dialog's copy field can't be controlled from a web page. The server still counts every
  authorized print, so reprints and over-plan prints are blocked, but one dialog could print extra copies.
  **Network printing (printer found on the Wi-Fi) closes this completely.** Keep the printer on the same network.
- Existing iPads keep their saved walk-in setting (button may still show; it now just says to buy at the desk).
- The photo upload route still accepts the `X-Booth-Internal` header instead of the per-session token.
