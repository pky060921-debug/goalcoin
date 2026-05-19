import os
import re
from bs4 import BeautifulSoup

def clean_text(text):
    """불필요한 공백과 특수문자를 제거합니다."""
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def parse_and_save_law(html_content, base_folder, law_name):
    soup = BeautifulSoup(html_content, 'html.parser')
    table = soup.find('table', {'class': 'lsPtnThdCmpTable'})
    
    current_chapter = "기타"
    
    for row in table.find_all('tr'):
        cells = row.find_all('td')
        if not cells: continue

        # 1. 장(Chapter) 구분자 확인
        # HTML 구조상 장 이름이 포함된 row는 보통 colspan이나 특정 클래스를 가짐
        chapter_header = row.find('p', {'class': 'go_chapter'}) or row.find(string=re.compile(r'제\d+장'))
        if chapter_header:
            current_chapter = str(chapter_header).strip()
            continue
            
        # 2. 폴더 생성
        folder_path = os.path.join(base_folder, law_name, current_chapter)
        os.makedirs(folder_path, exist_ok=True)
        
        # 3. 조항 내용 추출 (법령, 시행령, 시행규칙)
        # 텍스트가 왼쪽으로 쏠리는 문제 해결: get_text()로 깨끗하게 추출
        row_data = [cell.get_text('\n', strip=True) for cell in cells]
        
        # 조항 제목 추출 (정규식: 제X조)
        article_match = re.search(r'(제\s*\d+\s*조(?:\s*의\s*\d+)?)', row_data[0])
        article_title = article_match.group(1) if article_match else "제목없음"
        
        # 4. 파일 저장
        file_name = f"{article_title}.txt"
        file_path = os.path.join(folder_path, file_name)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(f"--- {article_title} ---\n\n")
            f.write(f"[법령]\n{row_data[0]}\n\n")
            f.write(f"[시행령]\n{row_data[1] if len(row_data)>1 else '내용없음'}\n\n")
            f.write(f"[시행규칙]\n{row_data[2] if len(row_data)>2 else '내용없음'}")

# 오류 진단 포함 실행부
def run_parser():
    target_files = [
        ("국민건강보험법(위임조문 3단비교).html", "국민건강보험법"),
        ("노인장기요양보험법(위임조문 3단비교).html", "노인장기요양보험법")
    ]
    
    for file_name, law_name in target_files:
        try:
            if not os.path.exists(file_name):
                print(f"[진단] 오류: {file_name} 파일을 찾을 수 없습니다.")
                continue
            with open(file_name, 'r', encoding='utf-8') as f:
                parse_and_save_law(f.read(), "OUTPUT_LAWS", law_name)
            print(f"[완료] {law_name} 파싱 완료.")
        except Exception as e:
            print(f"[진단] {law_name} 파싱 중 오류 발생: {e}")

if __name__ == "__main__":
    run_parser()
