from flask import Flask, request, jsonify
from flask_cors import CORS
import fitz  # PyMuPDF
 import sqlite3
import os
from datetime import datetime

app = Flask(__name__)
CORS(app)  # 모든 오리진으로부터의 통신 허용

DB_PATH = os.path.expanduser("~/goalcoin/backend/blankd.db")

def init_db():
    """데이터베이스 및 테이블 초기화"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # cards 테이블 생성: 지갑 주소, 카드 내용, 생성 시간을 저장
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

# 앱 시작 시 DB 초기화 실행
init_db()

@app.route('/api/upload-pdf', methods=['POST'])
def upload_pdf():
    """PDF에서 텍스트를 추출하는 API"""
    if 'file' not in request.files:
        return jsonify({"error": "파일이 없습니다."}), 400
    
    file = request.files['file']
    try:
        doc = fitz.open(stream=file.read(), filetype="pdf")
        full_text = ""
        for page in doc:
            full_text += page.get_text()
        
        # Gemma 4 등 로컬 AI 모델 분석을 위한 텍스트 준비 단계
        return jsonify({
            "message": "PDF 파싱 성공",
            "text_length": len(full_text),
            "preview": full_text[:1000]  # UI 개선에 맞춰 미리보기 분량 확대
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/save-card', methods=['POST'])
def save_card():
    """생성된 빈칸 카드를 DB에 저장하는 API"""
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
    """특정 지갑 주소의 저장된 카드 목록을 불러오는 API (추후 확장용)"""
    wallet_address = request.args.get('wallet_address')
    if not wallet_address:
        return jsonify({"error": "지갑 주소가 필요합니다."}), 400

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT card_content, created_at FROM cards WHERE wallet_address = ? ORDER BY created_at DESC", (wallet_address,))
    cards = [{"content": row[0], "date": row[1]} for row in cursor.fetchall()]
    conn.close()
    
    return jsonify({"cards": cards})

if __name__ == '__main__':
    # 맥미니의 로컬 환경 및 터널 접속을 위해 0.0.0.0으로 개방
    app.run(host='0.0.0.0', port=5001)
