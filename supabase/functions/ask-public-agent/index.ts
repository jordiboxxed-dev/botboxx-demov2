// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.11.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- Helper para obtener/refrescar tokens de Google ---
async function getGoogleAuthTokens(userId, supabaseAdmin) {
  const { data: creds, error: credsError } = await supabaseAdmin
    .from("user_credentials")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .eq("service", "google_calendar")
    .single();

  if (credsError || !creds) {
    return { error: "El propietario del agente no ha conectado su Google Calendar." };
  }

  let { access_token, refresh_token, expires_at } = creds;

  if (new Date(expires_at) < new Date()) {
    if (!refresh_token) {
      await supabaseAdmin.from("user_credentials").delete().eq("user_id", userId).eq("service", "google_calendar");
      return { error: "La conexión con Google Calendar ha expirado. El propietario debe volver a conectarlo." };
    }

    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    
    const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        refresh_token: refresh_token,
        grant_type: "refresh_token",
      }),
    });

    const newTokens = await refreshResponse.json();
    if (newTokens.error) {
      if (newTokens.error === 'invalid_grant') {
        await supabaseAdmin.from("user_credentials").delete().eq("user_id", userId).eq("service", "google_calendar");
        return { error: "La autorización de Google Calendar fue revocada. El propietario debe volver a conectarlo." };
      }
      return { error: "Error al refrescar la conexión con Google Calendar." };
    }

    access_token = newTokens.access_token;
    const new_expires_at = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();

    await supabaseAdmin
      .from("user_credentials")
      .update({ access_token: access_token, expires_at: new_expires_at })
      .eq("user_id", userId)
      .eq("service", "google_calendar");
  }
  
  return { access_token };
}

// --- Helper para Google Calendar ---
async function getCalendarEvents(userId, supabaseAdmin) {
  try {
    const { access_token, error } = await getGoogleAuthTokens(userId, supabaseAdmin);
    if (error) return { error, events: [] };

    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const calendarApiUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    calendarApiUrl.searchParams.set("timeMin", timeMin);
    calendarApiUrl.searchParams.set("timeMax", timeMax);
    calendarApiUrl.searchParams.set("singleEvents", "true");
    calendarApiUrl.searchParams.set("orderBy", "startTime");
    calendarApiUrl.searchParams.set("maxResults", "15");

    const eventsResponse = await fetch(calendarApiUrl.toString(), {
      headers: { "Authorization": `Bearer ${access_token}` },
    });

    if (!eventsResponse.ok) {
      const errorData = await eventsResponse.json();
      return { error: `Error al obtener eventos: ${errorData.error.message}`, events: [] };
    }

    const eventsData = await eventsResponse.json();
    if (!eventsData.items || eventsData.items.length === 0) {
      return { summary: "No hay eventos próximos en el calendario para los siguientes 7 días.", events: [] };
    }

    const events = eventsData.items.map(event => ({
      summary: event.summary,
      startTime: event.start.dateTime || event.start.date,
      endTime: event.end.dateTime || event.end.date,
    }));

    return { summary: `Hay ${events.length} evento(s) en el calendario.`, events: events };
  } catch (error) {
    console.error("Error in getCalendarEvents:", error);
    return { error: "Error inesperado al acceder a Google Calendar.", events: [] };
  }
}

// --- Helper para crear eventos en Google Calendar ---
async function createCalendarEvent(userId, params, supabaseAdmin) {
  try {
    const { access_token, error } = await getGoogleAuthTokens(userId, supabaseAdmin);
    if (error) return { success: false, message: `Error de autenticación: ${error}` };

    const startTime = new Date(params.startTime);
    const endTime = new Date(startTime.getTime() + params.durationMinutes * 60000);

    const event = {
      summary: params.title,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'America/Argentina/Buenos_Aires',
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'America/Argentina/Buenos_Aires',
      },
      attendees: params.attendees.map(email => ({ email })),
      reminders: {
        useDefault: true,
      },
    };

    const createResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!createResponse.ok) {
      const errorData = await createResponse.json();
      return { success: false, message: `Error al agendar en Google Calendar: ${errorData.error.message}` };
    }

    return { success: true, message: `¡Perfecto! He agendado la reunión "${params.title}". Se ha enviado una invitación a los participantes.` };
  } catch (error) {
    console.error("Error in createCalendarEvent:", error);
    return { success: false, message: "Error inesperado al crear el evento en Google Calendar." };
  }
}

