import re
from datetime import datetime, timedelta
from bs4 import BeautifulSoup

def clean_korean_law_text(text):
    text = re.sub(r'-\s*\d+\s*-', '\n', text)
    text = re.sub(r'/?\d{4}\.\d{1,2}\.\d{1,2}\s*\d{2}:\d{2}.*', '\n', text)
    text = re.sub(r'\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2}', '\n', text)
    # 삭제, 연혁 등 지저분한 메타데이터 완벽 제거
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
        current_folder = "기본 폴더"
        
        # 고아 텍스트 연결을 위한 문맥 맵 (link_id 기반)
        context_map = {} 
        last_num = "부칙등"
        last_title = "내용"
        
        # 순서 복원을 위한 정렬용 맵
        global_order = 0
        link_id_order_map = {}
        
        rows = table.find_all('tr')
        for row in rows:
            # 1. '장/절' 폴더명 강제 탐지기 (셀 병합 고려)
            tds = row.find_all('td', recursive=False)
            if len(tds) == 1:
                row_text = clean_korean_law_text(tds[0].get_text(strip=True))
                if re.search(r'^제\s*\d+\s*[장편절]', row_text) or "부칙" in row_text:
                    match = re.search(r'제\s*\d+\s*[장편절][^\s]*', row_text)
                    if match: current_folder = match.group(0).strip()
                    elif "부칙" in row_text: current_folder = "부칙"
                    continue

            groups = row.find_all('div', class_='lsptnThdCmpGroup')
            for group in groups:
                # 내부 숨겨진 장/절 탐지
                label = group.find('label')
                if label:
                    text = label.get_text(strip=True)
                    if re.search(r'제\s*\d+\s*[장편절]', text):
                        match = re.search(r'제\s*\d+\s*[장편절][^\s]*', text)
                        if match: current_folder = match.group(0).strip()
                        continue
                        
                lawcon = group.find('div', class_='lawcon')
                if not lawcon: continue
                
                content = clean_korean_law_text(lawcon.get_text(separator="\n", strip=True))
                if not content or len(content) < 3: continue
                
                # 💡 [해결] 텍스트가 왼쪽으로 쏠리는 문제 방지 (강제 줄바꿈 주입)
                content = re.sub(r'(?<!\n)(\d+\.)', r'\n\1', content)  # '1.', '2.' 앞에 줄바꿈
                content = re.sub(r'(?<!\n)(①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)', r'\n\1', content) # 동그라미 번호 앞에 줄바꿈
                content = re.sub(r'\n{3,}', '\n\n', content).strip()
                
                type_name = "법"
                link_id = None
                
                # 고유 링크 ID (divL168 등) 추출을 통한 법-령-칙 자석 매칭
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
                    
                    # '법'이면 번호/제목/폴더 위치를 기억장치에 저장
                    if type_name == "법" and link_id:
                        context_map[link_id] = {"num": my_num, "title": my_title, "folder": current_folder}
                    
                    if type_name == "법":
                        last_num = my_num
                        last_title = my_title
                else:
                    # 번호가 없는 '령', '칙'은 기억장치에서 부모(법)의 정보를 끌어옴
                    if link_id and link_id in context_map:
                        my_num = context_map[link_id]["num"]
                        my_title = context_map[link_id]["title"]
                        current_folder = context_map[link_id]["folder"]
                    else:
                        my_num = last_num
                        my_title = last_title
                        
                clean_title = f"[{type_name}] {my_num} ({my_title[:15]})"
                
                # 💡 [해결] 꼬여버린 순서를 완벽하게 재정렬하기 위한 번호표 부여
                if link_id:
                    if link_id not in link_id_order_map:
                        global_order += 10
                        link_id_order_map[link_id] = global_order
                    base_order = link_id_order_map[link_id]
                    
                    if type_name == "법": sort_order = base_order + 1
                    elif type_name == "령": sort_order = base_order + 2
                    else: sort_order = base_order + 3
                else:
                    global_order += 10
                    sort_order = global_order
                
                categories.append({
                    "title": clean_title, 
                    "content": content, 
                    "folder_name": current_folder,
                    "sort_order": sort_order
                })
                
        # 엉망진창이 된 DOM 순서를 버리고, 부여된 번호표 순으로 완벽 정렬
        categories.sort(key=lambda x: x["sort_order"])
        for cat in categories:
            del cat["sort_order"] # 임시 번호표 삭제
            
        return categories

    else:
        # 일반 법령 페이지용 로직
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
