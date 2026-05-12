from flask import Blueprint, request, jsonify
import sqlite3
import threading
import uuid
import json
import logging
import traceback
import os
import random
import re
import time
from datetime import datetime

from google import genai
from google.genai import types

from config import GEMINI_API_KEYS, TASK_STATUS
from database import get_db_connection
from services.parser import parse_html_3col_law, normalize_text, clean_korean_law_text, get_next_review_time

try:
    import fitz  # PyMuPDF
except ImportError:
    logging.error("PyMuPDF(fitz) 라이브러리가 설치되지 않았습니다.")

api_bp = Blueprint('api', __name__)

# ==========================================
# 💡 제미나이 무한 동력 & 우회(Fallback) 엔진
# ==========================================
current_api_key_index = 0

def generate_gemini_json(prompt, temperature=0.1):
    global current_api_key_index
    fallback_models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest']
    max_retries = len(GEMINI_API_KEYS) * len(fallback_models)
    
    for attempt in range(max_retries):
        try:
            client = genai.Client(api_key=GEMINI_API_KEYS[current_api_key_index])
            current_model = fallback_models[attempt % len(fallback_models)]
            
            response = client.models.generate_content(
                model=current_model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=temperature
                )
            )
            return response.text
            
        except Exception as e:
            error_msg = str(e).lower()
            if "429" in error_msg or "quota" in error_msg or "exhausted" in error_msg:
                logging.warning(f"⚠️ API 키 {current_api_key_index} 한도 초과! 다음 키로 전환합니다.")
                current_api_key_index = (current_api_key_index + 1) % len(GEMINI_API_KEYS)
            elif "503" in error_msg or "unavailable" in error_msg or "high demand" in error_msg:
                logging.warning(f"⚠️ 구글 서버({current_model}) 폭주(503). 1초 대기 후 우회합니다...")
                time.sleep(1)
            else:
                if attempt == max_retries - 1:
                    logging.error(f"❌ 제미나이 최종 실패 내역:\n{traceback.format_exc()}")
                    raise e
                time.sleep(1)
                
    raise Exception("🚨 구글 서버 불안정 또는 모든 API 키 한도 초과입니다. 잠시 후 시도해주세요.")

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
    conn.execute('''CREATE TABLE IF NOT EXISTS pending_exams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_address TEXT,
        filename TEXT,
        chunks_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
# 🛑 [신규 기능 1] 법령 기반 지능형 해설 창작 기능 탑재 (upload_exam)
# ==========================================
@api_bp.route('/upload-exam', methods=['POST'])
def upload_exam():
    try:
        wallet_address = request.form.get('wallet_address')
        file = request.files.get('file')
        if not file: return jsonify({"error": "파일이 없습니다."}), 400
        
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
        TASK_STATUS[task_id] = {"status": "running", "progress": 20, "message": f"Gemini 엔진 분석 중..."}
        
        def process_exam():
            try:
                # 1. DB에 업로드된 '법령' 데이터 먼저 긁어오기 (RAG 파이프라인)
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT title, content FROM categories WHERE wallet_address = ?", (wallet_address,))
                laws = cursor.fetchall()
                conn.close()

                law_context = "등록된 참고 법령이 없습니다."
                if laws:
                    # 법령을 하나의 거대한 텍스트로 압축
                    law_context = "\n\n".join([f"[{r[0]}]\n{r[1]}" for r in laws])
                
                # 2. 강력해진 프롬프트 (문제+정답+법령 크로스체크 지시)
                prompt = f'''당신은 국민건강보험공단 승진시험 최고 출제위원이자 완벽한 해설가입니다.
                아래 [참고 법령]을 완벽하게 숙지하세요.
                사용자가 업로드한 [시험지 텍스트]에는 '문제'와 '정답'이 포함되어 있습니다.
                문제를 분석하고 정답을 확인한 뒤, 왜 그것이 정답인지 [참고 법령]의 구체적인 조항을 근거로 아주 상세하고 명확한 [해설]을 직접 작성해 주세요.

                [참고 법령 DB]
                {law_context[:35000]}

                [시험지 텍스트]
                {raw_text[:10000]}

                [출력 지시사항] 반드시 아래 JSON 배열 형식으로만 출력하세요.
                [{{ "question": "문제 내용 및 보기", "answer": "정답(숫자 등)", "explanation": "법령 조문을 근거로 작성된 상세하고 논리적인 해설" }}]
                '''
                
                response_text = generate_gemini_json(prompt)
                exam_data = json.loads(response_text)
                
                conn = get_db_connection()
                cursor = conn.cursor()
                for item in exam_data:
                    cursor.execute("INSERT INTO exams (wallet_address, title, question, answer, explanation) VALUES (?, ?, ?, ?, ?)",
                                   (wallet_address, filename, item.get('question', ''), item.get('answer', ''), item.get('explanation', '')))
                conn.commit()
                conn.close()
                TASK_STATUS[task_id].update({"progress": 100, "status": "completed", "message": f"{len(exam_data)}개의 문항(해설 포함) 저장됨."})
            except Exception as e:
                error_trace = traceback.format_exc()
                logging.error(f"모의고사 파싱 실패 내역:\n{error_trace}")
                TASK_STATUS[task_id].update({"status": "error", "message": f"모의고사 파싱 실패: {str(e)}"})
                
        threading.Thread(target=process_exam).start()
        return jsonify({"task_id": task_id, "message": "모의고사 처리 시작"})
    except Exception as e:
        error_trace = traceback.format_exc()
        logging.error(f"라우터 진입 에러:\n{error_trace}")
        return jsonify({"error": "요청 실패"}), 500

# ==========================================
# 🛑 [신규 기능 2] 모의고사 개별 삭제 (delete-exam)
# ==========================================
@api_bp.route('/delete-exam', methods=['POST'])
def delete_exam():
    try:
        data = request.json
        exam_id = data.get('id')
        wallet_address = data.get('wallet_address')
        
        conn = get_db_connection()
        # 일반 모의고사 DB에서 삭제
        conn.execute("DELETE FROM exams WHERE id = ? AND wallet_address = ?", (exam_id, wallet_address))
        # 골든 DB(검수완료)에서도 삭제 가능하도록 동시 처리
        conn.execute("DELETE FROM golden_exams WHERE id = ? AND wallet_address = ?", (exam_id, wallet_address))
        conn.commit()
        conn.close()
        return jsonify({"message": "해당 문제가 삭제되었습니다."})
    except Exception as e:
        logging.error(f"모의고사 삭제 에러:\n{traceback.format_exc()}")
        return jsonify({"error": "삭제 실패"}), 500

# ==========================================
# 기존 라우터들 (손실 없이 100% 보존)
# ==========================================
@api_bp.route('/upload-exam-coop', methods=['POST'])
def upload_exam_coop():
    try:
        wallet_address = request.form.get('wallet_address')
        file = request.files.get('file')
        if not file or not wallet_address: return jsonify({"error": "파일이나 인증 정보가 없습니다."}), 400
        
        filename = file.filename.lower()
        raw_text = ""

        if filename.endswith('.pdf'):
            try:
                pdf_document = fitz.open(stream=file.read(), filetype="pdf")
                for page_num in range(len(pdf_document)):
                    page = pdf_document.load_page(page_num)
                    raw_text += page.get_text("text") + "\n\n"
                pdf_document.close()
            except Exception as pdf_e:
                return jsonify({"error": "PDF 파일 해독 중 오류가 발생했습니다."}), 500
        else:
            raw_text = file.read().decode('utf-8', errors='ignore')
        
        raw_text = re.sub(r'-\s*\d+\s*-', '', raw_text)
        raw_text = re.sub(r'【[^】]+】', '', raw_text)
        
        chunks = []
        current_chunk = ""
        paragraphs = re.split(r'\n\s*\n', raw_text)
        
        for para in paragraphs:
            para = para.strip()
            if not para: continue
            para = para.replace('\n', ' ') 
            current_chunk += para + "\n\n"
            if len(current_chunk) > 400:
                chunks.append(current_chunk.strip())
                current_chunk = ""
                
        if current_chunk.strip():
            chunks.append(current_chunk.strip())

        conn = get_db_connection()
        conn.execute("INSERT INTO pending_exams (wallet_address, filename, chunks_json) VALUES (?, ?, ?)",
                     (wallet_address, file.filename, json.dumps(chunks, ensure_ascii=False)))
        conn.commit()
        conn.close()
            
        return jsonify({"message": "대기열 DB 저장 완료"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@api_bp.route('/get-pending-exams', methods=['GET'])
def get_pending_exams():
    wallet_address = request.args.get('wallet_address')
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, filename, chunks_json FROM pending_exams WHERE wallet_address = ? ORDER BY id DESC", (wallet_address,))
    results = [{"id": r[0], "filename": r[1], "chunks": json.loads(r[2])} for r in cursor.fetchall()]
    conn.close()
    return jsonify(results)

@api_bp.route('/delete-pending-exam', methods=['POST'])
def delete_pending_exam():
    data = request.json
    conn = get_db_connection()
    conn.execute("DELETE FROM pending_exams WHERE id = ? AND wallet_address = ?", (data['id'], data['wallet_address']))
    conn.commit()
    conn.close()
    return jsonify({"message": "대기열에서 삭제 완료"})

@api_bp.route('/analyze-chunk', methods=['POST'])
def analyze_chunk():
    data = request.json
    chunk_text = data.get('chunk_text', '')
    
    prompt = f"""당신은 출제위원이자 국어 교열 전문가입니다.
아래 PDF 텍스트에서 1개의 객관식 문제, 4개의 보기, 정답, 해설을 명확히 분리하세요.
표나 복잡한 형식이 깨져있다면 문맥을 파악해 알맞은 문장으로 복원하세요.

[원본 텍스트]
{chunk_text}

[출력형식] 반드시 JSON 형식으로만 반환하세요.
{{
  "question": "교정된 문제 내용",
  "options": ["1. 보기", "2. 보기", "3. 보기", "4. 보기"],
  "answer": "정답 번호 (숫자만)",
  "explanation": "해설"
}}"""
    try:
        response_text = generate_gemini_json(prompt, temperature=0.1)
        result_data = json.loads(response_text)
        return jsonify({"result": result_data})
    except Exception as e:
        logging.error(f"제미나이 분석 에러:\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

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

@api_bp.route('/get-golden-exams', methods=['GET'])
def get_golden_exams():
    wallet_address = request.args.get('wallet_address')
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, question, options_json, answer, explanation FROM golden_exams WHERE wallet_address = ? ORDER BY id DESC", (wallet_address,))
    exams = [{"id": r[0], "title": r[1], "question": r[2], "options": json.loads(r[3] or "[]"), "answer": r[4], "explanation": r[5]} for r in cursor.fetchall()]
    conn.close()
    return jsonify({"exams": exams})

@api_bp.route('/get-cbt-session', methods=['GET'])
def get_cbt_session():
    wallet_address = request.args.get('wallet_address')
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, question, options_json, answer, explanation FROM golden_exams WHERE wallet_address = ?", (wallet_address,))
    rows = cursor.fetchall()
    conn.close()
    
    if not rows:
        return jsonify({"error": "골든 DB에 저장된 검수 완료 문제가 없습니다. 먼저 모의고사를 검수해주세요."}), 404
        
    problems = []
    for r in rows:
        problems.append({
            "id": r[0], "title": r[1], "question": r[2], 
            "options": json.loads(r[3] or "[]"), "answer": str(r[4]), "explanation": r[5]
        })
        
    selected = random.sample(problems, min(100, len(problems)))
    return jsonify(selected)

@api_bp.route('/generate-styles', methods=['POST'])
def generate_styles():
    data = request.json
    article_text = data.get('article_text', '')
    if not article_text: return jsonify({"error": "법령 텍스트가 없습니다."}), 400
        
    prompt = f"""당신은 승진시험 최고 출제위원장입니다. 아래 [법령 조문]을 바탕으로 서로 다른 10가지 스타일의 4지 선다 문제를 창작하세요.
[10가지 필수 출제 스타일]
1.단순목록형 2.NCS상황형 3.계산기한형 4.박스조합형 5.단서예외형 6.주체오답형 7.OX판별형 8.괄호형 9.취지추론형 10.융합형

[출력 지시사항] 반드시 JSON 배열 형식으로 10개를 출력하세요.
[{{ "style": "스타일 이름", "question": "문제 내용", "options": ["1. 보기", "2. 보기", "3. 보기", "4. 보기"], "answer": "숫자", "explanation": "해설" }}]

[법령 조문]\n{article_text}\n"""
    try:
        response_text = generate_gemini_json(prompt, temperature=0.5)
        result_data = json.loads(response_text)
        if isinstance(result_data, dict): result_data = result_data.get('problems', [result_data])
        return jsonify({"samples": result_data})
    except Exception as e:
        logging.error(f"10대 유형 생성 에러:\n{traceback.format_exc()}")
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
                cursor.execute("SELECT question, answer FROM golden_exams WHERE wallet_address = ? ORDER BY id DESC LIMIT 10", (wallet_address,))
                all_exams = "\n".join([f"Q:{r[0]} A:{r[1]}" for r in cursor.fetchall()])
                conn.close()
                
                prompt = f'''당신은 대한민국 법령 출제위원입니다. 
                아래 [기출 모의고사 DB]를 참고하여, 주어진 [법령 본문]에서 빈칸 문제로 내기 가장 좋은 핵심 단어(숫자, 기한, 명사 등) 딱 1개만 골라주세요.
                형식: JSON만 출력
                {{ "keyword": "추출한단어", "related_exam": "연관된 기출문제 내용 요약" }}
                [기출 모의고사 DB]:\n{all_exams}\n[법령 본문]:\n{content}'''
                
                response_text = generate_gemini_json(prompt)
                result = json.loads(response_text)
                
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
        for table in ['categories', 'cards', 'exams', 'ai_analysis', 'pending_exams', 'golden_exams']:
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
