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
# [추가] 1. 에러 추적 로깅 설정
# ==========================================
logging.basicConfig(filename='backend_error_log.txt', level=logging.ERROR, 
                    format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__)
# 50MB 대용량 업로드 및 CORS 강제 허용
CORS(app, resources={r"/api/*": {"origins": "*"}})
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024

DB_PATH = os.path.expanduser("~/goalcoin/backend/blankd.db")

# 🚨 아키님의 강력한 로컬 26B 모델 연결 세팅
OLLAMA_API_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "gemma4:27b" 
GLOBAL_WORD_POOL = set()

@app.errorhandler(Exception)
def handle_exception(e):
    error_detail = traceback.format_exc()
    logging.error(f"백엔드 치명적 에러:\n{error_detail}") # 로그 파일에 기록
    print(f"\n[🚨 서버 치명적 에러]\n{error_detail}")
    return jsonify({"error": "백엔드 엔진 오류", "details": error_detail}), 500

# ==========================================
# 2. DB 초기화 (법령, 카드, 모의고사, AI분석 아카이브)
# ==========================================
def init_db():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT, title TEXT, content TEXT)')
        cursor.execute('CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT, category_id INTEGER, card_content TEXT, answer_text TEXT, options_json TEXT, level INTEGER DEFAULT 0, next_review_time DATETIME, status TEXT DEFAULT "OWNED")')
        cursor.execute('CREATE TABLE IF NOT EXISTS exams (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT, title TEXT, content TEXT)')
        # [추가] AI 분석 데이터 저장 테이블
        cursor.execute('CREATE TABLE IF NOT EXISTS ai_analysis (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT, topic TEXT, summary TEXT, recommended_blanks TEXT, quiz_json TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)')
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"DB 초기화 실패: {e}")

init_db()

# ==========================================
# 강력한 오리지널 엔진 복구 (정규식, 오답생성, Anki)
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

def extract_candidates(text):
    candidates = []
    titles = re.findall(r'\(([^)]+)\)', text)
    for t in titles:
        if len(t) >= 2 and not re.match(r'^\d+$', t): candidates.append(t.strip())

    complex_patterns = [
        r'(?:즉시|특별한|1건당|특히|모든|최초로|미리|지체\s*없이)\s+[가-힣]+',
        r'(?:대통령령|보건복지부령|공단|공단의 이사장|보건복지부장관|정관|심사평가원장)(?:으로|이)\s*정(?:한다|하여 고시한다)',
        r'[가-힣\s]*위원회',
        r'\d+(?:일|개월|년)\s*이내|\d+개월의\s*범위',
        r'(?:1천|1만|100)분의\s*\d+'
    ]
    for p in complex_patterns:
        for m in re.findall(p, text): candidates.append(m.strip())

    words = re.findall(r'[가-힣0-9]{2,}', re.sub(r'\([^)]+\)', ' ', text))
    for w in words:
        if len(w) >= 2 and w not in candidates: candidates.append(w)
    return list(set(candidates))

def get_similar_distractors(target, count=3):
    global GLOBAL_WORD_POOL
    target = target.strip()
    static_map = {
        '위원회': ["보건의료정책심의위원회", "건강보험정책심의위원회", "재정운영위원회", "업무정지처분심의위원회"],
        '이내': ["7일 이내", "14일 이내", "30일 이내", "3개월 이내"],
        '정한다': ["대통령령으로 정한다", "보건복지부령으로 정한다", "보건복지부장관이 정한다", "공단이 정한다"]
    }
    for k, v in static_map.items():
        if k in target:
            pool = [p for p in v if p.replace(" ", "") != target.replace(" ", "")]
            if pool:
                others = list(GLOBAL_WORD_POOL)
                pool += random.sample(others, min(len(others), max(0, count - len(pool))))
                return random.sample(pool, min(len(pool), count))

    same_len = [w for w in GLOBAL_WORD_POOL if len(w) == len(target) and w != target]
    distractors = random.sample(same_len, min(len(same_len), count))
    if len(distractors) < count:
        others = list(GLOBAL_WORD_POOL)
        distractors += random.sample(others, min(len(others), max(0, count - len(distractors))))
    return distractors

def get_next_review_time(level):
    now = datetime.utcnow()
    if level == 0: return now + timedelta(hours=12)
    elif level == 1: return now + timedelta(days=1)
    elif level == 2: return now + timedelta(days=3)
    else: return now + timedelta(days=7)

# ==========================================
# 로컬 AI (26B 모델) 연동 로직
# ==========================================
def get_ai_keyword(prompt):
    try:
        payload = {
            "model": MODEL_NAME,
            "prompt": f"너는 법령 시험 출제관이야. 아래 문장에서 시험에 나올 법한 가장 중요한 핵심 단어(명사) 하나만 골라서 대답해. 다른 설명은 절대 하지마.\n\n문장: {prompt}",
            "stream": False
        }
        response = requests.post(OLLAMA_API_URL, json=payload, timeout=45)
        if response.status_code == 200:
            result = response.json().get('response', '').strip()
            return re.sub(r'[^\w]', '', result.split('\n')[0])
    except Exception as e:
        print(f"Ollama 통신 오류 ({e}) - 정규식 모드로 전환")
    return None

