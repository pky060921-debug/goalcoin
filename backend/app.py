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
# 1. 에러 추적 로깅 설정 (오류 진단 기능 포함)
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

# 🚨 [오류 진단 코드] 모든 치명적 에러를 캐치하고 프론트엔드로 반환
@app.errorhandler(Exception)
def handle_exception(e):
    error_detail = traceback.format_exc()
    logging.error(f"오류 진단 - 백엔드 치명적 에러:\n{error_detail}")
    print(f"\n[🚨 서버 치명적 에러]\n{error_detail}")
    return jsonify({"error": "백엔드 엔진 오류 진단 발생", "details": error_detail}), 500

@app.route('/api/health', methods=['GET', 'OPTIONS'])
def health_check():
    return jsonify({"status": "alive", "message": "백엔드 서버 정상 작동 중."}), 200

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
        print(f"오류 진단 - DB 초기화 실패: {e}")

init_db()

# ==========================================
# 3. 데이터 클렌징 및 3단 비교표 파싱 엔진
# ==========================================
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
        current_chapter = "1. 미분류"
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
                    current_chapter = f"{int(c_num)}. {c_name}"
                    if len(row_text) < 40 and "조" not in row_text:
                        continue

                cols = re.split(r'<td[^>]*>', row_html, flags=re.IGNORECASE)[1:]
                if not cols:
                    continue
                
                c0_raw = re.sub(r'<[^>]+>', '', cols[0]).strip()
                is_act_cell = bool(re.match(r'^\s*제\s*\d+\s*조(?:\s*의\s*\d+)?', c0_raw))
                
                mapped_cols = ["", "", ""]
                if len(cols) >= 3:
                    mapped_cols = cols[:3]
                elif len(cols) == 2:
                    if is_act_cell:
                        mapped_cols[0], mapped_cols[1] = cols[0], cols[1]
                    else:
                        mapped_cols[1], mapped_cols[2] = cols[0], cols[1]
                elif len(cols) == 1:
                    if is_act_cell:
                        mapped_cols[0] = cols[0]
                    else:
                        mapped_cols[1] = cols[0]

                if mapped_cols[0].strip():
                    law_match = re.search(r'제\s*(\d+)\s*조(?:\s*의\s*(\d+))?', re.sub(r'<[^>]+>', '', mapped_cols[0]))
                    if law_match:
                        main_num, ext_part = law_match.group(1), law_match.group(2)
                        current_law_num = f"{int(main_num):03d}조"
                        if ext_part:
                            current_law_num += f"의{ext_part}"
                
                if current_law_num == "000조":
                    fallback = re.search(r'제\s*(\d+)\s*조(?:\s*의\s*(\d+))?', row_text)
                    if fallback:
                        main_num, ext_part = fallback.group(1), fallback.group(2)
                        current_law_num = f"{int(main_num):03d}조"
                        if ext_part:
                            current_law_num += f"의{ext_part}"

                for col_idx in range(3):
                    html_content = mapped_cols[col_idx]
                    if not html_content or len(html_content) < 5:
                        continue
                    
                    clean_content = re.sub(r'<[^>]+>', '', html_content)
                    if re.search(r'국민건강보험\s*요양급여의\s*기준', clean_content):
                        continue
                    
                    clean_content = re.sub(r'「?국민건강보험법\s*시행(?:령|규칙)」?', '', clean_content)
                    clean_content = re.sub(r'([^\n])\s*(\d+\.)', r'\1\n\2', clean_content)
                    clean_content = re.sub(r'[①-⑮\[<].*?[\d\.]+.*?\]>]', '', clean_content)
                    clean_content = clean_content.replace("시행령", "").replace("시행규칙", "")
                    clean_content = re.sub(r'[ \t]+', ' ', clean_content)
                    clean_content = re.sub(r'\n\s*\n', '\n', clean_content).strip()
                    
                    if len(clean_content) < 2: continue
                    if clean_content in ["시행규칙", "법률", "내용없음", ".", "-"]: continue
                    
                    article_match = re.search(r'제\s*(\d+)\s*조(?:\s*의\s*(\d+))?', clean_content)
                    if article_match:
                        main_n, ext_n = article_match.group(1), article_match.group(2)
                        article_num_str = f"제{main_n}조" + (f"의{ext_n}" if ext_n else "")
                    else:
                        article_num_str = current_law_num.lstrip('0')
                    
                    title_text = ""
                    title_match = re.search(r'\((.*?)\)', clean_content)
                    if title_match:
                        title_text = title_match.group(1).strip()
                    else:
                        first_line = clean_content.replace(article_num_str, "").strip().split('\n')[0]
                        title_text = first_line[:15]
                    
                    clean_title = f"[{type_names.get(col_idx, '법')}] {article_num_str} {title_text}"
                    categories.append({"title": clean_title, "content": clean_content})
            except Exception as e:
                continue
    return categories

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
        response = requests.post(OLLAMA_API_URL, json=payload, timeout=600)
        if response.status_code == 200:
            result = response.json().get('response', '').strip()
            return re.sub(r'[^\w\s]', '', result.split('\n')[0]).strip()
    except requests.exceptions.ConnectionError:
        logging.error("오류 진단 - Ollama AI 엔진 연결 거부됨 (포트 11434).")
    except requests.exceptions.ReadTimeout:
        logging.error("오류 진단 - Ollama AI 추천 타임아웃 발생 (대기 시간 초과).")
    except Exception as e:
        logging.error(f"오류 진단 - Ollama 통신 오류: {str(e)}")
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
        
        filename = file.filename.lower()
        
        if filename.endswith('.html') or filename.endswith('.htm'):
            raw_bytes = file.read()
            raw_text = ""
            for enc in ['utf-8', 'utf-8-sig', 'cp949', 'latin-1']:
                try:
                    raw_text = raw_bytes.decode(enc)
                    break
                except:
                    continue
            if not raw_text:
                raw_text = raw_bytes.decode('utf-8', errors='ignore')
            categories = parse_html_3col_law(raw_text)
        else:
            raw_bytes = file.read()
            text = ""
            if filename.endswith('.pdf'):
                doc = fitz.open(stream=raw_bytes, filetype="pdf")
                for page in doc:
                    text += page.get_text("text") + "\n"
            elif filename.endswith('.docx') and docx:
                import io
                doc_file = docx.Document(io.BytesIO(raw_bytes))
                text = "\n".join([p.text for p in doc_file.paragraphs])
            else:
                try: text = raw_bytes.decode('utf-8')
                except: text = raw_bytes.decode('cp949', errors='ignore')

            cleaned_text = clean_korean_law_text(text)
            normalized_text = normalize_text(cleaned_text)
            
            categories = []
            parts = re.split(r'(제\s*\d+\s*조(?:의\s*\d+)?\s*(?:\([^)]+\))?)', normalized_text)
            if parts and len(parts) > 1:
                if parts[0].strip():
                    categories.append({"title": "총칙 및 서론", "content": parts[0].strip()})
                for i in range(1, len(parts), 2):
                    title = parts[i].strip()
                    content = parts[i+1].strip() if i+1 < len(parts) else ""
                    categories.append({"title": title, "content": content})
            else:
                categories = [{"title": "문서 전체", "content": normalized_text}]
            
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        full_pool_text = ""
        for cat in categories:
            cursor.execute("INSERT INTO categories (wallet_address, title, content) VALUES (?, ?, ?)", 
                           (wallet_address, cat['title'], cat['content']))
            full_pool_text += cat['content'] + " "
        conn.commit()
        conn.close()
        
        GLOBAL_WORD_POOL.update(extract_candidates(full_pool_text))
        return jsonify({"message": "법령 아카이브 등록 성공", "count": len(categories)})
    except Exception as e:
        return jsonify({"error": "오류 진단 - 법령 분석 실패", "details": traceback.format_exc()}), 500

