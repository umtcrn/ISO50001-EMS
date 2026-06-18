import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "./AuthContext";

interface CompanyContextType {
  companyId: number | null;
  setCompanyId: (id: number | null) => void;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [companyId, setCompanyIdState] = useState<number | null>(null);

  useEffect(() => {
    if (user?.role !== "superadmin") {
      setCompanyIdState(null);
    }
  }, [user]);

  function setCompanyId(id: number | null) {
    if (user?.role !== "superadmin") return;
    setCompanyIdState(id);
  }

  return (
    <CompanyContext.Provider value={{ companyId, setCompanyId }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (ctx === undefined) throw new Error("useCompany must be used within a CompanyProvider");
  return ctx;
}
