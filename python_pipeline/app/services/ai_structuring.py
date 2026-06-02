import os
from google import genai
from pydantic import BaseModel, Field
from typing import List, Optional

class TopicEntry(BaseModel):
    topic_name: str = Field(
        ..., 
        description="The primary academic topic or subject matter covered (e.g., 'Thermodynamics', 'Dijkstra Algorithm')."
    )
    week_number: Optional[int] = Field(
        None, 
        description="The integer week number during the semester when this topic is covered. If only dates are present, deduce the chronological week starting at 1. Return null if entirely undeterminable."
    )
    session_type: str = Field(
        ..., 
        description="The category of the session. Must exactly match one of: 'lecture', 'tutorial', or 'lab'."
    )

class DocumentSyllabusExtraction(BaseModel):
    topics: List[TopicEntry] = Field(
        ..., 
        description="A comprehensive, chronologically ordered list of all academic topics extracted from the document."
    )

def extract_academic_topics_via_gemini(raw_text: str, document_type: str) -> Optional[DocumentSyllabusExtraction]:
    """
    Invokes Google Gemini API utilizing strict JSON schema enforcement to parse 
    unstructured academic text into a highly structured taxonomy.
    """
    # Initialize the Gemini client
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    
    system_prompt = (
        "You are an expert academic data extractor and semantic parser. "
        "Your objective is to analyze the raw text of university documents and extract "
        "a highly structured schedule of academic topics.\n\n"
        "Extraction Directives:\n"
        "1. Identify every unique pedagogical topic taught in the course.\n"
        "2. Classify the session_type strictly as 'lecture', 'tutorial', or 'lab'. If ambiguous, default to 'lecture' for theoretical concepts and 'lab' for practical or software-based exercises.\n"
        "3. Deduce the 'week_number' (integer). If the document provides dates instead of weeks, calculate the sequential week number starting with 1 for the earliest date. If no temporal data exists, leave the field null.\n"
        "4. Ignore administrative filler, grading rubrics, office hours, and academic integrity boilerplate. Focus solely on the syllabus schedule."
    )
    
    # Truncate text to remain safely within context window limits if necessary
    user_message = f"Document Type: {document_type}\n\nDocument Content:\n{raw_text[:150000]}" 
    
    try:
        response = client.models.generate_content(
            model='gemini-3.1-pro',
            contents=user_message,
            config=genai.types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.1,
                response_mime_type="application/json",
                response_schema=DocumentSyllabusExtraction,
            ),
        )
        
        # Parse response as Pydantic model
        structured_data = DocumentSyllabusExtraction.model_validate_json(response.text)
        return structured_data

    except Exception as e:
        print(f"Gemini API Communication Protocol Error: {e}")
        return None