@app.route('/api/upload-exam', methods=['POST'])
def upload_exam():
    try:
        wallet_address = request.form.get('wallet_address')
        file = request.files.get('file')
        if not file: return jsonify({"error": "업로드된 파일이 없습니다."}), 400
        
        filename = file.filename.lower()
        raw_bytes = file.read()
        raw_text = ""
        
        if filename.endswith('.pdf'):
            doc = fitz.open(stream=raw_bytes, filetype="pdf")
            for page in doc:
                raw_text += page.get_text("text") + "\n"
        elif filename.endswith('.html') or filename.endswith('.htm'):
            if BeautifulSoup:
                soup = BeautifulSoup(raw_bytes, 'html.parser')
                raw_text = soup.get_text(separator='\n', strip=True)
        else:
            try: raw_text = raw_bytes.decode('utf-8')
            except: raw_text = raw_bytes.decode('cp949', errors='ignore')
            
        raw_text = normalize_text(clean_korean_law_text(raw_text))
        
        prompt = f"""
        당신은 법률 시험지 파서입니다. 다음 텍스트에서 문제, 정답, 해설을 추출하여 반드시 아래의 JSON 배열 형식으로만 출력하세요.
        [
            {{"question": "문제 내용", "answer": "정답", "explanation": "해설 내용"}}
        ]
        텍스트: {raw_text[:3000]}
        """
        response = requests.post(OLLAMA_API_URL, json={"model": MODEL_NAME, "prompt": prompt, "format": "json", "stream": False}, timeout=600)
        exam_data = json.loads(response.json().get('response', '[]'))
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        for item in exam_data:
            cursor.execute("INSERT INTO exams (wallet_address, title, question, answer, explanation) VALUES (?, ?, ?, ?, ?)",
                           (wallet_address, file.filename, item.get('question', ''), item.get('answer', ''), item.get('explanation', '')))
        conn.commit()
        conn.close()
        return jsonify({"message": f"{len(exam_data)}개의 모의고사 문항이 구조화되어 저장되었습니다."})
    
    except requests.exceptions.ConnectionError:
        return jsonify({
            "error": "오류 진단 - AI 엔진(Ollama) 연결 거부됨", 
            "details": "맥미니에서 Ollama가 꺼져 있습니다."
        }), 500
    except requests.exceptions.ReadTimeout:
        return jsonify({
            "error": "오류 진단 - Ollama 응답 지연 (Timeout)", 
            "details": "Gemma 26B 모델이 답변을 생성하는 데 너무 오랜 시간이 걸려 연결이 끊겼습니다."
        }), 500
    except Exception as e:
        return jsonify({"error": "오류 진단 - 모의고사 파싱 실패", "details": traceback.format_exc()}), 500

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
        return jsonify({"error": "오류 진단 - 관련 기출 검색 에러", "details": traceback.format_exc()}), 500

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
        response = requests.post(OLLAMA_API_URL, json={"model": MODEL_NAME, "prompt": prompt, "stream": False}, timeout=600)
        return jsonify({"explanation": response.json()['response']})
    except requests.exceptions.ConnectionError:
        return jsonify({"error": "오류 진단 - Ollama 연결 거부", "details": "맥미니에서 Ollama가 꺼져 있습니다."}), 500
    except requests.exceptions.ReadTimeout:
        return jsonify({"error": "오류 진단 - Ollama 응답 지연", "details": "해설을 생성하는 데 시간이 초과되었습니다."}), 500
    except Exception as e:
        return jsonify({"error": "오류 진단 - 해설 생성 에러", "details": traceback.format_exc()}), 500

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
            ''', (wallet_address, category_id, card_content, answer_text, json.dumps(options), get_next_review_time(0)))
            conn.commit()
            msg = f"AI가 모의고사를 바탕으로 [{target}] 빈칸을 추천하여 제작했습니다."
        else:
            msg = "추출 가능한 유효 단어가 없습니다."
            
        conn.close()
        return jsonify({"message": msg})
    except Exception as e:
        return jsonify({"error": "오류 진단 - 카드 제작 실패", "details": traceback.format_exc()}), 500

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
        return jsonify({"error": "오류 진단 - 카드 제작 에러", "details": traceback.format_exc()}), 500

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
        return jsonify({"error": "오류 진단 - 카드 로드 실패", "details": traceback.format_exc()}), 500

@app.route('/api/submit-answer', methods=['POST'])
def submit_answer():
    data = request.json
    card_id = data.get('card_id')
    is_correct = data.get('is_correct')
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT level FROM cards WHERE id = ?", (card_id,))
    row = cursor.fetchone()
    if not row: return jsonify({"error": "오류 진단 - 카드가 없습니다."}), 404
    
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

@app.route('/api/delete-category', methods=['POST'])
def delete_category():
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        cat_id = data.get('id')
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM categories WHERE wallet_address = ? AND id = ?", (wallet_address, cat_id))
        conn.commit()
        conn.close()
        return jsonify({"message": "해당 문헌이 개별 삭제되었습니다."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/delete-card', methods=['POST'])
def delete_card():
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        card_id = data.get('id')
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM cards WHERE wallet_address = ? AND id = ?", (wallet_address, card_id))
        conn.commit()
        conn.close()
        return jsonify({"message": "해당 카드가 영구 삭제되었습니다."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

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

# --- 🚨 [신규 추가] 법-령-칙 3단 레이아웃 데이터 제공 API ---
@app.route('/api/law_data', methods=['GET'])
def get_law_data():
    try:
        data = {
            "law": [{"id": 1, "article": "제1조(목적)", "content": "이 법은 건강보험 및 체납처분과 관련된..."}],
            "decree": [{"id": 1, "article": "제1조(시행일)", "content": "이 영은 공포한 날부터 시행한다."}],
            "rule": [{"id": 1, "article": "제1조(세부규칙)", "content": "체납처분 담당자 180인 교육에 따른 세부 지침을..."}]
        }
        return jsonify({"status": "success", "data": data})
    except Exception as e:
        raise e

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
