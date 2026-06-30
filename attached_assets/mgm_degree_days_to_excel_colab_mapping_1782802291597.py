"""
MGM Gün-Derece verilerini resmi MGM sayfasından çekip tek tablo Excel üretir.

Google Colab kullanımı:
  1) mgm_station_mapping_checked.xlsx dosyasını Colab'a yükleyin.
  2) Bu scripti çalıştırın.
  3) Çıktı: mgm_degree_days_last_10_years_final.xlsx

Notlar:
- HDD/CDD değerleri hesaplanmaz; MGM HTML tablosunda görünen resmi hücreler okunur.
- province/district tahmini yapılmaz; mgm_station_mapping_checked.xlsx dosyasından station_key ile alınır.
- 287,0 -> 287 olarak aktarılır; 2870 hatası üretmez.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
import requests

SOURCE_URL = "https://mgm.gov.tr/veridegerlendirme/gun-derece.aspx?g=yillik"
URL_TEMPLATE = "https://mgm.gov.tr/veridegerlendirme/gun-derece.aspx?a=05&g=yillik&m=06-00&y={year}"
MAPPING_FILE = Path("mgm_station_mapping_checked.xlsx")
OUTPUT = Path("mgm_degree_days_last_10_years_final.xlsx")

MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"]


def slugify(text: str) -> str:
    text = str(text).strip().lower()
    text = text.replace("ı", "i").replace("İ", "i")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def clean_int(value: Any) -> int:
    """MGM'deki 287,0 / 287.0 değerlerini 287 yapar; 2870 yapmaz."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return 0
    s = str(value).strip()
    if s in {"", "nan", "NaN", "None", "-"}:
        return 0

    # HTML/Excel kaynaklı boşlukları temizle
    s = s.replace("\xa0", "").replace(" ", "")

    # Türkçe ondalık virgülünü sayısal ondalığa çevir; binlik ayırıcıyı ezbere silme.
    # MGM gün-derece tablolarında bu alanlar tam sayı veya x,0 formatında gelir.
    if "," in s and "." in s:
        # Örn: 1.234,0 -> 1234.0
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        # Örn: 287,0 -> 287.0
        s = s.replace(",", ".")

    try:
        return int(round(float(s)))
    except ValueError:
        return 0


def fetch_html(year: int) -> str:
    url = URL_TEMPLATE.format(year=year)
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; MGM-degree-days-export/1.0)",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
    }
    r = requests.get(url, headers=headers, timeout=60)
    r.raise_for_status()
    r.encoding = "utf-8"
    return r.text


def find_degree_table(html: str) -> pd.DataFrame:
    tables = pd.read_html(html, flavor="bs4")
    candidates = []
    for df in tables:
        flat_cols = " ".join(str(c) for c in df.columns)
        flat_head = " ".join(str(x) for x in df.head(5).to_numpy().ravel())
        searchable = flat_cols + " " + flat_head
        if "Merkez" in searchable and "HDD" in searchable and "CDD" in searchable:
            candidates.append(df)
    if not candidates:
        if not tables:
            raise RuntimeError("MGM sayfasında tablo bulunamadı.")
        return max(tables, key=lambda x: x.shape[0] * x.shape[1])
    return max(candidates, key=lambda x: x.shape[0] * x.shape[1])


def normalize_table(df: pd.DataFrame) -> pd.DataFrame:
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [" ".join(str(x) for x in tup if str(x) != "nan").strip() for tup in df.columns]
    else:
        df.columns = [str(c).strip() for c in df.columns]

    expected = ["Merkez", "G/D", *MONTHS, "Yıllık"]
    if df.shape[1] < len(expected):
        raise RuntimeError(f"Beklenen kolon sayısı yok. Bulunan tablo boyutu: {df.shape}")
    df = df.iloc[:, :len(expected)].copy()
    df.columns = expected
    return df


def load_mapping(path: Path = MAPPING_FILE) -> dict[str, dict[str, str]]:
    if not path.exists():
        raise FileNotFoundError(
            f"Mapping dosyası bulunamadı: {path}. Colab'a mgm_station_mapping_checked.xlsx yükleyin."
        )

    mapping_df = pd.read_excel(path, sheet_name=0, dtype=str).fillna("")
    required = ["station_key", "station_name", "province", "district", "confidence", "note"]
    missing = [c for c in required if c not in mapping_df.columns]
    if missing:
        raise ValueError(f"Mapping dosyasında eksik kolon var: {missing}")

    mapping: dict[str, dict[str, str]] = {}
    for _, row in mapping_df.iterrows():
        key = str(row["station_key"]).strip()
        if not key:
            continue
        mapping[key] = {
            "province": str(row.get("province", "")).strip(),
            "district": str(row.get("district", "")).strip(),
            "confidence": str(row.get("confidence", "")).strip() or "unknown",
            "note": str(row.get("note", "")).strip(),
        }
    return mapping


