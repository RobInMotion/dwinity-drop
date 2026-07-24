# Deaddrop — Wallet-Flash-Fix, Chat-Löschen, Optionale Usernamen

Datum: 2026-07-24 · Status: freigegeben (Robin), in Umsetzung

## A — Bug: „Connect Wallet" trotz Login

**Ursache:** `auth.js#refreshMe()` rendert bei *jedem* nicht-OK `/me`-Response
(inkl. Netz-/5xx-Aussetzer) sofort den ausgeloggten Zustand. `/me` liefert bei
fehlender Session aber **200 mit `address:null`** — ein non-OK ist also immer ein
Server-/Netzproblem, kein echtes „ausgeloggt".

**Fix:** Bei non-OK/Netzfehler einmal kurz nachfassen; wenn weiter fehlerhaft,
den bisherigen Button-Zustand **behalten** statt fälschlich auszuloggen. Nur ein
sauberes `200 {address:null}` rendert logged-out. Kein Backend-Change.

## C — Chat vorzeitig löschen (Owner)

Backend kann es bereits: `DELETE /api/chat/rooms/{id}` — nur `creator`, wischt
messages/members/bans/room. Fehlt nur Frontend:

1. **Button** (nur Creator, `roomMeta.is_creator`) „Chat löschen" mit Bestätigung
   („für alle unwiderruflich"). Erfolg → zurück zu `/chat`.
2. **Andere Teilnehmer:** wenn der Raum während des Pollings/SSE verschwindet
   (404/410), klar anzeigen „Dieser Chat wurde vom Ersteller beendet" und
   Polling/SSE sauber stoppen (aktuell: endlose Reconnect-Schleife ohne Hinweis).
3. DE/EN i18n-Keys.

## B — Optionaler, eindeutiger Username

**Regeln:** 3–20 Zeichen, `[a-zA-Z0-9_]`, case-insensitive eindeutig, jederzeit
änderbar. Kein Name gesetzt → Fallback auf kurze Adresse (nichts bricht).

**Backend (identity-api):**
- `wallets.username` (nullable) + eindeutiger, case-insensitiver Index.
- `POST /api/identity/username` `{username}` — authed, validiert, setzt/ändert
  (leer/`null` = entfernen). 409 bei Kollision, 400 bei Formatfehler.
- `POST /api/identity/usernames` `{addresses:[...]}` — public batch-resolve →
  `{addr: username}` (nur gesetzte). Für Chat & Leaderboard.
- `username` in `MeResponse` und in Leaderboard-Einträgen ergänzen.

**Frontend:**
- Wallet-Menü (auth.js): Eingabefeld „Anzeigename" mit Speichern; zeigt eigenen
  Namen; Button-Label nutzt Namen statt Adresse, wenn gesetzt.
- chat-room.js: Absender über batch-resolve als Name statt `shortAddr`.
- rank.js: Leaderboard-Einträge mit Namen (Fallback Adresse).

## Reihenfolge & Sicherheit

A → C → B. Python-APIs sind **nicht** in git und ohne Testframework: vor jeder
Änderung `.bak`-Kopie, Verifikation per curl gegen den laufenden Dienst,
`systemctl restart`. Frontend-Site ist git-getrackt.
