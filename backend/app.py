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
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

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
# 50MB 대용량 업로드 및 CORS 강제 허용
CORS(app, resources={r"/api/*": {"origins": "*"}})
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024

DB_PATH = os.path.expanduser("~/goalcoin/backend/blankd.db")

OLLAMA_API_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "gemma4:26b" 
GLOBAL_WORD_POOL = set()

# [모든 오류를 낚아채는 진단 코드]
@app.errorhandler(Exception)
def handle_exception(e):
    error_detail = traceback.format_exc()
    logging.error(f"백엔드 치명적 에러:\n{error_detail}")
    print(f"\n[🚨 서버 치명적 에러]\n{error_detail}")
    return jsonify({"error": "백엔드 엔진 오류", "details": error_detail}), 500

# 프론트엔드 연결 진단용 Ping 테스트 엔드포인트
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
        cursor.execute('''CREATE TABLE IF NOT EXISTS exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            wallet_address TEXT, 
            title TEXT, 
            question TEXT, 
            answer TEXT, 
            explanation TEXT,
            related_law_keywords TEXT
        )''')
        cursor.execute('CREATE TABLE IF NOT EXISTS ai_analysis (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT, topic TEXT, summary TEXT, recommended_blanks TEXT, quiz_json TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)')
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"DB 초기화 실패: {e}")

init_db()

# ==========================================
# 3. 데이터 클렌징 및 법령 파싱 엔진
# ==========================================
def clean_korean_law_text(text):
    """법제처 PDF/HTML 파일 특유의 불순물(페이지 번호, 출력일시, 헤더 등)을 완벽하게 제거합니다."""
    # 1. 페이지 번호 제거 (예: - 1 -, - 12 -)
    text = re.sub(r'-\s*\d+\s*-', '\n', text)
    # 2. 출력 일시 및 바코드 찌꺼기 제거 (예: /2025.12.05 09:50/130268/***.*)
    text = re.sub(r'/?\d{4}\.\d{1,2}\.\d{1,2}\s*\d{2}:\d{2}.*', '\n', text)
    text = re.sub(r'\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2}', '\n', text)
    # 3. 법령 3단 비교표 상단 반복 텍스트 제거
    text = re.sub(r'(?:국민건강보험법|시행령|시행규칙)[\sㆍ]*', ' ', text)
    # 4. 쓸데없는 공백 및 연속 줄바꿈 압축
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

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

def extract_text(file):
    filename = file.filename.lower()
    raw_bytes = file.read()
    
    # 🚨 [핵심 업데이트] HTML 파일 지원 추가
    if filename.endswith('.html') or filename.endswith('.htm'):
        if not BeautifulSoup:
            raise Exception("HTML 파싱을 위해 beautifulsoup4 라이브러리가 필요합니다. (pip install beautifulsoup4)")
        try:
            # HTML 구조를 무시하고 눈에 보이는 텍스트만 깔끔하게 뽑아냅니다.
            soup = BeautifulSoup(raw_bytes, 'html.parser')
            text = soup.get_text(separator='\n', strip=True)
            return clean_korean_law_text(text)
        except Exception as e:
            raise Exception(f"HTML 파싱 실패: {str(e)}")
            
    elif filename.endswith('.pdf'):
        try:
            doc = fitz.open(stream=raw_bytes, filetype="pdf")
            # 단순히 텍스트만 긁어오는 것이 아니라 블록 단위로 읽어 혼선을 방지합니다.
            text = ""
            for page in doc:
                text += page.get_text("text") + "\n"
            return clean_korean_law_text(text)
        except Exception as e:
            raise Exception(f"PDF 파싱 실패: {str(e)}")
            
    elif filename.endswith('.docx') and docx:
        import io
        doc_file = docx.Document(io.BytesIO(raw_bytes))
        text = "\n".join([p.text for p in doc_file.paragraphs])
        return clean_korean_law_text(text)
    else:
        try: text = raw_bytes.decode('utf-8')
        except: text = raw_bytes.decode('cp949', errors='ignore')
        return clean_korean_law_text(text)

def get_ai_keyword(prompt_text, exams_context):
    try:
        exams_context = exams_context[:1000] if exams_context else "기출 문제 없음"
        payload = {
            "model": MODEL_NAME,
            "prompt": f"""
            너는 법령 시험 출제관이야. 
            아래 [기출 모의고사] 데이터를 바탕으로, [법령 본문]에서 시험에 가장 나올 법한 핵심 단어(명사, 기한, 숫자 등) 딱 1개만 골라서 대답해.
            다른 설명은 절대 하지마. 정답 단어만 말해.

            [기출 모의고사]:
            {exams_context}

            [법령 본문]:
            {prompt_text}
            """,
            "stream": False
        }
        response = requests.post(OLLAMA_API_URL, json=payload, timeout=45)
        if response.status_code == 200:
            result = response.json().get('response', '').strip()
            return re.sub(r'[^\w\s]', '', result.split('\n')[0]).strip()
    except Exception as e:
        logging.error(f"Ollama 통신 오류: {str(e)}")
    return None

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