def rows_from_year(year: int, mapping: dict[str, dict[str, str]]) -> list[dict[str, Any]]:
    html = fetch_html(year)
    df = normalize_table(find_degree_table(html))
    rows: list[dict[str, Any]] = []

    current_station = None
    station_records: dict[str, list[int]] = {}

    def flush_station(station: str, recs: dict[str, list[int]]) -> None:
        if not station or "HDD" not in recs or "CDD" not in recs:
            return

        station_key = slugify(station)
        map_row = mapping.get(station_key)
        if map_row:
            province = map_row["province"]
            district = map_row["district"]
            mapping_confidence = map_row["confidence"]
            mapping_note = map_row["note"]
        else:
            province = ""
            district = ""
            mapping_confidence = "unknown"
            mapping_note = "Mapping bulunamadı"

        hdd = recs.get("HDD", [0] * 13)
        hdd_days = recs.get("T≤15 °C", recs.get("T<=15 °C", [0] * 13))
        cdd = recs.get("CDD", [0] * 13)
        cdd_days = recs.get("T>22 °C", [0] * 13)

        for idx, month in enumerate(range(1, 13)):
            rows.append({
                "station_key": station_key,
                "station_name": station,
                "province": province,
                "district": district,
                "year": year,
                "month": month,
                "hdd": int(hdd[idx]),
                "cdd": int(cdd[idx]),
                "hdd_days": int(hdd_days[idx]),
                "cdd_days": int(cdd_days[idx]),
                "annual_hdd": int(hdd[12]),
                "annual_cdd": int(cdd[12]),
                "source": "MGM",
                "source_url": SOURCE_URL,
                "is_official": True,
                "mapping_confidence": mapping_confidence,
                "mapping_note": mapping_note,
            })

    for _, raw in df.iterrows():
        station_cell = raw["Merkez"]
        gd = str(raw["G/D"]).strip()
        station = "" if pd.isna(station_cell) else str(station_cell).strip()

        if station and station.lower() != "nan":
            if current_station and station != current_station:
                flush_station(current_station, station_records)
                station_records = {}
            current_station = station

        if not current_station or gd in {"", "nan", "NaN"}:
            continue

        values = [clean_int(raw[col]) for col in [*MONTHS, "Yıllık"]]
        gd_norm = gd.strip()
        if gd_norm.startswith("T") and "15" in gd_norm:
            gd_norm = "T≤15 °C"
        elif gd_norm.startswith("T") and "22" in gd_norm:
            gd_norm = "T>22 °C"
        elif "HDD" in gd_norm:
            gd_norm = "HDD"
        elif "CDD" in gd_norm:
            gd_norm = "CDD"
        station_records[gd_norm] = values

    if current_station:
        flush_station(current_station, station_records)
    return rows


def write_excel(out: pd.DataFrame, output: Path = OUTPUT) -> None:
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        out.to_excel(writer, index=False, sheet_name="mgm_degree_days")

        # Basit kontrol sayfası
        summary = pd.DataFrame([
            {"metric": "total_rows", "value": len(out)},
            {"metric": "unique_stations", "value": out["station_key"].nunique()},
            {"metric": "unknown_mapping_rows", "value": int((out["mapping_confidence"] == "unknown").sum())},
            {"metric": "unknown_mapping_stations", "value": out.loc[out["mapping_confidence"] == "unknown", "station_key"].nunique()},
            {"metric": "years", "value": f"{out['year'].min()}-{out['year'].max()}"},
        ])
        summary.to_excel(writer, index=False, sheet_name="Kontrol")

        unknown = out.loc[out["mapping_confidence"] == "unknown", ["station_key", "station_name"]].drop_duplicates()
        unknown.to_excel(writer, index=False, sheet_name="Mapping_Bulunamadi")

        wb = writer.book
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            ws.freeze_panes = "A2"
            ws.auto_filter.ref = ws.dimensions
            for col in ws.columns:
                max_len = min(max(len(str(cell.value)) if cell.value is not None else 0 for cell in col) + 2, 45)
                ws.column_dimensions[col[0].column_letter].width = max_len


def main() -> None:
    mapping = load_mapping(MAPPING_FILE)
    current_year = datetime.now().year
    years = list(range(current_year - 10, current_year))

    all_rows: list[dict[str, Any]] = []
    for y in years:
        print(f"MGM veri çekiliyor: {y}")
        all_rows.extend(rows_from_year(y, mapping))

    columns = [
        "station_key", "station_name", "province", "district", "year", "month",
        "hdd", "cdd", "hdd_days", "cdd_days", "annual_hdd", "annual_cdd",
        "source", "source_url", "is_official", "mapping_confidence", "mapping_note"
    ]
    out = pd.DataFrame(all_rows, columns=columns)
    write_excel(out, OUTPUT)
    print(f"Tamamlandı: {OUTPUT.resolve()} | Satır sayısı: {len(out):,}")
    print("Kontrol: Excel içinde 'Kontrol' ve 'Mapping_Bulunamadi' sayfalarına bakın.")


if __name__ == "__main__":
    main()
