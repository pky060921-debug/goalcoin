from flask import Blueprint, request, jsonify
import sqlite3
import requests
import threading
import uuid
import json
import logging
import traceback
import os
import random
import re
from datetime import datetime
from config import OLLAMA_API_URL, MODEL_NAME, TASK_STATUS
from database import get_db_connection
from services.parser import parse_html_3col_law, normalize_text, clean_korean_law_text, get_next_review_time

# 💡 [핵심 추가] PDF 바이너리 해독 라이브러리
try:
    import fitz  # PyMuPDF
except ImportError:
    logging.error("PyMuPDF(fitz) 라이브러리가 설치되지 않았습니다. pip install PyMuPDF 를 실행하세요.")

api_bp = Blueprint('api', __name__)

def init_golden_db():
    conn = get_db_connection()
    conn.execute('''CREATE TABLE IF NOT EXISTS golden_exams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_address TEXT,
        title TEXT,
        question TEXT,
        options_json TEXT,
        answer TEXT,
        explanation TEXT,
        category TEXT
    )''')
    conn.commit()
    conn.close()

init_golden_db()

@api_bp.route('/health', methods=['GET', 'OPTIONS'])
def health_check():
    return jsonify({"status": "alive"}), 200

@api_bp.route('/task-status')
def task_status():
    task_id = request.args.get('task_id')
    if task_id in TASK_STATUS:
        return jsonify(TASK_STATUS[task_id])
    return jsonify({"status": "not_found"}), 404

# ==========================================
# 💡 [업그레이드] 합동 검수 1단계: PDF 완벽 해독 및 쪼개기
# ==========================================
@api_bp.route('/upload-exam-coop', methods=['POST'])
def upload_exam_coop():
    try:
        file = request.files.get('file')
        if not file: return jsonify({"error": "파일이 없습니다."}), 400
        
        filename = file.filename.lower()
        raw_text = ""

        # 💡 [1. 정밀 텍스트 추출] 파일 확장자에 따른 분기 처리
        if filename.endswith('.pdf'):
            try:
                # PDF 바이너리를 메모리에서 직접 읽어 해독합니다.
                pdf_document = fitz.open(stream=file.read(), filetype="pdf")
                for page_num in range(len(pdf_document)):
                    page = pdf_document.load_page(page_num)
                    raw_text += page.get_text("text") + "\n\n"
                pdf_document.close()
            except Exception as pdf_e:
                logging.error(f"PDF 읽기 실패: {pdf_e}")
                return jsonify({"error": "PDF 파일 해독 중 오류가 발생했습니다."}), 500
        else:
            # 텍스트 파일(.txt 등)일 경우
            raw_text = file.read().decode('utf-8', errors='ignore')
        
        # 💡 [2. 오염물질 1차 세탁]
        raw_text = re.sub(r'-\s*\d+\s*-', '', raw_text) # 페이지 번호 제거
        raw_text = re.sub(r'【[^】]+】', '', raw_text) # 워터마크 제거
        
        # 💡 [3. 스마트 문단 쪼개기]
        # PDF는 문장 중간에서 임의로 줄바꿈(\n)이 일어나는 경우가 많습니다.
        chunks = []
        current_chunk = ""
        
        # 빈 줄 단위로 문단을 나눕니다 (PDF에서 단락 구분을 인식하기 위함)
        paragraphs = re.split(r'\n\s*\n', raw_text)
        
        for para in paragraphs:
            para = para.strip()
            if not para: continue
            
            # PDF 특유의 문장 중간 줄바꿈을 공백으로 이어붙여 가독성을 높입니다.
            para = para.replace('\n', ' ') 
            
            current_chunk += para + "\n\n"
            
            # 약 400자가 넘어가면 하나의 검수 블록(Chunk)으로 잘라냅니다.
            if len(current_chunk) > 400:
                chunks.append(current_chunk.strip())
                current_chunk = ""
                
        if current_chunk.strip():
            chunks.append(current_chunk.strip())
            
        return jsonify({"filename": file.filename, "chunks": chunks})
    except Exception as e:
        logging.error(f"Coop 업로드 실패: {e}")
        return jsonify({"error": str(e)}), 500

