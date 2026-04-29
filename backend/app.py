from flask import Flask, request, jsonify
from flask_cors import CORS
import fitz  # PyMuPDF
import sqlite3
import os
import requests
import re
import random
import json
import traceback
import logging
import subprocess
from datetime import datetime, timedelta

try:
    import docx
except ImportError:
    docx = None

# ==========================================
# 1. 에러 추적 로깅 설정
# ==========================================
logging.basicConfig(filename='backend_error_log.txt', level=logging.ERROR, 
                    format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__)
# 🚨 CORS 정책 전면 개방 (Failed to fetch 방지)
CORS(app, resources={r"/api/*": {"origins": "*"}})
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024

DB_PATH = os.path.expanduser("~/goalcoin/backend/blankd.db")

OLLAMA_API_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "gemma4:26b" 

@app.errorhandler(Exception)
def handle_exception(e):
    error_detail = traceback.format_exc()
    logging.error(f"백엔드 치명적 에러:\n{error_detail}")
    print(f"\n[🚨 서버 치명적 에러]\n{error_detail}")
    return jsonify({"error": "백엔드 엔진 오류", "details": error_detail}), 500

# 🚨 [신규 진단 기능] 프론트엔드가 백엔드 생존 여부를 확인하는 핑(Ping) 엔드포인트
@app.route('/api/health', methods=['GET', 'OPTIONS'])
def health_check():
    return jsonify({"status": "alive", "message": "백엔드 서버가 정상적으로 응답하고 있습니다."}), 200

# ==========================================
# 2. DB 초기화 
# ==========================================
def init_db():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT, title TEXT, content TEXT)')
        cursor.execute('CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT, category_id INTEGER, card_content TEXT, answer_text TEXT, options_json TEXT, level INTEGER DEFAULT 0, next_review_time DATETIME, status TEXT DEFAULT "OWNED")')
        cursor.execute('CREATE TABLE IF NOT EXISTS exams (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT, title TEXT, content TEXT)')
        cursor.execute('CREATE TABLE IF NOT EXISTS ai_analysis (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT, topic TEXT, summary TEXT, recommended_blanks TEXT, quiz_json TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)')
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"DB 초기화 실패: {e}")

init_db()

# ==========================================
# 3. 법령 파싱 및 망각 곡선 로직
# ==========================================
def parse_law_into_categories(text):
    pattern = r'(제\s*\d+\s*조(?:의\s*\d+)?\s*(?:\([^)]+\))?)'
    parts = re.split(pattern, text)
    categories = []
    if parts:
        if parts[0].strip():
            categories.append({"title": "총칙 및 서론", "content": parts[0].strip()})
        for i in range(1, len(parts), 2):
            title = parts[i].strip()
            content = parts[i+1].strip() if i+1 < len(parts) else ""
            categories.append({"title": title, "content": content})
    return categories if categories else [{"title": "문서 전체", "content": text}]

def get_next_review_time(level):
    now = datetime.utcnow()
    if level == 0: return now + timedelta(hours=12)
    elif level == 1: return now + timedelta(days=1)
    elif level == 2: return now + timedelta(days=3)
    else: return now + timedelta(days=7)

def extract_text(file):
    filename = file.filename.lower()
    raw_bytes = file.read()
    if filename.endswith('.pdf'):
        try:
            doc = fitz.open(stream=raw_bytes, filetype="pdf")
            return "".join([page.get_text() for page in doc])
        except Exception as e:
            raise Exception(f"PDF 파싱 실패 (파일이 손상되었거나 암호화됨): {str(e)}")
    elif filename.endswith('.docx') and docx:
        import io
        doc_file = docx.Document(io.BytesIO(raw_bytes))
        return "\n".join([p.text for p in doc_file.paragraphs])
    else:
        try: return raw_bytes.decode('utf-8')
        except: return raw_bytes.decode('cp949', errors='ignore')

# ==========================================
# 4. API 엔드포인트
# ==========================================
@app.route('/api/github-pull', methods=['POST'])
def github_pull():
    try:
        result = subprocess.check_output(['git', 'pull', 'origin', 'main'], stderr=subprocess.STDOUT)
        return jsonify({"message": "GitHub 코드가 최신화되었습니다.", "details": result.decode('utf-8')})
    except subprocess.CalledProcessError as e:
        return jsonify({"error": "GitHub 동기화 실패", "details": e.output.decode('utf-8')}), 500

