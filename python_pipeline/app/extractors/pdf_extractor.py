import os
import requests
import tempfile
import pdfplumber
from pdfplumber.pdfminer.pdfdocument import PDFPasswordIncorrect

class PDFExtractor:
    @staticmethod
    def extract_text(file_url: str, fallback_password: str = "") -> str:
        extracted_text = []
        
        # Download file to an ephemeral, secure temporary location
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
            response = requests.get(file_url, stream=True, timeout=45)
            response.raise_for_status()
            for chunk in response.iter_content(chunk_size=8192):
                temp_pdf.write(chunk)
            temp_file_path = temp_pdf.name

        try:
            # Initialize pdfplumber with advanced layout parameters and metadata overrides
            with pdfplumber.open(
                temp_file_path, 
                password=fallback_password,
                laparams={"line_overlap": 0.7},
                strict_metadata=False
            ) as pdf:
                for page_num, page in enumerate(pdf.pages):
                    # 1. Extract standard text flows using coordinate bounding boxes
                    page_text = page.extract_text()
                    if page_text:
                        extracted_text.append(f"--- PAGE {page_num + 1} ---\n{page_text}")
                    
                    # 2. Extract tabular data to preserve structural relationships
                    tables = page.extract_tables()
                    for table in tables:
                        # Reconstruct the table layout using pipe delimiters
                        table_str = "\n".join([" | ".join([str(cell).replace('\n', ' ') if cell else "" for cell in row]) for row in table])
                        extracted_text.append(f"\n\n{table_str}\n")
                        
        except PDFPasswordIncorrect:
            raise ValueError("Extraction halted: Document is protected by a cryptographic user password.")
        except Exception as e:
            raise RuntimeError(f"Layout engine parsing fault encountered: {str(e)}")
        finally:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)

        return "\n\n".join(extracted_text)
