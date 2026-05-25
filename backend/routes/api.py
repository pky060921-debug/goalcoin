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
import subprocess
import ast
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
# 💡 GOAL 코인 발행 (Sui Blockchain 연동)
# ==========================================
SUI_PACKAGE_ID = "YOUR_PACKAGE_ID_HERE"
SUI_TREASURY_CAP_ID = "YOUR_TREASURY_CAP_ID_HERE"

def mint_goal_coin_to_user(wallet_address, amount=10):
    if SUI_PACKAGE_ID == "YOUR_PACKAGE_ID_HERE":
        logging.warning("⚠️ 스마트 컨트랙트 ID 미설정: Goalcoin 지급이 생략됩니다.")
        return False
        
    try:
        raw_amount = str(amount * 1000000000) # Decimals 9
        cmd = [
            "sui", "client", "call", 
            "--package", SUI_PACKAGE_ID,
            "--module", "goal", 
            "--function", "mint_reward",
            "--args", SUI_TREASURY_CAP_ID, raw_amount, wallet_address,
            "--gas-budget", "50000000",
            "--json"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            logging.info(f"🪙 {wallet_address} 에게 {amount} GOAL 지급 완료!")
            return True
        else:
            logging.error(f"❌ GOAL 지급 실패: {result.stderr}")
            return False
    except Exception as e:
        logging.error(f"❌ 코인 발행 에러: {str(e)}")
        return False

# ==========================================
# 💡 로컬 AI (Ollama) 고도화 엔진
# ==========================================
current_api_key_index = 0

def generate_ollama_json(prompt, model="gemma4:26b", temperature=0.1):
    try:
        url = "http://localhost:11434/api/generate"
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {
                "temperature": temperature,
                "num_ctx": 16384,      # 16K Context Window
                "num_predict": 1024,
                "top_k": 40,           
                "top_p": 0.9,
                "repeat_penalty": 1.15 
            }
        }
        response = requests.post(url, json=payload, timeout=300)
        response.raise_for_status()
        return response.json().get("response", "{}")
    except Exception as e:
        print(f"\n[🔥 로컬 AI (Ollama) 통신 에러]\n{e}\n", file=sys.stderr, flush=True)
        raise e

# ==========================================
# 💡 제미나이 무한 동력 & 우회(Fallback) 엔진
# ==========================================
def generate_gemini_json(prompt_or_contents, temperature=0.1):
    global current_api_key_index
    if not GEMINI_API_KEYS or GEMINI_API_KEYS[0].startswith("AIzaSyA_YOUR_GEMINI_KEY"):
        return '{"error": "API 키가 올바르지 않습니다."}'

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
            
        clean_text = clean_text.replace('\n', '\\n').replace('\r', '')
        
        try:
            return json.loads(clean_text)
        except json.decoder.JSONDecodeError:
            try:
                python_dict = ast.literal_eval(clean_text.replace('\\n', '\n'))
                return json.loads(json.dumps(python_dict))
            except Exception as ast_e:
                fixed_text = re.sub(r"([{,]\s*)'([^']+)'(\s*:)", r'\1"\2"\3', clean_text)
                return json.loads(fixed_text)
    except Exception as e:
        print(f"JSON Parsing Error. Raw Text: {response_text}", file=sys.stderr)
        raise e

