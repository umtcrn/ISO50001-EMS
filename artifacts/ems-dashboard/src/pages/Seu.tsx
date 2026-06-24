import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useUnit } from "@/context/UnitContext";
import { useCompany } from "@/context/CompanyContext";
import { useListSeu, useCreateSeu, useUpdateSeu, useDeleteSeu, getListSeuQueryKey } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, AlertTriangle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import SeuAnalysisTab from "@/components/seu/SeuAnalysisTab";
import SeuAssessmentList from "@/components/seu/SeuAssessmentList";
import SeuMethodTab from "@/components/seu/SeuMethodTab";
import SeuAdminTabs from "@/components/seu/SeuAdminTabs";

const CATEGORIES = [
  { value: "uretim", label: "Üretim" },
  { value: "aydinlatma", label: "Aydınlatma" },
  { value: "iklimlendirme", label: "İklimlendirme" },
  { value: "kompresör", label: "Kompresör" },
  { value: "diger", label: "Diğer" },
];

interface SeuForm {
  name: string; category: string; annualKwh: string; percentage: string;
  priority: string; targetReductionPercent: string; responsible: string; notes: string;
}
const EMPTY: SeuForm = { name: "", category: "uretim", annualKwh: "", percentage: "", priority: "1", targetReductionPercent: "", responsible: "", notes: "" };

function ManualSeuList() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { unitId } = useUnit();
  const { companyId } = useCompany();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const unitParam = unitId !== null ? { unitId } : companyId !== null ? { companyId } : undefined;

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SeuForm>(EMPTY);

  const { data: items, isLoading } = useListSeu(unitParam, { query: { queryKey: getListSeuQueryKey(unitParam) } });
  const createSeu = useCreateSeu();
  const updateSeu = useUpdateSeu();
  const deleteSeu = useDeleteSeu();

  function openCreate() { setEditingId(null); setForm(EMPTY); setOpen(true); }
  function openEdit(item: any) {
    setEditingId(item.id);
    setForm({ name: item.name, category: item.category, annualKwh: item.annualKwh.toString(), percentage: item.percentage.toString(), priority: item.priority.toString(), targetReductionPercent: item.targetReductionPercent?.toString() ?? "", responsible: item.responsible ?? "", notes: item.notes ?? "" });
    setOpen(true);
  }

  function handleSave() {
    if (!form.name || !form.category) { toast({ title: "Zorunlu alanlar eksik", variant: "destructive" }); return; }
    const data: any = { name: form.name, category: form.category, annualKwh: parseFloat(form.annualKwh) || 0, percentage: parseFloat(form.percentage) || 0, priority: parseInt(form.priority) || 1 };
    if (form.targetReductionPercent) data.targetReductionPercent = parseFloat(form.targetReductionPercent);
    if (form.responsible) data.responsible = form.responsible;
    if (form.notes) data.notes = form.notes;
    if (unitId !== null) data.unitId = unitId;
    if (editingId !== null) {
      updateSeu.mutate({ id: editingId, data }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListSeuQueryKey(unitParam) }); setOpen(false); toast({ title: "Güncellendi" }); } });
    } else {
      createSeu.mutate({ data }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListSeuQueryKey(unitParam) }); setOpen(false); toast({ title: "ÖEK eklendi" }); } });
    }
  }

  function handleDelete(id: number) {
    deleteSeu.mutate({ id }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListSeuQueryKey(unitParam) }); toast({ title: "Silindi" }); } });
  }

  const sorted = [...(items ?? [])].sort((a: any, b: any) => a.priority - b.priority);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 p-3 rounded-md border border-amber-500/20 bg-amber-500/5 text-sm text-amber-300">
        <Info className="h-4 w-4 shrink-0" />
        <span>Bu kayıtlar tüketim analizinden otomatik oluşturulmadı. ISO denetimi için karar gerekçesi girmeniz önerilir.</span>
      </div>

      <div className="flex justify-end">
        <Button onClick={openCreate} size="sm" className="gap-2"><Plus className="h-4 w-4" /> Manuel ÖEK Ekle</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : sorted.length === 0 ? (
        <Card><CardContent className="py-12 flex flex-col items-center text-muted-foreground">
          <AlertTriangle className="h-8 w-8 mb-2 opacity-30" />
          <p className="text-sm">Manuel ÖEK kaydı yok</p>
        </CardContent></Card>
      ) : (
        sorted.map((item: any, idx: number) => (
          <Card key={item.id} className="group">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{item.name}</p>
                    <Badge variant="outline" className="text-xs">{CATEGORIES.find(c => c.value === item.category)?.label ?? item.category}</Badge>
                    <Badge variant="outline" className="text-xs">Öncelik {item.priority}</Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    <span className="font-mono text-foreground">{Math.round(item.annualKwh).toLocaleString("tr-TR")} kWh/yıl</span>
                    <span className="text-teal-400">%{item.percentage}</span>
                    {item.targetReductionPercent && <span className="text-amber-400">Hedef: -%{item.targetReductionPercent}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editingId !== null ? "ÖEK Düzenle" : "Yeni Manuel ÖEK"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Ad *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ör. Ana Kompresör Sistemi" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kategori *</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Öncelik</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[1,2,3,4,5].map(n => <SelectItem key={n} value={n.toString()}>{n}. Öncelik</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Yıllık Tüketim (kWh)</Label>
                <Input type="number" value={form.annualKwh} onChange={e => setForm(f => ({ ...f, annualKwh: e.target.value }))} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Pay (%)</Label>
                <Input type="number" value={form.percentage} onChange={e => setForm(f => ({ ...f, percentage: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Hedef Azaltım (%)</Label>
                <Input type="number" value={form.targetReductionPercent} onChange={e => setForm(f => ({ ...f, targetReductionPercent: e.target.value }))} placeholder="İsteğe bağlı" />
              </div>
              <div className="space-y-1.5">
                <Label>Sorumlu</Label>
                <Input value={form.responsible} onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))} placeholder="Birim / Kişi" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Not</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>İptal</Button>
            <Button onClick={handleSave} disabled={createSeu.isPending || updateSeu.isPending}>{editingId !== null ? "Güncelle" : "Ekle"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Seu() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Önemli Enerji Kullanımları (ÖEK)</h1>
        <p className="text-sm text-muted-foreground mt-1">ISO 50001 — Significant Energy Uses (SEU)</p>
      </div>

      {isAdmin ? (
        <SeuAdminTabs />
      ) : (
        <Tabs defaultValue="analysis">
          <TabsList className="mb-4">
            <TabsTrigger value="analysis">ÖEK Analizi</TabsTrigger>
            <TabsTrigger value="list">ÖEK Listesi</TabsTrigger>
            <TabsTrigger value="manual">Manuel Kayıt</TabsTrigger>
            <TabsTrigger value="method">Metot</TabsTrigger>
          </TabsList>

          <TabsContent value="analysis">
            <SeuAnalysisTab isAdminMode={false} />
          </TabsContent>

          <TabsContent value="list">
            <SeuAssessmentList showAllTypes={false} />
          </TabsContent>

          <TabsContent value="manual">
            <ManualSeuList />
          </TabsContent>

          <TabsContent value="method">
            <SeuMethodTab />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
