import { useEffect, useState, createContext, useContext, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CompanySettings {
  id: string;
  company_name: string;
  company_name_en: string;
  logo_url: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  tax_number: string;
  commercial_register: string;
  business_activity: string;
  default_currency: string;
  fiscal_year_start: string;
  tax_rate: number;
  sales_invoice_prefix: string;
  purchase_invoice_prefix: string;
  sales_return_prefix: string;
  purchase_return_prefix: string;
  customer_payment_prefix: string;
  supplier_payment_prefix: string;
  payment_terms_days: number;
  show_tax_on_invoice: boolean;
  show_discount_on_invoice: boolean;
  invoice_notes: string;
  invoice_footer: string;
}

interface SettingsContextType {
  settings: CompanySettings | null;
  loading: boolean;
  refetch: () => Promise<void>;
  currency: string;
  formatCurrency: (val: number) => string;
}

const SettingsContext = createContext<SettingsContextType>({
  settings: null,
  loading: true,
  refetch: async () => {},
  currency: "EGP",
  formatCurrency: (val) => `${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase
      .from("company_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (data) setSettings(data as unknown as CompanySettings);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const currency = settings?.default_currency || "EGP";

  const formatCurrency = useCallback(
    (val: number) => {
      const formatted = Math.abs(val).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return `${formatted} ${currency}`;
    },
    [currency]
  );

  return (
    <SettingsContext.Provider value={{ settings, loading, refetch: fetchSettings, currency, formatCurrency }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