def extract_text(file):
    filename = file.filename.lower()
    raw_bytes = file.read()
    if filename.endswith('.pdf'):
        doc = fitz.open(stream=raw_bytes, filetype="pdf")
        return "".join([page.get_text() for page in doc])
    elif filename.endswith('.docx') and docx:
        import io
        doc_file = docx.Document(io.BytesIO(raw_bytes))
        return "\n".join([p.text for p in doc_file.paragraphs])
    else:
        try: return raw_bytes.decode('utf-8')
        except: return raw_bytes.decode('cp949', errors='ignore')

# ==========================================
# [추가] 깃허브 및 AI 조력자 API 엔드포인트
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
    당신은 훌륭한 법학습 조력자 인공지능 '아키'입니다. 다음 법령/모의고사 문서를 분석하여 반드시 아래 JSON 형식으로만 응답하세요. 다른 말은 덧붙이지 마세요.
    {{
        "topic": "해당 문서의 핵심 주제 분류",
        "summary": "전체 내용 3줄 요약",
        "recommended_blanks": ["시험에 자주 나오는 핵심 키워드 1", "키워드 2", "키워드 3"],
        "quiz": {{
            "question": "본문 내용을 바탕으로 한 4지선다형 질문",
            "options": ["보기1", "보기2", "보기3", "정답보기"],
            "answer": "정답보기"
        }}
    }}
    분석할 텍스트: {text[:2000]}
    """
    try:
        response = requests.post(OLLAMA_API_URL, json={"model": MODEL_NAME, "prompt": prompt, "stream": False}, timeout=60)
        ai_result = json.loads(response.json().get('response', '{}'))
        
        # 분석 결과를 DB에 저장
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
        logging.error(f"AI 조력자 통신 에러: {str(e)}")
        return jsonify({"error": "AI 모듈 응답 실패", "details": str(e)}), 500

# ==========================================
# 기존 API 엔드포인트
# ==========================================
@app.route('/api/upload-pdf', methods=['POST'])
def upload_law():
    global GLOBAL_WORD_POOL
    try:
        wallet_address = request.form.get('wallet_address')
        file = request.files.get('file')
        full_text = extract_text(file)
        
        categories = parse_law_into_categories(full_text)
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        for cat in categories:
            cursor.execute("INSERT INTO categories (wallet_address, title, content) VALUES (?, ?, ?)", 
                           (wallet_address, cat['title'], cat['content']))
        conn.commit()
        conn.close()
        
        GLOBAL_WORD_POOL.update(extract_candidates(full_text))
        return jsonify({"message": "법령 아카이브 등록 성공", "count": len(categories)})
    except Exception as e:
        return jsonify({"error": "법령 분석 실패", "details": traceback.format_exc()}), 500

@app.route('/api/upload-exam', methods=['POST'])
def upload_exam():
    try:
        wallet_address = request.form.get('wallet_address')
        file = request.files.get('file')
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
        limit = 1 

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT content FROM exams WHERE wallet_address = ?", (wallet_address,))
        all_exams = " ".join([r[0] for r in cursor.fetchall()])
        
        ai_target = get_ai_keyword(content)
        candidates = extract_candidates(content)
        
        def get_hybrid_score(word):
            score = len(word) * 10
            if re.search(r'\d', word): score += 50
            if '위원회' in word or '날' in word: score += 30
            score += (all_exams.count(word) * 20)
            if ai_target and ai_target in word: score += 200
            return score

        scored_candidates = sorted(candidates, key=lambda w: get_hybrid_score(w), reverse=True)
        target = scored_candidates[0] if scored_candidates else None

        if target:
            card_content = content.replace(target, f"[ {target} ]")
            distractors = get_similar_distractors(target, 3)
            options = distractors + [target]
            random.shuffle(options)
            
            cursor.execute('''
                INSERT INTO cards (wallet_address, category_id, card_content, answer_text, options_json, next_review_time)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (wallet_address, category_id, card_content, target, json.dumps(options), get_next_review_time(0)))
            conn.commit()
            msg = f"AI가 모의고사를 분석하여 [{target}] 카드를 제작했습니다."
        else:
            msg = "추출 가능한 유효 단어가 없습니다."
            
        conn.close()
        return jsonify({"message": msg})
    except Exception as e:
        return jsonify({"error": "카드 제작 실패", "details": traceback.format_exc()}), 500

@app.route('/api/save-card', methods=['POST'])
def save_card():
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        card_content = data.get('card_content')
        answer_text = data.get('answer_text')

        distractors = get_similar_distractors(answer_text, 3)
        options = distractors + [answer_text]
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
