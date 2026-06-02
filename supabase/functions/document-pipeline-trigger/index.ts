import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

// Define the precise structure of the Supabase Webhook Insert Payload
interface StorageWebhookPayload {
  type: 'INSERT'
  table: string
  schema: string
  record: {
    id: string
    bucket_id: string
    name: string
    owner_id: string
    metadata: Record<string, any>
  }
}

serve(async (req: Request) => {
  try {
    // 1. Authenticate the incoming request via Webhook Secret
    const authHeader = req.headers.get('Authorization')
    if (authHeader !== `Bearer ${Deno.env.get('WEBHOOK_SECRET')}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized webhook invocation' }), { status: 401 })
    }

    // 2. Parse the Webhook JSON Payload
    const payload: StorageWebhookPayload = await req.json()
    
    // Ensure the event is strictly an INSERT operation
    if (payload.type !== 'INSERT') {
      return new Response(JSON.stringify({ message: 'Ignored non-insert event' }), { status: 200 })
    }

    const { id: storage_object_id, bucket_id, name } = payload.record

    // 3. Initialize the Supabase Client using the Service Role Key for elevated privileges
    const supabaseUrl = Deno.env.get('SUPABASE_URL') as string
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 4. Generate a secure, time-boxed Signed URL (valid for 10 minutes / 600 seconds)
    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin
      .storage
      .from(bucket_id)
      .createSignedUrl(name, 600)

    if (signedUrlError || !signedUrlData) {
      console.error(`Cryptographic failure generating signed URL for ${name}:`, signedUrlError)
      return new Response(JSON.stringify({ error: 'Signed URL generation failed' }), { status: 500 })
    }

    // 5. Retrieve associated relational metadata from public.academic_documents
    const { data: academicMetadata, error: metadataError } = await supabaseAdmin
      .from('academic_documents')
      .select('document_id, subject_name, document_type, semester_tag')
      .eq('storage_object_id', storage_object_id)
      .single()

    if (metadataError) {
      // If metadata is not immediately available due to a race condition with the client insert,
      // the system logs the warning but proceeds; the Python pipeline can poll for it.
      console.warn(`Metadata race condition for storage object ${storage_object_id}`, metadataError)
    }

    // 6. Formulate the payload for the Python Processing Pipeline
    const pythonPipelineUrl = Deno.env.get('PYTHON_PIPELINE_URL') as string
    const pipelinePayload = {
      storage_object_id,
      document_id: academicMetadata?.document_id || null,
      file_url: signedUrlData.signedUrl,
      file_path: name,
      bucket: bucket_id,
      subject_name: academicMetadata?.subject_name || 'Unknown',
      document_type: academicMetadata?.document_type || 'handout'
    }

    // 7. Trigger the external Python API 
    // Utilizing a fire-and-forget strategy to prevent Edge Function timeouts (Deno limits execution duration).
    fetch(pythonPipelineUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('PIPELINE_API_SECRET')}`
      },
      body: JSON.stringify(pipelinePayload)
    }).catch(err => console.error("Pipeline trigger network discontinuity:", err))

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Processing pipeline engaged successfully',
      object_id: storage_object_id 
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (error: any) {
    console.error('Edge Function catastrophic unhandled exception:', error)
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), { status: 500 })
  }
})
