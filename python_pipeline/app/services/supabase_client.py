import os
from supabase import create_client, Client
from typing import Optional, Dict, Any

def get_supabase_client() -> Client:
    url = os.getenv("SUPABASE_DB_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise ValueError("Missing Supabase credentials in environment variables")
    return create_client(url, key)

def update_document_metadata(document_id: str, status: str, topics_json: Optional[Dict[str, Any]] = None):
    """
    Updates the academic_documents table with the final extraction status and topics JSON.
    """
    if not document_id:
        return
        
    try:
        supabase = get_supabase_client()
        
        update_data = {"extraction_status": status}
        if topics_json is not None:
            update_data["topics_json"] = topics_json
            
        result = supabase.table("academic_documents") \
            .update(update_data) \
            .eq("document_id", document_id) \
            .execute()
            
        print(f"Updated document {document_id} status to {status}")
    except Exception as e:
        print(f"Failed to update Supabase record for {document_id}: {e}")
