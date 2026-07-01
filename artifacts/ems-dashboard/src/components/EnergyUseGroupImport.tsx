import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, X, ChevronDown, ChevronUp, SkipForward } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const COLUMN_ALIASES: Record<string, string> = {
  unit_name: "unit_name", "birim adı": "unit_name", birim: "unit_name", unit: "unit_name",
  sub_unit_name: "sub_unit_name", "alt birim": "sub_unit_name", alt_birim: "sub_unit_name", subunit: "sub_unit_name",
  energy_source_name: "energy_source_name", "enerji kaynağı": "energy_source_name", kaynak: "energy_source_name", energysource: "energy_source_name",
  group_name: "group_name", "grup adı": "group_name", grup: "group_name", groupname: "group_name",
  description: "description", "açıklama": "description", aciklama: "description",
  is_active: "is_active", aktif: "is_active", isactive: "is_active", durum: "is_active",
};

function normalizeKey(k: string): string {
  return k.toLowerCase().trim().replace(/\s+/g, "_");
}

function mapRow(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const nk = normalizeKey(k);
    const mapped = COLUMN_ALIASES[nk] ?? COLUMN_ALIASES[k.toLowerCase().trim()] ?? nk;
    out[mapped] = v;
  }
  return out;
}

function validateRow(row: Record<string, unknown>, idx: number): string | null {
  const groupName = String(row.group_name ?? "").trim();
  if (!groupName) return `Satır ${idx + 1}: Grup adı (group_name) zorunludur`;
  return null;
}

