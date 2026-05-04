import os

# 데이터베이스 경로 설정
DB_PATH = os.path.expanduser("~/goalcoin/backend/blankd.db")

# Ollama 로컬 AI 통신 주소 및 확정된 모델
OLLAMA_API_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "qwen2.5-coder:14b"

# 백그라운드 작업(업로드, AI 분석 등) 상태를 공유하는 딕셔너리
TASK_STATUS = {}
