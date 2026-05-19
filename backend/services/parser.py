import re
import html
from bs4 import BeautifulSoup
from datetime import datetime, timedelta

def clean_korean_law_text(text):
    """법령 텍스트의 불필요한 메타데이터와 공백을 제거합니다."""
    text = re.sub(r'-\s*\d+\s*-', '\n', text)
    text = re.sub(r'/?\d{4}\.\d{1,2}\.\d{1,2}\s*\d{2}:\d{2}.*', '\n', text)
    text = re.sub(r'\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2}', '\n', text)
    text = re.sub(r'(?:국민건강보험법|시행령|시행규칙)[\sㆍ]*', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'\[.+?\]', '', text) # [시행일 2024.1.1] 같은 내용 삭제
    return text.strip()

def normalize_text(text):
    """법령 조문 번호와 항 번호를 기준으로 줄바꿈을 정규화합니다."""
    text = re.sub(r'(\s*)(제\s*\d+\s*조)', r'\n\n\2', text)
    text = re.sub(r'(\s*)(①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)', r'\n\2', text)
    text = re.sub(r'([^\n다까요\.])\n(?!(제\s*\d+\s*조|①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩))', r'\1 ', text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def parse_html_3col_law(html_content):
    """
    3단 비교표(법령-시행령-시행규칙) HTML을 파싱하는 함수입니다.
    기존 parser 외에 3단 비교표 테이블을 처리하는 로직을 추가했습니다.
    """
    soup = BeautifulSoup(html_content, 'html.parser')
    table = soup.find('table', {'class': 'lsPtnThdCmpTable'})
    
    # 3단 비교표가 존재하면 전용 파서 가동
    if table:
        categories = []
        rows = table.find_all('tr')
        type_names = {0: "법률", 1: "시행령", 2: "시행규칙"}
        
        for row in rows:
            cols = row.find_all('td')
            if len(cols) >= 3:
                for col_idx, col in enumerate(cols[:3]):
                    content = clean_korean_law_text(col.get_text(separator="\n", strip=True))
                    if not content or len(content) < 5: continue
                    
                    # 조문 번호 추출 시도
                    article_match = re.search(r'제\s*(\d+)\s*조(?:의\s*(\d+))?', content)
                    article_num_str = article_match.group(0) if article_match else "조문외"
                    
                    # 제목 추출 시도
                    title_match = re.search(r'\(?\s*([^()]+?)\s*\)?', content)
                    title_text = title_match.group(1) if title_match else "내용"
                    
                    clean_title = f"[{type_names.get(col_idx, '법')}] {article_num_str} ({title_text[:15]})"
                    categories.append({"title": clean_title, "content": content, "folder_name": "3단비교표"})
        return categories

    # 3단 비교표가 아닐 경우 기존 방식대로 파싱
    else:
        categories = []
        current_chapter = "기본 폴더"
        current_law_num = "0"
        type_names = {0: "법률", 1: "시행령", 2: "시행규칙"}
        
        # 기존 로직 유지
        divs = soup.find_all(['div', 'p'])
        for div in divs:
            try:
                clean_content = clean_korean_law_text(div.get_text(separator="\n"))
                clean_content = re.sub(r'\n\s*\n', '\n', clean_content).strip()
                if len(clean_content) < 2: continue
                if clean_content in ["시행규칙", "법률", "내용없음", ".", "-"]: continue
                
                article_match = re.search(r'제\s*(\d+)\s*조(?:의\s*(\d+))?', clean_content)
                if article_match:
                    main_n, ext_n = article_match.group(1), article_match.group(2)
                    article_num_str = f"제{main_n}조" + (f"의{ext_n}" if ext_n else "")
                else: article_num_str = current_law_num.lstrip('0')
                
                title_match = re.search(r'\((.*?)\)', clean_content)
                if title_match: title_text = title_match.group(1).strip()
                else: title_text = clean_content.replace(article_num_str, "").strip().split('\n')[0][:15]
                
                clean_title = f"[법] {article_num_str} {title_text}"
                categories.append({"title": clean_title, "content": clean_content, "folder_name": current_chapter})
            except Exception: 
                continue
        return categories

def get_next_review_time(level):
    """망각 곡선에 따른 다음 복습 시점을 계산합니다."""
    # 0레벨(위험)은 즉시 복습 (1시간 후)
    if level == 0: return datetime.utcnow() + timedelta(hours=1)
    # 레벨별 복습 주기 계산 (레벨이 높을수록 주기가 길어짐)
    hours = 2 ** level
    return datetime.utcnow() + timedelta(hours=min(hours, 720)) # 최대 30일