@app.route('/api/upload-pdf', methods=['POST'])
def upload_law():
    global GLOBAL_WORD_POOL
    try:
        wallet_address = request.form.get('wallet_address')
        file = request.files.get('file')
        if not file: return jsonify({"error": "업로드된 파일이 없습니다."}), 400
        
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
        if not file: return jsonify({"error": "업로드된 파일이 없습니다."}), 400
        
        raw_text = extract_text(file)
        
        prompt = f"""
        당신은 법률 시험지 파서입니다. 다음 텍스트에서 문제, 정답, 해설을 추출하여 반드시 아래의 JSON 배열 형식으로만 출력하세요.
        [
            {{"question": "문제 내용", "answer": "정답", "explanation": "해설 내용"}}
        ]
        텍스트: {raw_text[:3000]}
        """
        response = requests.post(OLLAMA_API_URL, json={"model": MODEL_NAME, "prompt": prompt, "format": "json", "stream": False}, timeout=120)
        exam_data = json.loads(response.json().get('response', '[]'))
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        for item in exam_data:
            cursor.execute("INSERT INTO exams (wallet_address, title, question, answer, explanation) VALUES (?, ?, ?, ?, ?)",
                           (wallet_address, file.filename, item.get('question', ''), item.get('answer', ''), item.get('explanation', '')))
        conn.commit()
        conn.close()
        return jsonify({"message": f"{len(exam_data)}개의 모의고사 문항이 구조화되어 저장되었습니다."})
    except Exception as e:
        return jsonify({"error": "모의고사 파싱 실패", "details": traceback.format_exc()}), 500

@app.route('/api/get-related-exams', methods=['POST'])
def get_related_exams():
    try:
        data = request.json
        law_content = data.get('content', '')
        wallet_address = data.get('wallet_address')
        
        keywords = re.findall(r'[가-힣]{2,}', law_content)[:5]
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        related_qs = []
        for kw in keywords:
            cursor.execute("SELECT id, question, answer, explanation FROM exams WHERE wallet_address=? AND question LIKE ?", 
                           (wallet_address, f'%{kw}%'))
            rows = cursor.fetchall()
            for r in rows:
                if r[0] not in [x['id'] for x in related_qs]:
                    related_qs.append({"id": r[0], "question": r[1], "answer": r[2], "explanation": r[3]})
        
        conn.close()
        return jsonify({"related_exams": related_qs[:3]})
    except Exception as e:
        return jsonify({"error": "관련 기출 검색 에러", "details": traceback.format_exc()}), 500

@app.route('/api/generate-explanation', methods=['POST'])
def generate_ai_explanation():
    try:
        data = request.json
        law_text = data.get('law_text')
        question = data.get('question')
        answer = data.get('answer')
        
        prompt = f"""
        당신은 훌륭한 법률 강사입니다. 아래 [법령 본문]을 근거로 하여, 이 [문제]의 [정답]이 왜 정답인지 수험생이 이해하기 쉽게 해설을 작성해 주세요.
        
        [법령 본문]: {law_text}
        [문제]: {question}
        [정답]: {answer}
        """
        response = requests.post(OLLAMA_API_URL, json={"model": MODEL_NAME, "prompt": prompt, "stream": False}, timeout=60)
        return jsonify({"explanation": response.json()['response']})
    except Exception as e:
        return jsonify({"error": "해설 생성 에러", "details": traceback.format_exc()}), 500

@app.route('/api/auto-make-cards', methods=['POST'])
def auto_make_cards():
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        category_id = data.get('category_id')
        content = data.get('content')

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT question, answer FROM exams WHERE wallet_address = ?", (wallet_address,))
        all_exams = " ".join([f"Q:{r[0]} A:{r[1]}" for r in cursor.fetchall()])
        
        ai_target = get_ai_keyword(content, all_exams)
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
            msg = f"AI가 모의고사를 바탕으로 [{target}] 빈칸을 추천하여 제작했습니다."
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
        cursor.execute("UPDATE cards SET level = ?, next_review_time = ?, status = 'OWNED' WHERE id = ?", (new_lv, get_next_review_time(new_lv), card_id))
        msg = f"방어 성공! 레벨이 {new_lv}로 올랐습니다."
    else:
        cursor.execute("UPDATE cards SET level = 0, next_review_time = ?, status = 'AT_RISK' WHERE id = ?", (get_next_review_time(0), card_id))
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
