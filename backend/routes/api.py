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
                "num_ctx": 8192  # 💡 [최적화] 컨텍스트를 압축했으므로 메모리 부담을 확 낮춰 초고속으로 대답합니다!
            }
        }
        response = requests.post(url, json=payload, timeout=120) # 속도가 빨라졌으므로 타임아웃도 정상화
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
                current_api_key_index = (current_api_key_index + 1) % len(GEMINI_API_KEYS)
            elif "503" in error_msg or "unavailable" in error_msg or "high demand" in error_msg:
                time.sleep(1)
            else:
                if attempt == max_retries - 1:
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
        
        alter_queries = [
            'ALTER TABLE golden_exams ADD COLUMN search_process TEXT DEFAULT ""',
            'ALTER TABLE golden_exams ADD COLUMN referenced_laws TEXT DEFAULT ""',
            'ALTER TABLE categories ADD COLUMN folder_name TEXT DEFAULT "기본 폴더"',
            'ALTER TABLE cards ADD COLUMN folder_name TEXT DEFAULT "기본 폴더"',
            'ALTER TABLE cards ADD COLUMN memo TEXT DEFAULT ""',
            'ALTER TABLE cards ADD COLUMN best_time REAL DEFAULT 999.0'
        ]
        
        for query in alter_queries:
            try:
                conn.execute(query)
            except Exception:
                pass
                
        conn.commit()
        conn.close()
    except Exception as e:
        pass

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

# =========================================================================
# 💡 [초고속 스나이퍼 검색 알고리즘] AI에게 넘기기 전에 파이썬이 DB를 필터링합니다!
# =========================================================================
def get_top_k_relevant_laws(query_text, laws, top_k=5):
    """
    지문과 피드백에서 핵심 키워드 및 조항(제O조)을 추출하여,
    전체 DB 중 가장 관련성이 높은 조항 딱 5개만 AI에게 던져줍니다. (속도 30배 증가)
    """
    # 1. 지문에서 '제O조' 키워드 추출 (예: 제1조, 제62조)
    article_matches = set(re.findall(r'제\s*\d+\s*조(?:의\s*\d+)?', query_text))
    clean_article_matches = [re.sub(r'\s+', '', a) for a in article_matches]
    
    # 2. 지문에서 2글자 이상 명사/단어 추출
    query_words = set(re.findall(r'\b[가-힣]{2,}\b', query_text))
    
    scored_laws = []
    for folder, title, content in laws:
        score = 0
        clean_title = re.sub(r'\s+', '', title)
        
        # 가중치 1: '제O조'가 일치하면 초강력 가중치 부여 (1000점)
        if clean_title in clean_article_matches:
            score += 1000
            # 가중치 1-1: 폴더명(법/정관)까지 일치하면 추가 점수 (500점)
            if '정관' in query_text and '정관' in folder:
                score += 500
            elif '법' in query_text and '건강보험법' in folder:
                score += 500

        # 가중치 2: 본문 내용 단어 교집합(Overlap) 점수 부여 (단어당 1점)
        content_words = set(re.findall(r'\b[가-힣]{2,}\b', content))
        overlap = query_words.intersection(content_words)
        score += len(overlap)
        
        if score > 0:
            scored_laws.append((score, folder, title, content))
        
    # 점수 순으로 내림차순 정렬
    scored_laws.sort(key=lambda x: x[0], reverse=True)
    
    # 상위 K개만 뽑아서 텍스트로 결합 (6만 자 -> 2천 자로 압축됨)
    top_laws = scored_laws[:top_k]
    
    if not top_laws:
        # 혹시 매칭된 게 없으면 그냥 앞부분 일부만 반환
        return "\n\n".join([f"📖 [문서명: {r[0]} | 조항명: {r[1]}]\n{r[2]}" for r in laws[:top_k]])
        
    return "\n\n".join([f"📖 [문서명: {law[1]} | 조항명: {law[2]}]\n{law[3]}" for law in top_laws])
