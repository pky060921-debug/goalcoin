from flask import Flask, request, jsonify
from flask_cors import CORS
import fitz  # PyMuPDF
import sqlite3
import os
import requests
import re
import random
import json
import traceback  # 🚨 에러 상세 추적을 위한 모듈
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

DB_PATH = os.path.expanduser("~/goalcoin/backend/blankd.db")
OLLAMA_API_URL = "http://localhost:11434/api/generate"

GLOBAL_WORD_POOL = set()

# ==========================================
# 🚨 [강력한 에러 추적기 탑재]
# ==========================================
@app.errorhandler(Exception)
def handle_exception(e):
    """서버 내부에서 에러가 발생하면, 터미널과 프론트엔드에 상세 위치를 보고합니다."""
    error_detail = traceback.format_exc()
    print(f"\n[🚨 백엔드 에러 발생]\n{error_detail}")
    return jsonify({
        "error": "백엔드 에러가 발생했습니다.",
        "details": error_detail  # 이 값이 React의 알림창에 그대로 뜹니다.
    }), 500

# ==========================================
# 1. 하드코어 DB 초기화 (Anki + 상태 관리 추가)
# ==========================================
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet_address TEXT NOT NULL,
            card_content TEXT NOT NULL,      -- 빈칸이 뚫린 문제 텍스트
            answer_text TEXT NOT NULL,       -- 정답 단어
            options_json TEXT,               -- 4지선다 보기 (JSON 형식)
            level INTEGER DEFAULT 0,         -- 회독수 (레벨)
            next_review_time DATETIME,       -- 다음 복습 마감 시간
            status TEXT DEFAULT 'OWNED',     -- 상태: OWNED(소유), AT_RISK(위험), BURNED(소각됨)
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

init_db()

# ==========================================
# 2. 망각 곡선 (Anki) 타이머 계산 공식
# ==========================================
def get_next_review_time(level):
    """레벨(회독수)이 오를수록 복습 유예 기간이 길어집니다."""
    now = datetime.utcnow()
    if level == 0:
        return now + timedelta(hours=12) # 첫 생성/틀렸을 때: 12시간 내 복습
    elif level == 1:
        return now + timedelta(days=1)   # 1회독: 1일
    elif level == 2:
        return now + timedelta(days=3)   # 2회독: 3일
    else:
        return now + timedelta(days=7)   # 3회독 이상: 일주일

# ==========================================
# 3. 아키님의 33패턴 정규식 및 오답 생성기
# ==========================================
def extract_candidates(text):
    candidates = []
    # (아키님의 핵심 킬러 패턴 정규식 요약 적용)
    complex_patterns = [
        r'(?:대통령령|보건복지부령|공단|보건복지부장관)(?:으로|이)\s*정(?:한다|하여 고시한다)',
        r'\d+(?:일|개월|년)\s*이내|\d+개월의\s*범위',
        r'(?:보건복지부장관|장관)이\s*정하는(?: 바에 따라)?',
        r'(?:1천|1만|100)분의\s*\d+',
        r'위원회'
    ]
    for p in complex_patterns:
        matches = re.findall(p, text)
        for m in matches:
            candidates.append(m.strip())

    words = re.findall(r'[가-힣0-9]{2,}', text)
    josas = ['은', '는', '이', '가', '을', '를', '의', '에', '로', '으로']
    for w in words:
        for j in josas:
            if w.endswith(j): w = w[:-len(j)]; break
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
        distractors += random.sample(others, min(len(others), count - len(distractors)))
    
    return distractors

# ==========================================
# 4. API 엔드포인트
# ==========================================
@app.route('/api/upload-pdf', methods=['POST'])
def upload_pdf():
    global GLOBAL_WORD_POOL
    if 'file' not in request.files: return jsonify({"error": "파일 없음"}), 400
    
    file = request.files['file']
    doc = fitz.open(stream=file.read(), filetype="pdf")
    full_text = "".join([page.get_text() for page in doc])
    
    GLOBAL_WORD_POOL.update(extract_candidates(full_text))
    
    return jsonify({
        "message": "PDF 파싱 성공",
        "preview": full_text[:2000] 
    })

