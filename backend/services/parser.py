import os, re
from bs4 import BeautifulSoup

def clean_and_format(text):
    """텍스트 정제 및 줄바꿈 정리 (텍스트 쏠림 방지)"""
    text = re.sub(r'(?:국민건강보험법|노인장기요양보험법|시행령|시행규칙)[\sㆍ]*', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def parse_law(file_path, output_dir):
    with open(file_path, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f, 'html.parser')
    
    table = soup.find('table', {'class': 'lsPtnThdCmpTable'})
    curr_chapter = "기본"

    for row in table.find_all('tr'):
        # 1. 장 구분 감지
        chapter_match = row.find(string=re.compile(r'제\s*\d+\s*장'))
        if chapter_match:
            curr_chapter = chapter_match.strip()
            continue

        cols = row.find_all('td')
        if len(cols) < 3: continue

        # 2. 제목 추출 및 파일명 최적화
        law_txt = cols[0].get_text(strip=True)
        art_match = re.search(r'(제\s*\d+\s*조(?:\s*의\s*\d+)?)', law_txt)
        title = art_match.group(1) if art_match else "제목없음"
        
        # 3. 폴더 생성 및 저장
        path = os.path.join(output_dir, curr_chapter)
        os.makedirs(path, exist_ok=True)
        
        with open(os.path.join(path, f"{title}.txt"), 'w', encoding='utf-8') as f:
            for i, label in enumerate(['[법령]', '[시행령]', '[시행규칙]']):
                content = cols[i].get_text(separator='\n', strip=True)
                f.write(f"{label}\n{clean_and_format(content)}\n\n")

# 실행부 (파일 경로와 출력 폴더만 지정)
if __name__ == "__main__":
    files = ["국민건강보험법(위임조문 3단비교).html", "노인장기요양보험법(위임조문 3단비교).html"]
    for f_name in files:
        if os.path.exists(f_name):
            parse_law(f_name, f"OUTPUT_{f_name.split('(')[0]}")
            print(f"✅ {f_name} 처리 완료")
