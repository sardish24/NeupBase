import { GoogleGenAI } from '@google/genai';
// Initialize the Google GenAI client using the server environment variable
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});
/**
 * Extracts a strict 4-level knowledge tree from unstructured course text.
 * The schema enforces additionalProperties: false at all nested depths to 
 * satisfy constrained decoding requirements.
 */
export async function generateCourseTree(rawCourseText: string) {
  // Define the strict JSON schema expected by the application.
  // The root must be an object containing the requested array format.
  const schema = {
    type: "object",
    properties: {
      tree: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            level: { type: "integer", description: "Must be 1" },
            children: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  level: { type: "integer", description: "Must be 2" },
                  children: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string" },
                        level: { type: "integer", description: "Must be 3" },
                        resource_hint: { type: "string" },
                        children: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              label: { type: "string" },
                              level: { type: "integer", description: "Must be 4" }
                            },
                            required: ["label", "level"],
                            additionalProperties: false
                          }
                        }
                      },
                      // Level 3 requires the resource_hint property
                      required: ["label", "level", "resource_hint", "children"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["label", "level", "children"],
                additionalProperties: false
              }
            }
          },
          required: ["label", "level", "children"],
          additionalProperties: false
        }
      }
    },
    required: ["tree"],
    additionalProperties: false
  };
  const prompt = `
You are an expert academic curriculum designer. Analyze the following raw extracted text from a course handout and synthesize a strict 4-level hierarchical table of contents representing the course knowledge tree.
Level Definitions:
- Level 1 (Module): Major thematic units or time-blocks. *Crucial Instruction*: If the handout is poorly structured or has no explicit module divisions, you must logically synthesize 3 to 6 modules based on chronological flow (e.g., "Weeks 1-4: Foundations") or overarching themes.
- Level 2 (Topic): Core instructional subjects within the parent module.
- Level 3 (Subtopic): Specific instructional units. You must provide a 'resource_hint' string indicating what material covers this (e.g., "Textbook Ch 3", "Lab 1", "Week 4 Lecture").
- Level 4 (Concept): Atomic ideas, definitions, or core skills to be learned.
Constraints:
Ensure the output strictly conforms to the provided JSON schema. Do not include markdown formatting or preamble text.
Raw Course Handout Text:
${rawCourseText}
  `;
  // Execute the API call with Structured Outputs configuration
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro",
    contents: prompt,
    config: {
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: schema
    }
  });
  if (!response.text) {
    throw new Error("Invalid response format received from the Gemini API.");
  }
  // Parse the guaranteed JSON text and return the root array
  const jsonResponse = JSON.parse(response.text);
  return jsonResponse.tree;
}
