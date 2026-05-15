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
# 💡 로컬 AI (Ollama) 고도화 엔진 (JSON 파손 방지 튜닝)
# ==========================================
current_api_key_index = 0

def generate_ollama_json(prompt, model="gemma4:26b", temperature=0.1):
    try:
        url = "http://localhost:11434/api/generate"
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            # 💡 [핵심] JSON 포맷 강제 옵션을 사용하여 모델이 헛소리를 덧붙이는 것을 차단합니다.
            "format": "json",
            "options": {
                "temperature": temperature,
                "num_ctx": 32768,      
                "num_predict": 2048,   # 토큰이 너무 길면 꼬일 수 있으므로 적정선으로 타협
                "top_k": 40,           
                "top_p": 0.9
            }
        }
        response = requests.post(url, json=payload, timeout=600)
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

# 💡 [핵심] JSON 파손 시 복원력 강화
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
            
        # JSON 규격 위반(따옴표 내 줄바꿈 등) 오류 방지
        clean_text = clean_text.replace('\n', '\\n').replace('\r', '')
        
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
# 💡 RAG 시스템 및 모의고사 분석 (MoE 기반 JSON 안정화)
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
            law_context = full_context[:25000]

        print(f"\n🔍 [RAG 시스템] '{filename}' 자동생성 시작!\n", file=sys.stderr, flush=True)

        task_id = str(uuid.uuid4())
        TASK_STATUS[task_id] = {"status": "running", "progress": 20, "message": "AI가 문제를 법령과 대조하여 분석 중..."}

        def process_rag_pending():
            try:
                # 💡 [JSON 안정성 튜닝] 백틱(```json) 없이 순수 배열만 요구합니다.
                prompt = f'''당신은 승진시험 출제위원이자 사용자와 대화하는 보조 학습 AI입니다.
                아래 [참고 자료 DB]를 철저히 검색하여 사용자의 [시험지 텍스트]를 분석하세요.

                [절대 규칙]
                1. 오직 제공된 [참고 자료 DB] 안의 텍스트만 근거로 삼으세요.
                2. DB에서 내용이 부족하다면 억지로 지어내지 마세요.
                3. 반드시 아래 JSON 규격에 맞게 배열(Array) 형식으로 1번부터 차례대로 출력해야 합니다.
                4. 따옴표나 괄호를 빼먹지 마세요!

                [참고 자료 DB]
                {law_context}

                [시험지 텍스트]
                {raw_text[:10000]}

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
        
        if selected_laws and len(selected_laws) > 0:
            placeholders = ','.join('?' for _ in selected_laws)
            query = f"SELECT folder_name, title, content FROM categories WHERE wallet_address = ? AND folder_name IN ({placeholders})"
            cursor.execute(query, [wallet_address] + selected_laws)
        else:
            cursor.execute("SELECT folder_name, title, content FROM categories WHERE wallet_address = ?", (wallet_address,))
            
        laws = cursor.fetchall()
        conn.close()

        law_context = "선택된 참고 자료가 없습니다."
        if laws: 
            full_context = "\n\n".join([f"[{r[0]} - {r[1]}]\n{r[2]}" for r in laws])
            law_context = full_context[:25000]
        
        feedback_str = f"\n[👨‍💻 사용자 추가 피드백]\n{user_feedback}\n" if user_feedback else ""

        # 💡 [JSON 안정성 튜닝] MoE 구조를 유지하되 JSON 형식을 절대 파괴하지 못하게 명령
        prompt = f"""당신은 3개의 전문 가상 자아로 구성된 'Mixture of Experts (MoE)' 시스템입니다.

        1. 🧑‍⚖️ [법률 해석 전문가]
        2. 🧑‍🏫 [출제 의도 분석가]
        3. 🕵️‍♂️ [논리 검증가]

        [참고 자료 DB]
        {law_context}

        [시험지 원문]
        {chunk_text}
        {feedback_str}

        [출력형식] 오직 JSON 객체만 반환하세요. 어떤 마크다운(```)이나 부연 설명도 넣지 마세요.
        {{
          "question": "교정된 문제 내용",
          "options": ["1. 보기", "2. 보기"],
          "answer": "정답 번호",
          "explanation": "해설",
          "search_process": "전문가들의 의견 교환",
          "referenced_laws": "참고 조항"
        }}"""
        
        print(f"🤖 [MoE 로컬 AI 가동] 문단을 분석합니다...", file=sys.stderr, flush=True)
        
        try:
            response_text = generate_ollama_json(prompt, model="gemma4:26b", temperature=0.1)
            result_data = clean_and_parse_json(response_text)
        except Exception as ollama_e:
            print(f"⚠️ 로컬 AI 분석 실패, Gemini로 우회합니다: {ollama_e}", file=sys.stderr, flush=True)
            response_text = generate_gemini_json(prompt, temperature=0.1)
            result_data = clean_and_parse_json(response_text)
            
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

# ==========================================
# 💡 법령(PDF/TXT) 업로드 및 파싱 (클렌징 듀얼파싱)
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

    def process_file():
        try:
            raw_text = ""
            if original_filename.lower().endswith('.txt'):
                file_bytes = file.read()
                try: raw_text = file_bytes.decode('utf-8')
                except UnicodeDecodeError: raw_text = file_bytes.decode('cp949', errors='ignore')
            else:
                doc = fitz.open(stream=file.read(), filetype="pdf")
                for page in doc: raw_text += page.get_text()
            
            raw_text = re.sub(r'<(?:신설|개정|삭제|단서신설|전문개정|본조신설)[^>]*>', '', raw_text)
            raw_text = re.sub(r'\[(?:전문개정|본조신설|제목개정|종전제\d+조는|제\d+조에서 이동)[^\]]*\]', '', raw_text)
            
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
            
            conn = get_db_connection()
            cursor = conn.cursor()
            for block in blocks:
                cursor.execute("INSERT INTO categories (wallet_address, title, content, folder_name) VALUES (?, ?, ?, ?)", (wallet_address, block['title'], block['content'], folder_name))
            conn.commit()
            conn.close()
            TASK_STATUS[task_id] = "완료"
        except Exception as e:
            logging.error(f"분석 에러: {traceback.format_exc()}")
            TASK_STATUS[task_id] = f"에러: {str(e)}"

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

# ==========================================
# 💡 학습 진행 및 코인 지급 로직
# ==========================================
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
            cursor.execute("UPDATE SET memo = ? WHERE id = ? AND wallet_address = ?", (m.get('memo', ''), m.get('id'), wallet_address))

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
                    
                    # 💡 정답 시 10 코인 누적
                    reward_coins += 10 
                else:
                    cursor.execute("UPDATE cards SET level = 0, next_review_time = ?, status = 'AT_RISK' WHERE id = ?", (get_next_review_time(0), card_id))

        conn.commit()
        conn.close()

        # 💡 학습 완료 시 수이 블록체인에서 Goal 코인 즉시 발행 (비동기)
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
        return jsonify({"message": "메모 및 통계 업데이트 완료"}), 200
    except Exception as e:
        return jsonify({"error": "메모 업데이트 실패"}), 500
