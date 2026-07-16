import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldCheck, X, Check } from "lucide-react";

// Typed wrapper around the beta supabase.auth.oauth namespace.
type OAuthClient = { name?: string; redirect_uri?: string; scope?: string };
type OAuthDetails = {
  client?: OAuthClient;
  scope?: string;
  redirect_url?: string;
  redirect_to?: string;
};
type OAuthApi = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
};
const oauthApi = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<OAuthDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) return setError("رابط المصادقة غير صالح");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      setUserEmail(sess.session.user?.email ?? "");
      const { data, error } = await oauthApi.getAuthorizationDetails(
        authorizationId,
      );
      if (!active) return;
      if (error) return setError(error.message);
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await oauthApi.approveAuthorization(authorizationId)
      : await oauthApi.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      return setError("لم يُرجع خادم التفويض عنوان إعادة التوجيه.");
    }
    window.location.href = target;
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md w-full bg-card border rounded-2xl p-8 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <X className="w-6 h-6 text-destructive" />
          </div>
          <h1 className="text-xl font-bold mb-2">تعذّر تحميل الطلب</h1>
          <p className="text-muted-foreground text-sm">{error}</p>
        </div>
      </main>
    );
  }

  if (!details) {
    return (
      <main className="min-h-screen flex items-center justify-center" dir="rtl">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </main>
    );
  }

  const clientName = details.client?.name ?? "التطبيق الخارجي";

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background" dir="rtl">
      <div className="max-w-md w-full bg-card border rounded-2xl p-8 shadow-lg">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <ShieldCheck className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">
            ربط {clientName} بحسابك
          </h1>
          <p className="text-muted-foreground text-sm">
            سيتمكن <span className="font-medium">{clientName}</span> من استخدام
            أدوات هذا التطبيق نيابةً عنك ({userEmail}).
          </p>
        </div>

        <div className="bg-muted/40 rounded-xl p-4 mb-6 text-sm space-y-2">
          <p className="font-medium">ما سيتمكن هذا التطبيق من فعله:</p>
          <ul className="space-y-1 text-muted-foreground list-disc pr-5">
            <li>قراءة قوائم العملاء والموردين والمنتجات</li>
            <li>قراءة فواتير المبيعات وملخصاتها</li>
            <li>يعمل بصلاحياتك أنت — لن يتجاوز سياسات الحماية (RLS)</li>
          </ul>
        </div>

        <div className="flex gap-3">
          <button
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            موافق
          </button>
          <button
            disabled={busy}
            onClick={() => decide(false)}
            className="flex-1 py-3 rounded-xl border font-bold hover:bg-muted transition disabled:opacity-50"
          >
            رفض
          </button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4">
          هذا لا يتجاوز صلاحيات الحساب أو سياسات قاعدة البيانات.
        </p>
      </div>
    </main>
  );
}