# =========================================================================

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
        
        conn = get_db_connection()
        conn.execute("DELETE FROM categories WHERE folder_name = ? AND wallet_address = ?", (folder_name, wallet_address))
        conn.commit()
        conn.close()
        return jsonify({"message": "법령 파일 삭제 완료"})
    except Exception as e:
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

        if laws:
            # 여기도 스나이퍼 알고리즘 적용
            law_context = get_top_k_relevant_laws(raw_text, laws, top_k=20) 
        else:
            law_context = "등록된 참고 자료가 없습니다."

        task_id = str(uuid.uuid4())
        TASK_STATUS[task_id] = {"status": "running", "progress": 20, "message": "AI가 문제를 법령과 대조하여 분석 중..."}

        def process_rag_pending():
            try:
                prompt = f'''당신은 승진시험 출제위원이자 사용자와 대화하는 보조 학습 AI입니다.
                [참고 자료 DB]
                {law_context}
                [시험지 텍스트]
                {raw_text[:10000]}
                [출력 지시사항] 반드시 JSON 배열 형식으로만 출력하세요.
                [{{ 
                    "question": "문제 내용 및 보기 전체", 
                    "answer": "정답 번호", 
                    "explanation": "해석 내용",
                    "search_process": "1단계:...\n2단계:...\n3단계:...",
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
                TASK_STATUS[task_id].update({"status": "error", "message": "JSON 파싱 에러"})

        threading.Thread(target=process_rag_pending).start()
        return jsonify({"task_id": task_id, "message": "분석 시작"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@api_bp.route('/delete-exam', methods=['POST'])
def delete_exam():
    try:
        data = request.json or {}
        conn = get_db_connection()
        conn.execute("DELETE FROM exams WHERE id = ? AND wallet_address = ?", (data.get('id'), data.get('wallet_address')))
        conn.execute("DELETE FROM golden_exams WHERE id = ? AND wallet_address = ?", (data.get('id'), data.get('wallet_address')))
        conn.commit()
        conn.close()
        return jsonify({"message": "해당 문제가 삭제되었습니다."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@api_bp.route('/delete-pending-exam', methods=['POST'])
def delete_pending_exam():
    try:
        data = request.json or {}
        conn = get_db_connection()
        conn.execute("DELETE FROM pending_exams WHERE id = ? AND wallet_address = ?", (data.get('id'), data.get('wallet_address')))
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

# =========================================================================
# 💡 [초고속 대화형 AI] 파이썬 스나이퍼 알고리즘 적용 및 프롬프트 경량화
# =========================================================================
@api_bp.route('/analyze-chunk', methods=['POST'])
def analyze_chunk():
    try:
        data = request.json
        chunk_text = data.get('chunk_text', '')
        wallet_address = data.get('wallet_address')
        user_feedback = data.get('user_feedback', '') 
        chat_history = data.get('chat_history', []) 
        selected_laws = data.get('selected_laws', [])
        current_explanation = data.get('current_explanation', '') 

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

        # 💡 [핵심 최적화] AI에게 무식하게 6만 자를 주지 않고, 지시받은 키워드의 핵심 조항 5개만 던져줍니다!
        search_query = chunk_text + " " + user_feedback
        if laws:
            law_context = get_top_k_relevant_laws(search_query, laws, top_k=5)
        else:
            law_context = "선택된 참고 자료가 없습니다."
        
        history_str = ""
        for msg in chat_history[-6:]:  
            sender_name = "사용자(대표님)" if msg['sender'] == 'user' else "AI"
            history_str += f"\n[{sender_name}]: {msg['text']}"
            
        feedback_str = f"\n[👨‍💻 최신 사용자 명령/질문]\n{user_feedback}\n" if user_feedback else ""

        prompt = f"""당신은 출제위원이자 사용자와 티키타카로 소통하는 '대화형 튜터 AI'입니다.

        [대화형 튜터 절대 규칙 🚨]
        1. 오지랖 금지: 사용자가 "법 제1조 검색해서 말해줘"라고 하면, [참고 자료 DB]에서 내용만 쏙 빼서 `chat_message`에 알려주고 "일치하나요?"라고 묻기만 하세요! 한 번에 문제 전체를 다 풀지 마세요.
        2. 지문에 `[🔴정답: OOO]` 태그가 있다면, 그것이 사용자가 표시해 둔 '진짜 정답'입니다!
        3. 피드백 수용: 사용자가 "틀렸어, 정관 1조 주어는 법인이야" 라고 정정해주면, `chat_message`로 "아하! 알겠습니다!" 라고 친근하게 대답하고 `explanation`에 그 내용을 차곡차곡 업데이트하세요.

        [참고 자료 DB (파이썬이 압축 추출한 엑기스 자료)]
        {law_context}

        [현재 시험지 원문]
        {chunk_text}
        
        [이전 대화 내역]{history_str}
        {feedback_str}

        [현재까지 누적된 해설]
        {current_explanation}

        [출력형식] 반드시 JSON 단일 객체로 반환.
        {{
          "question": "시험지 원문 텍스트 유지",
          "options": ["1. 보기", "2. 보기", "3. 보기", "4. 보기"],
          "answer": "정답 번호",
          "chat_message": "사용자의 명령에 대한 1:1 대답! (예: '법 제1조를 검색해 보았습니다: ... 내용 ... 일치하나요?')",
          "explanation": "지금까지 누적된 해설 내용 (수정 지시가 있으면 추가 반영)",
          "search_process": "현재 검색하거나 대조 중인 내용 메모"
        }}"""
        
        print(f"🤖 [초고속 대화형 AI 가동] 응답 생성 중...", file=sys.stderr, flush=True)
        
        try:
            response_text = generate_ollama_json(prompt, temperature=0.1)
            result_data = clean_and_parse_json(response_text)
        except Exception as ollama_e:
            print(f"⚠️ 로컬 AI 분석 실패, Gemini로 우회: {ollama_e}", file=sys.stderr, flush=True)
            response_text = generate_gemini_json(prompt, temperature=0.1)
            result_data = clean_and_parse_json(response_text)
            
        if isinstance(result_data, list) and len(result_data) > 0:
            result_data = result_data[0]
            
        if isinstance(result_data, dict):
            if "chat_message" not in result_data or not result_data["chat_message"].strip():
                if user_feedback:
                    result_data["chat_message"] = f"대표님의 지시('{user_feedback}')에 따라 처리했습니다!"
                else:
                    result_data["chat_message"] = "무엇을 먼저 도와드릴까요?"
            
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

@api_bp.route('/upload-pdf', methods=['POST'])
def upload_law():
    try:
        wallet_address = request.form.get('wallet_address')
        custom_folder = request.form.get('custom_folder') 
        file = request.files.get('file')
        if not file: return jsonify({"error": "업로드된 파일이 없습니다."}), 400
        
        raw_bytes = file.read()
        filename = file.filename.lower()
        display_name = custom_folder if custom_folder else filename
        
        task_id = str(uuid.uuid4())
        TASK_STATUS[task_id] = {"status": "running", "progress": 10, "message": "문헌 파싱 및 복원 중..."}
        
        def process_law():
            try:
                categories = []
                extracted_text = ""
                
                if filename.endswith('.pdf'):
                    doc = fitz.open(stream=raw_bytes, filetype="pdf")
                    for page in doc:
                        blocks = page.get_text("blocks")
                        blocks.sort(key=lambda b: (b[1], b[0]))
                        for b in blocks:
                            text_block = b[4].strip()
                            if text_block:
                                extracted_text += text_block + "\n"
                    doc.close()
                else:
                    extracted_text = raw_bytes.decode('utf-8', errors='ignore')

                extracted_text = re.sub(r'(?<![다요까기됨함임])\n(?!\s*제\s*\d+\s*조)', ' ', extracted_text)
                extracted_text = re.sub(r'\s{2,}', ' ', extracted_text)

                regex_pattern = r'((?:제\s*\d+\s*조|제\s*조\s*\d+|제조\s*\d+)(?:의\s*\d+)?\s*(?:\([^)]+\))?)'
                parts = re.split(regex_pattern, extracted_text)

                if parts and len(parts) > 1:
                    if parts[0].strip(): 
                        categories.append({"title": "총칙 및 서론", "content": parts[0].strip(), "folder_name": display_name})
                    for i in range(1, len(parts), 2):
                        raw_title = parts[i].strip()
                        nums = re.findall(r'\d+', raw_title)
                        clean_title = f"제{nums[0]}조" if len(nums) == 1 else (f"제{nums[0]}조의{nums[1]}" if len(nums) >= 2 else raw_title)
                        content = parts[i+1].strip() if i+1 < len(parts) else ""
                        categories.append({"title": clean_title, "content": content, "folder_name": display_name})
                else: 
                    categories = [{"title": "문서 전체", "content": extracted_text, "folder_name": display_name}]
                
                conn = get_db_connection()
                cursor = conn.cursor()
                saved_count = 0
                for cat in categories:
                    if len(cat['content'].strip()) > 5:
                        cursor.execute("INSERT INTO categories (wallet_address, title, content, folder_name) VALUES (?, ?, ?, ?)", 
                                      (wallet_address, cat['title'], cat['content'], cat.get('folder_name', display_name)))
                        saved_count += 1
                conn.commit()
                conn.close()
                TASK_STATUS[task_id].update({"progress": 100, "status": "completed", "message": f"성공! 총 {saved_count}개 조항 저장됨"})
            except Exception as e:
                TASK_STATUS[task_id].update({"status": "error", "message": f"분석 실패: {str(e)}"})
                
        threading.Thread(target=process_law).start()
        return jsonify({"task_id": task_id, "message": "업로드 완료, 백그라운 파싱 시작"})
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
                아래 [기출 모의고사 DB]를 참고하여, 주어진 [법령 본문]에서 빈칸 문제로 내기 가장 좋은 핵심 단어 딱 1개만 골라주세요.
                형식: JSON만 출력
                {{ "keyword": "추출한단어", "related_exam": "연관된 기출문제 내용 요약" }}
                [기출 모의고사 DB]:\n{all_exams}\n[법령 본문]:\n{content}'''
                response_text = generate_gemini_json(prompt)
                result = clean_and_parse_json(response_text)
                TASK_STATUS[task_id].update({"progress": 100, "status": "completed", "result": result, "message": "AI 추천 완료!"})
            except Exception as e:
                TASK_STATUS[task_id].update({"status": "error", "message": f"AI 연산 실패: {str(e)}"})
        threading.Thread(target=process_recommend).start()
        return jsonify({"task_id": task_id, "message": "AI 추천 작업 시작"})
    except Exception as e:
        return jsonify({"error": "요청 실패"}), 500

