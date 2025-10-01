import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { mockAgents, Agent as TemplateAgent } from "@/data/mock-agents";
import { showError, showSuccess } from "@/utils/toast";
import { Plus, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { TemplatePreviewDialog } from "@/components/agents/TemplatePreviewDialog";
import { TemplateCard } from "@/components/agents/TemplateCard";
import { UserAgentCard } from "@/components/agents/UserAgentCard";
import { useUsage } from "@/hooks/useUsage";
import { CreateFromTemplateDialog } from "@/components/agents/CreateFromTemplateDialog";

const Templates = () => {
  const navigate = useNavigate();
  const { usageInfo, isLoading: isLoadingUsage } = useUsage();
  const [isLoading, setIsLoading] = useState(true);
  const [userAgents, setUserAgents] = useState<any[]>([]);
  const [previewingAgent, setPreviewingAgent] = useState<TemplateAgent | null>(null);
  const [creatingFromTemplate, setCreatingFromTemplate] = useState<TemplateAgent | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const agentLimitReached = usageInfo?.hasReachedAgentLimit ?? false;

  const fetchUserAgents = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      navigate('/login');
      return;
    }

    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching agents:", error);
      showError("Error al cargar los agentes.");
    } else {
      setUserAgents(data || []);
    }
    
    setIsLoading(false);
  };

  useEffect(() => {
    fetchUserAgents();
  }, [navigate]);

  const handleUseTemplateClick = (template: TemplateAgent) => {
    if (agentLimitReached) {
      showError("Has alcanzado el límite de agentes de tu plan. Mejora tu plan para crear más.");
      return;
    }
    setCreatingFromTemplate(template);
  };

  const handleConfirmCreateFromTemplate = async (name: string, companyName: string) => {
    if (!creatingFromTemplate) return;
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showError("Debes iniciar sesión para crear un agente.");
        return;
      }

      const { data, error } = await supabase
        .from("agents")
        .insert({
          user_id: user.id,
          name: name,
          company_name: companyName,
          description: creatingFromTemplate.description,
          system_prompt: creatingFromTemplate.systemPrompt,
          status: 'active',
          webhook_url: "https://n8n.boxxed.agency/webhook/agente-ventas",
        })
        .select()
        .single();

      if (error) throw error;

      showSuccess("¡Agente creado desde plantilla!");
      navigate(`/agent/${data.id}`);
    } catch (error) {
      console.error("Error creating agent from template:", error);
      showError("Error al crear el agente desde la plantilla.");
    } finally {
      setIsSubmitting(false);
      setCreatingFromTemplate(null);
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    const { error } = await supabase
      .from('agents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', agentId);

    if (error) {
      showError("Error al eliminar el agente: " + error.message);
    } else {
      showSuccess("Agente eliminado correctamente.");
      fetchUserAgents();
    }
  };

  if (isLoading || isLoadingUsage) {
    return (
      <div className="min-h-screen bg-gray-900 p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-black/30 rounded-xl p-6 border border-white/10">
                <Skeleton className="h-16 w-16 rounded-md mb-4" />
                <Skeleton className="h-6 w-3-4 mb-2" />
                <Skeleton className="h-4 w-full mb-4" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full mb-8"
        >
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="text-left">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 bg-gradient-to-r from-purple-500 via-fuchsia-500 to-blue-500 bg-clip-text text-transparent">
                Plantillas de Agentes
              </h1>
              <p className="text-lg text-gray-400">Selecciona una plantilla para crear tu agente personalizado.</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button 
                onClick={() => navigate('/create-agent')} 
                variant="outline" 
                className="flex items-center gap-2"
                disabled={agentLimitReached}
                title={agentLimitReached ? "Has alcanzado el límite de agentes de tu plan" : ""}
              >
                <Plus className="w-4 h-4" />
                Crear desde cero
              </Button>
            </div>
          </div>
        </motion.div>

        <div className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-4">Tus Agentes Creados</h2>
          {userAgents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {userAgents.map((agent, index) => (
                <UserAgentCard 
                  key={agent.id}
                  agent={agent}
                  index={index}
                  onDelete={handleDeleteAgent}
                />
              ))}
            </div>
          ) : (
            <div className="bg-black/30 rounded-xl p-8 text-center border border-white/10">
              <p className="text-gray-400 mb-4">Aún no has creado ningún agente</p>
              <Button onClick={() => navigate('/create-agent')}>
                Crear tu primer agente
              </Button>
            </div>
          )}
        </div>

        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Plantillas Disponibles</h2>
          <Button variant="ghost" onClick={() => navigate('/dashboard')} className="flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Volver al inicio
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mockAgents.map((agent, index) => (
            <TemplateCard
              key={agent.id}
              agent={agent}
              index={index}
              onPreview={setPreviewingAgent}
              onUseTemplate={handleUseTemplateClick}
              isCreationDisabled={agentLimitReached}
            />
          ))}
        </div>
      </div>
      
      <TemplatePreviewDialog
        open={!!previewingAgent}
        onOpenChange={() => setPreviewingAgent(null)}
        agent={previewingAgent}
        onUseTemplate={() => {
          if (previewingAgent) {
            handleUseTemplateClick(previewingAgent);
          }
          setPreviewingAgent(null);
        }}
        isCreationDisabled={agentLimitReached}
      />

      <CreateFromTemplateDialog
        open={!!creatingFromTemplate}
        onOpenChange={(isOpen) => !isSubmitting && setCreatingFromTemplate(null)}
        template={creatingFromTemplate}
        onSubmit={handleConfirmCreateFromTemplate}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};

export default Templates;