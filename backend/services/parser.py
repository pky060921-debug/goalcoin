import os
import re
from bs4 import BeautifulSoup

def clean_text(text):
    """HTML 태그 제거 후 깔끔한 텍스트로 정제"""
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def parse_law_file(file_path, law_name):
    print(f"[진단] 파싱 시작: {file_path}")
    
    with open(file_path, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f, 'html.parser')
    
    table = soup.find('table', {'class': 'lsPtnThdCmpTable'})
    if not table:
        print("[진단] 오류: 테이블 구조를 찾을 수 없습니다.")
        return

    current_chapter = "기타"
    
    for row in table.find_all('tr'):
        cells = row.find_all('td')
        if not cells: continue

        # 1. 장(Chapter) 구분자 확인 및 업데이트
        # 법령 HTML에서 장은 보통 별도의 행에 포함되어 있습니다.
        row_text = row.get_text(strip=True)
        chapter_match = re.search(r'(제\s*\d+\s*장)', row_text)
        if chapter_match:
            current_chapter = chapter_match.group(1)
            continue
            
        # 2. 폴더 생성 (장별 폴더)
        folder_path = os.path.join("OUTPUT", law_name, current_chapter)
        os.makedirs(folder_path, exist_ok=True)
        
        # 3. 조항 추출 및 제목 분리
        # 첫 번째 열(법령)에서 제X조를 찾아 파일명으로 사용
        law_content = cells[0].get_text('\n', strip=True)
        article_match = re.search(r'(제\s*\d+\s*조(?:\s*의\s*\d+)?)', law_content)
        
        if article_match:
            article_title = article_match.group(1)
            # 조항 제목이 괄호()로 되어있는 경우 포함
            title_suffix = re.search(r'\((.*?)\)', law_content)
            if title_suffix:
                article_title += f"_{title_suffix.group(1)}"
        else:
            article_title = f"기타_조항_{row.get('id', 'unknown')}"

        # 4. 파일 저장
        file_path = os.path.join(folder_path, f"{article_title}.txt")
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(f"=== {article_title} ===\n\n")
                f.write(f"[법령]\n{law_content}\n\n")
                if len(cells) > 1:
                    f.write(f"[시행령]\n{cells[1].get_text('\n', strip=True)}\n\n")
                if len(cells) > 2:
                    f.write(f"[시행규칙]\n{cells[2].get_text('\n', strip=True)}")
        except Exception as e:
            print(f"[진단] 파일 저장 실패 ({article_title}): {e}")

# 실행부
if __name__ == "__main__":
    target_files = [
        ("국민건강보험법(위임조문 3단비교).html", "국민건강보험법"),
        ("노인장기요양보험법(위임조문 3단비교).html", "노인장기요양보험법")
    ]
    
    for f_name, l_name in target_files:
        if os.path.exists(f_name):
            parse_law_file(f_name, l_name)
        else:
            print(f"[진단] 파일 없음: {f_name}")
