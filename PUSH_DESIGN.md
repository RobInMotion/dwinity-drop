# Web Push Notifications — Design & Build Plan

Stand: 2026-07-23. Nutzer-Push für deaddrop (Benachrichtigung auch bei geschlossenem Tab).
Android/Desktop nativ; iPhone via „zum Home-Bildschirm hinzufügen" (Hinweis). Robin bestätigt:
zentral in identity-api, generischer Inhalt, Umfang = Fundament + Chat + Marktplatz.

## Kern-Entscheidungen (mit Robin festgelegt)
- **Generischer Inhalt** — kein Raumname/Absender/Betrag im Push (Zero-Knowledge). Chat-Inhalt
  ist ohnehin E2E-verschlüsselt und dem Server unbekannt.
- **Chat-Push nur an Mitglieder, die NICHT gerade per SSE im Raum sind** (nicht nerven beim Lesen);
  nie an den Absender.
- **Zentral in identity-api**: Abo-Tabelle + VAPID-Schlüssel + Sende-Funktion an EINER Stelle.
  Chat-/Vault-Dienst rufen nur einen internen „send"-Endpunkt (localhost-only).

## Architektur / Komponenten
1. **VAPID-Schlüssel** — einmalig erzeugt; privater Key in identity-Env, öffentlicher Key an Clients.
2. **Abo-Speicher** — Tabelle `push_subscriptions` (identity.db): wallet, endpoint (UNIQUE), p256dh, auth, ua, created_at.
3. **identity-API-Endpunkte**:
   - `GET /api/push/vapid-key` → { key } (öffentlicher Key).
   - `POST /api/push/subscribe` (Session-Auth) → Abo für die Wallet speichern (upsert auf endpoint).
   - `POST /api/push/unsubscribe` (Session-Auth) → Abo löschen.
   - `POST /internal/push/send` (**nur localhost**, kein nginx-Route) `{wallet, title, body, url, tag}`
     → alle Abos der Wallet holen, Web Push senden (pywebpush + VAPID), tote Abos (404/410) löschen.
4. **Service Worker** `push-sw.js` (Root) — `push`-Event → generische Notification; `notificationclick` → Ziel-URL fokussieren/öffnen. (CSP `worker-src 'self'` ist schon erlaubt.)
5. **Client** `push.js` — „Benachrichtigungen aktivieren"-Schalter: Permission → `PushManager.subscribe(vapidKey)` → Abo POSTen. iPhone-ohne-Installation erkannt → „zum Home-Bildschirm hinzufügen"-Hinweis statt Fehler. Zustand merken.
6. **Auslöser**:
   - **chat-api** (POST message, nach Speichern + SSE-Broadcast): für jedes Raum-Mitglied ≠ Absender OHNE aktive SSE-Verbindung → identity `/internal/push/send {wallet, "Dead Drop · Neue Nachricht", url:/chat/r/<id>}`. (URL ohne #key — Client hat den Key aus früherem Besuch in localStorage.)
   - **vault-api** (Grant-Indexer `index_access_grants.py`, nachdem der `purchase_ready`-Inbox-Eintrag erstellt ist): → identity `/internal/push/send {wallet:käufer, "Dein Daten-Aggregat ist bereit", url:/dashboard}`.

## Datenfluss
Aktivieren → Browser-Abo → POST → gespeichert je Wallet. Ereignis → Dienst ruft internen send →
identity holt Abos → Web Push → SW zeigt Notification → Klick öffnet Ziel.

## Abhängigkeiten
- `pywebpush` (+ `py-vapid` für Keygen) im identity-venv. Prüfen/installieren.
- Service Worker same-origin (CSP ok). `push-sw.js` an Web-Root, muss mit passendem Scope ausgeliefert werden.

## Fehlerbehandlung
- Tote Abos (410/404) beim Senden löschen. Permission verweigert → sanfter „später aktivierbar"-Zustand.
- Sende-Fehler geloggt, **nie** den Chat-/Kauf-Flow blockieren (best-effort, im try/except).
- Interner send-Endpunkt localhost-gebunden; nicht über nginx exponiert.

## Tests
- Unit: VAPID-Key vorhanden; subscribe/unsubscribe speichern korrekt; send löscht tote Abos.
- Manuell: Chrome-Desktop aktivieren → Test-Push → erscheint → Klick öffnet Ziel. Chat: 2 Wallets, eine offline, Nachricht → offline-Wallet bekommt Push. Marktplatz: Trigger-Aufruf unit-verifiziert (Live erst wenn Pool ≥5).

## Nicht im ersten Bau (Follow-up)
DWIN-Belohnungs-Push · Betreiber-Alerts (ntfy) · Benachrichtigungs-Einstellungen-UI · Badge-Zähler.

---
## STATUS: GEBAUT 2026-07-23 (Fundament + Chat + Marktplatz)
- VAPID-Keys erzeugt (privat: /etc/dwinity/vapid_private.pem 640 root:www-data; public + Config in identity.env).
- identity-api: Tabelle `push_subscriptions`, Endpunkte `GET/POST /api/identity/push/{vapid-key,subscribe,unsubscribe}` + `POST /internal/push/send` (localhost-only, extern 404). `send_push_to_wallet()` via pywebpush, prunt tote Abos.
- Frontend: `push-sw.js` (Service Worker) + `push.js` (window.DDPush + Auto-Wiring von `[data-push-toggle]`/`[data-push-status]`, iOS-Hinweis). Schalter auf chat-index (Room-Liste). i18n DE/EN (push.*).
- Auslöser: chat-api (neue Nachricht → Push an Offline-Mitglieder via Online-Presence-Tracking) · vault-api Grant-Indexer (Käufer-Push „Aggregat bereit").
- **Verifiziert:** alle Endpunkte leben, interner Send ok, nginx-Isolation ok, Syntax grün. **NICHT selbst testbar:** echte Push-Zustellung (braucht Browser + echtes Abo).
- **Follow-ups:** Push-Text ist aktuell DE-generisch (pro-Nutzer-Sprache = Abo-`lang` speichern, später) · DWIN-Belohnungs-Push · Betreiber-Alerts (B, ntfy) · Web-Manifest (start_url "/") für saubere Home-Screen-App.