# ==========================================
# 💡 DB 초기화 (user_settings 포함)
# ==========================================
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
        conn.execute('''CREATE TABLE IF NOT EXISTS user_settings (
            wallet_address TEXT PRIMARY KEY,
            custom_stopwords TEXT
        )''')
        
        try: conn.execute('ALTER TABLE golden_exams ADD COLUMN search_process TEXT DEFAULT ""')
        except: pass
        try: conn.execute('ALTER TABLE golden_exams ADD COLUMN referenced_laws TEXT DEFAULT ""')
        except: pass
        try: conn.execute('ALTER TABLE categories ADD COLUMN folder_name TEXT DEFAULT "기본 폴더"')
        except: pass
        try: conn.execute('ALTER TABLE cards ADD COLUMN folder_name TEXT DEFAULT "기본 폴더"')
        except: pass
        try: conn.execute('ALTER TABLE cards ADD COLUMN memo TEXT DEFAULT ""')
        except: pass
        try: conn.execute('ALTER TABLE cards ADD COLUMN best_time REAL DEFAULT 999.0')
        except: pass
        try: conn.execute('ALTER TABLE user_settings ADD COLUMN ai_rules TEXT DEFAULT ""')
        except: pass
            
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"\n[🔥 DB 초기화 에러]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)

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
# 💡 폴더 및 파일 관리 라우터
# ==========================================
@api_bp.route('/delete-law-file', methods=['POST'])
def delete_law_file():
    try:
        data = request.json or {}
        folder_name = data.get('folder_name')
        wallet_address = data.get('wallet_address')
        if not folder_name or not wallet_address: return jsonify({"error": "삭제 권한이 없습니다."}), 400

        conn = get_db_connection()
        conn.execute("DELETE FROM categories WHERE folder_name = ? AND wallet_address = ?", (folder_name, wallet_address))
        conn.commit()
        conn.close()
        return jsonify({"message": "법령 파일 삭제 완료"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@api_bp.route('/delete-folder', methods=['POST'])
def delete_folder():
    return delete_law_file()

@api_bp.route('/rename-folder', methods=['POST'])
def rename_folder():
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        old_folder_name = data.get('old_folder_name')
        new_folder_name = data.get('new_folder_name')
        if not wallet_address or not old_folder_name: return jsonify({"error": "정보 누락"}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE categories SET folder_name = ? WHERE wallet_address = ? AND folder_name = ?", (new_folder_name, wallet_address, old_folder_name))
        conn.commit()
        conn.close()
        return jsonify({"message": "폴더명 변경 완료"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@api_bp.route('/update-category-folder', methods=['POST'])
def update_category_folder():
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        cat_id = data.get('id')
        new_folder_name = data.get('new_folder_name')
        if not wallet_address or not cat_id: return jsonify({"error": "정보 누락"}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE categories SET folder_name = ? WHERE id = ? AND wallet_address = ?", (new_folder_name, cat_id, wallet_address))
        conn.commit()
        conn.close()
        return jsonify({"message": "폴더 이동 완료"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ==========================================
# 💡 텍스트 추출 및 정답(빨간색) 자동 감지 엔진
# ==========================================
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

def extract_exam_text_with_color(file_obj, is_answer=False):
    if not file_obj: return ""
    if file_obj.filename.lower().endswith('.pdf'):
        try:
            doc = fitz.open(stream=file_obj.read(), filetype="pdf")
            full_text = ""
            for page in doc:
                if is_answer:
                    dict_data = page.get_text("dict")
                    for block in dict_data.get("blocks", []):
                        if "lines" in block:
                            for line in block["lines"]:
                                for span in line["spans"]:
                                    text = span.get("text", "")
                                    color = span.get("color", 0)
                                    r = (color >> 16) & 0xFF
                                    g = (color >> 8) & 0xFF
                                    b = color & 0xFF
                                    if r > 130 and r > g * 1.5 and r > b * 1.5:
                                        full_text += f" [🔴정답: {text}] "
                                    else:
                                        full_text += text
                                full_text += "\n"
                else:
                    full_text += page.get_text("text") + "\n"
            doc.close()
            return full_text
        except Exception as e:
            return ""
    else:
        return file_obj.read().decode('utf-8', errors='ignore')

# ==========================================
# 💡 파이썬 스나이퍼 DB 검색 엔진
# ==========================================
def get_top_k_relevant_laws(query_text, laws, top_k=5):
    try:
        article_matches = set(re.findall(r'(?:제)?\s*\d+\s*조(?:의\s*\d+)?', query_text))
        clean_article_matches = [re.sub(r'[제\s]', '', a) for a in article_matches] 
        
        scored_laws = []
        for folder, title, content in laws:
            score = 0
            clean_title = re.sub(r'[제\s]', '', title) 
            
            if clean_title in clean_article_matches:
                score += 1000
                if '정관' in query_text and '정관' in folder:
                    score += 500
                elif '법' in query_text and '건강보험법' in folder:
                    score += 500

            content_words = set(re.findall(r'\b[가-힣]{2,}\b', content))
            query_words = set(re.findall(r'\b[가-힣]{2,}\b', query_text))
            overlap = query_words.intersection(content_words)
            score += len(overlap)
            
            if score > 0:
                scored_laws.append((score, folder, title, content))
            
        scored_laws.sort(key=lambda x: x[0], reverse=True)
        top_laws = scored_laws[:top_k]
        
        if not top_laws:
            return "\n\n".join([f"📖 [문서명: {r[0]} | 조항명: {r[1]}]\n{r[2]}" for r in laws[:top_k]])
        return "\n\n".join([f"📖 [문서명: {law[1]} | 조항명: {law[2]}]\n{law[3]}" for law in top_laws])
    except Exception as e:
        print(f"[🔥 RAG 검색 엔진 에러]\n{traceback.format_exc()}", file=sys.stderr)
        return ""

# ==========================================
# 💡 RAG 시스템 및 모의고사 분석
# ==========================================
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

        if selected_laws and len(selected_laws) > 0:
            placeholders = ','.join('?' for _ in selected_laws)
            query = f"SELECT folder_name, title, content FROM categories WHERE wallet_address = ? AND folder_name IN ({placeholders})"
            cursor.execute(query, [wallet_address] + selected_laws)
        else:
            cursor.execute("SELECT folder_name, title, content FROM categories WHERE wallet_address = ?", (wallet_address,))
        
        laws = cursor.fetchall()
        conn.close()

        law_context = "저장된 참고 DB 자료가 없습니다."
        if laws:
            full_context = "\n\n".join([f"[{r[0]} - {r[1]}]\n{r[2]}" for r in laws])
            law_context = full_context[:12000]

        print(f"\n🔍 [RAG 시스템] '{filename}' 자동생성 시작!\n", file=sys.stderr, flush=True)

        task_id = str(uuid.uuid4())
        TASK_STATUS[task_id] = {"status": "running", "progress": 20, "message": "AI가 문제를 법령과 대조하여 분석 중..."}

        def process_rag_pending():
            try:
                prompt = f'''당신은 승진시험 출제위원이자 사용자와 대화하는 보조 학습 AI입니다.
                아래 [참고 자료 DB]를 철저히 검색하여 사용자의 [시험지 텍스트]를 분석하세요.

                [절대 규칙]
                1. 오직 제공된 [참고 자료 DB] 안의 텍스트만 근거로 삼으세요.
                2. DB에서 내용이 부족하다면 억지로 지어내지 마세요.
                3. 반드시 아래 JSON 규격에 맞게 배열(Array) 형식으로 출력하세요.

                [참고 자료 DB]
                {law_context}

                [시험지 텍스트]
                {raw_text[:3000]}

                [출력 JSON 규격]
                [
                  {{ 
                      "question": "문제 1 내용", 
                      "answer": "정답 1 번호", 
                      "explanation": "해설 1 내용",
                      "search_process": "논리적 과정 1",
                      "referenced_laws": "참고 조항 1"
                  }}
                ]'''

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
        exam_text = extract_exam_text_with_color(exam_file, is_answer=False)
        answer_text = extract_exam_text_with_color(answer_file, is_answer=True)
        
        exam_text = re.sub(r'-\s*\d+\s*-', '', exam_text)
        exam_text = re.sub(r'【[^】]+】', '', exam_text)
        
        if answer_text:
            exam_text += "\n\n[정답 및 해설지 참고 (빨간색 텍스트는 🔴정답으로 표시됨)]\n" + answer_text
            
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


@api_bp.route('/analyze-chunk', methods=['POST'])
def analyze_chunk():
    try:
        data = request.json
        chunk_text = data.get('chunk_text', '')
        wallet_address = data.get('wallet_address')
        user_feedback = data.get('user_feedback', '') 
        chat_history = data.get('chat_history', []) 

        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 1. 💡 장기기억(판별 규칙) 불러오기
        cursor.execute("SELECT ai_rules FROM user_settings WHERE wallet_address = ?", (wallet_address,))
        rule_row = cursor.fetchone()
        ai_memory = rule_row[0] if rule_row and rule_row[0] else "아직 저장된 특별한 판별 규칙이 없습니다."

        # 2. 💡 전체 법령 DB(categories) 무조건 검색
        cursor.execute("SELECT folder_name, title, content FROM categories WHERE wallet_address = ?", (wallet_address,))
        laws = cursor.fetchall()
        conn.close()

        # 사용자가 질문한 내용(예: "제1조 검색해줘")을 기반으로 스나이퍼 검색
        search_query = chunk_text + " " + user_feedback
        law_context = get_top_k_relevant_laws(search_query, laws, top_k=3) if laws else "참고 자료가 없습니다."
        
        history_str = ""
        for msg in chat_history[-6:]:  
            sender_name = "사용자" if msg['sender'] == 'user' else "AI"
            history_str += f"\n[{sender_name}]: {msg['text']}"

        # 3. 💡 O/X 판별 특화 프롬프트
        prompt = f"""당신은 출제위원이자 법령 대조 전문 AI입니다.

        [대화형 튜터 절대 규칙 🚨]
        1. 사용자가 특정 법조항명(예: "법 제1조")을 언급하면 [참고 자료 DB]에서 해당 원문을 정확히 찾으세요.
        2. 원문과 [현재 지문]을 대조하여 내용이 일치하는지, 혹은 교묘하게 틀리게 출제되었는지 분석하세요.
        3. `chat_message` 필드에는 반드시 아래 형식을 지켜서 답변하세요:
           - 첫 줄: "[대조 결과: O]" 또는 "[대조 결과: X]"
           - 둘째 줄부터: "원문은 [~~]라고 되어 있으나, 지문은 [~~]라고 되어 있어 일치합니다/틀립니다."
        4. 아래 [AI 장기기억]에 사용자가 주입한 팁이나 규칙이 있다면 무조건 우선 적용하여 판단하세요.

        [AI 장기기억 (사용자 주입 규칙)]
        {ai_memory}

        [참고 자료 DB]
        {law_context}

        [현재 지문]
        {chunk_text}
        
        [이전 대화]
        {history_str}
        
        [사용자 질문]
        {user_feedback}

        [출력형식] 반드시 JSON 단일 객체로 반환. (줄바꿈은 \\n 사용)
        {{
          "question": "시험지 원문 텍스트 유지",
          "options": ["1. 보기", "2. 보기", "3. 보기", "4. 보기", "5. 보기"],
          "answer": "정답 번호 (모르면 '확인 필요')",
          "chat_message": "[대조 결과: O/X]\\n상세 대조 브리핑...",
          "explanation": "해설 요약"
        }}"""
        
        print(f"🤖 [초고속 대화형 AI 가동] 응답 생성 중...", file=sys.stderr, flush=True)
        
        # 이전 답변에서 안내해 드린 '무적의 JSON 파서' 사용
        response_text = generate_ollama_json(prompt, temperature=0.1)
        result_data = clean_and_parse_json(response_text)
            
        if isinstance(result_data, list) and len(result_data) > 0:
            result_data = result_data[0]
            
        return jsonify({"result": result_data})
    except Exception as e:
        print(f"\n[🔥 문단 분석 에러 진단]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
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

# ==========================================
# 💡 대표님의 완벽한 PDF 파서 등 기존 기능 100% 보존 구역
# ==========================================
@api_bp.route('/upload-pdf', methods=['POST'])
def upload_pdf():
    file = request.files.get('file')
    wallet_address = request.form.get('wallet_address')
    if not file or not wallet_address:
        return jsonify({"error": "파일 또는 지갑 주소 누락"}), 400

    task_id = str(uuid.uuid4())
    TASK_STATUS[task_id] = "처리 중..."
    
    original_filename = file.filename if file else "일반 규정"
    folder_name = re.sub(r'\.(pdf|txt)$', '', original_filename, flags=re.IGNORECASE)

# === [api.py 내의 process_file 함수 내부 저장 구역 수정] ===
    def process_file():
        try:
            raw_text = ""
            if original_filename.lower().endswith(('.txt', '.html', '.htm')):
                file_bytes = file.read()
                try: raw_text = file_bytes.decode('utf-8')
                except UnicodeDecodeError: raw_text = file_bytes.decode('cp949', errors='ignore')
            else:
                doc = fitz.open(stream=file.read(), filetype="pdf")
                for page in doc: raw_text += page.get_text()
            
            raw_text = re.sub(r'[<〈]\s*(?:신설|개정|삭제|단서신설|전문개정|본조신설|일부개정)[\s\S]*?[>〉]', '', raw_text)
            raw_text = re.sub(r'[\[［【]\s*(?:전문개정|본조신설|제목개정|종전제\d+조는|제\d+조에서 이동)[\s\S]*?[\]］】]', '', raw_text)
        
            cleaned_text = clean_korean_law_text(raw_text)
            blocks = parse_html_3col_law(cleaned_text)
            
            if not blocks or len(blocks) < 3:
                logging.info(f"[{folder_name}] 일반 문서 파서로 정밀 분석을 시작합니다.")
                blocks = []
                
                pattern = r'(?m)^ *(제\s*\d+\s*조(?:의\s*\d+)?)'
                parts = re.split(pattern, raw_text)
                
                if len(parts) >= 3:
                    for i in range(1, len(parts), 2):
                        article_num = parts[i].strip()
                        content_body = parts[i+1].strip() if i+1 < len(parts) else ""
                        
                        match = re.match(r'^(\s*\(.*?\))', content_body)
                        full_title = f"{article_num} {match.group(1).strip()}" if match else article_num
                        clean_body = re.sub(r'\n{2,}', '\n', content_body).strip()
                        
                        blocks.append({"title": full_title, "content": f"{full_title}\n{clean_body}"})
                else:
                    paragraphs = [p.strip() for p in raw_text.split('\n\n') if len(p.strip()) > 30]
                    for idx, p in enumerate(paragraphs):
                        blocks.append({"title": f"문서 조각 {idx+1}", "content": p})
            
            # 💡 [여기서부터 수정 추가] 장별 폴더명을 안전하게 반영하도록 교체합니다.
            conn = get_db_connection()
            cursor = conn.cursor()
            for block in blocks:
                # 파서가 전달해 준 폴더명(folder_name)이 존재하면 그것을 쓰고, 
                # 일반 문서 파서 등으로 인해 없을 때만 상위의 기본 folder_name(파일명 등)을 사용합니다.
                block_folder = block.get('folder_name', folder_name)
                
                cursor.execute(
                    "INSERT INTO categories (wallet_address, title, content, folder_name) VALUES (?, ?, ?, ?)", 
                    (wallet_address, block['title'], block['content'], block_folder)
                )
            conn.commit()
            conn.close()
            # 💡 [여기까지 수정 추가끝]
            
            TASK_STATUS[task_id] = "완료"
        except Exception as e:
            logging.error(f"분석 에러: {traceback.format_exc()}")
            TASK_STATUS[task_id] = f"에러: {str(e)}"

    # [기존 스레드 및 리턴 로직 유지]
    threading.Thread(target=process_file).start()
    return jsonify({"message": f"{folder_name} 분석 시작", "task_id": task_id})
    
@api_bp.route('/get-categories')
def get_categories():
    try:
        wallet_address = request.args.get('wallet_address')
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, title, content, folder_name FROM categories WHERE wallet_address = ? ORDER BY id ASC", (wallet_address,))
        cats = [{"id": r[0], "title": r[1], "content": r[2], "folder_name": r[3]} for r in cursor.fetchall()]
        conn.close()
        return jsonify({"categories": cats})
    except Exception as e:
        return jsonify({"error": "조회 실패"}), 500

@api_bp.route('/split-category', methods=['POST'])
def split_category():
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        cat_id = data.get('id')
        text1, text2 = data.get('text1'), data.get('text2')
        title1, title2 = data.get('title1'), data.get('title2')
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
        # 💡 title 컬럼 없이 기본 데이터만 INSERT 합니다.
        cursor.execute('''INSERT INTO cards (wallet_address, category_id, card_content, answer_text, options_json, level, next_review_time, status, best_time, folder_name, memo) 
                          VALUES (?, ?, ?, ?, ?, 0, ?, 'OWNED', NULL, ?, ?)''', 
                          (wallet_address, 0, card_content, answer_text, '[]', get_next_review_time(0), folder_name, memo))
        conn.commit()
        conn.close()
        return jsonify({"message": "카드 저장 완료"}), 200
    except Exception as e:
        return jsonify({"error": "저장 실패"}), 500

@api_bp.route('/my-cards')
def get_my_cards():
    try:
        wallet_address = request.args.get('wallet_address')
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, card_content, answer_text, options_json, level, next_review_time, status, best_time, folder_name, memo FROM cards WHERE wallet_address = ? ORDER BY id DESC", (wallet_address,))
        cards = [{"id": r[0], "content": r[1], "answer": r[2], "options": json.loads(r[3]), "level": r[4], "next_review_time": r[5], "status": r[6], "best_time": r[7], "folder_name": r[8], "memo": r[9] or ""} for r in cursor.fetchall()]
        conn.close()
        return jsonify({"cards": cards})
    except Exception as e:
        return jsonify({"error": "조회 실패"}), 500

@api_bp.route('/delete-category', methods=['POST'])
def delete_category():
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        cat_id = data.get('id')
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM categories WHERE id = ? AND wallet_address = ?", (cat_id, wallet_address))
        conn.commit()
        conn.close()
        return jsonify({"message": "삭제 완료"})
    except Exception as e:
        return jsonify({"error": "삭제 실패"}), 500

@api_bp.route('/delete-card', methods=['POST'])
def delete_card():
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        card_id = data.get('id')
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM cards WHERE id = ? AND wallet_address = ?", (card_id, wallet_address))
        conn.commit()
        conn.close()
        return jsonify({"message": "삭제 완료"})
    except Exception as e:
        return jsonify({"error": "삭제 실패"}), 500

@api_bp.route('/delete-all', methods=['POST'])
def delete_all():
    try:
        wallet_address = request.json.get('wallet_address')
        conn = get_db_connection()
        cursor = conn.cursor()
        for table in ['categories', 'cards', 'exams', 'pending_exams', 'golden_exams']:
            cursor.execute(f"DELETE FROM {table} WHERE wallet_address = ?", (wallet_address,))
        conn.commit()
        conn.close()
        return jsonify({"message": "초기화 성공"})
    except Exception as e:
        return jsonify({"error": "초기화 실패"}), 500

@api_bp.route('/sync-batch', methods=['POST'])
def sync_batch():
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        memos = data.get('memos', [])
        answers = data.get('answers', [])
        
        if not wallet_address: return jsonify({"error": "인증 정보 없음"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        for m in memos:
            cursor.execute("UPDATE cards SET memo = ? WHERE id = ? AND wallet_address = ?", (m.get('memo', ''), m.get('id'), wallet_address))

        reward_coins = 0 

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
                    reward_coins += 10 
                else:
                    cursor.execute("UPDATE cards SET level = 0, next_review_time = ?, status = 'AT_RISK' WHERE id = ?", (get_next_review_time(0), card_id))

        conn.commit()
        conn.close()

        if reward_coins > 0:
            threading.Thread(target=mint_goal_coin_to_user, args=(wallet_address, reward_coins)).start()

        return jsonify({"message": f"동기화 완료 (지급예정 GOAL: {reward_coins})"}), 200
    except Exception as e:
        return jsonify({"error": "배치 동기화 실패"}), 500

@api_bp.route('/submit-answer', methods=['POST'])
def submit_answer():
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        card_id = data.get('card_id')
        is_correct = data.get('is_correct')
        try: clear_time = float(data.get('clear_time', 999.0))
        except: clear_time = 999.0

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT level, best_time FROM cards WHERE id = ? AND wallet_address = ?", (card_id, wallet_address))
        row = cursor.fetchone()
        if not row: return jsonify({"error": "카드가 없습니다."}), 404
        current_lv, best_time = row[0], row[1]
        
        msg = ""
        if is_correct:
            new_lv = min(int(current_lv) + 1, 50)
            try: best_time_float = float(best_time) if best_time is not None else float('inf')
            except: best_time_float = float('inf')
            new_best = clear_time if best_time_float == float('inf') else min(best_time_float, clear_time)
            cursor.execute("UPDATE cards SET level = ?, next_review_time = ?, status = 'OWNED', best_time = ? WHERE id = ?", (new_lv, get_next_review_time(new_lv), new_best, card_id))
            msg = f"방어 성공! 레벨이 {new_lv}로 올랐습니다. (10 GOAL 지급 완료)"
            threading.Thread(target=mint_goal_coin_to_user, args=(wallet_address, 10)).start()
        else:
            cursor.execute("UPDATE cards SET level = 0, next_review_time = ?, status = 'AT_RISK' WHERE id = ?", (get_next_review_time(0), card_id))
            msg = "방어 실패! 레벨이 0으로 초기화되었습니다."
            
        conn.commit()
        conn.close()
        return jsonify({"message": msg})
    except Exception as e:
        return jsonify({"error": "제출 처리 실패"}), 500

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
        return jsonify({"message": "메모 업데이트 완료"}), 200
    except Exception as e:
        return jsonify({"error": "메모 업데이트 실패"}), 500

@api_bp.route('/get-stopwords', methods=['GET'])
def get_stopwords():
    try:
        wallet_address = request.args.get('wallet_address')
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT custom_stopwords FROM user_settings WHERE wallet_address = ?", (wallet_address,))
        row = cursor.fetchone()
        conn.close()
        stopwords = json.loads(row[0]) if row and row[0] else []
        return jsonify({"stopwords": stopwords})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@api_bp.route('/update-stopwords', methods=['POST'])
def update_stopwords():
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        stopwords = data.get('stopwords', [])
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM user_settings WHERE wallet_address = ?", (wallet_address,))
        if cursor.fetchone():
            cursor.execute("UPDATE user_settings SET custom_stopwords = ? WHERE wallet_address = ?", (json.dumps(stopwords, ensure_ascii=False), wallet_address))
        else:
            cursor.execute("INSERT INTO user_settings (wallet_address, custom_stopwords) VALUES (?, ?)", (wallet_address, json.dumps(stopwords, ensure_ascii=False)))
        conn.commit()
        conn.close()
        return jsonify({"message": "예외 단어 DB 업데이트 완료"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ==========================================
# 💡 사용자 체크포인트(진행 상태) 관리 API
# ==========================================
@api_bp.route('/save-checkpoint', methods=['POST'])
def save_checkpoint():
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        tab = data.get('tab') # 'craft' 또는 'enhance'
        last_id = data.get('last_id')
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # user_settings 테이블에 last_craft_id, last_enhance_id 컬럼이 필요함 (없으면 생성)
        try:
            cursor.execute(f"ALTER TABLE user_settings ADD COLUMN last_{tab}_id INTEGER")
        except sqlite3.OperationalError:
            pass # 이미 존재함
            
        cursor.execute("SELECT 1 FROM user_settings WHERE wallet_address = ?", (wallet_address,))
        if cursor.fetchone():
            cursor.execute(f"UPDATE user_settings SET last_{tab}_id = ? WHERE wallet_address = ?", (last_id, wallet_address))
        else:
            cursor.execute(f"INSERT INTO user_settings (wallet_address, last_{tab}_id) VALUES (?, ?)", (wallet_address, last_id))
            
        conn.commit()
        conn.close()
        return jsonify({"message": "체크포인트 저장 완료"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@api_bp.route('/get-checkpoint', methods=['GET'])
def get_checkpoint():
    try:
        wallet_address = request.args.get('wallet_address')
        tab = request.args.get('tab')
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute(f"SELECT last_{tab}_id FROM user_settings WHERE wallet_address = ?", (wallet_address,))
            row = cursor.fetchone()
            last_id = row[0] if row and row[0] else None
        except sqlite3.OperationalError:
            last_id = None
            
        conn.close()
        return jsonify({"last_id": last_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
        
# ==========================================
# 💡 [신규] AI 장기기억 (판별 규칙) 관리
# ==========================================
@api_bp.route('/save-ai-memory', methods=['POST'])
def save_ai_memory():
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        new_rule = data.get('rule', '').strip()
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT ai_rules FROM user_settings WHERE wallet_address = ?", (wallet_address,))
        row = cursor.fetchone()
        
        if row:
            current_rules = row[0] or ""
            updated_rules = current_rules + f"\n- {new_rule}"
            cursor.execute("UPDATE user_settings SET ai_rules = ? WHERE wallet_address = ?", (updated_rules, wallet_address))
        else:
            updated_rules = f"- {new_rule}"
            cursor.execute("INSERT INTO user_settings (wallet_address, ai_rules) VALUES (?, ?)", (wallet_address, updated_rules))
            
        conn.commit()
        conn.close()
        return jsonify({"message": "장기기억 저장 완료", "ai_rules": updated_rules})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
