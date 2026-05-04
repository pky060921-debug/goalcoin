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

logging.basicConfig(filename='backend_error_log.txt', level=logging.ERROR, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024

DB_PATH = os.path.expanduser("~/goalcoin/backend/blankd.db")
OLLAMA_API_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "gemma4:26b" 

@app.errorhandler(Exception)
def handle_exception(e):
    logging.error(f"백엔드 에러:\n{traceback.format_exc()}")
    return jsonify({"error": "백엔드 오류", "details": traceback.format_exc()}), 500

@app.route('/api/health', methods=['GET', 'OPTIONS'])
def health_check():
    return jsonify({"status": "alive"}), 200

def init_db():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT, title TEXT, content TEXT)')
        cursor.execute('CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT, category_id INTEGER, card_content TEXT, answer_text TEXT, options_json TEXT, level INTEGER DEFAULT 0, next_review_time DATETIME, status TEXT DEFAULT "OWNED", best_time REAL DEFAULT NULL)')
        cursor.execute('''CREATE TABLE IF NOT EXISTS exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT, title TEXT, question TEXT, answer TEXT, explanation TEXT, related_law_keywords TEXT
        )''')
        
        # 스키마 마이그레이션 (이전 버전 호환성)
        try: cursor.execute('ALTER TABLE cards ADD COLUMN best_time REAL DEFAULT NULL')
        except: pass
            
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"DB 초기화 실패: {e}")

init_db()