@api_bp.route('/generate-styles', methods=['POST'])
def generate_styles():
    try:
        data = request.json
        article_text = data.get('article_text', '')
        if not article_text: return jsonify({"error": "법령 텍스트가 없습니다."}), 400
        prompt = f"""당신은 승진시험 최고 출제위원장입니다.
아래 [법령 조문]을 바탕으로 서로 다른 10가지 스타일의 4지 선다 문제를 창작하세요.
[{{ "style": "스타일", "question": "문제 내용", "options": ["1. 보기"], "answer": "숫자", "explanation": "해설" }}]
[법령 조문]\n{article_text}\n"""
        response_text = generate_gemini_json(prompt, temperature=0.5)
        result_data = clean_and_parse_json(response_text)
        if isinstance(result_data, dict): result_data = result_data.get('problems', [result_data])
        return jsonify({"samples": result_data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@api_bp.route('/save-card', methods=['POST'])
def save_card():
    try:
        data = request.json
        conn = get_db_connection()
        conn.execute('''INSERT INTO cards (wallet_address, card_content, answer_text, options_json, next_review_time, folder_name, memo) VALUES (?, ?, ?, '[]', ?, ?, ?)''', (data.get('wallet_address'), data.get('card_content'), data.get('answer_text'), get_next_review_time(0), data.get('folder_name', '기본 폴더'), data.get('memo', '')))
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
        conn = get_db_connection()
        cursor = conn.cursor()
        for m in data.get('memos', []):
            cursor.execute("UPDATE cards SET memo = ? WHERE id = ? AND wallet_address = ?", (m.get('memo', ''), m.get('id'), wallet_address))
        for a in data.get('answers', []):
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
        return jsonify({"message": "일괄 동기화 성공"}), 200
    except Exception as e:
        return jsonify({"error": "배치 동기화 실패"}), 500

@api_bp.route('/update-card-memo', methods=['POST'])
def update_card_memo():
    try:
        data = request.json
        conn = get_db_connection()
        conn.execute("UPDATE cards SET memo = ? WHERE id = ? AND wallet_address = ?", (data.get('memo', ''), data.get('id'), data.get('wallet_address')))
        conn.commit()
        conn.close()
        return jsonify({"message": "메모 업데이트 완료"}), 200
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
        conn = get_db_connection()
        conn.execute("DELETE FROM categories WHERE id = ? AND wallet_address = ?", (data.get('id'), wallet_address))
        conn.execute("INSERT INTO categories (wallet_address, title, content, folder_name) VALUES (?, ?, ?, ?)", (wallet_address, data.get('title1'), data.get('text1'), data.get('folder_name') or '기본 폴더'))
        conn.execute("INSERT INTO categories (wallet_address, title, content, folder_name) VALUES (?, ?, ?, ?)", (wallet_address, data.get('title2'), data.get('text2'), data.get('folder_name') or '기본 폴더'))
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