function generateTemplate(): void {
  const rows = [
    { unit_name: "Merkez Birim", sub_unit_name: "Üretim Hattı 1", energy_source_name: "Elektrik", group_name: "Kazan Dairesi", description: "Ön ısıtma grubu", is_active: "true" },
    { unit_name: "Merkez Birim", sub_unit_name: "İdari Bina", energy_source_name: "Doğalgaz", group_name: "Klima Sistemi", description: "", is_active: "true" },
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Enerji Kullanım Grupları");
  XLSX.writeFile(wb, "enerji_kullanim_grubu_sablonu.xlsx");
}

interface ImportResult {
  imported: number;
  total: number;
  errors: { row: number; message: string }[];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function EnergyUseGroupImport({ open, onOpenChange }: Props) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dupPanelOpen, setDupPanelOpen] = useState(false);
  const [errPanelOpen, setErrPanelOpen] = useState(false);

  function reset() {
    setFileName(null);
    setRows([]);
    setValidationErrors([]);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  function parseFile(file: File) {
    setResult(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
        const mapped = raw.map(mapRow);
        const errs: string[] = [];
        mapped.forEach((r, i) => {
          const err = validateRow(r, i);
          if (err) errs.push(err);
        });
        setRows(mapped);
        setValidationErrors(errs);
      } catch {
        toast({ title: "Dosya okunamadı", description: "Geçerli bir CSV veya Excel dosyası seçin", variant: "destructive" });
        reset();
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  }, []);

  async function handleImport() {
    if (rows.length === 0 || validationErrors.length > 0) return;
    setImporting(true);
    try {
      const res = await fetch("/api/energy-use-groups/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? "İçe aktarma başarısız", variant: "destructive" });
        return;
      }
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["energy-use-groups"] });
      if (data.imported > 0) {
        toast({ title: `${data.imported} grup başarıyla içe aktarıldı` });
      }
    } catch {
      toast({ title: "Bağlantı hatası", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  const previewRows = rows.slice(0, 8);
  const hasErrors = validationErrors.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Toplu Enerji Kullanım Grubu İçe Aktar
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          {!result && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Zorunlu sütun:{" "}
                  <span className="font-mono text-xs bg-muted px-1 rounded">group_name</span>{" "}
                  — İsteğe bağlı:{" "}
                  <span className="font-mono text-xs bg-muted px-1 rounded">unit_name</span>{" "}
                  <span className="font-mono text-xs bg-muted px-1 rounded">sub_unit_name</span>{" "}
                  <span className="font-mono text-xs bg-muted px-1 rounded">energy_source_name</span>
                </p>
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={generateTemplate}>
                  <Download className="h-3.5 w-3.5" />
                  Şablon İndir
                </Button>
              </div>

              <div
                className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
                  ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
              >
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                {fileName ? (
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-sm font-medium">{fileName}</span>
                    <button className="text-muted-foreground hover:text-foreground" onClick={e => { e.stopPropagation(); reset(); }}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium">Dosyayı buraya sürükleyin veya tıklayın</p>
                    <p className="text-xs text-muted-foreground mt-1">CSV, XLS, XLSX desteklenir</p>
                  </>
                )}
              </div>

              {hasErrors && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-destructive text-sm font-medium">
                    <AlertCircle className="h-4 w-4" />
                    {validationErrors.length} doğrulama hatası
                  </div>
                  {validationErrors.slice(0, 5).map((e, i) => (
                    <p key={i} className="text-xs text-destructive/80 pl-6">{e}</p>
                  ))}
                  {validationErrors.length > 5 && (
                    <p className="text-xs text-muted-foreground pl-6">… ve {validationErrors.length - 5} hata daha</p>
                  )}
                </div>
              )}

              {rows.length > 0 && !hasErrors && (
                <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-600">{rows.length} satır doğrulandı, içe aktarmaya hazır</span>
                </div>
              )}

              {previewRows.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">
                    Önizleme {rows.length > 8 ? `(ilk 8 / ${rows.length} satır)` : ""}
                  </p>
                  <div className="rounded-md border overflow-auto max-h-52">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs">
                          <TableHead className="py-2">Birim</TableHead>
                          <TableHead className="py-2">Alt Birim</TableHead>
                          <TableHead className="py-2">Enerji Kaynağı</TableHead>
                          <TableHead className="py-2">Grup Adı</TableHead>
                          <TableHead className="py-2">Açıklama</TableHead>
                          <TableHead className="py-2">Aktif</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewRows.map((r, i) => (
                          <TableRow key={i} className="text-xs">
                            <TableCell className="py-1.5 text-muted-foreground">{String(r.unit_name ?? "")}</TableCell>
                            <TableCell className="py-1.5 text-muted-foreground">{String(r.sub_unit_name ?? "")}</TableCell>
                            <TableCell className="py-1.5 text-muted-foreground">{String(r.energy_source_name ?? "")}</TableCell>
                            <TableCell className="py-1.5 font-medium">{String(r.group_name ?? "")}</TableCell>
                            <TableCell className="py-1.5 max-w-[120px] truncate text-muted-foreground">{String(r.description ?? "")}</TableCell>
                            <TableCell className="py-1.5">{String(r.is_active ?? "true")}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </>
          )}

          {result && (() => {
            const duplicates = result.errors.filter(e => e.message.includes("zaten mevcut"));
            const realErrors = result.errors.filter(e => !e.message.includes("zaten mevcut"));
            const allOk = result.imported === result.total;
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-xl font-bold text-green-500">{result.imported}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Aktarıldı</p>
                  </div>
                  <div className={`rounded-lg border bg-card p-3 text-center ${duplicates.length > 0 ? "border-amber-500/30" : ""}`}>
                    <p className={`text-xl font-bold ${duplicates.length > 0 ? "text-amber-500" : "text-muted-foreground"}`}>{duplicates.length}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Atlandı</p>
                  </div>
                  <div className={`rounded-lg border bg-card p-3 text-center ${realErrors.length > 0 ? "border-destructive/30" : ""}`}>
                    <p className={`text-xl font-bold ${realErrors.length > 0 ? "text-destructive" : "text-muted-foreground"}`}>{realErrors.length}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Hata</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-xl font-bold">{result.total}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Toplam</p>
                  </div>
                </div>

                {allOk && (
                  <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2.5 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="text-sm text-green-600 font-medium">Tüm satırlar başarıyla içe aktarıldı!</span>
                  </div>
                )}

                {duplicates.length > 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-amber-500/10 transition-colors"
                      onClick={() => setDupPanelOpen(v => !v)}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-amber-600">
                        <SkipForward className="h-4 w-4" />
                        {duplicates.length} satır atlandı — zaten mevcut kayıtlar
                      </span>
                      {dupPanelOpen ? <ChevronUp className="h-4 w-4 text-amber-500 shrink-0" /> : <ChevronDown className="h-4 w-4 text-amber-500 shrink-0" />}
                    </button>
                    {dupPanelOpen && (
                      <div className="border-t border-amber-500/20 px-3 py-2 space-y-1 max-h-40 overflow-y-auto">
                        {duplicates.map((e, i) => (
                          <p key={i} className="text-xs text-amber-700/90 flex items-start gap-1.5">
                            <span className="font-mono shrink-0 text-amber-500/70">S{e.row}</span>
                            {e.message}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {realErrors.length > 0 && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-destructive/10 transition-colors"
                      onClick={() => setErrPanelOpen(v => !v)}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        {realErrors.length} satır aktarılamadı — hata
                      </span>
                      {errPanelOpen ? <ChevronUp className="h-4 w-4 text-destructive/70 shrink-0" /> : <ChevronDown className="h-4 w-4 text-destructive/70 shrink-0" />}
                    </button>
                    {errPanelOpen && (
                      <div className="border-t border-destructive/20 px-3 py-2 space-y-1 max-h-40 overflow-y-auto">
                        {realErrors.map((e, i) => (
                          <p key={i} className="text-xs text-destructive/80 flex items-start gap-1.5">
                            <span className="font-mono shrink-0 text-destructive/50">S{e.row}</span>
                            {e.message}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        <DialogFooter className="mt-2 gap-2">
          {result ? (
            <>
              <Button variant="outline" onClick={reset}>Yeni Dosya Yükle</Button>
              <Button onClick={handleClose}>Kapat</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>İptal</Button>
              <Button
                onClick={handleImport}
                disabled={rows.length === 0 || hasErrors || importing}
                className="gap-2 min-w-[130px]"
              >
                {importing
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Aktarılıyor…</>
                  : <><Upload className="h-4 w-4" /> {rows.length > 0 ? `${rows.length} Satırı Aktar` : "İçe Aktar"}</>
                }
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
