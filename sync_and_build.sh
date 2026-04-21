#!/bin/bash
PROJECT_DIR="/Users/a1/goalcoin"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo "🔄 시스템 동기화 시작: $(date)"
cd $PROJECT_DIR

# 1. 아키님의 방향 지시($1)에 따른 분기 처리
if [ "$1" = "push" ]; then
    echo "⬆️ [맥미니 ➔ 깃허브] 로컬에서 수정한 코드를 깃허브로 업로드(저장)합니다."
    git add .
    git commit -m "맥미니 터미널에서 직접 수정 및 배포: $(date +'%Y-%m-%d %H:%M:%S')"
    git push origin main
    echo "✅ 업로드 완료!"
else
    echo "⬇️ [깃허브 ➔ 맥미니] 깃허브의 코드로 덮어씁니다. (명령어 없을 시 기본값)"
    git fetch origin main
    git reset --hard origin/main
    echo "✅ 다운로드(덮어쓰기) 완료!"
fi

# 2. 서버 포트 초기화 및 재시작
echo "🔄 서버를 초기화하고 재시작합니다..."
PID=$(lsof -t -i:3001)
if [ ! -z "$PID" ]; then
    kill -9 $PID
fi

cd $FRONTEND_DIR
nohup npm run dev -- --force > $PROJECT_DIR/frontend_server.log 2>&1 &
echo "🎯 서버가 3001번 포트에서 정상적으로 가동되었습니다."
