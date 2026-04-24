from flask import Flask, request, jsonify
from flask_cors import CORS
import fitz  # PyMuPDF
import sqlite3
import os
import requests  # Ollama와 통신하기 위한 라이브러리

app = Flask(__name__)
CORS(app)

DB_PATH = os.path.expanduser("~/goalcoin/backend/blankd.db")
# 맥미니 내부에서 돌고 있는 Ollama의 기본 포트 주소
OLLAMA_API_URL = "http://localhost:11434/api/generate"

def init_db():
    """데이터베이스 및 테이블 초기화"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet_address TEXT NOT NULL,
            card_content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

init_db()

@app.route('/api/upload-pdf', methods=['POST'])
def upload_pdf():
    if 'file' not in request.files:
        return jsonify({"error": "파일이 없습니다."}), 400
    
    file = request.files['file']
    try:
        doc = fitz.open(stream=file.read(), filetype="pdf")
        full_text = ""
        for page in doc:
            full_text += page.get_text()
        
        return jsonify({
            "message": "PDF 파싱 성공",
            "text_length": len(full_text),
            "preview": full_text[:1000]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/save-card', methods=['POST'])
def save_card():
    data = request.json
    wallet_address = data.get('wallet_address')
    card_content = data.get('card_content')

    if not wallet_address or not card_content:
        return jsonify({"error": "지갑 주소 또는 카드 내용이 누락되었습니다."}), 400

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO cards (wallet_address, card_content) VALUES (?, ?)",
            (wallet_address, card_content)
        )
        conn.commit()
        conn.close()
        return jsonify({"message": "노력이 성공적으로 기록되었습니다.", "status": "success"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/my-cards', methods=['GET'])
def get_my_cards():
    wallet_address = request.args.get('wallet_address')
    if not wallet_address:
        return jsonify({"error": "지갑 주소가 필요합니다."}), 400

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT card_content, created_at FROM cards WHERE wallet_address = ? ORDER BY created_at DESC", (wallet_address,))
    cards = [{"content": row[0], "date": row[1]} for row in cursor.fetchall()]
    conn.close()
    
    return jsonify({"cards": cards})

@app.route('/api/generate-questions', methods=['POST'])
def generate_questions():
    """Gemma 4를 활용하여 텍스트 기반 객관식 문제은행 자동 생성"""
    data = request.json
    text_context = data.get('text_context')
    
    if not text_context:
        return jsonify({"error": "문제 생성을 위한 텍스트가 없습니다."}), 400

    # 실무 평가 및 시험 대비에 최적화된 프롬프트 설계
    prompt = f"""다음 법령 및 규정 텍스트를 바탕으로, 실무 평가 및 승진 시험 대비용 객관식 문제 2개를 생성해 주세요.
반드시 각 문제마다 4개의 보기, 정답, 그리고 상세한 해설을 포함해야 합니다.

[텍스트]
{text_context}
"""
    # 아키님이 지정한 gemma4 모델 호출
    payload = {
        "model": "gemma4",
        "prompt": prompt,
        "stream": False
    }

    try:
        response = requests.post(OLLAMA_API_URL, json=payload)
        response.raise_for_status()
        result = response.json()
        return jsonify({"questions": result.get("response", "")})
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Ollama 연결 실패: 맥미니에 Ollama가 켜져 있는지 확인하세요. 상세 오류: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
