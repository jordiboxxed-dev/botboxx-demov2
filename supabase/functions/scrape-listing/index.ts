// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- Selectores CSS para un portal inmobiliario tipo (ej. Mercado Libre Inmuebles) ---
// Estos selectores son un punto de partida y pueden necesitar ajustes para otros sitios.
const SELECTORS = {
  propertyCard: ".ui-search-result__wrapper",
  title: ".ui-search-item__title",
  price: ".andes-money-amount__fraction",
  currency: ".andes-money-amount__currency-symbol",
  address: ".ui-search-item__location-location",
  attributes: ".ui-search-card-attributes",
  link: ".ui-search-link"
};

async function scrapeListingPage(url) {
  const properties = [];
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'BotBoxxScraper/1.0' }
    });

    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
      throw new Error(`No se pudo obtener la página o no es HTML (Estado: ${response.status})`);
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc) {
      throw new Error("No se pudo analizar el HTML de la página.");
    }

    const propertyCards = doc.querySelectorAll(SELECTORS.propertyCard);
    
    for (const card of propertyCards) {
      const title = card.querySelector(SELECTORS.title)?.textContent?.trim() || "Título no encontrado";
      const price = card.querySelector(SELECTORS.price)?.textContent?.trim() || "Precio no especificado";
      const currency = card.querySelector(SELECTORS.currency)?.textContent?.trim() || "";
      const address = card.querySelector(SELECTORS.address)?.textContent?.trim() || "Ubicación no especificada";
      const attributes = card.querySelector(SELECTORS.attributes)?.textContent?.trim().replace(/\s+/g, ' ') || "Sin características adicionales";
      const propertyUrl = card.querySelector(SELECTORS.link)?.getAttribute('href') || "";

      // Ensamblar el texto estructurado para esta propiedad
      const propertyText = `
Propiedad: ${title}
Ubicación: ${address}
Precio: ${currency} ${price}
Características: ${attributes}
Enlace: ${propertyUrl}
      `.trim();

      properties.push(propertyText);
    }

    return properties;
  } catch (error) {
    console.error(`Error durante el scraping de ${url}:`, error.message);
    throw error; // Re-lanzar para que sea capturado por el manejador principal
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { agentId, url } = await req.json();
    if (!agentId || !url) {
      throw new Error("agentId y url son requeridos.");
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error("Falta el encabezado de autorización.");
    
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? '',
      Deno.env.get("SUPABASE_ANON_KEY") ?? '',
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Token de usuario inválido.");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? '',
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ''
    );

    // Iniciar el scraping
    const properties = await scrapeListingPage(url);
    if (properties.length === 0) {
      throw new Error("No se encontraron propiedades en la URL proporcionada con los selectores actuales.");
    }

    // Crear una única fuente de conocimiento para este lote
    const sourceName = `Listado de ${new URL(url).hostname}`;
    const { data: sourceData, error: sourceError } = await supabaseAdmin.from("knowledge_sources").insert({
        user_id: user.id,
        agent_id: agentId,
        name: sourceName,
        type: 'listing',
    }).select().single();

    if (sourceError) throw sourceError;

    // Responder inmediatamente al cliente para no causar timeout
    const responsePromise = new Response(JSON.stringify({ 
      message: `Procesamiento iniciado para ${properties.length} propiedades.`,
      propertiesFound: properties.length
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 202, // Accepted
    });

    // Procesar cada propiedad en segundo plano
    setTimeout(async () => {
      try {
        console.log(`Iniciando la indexación de ${properties.length} propiedades para la fuente ${sourceData.id}`);
        
        // Crear un array de promesas para invocar la función de embedding para cada propiedad
        const embedPromises = properties.map(propertyText => 
          supabaseAdmin.functions.invoke("embed-and-store", {
            body: { sourceId: sourceData.id, textContent: propertyText },
          })
        );

        // Esperar a que todas las promesas se resuelvan
        const results = await Promise.allSettled(embedPromises);

        const successfulEmbeds = results.filter(r => r.status === 'fulfilled').length;
        console.log(`Se procesaron exitosamente ${successfulEmbeds} de ${properties.length} propiedades.`);

        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            console.error(`Error al procesar la propiedad ${index + 1}:`, result.reason);
          }
        });

      } catch (e) {
        console.error("Error en el proceso de indexación en segundo plano:", e);
      }
    }, 0);

    return responsePromise;

  } catch (error) {
    console.error("Error en la función scrape-listing:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});