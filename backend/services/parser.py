import re
import html
from datetime import datetime, timedelta
from bs4 import BeautifulSoup

def clean_korean_law_text(text):
    text = re.sub(r'-\s*\d+\s*-', '\n', text)
    text = re.sub(r'/?\d{4}\.\d{1,2}\.\d{1,2}\s*\d{2}:\d{2}.*', '\n', text)
    text = re.sub(r'\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2}', '\n', text)
    
    # 3단 비교표에 자주 등장하는 연혁 메타데이터 삭제 방어 로직 적용
    text = re.sub(r'\[(?:본조신설|전문개정|제목개정|단서신설).*?\]', '', text)
    text = re.sub(r'\[(?:종전 제.*?조는 제.*?조로 이동).*?\]', '', text)
    
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def normalize_text(text):
    text = re.sub(r'(\s*)(제\s*\d+\s*조)', r'\n\n\2', text)
    text = re.sub(r'(\s*)(①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)', r'\n\2', text)
    text = re.sub(r'([^\n다까요\.])\n(?!(제\s*\d+\s*조|①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩))', r'\1 ', text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def parse_html_3col_law(html_content):
    soup = BeautifulSoup(html_content, 'html.parser')
    table = soup.find('table', {'class': 'lsPtnThdCmpTable'})
    
    if table:
        categories = []
        current_folder = "기본 폴더"
        
        # div.lsptnThdCmpGroup 단위로 순차 탐색 (rowspan 꼬임 완벽 방어)
        groups = table.find_all('div', class_='lsptnThdCmpGroup')
        for group in groups:
            lawcon = group.find('div', class_='lawcon')
            if not lawcon:
                # 장/절 등의 헤더를 인식하여 폴더명으로 자동 추출
                label = group.find('label')
                if label:
                    text = label.get_text(strip=True)
                    if "장" in text or "편" in text:
                        current_folder = text
                continue
                
            content = clean_korean_law_text(lawcon.get_text(separator="\n", strip=True))
            if not content or len(content) < 5: continue
            
            # 고유 ID 감지를 통한 완벽한 법/령/칙 구분
            type_name = "법"
            span_lor = lawcon.find('span', id=re.compile(r'^div[LOR]$'))
            if span_lor:
                if span_lor['id'] == 'divL': type_name = "법"
                elif span_lor['id'] == 'divO': type_name = "령"
                elif span_lor['id'] == 'divR': type_name = "칙"
            else:
                td = group.find_parent('td')
                if td:
                    bold_p = td.find('p', class_='txt_bold')
                    if bold_p:
                        bold_text = bold_p.get_text()
                        if '시행령' in bold_text: type_name = "령"
                        elif '시행규칙' in bold_text: type_name = "칙"
            
            # 조문 번호 정밀 추출
            article_match = re.search(r'제\s*(\d+)\s*조(?:의\s*(\d+))?', content)
            article_num_str = article_match.group(0).replace(" ", "") if article_match else "부칙등"
            
            # 제목 추출
            title_match = re.search(r'\(([^()]+)\)', content)
            title_text = title_match.group(1).strip() if title_match else "세부내용"
            
            clean_title = f"[{type_name}] {article_num_str} ({title_text[:15]})"
            categories.append({
                "title": clean_title, 
                "content": content, 
                "folder_name": current_folder
            })
            
        return categories

    else:
        # 3단 비교표 테이블이 없는 일반 법령 페이지용 기존 파싱 로직
        categories = []
        current_chapter = "기본 폴더"
        current_law_num = "0"
        
        divs = soup.find_all(['div', 'p'])
        for div in divs:
            try:
                clean_content = clean_korean_law_text(div.get_text(separator="\n"))
                clean_content = re.sub(r'\n\s*\n', '\n', clean_content).strip()
                if len(clean_content) < 2: continue
                if clean_content in ["시행규칙", "법률", "내용없음", ".", "-"]: continue
                
                # 장/절 추출 시도
                if re.match(r'^제\s*\d+\s*[장편절]', clean_content):
                    current_chapter = clean_content.split('\n')[0].strip()
                    continue
                
                article_match = re.search(r'제\s*(\d+)\s*조(?:의\s*(\d+))?', clean_content)
                if article_match:
                    main_n, ext_n = article_match.group(1), article_match.group(2)
                    article_num_str = f"제{main_n}조" + (f"의{ext_n}" if ext_n else "")
                    current_law_num = article_num_str
                else: 
                    article_num_str = current_law_num
                
                title_match = re.search(r'\((.*?)\)', clean_content)
                if title_match: title_text = title_match.group(1).strip()
                else: title_text = clean_content.replace(article_num_str, "").strip().split('\n')[0][:15]
                
                clean_title = f"[법] {article_num_str} {title_text}"
                categories.append({"title": clean_title, "content": clean_content, "folder_name": current_chapter})
            except Exception: 
                continue
        return categories

def get_next_review_time(level):
    now = datetime.utcnow()
    if level == 0: return now + timedelta(hours=12)
    elif level == 1: return now + timedelta(days=1)
    elif level == 2: return now + timedelta(days=3)
    else: return now + timedelta(days=7)
