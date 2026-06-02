import { createClient } from 'npm:@supabase/supabase-js@2'

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

// CORS Headers for edge environments
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Verify caller has service role key
    const authHeader = req.headers.get('Authorization')
    if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized access' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // Parse the payload dispatched by pg_net
    const requestData = await req.json()
    // For pg_cron trigger, we'll fetch all users. If invoked manually, use user_id.
    const { user_id, week_number = 8 } = requestData

    const usersToProcess = user_id 
      ? [{ id: user_id }] 
      : (await supabaseClient.auth.admin.listUsers()).data.users || [];

    if (![4, 8, 16].includes(week_number)) {
      return new Response(JSON.stringify({ error: 'Checkpoints strictly limited to weeks 4, 8, 16' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }
    
    for (const user of usersToProcess) {
      const current_user_id = user.id;

    const apiKey = Deno.env.get('GEMINI_API_KEY')

    // 1. Telemetry Aggregation (assuming these RPCs are built in the DB)
    const { data: prepData, error: prepErr } = await supabaseClient.rpc('calculate_overall_preparation', { p_user_id: current_user_id })
    const { data: subjectCoverage, error: subErr } = await supabaseClient.rpc('calculate_subject_coverage', { p_user_id: current_user_id })
    const { data: laggedTopics, error: lagErr } = await supabaseClient.rpc('get_lagging_topics', { p_user_id: current_user_id })

    if (prepErr || subErr || lagErr) {
      console.error('Database aggregation failed', prepErr, subErr, lagErr)
      throw new Error('Database aggregation failed')
    }

    // 2. Week 8 Flag Injection Pipeline
    let midtermCriticalFailures = []
    if (week_number === 8) {
      // Isolate subjects where syllabus coverage metrics trigger the 50% threshold 
      midtermCriticalFailures = subjectCoverage?.filter((sub: { is_midterm_syllabus?: boolean; coverage_percentage: number }) => 
        sub.is_midterm_syllabus === true && sub.coverage_percentage < 50
      ) || []
    }

    // 3. Prompt Architecture and Deterministic Tuning
    const systemInstruction = `You are a highly analytical academic advisory engine. Your objective is to synthesize a student's telemetry into a structured, professional checkpoint report. Maintain an objective, empirical, yet encouraging tone. You are strictly forbidden from inventing data, fabricating subject names, or hallucinating tasks. Rely entirely on the provided JSON arrays.`

    let userContext = `
    Perform a Checkpoint Analysis for Semester Week ${week_number}.
    
    Quantitative Payload:
    - Overall Semester Preparation: ${prepData?.percentage || 0}%
    - Subject-by-Subject Coverage Mapping: ${JSON.stringify(subjectCoverage || [])}
    - High-Risk Lagging Topics: ${JSON.stringify(laggedTopics || [])}
    `

    if (week_number === 8) {
      userContext += `
      CRITICAL PROTOCOL: Week 8 Midterm Evaluation.
      The following subjects possess sub-50% midterm syllabus coverage: ${JSON.stringify(midtermCriticalFailures)}.
      You MUST explicitly flag these subjects in a dedicated high-priority warning section at the very top of the output.
      `
    }

    userContext += `
    Structural Output Requirements (Format exactly in Markdown):
    ## Executive Preparation Summary
    ## Subject Coverage Breakdown
    ## High-Risk Areas
    ## Recommended 14-Day Priority Sequence
    `

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`
    const requestBody = {
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [{
        role: "user",
        parts: [{ text: userContext }]
      }],
      generationConfig: {
        maxOutputTokens: 1800,
        temperature: 0.15
      }
    }

    const apiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    })

    const responseJson = await apiResponse.json()
    if (!apiResponse.ok) {
      console.error("Gemini API Error", responseJson)
      throw new Error('LLM Generation failed')
    }

    const reportSummary = responseJson?.candidates?.[0]?.content?.parts?.[0]?.text
    
    if (!reportSummary) {
      console.error("Gemini returned invalid response format", responseJson)
      throw new Error('LLM Generation invalid response')
    }

    // 4. Persistence Layer
    const { error: insertError } = await supabaseClient.from('checkpoint_reports').insert({
      user_id: current_user_id,
      target_week: week_number,
      report_markdown: reportSummary,
      generated_at: new Date().toISOString()
    })

    if (insertError) {
      console.error('Failed to persist checkpoint report', insertError)
      throw new Error('Persistence failed')
    }
  } // End of user loop

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('CRITICAL: Checkpoint generation sequence failed.', error)
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
