// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- Múltiples juegos de selectores para aumentar la compatibilidad ---
const SELECTOR_SETS = [
  { // Set 1: Mercado Libre Inmuebles
    name: "Mercado Libre",
    propertyCard: ".ui-search-result__wrapper",
    title: ".ui-search-item__title",
    price: ".andes-money-amount__fraction",
    currency: ".andes-money-amount__currency-symbol",
    address: ".ui-search-item__location-location",
    attributes: ".ui-search-card-attributes",
    link: ".ui-search-link"
  },
  { // Set 2: Zonaprop / Argenprop (usan atributos data-qa)
    name: "Zonaprop/Argenprop",
    propertyCard: "div[data-qa='posting-card']",
    title: "h2",
    price: "div[data-qa='POSTING_CARD_PRICE']",
    currency: "", // A menudo incluido en el precio
    address: "div[data-qa='POSTING_CARD_LOCATION']",
    attributes: "div[data-qa='POSTING_CARD_FEATURES']",
    link: "a[data-qa='posting-card-link']"
  },
  { // Set 3: Un fallback más genérico
    name: "Genérico",
    propertyCard: "article.listing, div.property-card, div.listing-item",
    title: "h2, h3, .property-title",
    price: "[class*='price'], .price",
    currency: "[class*='currency']",
    address: "[class*='address'], .location",
    attributes: "[class*='features'], [class*='attributes']",
    link: "a"
  }
];

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
    if (!doc) throw new Error("No se pudo analizar el HTML de la página.");

    let activeSelectors = null;
    let propertyCards = null;

    // Probar cada juego de selectores hasta encontrar uno que funcione
    for (const selectorSet of SELECTOR_SETS) {
      const cards = doc.querySelectorAll(selectorSet.propertyCard);
      if (cards && cards.length > 0) {
        activeSelectors = selectorSet;
        propertyCards = cards;
        console.log(`Estructura compatible encontrada: ${activeSelectors.name}`);
        break;
      }
    }

    if (!activeSelectors || !propertyCards) {
      throw new Error("No se pudieron identificar las propiedades en la página. La estructura del sitio puede no ser compatible.");
    }
    
    for (const card of propertyCards) {
      const title = card.querySelector(activeSelectors.title)?.textContent?.trim() || "Título no encontrado";
      
      let price = card.querySelector(activeSelectors.price)?.textContent?.trim() || "Precio no especificado";
      // Limpiar el precio de puntos y comas para consistencia
      price = price.replace(/[.,]/g, '');

      const currency = activeSelectors.currency ? card.querySelector(activeSelectors.currency)?.textContent?.trim() : "";
      const address = card.querySelector(activeSelectors.address)?.textContent?.trim() || "Ubicación no especificada";
      const attributes = card.querySelector(activeSelectors.attributes)?.textContent?.trim().replace(/\s+/g, ' ') || "Sin características adicionales";
      
      let propertyUrl = card.querySelector(activeSelectors.link)?.getAttribute('href') || "";
      // Asegurarse de que la URL sea absoluta
      if (propertyUrl && !propertyUrl.startsWith('http')) {
        propertyUrl = new URL(propertyUrl, url).href;
      }

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
    throw error;
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

    const properties = await scrapeListingPage(url);
    if (properties.length === 0) {
      throw new Error("No se encontraron propiedades en la URL proporcionada con los selectores actuales.");
    }

    const sourceName = `Listado de ${new URL(url).hostname}`;
    const { data: sourceData, error: sourceError } = await supabaseAdmin.from("knowledge_sources").insert({
        user_id: user.id,
        agent_id: agentId,
        name: sourceName,
        type: 'listing',
    }).select().single();

    if (sourceError) throw sourceError;

    const responsePromise = new Response(JSON.stringify({ 
      message: `Procesamiento iniciado para ${properties.length} propiedades.`,
      propertiesFound: properties.length
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 202,
    });

    setTimeout(async () => {
      try {
        console.log(`Iniciando la indexación de ${properties.length} propiedades para la fuente ${sourceData.id}`);
        
        const embedPromises = properties.map(propertyText => 
          supabaseAdmin.functions.invoke("embed-and-store", {
            body: { sourceId: sourceData.id, textContent: propertyText },
          })
        );

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