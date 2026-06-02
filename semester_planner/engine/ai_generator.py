import os
import json
from google import genai
from google.genai import types
from google.genai.errors import APIError

def generate_micro_tasks(topic_name: str, subject_name: str, lecture_count: int) -> list:
    """
    Takes a syllabus topic and estimated lecture count, and calls the Gemini API 
    to generate a micro-step study plan. Returns a strictly validated list of JSON objects.
    """
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    
    # Define the precise JSON schema required for downstream PostgreSQL ingestion
    micro_task_schema = {
        "type": "object",
        "properties": {
            "tasks": {
                "type": "array",
                "description": "An ordered sequence of micro-tasks required to master the topic.",
                "items": {
                    "type": "object",
                    "properties": {
                        "task_title": {
                            "type": "string",
                            "description": "Actionable title (e.g., 'Read Chapter 4 Notes', 'Solve Lab Equations')"
                        },
                        "action_verb": {
                            "type": "string",
                            "enum": ["read", "solve", "summarize", "practice", "review"],
                            "description": "Categorization of the required cognitive action."
                        },
                        "estimated_duration_mins": {
                            "type": "integer",
                            "description": "Time in minutes. Must be between 30 and 60."
                        },
                        "base_difficulty": {
                            "type": "number",
                            "description": "Multiplier from 1.0 (baseline) to 2.0 (highly complex)."
                        },
                        "is_exam_prep": {
                            "type": "boolean",
                            "description": "True if the task explicitly synthesizes material for Midterms/Finals."
                        }
                    },
                    "required": ["task_title", "action_verb", "estimated_duration_mins", "base_difficulty", "is_exam_prep"],
                    "additionalProperties": False
                }
            }
        },
        "required": ["tasks"],
        "additionalProperties": False
    }

    # Construct the highly structured prompt using XML tags for literal adherence
    system_prompt = (
        "You are an expert academic curriculum designer. Your role is to decompose high-level "
        "university syllabus topics into discrete, actionable micro-tasks for a student planner."
    )
    
    user_prompt = f"""
    <context>
    Subject: {subject_name}
    Topic: {topic_name}
    Estimated Lectures: {lecture_count} (~1 hour each)
    </context>
    
    <behavior_instructions>
    1. Break the given topic down into logical, sequential study steps.
    2. Each step MUST strictly take between 30 and 60 minutes to complete. 
    3. Ensure a balanced mix of consumption (read), processing (summarize), and application (solve/practice).
    4. Base the total volume of generated tasks on the standard ratio that 1 lecture hour requires 1.5 to 2 hours of independent study.
    5. Order the tasks sequentially from basic foundational understanding to advanced application.
    </behavior_instructions>
    """

    try:
        response = client.models.generate_content(
            model="gemini-3.1-pro",
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                response_schema=micro_task_schema,
                max_output_tokens=1500
            )
        )
        
        # Parse the structured payload from the API response
        if response.text:
            data = json.loads(response.text)
            return data.get("tasks", [])
        return []
                
    except APIError as e:
        print(f"API Interface Error: {e}")
        return []
    except Exception as e:
        print(f"Unexpected Error: {e}")
        return []
