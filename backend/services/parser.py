import re
from datetime import datetime, timedelta
from bs4 import BeautifulSoup

def clean_korean_law_text(text):
    text = re.sub(r'-\s*\d+\s*-', '\n', text)
    text = re.sub(r'/?\d{4}\.\d{1,2}\.\d{1,2}\s*\d{2}:\d{2}.*', '\n', text)
    text = re.sub(r'\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2}', '\n', text)
    text = re.sub(r'\[(?:본조신설|전문개정|제목개정|단서신설|삭제).*?\]', '', text)
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
        current_chapter = "기본 폴더"
        
        context_map = {} 
        last_num = "부칙등"
        last_title = "내용"
        
        # 💡 [추가 1] 요양급여 규칙이 들어있는 세로줄(칸) 인덱스 정확히 찾아내기
        yoyang_col_idx = -1
        for row in table.find_all('tr')[:5]:
            cells = row.find_all(['th', 'td'])
            if len(cells) >= 3:
                for idx, cell in enumerate(cells):
                    if "요양급여의 기준에 관한 규칙" in cell.get_text(strip=True):
                        yoyang_col_idx = idx
                        break
            if yoyang_col_idx != -1:
                break
        
        rows = table.find_all('tr')
        # 💡 [기능 추가] 요양급여 관련 규칙 제외를 위한 인덱스 찾기
        yoyang_col_idx = -1
        header_row = table.find('tr')
        if header_row:
            for idx, cell in enumerate(header_row.find_all(['th', 'td'])):
                if "요양급여의 기준에 관한 규칙" in cell.get_text(strip=True):
                    yoyang_col_idx = idx
                    break
        for row in rows:
            tds = row.find_all('td', recursive=False)
            if not tds: continue
            
            # 💡 [추가 2] 제목만 있는 병합 셀에서 장/절(폴더) 완벽 추출
            if len(tds) == 1:
                row_text = clean_korean_law_text(tds[0].get_text(strip=True))
                if re.match(r'^제\s*\d+\s*[장편절]', row_text):
                    match = re.match(r'^제\s*\d+\s*[장편절][^\s]*', row_text)
                    if match:
                        raw_folder = match.group(0).strip()
                        if "총칙" in row_text and "총칙" not in raw_folder:
                            current_chapter = f"{raw_folder} 총칙"
                        else:
                            current_chapter = raw_folder
                continue
            
            for col_idx, td in enumerate(tds):
                # 💡 [기능 추가] 해당 규칙 칸이면 건너뜀
                if yoyang_col_idx != -1 and col_idx == yoyang_col_idx:
                    continue

                groups = td.find_all('div', class_='lsptnThdCmpGroup')
                for group in groups:
                    label = group.find('label')
                    if label:
                        text = label.get_text(strip=True)
                        if re.match(r'^제\s*\d+\s*[장편절]', text):
                            match = re.match(r'^제\s*\d+\s*[장편절][^\s]*', text)
                            if match: 
                                raw_folder = match.group(0).strip()
                                if "총칙" in text and "총칙" not in raw_folder:
                                    current_chapter = f"{raw_folder} 총칙"
                                else:
                                    current_chapter = raw_folder
                            continue
                    
                    lawcon = group.find('div', class_='lawcon')
                    if not lawcon: continue
                    
                    content = clean_korean_law_text(lawcon.get_text(separator="\n", strip=True))
                    if not content or len(content.replace("\n", "").strip()) < 3: continue
                    
                    content = re.sub(r'(?<!\n)(\d+\.)', r'\n\1', content)  
                    content = re.sub(r'(?<!\n)(①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)', r'\n\1', content) 
                    content = re.sub(r'\n{3,}', '\n\n', content).strip()
                    
                    type_name = "법"
                    link_id = None
                    
                    span_lor = lawcon.find('span', id=re.compile(r'^div[LOR]$'))
                    if span_lor:
                        if span_lor['id'] == 'divL': type_name = "법"
                        elif span_lor['id'] == 'divO': type_name = "령"
                        elif span_lor['id'] == 'divR': type_name = "칙"
                        
                        classes = span_lor.get('class', [])
                        for cls in classes:
                            match = re.search(r'div[LOR](\d+)', cls)
                            if match:
                                link_id = match.group(1)
                                break
                    else:
                        parent_td = group.find_parent('td')
                        if parent_td:
                            bold_p = parent_td.find('p', class_='txt_bold')
                            if bold_p:
                                bold_text = bold_p.get_text()
                                if '시행령' in bold_text: type_name = "령"
                                elif '시행규칙' in bold_text: type_name = "칙"
                    
                    article_match = re.search(r'제\s*(\d+)\s*조(?:의\s*(\d+))?', content)
                    my_num = last_num
                    my_title = last_title
                    
                    if article_match:
                        my_num = article_match.group(0).replace(" ", "")
                        title_match = re.search(r'\(([^()]+)\)', content)
                        my_title = title_match.group(1).strip() if title_match else "세부내용"
                        
                        if type_name == "법" and link_id:
                            context_map[link_id] = {"num": my_num, "title": my_title, "folder": current_chapter}
                        
                        if type_name == "법":
                            last_num = my_num
                            last_title = my_title
                    else:
                        if link_id and link_id in context_map:
                            my_num = context_map[link_id]["num"]
                            my_title = context_map[link_id]["title"]
                            # 💡 령/칙도 부모(법)의 폴더를 상속받음
                            current_chapter = context_map[link_id]["folder"]
                        else:
                            my_num = last_num
                            my_title = last_title
                            
                    clean_title = f"[{type_name}] {my_num} ({my_title[:15]})"
                    categories.append({"title": clean_title, "content": content, "folder_name": current_chapter})
        return categories

    else:
        # 단일 법령용 백업 로직
        categories = []
        current_chapter = "기본 폴더"
        current_law_num = "0"
        
        divs = soup.find_all(['div', 'p'])
        for div in divs:
            try:
                if re.match(r'^제\s*\d+\s*[장편절]', div.get_text(strip=True)):
                    current_chapter = div.get_text(strip=True).split('\n')[0].strip()
                    continue

                clean_content = clean_korean_law_text(div.get_text(separator="\n"))
                clean_content = re.sub(r'\n\s*\n', '\n', clean_content).strip()
                if len(clean_content) < 2: continue
                if clean_content in ["시행규칙", "법률", "내용없음", ".", "-"]: continue
                
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

if __name__ == "__main__":
    print("[정상] parser.py가 성공적으로 초기화되었습니다.")
