from flask import Blueprint, request, jsonify
import sqlite3
import threading
import uuid
import json
import logging
import traceback
import os
import sys
import random
import re
import time
import requests
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

current_api_key_index = 0

# 💡 [핵심 수정] temperature 파라미터를 정상적으로 받도록 수정
def generate_ollama_json(prompt, model="qwen2.5-coder:14b", temperature=0.1):
    try:
        url = "http://localhost:11434/api/generate"
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {
                "temperature": temperature
            }
        }
        response = requests.post(url, json=payload, timeout=300)
        response.raise_for_status()
        return response.json().get("response", "{}")
    except Exception as e:
        print(f"\n[🔥 로컬 AI (Ollama) 통신 에러]\n{e}\n", file=sys.stderr, flush=True)
        raise e

def generate_gemini_json(prompt_or_contents, temperature=0.1):
    global current_api_key_index
    fallback_models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest']
    max_retries = len(GEMINI_API_KEYS) * len(fallback_models)
    
    contents = prompt_or_contents if isinstance(prompt_or_contents, list) else [prompt_or_contents]
    
    for attempt in range(max_retries):
        try:
            client = genai.Client(api_key=GEMINI_API_KEYS[current_api_key_index])
            current_model = fallback_models[attempt % len(fallback_models)]
            
            response = client.models.generate_content(
                model=current_model,
                contents=contents,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=temperature
                )
            )
            return response.text
            
        except Exception as e:
            error_msg = str(e).lower()
            if "429" in error_msg or "quota" in error_msg or "exhausted" in error_msg:
                print(f"⚠️ [API 진단] API 키 {current_api_key_index} 한도 초과! 다음 키로 전환합니다.", file=sys.stderr, flush=True)
                current_api_key_index = (current_api_key_index + 1) % len(GEMINI_API_KEYS)
            elif "503" in error_msg or "unavailable" in error_msg or "high demand" in error_msg:
                print(f"⚠️ [API 진단] 구글 서버({current_model}) 폭주(503). 우회합니다...", file=sys.stderr, flush=True)
                time.sleep(1)
            else:
                if attempt == max_retries - 1:
                    print(f"❌ [API 치명적 진단] 제미나이 최종 실패:\n{traceback.format_exc()}", file=sys.stderr, flush=True)
                    raise e
                time.sleep(1)
                
    raise Exception("🚨 구글 서버 불안정 또는 모든 API 키 한도 초과입니다.")

# 💡 [핵심 방어] 마크다운 찌꺼기 및 파싱 에러를 완벽히 차단하는 강력한 JSON 추출기
def clean_and_parse_json(response_text):
    try:
        text = response_text.strip()
        text = re.sub(r'^```json', '', text, flags=re.MULTILINE)
        text = re.sub(r'^```', '', text, flags=re.MULTILINE).strip()
        
        start_idx_arr = text.find('[')
        end_idx_arr = text.rfind(']')
        start_idx_obj = text.find('{')
        end_idx_obj = text.rfind('}')
        
        if start_idx_arr != -1 and end_idx_arr != -1 and (start_idx_obj == -1 or start_idx_arr < start_idx_obj):
            clean_text = text[start_idx_arr:end_idx_arr+1]
        elif start_idx_obj != -1 and end_idx_obj != -1:
            clean_text = text[start_idx_obj:end_idx_obj+1]
        else:
            clean_text = text
            
        return json.loads(clean_text)
    except Exception as e:
        print(f"JSON Parsing Error. Raw Text: {response_text}", file=sys.stderr)
        raise e

def init_golden_db():
    try:
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
        
        try: conn.execute('ALTER TABLE golden_exams ADD COLUMN search_process TEXT DEFAULT ""')
        except: pass
        try: conn.execute('ALTER TABLE golden_exams ADD COLUMN referenced_laws TEXT DEFAULT ""')
        except: pass

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"\n[🔥 DB 초기화 에러]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)

init_golden_db()

def extract_text_from_file(file_obj):
    if not file_obj: return ""
    if file_obj.filename.lower().endswith('.pdf'):
        try:
            doc = fitz.open(stream=file_obj.read(), filetype="pdf")
            text = "".join([page.get_text("text") for page in doc])
            doc.close()
            return text
        except:
            return ""
    else:
        return file_obj.read().decode('utf-8', errors='ignore')

@api_bp.route('/health', methods=['GET', 'OPTIONS'])
def health_check():
    return jsonify({"status": "alive"}), 200

@api_bp.route('/task-status')
def task_status():
    task_id = request.args.get('task_id')
    if task_id in TASK_STATUS:
        return jsonify(TASK_STATUS[task_id])
    return jsonify({"status": "not_found"}), 404

