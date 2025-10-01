import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/utils/toast";
import { Loader2, Zap, Upload, Trash2, Image as ImageIcon } from "lucide-react";
import { Agent } from "@/components/layout/AppLayout";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUsage } from "@/hooks/useUsage";
import { supabase } from "@/integrations/supabase/client";

interface AgentFormProps {
  onSubmit: (agentData: Omit<Agent, 'id' | 'user_id' | 'created_at' | 'deleted_at'>) => Promise<void>;
  isLoading: boolean;
  initialData?: Partial<Agent>;
  submitButtonText?: string;
}

const DEFAULT_WEBHOOK_URL = "https://n8n.boxxed.agency/webhook/agente-ventas";

export const AgentForm = ({ onSubmit, isLoading, initialData, submitButtonText = "Crear Agente" }: AgentFormProps) => {
  const navigate = useNavigate();
  const { usageInfo } = useUsage();
  const backgroundFileInputRef = useRef<HTMLInputElement>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [widgetColor, setWidgetColor] = useState("#3b82f6");
  const [widgetWelcomeMessage, setWidgetWelcomeMessage] = useState("¡Hola! ¿Cómo puedo ayudarte hoy?");
  const [widgetPosition, setWidgetPosition] = useState("right");
  const [status, setStatus] = useState("active");
  const [model, setModel] = useState("mistralai/mistral-7b-instruct");
  const [webhookUrl, setWebhookUrl] = useState(DEFAULT_WEBHOOK_URL);
  
  const [publicBackgroundUrl, setPublicBackgroundUrl] = useState<string | null>(null);
  const [isUploadingBackground, setIsUploadingBackground] = useState(false);
  
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  
  useEffect(() => {
    if (initialData) {
      setName(initialData.name || "");
      setDescription(initialData.description || "");
      setCompanyName(initialData.company_name || "");
      setSystemPrompt(initialData.system_prompt || "");
      setWidgetColor(initialData.widget_color || "#3b82f6");
      setWidgetWelcomeMessage(initialData.widget_welcome_message || "¡Hola! ¿Cómo puedo ayudarte hoy?");
      setWidgetPosition(initialData.widget_position || "right");
      setStatus(initialData.status || "active");
      setModel(initialData.model || "mistralai/mistral-7b-instruct");
      setPublicBackgroundUrl(initialData.public_background_url || null);
      setAvatarUrl(initialData.avatar_url || null);
      if (usageInfo?.role === 'admin') {
        setWebhookUrl(initialData.webhook_url || DEFAULT_WEBHOOK_URL);
      }
    }
  }, [initialData, usageInfo]);

  const handleFileUpload = async (file: File, bucket: 'agent_backgrounds' | 'agent_avatars', onUpload: (url: string) => void, setUploading: (is: boolean) => void) => {
    if (!initialData?.id) return;
    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showError("Debes iniciar sesión para subir archivos.");
      setUploading(false);
      return;
    }
    const filePath = `public/${user.id}/${initialData.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file);
    if (uploadError) {
      showError("Error al subir la imagen: " + uploadError.message);
      setUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath);
    onUpload(publicUrl);
    setUploading(false);
    showSuccess("Imagen subida correctamente.");
  };

  const handleFileRemove = async (url: string | null, bucket: 'agent_backgrounds' | 'agent_avatars', onRemove: () => void) => {
    if (!url) return;
    const filePath = url.split(`/${bucket}/`)[1];
    const { error } = await supabase.storage.from(bucket).remove([filePath]);
    if (error) {
      showError("No se pudo eliminar la imagen: " + error.message);
    } else {
      showSuccess("Imagen eliminada.");
    }
    onRemove();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !systemPrompt) {
      showError("El nombre y las instrucciones base son obligatorios.");
      return;
    }
    const finalWebhookUrl = (usageInfo?.role === 'admin' ? webhookUrl : DEFAULT_WEBHOOK_URL).trim();
    await onSubmit({ 
      name, description, company_name: companyName, system_prompt: systemPrompt,
      widget_color: widgetColor, widget_welcome_message: widgetWelcomeMessage,
      widget_position: widgetPosition, status, model, webhook_url: finalWebhookUrl,
      public_background_url: publicBackgroundUrl, avatar_url: avatarUrl,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-4">Información Básica</h3>
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><Label htmlFor="name" className="text-white">Nombre del Agente</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Asistente de Soporte" className="bg-black/20 border-white/20 text-white mt-2" /></div>
            <div><Label htmlFor="companyName" className="text-white">Nombre de la Empresa</Label><Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Ej: Mi Negocio S.A." className="bg-black/20 border-white/20 text-white mt-2" /></div>
          </div>
          <div><Label htmlFor="description" className="text-white">Descripción Corta</Label><Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="¿Cuál es el propósito principal de este agente?" className="bg-black/20 border-white/20 text-white mt-2" /></div>
          <div><Label htmlFor="systemPrompt" className="text-white">Instrucciones Base / Personalidad</Label><Textarea id="systemPrompt" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="Ej: Eres un asistente amigable y servicial. Tu objetivo es..." className="bg-black/20 border-white/20 text-white mt-2 min-h-[120px]" /><p className="text-xs text-gray-400 mt-2">Define el comportamiento del agente. Aquí le indicarás cómo y cuándo usar herramientas como el calendario.</p></div>
          {usageInfo?.role === 'admin' && (
            <div><Label htmlFor="model" className="text-white">Modelo de IA (Admin)</Label><Select value={model} onValueChange={setModel}><SelectTrigger id="model" className="bg-black/20 border-white/20 text-white mt-2"><SelectValue placeholder="Selecciona un modelo" /></SelectTrigger><SelectContent><SelectItem value="mistralai/mistral-7b-instruct">Mistral 7B Instruct (Rápido y Económico)</SelectItem><SelectItem value="meta-llama/llama-3-8b-instruct">Llama 3 8B Instruct (Equilibrado)</SelectItem><SelectItem value="mistralai/mixtral-8x7b-instruct">Mixtral 8x7B (Avanzado)</SelectItem><SelectItem value="meta-llama/llama-3-70b-instruct">Llama 3 70B Instruct (Potente)</SelectItem><SelectItem value="openai/gpt-4o">OpenAI GPT-4o (Máxima Calidad)</SelectItem></SelectContent></Select><p className="text-xs text-gray-400 mt-2">Elige el motor de IA que procesará las instrucciones y el contexto.</p></div>
          )}
        </div>
      </div>

      {usageInfo?.role === 'admin' && (
        <div className="pt-6 border-t border-white/10"><h3 className="text-xl font-semibold text-white mb-2 flex items-center gap-2"><Zap className="w-5 h-5 text-yellow-400"/> Webhook de Acciones (Admin)</h3><p className="text-gray-400 mb-4">Conecta tu agente a un servicio externo como n8n o Zapier para ejecutar acciones (ej. crear una cita en Google Calendar).</p><div><Label htmlFor="webhookUrl" className="text-white">Webhook URL</Label><Input id="webhookUrl" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://tu-workflow.com/webhook" className="bg-black/20 border-white/20 text-white mt-2" /><p className="text-xs text-gray-400 mt-2">El agente enviará aquí los datos cuando detecte que debe ejecutar una acción que le hayas instruido.</p></div></div>
      )}
      
      <div className="pt-6 border-t border-white/10">
        <h3 className="text-xl font-semibold text-white mb-2">Personalización del Widget</h3>
        <p className="text-gray-400 mb-6">Ajusta cómo se verá y comportará el chat en tu sitio web.</p>
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><Label htmlFor="widgetColor" className="text-white">Color Principal</Label><div className="relative mt-2"><Input id="widgetColor" type="color" value={widgetColor} onChange={(e) => setWidgetColor(e.target.value)} className="w-full h-10 p-1"/></div></div>
            <div><Label className="text-white">Posición del Widget</Label><RadioGroup value={widgetPosition} onValueChange={setWidgetPosition} className="mt-3 flex items-center gap-4"><div className="flex items-center space-x-2"><RadioGroupItem value="left" id="pos-left" /><Label htmlFor="pos-left" className="text-white font-normal">Izquierda</Label></div><div className="flex items-center space-x-2"><RadioGroupItem value="right" id="pos-right" /><Label htmlFor="pos-right" className="text-white font-normal">Derecha</Label></div></RadioGroup></div>
          </div>
          <div><Label htmlFor="widgetWelcome" className="text-white">Mensaje de Bienvenida</Label><Textarea id="widgetWelcome" value={widgetWelcomeMessage} onChange={(e) => setWidgetWelcomeMessage(e.target.value)} placeholder="Ej: ¡Hola! Soy tu asistente virtual. ¿En qué puedo ayudarte?" className="bg-black/20 border-white/20 text-white mt-2 min-h-[80px]" /></div>
        </div>
      </div>

      {initialData?.id && (
        <div className="pt-6 border-t border-white/10">
          <h3 className="text-xl font-semibold text-white mb-2">Identidad Visual</h3>
          <div className="space-y-6">
            <div><Label htmlFor="agentAvatar">Logo del Agente (Avatar)</Label><div className="mt-2 flex items-center gap-4 p-4 bg-black/20 rounded-lg"><div className="w-24 h-24 bg-black/30 rounded-full flex items-center justify-center text-gray-500 text-xs">{avatarUrl ? <img src={avatarUrl} alt="Vista previa del avatar" className="w-full h-full object-contain rounded-full p-2" /> : <ImageIcon className="w-8 h-8" />}</div><div className="flex-1"><Input ref={avatarFileInputRef} type="file" id="agentAvatar" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'agent_avatars', setAvatarUrl, setIsUploadingAvatar)} accept="image/*" className="hidden" /><Button type="button" onClick={() => avatarFileInputRef.current?.click()} disabled={isUploadingAvatar}>{isUploadingAvatar ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}{avatarUrl ? 'Cambiar Logo' : 'Subir Logo'}</Button><p className="text-xs text-gray-400 mt-2">Sube una imagen cuadrada (ej. 256x256) para el logo de tu agente.</p></div>{avatarUrl && <Button type="button" variant="destructive" size="icon" onClick={() => handleFileRemove(avatarUrl, 'agent_avatars', () => setAvatarUrl(null))}><Trash2 className="w-4 h-4" /></Button>}</div></div>
            <div><Label htmlFor="publicBackground">Fondo de Página Pública</Label><div className="mt-2 flex items-center gap-4 p-4 bg-black/20 rounded-lg">{publicBackgroundUrl ? <img src={publicBackgroundUrl} alt="Vista previa del fondo" className="w-24 h-16 object-cover rounded-md" /> : <div className="w-24 h-16 bg-black/30 rounded-md flex items-center justify-center text-gray-500 text-xs">Sin fondo</div>}<div className="flex-1"><Input ref={backgroundFileInputRef} type="file" id="publicBackground" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'agent_backgrounds', setPublicBackgroundUrl, setIsUploadingBackground)} accept="image/*" className="hidden" /><Button type="button" onClick={() => backgroundFileInputRef.current?.click()} disabled={isUploadingBackground}>{isUploadingBackground ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}{publicBackgroundUrl ? 'Cambiar Imagen' : 'Subir Imagen'}</Button><p className="text-xs text-gray-400 mt-2">Sube una imagen para la página pública de tu agente.</p></div>{publicBackgroundUrl && <Button type="button" variant="destructive" size="icon" onClick={() => handleFileRemove(publicBackgroundUrl, 'agent_backgrounds', () => setPublicBackgroundUrl(null))}><Trash2 className="w-4 h-4" /></Button>}</div></div>
          </div>
        </div>
      )}

      <div className="pt-6 border-t border-white/10"><h3 className="text-xl font-semibold text-white mb-2">Estado del Agente</h3><div className="flex items-center space-x-4 bg-black/20 p-4 rounded-lg"><Switch id="agent-status" checked={status === 'active'} onCheckedChange={(checked) => setStatus(checked ? 'active' : 'inactive')} /><div><Label htmlFor="agent-status" className="text-white font-medium">Agente {status === 'active' ? 'Activo' : 'Inactivo'}</Label><p className="text-sm text-gray-400">Los agentes inactivos no funcionarán en páginas públicas o widgets.</p></div></div></div>
      <div className="flex justify-end gap-4 pt-4"><Button type="button" variant="outline" onClick={() => navigate(-1)} className="border-white/20 text-white hover:bg-white/10">Cancelar</Button><Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white">{isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando...</> : submitButtonText}</Button></div>
    </form>
  );
};