import os, re
from bs4 import BeautifulSoup

def clean_korean_law_text(text):
    # 정규식 패턴: 텍스트 정제
    text = re.sub(r'-\s*\d+\s*-', '\n', text)
    text = re.sub(r'/?\d{4}\.\d{1,2}\.\d{1,2}\s*\d{2}:\d{2}.*', '\n', text)
    text = re.sub(r'\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2}', '\n', text)
    text = re.sub(r'(?:국민건강보험법|노인장기요양보험법|시행령|시행규칙)[\sㆍ]*', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def process_law_file(file_path):
    law_name = file_path.split('(')[0]
    with open(file_path, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f, 'html.parser')
    
    table = soup.find('table', {'class': 'lsPtnThdCmpTable'})
    if not table:
        print(f"테이블을 찾을 수 없음: {file_path}")
        return
    
    current_chapter = "기타"
    
    for row in table.find_all('tr'):
        # 1. 장(Chapter) 감지
        chapter_row = row.find(string=re.compile(r'제\s*\d+\s*장'))
        if chapter_row:
            current_chapter = chapter_row.strip()
            continue
            
        cols = row.find_all('td')
        if len(cols) < 3: continue
        
        # 2. 제목 추출
        content = cols[0].get_text(strip=True)
        art_match = re.search(r'(제\s*\d+\s*조(?:\s*의\s*\d+)?)', content)
        title = art_match.group(1) if art_match else f"조항_{row.get('id', 'unknown')}"
        
        # 3. 폴더 생성 및 파일 저장
        save_path = os.path.join("OUTPUT", law_name, current_chapter)
        os.makedirs(save_path, exist_ok=True)
        
        # 문제 해결: f-string 내부의 backslash를 변수로 치환
        newline = '\n'
        file_content = (
            f"【법령】{newline}{clean_korean_law_text(cols[0].get_text(separator=newline))}{newline*2}"
            f"【시행령】{newline}{clean_korean_law_text(cols[1].get_text(separator=newline))}{newline*2}"
            f"【시행규칙】{newline}{clean_korean_law_text(cols[2].get_text(separator=newline))}"
        )
        
        with open(os.path.join(save_path, f"{title}.txt"), 'w', encoding='utf-8') as f:
            f.write(file_content)

if __name__ == "__main__":
    files = ["국민건강보험법(위임조문 3단비교).html", "노인장기요양보험법(위임조문 3단비교).html"]
    for f_name in files:
        if os.path.exists(f_name):
            print(f"처리 중: {f_name}")
            process_law_file(f_name)
        else:
            print(f"파일 없음: {f_name}")
    print("모든 작업이 완료되었습니다.")
