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
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

DB_PATH = os.path.expanduser("~/goalcoin/backend/blankd.db")
OLLAMA_API_URL = "http://localhost:11434/api/generate"
GLOBAL_WORD_POOL = set()

@app.errorhandler(Exception)
def handle_exception(e):
    error_detail = traceback.format_exc()
    print(f"\n[🚨 백엔드 에러]\n{error_detail}")
    return jsonify({"error": "백엔드 에러", "details": error_detail}), 500

# ==========================================
# 1. DB 초기화 (카테고리 테이블 추가)
# ==========================================
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # 🚨 법령 카테고리(조문 단위) 저장 테이블
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet_address TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet_address TEXT NOT NULL,
            category_id INTEGER,
            card_content TEXT NOT NULL,
            answer_text TEXT NOT NULL,
            options_json TEXT,
            level INTEGER DEFAULT 0,
            next_review_time DATETIME,
            status TEXT DEFAULT 'OWNED',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

init_db()

# ==========================================
# 2. 아키님의 핵심 파싱 알고리즘 이식
# ==========================================
def parse_law_into_categories(text):
    """법령 텍스트를 '제 N 조(제목)' 기준으로 쪼개어 카테고리화 합니다."""
    # '제 1 조', '제12조의3' 등과 괄호로 된 제목을 찾는 정규식
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
# 3. API 라우트
# ==========================================
@app.route('/api/upload-pdf', methods=['POST'])
def upload_pdf():
    global GLOBAL_WORD_POOL
    wallet_address = request.form.get('wallet_address')
    if 'file' not in request.files or not wallet_address: 
        return jsonify({"error": "파일이나 지갑 주소가 없습니다."}), 400
    
    file = request.files['file']
    doc = fitz.open(stream=file.read(), filetype="pdf")
    full_text = "".join([page.get_text() for page in doc])
    
    # 조문 단위로 텍스트 분할 및 카테고리 DB 저장
    categories = parse_law_into_categories(full_text)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    for cat in categories:
        cursor.execute("INSERT INTO categories (wallet_address, title, content) VALUES (?, ?, ?)", 
                       (wallet_address, cat['title'], cat['content']))
    conn.commit()
    conn.close()
    
    GLOBAL_WORD_POOL.update(extract_candidates(full_text))
    return jsonify({"message": "카테고리 분리 완료", "count": len(categories)})

@app.route('/api/get-categories', methods=['GET'])
def get_categories():
    wallet_address = request.args.get('wallet_address')
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, content FROM categories WHERE wallet_address = ?", (wallet_address,))
    cats = [{"id": r[0], "title": r[1], "content": r[2]} for r in cursor.fetchall()]
    conn.close()
    return jsonify({"categories": cats})

@app.route('/api/auto-make-cards', methods=['POST'])
def auto_make_cards():
    """아키님의 우선순위 자동 추출 로직을 적용하여 카드를 자동 제작합니다."""
    data = request.json
    wallet_address = data.get('wallet_address')
    category_id = data.get('category_id')
    text = data.get('content')
    limit = 3 # 텍스트 하나당 너무 많은 카드가 생성되는 것을 방지

    candidates = extract_candidates(text)
    def get_score(word):
        score = len(word) * 10 
        if re.search(r'\d', word): score += 50 
        if word.endswith('한다') or word.endswith('있다'): score += 40 
        if '위원회' in word or '날' in word: score += 30 
        return score

    scored_candidates = sorted(candidates, key=lambda w: get_score(w), reverse=True)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    created_count = 0
    new_text = text
    for target in scored_candidates:
        if created_count >= limit: break
        if target not in new_text: continue
        
        card_content = text.replace(target, f"[ {target} ]")
        distractors = get_similar_distractors(target, 3)
        options = distractors + [target]
        random.shuffle(options)
        
        cursor.execute('''
            INSERT INTO cards (wallet_address, category_id, card_content, answer_text, options_json, next_review_time)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (wallet_address, category_id, card_content, target, json.dumps(options), get_next_review_time(0)))
        created_count += 1
        new_text = new_text.replace(target, "____") # 중복 방지

    conn.commit()
    conn.close()
    return jsonify({"message": f"{created_count}개의 카드가 자동 제작되었습니다!"})

@app.route('/api/save-card', methods=['POST'])
def save_card():
    """수동 드래그 카드 제작"""
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

@app.route('/api/my-cards', methods=['GET'])
def get_my_cards():
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
    cursor.execute("SELECT id, card_content, answer_text, options_json, level, next_review_time, status FROM cards WHERE wallet_address = ? ORDER BY created_at DESC", (wallet_address,))
    cards = [{"id": r[0], "content": r[1], "answer": r[2], "options": json.loads(r[3]), "level": r[4], "next_review": r[5], "status": r[6]} for r in cursor.fetchall()]
    conn.close()
    return jsonify({"cards": cards})

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
        cursor.execute("UPDATE cards SET level = ?, next_review_time = ?, status = 'OWNED' WHERE id = ?", (new_lv, get_next_review_time(new_lv), card_id))
        msg = f"방어 성공! 레벨이 {new_lv}로 올랐습니다."
    else:
        cursor.execute("UPDATE cards SET level = 0, next_review_time = ?, status = 'AT_RISK' WHERE id = ?", (get_next_review_time(0), card_id))
        msg = "방어 실패! 레벨이 0으로 초기화되었습니다."
        
    conn.commit()
    conn.close()
    return jsonify({"message": msg})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
