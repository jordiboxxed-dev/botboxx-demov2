import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/utils/toast";
import { Loader2, Mail } from "lucide-react";

export const ResendConfirmation = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      showError("Por favor, introduce tu correo electrónico.");
      return;
    }
    setLoading(true);

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: 'https://botboxxapp.boxxed.agency/auth/callback'
        }
      });

      if (error) throw error;

      showSuccess("Se ha enviado un nuevo correo de confirmación. Revisa tu bandeja de entrada.");
      setEmail("");
    } catch (error) {
      console.error("Error al reenviar correo:", error);
      showError("Error al reenviar el correo: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 pt-6 border-t border-white/10">
      <form onSubmit={handleResend} className="space-y-3">
        <Label htmlFor="resend-email" className="text-sm font-medium text-gray-300">¿No recibiste el correo?</Label>
        <div className="flex items-center gap-2">
          <Input
            id="resend-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className="bg-black/20 border-white/20 text-white"
            required
          />
          <Button type="submit" disabled={loading} size="icon" variant="secondary">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-gray-500">Introduce tu email para recibir un nuevo enlace de confirmación.</p>
      </form>
    </div>
  );
};