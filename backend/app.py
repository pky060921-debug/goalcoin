from flask import Flask, jsonify
from flask_cors import CORS
import logging
import traceback

# 분리된 모듈 불러오기
from database import init_db
from routes.api import api_bp

# 전역 에러 로깅 설정
logging.basicConfig(filename='backend_error_log.txt', level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024

# 앱 구동 시 안전하게 DB 초기화
init_db()

# 분리된 모든 API 경로를 /api 접두사와 함께 등록
app.register_blueprint(api_bp, url_prefix='/api')

# 앱 전체에서 발생하는 예측 불가능한 에러 추적
@app.errorhandler(Exception)
def handle_exception(e):
    error_info = traceback.format_exc()
    logging.error(f"[백엔드 전역 치명적 에러]\n{error_info}")
    return jsonify({"error": "백엔드 전역 시스템 오류", "details": error_info}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