@app.route('/api/ai-analyze', methods=['POST'])
def ai_analyze():
    data = request.json
    text = data.get('text', '')
    wallet_address = data.get('wallet_address', 'unknown')
    
    if not text:
        return jsonify({"error": "텍스트가 제공되지 않았습니다."}), 400
        
    prompt = f"""
    당신은 훌륭한 법학습 조력자 인공지능 '아키'입니다.
    다음 법령/모의고사 문서를 분석하여 반드시 아래 JSON 형식으로만 응답하세요.
    {{
        "topic": "문서 핵심 주제",
        "summary": "3줄 요약",
        "recommended_blanks": ["키워드1", "키워드2"],
        "quiz": {{
            "question": "4지선다형 질문",
            "options": ["보기1", "보기2", "보기3", "정답보기"],
            "answer": "정답보기"
        }}
    }}
    텍스트: {text[:2000]}
    """
    try:
        response = requests.post(OLLAMA_API_URL, json={"model": MODEL_NAME, "prompt": prompt, "format": "json", "stream": False}, timeout=60)
        ai_result = json.loads(response.json().get('response', '{}'))
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO ai_analysis (wallet_address, topic, summary, recommended_blanks, quiz_json)
            VALUES (?, ?, ?, ?, ?)
        ''', (wallet_address, ai_result.get('topic'), ai_result.get('summary'), 
              json.dumps(ai_result.get('recommended_blanks')), json.dumps(ai_result.get('quiz'))))
        conn.commit()
        conn.close()
        
        return jsonify({"message": "AI 분석 완료 및 DB 저장 성공", "data": ai_result})
    except Exception as e:
        return jsonify({"error": "AI 모듈 응답 실패", "details": str(e)}), 500

@app.route('/api/upload-pdf', methods=['POST'])
def upload_law():
    try:
        wallet_address = request.form.get('wallet_address')
        file = request.files.get('file')
        if not file:
            return jsonify({"error": "업로드된 파일이 없습니다."}), 400
            
        full_text = extract_text(file)
        categories = parse_law_into_categories(full_text)
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        for cat in categories:
            cursor.execute("INSERT INTO categories (wallet_address, title, content) VALUES (?, ?, ?)", 
                           (wallet_address, cat['title'], cat['content']))
        conn.commit()
        conn.close()
        
        return jsonify({"message": "법령 아카이브 등록 성공", "count": len(categories)})
    except Exception as e:
        return jsonify({"error": "법령 분석 중 치명적 오류 발생", "details": traceback.format_exc()}), 500

@app.route('/api/upload-exam', methods=['POST'])
def upload_exam():
    try:
        wallet_address = request.form.get('wallet_address')
        file = request.files.get('file')
        if not file:
            return jsonify({"error": "업로드된 파일이 없습니다."}), 400
            
        text = extract_text(file)
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO exams (wallet_address, title, content) VALUES (?, ?, ?)", 
                       (wallet_address, file.filename, text))
        conn.commit()
        conn.close()
        return jsonify({"message": "모의고사 데이터 동기화 완료"})
    except Exception as e:
        return jsonify({"error": "모의고사 분석 실패", "details": traceback.format_exc()}), 500

@app.route('/api/auto-make-cards', methods=['POST'])
def auto_make_cards():
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        category_id = data.get('category_id')
        content = data.get('content')

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute("SELECT content FROM exams WHERE wallet_address = ?", (wallet_address,))
        all_exams = " ".join([r[0] for r in cursor.fetchall()])[:1000]
        
        prompt = f"""
        당신은 대한민국 최고 수준의 법령 시험 출제위원 AI입니다.
        다음 '법령 텍스트'를 분석하여 핵심 개념을 빈칸으로 뚫어 학습 카드를 만드세요.

        [조건]
        1. 1~2개의 핵심 카드만 만드세요.
        2. 반드시 아래의 JSON 배열 형식으로만 대답하세요. 다른 말은 절대 금지합니다.
        [
            {{
                "card_content": "본문 내용 중 정답 부분이 [ 정답 ] 형태로 치환된 문장",
                "answer_text": "정답단어",
                "options": ["매력적인 오답1", "오답2", "오답3", "정답단어"]
            }}
        ]

        [기출/모의고사 참고 데이터]: {all_exams}

        [분석할 법령 텍스트]:
        {content[:1500]}
        """
        
        response = requests.post(OLLAMA_API_URL, json={
            "model": MODEL_NAME, 
            "prompt": prompt, 
            "format": "json", 
            "stream": False
        }, timeout=120)
        
        ai_result = response.json().get('response', '[]')
        cards_data = json.loads(ai_result)
        
        count = 0
        for card in cards_data:
            options = card.get('options', [])
            random.shuffle(options)
            cursor.execute('''
                INSERT INTO cards (wallet_address, category_id, card_content, answer_text, options_json, next_review_time)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (wallet_address, category_id, card['card_content'], card['answer_text'], json.dumps(options), get_next_review_time(0)))
            count += 1
            
        conn.commit()
        conn.close()
        
        return jsonify({"message": f"AI 분석 성공! {count}개의 카드가 추가되었습니다."})
    except Exception as e:
        return jsonify({"error": "AI 카드 제작 실패", "details": traceback.format_exc()}), 500

