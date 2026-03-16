import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export default function MfaVerify() {
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, mfaRequired } = useAuth();

  useEffect(() => {
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    if (!mfaRequired) {
      navigate("/", { replace: true });
      return;
    }

    // Get the TOTP factor
    const loadFactor = async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = data?.totp.filter(f => f.status === "verified") || [];
      if (verified.length > 0) {
        setFactorId(verified[0].id);
      }
      setLoading(false);
    };
    loadFactor();
  }, [user, mfaRequired, navigate]);

  const handleVerify = async () => {
    if (code.length !== 6 || !factorId) return;
    setVerifying(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;

      // After successful MFA verify, the session is now aal2
      // Force a session refresh to update AuthContext
      navigate("/", { replace: true });
      // Trigger a page reload to reset auth state
      window.location.reload();
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: "رمز التحقق غير صحيح",
        variant: "destructive",
      });
      setCode("");
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-xl bg-primary flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">التحقق بخطوتين</CardTitle>
          <CardDescription>أدخل رمز التحقق من تطبيق المصادقة</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-center" dir="ltr">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={(val) => setCode(val)}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Button
            onClick={handleVerify}
            className="w-full"
            disabled={code.length !== 6 || verifying}
          >
            {verifying ? (
              <>
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                جاري التحقق...
              </>
            ) : (
              "تأكيد"
            )}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              supabase.auth.signOut();
              navigate("/auth", { replace: true });
            }}
          >
            العودة لتسجيل الدخول
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
