declare module 'mammoth' {
  export interface ExtractionResult {
    value: string;
    messages: any[];
  }
  export function extractRawText(input: { buffer: Buffer }): Promise<ExtractionResult>;
}
