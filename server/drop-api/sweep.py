"""Sweeper: deletes expired drops from Storj + SQLite."""
import os
import sqlite3
import sys
import time
import boto3
from botocore.client import Config

STORJ_ACCESS_KEY = os.environ["STORJ_ACCESS_KEY"]
STORJ_SECRET_KEY = os.environ["STORJ_SECRET_KEY"]
STORJ_ENDPOINT = os.environ["STORJ_ENDPOINT"]
STORJ_REGION = os.environ.get("STORJ_REGION", "us-east-1")
BUCKET = os.environ.get("STORJ_BUCKET", "dwinity-drop")
DB_PATH = os.environ.get("DROP_DB", "/var/lib/dwinity-drop/drops.db")

BATCH = 500

s3 = boto3.client(
    "s3",
    endpoint_url=STORJ_ENDPOINT,
    aws_access_key_id=STORJ_ACCESS_KEY,
    aws_secret_access_key=STORJ_SECRET_KEY,
    region_name=STORJ_REGION,
    config=Config(signature_version="s3v4"),
)


def main():
    now = int(time.time())
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row

    rows = con.execute(
        "SELECT id FROM drops WHERE expires_at <= ? LIMIT ?", (now, BATCH)
    ).fetchall()

    if not rows:
        con.close()
        print(f"sweep: nothing to delete at {now}", flush=True)
        return

    ids = [r["id"] for r in rows]
    print(f"sweep: deleting {len(ids)} expired drops", flush=True)

    # Storj S3 gateway requires Content-MD5 for batch DeleteObjects; use
    # single delete_object calls instead (simpler, works on any S3 backend).
    purged = []
    errors = 0
    for obj_id in ids:
        try:
            s3.delete_object(Bucket=BUCKET, Key=obj_id)
            purged.append(obj_id)
        except Exception as e:
            errors += 1
            print(f"sweep: delete {obj_id} failed: {e}", file=sys.stderr, flush=True)

    if purged:
        placeholders = ",".join("?" * len(purged))
        con.execute(f"DELETE FROM drops WHERE id IN ({placeholders})", purged)
        con.commit()
    con.close()
    print(f"sweep: done, {len(purged)}/{len(ids)} purged ({errors} errors)", flush=True)


if __name__ == "__main__":
    main()
