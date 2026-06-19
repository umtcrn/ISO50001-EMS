export interface MatrixLevel {
  value: number;
  label: string;
}

export interface MatrixGrade {
  min: number;
  max: number;
  label: string;
  shortLabel: string;
  cellStyle: string;
  badgeStyle: string;
}

export interface MatrixConfig {
  title: string;
  levels: MatrixLevel[];
  grades: MatrixGrade[];
}

export const MATRIX_LEVELS: MatrixLevel[] = [
  { value: 1, label: "Çok Düşük" },
  { value: 2, label: "Düşük" },
  { value: 3, label: "Orta" },
  { value: 4, label: "Yüksek" },
  { value: 5, label: "Çok Yüksek" },
];

export const riskMatrixConfig: MatrixConfig = {
  title: "Risk Değerlendirme Matrisi",
  levels: MATRIX_LEVELS,
  grades: [
    { min: 1,  max: 3,  label: "Önemsiz (1–3)",        shortLabel: "Önemsiz",        cellStyle: "bg-green-900/30 border-green-700/40",  badgeStyle: "bg-green-900/20 text-green-500 border-green-700/30" },
    { min: 4,  max: 6,  label: "Katlanılabilir (4–6)",  shortLabel: "Katlanılabilir", cellStyle: "bg-green-500/20 border-green-500/35",  badgeStyle: "bg-green-500/10 text-green-400 border-green-500/25" },
    { min: 8,  max: 12, label: "Orta (8–12)",           shortLabel: "Orta",           cellStyle: "bg-yellow-500/20 border-yellow-500/35", badgeStyle: "bg-yellow-500/10 text-yellow-400 border-yellow-500/25" },
    { min: 15, max: 20, label: "Önemli (15–20)",        shortLabel: "Önemli",         cellStyle: "bg-orange-500/25 border-orange-500/40", badgeStyle: "bg-orange-500/10 text-orange-400 border-orange-500/25" },
    { min: 25, max: 25, label: "Katlanılamaz (25)",     shortLabel: "Katlanılamaz",   cellStyle: "bg-red-700/30 border-red-600/50",       badgeStyle: "bg-red-700/10 text-red-400 border-red-600/25" },
  ],
};

export const opportunityMatrixConfig: MatrixConfig = {
  title: "Fırsat Değerlendirme Matrisi",
  levels: MATRIX_LEVELS,
  grades: [
    { min: 1,  max: 3,  label: "Önemsiz (1–3)",    shortLabel: "Önemsiz",      cellStyle: "bg-red-700/20 border-red-600/40",       badgeStyle: "bg-red-700/10 text-red-400 border-red-600/25" },
    { min: 4,  max: 6,  label: "Düşük (4–6)",       shortLabel: "Düşük",        cellStyle: "bg-orange-500/25 border-orange-500/40", badgeStyle: "bg-orange-500/10 text-orange-400 border-orange-500/25" },
    { min: 8,  max: 12, label: "Orta (8–12)",        shortLabel: "Orta",         cellStyle: "bg-yellow-500/20 border-yellow-500/35", badgeStyle: "bg-yellow-500/10 text-yellow-400 border-yellow-500/25" },
    { min: 15, max: 20, label: "Yüksek (15–20)",     shortLabel: "Yüksek",       cellStyle: "bg-green-500/20 border-green-500/35",  badgeStyle: "bg-green-500/10 text-green-400 border-green-500/25" },
    { min: 25, max: 25, label: "Çok Yüksek (25)",    shortLabel: "Çok Yüksek",   cellStyle: "bg-green-700/35 border-green-600/50",  badgeStyle: "bg-green-700/10 text-green-400 border-green-600/25" },
  ],
};
