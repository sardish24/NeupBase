import mammoth from 'mammoth';
export async function extractTextFromDocxBuffer(buffer: Buffer): Promise<string> {
  try {
    // Mammoth consumes the binary buffer and systematically strips XML metadata
    const result = await mammoth.extractRawText({ buffer });
    return result.value; 
  } catch (error) {
    throw new Error(`Critical DOCX Extraction Failure: ${error}`);
  }
}
