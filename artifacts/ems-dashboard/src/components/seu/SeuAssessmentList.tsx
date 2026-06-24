import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, FileText, AlertTriangle, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

const LEVEL_LABELS: Record<string, string> = {
  energyUseGroup: "Enerji Kullanım Grubu",
  meter: "Sayaç",
  subUnit: "Alt Birim",
  energySource: "Enerji Kaynağı",
  unit: "Birim",
};

const RECORD_TYPE_LABELS: Record<string, string> = {
  unit_official: "Resmi Kayıt",
  admin_review: "Admin Analizi",
  company_summary: "Firma Özeti",
};

const MONTH_NAMES = ["", "Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

const DECISION_LABEL: Record<string, string> = {
  accepted_as_seu: "ÖEK",
  not_seu: "ÖEK Dışı",
  monitor: "İzle",
};

const DECISION_STYLE: Record<string, string> = {
  accepted_as_seu: "border-teal-500/30 text-teal-400 bg-teal-500/10",
  not_seu: "border-red-500/30 text-red-400 bg-red-500/10",
  monitor: "border-amber-500/30 text-amber-400 bg-amber-500/10",
};

const PRIORITY_COLORS: Record<number, string> = {
  1: "bg-red-500/20 text-red-400 border-red-500/30",
  2: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  3: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  4: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

type DecisionFilter = "all" | "accepted_as_seu" | "monitor" | "not_seu";

interface Props {
  unitIdFilter?: number | null;
  recordTypeFilter?: string;
  showAllTypes?: boolean;
}

function AssessmentDetailModal({ assessmentId, token, onClose }: { assessmentId: number; token: string; onClose: () => void }) {
  const [itemFilter, setItemFilter] = useState<DecisionFilter>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["seu-assessment-detail", assessmentId],
    queryFn: async () => {
      const res = await fetch(`/api/seu/assessments/${assessmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Yüklenemedi");
      return res.json() as Promise<any>;
    },
    enabled: !!assessmentId,
  });

  const items: any[] = data?.items ?? [];
  const filtered = itemFilter === "all" ? items : items.filter((i: any) => i.userDecision === itemFilter);

  const seuCount = items.filter((i: any) => i.userDecision === "accepted_as_seu").length;
  const monitorCount = items.filter((i: any) => i.userDecision === "monitor").length;
  const notSeuCount = items.filter((i: any) => i.userDecision === "not_seu").length;

  const FILTER_TABS: { value: DecisionFilter; label: string; count: number }[] = [
    { value: "all", label: "Tümü", count: items.length },
    { value: "accepted_as_seu", label: "ÖEK", count: seuCount },
    { value: "monitor", label: "İzle", count: monitorCount },
    { value: "not_seu", label: "ÖEK Dışı", count: notSeuCount },
  ];

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            ÖEK Değerlendirme Detayı
            {data && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {data.unitName} · {data.year} · {LEVEL_LABELS[data.analysisLevel] ?? data.analysisLevel}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2 py-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {FILTER_TABS.map(tab => (
                <button
                  key={tab.value}
                  onClick={() => setItemFilter(tab.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    itemFilter === tab.value
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">Bu filtrede kalem yok</div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left p-2 pl-3 font-medium text-muted-foreground whitespace-nowrap">Ad</th>
                      <th className="text-right p-2 font-medium text-muted-foreground whitespace-nowrap">TEP</th>
                      <th className="text-right p-2 font-medium text-muted-foreground whitespace-nowrap">Pay %</th>
                      <th className="text-center p-2 font-medium text-muted-foreground whitespace-nowrap">Fırsat</th>
                      <th className="text-center p-2 font-medium text-muted-foreground whitespace-nowrap">Öncelik</th>
                      <th className="text-center p-2 font-medium text-muted-foreground whitespace-nowrap">Sistem Önerisi</th>
                      <th className="text-center p-2 font-medium text-muted-foreground whitespace-nowrap">Karar</th>
                      <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">Gerekçe</th>
                      <th className="text-right p-2 font-medium text-muted-foreground whitespace-nowrap">Hedef %</th>
                      <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">Sorumlu</th>
                      <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">Not</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item: any) => (
                      <tr key={item.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="p-2 pl-3 font-medium max-w-[160px] truncate" title={item.name}>{item.name}</td>
                        <td className="p-2 text-right font-mono">{Number(item.energyTep).toFixed(4)}</td>
                        <td className="p-2 text-right font-mono font-medium">{Number(item.consumptionSharePercent).toFixed(1)}%</td>
                        <td className="p-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-xs border ${item.hasOpportunity ? "border-green-500/30 text-green-400 bg-green-500/10" : "border-border text-muted-foreground bg-muted/20"}`}>
                            {item.hasOpportunity ? "Var" : "Yok"}
                          </span>
                        </td>
                        <td className="p-2 text-center">
                          {item.priorityResult != null ? (
                            <Badge variant="outline" className={`text-xs ${PRIORITY_COLORS[item.priorityResult] ?? ""}`}>{item.priorityResult}</Badge>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-2 text-center">
                          <Badge variant="outline" className={`text-xs ${item.systemRecommendation === "seu_candidate" ? "border-teal-500/30 text-teal-400 bg-teal-500/10" : "border-muted text-muted-foreground"}`}>
                            {item.systemRecommendation === "seu_candidate" ? "ÖEK Adayı" : "ÖEK Dışı"}
                          </Badge>
                        </td>
                        <td className="p-2 text-center">
                          {item.userDecision ? (
                            <Badge variant="outline" className={`text-xs ${DECISION_STYLE[item.userDecision] ?? ""}`}>
                              {DECISION_LABEL[item.userDecision] ?? item.userDecision}
                            </Badge>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-2 max-w-[140px] truncate" title={item.decisionReason ?? ""}>
                          <span className="text-muted-foreground">{item.decisionReason || "—"}</span>
                        </td>
                        <td className="p-2 text-right text-muted-foreground">
                          {item.targetReductionPercent != null ? `%${item.targetReductionPercent}` : "—"}
                        </td>
                        <td className="p-2 max-w-[100px] truncate text-muted-foreground" title={item.responsible ?? ""}>
                          {item.responsible || "—"}
                        </td>
                        <td className="p-2 max-w-[120px] truncate text-muted-foreground" title={item.notes ?? ""}>
                          {item.notes || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function SeuAssessmentList({ unitIdFilter, recordTypeFilter, showAllTypes }: Props) {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>("all");
  const [detailId, setDetailId] = useState<number | null>(null);

  const params = new URLSearchParams();
  if (unitIdFilter) params.set("unitId", String(unitIdFilter));
  if (recordTypeFilter) params.set("recordType", recordTypeFilter);

  const { data: assessments, isLoading } = useQuery({
    queryKey: ["seu-assessments", unitIdFilter, recordTypeFilter],
    queryFn: async () => {
      const res = await fetch(`/api/seu/assessments?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Yüklenemedi");
      return res.json() as Promise<any[]>;
    },
    enabled: !!token,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/seu/assessments/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Silinemedi");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seu-assessments"] });
      toast({ title: "Değerlendirme silindi" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const allItems = assessments ?? [];

  const filtered = decisionFilter === "all" ? allItems : allItems.filter((a: any) => {
    if (decisionFilter === "accepted_as_seu") return (a.seuCount ?? 0) > 0;
    if (decisionFilter === "monitor") return (a.monitorCount ?? 0) > 0;
    if (decisionFilter === "not_seu") return (a.notSeuCount ?? 0) > 0;
    return true;
  });

  const totalSeu = allItems.reduce((s: number, a: any) => s + (a.seuCount ?? 0), 0);
  const totalMonitor = allItems.reduce((s: number, a: any) => s + (a.monitorCount ?? 0), 0);
  const totalNotSeu = allItems.reduce((s: number, a: any) => s + (a.notSeuCount ?? 0), 0);
  const totalItems = allItems.reduce((s: number, a: any) => s + (a.itemCount ?? 0), 0);

  const FILTER_TABS: { value: DecisionFilter; label: string; count: number; style?: string }[] = [
    { value: "all", label: "Tüm Kararlar", count: allItems.length },
    { value: "accepted_as_seu", label: "ÖEK", count: allItems.filter((a: any) => (a.seuCount ?? 0) > 0).length, style: "teal" },
    { value: "monitor", label: "İzle", count: allItems.filter((a: any) => (a.monitorCount ?? 0) > 0).length, style: "amber" },
    { value: "not_seu", label: "ÖEK Dışı", count: allItems.filter((a: any) => (a.notSeuCount ?? 0) > 0).length, style: "red" },
  ];

  if (isLoading) {
    return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;
  }

  if (!allItems.length) {
    return (
      <Card>
        <CardContent className="py-14 flex flex-col items-center text-muted-foreground">
          <AlertTriangle className="h-8 w-8 mb-3 opacity-30" />
          <p className="font-medium">Henüz kayıtlı ÖEK değerlendirmesi yok</p>
          <p className="text-sm mt-1">ÖEK Analizi sekmesinden analiz çalıştırıp kaydedebilirsiniz</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {totalItems > 0 && (
        <div className="flex items-center gap-4 p-3 rounded-md bg-muted/20 border border-border text-xs text-muted-foreground flex-wrap">
          <span className="font-medium text-foreground">{totalItems} toplam kalem</span>
          <span className="text-teal-400 font-medium">{totalSeu} ÖEK</span>
          <span className="text-amber-400 font-medium">{totalMonitor} İzle</span>
          <span className="text-red-400 font-medium">{totalNotSeu} ÖEK Dışı</span>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setDecisionFilter(tab.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              decisionFilter === tab.value
                ? "bg-primary/10 border-primary/30 text-primary"
                : "border-border text-muted-foreground hover:bg-muted/40"
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              Bu filtrede kayıt yok
            </CardContent>
          </Card>
        ) : (
          filtered.map((a: any) => {
            const canDelete = isAdmin
              ? a.recordType !== "unit_official"
              : a.recordType === "unit_official";

            return (
              <Card key={a.id} className="group">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5 h-9 w-9 rounded-md bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4 text-teal-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {a.unitName && <span className="text-sm font-semibold">{a.unitName}</span>}
                          <Badge variant="outline" className="text-xs">{a.year}</Badge>
                          {showAllTypes && (
                            <Badge variant="outline" className={`text-xs ${a.recordType === "unit_official" ? "border-teal-500/30 text-teal-400" : "border-violet-500/30 text-violet-400"}`}>
                              {RECORD_TYPE_LABELS[a.recordType] ?? a.recordType}
                            </Badge>
                          )}
                          {a.isOfficial && (
                            <Badge variant="outline" className="text-xs border-green-500/30 text-green-400">Resmi</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          <span>Dönem: {MONTH_NAMES[a.periodStart]}–{MONTH_NAMES[a.periodEnd]}</span>
                          <span>Seviye: {LEVEL_LABELS[a.analysisLevel] ?? a.analysisLevel}</span>
                          <span className="text-teal-400 font-medium">{(a.unitTotalTep ?? 0).toFixed(2)} TEP</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {(a.itemCount ?? 0) > 0 && (
                            <span className="text-xs text-muted-foreground">{a.itemCount} kalem</span>
                          )}
                          {(a.seuCount ?? 0) > 0 && (
                            <span className="text-xs text-teal-400 font-medium">{a.seuCount} ÖEK</span>
                          )}
                          {(a.monitorCount ?? 0) > 0 && (
                            <span className="text-xs text-amber-400 font-medium">{a.monitorCount} İzle</span>
                          )}
                          {(a.notSeuCount ?? 0) > 0 && (
                            <span className="text-xs text-red-400 font-medium">{a.notSeuCount} ÖEK Dışı</span>
                          )}
                          <span className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("tr-TR")}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() => setDetailId(a.id)}
                      >
                        Detay <ChevronRight className="h-3 w-3" />
                      </Button>
                      {canDelete && (
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => deleteMutation.mutate(a.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {detailId !== null && (
        <AssessmentDetailModal
          assessmentId={detailId}
          token={token ?? ""}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}
