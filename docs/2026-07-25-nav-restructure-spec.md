# Spec — Navigation neu aufteilen (Struktur)

**Datum:** 2026-07-25
**Betrifft:** `nav.js`, `auth.js`, `i18n.js`, 9 Seiten mit `#site-nav`
**Status:** Design freigegeben, Umsetzung offen

Diese Spec deckt **nur die Struktur** ab — welcher Menüpunkt wo hingehört. Die
optische Überarbeitung der Leiste ist ein eigener, nachgelagerter Schritt.

---

## 1. Problem

Die heutige Leiste (Stand `nav.js`, 2026-07-24):

```
Logo · Drop · Chat · [nur "/": So funktioniert's · Vergleich · Preise] · Daten ▾
                                          ··· DE|EN · Guthaben · Wallet · [Dash]
```

Konkrete Mängel:

1. **`Daten ▾` ist ein Sammelbecken.** Sechs Einträge aus drei verschiedenen
   Themen: Tresor (Vault·Info, Vault-App), Erwerb (Markt, Umfragen), Belohnung
   (Rewards, Rang).
2. **Vault erscheint doppelt** — „Vault · Info" (`/vault`) und „Vault öffnen
   (App)" (`/vault.html`). Liest sich wie zwei Produkte.
3. **Der Markenname wechselt.** `data-brand="vault"` ersetzt „Dead Drop" durch
   „Dwinity Vault" auf `vault.html`, `surveys.html`, `vault-landing.html`. Für
   den Besucher fühlt sich das an, als hätte er die Website verlassen.
4. **`Dash` steht als Pille im Konto-Cluster rechts**, obwohl es ein normaler
   Menüpunkt ist — und ist dort doppelt, weil `auth.js` denselben Link zusätzlich
   ins Wallet-Menü einbaut.
5. **Marketing und Werkzeug hängen am selben Punkt.** `data-nav-extra` blendet
   auf `/` drei Anker-Links ein und macht die Leiste ausgerechnet auf der
   wichtigsten Seite am längsten.
6. **Die Leiste ist zustandsblind.** Ein Erstbesucher ohne Wallet sieht dieselben
   Punkte wie ein aktiver Nutzer — inklusive Rewards und Rang, mit denen er
   nichts anfangen kann.

