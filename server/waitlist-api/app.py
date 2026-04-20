import os
import re
import sqlite3
import hashlib
import secrets
import time
from contextlib import contextmanager
from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, EmailStr, Field

DB_PATH = os.environ.get("WAITLIST_DB", "/var/lib/dwinity-waitlist/waitlist.db")
ADMIN_TOKEN = os.environ.get("WAITLIST_ADMIN_TOKEN", "")
IP_SALT = os.environ.get("WAITLIST_IP_SALT", "change-me")

VALID_PRODUCTS = {"drop", "tax", "drop-free"}
ALLOWED_ORIGINS = [
    "https://drop.mkwt-strategy.tech",
    "https://tax.mkwt-strategy.tech",
]


@contextmanager
def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with db() as con:
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS waitlist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                product TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                ip_hash TEXT,
                user_agent TEXT,
                UNIQUE(email, product)
            )
            """
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_waitlist_product_created "
            "ON waitlist(product, created_at DESC)"
        )


init_db()

app = FastAPI(title="Dwinity Waitlist API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


class WaitlistRequest(BaseModel):
    email: EmailStr
    product: str = Field(..., pattern=r"^(drop|tax|drop-free)$")


class WaitlistResponse(BaseModel):
    ok: bool
    count: int


def hash_ip(ip: str) -> str:
    return hashlib.sha256(f"{IP_SALT}|{ip}".encode()).hexdigest()[:16]


def client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"


@app.get("/api/waitlist/health")
def health():
    return {"ok": True}


@app.post("/api/waitlist", response_model=WaitlistResponse)
def add(req: WaitlistRequest, request: Request):
    email = req.email.lower().strip()
    product = req.product
    if product not in VALID_PRODUCTS:
        raise HTTPException(400, "invalid product")

    ip = client_ip(request)
    ip_h = hash_ip(ip)
    ua = request.headers.get("user-agent", "")[:200]

    with db() as con:
        # simple rate limit: max 5 inserts per ip_hash per hour
        since = int(time.time()) - 3600
        row = con.execute(
            "SELECT COUNT(*) AS c FROM waitlist WHERE ip_hash = ? AND created_at >= ?",
            (ip_h, since),
        ).fetchone()
        if row["c"] >= 5:
            raise HTTPException(429, "too many requests")

        try:
            con.execute(
                "INSERT INTO waitlist (email, product, created_at, ip_hash, user_agent) "
                "VALUES (?, ?, ?, ?, ?)",
                (email, product, int(time.time()), ip_h, ua),
            )
        except sqlite3.IntegrityError:
            # already on the list — treat as success (idempotent)
            pass

        count = con.execute(
            "SELECT COUNT(*) AS c FROM waitlist WHERE product = ?", (product,)
        ).fetchone()["c"]

    return WaitlistResponse(ok=True, count=count)


def check_admin(token: str | None):
    if not ADMIN_TOKEN or not token or not secrets.compare_digest(token, ADMIN_TOKEN):
        raise HTTPException(401, "unauthorized")


@app.get("/api/waitlist/stats")
def stats(x_admin_token: str | None = Header(default=None, alias="X-Admin-Token")):
    check_admin(x_admin_token)
    with db() as con:
        rows = con.execute(
            "SELECT product, COUNT(*) AS c FROM waitlist GROUP BY product"
        ).fetchall()
    return {r["product"]: r["c"] for r in rows}


@app.get("/api/waitlist/export.csv", response_class=PlainTextResponse)
def export_csv(
    product: str = "",
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
):
    check_admin(x_admin_token)
    if product and product not in VALID_PRODUCTS:
        raise HTTPException(400, "invalid product")

    with db() as con:
        if product:
            rows = con.execute(
                "SELECT email, product, created_at FROM waitlist "
                "WHERE product = ? ORDER BY created_at DESC",
                (product,),
            ).fetchall()
        else:
            rows = con.execute(
                "SELECT email, product, created_at FROM waitlist "
                "ORDER BY created_at DESC"
            ).fetchall()

    lines = ["email,product,created_at"]
    for r in rows:
        # CSV-safe: emails don't contain commas under RFC 5321 local-part rules we accept
        lines.append(f"{r['email']},{r['product']},{r['created_at']}")
    return "\n".join(lines) + "\n"
