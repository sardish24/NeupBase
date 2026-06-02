-- Create an enumerated type to strictly enforce document categorizations
CREATE TYPE public.document_category AS ENUM (
    'syllabus', 
    'lecture_notes', 
    'lab_manual', 
    'handout'
);

-- Establish the primary metadata table for the academic second brain
CREATE TABLE public.academic_documents (
    document_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    storage_object_id UUID NOT NULL,
    subject_name VARCHAR(255) NOT NULL,
    document_type public.document_category NOT NULL,
    semester_tag VARCHAR(50) NOT NULL,
    upload_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    extraction_status VARCHAR(50) DEFAULT 'pending',
    topics_json JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT fk_storage_object
        FOREIGN KEY (storage_object_id) 
        REFERENCES storage.objects (id)
        ON DELETE CASCADE
);

-- Apply indexing to frequently queried columns to optimize read operations
CREATE INDEX idx_academic_docs_subject ON public.academic_documents(subject_name);
CREATE INDEX idx_academic_docs_semester ON public.academic_documents(semester_tag);
CREATE INDEX idx_academic_docs_status ON public.academic_documents(extraction_status);
CREATE INDEX idx_academic_docs_topics ON public.academic_documents USING GIN (topics_json);

-- Enable Row Level Security on the storage objects table
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated students to upload documents to any subject bucket
CREATE POLICY "Enable authenticated document uploads" 
ON storage.objects 
FOR INSERT 
TO authenticated 
WITH CHECK (
    -- Validates the operation belongs to a recognized bucket
    bucket_id IS NOT NULL 
    AND 
    -- Validates the user owns the uploaded object
    owner_id = (select auth.uid()::text)
);

-- Policy: Allow students to read documents they own across any subject bucket
CREATE POLICY "Enable read access for document owners" 
ON storage.objects 
FOR SELECT 
TO authenticated 
USING (
    owner_id = (select auth.uid()::text)
);

-- Define the webhook execution function
CREATE OR REPLACE FUNCTION trigger_pipeline_edge_function() 
RETURNS TRIGGER 
LANGUAGE plpgsql 
AS $$
BEGIN
  -- Execute the asynchronous HTTP request to the Supabase Edge Function
  PERFORM supabase_functions.http_request(
    url => concat(current_setting('SUPABASE_URL', true), '/functions/v1/document-pipeline-trigger'),
    method => 'POST',
    headers => '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('WEBHOOK_SECRET', true) || '"}',
    body => jsonb_build_object(
        'type', 'INSERT',
        'table', TG_TABLE_NAME,
        'schema', TG_TABLE_SCHEMA,
        'record', row_to_json(NEW)
    )::text,
    timeout => '5000'
  );
  RETURN NEW;
END;
$$;

-- Create the trigger on storage.objects, preventing infinite loops
CREATE TRIGGER dispatch_document_processing 
AFTER INSERT ON storage.objects 
FOR EACH ROW 
-- Only trigger if the object is not placed in a reserved system bucket
WHEN (NEW.bucket_id NOT IN ('system_assets', 'profile_avatars')) 
EXECUTE FUNCTION trigger_pipeline_edge_function();

-- Create a scheduled cron job executing every 15 minutes to handle timeouts
SELECT cron.schedule('reconciliation-job', '*/15 * * * *', $$
    UPDATE public.academic_documents
    SET extraction_status = 'timeout_failed'
    WHERE extraction_status = 'pending' 
    -- Flag records that have been pending for longer than 30 minutes
    AND upload_date < NOW() - INTERVAL '30 minutes';
$$);
