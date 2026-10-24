#!/usr/bin/env python3
"""Download/parse the community Indian food CSV and build MySQL staging artifacts.

Nothing produced by this script is inserted directly into `foods`. It creates a staging
SQL file plus CSV reports so records can be reviewed before promotion to the live catalog.
Uses only the Python standard library.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
import re
import sys
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

SOURCE_URL = "https://raw.githubusercontent.com/prabhubng/indian-nutrition-data/main/indian-foods.csv"
NUMERIC_FIELDS = {
    "energy_kcal": "energy_kcal",
    "protein_g": "protein_g",
    "fat_g": "fat_g",
    "carbs_g": "carbs_g",
    "fiber_g": "fiber_g",
    "calcium_mg": "calcium_mg",
    "iron_mg": "iron_mg",
    "vitamin_c_mg": "vitamin_c_mg",
}
EXPECTED = {"id", "name", "category", "energy_kcal", "protein_g", "fat_g", "carbs_g", "fiber_g", "source"}


def normalized_key(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")[:191] or "unnamed-food"


def d(value: str):
    if value is None or str(value).strip() == "":
        return None
    try:
        return Decimal(str(value).strip())
    except InvalidOperation:
        return None


def sql_str(value) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("\\", "\\\\").replace("'", "\\'").replace("\x00", "") + "'"


def sql_num(value):
    if value is None or str(value).strip() == "":
        return "NULL"
    try:
        val = Decimal(str(value))
        if not val.is_finite():
            return "NULL"
        return format(val, "f")
    except (InvalidOperation, ValueError):
        return "NULL"


def sql_json(obj) -> str:
    # JSON document is escaped as a SQL string and cast to JSON by MySQL.
    serialized = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    return "CAST(" + sql_str(serialized) + " AS JSON)"


def download(url: str, destination: Path):
    req = urllib.request.Request(url, headers={"User-Agent": "food-tracker-dataset-audit/1.0"})
    with urllib.request.urlopen(req, timeout=45) as response:
        data = response.read()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    return data


def prepare_row(row, row_number):
    flags = []
    name = (row.get("name") or "").strip()
    if not name:
        flags.append("missing_food_name")
    parsed = {key: d(row.get(src_col)) for key, src_col in NUMERIC_FIELDS.items()}
    for key, val in parsed.items():
        if val is None:
            flags.append("missing_or_non_numeric:" + key)
        elif val < 0:
            flags.append("negative_value:" + key)
    energy = parsed["energy_kcal"]
    protein = parsed["protein_g"]
    fat = parsed["fat_g"]
    carbs = parsed["carbs_g"]
    fiber = parsed["fiber_g"]
    for key in ("protein_g", "fat_g", "carbs_g", "fiber_g"):
        val = parsed[key]
        if val is not None and val > Decimal("100"):
            flags.append("over_100g_per_100g:" + key)
    if all(v is not None for v in (protein, fat, carbs)):
        macro_sum = protein + fat + carbs
        if macro_sum > Decimal("105"):
            flags.append("macro_sum_over_105g_per_100g")
    # Coarse plausibility screen only. Fiber and source-specific energy methodology can create exceptions.
    if all(v is not None for v in (energy, protein, fat, carbs)) and energy >= 0:
        estimated = protein * Decimal("4") + carbs * Decimal("4") + fat * Decimal("9")
        tolerance = max(Decimal("60"), energy * Decimal("0.35"))
        if abs(energy - estimated) > tolerance:
            flags.append("energy_macro_consistency_review")
    source_claim = (row.get("source") or "").strip()
    if not source_claim:
        flags.append("missing_source_label")
    local_name = (row.get("name_hindi") or "").strip()
    key = normalized_key(name)
    record = dict(row)
    return {
        "source_record_id": str(row.get("id") or row_number),
        "canonical_key_candidate": key,
        "display_name": name,
        "local_name": local_name,
        "category": (row.get("category") or "Uncategorized").strip(),
        "source_claimed_dataset": source_claim,
        **{k: (format(v, "f") if v is not None else "") for k, v in parsed.items()},
        "basis_amount": "100",
        "basis_unit": "g",
        "qa_status": "REVIEW" if flags else "PASS_PRELIMINARY",
        "qa_flags": flags,
        "review_status": "PENDING",
        "raw_record": record,
    }


def write_csv(path: Path, rows, fieldnames):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", help="Path to downloaded indian-foods.csv. If omitted, the script downloads the current upstream CSV.")
    parser.add_argument("--output-dir", default="build/food-import", help="Output directory (default: build/food-import)")
    parser.add_argument("--source-url", default=SOURCE_URL, help="Override source CSV URL")
    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    if args.input:
        input_path = Path(args.input)
        if not input_path.is_file():
            print(f"ERROR: input file not found: {input_path}", file=sys.stderr)
            return 2
        raw_bytes = input_path.read_bytes()
        input_name = str(input_path)
    else:
        input_path = out_dir / "raw" / "indian-foods.csv"
        try:
            raw_bytes = download(args.source_url, input_path)
        except Exception as exc:
            print(f"ERROR: download failed: {exc}\nTry downloading the CSV in a browser and pass --input path/to/indian-foods.csv", file=sys.stderr)
            return 2
        input_name = args.source_url

    sha256 = hashlib.sha256(raw_bytes).hexdigest()
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw_bytes.decode("utf-8", errors="replace")
    reader = csv.DictReader(text.splitlines())
    if not reader.fieldnames or not EXPECTED.issubset(set(reader.fieldnames)):
        print(f"ERROR: unexpected CSV columns. Found {reader.fieldnames}; required at least {sorted(EXPECTED)}", file=sys.stderr)
        return 2

    rows = [prepare_row(row, i) for i, row in enumerate(reader, start=2)]
    key_counts = Counter(row["canonical_key_candidate"] for row in rows)
    for row in rows:
        if key_counts[row["canonical_key_candidate"]] > 1:
            row["qa_flags"].append("duplicate_normalized_food_name_review")
            row["qa_status"] = "REVIEW"

    # All imported rows remain pending even when preliminary checks pass.
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    batch_key = "indian-nutrition-github-" + sha256[:16]
    source_fields = ["source_record_id", "canonical_key_candidate", "display_name", "local_name", "category", "source_claimed_dataset", "basis_amount", "basis_unit", *NUMERIC_FIELDS.keys(), "qa_status", "qa_flags", "review_status"]
    candidates = []
    issues = []
    for row in rows:
        out = {k: row.get(k, "") for k in source_fields}
        out["qa_flags"] = ";".join(row["qa_flags"])
        candidates.append(out)
        if row["qa_flags"]:
            issue = dict(out)
            issues.append(issue)

    write_csv(out_dir / "food_candidates.csv", candidates, source_fields)
    write_csv(out_dir / "food_qa_report.csv", issues, source_fields)

    manifest = {
        "source_name": "Indian Food Nutrition Database (community repository)",
        "source_url": args.source_url if not args.input else input_name,
        "repository_license_claim": "CC0 1.0 in repository; rights in cited upstream IFCT/Gopalan sources still require review",
        "downloaded_or_read_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_sha256": sha256,
        "source_record_count": len(rows),
        "preliminary_review_count": sum(1 for r in rows if r["qa_status"] == "REVIEW"),
        "pending_review_count": len(rows),
        "import_policy": "STAGING ONLY; not approved for direct production catalogue insertion",
        "notes": [
            "The upstream CSV has values per 100 g according to its README.",
            "Blank values remain blank/unknown; they are never converted to zero.",
            "Source values are preserved in raw_record_json in the generated SQL.",
            "A passing macro-energy check is not scientific validation and does not establish licensing clearance.",
            "Inspect food preparation state manually; do not assume unspecified records are raw/cooked without source evidence."
        ]
    }
    (out_dir / "source_manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    sql_path = out_dir / "food_staging_import.sql"
    with sql_path.open("w", encoding="utf-8") as fh:
        fh.write("-- Generated by build_food_candidates.py. Staging only; no live foods are created.\n")
        fh.write("SET NAMES utf8mb4;\nSTART TRANSACTION;\n")
        fh.write("INSERT INTO food_import_batches (source_id, batch_key, source_release, source_file_sha256, batch_status, source_record_count, notes)\n")
        fh.write("VALUES ((SELECT id FROM food_sources WHERE source_code='INDIAN_NUTRITION_GITHUB'), ")
        fh.write(sql_str(batch_key) + ", " + sql_str("main snapshot " + now) + ", " + sql_str(sha256) + ", 'STAGED', " + str(len(rows)) + ", ")
        fh.write(sql_str("Generated from " + input_name + ". All records are pending review; repository CC0 claim and upstream source rights require separate review.") + ")\n")
        fh.write("ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), source_file_sha256=VALUES(source_file_sha256), source_record_count=VALUES(source_record_count);\n")
        fh.write("SET @food_import_batch_id = LAST_INSERT_ID();\n")
        for start in range(0, len(rows), 100):
            part = rows[start:start+100]
            fh.write("\nINSERT INTO food_import_staging (batch_id, source_record_id, source_claimed_dataset, original_name, local_name, source_category, energy_kcal, protein_g, fat_g, carbs_g, fiber_g, calcium_mg, iron_mg, vitamin_c_mg, qa_status, qa_flags_json, raw_record_json, review_status) VALUES\n")
            values = []
            for row in part:
                vals = [
                    "@food_import_batch_id", sql_str(row["source_record_id"]), sql_str(row["source_claimed_dataset"]),
                    sql_str(row["display_name"]), sql_str(row["local_name"] or None), sql_str(row["category"]),
                    sql_num(row["energy_kcal"]), sql_num(row["protein_g"]), sql_num(row["fat_g"]), sql_num(row["carbs_g"]),
                    sql_num(row["fiber_g"]), sql_num(row["calcium_mg"]), sql_num(row["iron_mg"]), sql_num(row["vitamin_c_mg"]),
                    sql_str(row["qa_status"]), sql_json(row["qa_flags"]), sql_json(row["raw_record"]), "'PENDING'"
                ]
                values.append("(" + ", ".join(vals) + ")")
            fh.write(",\n".join(values))
            fh.write("\nON DUPLICATE KEY UPDATE original_name=VALUES(original_name), qa_status=VALUES(qa_status), qa_flags_json=VALUES(qa_flags_json), raw_record_json=VALUES(raw_record_json), review_status='PENDING';\n")
        fh.write("COMMIT;\n")

    print(f"Read {len(rows)} source records")
    print(f"Preliminary QA flags: {len(issues)} records")
    print(f"Source SHA-256: {sha256}")
    print(f"Wrote: {out_dir / 'food_candidates.csv'}")
    print(f"Wrote: {out_dir / 'food_qa_report.csv'}")
    print(f"Wrote: {out_dir / 'source_manifest.json'}")
    print(f"Wrote: {sql_path}")
    print("All records remain PENDING in food_import_staging. Review before promoting to foods.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