@app.route('/api/save-card', methods=['POST'])
def save_card():
    """드래그한 빈칸 카드를 DB에 NFT(제련 대기) 상태로 저장합니다."""
    data = request.json
    wallet_address = data.get('wallet_address')
    card_content = data.get('card_content') # [ ＿＿ ] 처리된 문장
    answer_text = data.get('answer_text')   # 정답 단어

    distractors = get_similar_distractors(answer_text, 3)
    options = distractors + [answer_text]
    random.shuffle(options)
    
    next_review = get_next_review_time(0) # 초기 레벨 0 세팅

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO cards (wallet_address, card_content, answer_text, options_json, level, next_review_time, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (wallet_address, card_content, answer_text, json.dumps(options), 0, next_review, 'OWNED'))
    conn.commit()
    conn.close()
    
    return jsonify({"message": "카드 제련 성공", "next_review": next_review}), 201

@app.route('/api/my-cards', methods=['GET'])
def get_my_cards():
    """카드를 불러오면서, 복습 기한이 지났는지(Slashing) 실시간으로 검사합니다."""
    wallet_address = request.args.get('wallet_address')
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 🚨 DB에서 카드를 꺼낼 때 소유권 박탈 로직 가동
    cursor.execute("SELECT id, next_review_time, status FROM cards WHERE wallet_address = ?", (wallet_address,))
    now = datetime.utcnow()
    
    for row in cursor.fetchall():
        card_id, next_review_str, current_status = row
        if next_review_str and current_status != 'BURNED':
            next_review = datetime.strptime(next_review_str.split('.')[0], '%Y-%m-%d %H:%M:%S')
            # 마감 기한이 지났다면? 가차없이 소유권 박탈 (BURNED)
            if now > next_review:
                cursor.execute("UPDATE cards SET status = 'BURNED', level = 0 WHERE id = ?", (card_id,))
            # 마감 2시간 전이라면 위험 상태 (AT_RISK)
            elif (next_review - now).total_seconds() < 7200:
                cursor.execute("UPDATE cards SET status = 'AT_RISK' WHERE id = ?", (card_id,))
    
    conn.commit()
    
    # 업데이트 후 최신 상태의 카드를 반환 (소각된 카드는 제외하거나 시각적으로 붉게 표시하기 위함)
    cursor.execute("SELECT id, card_content, answer_text, options_json, level, next_review_time, status FROM cards WHERE wallet_address = ? ORDER BY created_at DESC", (wallet_address,))
    
    cards = []
    for r in cursor.fetchall():
        cards.append({
            "id": r[0], "content": r[1], "answer": r[2], 
            "options": json.loads(r[3]), "level": r[4], 
            "next_review": r[5], "status": r[6]
        })
    conn.close()
    
    return jsonify({"cards": cards})

@app.route('/api/submit-answer', methods=['POST'])
def submit_answer():
    """사용자가 문제를 풀었을 때 레벨업 또는 레벨 초기화 처리를 합니다."""
    data = request.json
    card_id = data.get('card_id')
    is_correct = data.get('is_correct')
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT level FROM cards WHERE id = ?", (card_id,))
    row = cursor.fetchone()
    
    if not row: return jsonify({"error": "카드를 찾을 수 없습니다."}), 404
    
    current_level = row[0]
    
    if is_correct:
        new_level = current_level + 1
        new_review_time = get_next_review_time(new_level)
        cursor.execute("UPDATE cards SET level = ?, next_review_time = ?, status = 'OWNED' WHERE id = ?", (new_level, new_review_time, card_id))
        msg = f"방어 성공! 레벨이 {new_level}로 올랐습니다."
    else:
        # 틀리면 레벨 초기화 및 12시간 내 재복습 페널티
        new_review_time = get_next_review_time(0)
        cursor.execute("UPDATE cards SET level = 0, next_review_time = ?, status = 'AT_RISK' WHERE id = ?", (new_review_time, card_id))
        msg = "방어 실패! 레벨이 0으로 초기화되었으며 카드가 위험 상태에 빠졌습니다."
        
    conn.commit()
    conn.close()
    
    return jsonify({"message": msg, "new_level": new_level if is_correct else 0})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
