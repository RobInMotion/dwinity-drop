import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from typing import Optional
from fastapi import FastAPI, HTTPException, Cookie
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import boto3
from botocore.client import Config

STORJ_ACCESS_KEY = os.environ["STORJ_ACCESS_KEY"]
STORJ_SECRET_KEY = os.environ["STORJ_SECRET_KEY"]
STORJ_ENDPOINT = os.environ["STORJ_ENDPOINT"]
STORJ_REGION = os.environ.get("STORJ_REGION", "us-east-1")
BUCKET = os.environ.get("STORJ_BUCKET", "dwinity-drop")

DB_PATH = os.environ.get("DROP_DB", "/var/lib/dwinity-drop/drops.db")
IDENTITY_DB = os.environ.get("IDENTITY_DB", "/var/lib/dwinity-identity/identity.db")
IDENTITY_COOKIE = os.environ.get("IDENTITY_COOKIE", "dwid_session")

# Tier limits — Pro unlocks bigger uploads + longer retention
FREE_MAX_SIZE = 100 * 1024 * 1024          # 100 MB
PRO_MAX_SIZE  = 2 * 1024 * 1024 * 1024     # 2 GB
FREE_MAX_RETENTION_HOURS = 24 * 7           # 7 days
PRO_MAX_RETENTION_HOURS  = 24 * 30          # 30 days
HARD_MAX_SIZE = PRO_MAX_SIZE                # Pydantic upper bound (actual limit per tier below)

UPLOAD_URL_TTL = 600           # Signed-URL validity (10 min)
DOWNLOAD_URL_TTL = 3600        # Signed-URL validity (1 h)

DEFAULT_RETENTION_HOURS = 24 * 7            # 7 days default

