import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { useNavigate, useLocation } from "react-router-dom";
import { handleEmailConfirmation, redirectToDashboard } from "@/utils/auth";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { Button } from "@/components/ui/button";
import { LogIn, UserPlus } from "lucide-react";
import { ResendConfirmation } from "@/components/auth/ResendConfirmation";
import { motion } from "framer-motion";
import { useInteractiveCard } from "@/hooks/useInteractiveCard";
import { cn } from "@/lib/utils";
import React from "react";

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const cardProps = useInteractiveCard<HTMLDivElement>({ glowColor: "rgba(168, 85, 247, 0.4)" });

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate('/dashboard');
      } else {
        setLoading(false);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        navigate('/dashboard');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  useEffect(() => {
    const processEmailConfirmation = async () => {
      const params = new URLSearchParams(location.search);
      const confirmed = await handleEmailConfirmation(params);
      
      if (confirmed) {
        setTimeout(() => {
          redirectToDashboard();
        }, 1000);
      }
    };

    processEmailConfirmation();
  }, [location]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-4">
        <div className="w-full max-w-md p-8 space-y-8 bg-black/30 backdrop-blur-lg border border-white/10 rounded-2xl shadow-2xl">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4">Cargando...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-4 overflow-hidden">
      <motion.div
        ref={cardProps.ref}
        {...cardProps}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={cn(
          cardProps.className,
          "w-full max-w-md p-8 space-y-6 bg-black/30 backdrop-blur-lg border border-white/10 rounded-2xl shadow-2xl"
        )}
      >
        <div className="text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-r from-purple-500 via-fuchsia-500 to-blue-500 bg-clip-text text-transparent">
            BotBoxx
          </h1>
          <p className="text-gray-400 mt-2">
            {showRegister 
              ? "Crea una cuenta para comenzar" 
              : "Inicia sesión para acceder a tus agentes de IA"}
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant={!showRegister ? "default" : "outline"}
            onClick={() => setShowRegister(false)}
            className="flex-1"
          >
            <LogIn className="w-4 h-4 mr-2" />
            Ingresar
          </Button>
          <Button
            variant={showRegister ? "default" : "outline"}
            onClick={() => setShowRegister(true)}
            className="flex-1"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Registrarse
          </Button>
        </div>
        
        {showRegister ? (
          <RegisterForm onSwitchToLogin={() => setShowRegister(false)} />
        ) : (
          <>
            <Auth
              supabaseClient={supabase}
              appearance={{ 
                theme: ThemeSupa,
                variables: {
                  default: {
                    colors: {
                      brand: '#8b5cf6',
                      brandAccent: '#7c3aed',
                    }
                  }
                }
              }}
              localization={{
                variables: {
                  sign_in: {
                    link_text: '',
                  },
                  forgotten_password: {
                    link_text: '¿Olvidaste tu contraseña?',
                  }
                },
              }}
              providers={[]}
              theme="dark"
              redirectTo="https://botboxxapp.boxxed.agency/auth/callback"
            />
            <ResendConfirmation />
          </>
        )}
      </motion.div>
    </div>
  );
};

export default Login;