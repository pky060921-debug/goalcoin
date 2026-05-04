import sqlite3
import logging
import traceback
from config import DB_PATH

def get_db_connection():
    return sqlite3.connect(DB_PATH)

def init_db():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 기본 테이블 생성 (장별 폴더 구분을 위한 folder_name 포함)
        cursor.execute('CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT, title TEXT, content TEXT, folder_name TEXT DEFAULT "기본 폴더")')
        cursor.execute('CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT, category_id INTEGER, card_content TEXT, answer_text TEXT, options_json TEXT, level INTEGER DEFAULT 0, next_review_time DATETIME, status TEXT DEFAULT "OWNED", best_time REAL DEFAULT NULL, folder_name TEXT DEFAULT "기본 폴더")')
        cursor.execute('''CREATE TABLE IF NOT EXISTS exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT, title TEXT, question TEXT, answer TEXT, explanation TEXT, related_law_keywords TEXT
        )''')
        cursor.execute('CREATE TABLE IF NOT EXISTS ai_analysis (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_address TEXT, topic TEXT, summary TEXT, recommended_blanks TEXT, quiz_json TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)')
        
        # 스키마 마이그레이션 (구형 DB에 새 컬럼이 없을 경우 추가)
        try: cursor.execute('ALTER TABLE cards ADD COLUMN best_time REAL DEFAULT NULL')
        except Exception: pass
        try: cursor.execute('ALTER TABLE categories ADD COLUMN folder_name TEXT DEFAULT "기본 폴더"')
        except Exception: pass
        try: cursor.execute('ALTER TABLE cards ADD COLUMN folder_name TEXT DEFAULT "기본 폴더"')
        except Exception: pass
            
        conn.commit()
        conn.close()
        logging.info("DB 초기화 완료")
    except Exception as e:
        error_info = traceback.format_exc()
        logging.error(f"[DB 초기화 치명적 에러]\n{error_info}")
        print(f"DB 초기화 실패: {error_info}")
