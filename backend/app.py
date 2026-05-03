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
import html
import threading
import uuid
from datetime import datetime, timedelta

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

try:
    import docx
except ImportError:
    docx = None

# [오류 진단] 시스템 전체 에러 로깅
logging.basicConfig(filename='backend_error_log.txt', level=logging.ERROR, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024

DB_PATH = os.path.expanduser("~/goalcoin/backend/blankd.db")
OLLAMA_API_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "gemma4:26b" 
GLOBAL_WORD_POOL = set()
TASK_STATUS = {}

@app.errorhandler(Exception)
def handle_exception(e):
    error_info = traceback.format_exc()
    logging.error(f"[오류 진단] 백엔드 치명적 에러:\n{error_info}")
    return jsonify({"error": "백엔드 오류", "details": error_info}), 500

@app.route('/api/health', methods=['GET', 'OPTIONS'])
def health_check():
    return jsonify({"status": "alive"}), 200

@app.route('/api/task-status')
def task_status():
    task_id = request.args.get('task_id')
    if task_id in TASK_STATUS:
        return jsonify(TASK_STATUS[task_id])
    return jsonify({"status": "not_found"}), 404

def init_db():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        # [수정됨] is_x_marked 컬럼 추가 (프론트엔드 빈칸 추천 숨김 처리용)
        cursor.execute('CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT, title TEXT, content TEXT, folder_name TEXT DEFAULT "기본 폴더", is_x_marked INTEGER DEFAULT 0)')
        cursor.execute('CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT, category_id INTEGER, card_content TEXT, answer_text TEXT, options_json TEXT, level INTEGER DEFAULT 0, next_review_time DATETIME, status TEXT DEFAULT "OWNED", best_time REAL DEFAULT NULL, folder_name TEXT DEFAULT "기본 폴더")')
        cursor.execute('''CREATE TABLE IF NOT EXISTS exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT, title TEXT, question TEXT, answer TEXT, explanation TEXT, related_law_keywords TEXT
        )''')
        cursor.execute('CREATE TABLE IF NOT EXISTS ai_analysis (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT, topic TEXT, summary TEXT, recommended_blanks TEXT, quiz_json TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)')
        
        # 마이그레이션 안전 장치
        try: cursor.execute('ALTER TABLE cards ADD COLUMN best_time REAL DEFAULT NULL')
        except: pass
        try: cursor.execute('ALTER TABLE categories ADD COLUMN folder_name TEXT DEFAULT "기본 폴더"')
        except: pass
        try: cursor.execute('ALTER TABLE cards ADD COLUMN folder_name TEXT DEFAULT "기본 폴더"')
        except: pass
        try: cursor.execute('ALTER TABLE categories ADD COLUMN is_x_marked INTEGER DEFAULT 0')
        except: pass
            
        conn.commit()
        conn.close()
    except Exception as e:
        logging.error(f"[오류 진단] DB 초기화 실패: {e}")

init_db()

def clean_korean_law_text(text):
    text = re.sub(r'-\s*\d+\s*-', '\n', text)
    text = re.sub(r'/?\d{4}\.\d{1,2}\.\d{1,2}\s*\d{2}:\d{2}.*', '\n', text)
    text = re.sub(r'\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2}', '\n', text)
    text = re.sub(r'(?:국민건강보험법|시행령|시행규칙)[\sㆍ]*', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def normalize_text(text):
    text = re.sub(r'(\s*)(제\s*\d+\s*조)', r'\n\n\2', text)
    text = re.sub(r'(\s*)(①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)', r'\n\2', text)
    text = re.sub(r'([^\n다까요\.])\n(?!(제\s*\d+\s*조|①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩))', r'\1 ', text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def parse_html_3col_law(raw_text):
    unescaped = html.unescape(raw_text)
    pre_clean = re.sub(r'<(br|p|div|li)[^>]*>', '\n', unescaped, flags=re.IGNORECASE)
    pre_clean = re.sub(r'</(p|div|li|td|tr)>', '\n', pre_clean, flags=re.IGNORECASE)
    rows = re.split(r'<tr[^>]*>', pre_clean, flags=re.IGNORECASE)
    categories = []
    if len(rows) > 1:
        current_chapter = "기본 폴더"
        current_law_num = "000조"
        type_names = {0: '법', 1: '령', 2: '규'}
        for row_html in rows[1:]:
            try:
                row_text = re.sub(r'<[^>]+>', ' ', row_html).strip()
                row_text = re.sub(r'\s+', ' ', row_text)
                
                chap_match = re.search(r'제\s*(\d+)\s*장\s*(.*)', row_text)
                if chap_match:
                    c_num = chap_match.group(1)
                    c_name = re.sub(r'[^\w\s]', '', chap_match.group(2).split('(')[0]).strip()[:15] or "총칙"
                    current_chapter = f"제{int(c_num)}장 {c_name}"
                    if len(row_text) < 40 and "조" not in row_text:
                        continue

                cols = re.split(r'<td[^>]*>', row_html, flags=re.IGNORECASE)[1:]
                if not cols: continue
                c0_raw = re.sub(r'<[^>]+>', '', cols[0]).strip()
                is_act_cell = bool(re.match(r'^\s*제\s*\d+\s*조(?:\s*의\s*\d+)?', c0_raw))
                mapped_cols = ["", "", ""]
                if len(cols) >= 3: mapped_cols = cols[:3]
                elif len(cols) == 2:
                    if is_act_cell: mapped_cols[0], mapped_cols[1] = cols[0], cols[1]
                    else: mapped_cols[1], mapped_cols[2] = cols[0], cols[1]
                elif len(cols) == 1:
                    if is_act_cell: mapped_cols[0] = cols[0]
                    else: mapped_cols[1] = cols[0]

                if mapped_cols[0].strip():
                    law_match = re.search(r'제\s*(\d+)\s*조(?:\s*의\s*(\d+))?', re.sub(r'<[^>]+>', '', mapped_cols[0]))
                    if law_match:
                        main_num, ext_part = law_match.group(1), law_match.group(2)
                        current_law_num = f"{int(main_num):03d}조"
                        if ext_part: current_law_num += f"의{ext_part}"
                
                if current_law_num == "000조":
                    fallback = re.search(r'제\s*(\d+)\s*조(?:\s*의\s*(\d+))?', row_text)
                    if fallback:
                        main_num, ext_part = fallback.group(1), fallback.group(2)
                        current_law_num = f"{int(main_num):03d}조"
                        if ext_part: current_law_num += f"의{ext_part}"

                for col_idx in range(3):
                    html_content = mapped_cols[col_idx]
                    if not html_content or len(html_content) < 5: continue
                    clean_content = re.sub(r'<[^>]+>', '', html_content)
                    if re.search(r'국민건강보험\s*요양급여의\s*기준', clean_content): continue
                    clean_content = re.sub(r'「?국민건강보험법\s*시행(?:령|규칙)」?', '', clean_content)
                    clean_content = re.sub(r'([^\n])\s*(\d+\.)', r'\1\n\2', clean_content)
                    clean_content = re.sub(r'[①-⑮\[<].*?[\d\.]+.*?[\]>]', '', clean_content)
                    clean_content = clean_content.replace("시행령", "").replace("시행규칙", "")
                    clean_content = re.sub(r'[ \t]+', ' ', clean_content)
                    clean_content = re.sub(r'\n\s*\n', '\n', clean_content).strip()
                    if len(clean_content) < 2: continue
                    if clean_content in ["시행규칙", "법률", "내용없음", ".", "-"]: continue
                    
                    article_match = re.search(r'제\s*(\d+)\s*조(?:\s*의\s*(\d+))?', clean_content)
                    if article_match:
                        main_n, ext_n = article_match.group(1), article_match.group(2)
                        article_num_str = f"제{main_n}조" + (f"의{ext_n}" if ext_n else "")
                    else: article_num_str = current_law_num.lstrip('0')
                    
                    title_match = re.search(r'\((.*?)\)', clean_content)
                    if title_match: title_text = title_match.group(1).strip()
                    else: title_text = clean_content.replace(article_num_str, "").strip().split('\n')[0][:15]
                    
                    clean_title = f"[{type_names.get(col_idx, '법')}] {article_num_str} {title_text}"
                    categories.append({"title": clean_title, "content": clean_content, "folder_name": current_chapter, "is_x_marked": 0})
            except Exception as e:
                logging.error(f"[오류 진단] HTML 파싱 루프 에러: {e}")
                continue
    return categories

def extract_candidates(text):
    candidates = []
    titles = re.findall(r'\(([^)]+)\)', text)
    for t in titles:
        if len(t) >= 2 and not re.match(r'^\d+$', t): candidates.append(t.strip())
    complex_patterns = [r'(?:즉시|특별한|1건당|특히|모든|최초로|미리|지체\s*없이)\s+[가-힣]+',
                        r'(?:대통령령|보건복지부령|공단|공단의 이사장|보건복지부장관|정관|심사평가원장)(?:으로|이)\s*정(?:한다|하여 고시한다)',
                        r'[가-힣\s]*위원회', r'\d+(?:일|개월|년)\s*이내|\d+개월의\s*범위', r'(?:1천|1만|100)분의\s*\d+']
    for p in complex_patterns:
        for m in re.findall(p, text): candidates.append(m.strip())
    words = re.findall(r'[가-힣0-9]{2,}', re.sub(r'\([^)]+\)', ' ', text))
    for w in words:
        if len(w) >= 2 and w not in candidates: candidates.append(w)
    return list(set(candidates))

def get_similar_distractors(target, count=3):
    global GLOBAL_WORD_POOL
    target = target.strip()
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

@app.route('/api/upload-pdf', methods=['POST'])
def upload_law():
    try:
        wallet_address = request.form.get('wallet_address')
        custom_folder = request.form.get('custom_folder', '기본 폴더')
        file = request.files.get('file')
        if not file: return jsonify({"error": "업로드된 파일이 없습니다."}), 400
        
        task_id = str(uuid.uuid4())
        TASK_STATUS[task_id] = {"status": "running", "progress": 10, "message": "문헌 파싱 및 분석 중..."}
        
        raw_bytes = file.read()
        filename = file.filename.lower()
        
        def process_law():
            try:
                if filename.endswith('.html') or filename.endswith('.htm'):
                    categories = parse_html_3col_law(raw_bytes.decode('utf-8', errors='ignore'))
                    for cat in categories:
                        if not cat.get('folder_name') or cat['folder_name'] == '기본 폴더':
                            cat['folder_name'] = custom_folder
                else:
                    text = raw_bytes.decode('utf-8', errors='ignore')
                    normalized_text = normalize_text(clean_korean_law_text(text))
                    categories = []
                    parts = re.split(r'(제\s*\d+\s*조(?:의\s*\d+)?\s*(?:\([^)]+\))?)', normalized_text)
                    if parts and len(parts) > 1:
                        if parts[0].strip(): categories.append({"title": "총칙 및 서론", "content": parts[0].strip(), "folder_name": custom_folder, "is_x_marked": 0})
                        for i in range(1, len(parts), 2):
                            title = parts[i].strip()
                            content = parts[i+1].strip() if i+1 < len(parts) else ""
                            categories.append({"title": title, "content": content, "folder_name": custom_folder, "is_x_marked": 0})
                    else: categories = [{"title": "문서 전체", "content": normalized_text, "folder_name": custom_folder, "is_x_marked": 0}]
                
                TASK_STATUS[task_id]["progress"] = 70
                TASK_STATUS[task_id]["message"] = f"구조화 완료. 총 {len(categories)}개 조항 DB에 저장 중..."
                
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                for cat in categories:
                    cursor.execute("INSERT INTO categories (wallet_address, title, content, folder_name, is_x_marked) VALUES (?, ?, ?, ?, ?)", 
                                   (wallet_address, cat['title'], cat['content'], cat.get('folder_name', custom_folder), cat.get('is_x_marked', 0)))
                conn.commit()
                conn.close()
                
                TASK_STATUS[task_id]["progress"] = 100
                TASK_STATUS[task_id]["status"] = "completed"
                TASK_STATUS[task_id]["message"] = "법령 아카이브 등록 성공"
            except Exception as e:
                logging.error(f"[오류 진단] 법령 업로드 처리 실패: {e}")
                TASK_STATUS[task_id]["status"] = "error"
                TASK_STATUS[task_id]["message"] = f"분석 실패: {str(e)}"
                
        threading.Thread(target=process_law).start()
        return jsonify({"task_id": task_id, "message": "업로드 완료, 백그라운드 처리 시작"})
    except Exception as e: return jsonify({"error": "전송 실패"}), 500

@app.route('/api/upload-exam', methods=['POST'])
def upload_exam():
    try:
        wallet_address = request.form.get('wallet_address')
        file = request.files.get('file')
        if not file: return jsonify({"error": "파일이 없습니다."}), 400
        raw_text = file.read().decode('utf-8', errors='ignore')
        raw_text = normalize_text(clean_korean_law_text(raw_text))
        filename = file.filename
        
        task_id = str(uuid.uuid4())
        TASK_STATUS[task_id] = {"status": "running", "progress": 20, "message": "Gemma 26B 엔진에 텍스트 주입 완료. 모의고사 구조 분석 중..."}
        
        def process_exam():
            try:
                prompt = f'''당신은 CBT 시험지 파서입니다. 텍스트에서 객관식 문제, 정답, 해설을 JSON 배열 형식으로만 출력하세요. 
                형식: [ {{"question": "문제 내용 및 보기", "answer": "정답", "explanation": "해설"}} ]
                텍스트: {raw_text[:3000]}'''
                
                response = requests.post(OLLAMA_API_URL, json={"model": MODEL_NAME, "prompt": prompt, "format": "json", "stream": False}, timeout=600)
                
                TASK_STATUS[task_id]["progress"] = 80
                TASK_STATUS[task_id]["message"] = "AI 추출 성공. DB에 모의고사 등록 중..."
                
                exam_data = json.loads(response.json().get('response', '[]'))
                
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                for item in exam_data:
                    cursor.execute("INSERT INTO exams (wallet_address, title, question, answer, explanation) VALUES (?, ?, ?, ?, ?)",
                                   (wallet_address, filename, item.get('question', ''), item.get('answer', ''), item.get('explanation', '')))
                conn.commit()
                conn.close()
                
                TASK_STATUS[task_id]["progress"] = 100
                TASK_STATUS[task_id]["status"] = "completed"
                TASK_STATUS[task_id]["message"] = f"{len(exam_data)}개의 문항이 저장되었습니다."
            except Exception as e:
                logging.error(f"[오류 진단] 모의고사 업로드 처리 실패: {e}")
                TASK_STATUS[task_id]["status"] = "error"
                TASK_STATUS[task_id]["message"] = f"모의고사 파싱 실패: {str(e)}"
                
        threading.Thread(target=process_exam).start()
        return jsonify({"task_id": task_id, "message": "모의고사 처리 시작"})
    except Exception as e:
        return jsonify({"error": "요청 실패"}), 500

@app.route('/api/get-all-exams')
def get_all_exams():
    try:
        wallet_address = request.args.get('wallet_address')
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT id, title, question, answer, explanation FROM exams WHERE wallet_address = ?", (wallet_address,))
        exams = [{"id": r[0], "title": r[1], "question": r[2], "answer": r[3], "explanation": r[4]} for r in cursor.fetchall()]
        conn.close()
        return jsonify({"exams": exams})
    except Exception as e:
        logging.error(f"[오류 진단] get-all-exams 데이터 조회 실패: {e}")
        # 프론트엔드 충돌(WSOD) 완벽 방어를 위한 빈 배열 반환
        return jsonify({"exams": []})

@app.route('/api/recommend-blank', methods=['POST'])
def recommend_blank():
    try:
        data = request.json
        content = data.get('content')
        wallet_address = data.get('wallet_address')
        
        task_id = str(uuid.uuid4())
        TASK_STATUS[task_id] = {"status": "running", "progress": 15, "message": "DB에서 과거 기출문제 컨텍스트를 스캔 중..."}
        
        def process_recommend():
            try:
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                cursor.execute("SELECT question, answer FROM exams WHERE wallet_address = ? ORDER BY id DESC LIMIT 10", (wallet_address,))
                all_exams = "\n".join([f"Q:{r[0]} A:{r[1]}" for r in cursor.fetchall()])
                conn.close()
                
                TASK_STATUS[task_id]["progress"] = 45
                TASK_STATUS[task_id]["message"] = "Gemma 26B가 출제 확률 및 매칭 단어를 계산하고 있습니다..."

                prompt = f'''당신은 대한민국 법령 출제위원입니다. 
                아래 [기출 모의고사 DB]를 참고하여, 주어진 [법령 본문]에서 빈칸 문제로 내기 가장 좋은 핵심 단어(숫자, 기한, 명사 등) 딱 1개만 골라주세요.
                그리고 그 단어가 어떤 모의고사와 연관되어 있는지 이유를 설명하세요.
                결과는 반드시 JSON 형식으로만 답하세요. 
                형식: {{"keyword": "추출한단어", "related_exam": "연관된 기출문제 내용 요약"}}
                
                [기출 모의고사 DB]:
                {all_exams}
                
                [법령 본문]:
                {content}
                '''
                response = requests.post(OLLAMA_API_URL, json={"model": MODEL_NAME, "prompt": prompt, "format": "json", "stream": False}, timeout=600)
                
                TASK_STATUS[task_id]["progress"] = 90
                TASK_STATUS[task_id]["message"] = "응답 해석 완료 및 UI 적용 중..."
                
                result = json.loads(response.json().get('response', '{}'))
                
                TASK_STATUS[task_id]["progress"] = 100
                TASK_STATUS[task_id]["status"] = "completed"
                TASK_STATUS[task_id]["result"] = result
                TASK_STATUS[task_id]["message"] = "AI 추천 완료!"
            except Exception as e:
                logging.error(f"[오류 진단] AI 추천 실패: {e}")
                TASK_STATUS[task_id]["status"] = "error"
                TASK_STATUS[task_id]["message"] = f"AI 연산 실패: {str(e)}"
                
        threading.Thread(target=process_recommend).start()
        return jsonify({"task_id": task_id, "message": "AI 추천 작업 시작"})
    except Exception as e:
        return jsonify({"error": "요청 실패", "details": str(e)}), 500

@app.route('/api/split-category', methods=['POST'])
def split_category():
    try:
        data = request.json
        cat_id, text1, text2, wallet_address = data.get('id'), data.get('text1'), data.get('text2'), data.get('wallet_address')
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT title, folder_name, is_x_marked FROM categories WHERE id = ? AND wallet_address = ?", (cat_id, wallet_address))
        row = cursor.fetchone()
        if not row: return jsonify({"error": "문헌을 찾을 수 없습니다."}), 404
        title, folder_name, is_x_marked = row[0], row[1], row[2]
        
        cursor.execute("UPDATE categories SET content = ? WHERE id = ? AND wallet_address = ?", (text1, cat_id, wallet_address))
        match = re.search(r'-(\d+)$', title)
        new_title = f"{title[:match.start()]}-{int(match.group(1))+1}" if match else f"{title}-2"
            
        cursor.execute("INSERT INTO categories (wallet_address, title, content, folder_name, is_x_marked) VALUES (?, ?, ?, ?, ?)", (wallet_address, new_title, text2, folder_name, is_x_marked))
        conn.commit()
        conn.close()
        return jsonify({"message": "분할 완료"})
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route('/api/move-categories', methods=['POST'])
def move_categories():
    data = request.json
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    for cat_id in data.get('ids', []):
        cursor.execute("UPDATE categories SET folder_name = ? WHERE id = ? AND wallet_address = ?", (data.get('folder_name'), cat_id, data.get('wallet_address')))
    conn.commit()
    conn.close()
    return jsonify({"message": "이동 완료"})

@app.route('/api/move-cards', methods=['POST'])
def move_cards():
    data = request.json
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    for card_id in data.get('ids', []):
        cursor.execute("UPDATE cards SET folder_name = ? WHERE id = ? AND wallet_address = ?", (data.get('folder_name'), card_id, data.get('wallet_address')))
    conn.commit()
    conn.close()
    return jsonify({"message": "이동 완료"})

@app.route('/api/get-categories')
def get_categories():
    try:
        wallet_address = request.args.get('wallet_address')
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT id, title, content, folder_name, is_x_marked FROM categories WHERE wallet_address = ?", (wallet_address,))
        cats = [{"id": r[0], "title": r[1], "content": r[2], "folder_name": r[3], "is_x_marked": bool(r[4])} for r in cursor.fetchall()]
        conn.close()
        return jsonify({"categories": cats})
    except Exception as e:
        logging.error(f"[오류 진단] get-categories 조회 실패: {e}")
        # 프론트엔드 충돌(WSOD) 완벽 방어를 위한 빈 배열 반환
        return jsonify({"categories": []})

@app.route('/api/save-card', methods=['POST'])
def save_card():
    data = request.json
    wallet_address, card_content, answer_text = data.get('wallet_address'), data.get('card_content'), data.get('answer_text')
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''INSERT INTO cards (wallet_address, card_content, answer_text, options_json, next_review_time, folder_name) VALUES (?, ?, ?, '[]', ?, "기본 폴더")''', (wallet_address, card_content, answer_text, get_next_review_time(0)))
    conn.commit()
    conn.close()
    return jsonify({"message": "카드 제작 완료"}), 201

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
                if now > next_review: cursor.execute("UPDATE cards SET status = 'BURNED', level = 0 WHERE id = ?", (card_id,))
                elif (next_review - now).total_seconds() < 7200: cursor.execute("UPDATE cards SET status = 'AT_RISK' WHERE id = ?", (card_id,))
        conn.commit()
        cursor.execute("SELECT id, card_content, answer_text, options_json, level, next_review_time, status, best_time, folder_name FROM cards WHERE wallet_address = ? ORDER BY id DESC", (wallet_address,))
        cards = [{"id": r[0], "content": r[1], "answer": r[2], "options": json.loads(r[3]), "level": r[4], "next_review": r[5], "status": r[6], "best_time": r[7], "folder_name": r[8]} for r in cursor.fetchall()]
        conn.close()
        return jsonify({"cards": cards})
    except Exception as e:
        logging.error(f"[오류 진단] my-cards 조회 실패: {e}")
        # 프론트엔드 충돌(WSOD) 완벽 방어를 위한 빈 배열 반환
        return jsonify({"cards": []})

@app.route('/api/submit-answer', methods=['POST'])
def submit_answer():
    data = request.json
    card_id, is_correct, clear_time = data.get('card_id'), data.get('is_correct'), data.get('clear_time', 999.0)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT level, best_time FROM cards WHERE id = ?", (card_id,))
    row = cursor.fetchone()
    if not row: return jsonify({"error": "카드가 없습니다."}), 404
    current_lv, best_time = row[0], row[1]
    
    if is_correct:
        new_lv = min(current_lv + 1, 50)
        new_best = clear_time if best_time is None else min(best_time, clear_time)
        cursor.execute("UPDATE cards SET level = ?, next_review_time = ?, status = 'OWNED', best_time = ? WHERE id = ?", (new_lv, get_next_review_time(new_lv), new_best, card_id))
        msg = f"방어 성공! 레벨이 {new_lv}로 올랐습니다."
    else:
        cursor.execute("UPDATE cards SET level = 0, next_review_time = ?, status = 'AT_RISK' WHERE id = ?", (get_next_review_time(0), card_id))
        msg = "방어 실패! 레벨이 0으로 초기화되었습니다."
    conn.commit()
    conn.close()
    return jsonify({"message": msg})

@app.route('/api/delete-category', methods=['POST'])
def delete_category():
    data = request.json
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM categories WHERE wallet_address = ? AND id = ?", (data.get('wallet_address'), data.get('id')))
    conn.commit()
    conn.close()
    return jsonify({"message": "삭제되었습니다."})

@app.route('/api/delete-card', methods=['POST'])
def delete_card():
    data = request.json
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM cards WHERE wallet_address = ? AND id = ?", (data.get('wallet_address'), data.get('id')))
    conn.commit()
    conn.close()
    return jsonify({"message": "삭제되었습니다."})

@app.route('/api/delete-all', methods=['POST'])
def delete_all():
    wallet_address = request.json.get('wallet_address')
    conn = sqlite3.connect(DB_PATH)
    for table in ['categories', 'cards', 'exams', 'ai_analysis']:
        conn.execute(f"DELETE FROM {table} WHERE wallet_address = ?", (wallet_address,))
    conn.commit()
    conn.close()
    return jsonify({"message": "초기화 성공"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
