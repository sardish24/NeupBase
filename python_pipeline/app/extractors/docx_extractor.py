import docx
import tempfile
import requests
import os

class DOCXExtractor:
    @staticmethod
    def extract_text(file_url: str) -> str:
        extracted_content = []
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as temp_docx:
            response = requests.get(file_url, stream=True, timeout=45)
            response.raise_for_status()
            temp_docx.write(response.content)
            temp_file_path = temp_docx.name

        try:
            doc = docx.Document(temp_file_path)
            
            # Iterate through the inner content sequentially to preserve document flow
            for child in doc.iter_inner_content():
                if isinstance(child, docx.text.paragraph.Paragraph):
                    cleaned_text = child.text.strip()
                    if cleaned_text:
                        # Prepend heading formatting based on XML style attributes
                        if child.style.name.startswith('Heading'):
                            extracted_content.append(f"\n### {cleaned_text} ###")
                        else:
                            extracted_content.append(cleaned_text)
                            
                elif isinstance(child, docx.table.Table):
                    extracted_content.append("\n")
                    for row in child.rows:
                        row_data = [cell.text.replace('\n', ' ').strip() for cell in row.cells]
                        extracted_content.append(" | ".join(row_data))
                    extracted_content.append("\n")
                        
        except Exception as e:
            raise RuntimeError(f"DOCX XML traversal failure: {str(e)}")
        finally:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)

        return "\n".join(extracted_content)
