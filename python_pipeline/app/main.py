import os
from fastapi import FastAPI, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from .extractors.pdf_extractor import PDFExtractor
from .extractors.docx_extractor import DOCXExtractor
from .extractors.pptx_extractor import PPTXExtractor
from .services.ai_structuring import extract_academic_topics_via_gemini
from .services.supabase_client import update_document_metadata

app = FastAPI(title="Academic Document Vault Pipeline")

class PipelinePayload(BaseModel):
    storage_object_id: str
    document_id: Optional[str] = None
    file_url: str
    file_path: str
    bucket: str
    subject_name: str
    document_type: str

def process_document(payload: PipelinePayload):
    try:
        # Determine file type
        ext = payload.file_path.lower().split('.')[-1]
        
        extracted_text = ""
        
        if ext == 'pdf':
            extracted_text = PDFExtractor.extract_text(payload.file_url)
        elif ext == 'docx':
            extracted_text = DOCXExtractor.extract_text(payload.file_url)
        elif ext == 'pptx':
            extracted_text = PPTXExtractor.extract_text(payload.file_url)
        else:
            update_document_metadata(payload.document_id, "failed_unsupported_format")
            return
            
        # Resilience check: if text is too short, might be a scanned image
        if len(extracted_text.strip()) < 150:
            update_document_metadata(payload.document_id, "failed_requires_ocr")
            return
            
        # Step 2: AI Structuring using Gemini
        structured_data = extract_academic_topics_via_gemini(extracted_text, payload.document_type)
        
        if not structured_data or not structured_data.topics:
            update_document_metadata(payload.document_id, "failed_ai_parsing")
            return
            
        # Step 3: Update Supabase
        update_document_metadata(
            document_id=payload.document_id,
            status="completed",
            topics_json=structured_data.model_dump()
        )
        
    except ValueError as e:
        if "cryptographic user password" in str(e):
            update_document_metadata(payload.document_id, "failed_password_protected")
        else:
            update_document_metadata(payload.document_id, "failed_processing")
    except Exception as e:
        print(f"Pipeline processing error: {e}")
        update_document_metadata(payload.document_id, "failed_corrupt_file")

@app.post("/webhook")
async def pipeline_webhook(payload: PipelinePayload, request: Request, background_tasks: BackgroundTasks):
    auth_header = request.headers.get('Authorization')
    expected_token = os.getenv('PIPELINE_API_SECRET')
    
    if not expected_token or auth_header != f"Bearer {expected_token}":
        raise HTTPException(status_code=401, detail="Unauthorized pipeline invocation")
        
    if not payload.document_id:
        # Without document_id, we can't update relational metadata
        raise HTTPException(status_code=400, detail="Missing document_id in payload")
        
    # Dispatch processing to background task to avoid timeout
    background_tasks.add_task(process_document, payload)
    
    return {"status": "processing_started", "document_id": payload.document_id}

@app.get("/health")
def health_check():
    return {"status": "ok"}
