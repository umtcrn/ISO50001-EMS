import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, FileText, AlertTriangle } from "lucide-react";
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

interface Props {
  unitIdFilter?: number | null;
  recordTypeFilter?: string;
  showAllTypes?: boolean;
}

export default function SeuAssessmentList({ unitIdFilter, recordTypeFilter, showAllTypes }: Props) {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

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

  if (isLoading) {
    return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;
  }

  if (!assessments?.length) {
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
    <div className="space-y-3">
      {assessments.map((a: any) => {
        const canDelete = isAdmin
          ? a.recordType !== "unit_official"
          : a.recordType === "unit_official";

        return (
          <Card key={a.id} className="group">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-9 w-9 rounded-md bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
                    <FileText className="h-4.5 w-4.5 text-teal-400" />
                  </div>
                  <div>
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
                      <span>{a.itemCount ?? 0} kalem</span>
                      {a.seuCount > 0 && <span className="text-amber-400">{a.seuCount} ÖEK</span>}
                      <span>{new Date(a.createdAt).toLocaleDateString("tr-TR")}</span>
                    </div>
                  </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {canDelete && (
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
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
      })}
    </div>
  );
}