const checkMessageLimit = async (userId, supabaseAdmin) => {
    const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('plan, trial_ends_at, role')
        .eq('id', userId)
        .single();

    if (profileError) throw new Error("No se pudo verificar el perfil del propietario del agente.");
    if (profile.role === 'admin') return;

    const { plan, trial_ends_at } = profile;

    const getLimits = (p) => {
        switch (p) {
            case 'trial': return { msg: 150, name: 'Prueba' };
            case 'pro': return { msg: 1000, name: 'Pro' };
            case 'premium': return { msg: 10000, name: 'Premium' };
            default: return { msg: Infinity, name: 'Desconocido' };
        }
    };

    const limits = getLimits(plan);

    if (plan === 'trial' && trial_ends_at && new Date(trial_ends_at) < new Date()) {
        throw new Error("El período de prueba para este agente ha expirado.");
    }

    const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    
    const { data: usage, error: usageError } = await supabaseAdmin
        .from('usage_stats')
        .select('messages_sent')
        .eq('user_id', userId)
        .eq('month_start', currentMonthStart)
        .single();

    if (usageError && usageError.code !== 'PGRST116') {
        throw new Error("No se pudo verificar el uso de mensajes del propietario.");
    }

    const messagesSent = usage?.messages_sent || 0;

    if (messagesSent >= limits.msg) {
        throw new Error(`El propietario de este agente ha alcanzado el límite de ${limits.msg} mensajes de su plan ${limits.name}.`);
    }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { agentId, prompt, history, conversationId } = await req.json();
    if (!agentId || !prompt || !conversationId) {
      throw new Error("agentId, prompt y conversationId son requeridos.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? '',
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ''
    );
    
    const { data: agentData, error: agentError } = await supabaseAdmin.from("agents").select("system_prompt, user_id, company_name, status, deleted_at, model, webhook_url").eq("id", agentId).single();
    if (agentError) throw new Error("No se pudo encontrar el agente.");
    if (agentData.status !== 'active' || agentData.deleted_at) {
      throw new Error("Este agente no está activo.");
    }
    if (!agentData.webhook_url) {
      throw new Error("Este agente no tiene un Webhook de Acciones configurado.");
    }

    const { user_id: agentOwnerId } = agentData;

    await checkMessageLimit(agentOwnerId, supabaseAdmin);

    await supabaseAdmin.from("public_conversations").upsert({ id: conversationId, agent_id: agentId, user_id: agentOwnerId });
    await supabaseAdmin.from("public_messages").insert({ conversation_id: conversationId, role: "user", content: prompt });

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) throw new Error("GEMINI_API_KEY no está configurada.");
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

    const { data: sources, error: sourcesError } = await supabaseAdmin.from("knowledge_sources").select("id").eq("agent_id", agentId);
    if (sourcesError) throw sourcesError;
    const sourceIds = sources.map(s => s.id);

    let knowledgeContext = "No se encontró información relevante en la base de conocimiento.";
    if (sourceIds.length > 0) {
        const promptEmbedding = await embeddingModel.embedContent(prompt);
        const { data: chunks, error: matchError } = await supabaseAdmin.rpc('match_knowledge_chunks', {
            query_embedding: promptEmbedding.embedding.values,
            match_threshold: 0.3,
            match_count: 15,
            p_source_ids: sourceIds
        });
        if (matchError) throw matchError;
        if (chunks && chunks.length > 0) {
            knowledgeContext = chunks.map(c => c.content).join("\n\n---\n\n");
        }
    }

    const calendarContext = await getCalendarEvents(agentOwnerId, supabaseAdmin);

    const webhookPayload = {
      agent: { id: agentId, system_prompt: agentData.system_prompt, company_name: agentData.company_name, model: agentData.model },
      user: { id: null, conversationId: conversationId },
      prompt: prompt,
      history: history || [],
      context: { knowledge: knowledgeContext, calendar: calendarContext }
    };

    const webhookResponse = await fetch(agentData.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload),
      signal: AbortSignal.timeout(58000) // Aumentado a 58 segundos
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error('Webhook error body (público):', errorText);
      throw new Error(`El webhook devolvió un error (${webhookResponse.status}): ${errorText || 'Sin detalles'}`);
    }

    const responseBodyText = await webhookResponse.text();

    if (!responseBodyText || responseBodyText.trim() === '') {
        throw new Error('El webhook devolvió una respuesta vacía.');
    }

    let responseText = '';
    try {
        const responseData = JSON.parse(responseBodyText);
        if (responseData.output && typeof responseData.output === 'string') {
            responseText = responseData.output;
        } else {
            console.warn("La respuesta del webhook (público) es JSON pero no tiene el formato { output: '...' }. Se devolverá el JSON completo.");
            responseText = JSON.stringify(responseData, null, 2);
        }
    } catch (e) {
        console.log("La respuesta del webhook (público) no es JSON. Se tratará como texto plano.");
        responseText = responseBodyText;
    }

    let conversionData = null;

    try {
      const toolCall = JSON.parse(responseText);
      if (toolCall.tool === 'create_calendar_event' && toolCall.params) {
        console.log("Public tool call detected: create_calendar_event");
        const result = await createCalendarEvent(agentOwnerId, toolCall.params, supabaseAdmin);
        responseText = result.message;
        if (result.success) {
          conversionData = {
            type: 'appointment_booked',
            details: toolCall.params
          };
        }
      }
    } catch (e) {
      // Not a JSON or not a valid tool call, treat as plain text.
    }

    const { data: profileData } = await supabaseAdmin.from('profiles').select('role').eq('id', agentOwnerId).single();
    if (profileData && profileData.role !== 'admin') {
      await supabaseAdmin.rpc('increment_message_count', { p_user_id: agentOwnerId });
    }
    
    await supabaseAdmin.from("public_messages").insert({ conversation_id: conversationId, role: "assistant", content: responseText });

    if (conversionData) {
      await supabaseAdmin.from("public_conversions").insert({
        conversation_id: conversationId,
        agent_id: agentId,
        user_id: agentOwnerId,
        type: conversionData.type,
        details: conversionData.details
      });
    }

    return new Response(responseText, { headers: { ...corsHeaders, "Content-Type": "text/plain" } });
  } catch (error) {
    console.error("Error in ask-public-agent function:", error);
    if (error.name === 'AbortError') {
        return new Response(JSON.stringify({ error: "La petición al webhook tardó demasiado (timeout)." }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 504, // Gateway Timeout
        });
    }
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});