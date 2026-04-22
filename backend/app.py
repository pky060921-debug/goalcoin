# ~/goalcoin/backend/app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import fitz  # PyMuPDF
import os

app = Flask(__name__)
CORS(app)  # 프론트엔드(React)와의 통신 허용

@app.route('/api/upload-pdf', methods=['POST'])
def upload_pdf():
    if 'file' not in request.files:
        return jsonify({"error": "파일이 없습니다."}), 400
    
    file = request.files['file']
    doc = fitz.open(stream=file.read(), filetype="pdf")
    
    full_text = ""
    for page in doc:
        full_text += page.get_text()
    
    # 나중에 여기서 Gemma 4에게 텍스트를 보내 분석시킬 예정입니다.
    return jsonify({
        "message": "PDF 파싱 성공",
        "text_length": len(full_text),
        "preview": full_text[:500]  # 앞부분 500자만 미리보기로 반환
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001) # 5001번 포트 사용
