import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/utils/toast";
import { Loader2 } from "lucide-react";

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

export const RegisterForm = ({ onSwitchToLogin }: RegisterFormProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: 'https://botboxxapp.boxxed.agency/auth/callback',
          data: {
            first_name: firstName,
            last_name: lastName,
          }
        }
      });

      if (error) throw error;

      if (data.user) {
        showSuccess("¡Registro exitoso! Te hemos enviado un email para confirmar tu cuenta.");
        // Limpiar formulario
        setEmail("");
        setPassword("");
        setFirstName("");
        setLastName("");
        // Cambiar a login después del registro
        setTimeout(() => {
          onSwitchToLogin();
        }, 2000);
      }
    } catch (error) {
      console.error("Error de registro:", error);
      showError("Error al registrarse: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleRegister} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="firstName">Nombre</Label>
          <Input
            id="firstName"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Tu nombre"
            className="bg-black/20 border-white/20 text-white mt-1"
            required
          />
        </div>
        <div>
          <Label htmlFor="lastName">Apellido</Label>
          <Input
            id="lastName"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Tu apellido"
            className="bg-black/20 border-white/20 text-white mt-1"
            required
          />
        </div>
      </div>
      
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
          className="bg-black/20 border-white/20 text-white mt-1"
          required
        />
      </div>
      
      <div>
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="bg-black/20 border-white/20 text-white mt-1"
          required
          minLength={6}
        />
        <p className="text-xs text-gray-400 mt-1">Mínimo 6 caracteres</p>
      </div>
      
      <Button type="submit" disabled={loading} className="w-full mt-4">
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Registrando...
          </>
        ) : (
          "Registrarse"
        )}
      </Button>
      
      <div className="text-center text-sm text-gray-400 mt-4">
        ¿Ya tienes cuenta?{" "}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-blue-400 hover:text-blue-300 font-medium"
        >
          Inicia sesión
        </button>
      </div>
    </form>
  );
};