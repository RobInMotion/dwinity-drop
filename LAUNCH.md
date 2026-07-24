# Dead Drop — Go-Live Runbook

Stand: 2026-07-23. Die Seite hängt aktuell hinter dem geschlossenen-Testing-Gate
(nur mit Key-Cookie erreichbar). „Live gehen" = das Gate öffnen. Alles unten ist geprüft.

> **Wichtig:** Live-Gang macht die Seite öffentlich, aber sie läuft weiter auf
> **Avalanche Fuji Testnetz mit mDWIN (Test-Token)** — kein echtes Geld. Der Umzug auf
> Mainnet + echtes DWIN passiert bewusst erst NACH dem externen Smart-Contract-Audit
> („kein Audit, kein Mainnet"). Ein öffentlicher Testnetz-Launch/Beta ist davon unabhängig.

## Readiness-Check (2026-07-23 — alles ✅)

| Punkt | Status |
|---|---|
| Alle 6 Backend-Services aktiv **+ enabled** (Autostart bei Reboot) | ✅ |
| SSL-Zertifikat gültig bis Sep 2026, certbot Auto-Renewal aktiv | ✅ |
| nginx-Config valide (`nginx -t` erfolgreich) | ✅ |
| Legal-Seiten (Impressum, Datenschutz) vorhanden + immer erreichbar (Gate-Ausnahme) | ✅ |
| SEO: robots.txt sinnvoll, sitemap.xml komplett (`/`, `/vault`, `/marketplace`, `/rewards`, Legal), Meta/OG auf Startseite | ✅ |
| noindex korrekt verteilt (App-/Privat-Seiten noindex, Marketing indexierbar) | ✅ |
| Fehlerseite (404.html) vorhanden | ✅ |
| Tägliche Backups (`dwinity-drop-backup.timer`) aktiv | ✅ |
| Voller Produkt-Loop gebaut + auditiert (Drop · Chat · Vault · Marktplatz inkl. Kauf) | ✅ |

## Gate öffnen (Go-Live) — Schritt für Schritt

1. **Pre-Flight** (kurz bestätigen, dass grün):
   ```
   systemctl is-active dwinity-identity-api dwinity-drop-api dwinity-chat-api dwinity-waitlist-api dwinity-vault-api
   sudo nginx -t
   ```
2. **Gate öffnen** — in `/etc/nginx/conf.d/deaddrop-gate.conf` im `map $cookie_dd_preview $dd_ok`-Block
   die Zeile `default 0;` auf `default 1;` ändern, dann:
   ```
   sudo nginx -t && sudo systemctl reload nginx
   ```
   Ab jetzt sehen ALLE Besucher (auch ohne Key-Cookie) die echte Seite statt coming-soon.
3. **Live verifizieren** — in einem **Inkognito-Fenster** (kein Cookie) öffnen:
   - `deaddrop.digital` → echte Startseite (nicht mehr „sealed")
   - `/vault`, `/marketplace`, `/rewards` laden
   - Wallet-Login funktioniert
4. **Rollback** (falls doch was hakt) — sofort wieder versiegeln:
   `default 1;` zurück auf `default 0;`, dann `sudo nginx -t && sudo systemctl reload nginx`.

## Direkt nach dem Launch (optional, nicht blockierend)

- **Google Search Console:** `https://deaddrop.digital/sitemap.xml` einreichen → Indexierung anstoßen.
- **DEMO_MODE:** steht auf `1` (`/etc/dwinity/vault.env`). Der Demo-Kauf-Endpunkt ist admin-gated,
  also sicher — kann für den Launch auf `0` (vault-api neu starten), muss aber nicht.
- **Monitoring:** ntfy-Server-Alerts sind eingerichtet — im Blick behalten.
- **Waitlist:** bleibt nutzbar; die coming-soon-Seite ist nach dem Öffnen irrelevant (kein Besucher landet mehr dort).