# ==========================================
# 💡 합동 검수 2단계: AI 문단 정밀 분석
# ==========================================
@api_bp.route('/analyze-chunk', methods=['POST'])
def analyze_chunk():
    data = request.json
    chunk_text = data.get('chunk_text', '')
    
    prompt = f"""당신은 출제위원이자 국어 교열 전문가입니다.
아래 PDF 텍스트에서 1개의 객관식 문제, 4개의 보기, 정답, 해설을 명확히 분리해 JSON으로 반환하세요.
표나 복잡한 형식이 깨져있다면 문맥을 파악해 알맞은 문장으로 복원하세요.

[원본 텍스트]
{chunk_text}

[출력형식 - 오직 JSON만 출력]
{{
  "question": "교정된 문제 내용",
  "options": ["1. 보기", "2. 보기", "3. 보기", "4. 보기"],
  "answer": "정답 번호 (숫자만)",
  "explanation": "해설"
}}"""
    try:
        response = requests.post(OLLAMA_API_URL, json={
            "model": MODEL_NAME, "prompt": prompt, "format": "json", "stream": False,
            "options": {"temperature": 0.1, "num_predict": 2000}
        }, timeout=120)
        
        result_text = response.json().get('response', '{}')
        clean_json_str = re.sub(r'```json|```', '', result_text).strip()
        return jsonify({"result": json.loads(clean_json_str)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ==========================================
# 💡 합동 검수 3단계: 골든 DB 저장
# ==========================================
@api_bp.route('/save-golden-exam', methods=['POST'])
def save_golden_exam():
    data = request.json
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''INSERT INTO golden_exams 
        (wallet_address, title, question, options_json, answer, explanation, category) 
        VALUES (?, ?, ?, ?, ?, ?, ?)''',
        (data.get('wallet_address'), data.get('title'), data.get('question'), 
         json.dumps(data.get('options', []), ensure_ascii=False), 
         data.get('answer'), data.get('explanation'), data.get('category', '기본분류')))
    conn.commit()
    conn.close()
    return jsonify({"message": "골든 DB 저장 완료!"})

# ==========================================
# 💡 10대 출제 스타일 생성 엔진
# ==========================================
@api_bp.route('/generate-styles', methods=['POST'])
def generate_styles():
    data = request.json
    article_text = data.get('article_text', '')
    if not article_text: return jsonify({"error": "법령 텍스트가 없습니다."}), 400
        
    prompt = f"""당신은 승진시험 최고 출제위원장입니다. 아래 [법령 조문]을 바탕으로 서로 다른 10가지 스타일의 4지 선다 문제를 창작하세요.
[법령 조문]\n{article_text}\n
[10가지 필수 출제 스타일]
1.단순목록형 2.NCS상황형 3.계산기한형 4.박스조합형 5.단서예외형 6.주체오답형 7.OX판별형 8.괄호형 9.취지추론형 10.융합형
[출력 지시사항] 반드시 JSON 배열 형식으로 10개를 출력하세요.
[{{ "style": "스타일 이름", "question": "문제 내용", "options": ["1. 보기", "2. 보기", "3. 보기", "4. 보기"], "answer": "숫자", "explanation": "해설" }}]"""
    try:
        response = requests.post(OLLAMA_API_URL, json={
            "model": MODEL_NAME, "prompt": prompt, "format": "json", "stream": False,
            "options": {"temperature": 0.5, "num_predict": 4000}
        }, timeout=180)
        clean_json = re.sub(r'```json|```', '', response.json().get('response', '[]')).strip()
        result_data = json.loads(clean_json)
        if isinstance(result_data, dict): result_data = result_data.get('problems', [result_data])
        return jsonify({"samples": result_data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ==========================================
# 🛑 원본 라우터 100% 보존 구역
# ==========================================

@api_bp.route('/get-cbt-session', methods=['GET'])
def get_cbt_session():
    json_path = os.path.expanduser("~/goalcoin/test/problem_bank_final_rag.json")
    try:
        if not os.path.exists(json_path):
            return jsonify({"error": "분석된 문제 은행 파일이 없습니다."}), 404
        with open(json_path, 'r', encoding='utf-8') as f:
            problems = json.load(f)
        selected = random.sample(problems, min(100, len(problems)))
        for p in selected:
            if isinstance(p.get('options'), list):
                p['options'] = json.dumps(p['options'], ensure_ascii=False)
        return jsonify(selected)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@api_bp.route('/upload-pdf', methods=['POST'])
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
                        if parts[0].strip(): categories.append({"title": "총칙 및 서론", "content": parts[0].strip(), "folder_name": custom_folder})
                        for i in range(1, len(parts), 2):
                            title = parts[i].strip()
                            content = parts[i+1].strip() if i+1 < len(parts) else ""
                            categories.append({"title": title, "content": content, "folder_name": custom_folder})
                    else: categories = [{"title": "문서 전체", "content": normalized_text, "folder_name": custom_folder}]
                
                conn = get_db_connection()
                cursor = conn.cursor()
                for cat in categories:
                    cursor.execute("INSERT INTO categories (wallet_address, title, content, folder_name) VALUES (?, ?, ?, ?)", 
                                   (wallet_address, cat['title'], cat['content'], cat.get('folder_name', custom_folder)))
                conn.commit()
                conn.close()
                TASK_STATUS[task_id].update({"progress": 100, "status": "completed", "message": "법령 아카이브 등록 성공"})
            except Exception as e:
                TASK_STATUS[task_id].update({"status": "error", "message": f"분석 실패: {str(e)}"})
                
        threading.Thread(target=process_law).start()
        return jsonify({"task_id": task_id, "message": "업로드 완료, 백그라운드 처리 시작"})
    except Exception as e: 
        return jsonify({"error": "전송 실패"}), 500

@api_bp.route('/upload-exam', methods=['POST'])
def upload_exam():
    try:
        wallet_address = request.form.get('wallet_address')
        file = request.files.get('file')
        if not file: return jsonify({"error": "파일이 없습니다."}), 400
        
        # 기존 모의고사 일괄 업로드도 PDF를 지원하도록 보강
        filename = file.filename.lower()
        if filename.endswith('.pdf'):
            pdf_document = fitz.open(stream=file.read(), filetype="pdf")
            raw_text = ""
            for page_num in range(len(pdf_document)):
                raw_text += pdf_document.load_page(page_num).get_text("text") + "\n"
            pdf_document.close()
        else:
            raw_text = file.read().decode('utf-8', errors='ignore')
            
        raw_text = normalize_text(clean_korean_law_text(raw_text))
        
        task_id = str(uuid.uuid4())
        TASK_STATUS[task_id] = {"status": "running", "progress": 20, "message": f"{MODEL_NAME} 엔진에 텍스트 주입 완료. 모의고사 분석 중..."}
        
        def process_exam():
            try:
                prompt = f'''당신은 CBT 시험지 파서입니다. 텍스트에서 객관식 문제, 정답, 해설을 JSON 배열 형식으로만 출력하세요. 
                형식: [ {{"question": "문제 내용 및 보기", "answer": "정답", "explanation": "해설"}} ]
                텍스트: {raw_text[:3000]}'''
                
                response = requests.post(OLLAMA_API_URL, json={"model": MODEL_NAME, "prompt": prompt, "format": "json", "stream": False}, timeout=600)
                exam_data = json.loads(response.json().get('response', '[]'))
                
                conn = get_db_connection()
                cursor = conn.cursor()
                for item in exam_data:
                    cursor.execute("INSERT INTO exams (wallet_address, title, question, answer, explanation) VALUES (?, ?, ?, ?, ?)",
                                   (wallet_address, filename, item.get('question', ''), item.get('answer', ''), item.get('explanation', '')))
                conn.commit()
                conn.close()
                TASK_STATUS[task_id].update({"progress": 100, "status": "completed", "message": f"{len(exam_data)}개의 문항 저장됨."})
            except Exception as e:
                TASK_STATUS[task_id].update({"status": "error", "message": f"모의고사 파싱 실패: {str(e)}"})
                
        threading.Thread(target=process_exam).start()
        return jsonify({"task_id": task_id, "message": "모의고사 처리 시작"})
    except Exception as e:
        return jsonify({"error": "요청 실패"}), 500

@api_bp.route('/get-all-exams')
def get_all_exams():
    try:
        wallet_address = request.args.get('wallet_address')
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, title, question, answer, explanation FROM exams WHERE wallet_address = ?", (wallet_address,))
        exams = [{"id": r[0], "title": r[1], "question": r[2], "answer": r[3], "explanation": r[4]} for r in cursor.fetchall()]
        conn.close()
        return jsonify({"exams": exams})
    except Exception as e:
        return jsonify({"error": "조회 실패"}), 500

@api_bp.route('/recommend-blank', methods=['POST'])
def recommend_blank():
    try:
        data = request.json
        content = data.get('content')
        wallet_address = data.get('wallet_address')
        
        task_id = str(uuid.uuid4())
        TASK_STATUS[task_id] = {"status": "running", "progress": 15, "message": "DB에서 과거 기출문제 스캔 중..."}
        
        def process_recommend():
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT question, answer FROM exams WHERE wallet_address = ? ORDER BY id DESC LIMIT 10", (wallet_address,))
                all_exams = "\n".join([f"Q:{r[0]} A:{r[1]}" for r in cursor.fetchall()])
                conn.close()
                
                prompt = f'''당신은 대한민국 법령 출제위원입니다. 
                아래 [기출 모의고사 DB]를 참고하여, 주어진 [법령 본문]에서 빈칸 문제로 내기 가장 좋은 핵심 단어(숫자, 기한, 명사 등) 딱 1개만 골라주세요.
                형식: {{"keyword": "추출한단어", "related_exam": "연관된 기출문제 내용 요약"}}
                [기출 모의고사 DB]:\n{all_exams}\n[법령 본문]:\n{content}'''
                
                response = requests.post(OLLAMA_API_URL, json={"model": MODEL_NAME, "prompt": prompt, "format": "json", "stream": False}, timeout=600)
                result = json.loads(response.json().get('response', '{}'))
                
                TASK_STATUS[task_id].update({"progress": 100, "status": "completed", "result": result, "message": "AI 추천 완료!"})
            except Exception as e:
                TASK_STATUS[task_id].update({"status": "error", "message": f"AI 연산 실패: {str(e)}"})
                
        threading.Thread(target=process_recommend).start()
        return jsonify({"task_id": task_id, "message": "AI 추천 작업 시작"})
    except Exception as e:
        return jsonify({"error": "요청 실패", "details": str(e)}), 500

@api_bp.route('/get-categories')
def get_categories():
    try:
        wallet_address = request.args.get('wallet_address')
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, title, content, folder_name FROM categories WHERE wallet_address = ?", (wallet_address,))
        cats = [{"id": r[0], "title": r[1], "content": r[2], "folder_name": r[3]} for r in cursor.fetchall()]
        conn.close()
        return jsonify({"categories": cats})
    except Exception as e:
        return jsonify({"error": "조회 실패"}), 500

@api_bp.route('/save-card', methods=['POST'])
def save_card():
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        card_content = data.get('card_content')
        answer_text = data.get('answer_text')
        folder_name = data.get('folder_name', '기본 폴더')
        memo = data.get('memo', '')
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''INSERT INTO cards (wallet_address, card_content, answer_text, options_json, next_review_time, folder_name, memo) VALUES (?, ?, ?, '[]', ?, ?, ?)''', (wallet_address, card_content, answer_text, get_next_review_time(0), folder_name, memo))
        conn.commit()
        conn.close()
        return jsonify({"message": "카드 제작 완료"}), 201
    except Exception as e:
        return jsonify({"error": "저장 실패"}), 500

@api_bp.route('/my-cards')
def get_my_cards():
    try:
        wallet_address = request.args.get('wallet_address')
        conn = get_db_connection()
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
        
        cursor.execute("SELECT id, card_content, answer_text, options_json, level, next_review_time, status, best_time, folder_name, memo FROM cards WHERE wallet_address = ? ORDER BY id DESC", (wallet_address,))
        cards = [{"id": r[0], "content": r[1], "answer": r[2], "options": json.loads(r[3]), "level": r[4], "next_review": r[5], "status": r[6], "best_time": r[7], "folder_name": r[8], "memo": r[9] or ""} for r in cursor.fetchall()]
        conn.close()
        return jsonify({"cards": cards})
    except Exception as e:
        return jsonify({"error": "조회 실패"}), 500

@api_bp.route('/sync-batch', methods=['POST'])
def sync_batch():
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        memos = data.get('memos', [])
        answers = data.get('answers', [])
        
        if not wallet_address:
            return jsonify({"error": "인증 정보 없음"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        for m in memos:
            cursor.execute("UPDATE cards SET memo = ? WHERE id = ? AND wallet_address = ?", (m.get('memo', ''), m.get('id'), wallet_address))

        for a in answers:
            card_id = a.get('card_id')
            is_correct = a.get('is_correct')
            clear_time = float(a.get('clear_time', 999.0))

            cursor.execute("SELECT level, best_time FROM cards WHERE id = ? AND wallet_address = ?", (card_id, wallet_address))
            row = cursor.fetchone()
            if row:
                current_lv, best_time = row[0], row[1]
                if is_correct:
                    new_lv = min(int(current_lv) + 1, 50)
                    try: best_time_float = float(best_time) if best_time is not None else float('inf')
                    except: best_time_float = float('inf')
                    new_best = clear_time if best_time_float == float('inf') else min(best_time_float, clear_time)
                    cursor.execute("UPDATE cards SET level = ?, next_review_time = ?, status = 'OWNED', best_time = ? WHERE id = ?", (new_lv, get_next_review_time(new_lv), new_best, card_id))
                else:
                    cursor.execute("UPDATE cards SET level = 0, next_review_time = ?, status = 'AT_RISK' WHERE id = ?", (get_next_review_time(0), card_id))

        conn.commit()
        conn.close()
        return jsonify({"message": f"일괄 동기화 성공 (메모:{len(memos)}건, 학습:{len(answers)}건)"}), 200
    except Exception as e:
        return jsonify({"error": "배치 동기화 실패"}), 500

@api_bp.route('/update-card-memo', methods=['POST'])
def update_card_memo():
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        card_id = data.get('id')
        memo = data.get('memo', '')
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE cards SET memo = ? WHERE id = ? AND wallet_address = ?", (memo, card_id, wallet_address))
        conn.commit()
        conn.close()
        return jsonify({"message": "메모 및 통계 업데이트 완료"}), 200
    except Exception as e:
        return jsonify({"error": "메모 업데이트 실패"}), 500

@api_bp.route('/submit-answer', methods=['POST'])
def submit_answer():
    try:
        data = request.json
        card_id = data.get('card_id')
        is_correct = data.get('is_correct')
        try: clear_time = float(data.get('clear_time', 999.0))
        except: clear_time = 999.0

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT level, best_time FROM cards WHERE id = ?", (card_id,))
        row = cursor.fetchone()
        if not row: return jsonify({"error": "카드가 없습니다."}), 404
        current_lv, best_time = row[0], row[1]
        
        if is_correct:
            new_lv = min(int(current_lv) + 1, 50)
            try: best_time_float = float(best_time) if best_time is not None else float('inf')
            except: best_time_float = float('inf')
            new_best = clear_time if best_time_float == float('inf') else min(best_time_float, clear_time)
            cursor.execute("UPDATE cards SET level = ?, next_review_time = ?, status = 'OWNED', best_time = ? WHERE id = ?", (new_lv, get_next_review_time(new_lv), new_best, card_id))
            msg = f"방어 성공! 레벨이 {new_lv}로 올랐습니다."
        else:
            cursor.execute("UPDATE cards SET level = 0, next_review_time = ?, status = 'AT_RISK' WHERE id = ?", (get_next_review_time(0), card_id))
            msg = "방어 실패! 레벨이 0으로 초기화되었습니다."
        conn.commit()
        conn.close()
        return jsonify({"message": msg})
    except Exception as e:
        return jsonify({"error": "제출 처리 실패"}), 500

@api_bp.route('/delete-category', methods=['POST'])
def delete_category():
    try:
        data = request.json
        conn = get_db_connection()
        conn.execute("DELETE FROM categories WHERE wallet_address = ? AND id = ?", (data.get('wallet_address'), data.get('id')))
        conn.commit()
        conn.close()
        return jsonify({"message": "삭제되었습니다."})
    except Exception as e:
        return jsonify({"error": "삭제 실패"}), 500

@api_bp.route('/delete-card', methods=['POST'])
def delete_card():
    try:
        data = request.json
        conn = get_db_connection()
        conn.execute("DELETE FROM cards WHERE wallet_address = ? AND id = ?", (data.get('wallet_address'), data.get('id')))
        conn.commit()
        conn.close()
        return jsonify({"message": "삭제되었습니다."})
    except Exception as e:
        return jsonify({"error": "삭제 실패"}), 500

@api_bp.route('/delete-all', methods=['POST'])
def delete_all():
    try:
        wallet_address = request.json.get('wallet_address')
        conn = get_db_connection()
        for table in ['categories', 'cards', 'exams', 'ai_analysis']:
            conn.execute(f"DELETE FROM {table} WHERE wallet_address = ?", (wallet_address,))
        conn.commit()
        conn.close()
        return jsonify({"message": "초기화 성공"})
    except Exception as e:
        return jsonify({"error": "초기화 실패"}), 500

@api_bp.route('/split-category', methods=['POST'])
def split_category():
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        cat_id = data.get('id')
        text1 = data.get('text1')
        text2 = data.get('text2')
        title1 = data.get('title1')
        title2 = data.get('title2')
        folder_name = data.get('folder_name') or '기본 폴더'

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM categories WHERE id = ? AND wallet_address = ?", (cat_id, wallet_address))
        cursor.execute("INSERT INTO categories (wallet_address, title, content, folder_name) VALUES (?, ?, ?, ?)", (wallet_address, title1, text1, folder_name))
        cursor.execute("INSERT INTO categories (wallet_address, title, content, folder_name) VALUES (?, ?, ?, ?)", (wallet_address, title2, text2, folder_name))
        conn.commit()
        conn.close()
        return jsonify({"message": "본문 분할 완료"})
    except Exception as e:
        return jsonify({"error": "분할 실패"}), 500
