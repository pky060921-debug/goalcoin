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
                print(f"⚠️ [API 1차 진단] API 키 {current_api_key_index} 한도 초과! 다음 키로 전환합니다.", file=sys.stderr, flush=True)
                current_api_key_index = (current_api_key_index + 1) % len(GEMINI_API_KEYS)
            elif "503" in error_msg or "unavailable" in error_msg or "high demand" in error_msg:
                print(f"⚠️ [API 1차 진단] 구글 서버({current_model}) 폭주(503). 1초 대기 후 우회합니다...", file=sys.stderr, flush=True)
                time.sleep(1)
            else:
                if attempt == max_retries - 1:
                    print(f"❌ [API 치명적 진단] 제미나이 최종 실패 내역:\n{traceback.format_exc()}", file=sys.stderr, flush=True)
                    raise e
                time.sleep(1)
                
    raise Exception("🚨 구글 서버 불안정 또는 모든 API 키 한도 초과입니다. 잠시 후 시도해주세요.")

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

# ==========================================
# 💡 대기열(Pending)에서 해설 자동생성 (장기기억 RAG)
# ==========================================
@api_bp.route('/generate-rag-from-pending', methods=['POST'])
def generate_rag_from_pending():
    try:
        data = request.json or {}
        pending_id = data.get('id')
        wallet_address = data.get('wallet_address')

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

        cursor.execute("SELECT title, content FROM categories WHERE wallet_address = ?", (wallet_address,))
        laws = cursor.fetchall()
        conn.close()

        law_context = "등록된 참고 법령이 없습니다."
        if laws:
            law_context = "\n\n".join([f"[{r[0]}]\n{r[1]}" for r in laws])

        # 💡 [터미널 확인용 디버깅 출력]
        print("\n=================================================", file=sys.stderr, flush=True)
        print(f"🔍 [RAG 시스템 가동] 모의고사 '{filename}' 해설 생성 시작!", file=sys.stderr, flush=True)
        print(f"🔍 DB에서 불러온 참고 법령 개수: {len(laws)}개", file=sys.stderr, flush=True)
        for idx, r in enumerate(laws):
            print(f"   👉 [{idx+1}] {r[0]} (글자수: {len(r[1])}자)", file=sys.stderr, flush=True)
        print("=================================================\n", file=sys.stderr, flush=True)

        task_id = str(uuid.uuid4())
        TASK_STATUS[task_id] = {"status": "running", "progress": 20, "message": "AI가 대기열의 문제를 법령과 대조하여 분석 중..."}

        def process_rag_pending():
            try:
                prompt = f'''당신은 국민건강보험공단 승진시험 최고 출제위원이자 완벽한 해설가입니다.
                아래 [참고 법령 DB]를 숙지하고, 사용자의 [시험지 텍스트(문제+정답)]를 분석하세요.
                정답의 근거가 되는 법령을 찾고, 그 사고 과정(장기기억용)과 완벽한 해설을 분리하여 작성하세요.

                [참고 법령 DB]
                {law_context[:35000]}

                [시험지 텍스트]
                {raw_text[:10000]}

                [출력 지시사항] 반드시 JSON 배열 형식으로만 출력하세요.
                [{{ 
                    "question": "문제 내용 및 보기 전체", 
                    "answer": "정답", 
                    "explanation": "사용자에게 보여줄 최종 해설",
                    "search_process": "이 정답을 도출하기 위해 어떤 법령의 몇 조 몇 항을 찾았고 어떻게 논리적으로 판단했는지 사고 과정을 기록하세요.",
                    "referenced_laws": "참고한 법령명과 조항"
                }}]'''

                response_text = generate_gemini_json(prompt)
                exam_data = json.loads(response_text)

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
                print(f"\n[🔥 지능형 해설 자동생성 스레드 에러]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
                TASK_STATUS[task_id].update({"status": "error", "message": str(e)})

        threading.Thread(target=process_rag_pending).start()
        return jsonify({"task_id": task_id, "message": "분석 시작"})

    except Exception as e:
        print(f"\n[🔥 라우터 진입 에러 - /generate-rag-from-pending]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
        return jsonify({"error": str(e)}), 500

@api_bp.route('/upload-exam', methods=['POST'])
def upload_exam():
    try:
        wallet_address = request.form.get('wallet_address')
        exam_file = request.files.get('exam_file')
        answer_file = request.files.get('answer_file')
        
        if not exam_file: return jsonify({"error": "문제 파일이 없습니다."}), 400
        
        filename = exam_file.filename.lower()
        exam_text = extract_text_from_file(exam_file)
        answer_text = extract_text_from_file(answer_file)
        
        raw_text = normalize_text(clean_korean_law_text(exam_text))
        if answer_text:
            raw_text += "\n\n[정답 및 해설지 전문]\n" + normalize_text(clean_korean_law_text(answer_text))
        
        task_id = str(uuid.uuid4())
        TASK_STATUS[task_id] = {"status": "running", "progress": 20, "message": f"Gemini 엔진 분석 중..."}
        
        def process_exam():
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT title, content FROM categories WHERE wallet_address = ?", (wallet_address,))
                laws = cursor.fetchall()
                conn.close()

                law_context = "등록된 참고 법령이 없습니다."
                if laws: law_context = "\n\n".join([f"[{r[0]}]\n{r[1]}" for r in laws])

                # 💡 [터미널 확인용 디버깅 출력]
                print("\n=================================================", file=sys.stderr, flush=True)
                print(f"🔍 [RAG 시스템 가동] 다이렉트 업로드 해설 생성 시작!", file=sys.stderr, flush=True)
                print(f"🔍 DB에서 불러온 참고 법령 개수: {len(laws)}개", file=sys.stderr, flush=True)
                print("=================================================\n", file=sys.stderr, flush=True)
                
                prompt = f'''당신은 승진시험 최고 출제위원이자 AI 해설가입니다.
                아래 [시험지 텍스트(문제+정답)]를 분석하고, [참고 법령]을 대조하여 상세 해설과 당신의 사고 과정을 함께 기록하세요.
                
                [참고 법령 DB]
                {law_context[:35000]}

                [시험지 텍스트]
                {raw_text[:10000]}

                [출력 지시사항] 반드시 JSON 배열 형식으로만 출력하세요.
                [{{ 
                    "question": "문제 내용 및 보기 전체", 
                    "answer": "정답", 
                    "explanation": "법령에 기반한 사용자용 해설",
                    "search_process": "어떤 조항을 찾고 논리적으로 어떻게 도출했는지 AI의 사고과정 (장기기억)",
                    "referenced_laws": "참고 법령명"
                }}]'''
                
                response_text = generate_gemini_json(prompt)
                exam_data = json.loads(response_text)
                
                conn = get_db_connection()
                cursor = conn.cursor()
                for item in exam_data:
                    cursor.execute('''INSERT INTO golden_exams 
                        (wallet_address, title, question, answer, explanation, search_process, referenced_laws) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)''',
                        (wallet_address, filename, item.get('question', ''), item.get('answer', ''), item.get('explanation', ''),
                         item.get('search_process', ''), item.get('referenced_laws', '')))
                conn.commit()
                conn.close()
                TASK_STATUS[task_id].update({"progress": 100, "status": "completed", "message": f"{len(exam_data)}개의 문항 저장됨."})
            except Exception as e:
                print(f"\n[🔥 직접 모의고사 파싱 스레드 에러]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
                TASK_STATUS[task_id].update({"status": "error", "message": f"모의고사 파싱 실패: {str(e)}"})
                
        threading.Thread(target=process_exam).start()
        return jsonify({"task_id": task_id, "message": "모의고사 처리 시작"})
    except Exception as e:
        print(f"\n[🔥 라우터 진입 에러 - /upload-exam]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
        return jsonify({"error": "요청 실패"}), 500

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
        print(f"\n[🔥 골든 DB 삭제 에러 - /delete-exam]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
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
        print(f"\n[🔥 대기열 삭제 에러 - /delete-pending-exam]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
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
        print(f"\n[🔥 합동 검수 업로드 에러 - /upload-exam-coop]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
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
        print(f"\n[🔥 펜딩 목록 조회 에러 - /get-pending-exams]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
        return jsonify({"error": str(e)}), 500

@api_bp.route('/analyze-chunk', methods=['POST'])
def analyze_chunk():
    try:
        data = request.json
        chunk_text = data.get('chunk_text', '')
        wallet_address = data.get('wallet_address')

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT title, content FROM categories WHERE wallet_address = ?", (wallet_address,))
        laws = cursor.fetchall()
        conn.close()

        law_context = "등록된 참고 법령이 없습니다."
        if laws: law_context = "\n\n".join([f"[{r[0]}]\n{r[1]}" for r in laws])

        prompt = f"""당신은 출제위원이자 법령 해설 전문가입니다.
아래 [시험지 원문]에서 1개의 객관식 문제, 보기, 정답, 해설을 명확히 분리하세요.
해설을 작성할 때는 반드시 [참고 법령 DB]를 대조하여 명확한 법적 근거를 포함하고, 당신의 사고 과정도 기록하세요.

[참고 법령 DB]
{law_context[:30000]}

[시험지 원문]
{chunk_text}

[출력형식] 반드시 JSON 형식으로만 반환하세요.
{{
  "question": "교정된 문제 내용",
  "options": ["1. 보기", "2. 보기", "3. 보기", "4. 보기"],
  "answer": "정답 번호",
  "explanation": "참고 법령을 근거로 한 상세 해설",
  "search_process": "어떤 조항을 찾고 논리적으로 어떻게 도출했는지 AI의 사고과정 (장기기억)"
}}"""
        response_text = generate_gemini_json(prompt, temperature=0.1)
        result_data = json.loads(response_text)
        return jsonify({"result": result_data})
    except Exception as e:
        print(f"\n[🔥 문단 분석 에러 - /analyze-chunk]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
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
        print(f"\n[🔥 골든 문제 저장 에러 - /save-golden-exam]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
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
        print(f"\n[🔥 골든 문제 조회 에러 - /get-golden-exams]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
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
        print(f"\n[🔥 CBT 세션 조회 에러 - /get-cbt-session]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
        return jsonify({"error": str(e)}), 500

@api_bp.route('/generate-styles', methods=['POST'])
def generate_styles():
    try:
        data = request.json
        article_text = data.get('article_text', '')
        if not article_text: return jsonify({"error": "법령 텍스트가 없습니다."}), 400
            
        prompt = f"""당신은 승진시험 최고 출제위원장입니다.
아래 [법령 조문]을 바탕으로 서로 다른 10가지 스타일의 4지 선다 문제를 창작하세요.
[10가지 필수 출제 스타일]
1.단순목록형 2.NCS상황형 3.계산기한형 4.박스조합형 5.단서예외형 6.주체오답형 7.OX판별형 8.괄호형 9.취지추론형 10.융합형

[출력 지시사항] 반드시 JSON 배열 형식으로 10개를 출력하세요.
[{{ "style": "스타일 이름", "question": "문제 내용", "options": ["1. 보기", "2. 보기", "3. 보기", "4. 보기"], "answer": "숫자", "explanation": "해설" }}]

[법령 조문]\n{article_text}\n"""
        response_text = generate_gemini_json(prompt, temperature=0.5)
        result_data = json.loads(response_text)
        if isinstance(result_data, dict): result_data = result_data.get('problems', [result_data])
        return jsonify({"samples": result_data})
    except Exception as e:
        print(f"\n[🔥 스타일 생성 에러 - /generate-styles]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
        return jsonify({"error": str(e)}), 500

# 🛑 [핵심 수정] PDF 전용 해독기(fitz) 복구 완료
@api_bp.route('/upload-pdf', methods=['POST'])
def upload_law():
    try:
        wallet_address = request.form.get('wallet_address')
        custom_folder = request.form.get('custom_folder', '기본 폴더')
        file = request.files.get('file')
        if not file: return jsonify({"error": "업로드된 파일이 없습니다."}), 400
        
        raw_bytes = file.read()
        filename = file.filename.lower()
        
        task_id = str(uuid.uuid4())
        TASK_STATUS[task_id] = {"status": "running", "progress": 10, "message": "문헌 파싱 및 분석 중..."}
        
        def process_law():
            try:
                if filename.endswith('.pdf'):
                    pdf_document = fitz.open(stream=raw_bytes, filetype="pdf")
                    text = "".join([page.get_text("text") for page in pdf_document])
                    pdf_document.close()
                elif filename.endswith('.html') or filename.endswith('.htm'):
                    text = raw_bytes.decode('utf-8', errors='ignore')
                else:
                    text = raw_bytes.decode('utf-8', errors='ignore')

                normalized_text = normalize_text(clean_korean_law_text(text))
                categories = []
                parts = re.split(r'(제\s*\d+\s*조(?:의\s*\d+)?\s*(?:\([^)]+\))?)', normalized_text)
                if parts and len(parts) > 1:
                    if parts[0].strip(): categories.append({"title": filename, "content": parts[0].strip(), "folder_name": filename})
                    for i in range(1, len(parts), 2):
                        content = parts[i+1].strip() if i+1 < len(parts) else ""
                        categories.append({"title": filename, "content": content, "folder_name": filename})
                else: categories = [{"title": filename, "content": normalized_text, "folder_name": filename}]
                
                conn = get_db_connection()
                cursor = conn.cursor()
                for cat in categories:
                    cursor.execute("INSERT INTO categories (wallet_address, title, content, folder_name) VALUES (?, ?, ?, ?)", 
                                  (wallet_address, cat['title'], cat['content'], cat.get('folder_name', filename)))
                conn.commit()
                conn.close()
                TASK_STATUS[task_id].update({"progress": 100, "status": "completed", "message": "법령 아카이브 등록 성공"})
            except Exception as e:
                print(f"\n[🔥 법령 파싱 스레드 에러]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
                TASK_STATUS[task_id].update({"status": "error", "message": f"분석 실패: {str(e)}"})
                
        threading.Thread(target=process_law).start()
        return jsonify({"task_id": task_id, "message": "업로드 완료, 백그라운드 처리 시작"})
    except Exception as e: 
        print(f"\n[🔥 법령 업로드 에러 - /upload-pdf]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
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
                print(f"\n[🔥 빈칸 추천 스레드 에러]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
                TASK_STATUS[task_id].update({"status": "error", "message": f"AI 연산 실패: {str(e)}"})
                
        threading.Thread(target=process_recommend).start()
        return jsonify({"task_id": task_id, "message": "AI 추천 작업 시작"})
    except Exception as e:
        print(f"\n[🔥 빈칸 추천 라우터 에러 - /recommend-blank]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
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
        print(f"\n[🔥 카테고리 조회 에러 - /get-categories]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
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
        print(f"\n[🔥 카드 저장 에러 - /save-card]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
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
        print(f"\n[🔥 카드 조회 에러 - /my-cards]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
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
        print(f"\n[🔥 동기화 에러 - /sync-batch]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
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
        print(f"\n[🔥 메모 업데이트 에러 - /update-card-memo]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
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
        print(f"\n[🔥 답안 제출 에러 - /submit-answer]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
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
        print(f"\n[🔥 카테고리 삭제 에러 - /delete-category]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
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
        print(f"\n[🔥 카드 삭제 에러 - /delete-card]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
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
        print(f"\n[🔥 전체 초기화 에러 - /delete-all]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
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
        print(f"\n[🔥 카테고리 분할 에러 - /split-category]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
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
        print(f"\n[🔥 전체 시험 조회 에러 - /get-all-exams]\n{traceback.format_exc()}\n", file=sys.stderr, flush=True)
        return jsonify({"error": "조회 실패"}), 500
