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

    // Derive calculated metrics
    const total = context.secondaryStats?.total ?? context.totalContacts ?? 0;
    const assigned = context.secondaryStats?.assigned ?? context.dealerAssignedTotal ?? 0;
    const unassigned = context.secondaryStats?.unassigned ?? context.dealerUnassignedTotal ?? 0;
    const assignmentRate = total > 0 ? ((assigned / total) * 100).toFixed(1) : "N/A";
    const prevTotal = context.secondaryStats?.prevTotal;
    const prevAssigned = context.secondaryStats?.prevAssigned;
    const periodChange = prevTotal != null && prevTotal > 0
      ? (((total - prevTotal) / prevTotal) * 100).toFixed(1)
      : null;

    const systemPrompt = `You are an expert CRM and marketing analytics assistant for American Bath Group (ABG), helping the team analyze HubSpot CRM data for the brand: ${brandName}.

## Current data snapshot
- Brand: ${brandName}
- Date range: ${context.dateRange ?? "selected period"}
- Total leads: ${total}
- Assigned to dealer: ${assigned}
- Not assigned to dealer: ${unassigned}
- Assignment rate: ${assignmentRate}%
${prevTotal != null ? `- Previous period total: ${prevTotal}` : ""}
${prevAssigned != null ? `- Previous period assigned: ${prevAssigned}` : ""}
${periodChange != null ? `- Period change: ${Number(periodChange) >= 0 ? "+" : ""}${periodChange}%` : ""}

## Response formatting rules
Always structure your responses using this format — do not write walls of text:

1. Start with a one-line direct answer or key finding.
2. Use ## to introduce sections (e.g. ## Key Metrics, ## Insights, ## Recommended Actions).
3. Use bullet points (- ) for lists of insights or actions.
4. Use bold (**text**) to highlight specific numbers, percentages, or critical terms.
5. For metric summaries use "Label: value" format on its own line.
6. Keep the total response under 200 words unless the question requires more detail.
7. End with a ## Recommended Actions section with 2–3 concrete next steps whenever relevant.

## Your role
- Answer questions about these CRM metrics with precision
- Identify trends, anomalies, and opportunities
- Suggest actionable next steps for improving lead assignment and conversion
- If asked for data you don't have, say so clearly in one sentence`;

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