def clean_korean_law_text(text):
    text = re.sub(r'-\s*\d+\s*-', '\n', text)
    text = re.sub(r'/?\d{4}\.\d{1,2}\.\d{1,2}\s*\d{2}:\d{2}.*', '\n', text)
    text = re.sub(r'\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2}', '\n', text)
    text = re.sub(r'(?:국민건강보험법|시행령|시행규칙)[\sㆍ]*', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

# 🚨 [신규] 조항 및 구분기호(①, 1., 가.) 앞 줄바꿈 강제 정규식
def normalize_text(text):
    # 제 N 조 줄바꿈
    text = re.sub(r'(\s*)(제\s*\d+\s*조)', r'\n\n\2', text)
    # 동그라미 번호 줄바꿈
    text = re.sub(r'(\s*)(①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)', r'\n\2', text)
    # 문장 끝(다, 까, 요, .)이 아닌데 줄바꿈이 있으면 붙임 (단, 구분기호 앞은 제외)
    text = re.sub(r'([^\n다까요\.])\n(?!(제\s*\d+\s*조|①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩))', r'\1 ', text)
    # 다중 공백 제거
    text = re.sub(r'[ \t]+', ' ', text)
    # 빈 줄 정리
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def parse_html_3col_law(raw_text):
    unescaped = html.unescape(raw_text)
    pre_clean = re.sub(r'<(br|p|div|li)[^>]*>', '\n', unescaped, flags=re.IGNORECASE)
    pre_clean = re.sub(r'</(p|div|li|td|tr)>', '\n', pre_clean, flags=re.IGNORECASE)
    
    rows = re.split(r'<tr[^>]*>', pre_clean, flags=re.IGNORECASE)
    categories = []
    
    if len(rows) > 1:
        current_law_num = "000조"
        type_names = {0: '법', 1: '령', 2: '규'}
        
        for row_html in rows[1:]:
            try:
                row_text = re.sub(r'<[^>]+>', ' ', row_html).strip()
                row_text = re.sub(r'\s+', ' ', row_text)
                
                cols = re.split(r'<td[^>]*>', row_html, flags=re.IGNORECASE)[1:]
                if not cols: continue

                c0_raw = re.sub(r'<[^>]+>', '', cols[0]).strip()
                is_act_cell = bool(re.match(r'^\s*제\s*\d+\s*조(?:\s*의\s*\d+)?', c0_raw))
                
                # 3열을 모두 확보하거나 매핑
                mapped_cols = ["", "", ""]
                if len(cols) >= 3:
                    mapped_cols = cols[:3]
                elif len(cols) == 2:
                    if is_act_cell: mapped_cols[0], mapped_cols[1] = cols[0], cols[1]
                    else: mapped_cols[1], mapped_cols[2] = cols[0], cols[1] # 🚨 시행규칙 버그 픽스 포인트
                elif len(cols) == 1:
                    if is_act_cell: mapped_cols[0] = cols[0]
                    else: mapped_cols[1] = cols[0]

                if mapped_cols[0].strip():
                    law_match = re.search(r'제\s*(\d+)\s*조(?:\s*의\s*(\d+))?', re.sub(r'<[^>]+>', '', mapped_cols[0]))
                    if law_match:
                        main_num = law_match.group(1)
                        ext_part = law_match.group(2)
                        current_law_num = f"{int(main_num):03d}조"
                        if ext_part: current_law_num += f"의{ext_part}"
                
                if current_law_num == "000조":
                    fallback = re.search(r'제\s*(\d+)\s*조(?:\s*의\s*(\d+))?', row_text)
                    if fallback:
                        main_num = fallback.group(1)
                        ext_part = fallback.group(2)
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
                        main_n = article_match.group(1)
                        ext_n = article_match.group(2)
                        article_num_str = f"제{main_n}조"
                        if ext_n: article_num_str += f"의{ext_n}"
                    else:
                        article_num_str = current_law_num.lstrip('0')
                    
                    title_text = ""
                    title_match = re.search(r'\((.*?)\)', clean_content)
                    if title_match:
                        title_text = title_match.group(1).strip()
                    else:
                        title_text = clean_content.replace(article_num_str, "").strip().split('\n')[0][:15]
                    
                    clean_title = f"[{type_names.get(col_idx, '법')}] {article_num_str} {title_text}"
                    
                    categories.append({
                        "title": clean_title,
                        "content": clean_content
                    })
            except Exception as e:
                continue

    return categories

def get_next_review_time(level):
    now = datetime.utcnow()
    if level == 0:
        return now + timedelta(hours=12)
    elif level == 1:
        return now + timedelta(days=1)
    elif level == 2:
        return now + timedelta(days=3)
    else:
        return now + timedelta(days=7)

@app.route('/api/upload-pdf', methods=['POST'])
def upload_law():
    try:
        wallet_address = request.form.get('wallet_address')
        file = request.files.get('file')

        if not file:
            return jsonify({"error": "업로드된 파일이 없습니다."}), 400

        filename = file.filename.lower()
        
        if filename.endswith('.html') or filename.endswith('.htm'):
            categories = parse_html_3col_law(file.read().decode('utf-8', errors='ignore'))
        else:
            text = file.read().decode('utf-8', errors='ignore')
            normalized_text = normalize_text(clean_korean_law_text(text))
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
        
        for cat in categories:
            cursor.execute(
                "INSERT INTO categories (wallet_address, title, content) VALUES (?, ?, ?)", 
                (wallet_address, cat['title'], cat['content'])
            )
            
        conn.commit()
        conn.close()
        
        return jsonify({"message": "법령 아카이브 등록 성공", "count": len(categories)})
        
    except Exception as e:
        return jsonify({"error": "분석 실패"}), 500

@app.route('/api/upload-exam', methods=['POST'])
def upload_exam():
    try:
        wallet_address = request.form.get('wallet_address')
        file = request.files.get('file')
        
        if not file:
            return jsonify({"error": "파일이 없습니다."}), 400
            
        raw_text = file.read().decode('utf-8', errors='ignore')
        raw_text = normalize_text(clean_korean_law_text(raw_text))
        
        prompt = f'''당신은 CBT 시험지 파서입니다. 텍스트에서 객관식 문제, 정답, 해설을 JSON 배열 형식으로만 출력하세요. 
        형식: [ {{"question": "문제 내용 및 보기", "answer": "정답", "explanation": "해설"}} ]
        텍스트: {raw_text[:3000]}'''
        
        response = requests.post(OLLAMA_API_URL, json={"model": MODEL_NAME, "prompt": prompt, "format": "json", "stream": False}, timeout=600)
        exam_data = json.loads(response.json().get('response', '[]'))
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        for item in exam_data:
            cursor.execute(
                "INSERT INTO exams (wallet_address, title, question, answer, explanation) VALUES (?, ?, ?, ?, ?)",
                (wallet_address, file.filename, item.get('question', ''), item.get('answer', ''), item.get('explanation', ''))
            )
        conn.commit()
        conn.close()
        
        return jsonify({"message": f"{len(exam_data)}개의 문항이 저장되었습니다."})
        
    except Exception as e:
        return jsonify({"error": "모의고사 파싱 실패"}), 500

@app.route('/api/get-all-exams')
def get_all_exams():
    wallet_address = request.args.get('wallet_address')
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, question, answer, explanation FROM exams WHERE wallet_address = ?", (wallet_address,))
    exams = [{"id": r[0], "title": r[1], "question": r[2], "answer": r[3], "explanation": r[4]} for r in cursor.fetchall()]
    conn.close()
    return jsonify({"exams": exams})

@app.route('/api/recommend-blank', methods=['POST'])
def recommend_blank():
    try:
        data = request.json
        content = data.get('content')
        wallet_address = data.get('wallet_address')
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT question, answer FROM exams WHERE wallet_address = ? ORDER BY id DESC LIMIT 10", (wallet_address,))
        all_exams = "\n".join([f"Q:{r[0]} A:{r[1]}" for r in cursor.fetchall()])
        conn.close()

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
        result = json.loads(response.json().get('response', '{}'))
        
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": "AI 분석 실패", "details": str(e)}), 500

# 🚨 [신규] 문헌 분할 API
@app.route('/api/split-category', methods=['POST'])
def split_category():
    try:
        data = request.json
        cat_id = data.get('id')
        text1 = data.get('text1')
        text2 = data.get('text2')
        wallet_address = data.get('wallet_address')
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute("SELECT title FROM categories WHERE id = ? AND wallet_address = ?", (cat_id, wallet_address))
        row = cursor.fetchone()
        if not row: return jsonify({"error": "문헌을 찾을 수 없습니다."}), 404
        title = row[0]
        
        # 1. 원본 내용 업데이트 (text1)
        cursor.execute("UPDATE categories SET content = ? WHERE id = ? AND wallet_address = ?", (text1, cat_id, wallet_address))
        
        # 2. 새로운 문헌으로 삽입 (text2)
        match = re.search(r'-(\d+)$', title)
        if match:
            new_title = f"{title[:match.start()]}-{int(match.group(1))+1}"
        else:
            new_title = f"{title}-2"
            
        cursor.execute("INSERT INTO categories (wallet_address, title, content) VALUES (?, ?, ?)", (wallet_address, new_title, text2))
        
        conn.commit()
        conn.close()
        return jsonify({"message": "분할 완료"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/get-categories')
def get_categories():
    wallet_address = request.args.get('wallet_address')
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, content FROM categories WHERE wallet_address = ?", (wallet_address,))
    cats = [{"id": r[0], "title": r[1], "content": r[2]} for r in cursor.fetchall()]
    conn.close()
    return jsonify({"categories": cats})

@app.route('/api/save-card', methods=['POST'])
def save_card():
    data = request.json
    wallet_address = data.get('wallet_address')
    card_content = data.get('card_content')
    answer_text = data.get('answer_text')
    # 🚨 [수정됨] 프론트엔드에서 넘어오는 폴더명을 정확히 받아서 저장합니다.
    folder_name = data.get('folder_name', '기본 폴더') 
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # 🚨 [수정됨] cards 테이블에 folder_name을 함께 저장하도록 쿼리를 수정합니다.
    cursor.execute(
        '''INSERT INTO cards (wallet_address, card_content, answer_text, options_json, next_review_time, folder_name) 
           VALUES (?, ?, ?, '[]', ?, ?)''', 
        (wallet_address, card_content, answer_text, get_next_review_time(0), folder_name)
    )
    conn.commit()
    conn.close()
    return jsonify({"message": "카드 제작 완료"}), 201

@app.route('/api/my-cards')
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

    cursor.execute("SELECT id, card_content, answer_text, options_json, level, next_review_time, status, best_time FROM cards WHERE wallet_address = ? ORDER BY id DESC", (wallet_address,))
    cards = [{"id": r[0], "content": r[1], "answer": r[2], "options": json.loads(r[3]), "level": r[4], "next_review": r[5], "status": r[6], "best_time": r[7]} for r in cursor.fetchall()]
    conn.close()
    return jsonify({"cards": cards})

@app.route('/api/submit-answer', methods=['POST'])
def submit_answer():
    data = request.json
    card_id = data.get('card_id')
    is_correct = data.get('is_correct')
    clear_time = data.get('clear_time', 999.0)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT level, best_time FROM cards WHERE id = ?", (card_id,))
    row = cursor.fetchone()
    
    if not row: return jsonify({"error": "카드가 없습니다."}), 404
    
    current_lv = row[0]
    best_time = row[1]
    
    if is_correct:
        new_lv = min(current_lv + 1, 50)
        new_best = clear_time if best_time is None else min(best_time, clear_time)
        cursor.execute("UPDATE cards SET level = ?, next_review_time = ?, status = 'OWNED', best_time = ? WHERE id = ?", 
                       (new_lv, get_next_review_time(new_lv), new_best, card_id))
        msg = f"방어 성공! 레벨이 {new_lv}로 올랐습니다."
    else:
        cursor.execute("UPDATE cards SET level = 0, next_review_time = ?, status = 'AT_RISK' WHERE id = ?", 
                       (get_next_review_time(0), card_id))
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
    for table in ['categories', 'cards', 'exams']:
        conn.execute(f"DELETE FROM {table} WHERE wallet_address = ?", (wallet_address,))
    conn.commit()
    conn.close()
    return jsonify({"message": "초기화 성공"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
