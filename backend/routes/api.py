from flask import Blueprint, request, jsonify
import sqlite3
import requests
import threading
import uuid
import json
import logging
import traceback
from datetime import datetime
from config import OLLAMA_API_URL, MODEL_NAME, TASK_STATUS
from database import get_db_connection
from services.parser import parse_html_3col_law, normalize_text, clean_korean_law_text, get_next_review_time

api_bp = Blueprint('api', __name__)

@api_bp.route('/health', methods=['GET', 'OPTIONS'])
def health_check():
    return jsonify({"status": "alive"}), 200

@api_bp.route('/task-status')
def task_status():
    task_id = request.args.get('task_id')
    if task_id in TASK_STATUS:
        return jsonify(TASK_STATUS[task_id])
    return jsonify({"status": "not_found"}), 404

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
                    import re
                    parts = re.split(r'(제\s*\d+\s*조(?:의\s*\d+)?\s*(?:\([^)]+\))?)', normalized_text)
                    if parts and len(parts) > 1:
                        if parts[0].strip(): categories.append({"title": "총칙 및 서론", "content": parts[0].strip(), "folder_name": custom_folder})
                        for i in range(1, len(parts), 2):
                            title = parts[i].strip()
                            content = parts[i+1].strip() if i+1 < len(parts) else ""
                            categories.append({"title": title, "content": content, "folder_name": custom_folder})
                    else: categories = [{"title": "문서 전체", "content": normalized_text, "folder_name": custom_folder}]
                
                TASK_STATUS[task_id]["progress"] = 70
                TASK_STATUS[task_id]["message"] = f"구조화 완료. 총 {len(categories)}개 조항 DB에 저장 중..."
                
                conn = get_db_connection()
                cursor = conn.cursor()
                for cat in categories:
                    cursor.execute("INSERT INTO categories (wallet_address, title, content, folder_name) VALUES (?, ?, ?, ?)", 
                                   (wallet_address, cat['title'], cat['content'], cat.get('folder_name', custom_folder)))
                conn.commit()
                conn.close()
                
                TASK_STATUS[task_id]["progress"] = 100
                TASK_STATUS[task_id]["status"] = "completed"
                TASK_STATUS[task_id]["message"] = "법령 아카이브 등록 성공"
            except Exception as e:
                error_info = traceback.format_exc()
                logging.error(f"[오류 진단] 법령 업로드 처리 실패:\n{error_info}")
                TASK_STATUS[task_id]["status"] = "error"
                TASK_STATUS[task_id]["message"] = f"분석 실패: {str(e)}"
                
        threading.Thread(target=process_law).start()
        return jsonify({"task_id": task_id, "message": "업로드 완료, 백그라운드 처리 시작"})
    except Exception as e: 
        logging.error(f"[오류 진단] 라우트 에러:\n{traceback.format_exc()}")
        return jsonify({"error": "전송 실패"}), 500

@api_bp.route('/upload-exam', methods=['POST'])
def upload_exam():
    try:
        wallet_address = request.form.get('wallet_address')
        file = request.files.get('file')
        if not file: return jsonify({"error": "파일이 없습니다."}), 400
        raw_text = file.read().decode('utf-8', errors='ignore')
        raw_text = normalize_text(clean_korean_law_text(raw_text))
        filename = file.filename
        
        task_id = str(uuid.uuid4())
        TASK_STATUS[task_id] = {"status": "running", "progress": 20, "message": f"{MODEL_NAME} 엔진에 텍스트 주입 완료. 모의고사 분석 중..."}
        
        def process_exam():
            try:
                prompt = f'''당신은 CBT 시험지 파서입니다. 텍스트에서 객관식 문제, 정답, 해설을 JSON 배열 형식으로만 출력하세요. 
                형식: [ {{"question": "문제 내용 및 보기", "answer": "정답", "explanation": "해설"}} ]
                텍스트: {raw_text[:3000]}'''
                
                response = requests.post(OLLAMA_API_URL, json={"model": MODEL_NAME, "prompt": prompt, "format": "json", "stream": False}, timeout=600)
                
                TASK_STATUS[task_id]["progress"] = 80
                TASK_STATUS[task_id]["message"] = "AI 추출 성공. DB에 모의고사 등록 중..."
                
                exam_data = json.loads(response.json().get('response', '[]'))
                
                conn = get_db_connection()
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
                error_info = traceback.format_exc()
                logging.error(f"[오류 진단] 모의고사 업로드 실패:\n{error_info}")
                TASK_STATUS[task_id]["status"] = "error"
                TASK_STATUS[task_id]["message"] = f"모의고사 파싱 실패: {str(e)}"
                
        threading.Thread(target=process_exam).start()
        return jsonify({"task_id": task_id, "message": "모의고사 처리 시작"})
    except Exception as e:
        logging.error(f"[오류 진단] 라우트 에러:\n{traceback.format_exc()}")
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
        logging.error(f"[오류 진단] get_all_exams 에러:\n{traceback.format_exc()}")
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
                
                TASK_STATUS[task_id]["progress"] = 45
                TASK_STATUS[task_id]["message"] = f"{MODEL_NAME} 모델이 출제 확률을 계산 중입니다..."

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
                error_info = traceback.format_exc()
                logging.error(f"[오류 진단] AI 추천 실패:\n{error_info}")
                TASK_STATUS[task_id]["status"] = "error"
                TASK_STATUS[task_id]["message"] = f"AI 연산 실패: {str(e)}"
                
        threading.Thread(target=process_recommend).start()
        return jsonify({"task_id": task_id, "message": "AI 추천 작업 시작"})
    except Exception as e:
        logging.error(f"[오류 진단] 라우트 에러:\n{traceback.format_exc()}")
        return jsonify({"error": "요청 실패", "details": str(e)}), 500