@api_bp.route('/delete-law-file', methods=['POST'])
def delete_law_file():
    try:
        data = request.json or {}
        folder_name = data.get('folder_name')
        wallet_address = data.get('wallet_address')
        
        if not folder_name or not wallet_address:
            return jsonify({"error": "삭제 권한이 없습니다."}), 400

        conn = get_db_connection()
        conn.execute("DELETE FROM categories WHERE folder_name = ? AND wallet_address = ?", (folder_name, wallet_address))
        conn.commit()
        conn.close()
        return jsonify({"message": "법령 파일 삭제 완료"})
    except Exception as e:
        print(f"\n[🔥 법령 파일 삭제 에러]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
        return jsonify({"error": str(e)}), 500

@api_bp.route('/generate-rag-from-pending', methods=['POST'])
def generate_rag_from_pending():
    try:
        data = request.json or {}
        pending_id = data.get('id')
        wallet_address = data.get('wallet_address')
        selected_laws = data.get('selected_laws', [])

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT filename, chunks_json FROM pending_exams WHERE id = ? AND wallet_address = ?", (pending_id, wallet_address))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return jsonify({"error": "대기열에서 모의고사를 찾을 수 없습니다."}), 404

        filename = row[0]
        chunks = json.loads(row[1])
        raw_text = "\n\n".join(chunks)

        if selected_laws:
            placeholders = ','.join('?' for _ in selected_laws)
            query = f"SELECT folder_name, title, content FROM categories WHERE wallet_address = ? AND folder_name IN ({placeholders})"
            cursor.execute(query, [wallet_address] + selected_laws)
        else:
            cursor.execute("SELECT folder_name, title, content FROM categories WHERE wallet_address = ? AND 1=0", (wallet_address,))
        
        laws = cursor.fetchall()
        conn.close()

        law_context = "등록된 참고 자료가 없습니다."
        if laws:
            law_context = "\n\n".join([f"[{r[0]} - {r[1]}]\n{r[2]}" for r in laws])

        print(f"\n🔍 [RAG 시스템] '{filename}' 자동생성 시작! (참고 자료: {len(selected_laws)}개 문서, 총 {len(laws)}개 조항)\n", file=sys.stderr, flush=True)

        task_id = str(uuid.uuid4())
        TASK_STATUS[task_id] = {"status": "running", "progress": 20, "message": "AI가 문제를 법령과 대조하여 분석 중..."}

        def process_rag_pending():
            try:
                prompt = f'''당신은 승진시험 출제위원이자 사용자와 대화하는 보조 학습 AI입니다.
                아래 [참고 자료 DB]를 철저히 검색하여 사용자의 [시험지 텍스트]를 분석하세요.

                [절대 규칙: 대화형 파트너십 및 환각 금지]
                1. 오직 제공된 [참고 자료 DB] 안의 텍스트만 근거로 삼으세요.
                2. DB에서 내용이 부족하다면 억지로 지어내지 마세요.
                3. 모르는 부분은 "이 부분은 찾을 수 없는데 어디서 찾을까요?", "내용이 조금 애매한데 어떻게 판단해야 될까요?" 라고 `explanation` 필드에 질문하세요.

                [참고 자료 DB]
                {law_context[:35000]}

                [시험지 텍스트]
                {raw_text[:10000]}

                [출력 지시사항] 반드시 JSON 배열 형식으로만 출력하세요.
                [{{ 
                    "question": "문제 내용 및 보기 전체", 
                    "answer": "정답 번호 (모를 경우 '확인 필요')", 
                    "explanation": "해석 내용 (모를 경우 사용자에게 친근하게 질문 작성)",
                    "search_process": "AI의 논리적 사고 과정",
                    "referenced_laws": "참고한 문서명과 조항"
                }}]'''

                response_text = generate_gemini_json(prompt)
                exam_data = clean_and_parse_json(response_text)

                conn2 = get_db_connection()
                cursor2 = conn2.cursor()
                for item in exam_data:
                    cursor2.execute('''INSERT INTO golden_exams 
                        (wallet_address, title, question, answer, explanation, search_process, referenced_laws) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)''',
                        (wallet_address, filename, item.get('question', ''), item.get('answer', ''), item.get('explanation', ''), 
                         item.get('search_process', ''), item.get('referenced_laws', '')))
                
                cursor2.execute("DELETE FROM pending_exams WHERE id = ? AND wallet_address = ?", (pending_id, wallet_address))
                conn2.commit()
                conn2.close()

                TASK_STATUS[task_id].update({"progress": 100, "status": "completed", "message": f"{len(exam_data)}개의 문항 분석 완료."})
            except Exception as e:
                print(f"\n[🔥 지능형 해설 스레드 에러]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
                TASK_STATUS[task_id].update({"status": "error", "message": "JSON 파싱 에러 (AI 응답 형식 오류)"})

        threading.Thread(target=process_rag_pending).start()
        return jsonify({"task_id": task_id, "message": "분석 시작"})

    except Exception as e:
        print(f"\n[🔥 라우터 진입 에러]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
        return jsonify({"error": str(e)}), 500

@api_bp.route('/upload-exam', methods=['POST'])
def upload_exam():
    return jsonify({"error": "이 라우터는 더 이상 사용되지 않습니다."}), 400

@api_bp.route('/delete-exam', methods=['POST'])
def delete_exam():
    try:
        data = request.json or {}
        exam_id = data.get('id')
        wallet_address = data.get('wallet_address')
        
        if not exam_id or not wallet_address: return jsonify({"error": "삭제 권한이 없습니다."}), 400
            
        conn = get_db_connection()
        conn.execute("DELETE FROM exams WHERE id = ? AND wallet_address = ?", (exam_id, wallet_address))
        conn.execute("DELETE FROM golden_exams WHERE id = ? AND wallet_address = ?", (exam_id, wallet_address))
        conn.commit()
        conn.close()
        return jsonify({"message": "해당 문제가 삭제되었습니다."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@api_bp.route('/delete-pending-exam', methods=['POST'])
def delete_pending_exam():
    try:
        data = request.json or {}
        pending_id = data.get('id')
        wallet_address = data.get('wallet_address')
        
        if not pending_id or not wallet_address: return jsonify({"error": "권한 없음"}), 400

        conn = get_db_connection()
        conn.execute("DELETE FROM pending_exams WHERE id = ? AND wallet_address = ?", (pending_id, wallet_address))
        conn.commit()
        conn.close()
        return jsonify({"message": "대기열에서 삭제 완료"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@api_bp.route('/upload-exam-coop', methods=['POST'])
def upload_exam_coop():
    try:
        wallet_address = request.form.get('wallet_address')
        exam_file = request.files.get('exam_file')
        answer_file = request.files.get('answer_file')
        
        if not exam_file or not wallet_address: return jsonify({"error": "문제 파일이나 인증 정보가 없습니다."}), 400
        
        filename = exam_file.filename.lower()
        exam_text = extract_text_from_file(exam_file)
        answer_text = extract_text_from_file(answer_file)
        
        exam_text = re.sub(r'-\s*\d+\s*-', '', exam_text)
        exam_text = re.sub(r'【[^】]+】', '', exam_text)
        
        if answer_text:
            exam_text += "\n\n[정답 및 해설지 참고]\n" + answer_text
            
        chunks = re.split(r'(?m)^(?=\s*\d+\.\s)', exam_text)
        valid_chunks = [c.strip() for c in chunks if c.strip() and len(c.strip()) > 10]

        conn = get_db_connection()
        conn.execute("INSERT INTO pending_exams (wallet_address, filename, chunks_json) VALUES (?, ?, ?)",
                     (wallet_address, exam_file.filename, json.dumps(valid_chunks, ensure_ascii=False)))
        conn.commit()
        conn.close()
            
        return jsonify({"message": "대기열 DB 저장 완료"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@api_bp.route('/get-pending-exams', methods=['GET'])
def get_pending_exams():
    try:
        wallet_address = request.args.get('wallet_address')
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, filename, chunks_json FROM pending_exams WHERE wallet_address = ? ORDER BY id DESC", (wallet_address,))
        results = [{"id": r[0], "filename": r[1], "chunks": json.loads(r[2])} for r in cursor.fetchall()]
        conn.close()
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# 💡 [핵심 수정] 로컬 AI 호출 시 2중 방어벽 구축 및 Gemini 자동 우회 탑재
@api_bp.route('/analyze-chunk', methods=['POST'])
def analyze_chunk():
    try:
        data = request.json
        chunk_text = data.get('chunk_text', '')
        wallet_address = data.get('wallet_address')
        user_feedback = data.get('user_feedback', '') 
        selected_laws = data.get('selected_laws', [])

        conn = get_db_connection()
        cursor = conn.cursor()
        if selected_laws:
            placeholders = ','.join('?' for _ in selected_laws)
            query = f"SELECT folder_name, title, content FROM categories WHERE wallet_address = ? AND folder_name IN ({placeholders})"
            cursor.execute(query, [wallet_address] + selected_laws)
        else:
            cursor.execute("SELECT folder_name, title, content FROM categories WHERE wallet_address = ? AND 1=0", (wallet_address,))
            
        laws = cursor.fetchall()
        conn.close()

        law_context = "선택된 참고 자료가 없습니다."
        if laws: law_context = "\n\n".join([f"[{r[0]} - {r[1]}]\n{r[2]}" for r in laws])
        
        feedback_str = f"\n[👨‍💻 사용자 피드백(대화/힌트)]\n{user_feedback}\n-> 위 사용자의 피드백을 적극 반영하여 다시 분석하고 해설과 장기기억을 완성하세요.\n" if user_feedback else ""

        prompt = f"""당신은 출제위원이자 사용자와 소통하는 AI입니다.
        [절대 규칙: 대화형 파트너십 및 환각 금지]
        1. 오직 [참고 자료 DB]만 확인하세요. 
        2. 자료가 부족하거나 내용이 애매할 경우, 억지로 정답을 만들지 마세요. 대신 "이 부분은 찾을 수 없는데 어디서 찾을까요?"라고 사용자에게 `explanation` 필드를 통해 질문하세요.
        3. 사용자가 [사용자 피드백]을 주었다면, 그 힌트를 바탕으로 내용을 올바르게 수정하세요!

        [참고 자료 DB]
        {law_context[:8000]}

        [시험지 원문]
        {chunk_text}
        {feedback_str}

        [출력형식] 반드시 JSON 단일 객체 형식으로만 반환하세요. 속성은 반드시 영문이어야 합니다.
        {{
          "question": "교정된 문제 내용",
          "options": ["1. 보기", "2. 보기", "3. 보기", "4. 보기"],
          "answer": "정답 번호 (또는 '확인 필요')",
          "explanation": "상세 해설 (또는 사용자에게 질문을 작성)",
          "search_process": "AI의 논리적 사고과정 (장기기억)"
        }}"""
        
        print(f"🤖 [로컬 AI 가동] 문단을 분석합니다...", file=sys.stderr, flush=True)
        
        # 💡 Ollama 실패 시 Gemini로 안전하게 우회
        try:
            response_text = generate_ollama_json(prompt, temperature=0.2)
            result_data = clean_and_parse_json(response_text)
        except Exception as ollama_e:
            print(f"⚠️ 로컬 AI 분석 실패, Gemini 2.5로 신속히 우회합니다: {ollama_e}", file=sys.stderr, flush=True)
            response_text = generate_gemini_json(prompt, temperature=0.2)
            result_data = clean_and_parse_json(response_text)
            
        # 만약 배열로 응답했다면 첫 번째 객체를 뽑아서 보냅니다.
        if isinstance(result_data, list) and len(result_data) > 0:
            result_data = result_data[0]
            
        return jsonify({"result": result_data})
    except Exception as e:
        print(f"\n[🔥 문단 분석 에러]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
        return jsonify({"error": str(e)}), 500

@api_bp.route('/save-golden-exam', methods=['POST'])
def save_golden_exam():
    try:
        data = request.json
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''INSERT INTO golden_exams 
            (wallet_address, title, question, options_json, answer, explanation, category, search_process, referenced_laws) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (data.get('wallet_address'), data.get('title'), data.get('question'), 
             json.dumps(data.get('options', []), ensure_ascii=False), 
             data.get('answer'), data.get('explanation'), data.get('category', '기본분류'),
             data.get('search_process', ''), data.get('referenced_laws', '')))
        conn.commit()
        conn.close()
        return jsonify({"message": "골든 DB 저장 완료!"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@api_bp.route('/get-golden-exams', methods=['GET'])
def get_golden_exams():
    try:
        wallet_address = request.args.get('wallet_address')
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, title, question, options_json, answer, explanation, search_process, referenced_laws FROM golden_exams WHERE wallet_address = ? ORDER BY id DESC", (wallet_address,))
        
        exams = []
        for r in cursor.fetchall():
            exams.append({
                "id": r[0], "title": r[1], "question": r[2], 
                "options": json.loads(r[3] or "[]"), "answer": r[4], 
                "explanation": r[5], "search_process": r[6], "referenced_laws": r[7]
            })
        conn.close()
        return jsonify({"exams": exams})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@api_bp.route('/get-cbt-session', methods=['GET'])
def get_cbt_session():
    try:
        wallet_address = request.args.get('wallet_address')
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, title, question, options_json, answer, explanation FROM golden_exams WHERE wallet_address = ?", (wallet_address,))
        rows = cursor.fetchall()
        conn.close()
        
        if not rows:
            return jsonify({"error": "골든 DB에 저장된 문제가 없습니다."}), 404
            
        problems = []
        for r in rows:
            problems.append({
                "id": r[0], "title": r[1], "question": r[2], 
                "options": json.loads(r[3] or "[]"), "answer": str(r[4]), "explanation": r[5]
            })
            
        selected = random.sample(problems, min(100, len(problems)))
        return jsonify(selected)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

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
        return jsonify({"message": f"일괄 동기화 성공"}), 200
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