@app.route('/api/save-card', methods=['POST'])
def save_card():
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        card_content = data.get('card_content')
        answer_text = data.get('answer_text')

        options = [answer_text, "대통령령으로 정한다", "7일 이내", "보건복지부장관"] 
        random.shuffle(options)
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO cards (wallet_address, card_content, answer_text, options_json, next_review_time)
            VALUES (?, ?, ?, ?, ?)
        ''', (wallet_address, card_content, answer_text, json.dumps(options), get_next_review_time(0)))
        conn.commit()
        conn.close()
        return jsonify({"message": "수동 카드 제작 완료"}), 201
    except Exception as e:
        return jsonify({"error": "카드 제작 에러", "details": traceback.format_exc()}), 500

@app.route('/api/get-categories')
def get_categories():
    wallet_address = request.args.get('wallet_address')
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, content FROM categories WHERE wallet_address = ?", (wallet_address,))
    cats = [{"id": r[0], "title": r[1], "content": r[2]} for r in cursor.fetchall()]
    conn.close()
    return jsonify({"categories": cats})

@app.route('/api/my-cards')
def get_my_cards():
    try:
        wallet_address = request.args.get('wallet_address')
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute("SELECT id, next_review_time, status FROM cards WHERE wallet_address = ?", (wallet_address,))
        now = datetime.utcnow()
        for row in cursor.fetchall():
            card_id, next_review_str, current_status = row
            if next_review_str and current_status != 'BURNED':
                next_review = datetime.strptime(next_review_str.split('.')[0], '%Y-%m-%d %H:%M:%S')
                if now > next_review:
                    cursor.execute("UPDATE cards SET status = 'BURNED', level = 0 WHERE id = ?", (card_id,))
                elif (next_review - now).total_seconds() < 7200:
                    cursor.execute("UPDATE cards SET status = 'AT_RISK' WHERE id = ?", (card_id,))
        
        conn.commit()
        cursor.execute("SELECT id, card_content, answer_text, options_json, level, next_review_time, status FROM cards WHERE wallet_address = ? ORDER BY id DESC", (wallet_address,))
        cards = [{"id": r[0], "content": r[1], "answer": r[2], "options": json.loads(r[3]), "level": r[4], "next_review": r[5], "status": r[6]} for r in cursor.fetchall()]
        conn.close()
        return jsonify({"cards": cards})
    except Exception as e:
        return jsonify({"error": "카드 로드 실패", "details": traceback.format_exc()}), 500

@app.route('/api/submit-answer', methods=['POST'])
def submit_answer():
    data = request.json
    card_id = data.get('card_id')
    is_correct = data.get('is_correct')
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT level FROM cards WHERE id = ?", (card_id,))
    row = cursor.fetchone()
    if not row: return jsonify({"error": "카드가 없습니다."}), 404
    
    if is_correct:
        new_lv = row[0] + 1
        cursor.execute("UPDATE cards SET level = ?, next_review_time = ?, status = 'OWNED' WHERE id = ?", 
                       (new_lv, get_next_review_time(new_lv), card_id))
        msg = f"방어 성공! 레벨이 {new_lv}로 올랐습니다."
    else:
        cursor.execute("UPDATE cards SET level = 0, next_review_time = ?, status = 'AT_RISK' WHERE id = ?", 
                       (get_next_review_time(0), card_id))
        msg = "방어 실패! 레벨이 0으로 초기화되었습니다."
        
    conn.commit()
    conn.close()
    return jsonify({"message": msg})

@app.route('/api/delete-all', methods=['POST'])
def delete_all():
    wallet_address = request.json.get('wallet_address')
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM categories WHERE wallet_address = ?", (wallet_address,))
    cursor.execute("DELETE FROM cards WHERE wallet_address = ?", (wallet_address,))
    cursor.execute("DELETE FROM exams WHERE wallet_address = ?", (wallet_address,))
    cursor.execute("DELETE FROM ai_analysis WHERE wallet_address = ?", (wallet_address,))
    conn.commit()
    conn.close()
    return jsonify({"message": "아카이브 초기화 성공"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