s3 = boto3.client(
    "s3",
    endpoint_url=STORJ_ENDPOINT,
    aws_access_key_id=STORJ_ACCESS_KEY,
    aws_secret_access_key=STORJ_SECRET_KEY,
    region_name=STORJ_REGION,
    config=Config(signature_version="s3v4"),
)


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
            CREATE TABLE IF NOT EXISTS drops (
                id TEXT PRIMARY KEY,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                size INTEGER NOT NULL,
                content_type TEXT,
                address TEXT,
                max_downloads INTEGER,
                download_count INTEGER NOT NULL DEFAULT 0,
                first_download_at INTEGER,
                last_download_at INTEGER
            )
            """
        )
        cols = {r[1] for r in con.execute("PRAGMA table_info(drops)").fetchall()}
        for col, ddl in [
            ("address", "ALTER TABLE drops ADD COLUMN address TEXT"),
            ("max_downloads", "ALTER TABLE drops ADD COLUMN max_downloads INTEGER"),
            ("download_count", "ALTER TABLE drops ADD COLUMN download_count INTEGER NOT NULL DEFAULT 0"),
            ("first_download_at", "ALTER TABLE drops ADD COLUMN first_download_at INTEGER"),
            ("last_download_at", "ALTER TABLE drops ADD COLUMN last_download_at INTEGER"),
        ]:
            if col not in cols:
                con.execute(ddl)
        con.execute("CREATE INDEX IF NOT EXISTS idx_drops_expires ON drops(expires_at)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_drops_address ON drops(address, created_at DESC)")


init_db()

app = FastAPI(title="Dead Drop API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://drop.mkwt-strategy.tech"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def get_pro_status(session_id: Optional[str]) -> dict:
    """Read identity DB to determine pro status for this browser session.
    Returns {address, pro, pro_until}. All falsy when no session."""
    if not session_id:
        return {"address": None, "pro": False, "pro_until": 0}
    try:
        con = sqlite3.connect(f"file:{IDENTITY_DB}?mode=ro", uri=True, timeout=2)
        con.row_factory = sqlite3.Row
        try:
            now_ts = int(time.time())
            row = con.execute(
                "SELECT s.address, w.pro_until FROM sessions s "
                "LEFT JOIN wallets w ON w.address = s.address "
                "WHERE s.id = ? AND s.expires_at > ?",
                (session_id, now_ts),
            ).fetchone()
        finally:
            con.close()
    except Exception:
        return {"address": None, "pro": False, "pro_until": 0}

    if not row:
        return {"address": None, "pro": False, "pro_until": 0}
    pro_until = int(row["pro_until"] or 0)
    return {
        "address": row["address"],
        "pro": pro_until > int(time.time()),
        "pro_until": pro_until,
    }


def limits_for(pro: bool) -> dict:
    return {
        "max_size": PRO_MAX_SIZE if pro else FREE_MAX_SIZE,
        "max_retention_hours": PRO_MAX_RETENTION_HOURS if pro else FREE_MAX_RETENTION_HOURS,
    }


class UploadUrlRequest(BaseModel):
    size: int = Field(..., ge=1, le=HARD_MAX_SIZE)
    content_type: str = Field(default="application/octet-stream", max_length=100)
    retention_hours: int = Field(default=DEFAULT_RETENTION_HOURS, ge=1, le=PRO_MAX_RETENTION_HOURS)
    # null/0 = unlimited downloads; 1 = burn-after-read; 2–100 = capped
    max_downloads: Optional[int] = Field(default=None, ge=1, le=100)


class UploadUrlResponse(BaseModel):
    id: str
    url: str
    expires_in: int
    retention_hours: int
    retention_until: int


class DownloadUrlResponse(BaseModel):
    url: str
    expires_in: int
    retention_until: int


def new_id() -> str:
    return secrets.token_urlsafe(16)


@app.get("/api/health")
def health():
    with db() as con:
        active = con.execute(
            "SELECT COUNT(*) AS c FROM drops WHERE expires_at > ?", (int(time.time()),)
        ).fetchone()["c"]
    return {"ok": True, "bucket": BUCKET, "active_drops": active}


@app.get("/api/me")
def me(session: Optional[str] = Cookie(default=None, alias=IDENTITY_COOKIE)):
    """Returns the current browser's wallet + pro status + tier limits.
    Consumed by app.js to gate the UI. Safe to call unauthenticated."""
    s = get_pro_status(session)
    lim = limits_for(s["pro"])
    return {
        **s,
        **lim,
        "free_max_size": FREE_MAX_SIZE,
        "pro_max_size": PRO_MAX_SIZE,
        "free_max_retention_hours": FREE_MAX_RETENTION_HOURS,
        "pro_max_retention_hours": PRO_MAX_RETENTION_HOURS,
    }


@app.post("/api/upload-url", response_model=UploadUrlResponse)
def upload_url(
    req: UploadUrlRequest,
    session: Optional[str] = Cookie(default=None, alias=IDENTITY_COOKIE),
):
    s = get_pro_status(session)
    lim = limits_for(s["pro"])

    if req.size > lim["max_size"]:
        mb = lim["max_size"] // (1024 * 1024)
        tier = "Pro" if s["pro"] else "Free"
        raise HTTPException(
            413,
            f"Datei zu groß für {tier}-Tarif (max {mb} MB)." +
            ("" if s["pro"] else " Upgrade auf Pro für bis zu 2 GB."),
        )
    if req.retention_hours > lim["max_retention_hours"]:
        tier = "Pro" if s["pro"] else "Free"
        max_days = lim["max_retention_hours"] // 24
        raise HTTPException(
            400,
            f"Ablaufzeit zu lang für {tier}-Tarif (max {max_days} Tage)." +
            ("" if s["pro"] else " Upgrade auf Pro für bis zu 30 Tage."),
        )

    obj_id = new_id()
    now = int(time.time())
    expires_at = now + req.retention_hours * 3600

    url = s3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": BUCKET,
            "Key": obj_id,
            "ContentType": req.content_type,
        },
        ExpiresIn=UPLOAD_URL_TTL,
    )

    with db() as con:
        con.execute(
            "INSERT INTO drops (id, created_at, expires_at, size, content_type, address, max_downloads) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (obj_id, now, expires_at, req.size, req.content_type, s["address"], req.max_downloads),
        )

    return UploadUrlResponse(
        id=obj_id,
        url=url,
        expires_in=UPLOAD_URL_TTL,
        retention_hours=req.retention_hours,
        retention_until=expires_at,
    )


@app.get("/api/drops/mine")
def drops_mine(session: Optional[str] = Cookie(default=None, alias=IDENTITY_COOKIE)):
    s = get_pro_status(session)
    if not s["address"]:
        raise HTTPException(401, "not logged in")
    now_ts = int(time.time())
    with db() as con:
        rows = con.execute(
            "SELECT id, created_at, expires_at, size, content_type, "
            "max_downloads, download_count, first_download_at, last_download_at "
            "FROM drops WHERE address = ? ORDER BY created_at DESC LIMIT 500",
            (s["address"],),
        ).fetchall()

    drops = []
    total_size = 0
    active_count = 0
    for r in rows:
        is_active = r["expires_at"] > now_ts
        if is_active:
            total_size += r["size"]
            active_count += 1
        drops.append({
            "id": r["id"],
            "created_at": r["created_at"],
            "expires_at": r["expires_at"],
            "size": r["size"],
            "content_type": r["content_type"],
            "status": "active" if is_active else "expired",
            "max_downloads": r["max_downloads"],
            "download_count": r["download_count"],
            "first_download_at": r["first_download_at"],
            "last_download_at": r["last_download_at"],
        })

    lim = limits_for(s["pro"])
    return {
        "address": s["address"],
        "pro": s["pro"],
        "pro_until": s["pro_until"],
        "drops": drops,
        "stats": {
            "active_count": active_count,
            "total_count": len(drops),
            "storage_used": total_size,
            "storage_quota": lim["max_size"] * 10 if s["pro"] else lim["max_size"] * 3,
        },
        "limits": lim,
    }


@app.delete("/api/drops/{obj_id}")
def delete_drop(
    obj_id: str,
    session: Optional[str] = Cookie(default=None, alias=IDENTITY_COOKIE),
):
    s = get_pro_status(session)
    if not s["address"]:
        raise HTTPException(401, "not logged in")
    if not obj_id or len(obj_id) > 64 or "/" in obj_id:
        raise HTTPException(400, "invalid id")

    with db() as con:
        row = con.execute(
            "SELECT address FROM drops WHERE id = ?", (obj_id,)
        ).fetchone()
    if not row:
        raise HTTPException(404, "not found")
    if row["address"] != s["address"]:
        raise HTTPException(403, "not your drop")

    try:
        s3.delete_object(Bucket=BUCKET, Key=obj_id)
    except Exception:
        pass  # best-effort; DB delete proceeds so it can't be re-downloaded
    with db() as con:
        con.execute("DELETE FROM drops WHERE id = ?", (obj_id,))
    return {"ok": True, "id": obj_id}


BURN_GRACE_SEC = 600  # 10 min grace after hitting max_downloads to let the transfer finish


@app.get("/api/download-url/{obj_id}", response_model=DownloadUrlResponse)
def download_url(obj_id: str):
    if not obj_id or len(obj_id) > 64 or "/" in obj_id:
        raise HTTPException(400, "invalid id")

    now_ts = int(time.time())
    with db() as con:
        row = con.execute(
            "SELECT expires_at, max_downloads, download_count FROM drops WHERE id = ?",
            (obj_id,),
        ).fetchone()

    if row is None:
        raise HTTPException(404, "not found")
    if row["expires_at"] <= now_ts:
        raise HTTPException(410, "expired")
    if row["max_downloads"] is not None and row["download_count"] >= row["max_downloads"]:
        raise HTTPException(410, "burned (download limit reached)")

    try:
        s3.head_object(Bucket=BUCKET, Key=obj_id)
    except Exception:
        raise HTTPException(404, "not found")

    # Issue URL first — this represents "a download has started".
    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": BUCKET, "Key": obj_id},
        ExpiresIn=DOWNLOAD_URL_TTL,
    )

    # Record the download + (if this was the burn-triggering one) shrink expiry.
    with db() as con:
        con.execute(
            "UPDATE drops SET download_count = download_count + 1, "
            "last_download_at = ?, "
            "first_download_at = COALESCE(first_download_at, ?) "
            "WHERE id = ?",
            (now_ts, now_ts, obj_id),
        )
        row2 = con.execute(
            "SELECT max_downloads, download_count, expires_at FROM drops WHERE id = ?",
            (obj_id,),
        ).fetchone()
        if (
            row2["max_downloads"] is not None
            and row2["download_count"] >= row2["max_downloads"]
            and row2["expires_at"] > now_ts + BURN_GRACE_SEC
        ):
            new_exp = now_ts + BURN_GRACE_SEC
            con.execute("UPDATE drops SET expires_at = ? WHERE id = ?", (new_exp, obj_id))
            final_exp = new_exp
        else:
            final_exp = row2["expires_at"]

    return DownloadUrlResponse(
        url=url, expires_in=DOWNLOAD_URL_TTL, retention_until=final_exp
    )
