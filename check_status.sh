#!/bin/bash
echo "=========================================="
echo "🚀 BlankD & Goalcoin 시스템 진단 시작"
echo "=========================================="

# 1. PM2 상태 확인
echo -e "\n[1. PM2 프로세스 상태]"
pm2 status

# 2. 포트 점유 상태 확인 (3001: GC, 3002: BlankD, 5001: API)
echo -e "\n[2. 포트 활성화 체크]"
ports=(3001 3002 5001)
for port in "${ports[@]}"; do
    if lsof -i :$port > /dev/null; then
        echo "✅ 포트 $port: 정상 작동 중"
    else
        echo "❌ 포트 $port: 응답 없음 (서버 다운 의심)"
    fi
done

# 3. 로컬 접속 테스트
echo -e "\n[3. 내부 응답 테스트 (Local Loopback)]"
curl -s -I http://localhost:3001 | head -n 1 | xargs echo "Goalcoin(3001):"
curl -s -I http://localhost:3002 | head -n 1 | xargs echo "BlankD(3002):"

# 4. 클라우드플레어 터널 프로세스 확인
echo -e "\n[4. 터널(cloudflared) 생존 확인]"
if pgrep cloudflared > /dev/null; then
    echo "✅ Tunnel: 실행 중"
else
    echo "❌ Tunnel: 프로세스가 죽었습니다. (sudo pkill -9 cloudflared 필요)"
fi

echo "=========================================="
