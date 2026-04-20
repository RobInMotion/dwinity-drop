# Dwinity Backend Services

Source-of-truth for the three FastAPI services that power the Dwinity stack.

| folder          | runtime path                  | port | purpose                                       |
|-----------------|-------------------------------|------|-----------------------------------------------|
| `drop-api/`     | `/opt/dwinity-drop-api/`      | 8080 | Drop upload/download/TTL/tier limits          |
| `identity-api/` | `/opt/dwinity-identity-api/`  | 8083 | SIWE auth + Avalanche payment matcher         |
| `waitlist-api/` | `/opt/dwinity-waitlist-api/`  | 8081 | Shared waitlist + free-tier email gate store  |

Secrets live in `/etc/dwinity/*.env` on the VPS, not in this repo.
Each service runs as a systemd unit (`dwinity-<name>.service`) under `www-data`.
Sweepers & chain matchers run as systemd timers.
