import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calculator, Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaVerifying, setMfaVerifying] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (user && !mfaStep) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Check if MFA is required
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const verifiedFactors = factorsData?.totp.filter(f => f.status === "verified") || [];

      if (verifiedFactors.length > 0) {
        setMfaFactorId(verifiedFactors[0].id);
        setMfaStep(true);
      } else {
        navigate("/");
      }
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMfaVerify = async () => {
    if (mfaCode.length !== 6) return;
    setMfaVerifying(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.id,
        code: mfaCode,
      });
      if (verifyError) throw verifyError;

      navigate("/");
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: "رمز التحقق غير صحيح",
        variant: "destructive",
      });
      setMfaCode("");
    } finally {
      setMfaVerifying(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-xl bg-primary flex items-center justify-center">
            {mfaStep ? (
              <ShieldCheck className="w-8 h-8 text-primary-foreground" />
            ) : (
              <Calculator className="w-8 h-8 text-primary-foreground" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {mfaStep ? "التحقق بخطوتين" : "النظام المحاسبي"}
          </CardTitle>
          <CardDescription>
            {mfaStep
              ? "أدخل رمز التحقق من تطبيق المصادقة"
              : "سجّل دخولك للمتابعة"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mfaStep ? (
            <div className="space-y-6">
              <div className="flex justify-center" dir="ltr">
                <InputOTP
                  maxLength={6}
                  value={mfaCode}
                  onChange={(val) => setMfaCode(val)}
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
                onClick={handleMfaVerify}
                className="w-full"
                disabled={mfaCode.length !== 6 || mfaVerifying}
              >
                {mfaVerifying ? (
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
                  setMfaStep(false);
                  setMfaCode("");
                  supabase.auth.signOut();
                }}
              >
                العودة لتسجيل الدخول
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@mail.com"
                  required
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  dir="ltr"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "جارٍ التحميل..." : "تسجيل الدخول"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
