const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  brandName: string;
  messages: ChatMessage[];
  context: {
    totalContacts?: number;
    dealerAssignedTotal?: number;
    dealerUnassignedTotal?: number;
    dateRange?: string;
    secondaryStats?: {
      total?: number;
      assigned?: number;
      unassigned?: number;
      prevTotal?: number;
      prevAssigned?: number;
      prevUnassigned?: number;
    };
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { brandName, messages, context }: ChatRequest = await req.json();

    // Build a concise system prompt with the current brand CRM data
    const systemPrompt = `You are an expert CRM and marketing analytics assistant for American Bath Group (ABG). You are helping the team analyze HubSpot CRM data for the brand: ${brandName}.

Current data snapshot:
- Brand: ${brandName}
- Date range: ${context.dateRange ?? "selected period"}
- Total leads/contacts created: ${context.secondaryStats?.total ?? context.totalContacts ?? "N/A"}
- Assigned to dealer: ${context.secondaryStats?.assigned ?? context.dealerAssignedTotal ?? "N/A"}
- Not assigned to dealer: ${context.secondaryStats?.unassigned ?? context.dealerUnassignedTotal ?? "N/A"}
${context.secondaryStats?.prevTotal != null ? `- Previous period total: ${context.secondaryStats.prevTotal}` : ""}
${context.secondaryStats?.prevAssigned != null ? `- Previous period assigned: ${context.secondaryStats.prevAssigned}` : ""}
${context.secondaryStats?.prevUnassigned != null ? `- Previous period unassigned: ${context.secondaryStats.prevUnassigned}` : ""}

Your role:
- Answer questions about these CRM metrics
- Identify trends, anomalies, and opportunities
- Suggest actionable next steps for improving lead assignment and conversion
- Keep answers concise and data-driven
- If asked for data you don't have, say so clearly`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(JSON.stringify({ error: `Anthropic API error: ${err}` }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text ?? "";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