@api_bp.route('/split-category', methods=['POST'])
def split_category():
    try:
        data = request.json
        cat_id, text1, text2, wallet_address = data.get('id'), data.get('text1'), data.get('text2'), data.get('wallet_address')
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT title, folder_name FROM categories WHERE id = ? AND wallet_address = ?", (cat_id, wallet_address))
        row = cursor.fetchone()
        if not row: return jsonify({"error": "문헌을 찾을 수 없습니다."}), 404
        title, folder_name = row[0], row[1]
        
        cursor.execute("UPDATE categories SET content = ? WHERE id = ? AND wallet_address = ?", (text1, cat_id, wallet_address))
        import re
        match = re.search(r'-(\d+)$', title)
        new_title = f"{title[:match.start()]}-{int(match.group(1))+1}" if match else f"{title}-2"
            
        cursor.execute("INSERT INTO categories (wallet_address, title, content, folder_name) VALUES (?, ?, ?, ?)", (wallet_address, new_title, text2, folder_name))
        conn.commit()
        conn.close()
        return jsonify({"message": "분할 완료"})
    except Exception as e: 
        logging.error(f"[오류 진단] split_category 에러:\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

@api_bp.route('/move-categories', methods=['POST'])
def move_categories():
    try:
        data = request.json
        conn = get_db_connection()
        cursor = conn.cursor()
        for cat_id in data.get('ids', []):
            cursor.execute("UPDATE categories SET folder_name = ? WHERE id = ? AND wallet_address = ?", (data.get('folder_name'), cat_id, data.get('wallet_address')))
        conn.commit()
        conn.close()
        return jsonify({"message": "이동 완료"})
    except Exception as e:
        logging.error(traceback.format_exc())
        return jsonify({"error": "이동 실패"}), 500

@api_bp.route('/move-cards', methods=['POST'])
def move_cards():
    try:
        data = request.json
        conn = get_db_connection()
        cursor = conn.cursor()
        for card_id in data.get('ids', []):
            cursor.execute("UPDATE cards SET folder_name = ? WHERE id = ? AND wallet_address = ?", (data.get('folder_name'), card_id, data.get('wallet_address')))
        conn.commit()
        conn.close()
        return jsonify({"message": "이동 완료"})
    except Exception as e:
        logging.error(traceback.format_exc())
        return jsonify({"error": "이동 실패"}), 500

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
        logging.error(traceback.format_exc())
        return jsonify({"error": "조회 실패"}), 500

@api_bp.route('/save-card', methods=['POST'])
def save_card():
    try:
        data = request.json
        wallet_address, card_content, answer_text, folder_name = data.get('wallet_address'), data.get('card_content'), data.get('answer_text'), data.get('folder_name', '기본 폴더')
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''INSERT INTO cards (wallet_address, card_content, answer_text, options_json, next_review_time, folder_name) VALUES (?, ?, ?, '[]', ?, ?)''', (wallet_address, card_content, answer_text, get_next_review_time(0), folder_name))
        conn.commit()
        conn.close()
        return jsonify({"message": "카드 제작 완료"}), 201
    except Exception as e:
        logging.error(f"[오류 진단] save_card 에러:\n{traceback.format_exc()}")
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
        cursor.execute("SELECT id, card_content, answer_text, options_json, level, next_review_time, status, best_time, folder_name FROM cards WHERE wallet_address = ? ORDER BY id DESC", (wallet_address,))
        cards = [{"id": r[0], "content": r[1], "answer": r[2], "options": json.loads(r[3]), "level": r[4], "next_review": r[5], "status": r[6], "best_time": r[7], "folder_name": r[8]} for r in cursor.fetchall()]
        conn.close()
        return jsonify({"cards": cards})
    except Exception as e:
        logging.error(f"[오류 진단] my-cards 에러:\n{traceback.format_exc()}")
        return jsonify({"error": "조회 실패"}), 500

@api_bp.route('/submit-answer', methods=['POST'])
def submit_answer():
    try:
        data = request.json
        card_id, is_correct, clear_time = data.get('card_id'), data.get('is_correct'), data.get('clear_time', 999.0)
        conn = get_db_connection()
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
    except Exception as e:
        logging.error(f"[오류 진단] submit-answer 에러:\n{traceback.format_exc()}")
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
        logging.error(traceback.format_exc())
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
        logging.error(traceback.format_exc())
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
        logging.error(f"[오류 진단] delete-all 에러:\n{traceback.format_exc()}")
        return jsonify({"error": "초기화 실패"}), 500
