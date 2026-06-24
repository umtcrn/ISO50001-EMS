import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PRIORITY_RULES = [
  { label: "Pay ≥ %20 + Fırsat Var", priority: 1, color: "bg-red-500/20 text-red-400 border-red-500/30" },
  { label: "Pay ≥ %20 + Fırsat Yok", priority: 2, color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  { label: "Pay %10–20 + Fırsat Var", priority: 2, color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  { label: "Pay %10–20 + Fırsat Yok", priority: 3, color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  { label: "Pay %5–10 + Fırsat Var", priority: 3, color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  { label: "Pay %5–10 + Fırsat Yok", priority: 4, color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { label: "Pay <%5 + Fırsat Var", priority: 4, color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { label: "Pay <%5 + Fırsat Yok", priority: null, color: "bg-muted text-muted-foreground" },
];

export default function SeuMethodTab() {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Metot: Tüketim Payı × Fırsat Matrisi</CardTitle>
          <CardDescription>consumption_share_opportunity_matrix — ISO 50001 uyumlu ÖEK belirleme metodu</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-3 text-muted-foreground">
          <p>Bu metot, enerji tüketiminin belirli bir kırılım seviyesindeki payını ve ilgili iyileştirme fırsatını birleştirerek önem önceliğini hesaplar.</p>
          <p><span className="text-foreground font-medium">Toplam TEP:</span> Seçili birimin ilgili yıl/dönemindeki tüm consumption kayıtlarının TEP toplamıdır. Firma geneli değil, birim geneli kullanılır.</p>
          <p><span className="text-foreground font-medium">Pay hesabı:</span> energyUseGroupTotalTep / selectedUnitTotalTep × 100</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Öncelik Matrisi</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {PRIORITY_RULES.map((rule, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{rule.label}</span>
                <Badge variant="outline" className={rule.priority !== null ? rule.color : "bg-muted text-muted-foreground"}>
                  {rule.priority !== null ? `Öncelik ${rule.priority} — ÖEK Adayı` : "ÖEK Dışı"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Kullanıcı Kararları</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p><span className="text-green-400 font-medium">ÖEK Olarak Kabul Et:</span> Sistem önerisiyle veya öneriye rağmen ÖEK olarak tanımlar.</p>
          <p><span className="text-red-400 font-medium">ÖEK Dışı:</span> ÖEK adayı önerilen bir kalemi dışarıda bırakır. Gerekçe girilmesi zorunludur.</p>
          <p><span className="text-yellow-400 font-medium">İzle:</span> Henüz ÖEK tanımlamadan takibe alır. Gerekçe zorunludur (sistem önerisiyle çelişiyorsa).</p>
          <p className="pt-1 border-t border-border">Kullanıcı kararı sistem önerisinden farklıysa <span className="text-foreground">karar gerekçesi zorunludur</span>. Bu bilgi ISO 50001 denetimlerinde kullanılır.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Analiz Seviyeleri</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1.5 text-muted-foreground">
          <p><span className="text-foreground">Enerji Kullanım Grubu (varsayılan):</span> ISO 50001 ana analiz seviyesi. Sayaçların atandığı kullanım gruplarına göre kırılım.</p>
          <p><span className="text-foreground">Sayaç:</span> Bireysel sayaç bazında tüketim ve pay hesabı.</p>
          <p><span className="text-foreground">Alt Birim:</span> Lokasyon veya departman bazında kırılım.</p>
          <p><span className="text-foreground">Enerji Kaynağı:</span> Elektrik, doğalgaz, buhar vb. kaynak bazında karşılaştırma.</p>
          <p><span className="text-foreground">Birim:</span> Tek birim için özet analiz (tek satır).</p>
        </CardContent>
      </Card>
    </div>
  );
}
