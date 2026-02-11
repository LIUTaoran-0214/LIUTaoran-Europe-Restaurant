from pathlib import Path
import csv
import re


TRIG_PATH = Path("european_restaurants.trig")
CSV_PATH  = Path("res_brand.csv")
OUT_TTL   = Path("wikidata_brand_links.ttl")

SUBJ_RE = re.compile(r'^\s*:(restaurant_[^\s;]+)\b') # IRI
NAME_RE = re.compile(r':restaurantName\s+"([^"]+)"') # Restaurant name

def norm(s: str) -> str:
    return " ".join(s.strip().lower().split())

def load_brand_map(csv_path: Path) -> dict:
    brand2qid = {}
    with csv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            b = (row.get("brand_name") or row.get("brand") or row.get("name") or "").strip()
            q = (row.get("wikidata_link") or row.get("wikidata") or row.get("qid") or "").strip()
            if not b or not q:
                continue
            key = norm(b)
            if key not in brand2qid:
                brand2qid[key] = q
    return brand2qid

def extract_subject_to_name(trig_path: Path) -> dict:
    """
    Streaming parse. Assumes restaurant blocks look like:
    :restaurant_xxx
        ... :restaurantName "..." ...
    """
    subj_to_name = {}
    current_subj = None

    with trig_path.open("r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            msubj = SUBJ_RE.match(line)
            if msubj:
                current_subj = msubj.group(1)
                continue

            if current_subj:
                mname = NAME_RE.search(line)
                if mname:
                    subj_to_name[current_subj] = mname.group(1)

    return subj_to_name

def write_ttl(out_path: Path, rows: list[tuple[str, str, str]]):
    """
    rows: [(subject_qname, label, qid), ...]
    """
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with out_path.open("w", encoding="utf-8") as w:
        w.write("@prefix : <http://ltr.european-restaurants.org/> .\n")
        w.write("@prefix owl: <http://www.w3.org/2002/07/owl#> .\n")
        w.write("@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n")
        w.write("@prefix wd: <http://www.wikidata.org/entity/> .\n\n")

        for subj, label, qid in rows:
            safe_label = label.replace("\\", "\\\\").replace('"', '\\"')
            w.write(f":{subj} rdfs:label \"{safe_label}\"@en ;\n")
            w.write(f"    owl:sameAs wd:{qid} .\n\n")

def main():
    if not TRIG_PATH.exists():
        raise FileNotFoundError(f"TriG not found: {TRIG_PATH.resolve()}")
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"CSV not found: {CSV_PATH.resolve()}")

    brand2qid = load_brand_map(CSV_PATH)
    print(f"Loaded {len(brand2qid)} brand mappings from CSV.")

    subj_to_name = extract_subject_to_name(TRIG_PATH)
    print(f"Found restaurantName for {len(subj_to_name)} restaurants in TriG.")

    matched = []
    miss = 0

    for subj, name in subj_to_name.items():
        key = norm(name)
        qid = brand2qid.get(key)
        if qid:
            matched.append((subj, name, qid))
        else:
            miss += 1

    write_ttl(OUT_TTL, matched)

    print(f"Matched {len(matched)} restaurants, missed {miss}.")
    print(f"Wrote: {OUT_TTL.resolve()}")

if __name__ == "__main__":
    main()
