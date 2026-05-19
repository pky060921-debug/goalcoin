import os
import re
from bs4 import BeautifulSoup

def safe_parse():
    # 타겟 파일 설정
    files = [
        ("국민건강보험법(위임조문 3단비교).html", "국민건강보험법"),
        ("노인장기요양보험법(위임조문 3단비교).html", "노인장기요양보험법")
    ]

    for file_name, law_name in files:
        if not os.path.exists(file_name):
            print(f"❌ 파일 없음: {file_name}")
            continue
        
        print(f"▶️ {law_name} 분석 시작...")
        try:
            # 1. 인코딩 강제 지정 및 안전한 열기
            with open(file_name, 'r', encoding='utf-8') as f:
                html = f.read()
            
            soup = BeautifulSoup(html, 'html.parser')
            table = soup.find('table', {'class': 'lsPtnThdCmpTable'})
            
            rows = table.find_all('tr')
            current_chapter = "기타"
            
            for row in rows:
                # 2. 장(Chapter) 자동 감지
                text = row.get_text(strip=True)
                if "제" in text and "장" in text and len(text) < 20:
                    current_chapter = text
                    continue
                
                # 3. 데이터가 있는 행만 처리 (3단 비교는 보통 3개의 td를 가짐)
                cells = row.find_all('td')
                if len(cells) < 3: continue
                
                # 조항 제목 정제
                law_text = cells[0].get_text(strip=True)
                match = re.search(r'(제\s*\d+\s*조(?:\s*의\s*\d+)?)', law_text)
                title = match.group(1) if match else "기타"
                
                # 폴더 및 파일 경로
                path = os.path.join("OUTPUT", law_name, current_chapter)
                os.makedirs(path, exist_ok=True)
                
                # 파일 쓰기
                file_path = os.path.join(path, f"{title}.txt")
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(f"--- 법령 ---\n{cells[0].get_text(separator='\\n', strip=True)}\n\n")
                    f.write(f"--- 시행령 ---\n{cells[1].get_text(separator='\\n', strip=True)}\n\n")
                    f.write(f"--- 시행규칙 ---\n{cells[2].get_text(separator='\\n', strip=True)}")
                    
            print(f"✅ {law_name} 동기화 완료!")
            
        except Exception as e:
            print(f"❌ 데이터 동기화 실패: {e}")

if __name__ == "__main__":
    safe_parse()
