import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, FileUp, Link as LinkIcon, FileText, Globe, Building } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { showError, showSuccess } from "@/utils/toast";
import mammoth from "mammoth";

type SourceType = "text" | "url" | "file" | "website" | "listing";

interface AddSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  onSourceAdded: () => void;
}

// --- Funciones auxiliares para leer archivos con Promesas ---
const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

export const AddSourceDialog = ({ open, onOpenChange, agentId, onSourceAdded }: AddSourceDialogProps) => {
  const [sourceType, setSourceType] = useState<SourceType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [name, setName] = useState("");
  const [textContent, setTextContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setSourceType(null);
    setIsLoading(false);
    setName("");
    setTextContent("");
    setStatusMessage("");
  };

  const handleClose = () => {
    if (isLoading) return;
    resetState();
    onOpenChange(false);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setStatusMessage("Extrayendo texto del archivo...");
    setName(file.name);

    try {
      let extractedText = "";
      if (file.type === 'text/plain') {
        extractedText = await readFileAsText(file);
      } else if (file.type === 'application/pdf') {
        // @ts-ignore
        if (!window.pdfjsLib) {
          throw new Error("La librería para leer PDF no está cargada. Por favor, refresca la página.");
        }
        const arrayBuffer = await readFileAsArrayBuffer(file);
        // @ts-ignore
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          fullText += content.items.map((s: any) => s.str).join(' ') + '\n';
        }
        extractedText = fullText;
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const result = await mammoth.extractRawText({ arrayBuffer });
        extractedText = result.value;
      } else {
        throw new Error("Formato no soportado. Sube .txt, .pdf o .docx.");
      }
      
      setTextContent(extractedText);
      showSuccess(`Contenido de ${file.name} extraído.`);

    } catch (err) {
      showError((err as Error).message || "No se pudo procesar el archivo.");
      resetState();
    } finally {
      setIsLoading(false);
      setStatusMessage("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUrlFetch = async () => {
    if (!textContent.trim()) {
      showError("Por favor, introduce una URL válida.");
      return;
    }
    setIsLoading(true);
    setStatusMessage("Importando contenido de la URL...");
    try {
      const { data, error } = await supabase.functions.invoke("fetch-url-content", { body: { url: textContent } });
      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);
      
      setTextContent(data.content);
      setName(new URL(textContent).hostname);
      showSuccess("Contenido de la URL importado.");
    } catch (err) {
      showError((err as Error).message || "No se pudo importar el contenido de la URL.");
    } finally {
      setIsLoading(false);
      setStatusMessage("");
    }
  };

  const handleSubmit = async () => {
    if (sourceType === 'website') {
        if (!textContent) {
            showError("Por favor, introduce la URL del sitio web.");
            return;
        }
        setIsLoading(true);
        setStatusMessage("Iniciando rastreo del sitio web...");
        try {
            const { error } = await supabase.functions.invoke("scrape-and-embed", {
                body: { agentId, url: textContent },
            });
            if (error) throw error;
            showSuccess("¡Rastreo iniciado! El conocimiento se añadirá en unos minutos.");
            onSourceAdded();
            handleClose();
        } catch (err) {
            showError("Error al iniciar el rastreo: " + (err as Error).message);
            setIsLoading(false);
        }
        return;
    }

    if (sourceType === 'listing') {
        if (!textContent) {
            showError("Por favor, introduce la URL del listado.");
            return;
        }
        setIsLoading(true);
        setStatusMessage("Iniciando importación estructurada...");
        try {
            const { data, error } = await supabase.functions.invoke("scrape-listing", {
                body: { agentId, url: textContent },
            });
            if (error) throw error;
            showSuccess(`¡Importación iniciada! Se encontraron ${data.propertiesFound} propiedades para procesar.`);
            onSourceAdded();
            handleClose();
        } catch (err) {
            showError("Error al importar el listado: " + (err as Error).message);
            setIsLoading(false);
        }
        return;
    }

    if (!name || !textContent || !sourceType) {
      showError("El nombre y el contenido son obligatorios.");
      return;
    }
    setIsLoading(true);
    setStatusMessage("1/3: Guardando fuente de conocimiento...");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        showError("Usuario no autenticado.");
        setIsLoading(false);
        return;
    }

    const { data: sourceData, error: sourceError } = await supabase.from("knowledge_sources").insert({
        user_id: user.id,
        agent_id: agentId,
        name,
        type: sourceType,
    }).select().single();

    if (sourceError) {
        setIsLoading(false);
        showError("Error al guardar la fuente: " + sourceError.message);
        return;
    }

    setStatusMessage("2/3: Fragmentando texto y generando embeddings...");
    try {
      const { error: embedError } = await supabase.functions.invoke("embed-and-store", {
        body: { sourceId: sourceData.id, textContent },
      });

      if (embedError) throw new Error(embedError.message);

      setStatusMessage("3/3: ¡Proceso completado!");
      showSuccess("Fuente de conocimiento añadida y procesada.");
      onSourceAdded();
      handleClose();
    } catch (err) {
      showError("Error al procesar el conocimiento: " + (err as Error).message);
      // Si falla el procesamiento, eliminamos la fuente que creamos para no dejar datos huérfanos.
      await supabase.from("knowledge_sources").delete().eq("id", sourceData.id);
    } finally {
      setIsLoading(false);
      setStatusMessage("");
    }
  };

  const renderContent = () => {
    if (!sourceType) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          <Button variant="outline" className="h-24 flex-col gap-2" onClick={() => setSourceType("text")}><FileText />Texto Plano</Button>
          <Button variant="outline" className="h-24 flex-col gap-2" onClick={() => setSourceType("url")}><LinkIcon />Desde URL</Button>
          <Button variant="outline" className="h-24 flex-col gap-2" onClick={() => { setSourceType("file"); setTimeout(() => fileInputRef.current?.click(), 100); }}><FileUp />Subir Archivo</Button>
          <Button variant="outline" className="h-24 flex-col gap-2" onClick={() => setSourceType("website")}><Globe />Importar Sitio Web</Button>
          <Button variant="outline" className="h-24 flex-col gap-2 md:col-span-2 bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20" onClick={() => setSourceType("listing")}><Building />Importar Listado Inmobiliario</Button>
        </div>
      );
    }

    return (
      <div className="space-y-4 py-4">
        {sourceType !== 'website' && sourceType !== 'listing' && (
            <div>
                <Label htmlFor="source-name">Nombre de la Fuente</Label>
                <Input id="source-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Política de Devoluciones" />
            </div>
        )}
        {sourceType === "text" && (
          <div>
            <Label htmlFor="source-content">Contenido</Label>
            <Textarea id="source-content" value={textContent} onChange={(e) => setTextContent(e.target.value)} className="min-h-[150px]" />
          </div>
        )}
        {sourceType === "url" && (
          <div>
            <Label htmlFor="source-url">URL</Label>
            <div className="flex items-center gap-2">
              <Input id="source-url" type="url" value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="https://ejemplo.com/info" />
              <Button onClick={handleUrlFetch} disabled={isLoading} size="icon">
                {isLoading ? <Loader2 className="animate-spin" /> : <LinkIcon />}
              </Button>
            </div>
          </div>
        )}
        {sourceType === "file" && (
          <div>
            <Label>Archivo</Label>
            <Input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".pdf,.txt,text/plain,.docx" className="text-gray-400 file:text-white" />
            {textContent && <p className="text-sm text-gray-400 mt-2">Contenido extraído. Puedes editar el nombre si lo deseas.</p>}
          </div>
        )}
        {sourceType === 'website' && (
            <div>
                <Label htmlFor="website-url">URL del Sitio Web</Label>
                <Input id="website-url" type="url" value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="https://minegocio.com" />
                <p className="text-xs text-gray-400 mt-2">Importaremos el contenido de esta página y sus enlaces internos (hasta 15 páginas).</p>
            </div>
        )}
        {sourceType === 'listing' && (
            <div>
                <Label htmlFor="listing-url">URL de la página de listados</Label>
                <Input id="listing-url" type="url" value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="https://inmobiliaria.com/propiedades-en-venta" />
                <p className="text-xs text-gray-400 mt-2">Extraeremos cada propiedad de esta página como una unidad de conocimiento individual.</p>
            </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{sourceType ? `Añadir ${sourceType}` : "Añadir Fuente de Conocimiento"}</DialogTitle>
          <DialogDescription>
            {sourceType ? "Completa los detalles de tu nueva fuente de conocimiento." : "Selecciona el tipo de fuente que quieres añadir."}
          </DialogDescription>
        </DialogHeader>
        {renderContent()}
        {isLoading && <div className="text-center text-sm text-blue-300 flex items-center justify-center gap-2"><Loader2 className="animate-spin w-4 h-4" /> {statusMessage}</div>}
        <DialogFooter>
          {sourceType && <Button variant="ghost" onClick={() => { setTextContent(''); setName(''); setSourceType(null); }} disabled={isLoading}>Atrás</Button>}
          <Button onClick={handleClose} variant="outline" disabled={isLoading}>Cancelar</Button>
          {sourceType && <Button onClick={handleSubmit} disabled={isLoading || !textContent || (sourceType !== 'website' && sourceType !== 'listing' && !name)}>
            {isLoading ? <Loader2 className="animate-spin" /> : "Guardar y Procesar"}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};