**Ausdrücklich kein Problem:** Pro+ und Top-up sind erreichbar. `auth.js` baut
für eingeloggte Nutzer einen Tarif-Block (`renderTierBlock`, „Pro freischalten →")
und einen Egress-Balken (`renderEgressBlock`, „+ Top-up" → `/topup`) ins
Wallet-Menü. Sie fehlen nur in der obersten Ebene, was so bleibt.

---

## 2. Zielbild

**Leitgedanke:** links steht, *was man tun kann*; rechts steht, *wer man ist*.

### Eingeloggt

```
◈ Dead Drop   Drop  Chat  Vault  Verdienen ▾        DE|EN  💰  0x12…ab ▾
                                      │                            │
                                 Markt                        (Konto-Menü,
                                 Umfragen                      unverändert)
                                 Rewards
                                 Rang
```

### Nicht eingeloggt

```
◈ Dead Drop   Drop  Chat  Vault  Preise             DE|EN  [Wallet verbinden]
```

### Menüpunkte im Detail

| Punkt | Ziel | Sichtbar |
|---|---|---|
| Logo „Dead Drop" | `/` | immer — Name ist auf **allen** Seiten identisch |
| Drop | `/` | immer |
| Chat | `/chat` | immer |
| Vault | eingeloggt `/vault.html`, sonst `/vault` | immer |
| Verdienen ▾ | Untermenü | nur eingeloggt |
| › Markt | `/marketplace` | |
| › Umfragen | `/surveys` | |
| › Rewards | `/rewards` | |
| › Rang | `/rank` | |
| Preise | `/#preise` | nur ausgeloggt |

**Vault als ein Punkt:** Das Ziel richtet sich nach dem Wallet-Zustand. Die
Infoseite `/vault` behält ihren prominenten „Vault öffnen"-Knopf, damit der
Weg zur App auch ohne Menü offen bleibt.

**Rang an zwei Stellen ist beabsichtigt:** unter „Verdienen" die öffentliche
Bestenliste, im Wallet-Menü der persönliche Rang-Block. Verschiedene Zwecke.

**Bewusst in Kauf genommen:** Markt, Umfragen und Rewards sind für einen
ausgeloggten Besucher nicht mehr über die Leiste erreichbar. Sein Einstieg in
die Daten-Ökonomie ist die Vault-Infoseite `/vault`, die genau das erklärt.
Die Seiten selbst bleiben öffentlich und verlinkbar.

### Rechte Seite (Konto)

`DE|EN` · Guthaben-Ribbon · `Wallet ▾`

Inhalt des Wallet-Menüs bleibt wie er ist (Adresse, Anzeigename, Tarif-Block mit
Upgrade-Link, Egress-Balken mit Top-up, Dashboard, Rang, Trennen).

**Einzige Änderung: die `Dash`-Pille entfällt ersatzlos.** Der Dashboard-Link im
Wallet-Menü ist der eine verbleibende Weg.

### Handy (Hamburger)

Statt einer flachen Liste drei beschriftete Gruppen:

```
eingeloggt:                          ausgeloggt:
PRODUKTE   Drop · Chat · Vault       PRODUKTE   Drop · Chat · Vault · Preise
VERDIENEN  Markt · Umfragen ·        KONTO      Sprache DE|EN
           Rewards · Rang
KONTO      Dashboard · Sprache
```

Die Gruppe VERDIENEN und der Dashboard-Eintrag erscheinen **nur eingeloggt** —
beide sind ohne Wallet ohne Funktion. Der Wallet-Knopf selbst bleibt auf dem
Handy in der Leiste stehen, das Konto-Menü ist also auch dort erreichbar.

Seiten-spezifische Bedienelemente (`vault.html` Pro-Mode) bleiben wie heute in
einem eigenen Abschnitt „Ansicht".

---

## 3. Technische Umsetzung

### 3.1 `nav.js`

Umbau zu einer neuvermessbaren Leiste:

- Zwei Datenlisten statt einer: `PRODUCTS` (Drop, Chat, Vault) und `EARN`
  (Markt, Umfragen, Rewards, Rang).
- **Zwei-Zonen-Aufbau (siehe 3.2), das Kernstück:** Das Gerüst — Logo, rechter
  Konto-Cluster, mobiler Sprach- und „Ansicht"-Block — wird **genau einmal**
  synchron gebaut. Nur die reinen Link-Listen `#nav-primary` (Desktop) und
  `#nav-mobile-links` (Handy) werden bei Zustandswechsel neu gefüllt.
- `data-brand` wird nicht mehr ausgewertet; der Markenname ist fest.
- `data-nav-extra` wird nicht mehr ausgewertet.
- Die `Dash`-Pille entfällt.
- Das Vault-Ziel wird bei jedem Render aus dem Zustand bestimmt.
- Die Klick-Behandlung (Dropdown, Hamburger) hängt bereits an `document` und
  arbeitet über `closest()` — sie übersteht ein Neu-Rendern ohne Änderung.

### 3.2 Neu-Rendern bei Zustandswechsel — die Zwei-Zonen-Regel

**Die Leiste darf niemals ein Element neu bauen, an dem ein fremdes Skript
direkt einen Listener hängen hat.** Drei Stellen im Code binden direkt an
Elemente statt über Delegation, und würden von einem Neu-Rendern zerstört:

| Stelle | Element | Folge beim Neu-Bauen |
|---|---|---|
| `auth.js:454` | `#wallet-btn` | Wallet-Knopf reagiert auf keinen Klick mehr |
| `auth.js:466` | `#wallet-menu-logout` | „Trennen" tot |
| `pro-mode.js:52` | `[data-pro-mode-toggle]` | Pro-Mode-Schalter tot (Guard `dataset.wired` läuft nur einmal beim Start) |

Dazu kommen die von `auth.js` dynamisch eingefügten Blöcke im Wallet-Menü
(Anzeigename, Tarif, Egress, Rang), die ein Neu-Rendern verwerfen würde.

Daraus folgt die Aufteilung:

**Zone A — Gerüst, genau einmal gebaut, danach unangetastet:**
Logo · rechter Cluster (`DE|EN`, `#wallet-balance`, `#wallet-btn`,
`#wallet-menu`) · im Handy-Menü der „Ansicht"-Block mit den seiten-eigenen
Bedienelementen, der Dashboard-Link und die Sprach-Zeile.

**Zone B — Link-Listen, bei Zustandswechsel neu gefüllt:**
`#nav-primary` (Desktop-Links) und `#nav-mobile-links` (Gruppen PRODUKTE und
VERDIENEN). Beide enthalten **ausschließlich `<a>`-Elemente und den
Verdienen-Aufklapp-Knopf** — alles davon wird bereits über Delegation an
`document` behandelt und übersteht ein Neu-Füllen unbeschadet.

**Der Dashboard-Link im Handy-Menü** ist die eine Ausnahme, die zustandsabhängig
ist, aber in Zone A liegt. Er wird deshalb nicht neu gebaut, sondern nur
ein-/ausgeblendet: `dashLink.classList.toggle("hidden", !loggedIn)`.

Damit braucht `auth.js` **keinen Rückweg und keine neuen Referenzen** — der
gesamte Konto-Bereich wird nie angefasst. `auth.js` ändert sich nur an der
einen Stelle aus 3.3.

Nach jedem Neu-Füllen von Zone B muss `window.DDI18n.apply(container)` laufen
(`i18n.js:2201`, nimmt einen Teilbaum entgegen), sonst stehen die frischen
Links auf Deutsch, wenn EN aktiv ist.

`nav.js` hört dafür auf `dwinity:wallet-changed` und füllt nur dann neu, wenn
sich der eingeloggte Zustand tatsächlich geändert hat.

### 3.3 `auth.js` — Ereignis beim Sitzungs-Wiederherstellen

Heute wird `dwinity:wallet-changed` nur nach einem frischen Login verschickt
(Zeile 408). Beim Laden einer Seite mit bestehender Sitzung ruft der Bootvorgang
(Zeile 314) `renderLoggedIn(me)` auf, **ohne** das Ereignis zu verschicken.

Die Leiste bliebe damit auf „ausgeloggt" stehen. Also: das Ereignis auch dort
verschicken. Das ist eine Zeile und hilft nebenbei `chat-index.js`, `rank.js`,
`surveys.js`, `panic.js` und `vault.js`, die alle darauf hören.

Dasselbe Loch besteht in der Gegenrichtung: `logout()` (Zeile 425–433) ruft
`renderLoggedOut()` auf, ohne das Ereignis zu verschicken — die Leiste bliebe
nach dem Trennen auf „eingeloggt" stehen. Auch dort wird es verschickt, mit
`detail = { address: null }`.

Risiko: diese Seiten booten dadurch beim Seitenladen einmal zusätzlich. Vor der
Umsetzung ist je Seite zu prüfen, dass ihr `boot()` mehrfach aufrufbar ist
(keine doppelten Ereignis-Anmeldungen, keine doppelten Listeneinträge).

### 3.4 `i18n.js`

Neue Schlüssel, jeweils DE und EN:

| Schlüssel | DE | EN |
|---|---|---|
| `nav.vault` | Vault | Vault |
| `nav.earn` | Verdienen | Earn |
| `nav.groupProducts` | Produkte | Products |
| `nav.groupAccount` | Konto | Account |

Bestehende, weiterverwendete Schlüssel: `nav.drop`, `nav.chat`, `nav.market`,
`nav.surveys`, `nav.rewards`, `nav.rank`, `nav.pricing`, `nav.dashboard`,
`nav.language`, `nav.view`, `nav.walletConnect`.

Nicht mehr benutzt (bleiben in `i18n.js` stehen, da anderswo möglicherweise
referenziert — nicht löschen ohne Prüfung): `nav.daten`, `nav.datenEco`,
`nav.vaultInfo`, `nav.vaultApp`, `nav.how`, `nav.compare`.

### 3.5 Seiten

| Datei | Änderung |
|---|---|
| `index.html` | `data-nav-extra` entfernen |
| `vault.html` | `data-brand="vault"` entfernen (Pro-Mode-Knopf bleibt) |
| `surveys.html` | `data-brand="vault"` entfernen |
| `vault-landing.html` | `data-brand="vault"` entfernen |
| `chat-index.html`, `dashboard.html`, `marketplace.html`, `rank.html`, `rewards.html` | keine |

---

## 4. Prüfung

Kein Testrahmen im Frontend; geprüft wird im Browser, Desktop und Handybreite.

1. **Ausgeloggt, jede der 9 Seiten:** Leiste zeigt Drop · Chat · Vault · Preise.
   Logo überall „Dead Drop". Vault führt auf `/vault`.
2. **Wallet verbinden:** Leiste wechselt ohne Neuladen auf Drop · Chat · Vault ·
   Verdienen ▾. **Kritischer Punkt aus 3.2** — direkt danach prüfen:
   Wallet-Knopf lässt sich noch auf- und zuklappen, „Trennen" funktioniert,
   Wallet-Menü zeigt weiterhin Adresse, Anzeigename, Tarif-Block, Egress-Balken,
   Dashboard und Rang, und auf `vault.html` schaltet der Pro-Mode-Knopf noch.
3. **Neu laden mit bestehender Sitzung:** Leiste steht sofort auf „eingeloggt".
4. **Trennen:** Leiste fällt auf den ausgeloggten Zustand zurück.
5. **Aktive Seite** wird in beiden Zuständen hervorgehoben, auch als Eintrag im
   Verdienen-Untermenü (Elternpunkt lila).
6. **Handy:** Hamburger zeigt die Gruppen, schließt bei Auswahl und bei Tipp
   daneben. Auf `vault.html` ist der Pro-Mode-Knopf im Menü erreichbar.
7. **DE/EN-Umschalter** übersetzt alle neuen Punkte in beiden Zuständen.
8. **Regressionsprüfung der Seiten aus 3.3:** Chat, Rang, Umfragen, Vault und
   der Panik-Knopf funktionieren nach dem zusätzlichen Ereignis unverändert.

---

## 5. Ausdrücklich nicht in dieser Spec

- Die optische Überarbeitung der Leiste (eigener Schritt, folgt danach).
- Umbenennen von Seiten oder URLs.
- Änderungen am Inhalt des Wallet-Menüs außer dem Wegfall der `Dash`-Pille.
- Der ausstehende Push nach GitHub (`RobInMotion/dwinity-drop` liegt 16 Commits
  zurück) — separat zu erledigen.
