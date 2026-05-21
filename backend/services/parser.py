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

# 💡 [폴더 추출기] "제1장 총칙" 등 폴더명을 가장 정확하게 뽑아내는 전용 함수
def extract_folder_name(text):
    text = text.strip()
    match = re.match(r'^제\s*\d+\s*[장편절]', text)
    if match:
        raw_folder = match.group(0).strip()
        if "총칙" in text and "총칙" not in raw_folder:
            return f"{raw_folder} 총칙"
        return raw_folder
    elif text.startswith("부칙") and not re.match(r'^부칙\s*제', text):
        return "부칙"
    return None

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
        
        context_map = {} 
        last_num = "부칙등"
        last_title = "내용"
        
        global_order = 0
        link_id_order_map = {}
        
        # 💡 [정밀 타격 1] 표의 맨 윗줄(칸 제목)을 훑어 제외할 '특정 규칙 칸' 번호를 찾습니다.
        col_excludes = set()
        for row in table.find_all('tr')[:5]:
            cells = row.find_all(['th', 'td'])
            if len(cells) > 1:
                is_header = False
                for idx, cell in enumerate(cells):
                    cell_text = cell.get_text(strip=True)
                    # 이 줄이 제목줄인지 판단
                    if "법률" in cell_text or "시행령" in cell_text or "규칙" in cell_text or "요양급여" in cell_text:
                        is_header = True
                    # 오직 아래 문구가 포함된 특수 규칙 칸만 블랙리스트에 추가
                    if "요양급여의 기준에 관한 규칙" in cell_text or "요양급여비용" in cell_text:
                        col_excludes.add(idx)
                
                if is_header:
                    break # 제목줄을 한 번 스캔했으면 스탑!
        
        rows = table.find_all('tr')
        for row_idx, row in enumerate(rows):
            tds = row.find_all('td', recursive=False)
            if not tds: continue
            
            # 💡 [폴더 인식 1] 칸이 한 개로 병합된 제목줄에서 폴더명("제1장 총칙" 등) 획득
            if len(tds) == 1:
                row_text_full = clean_korean_law_text(tds[0].get_text(strip=True))
                folder_name = extract_folder_name(row_text_full)
                if folder_name:
                    current_folder = folder_name
                continue
            
            for col_idx, td in enumerate(tds):
                # 블랙리스트에 등록된 "요양급여 규칙" 칸은 아예 파싱하지 않고 건너뜁니다! (법/령은 안전)
                if col_idx in col_excludes:
                    continue
                    
                groups = td.find_all('div', class_='lsptnThdCmpGroup')
                for group in groups:
                    # 💡 [폴더 인식 2] 각 칸 내부에 숨겨진 제목 라벨에서도 폴더명 획득
                    label = group.find('label')
                    if label:
                        label_text = label.get_text(strip=True)
                        folder_name = extract_folder_name(label_text)
                        if folder_name:
                            current_folder = folder_name
                        # 글씨만 있고 조문 내용은 없는 블록이면 패스
                        if not group.find('div', class_='lawcon'):
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
                        if col_idx == 0: type_name = "법"
                        elif col_idx == 1: type_name = "령"
                        elif col_idx >= 2: type_name = "칙"
                    
                    article_match = re.search(r'제\s*(\d+)\s*조(?:의\s*(\d+))?', content)
                    my_num = last_num
                    my_title = last_title
                    
                    if article_match:
                        my_num = article_match.group(0).replace(" ", "")
                        title_match = re.search(r'\(([^()]+)\)', content)
                        my_title = title_match.group(1).strip() if title_match else "세부내용"
                        
                        if type_name == "법" and link_id:
                            context_map[link_id] = {"num": my_num, "title": my_title, "folder": current_folder}
                        
                        if type_name == "법":
                            last_num = my_num
                            last_title = my_title
                    else:
                        if link_id and link_id in context_map:
                            my_num = context_map[link_id]["num"]
                            my_title = context_map[link_id]["title"]
                            current_folder = context_map[link_id]["folder"] 
                        else:
                            my_num = last_num
                            my_title = last_title
                            
                    clean_title = f"[{type_name}] {my_num} ({my_title[:15]})"
                    
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
                    
        categories.sort(key=lambda x: x["sort_order"])
        for cat in categories:
            del cat["sort_order"]
            
        return categories

    else:
        categories = []
        current_chapter = "기본 폴더"
        current_law_num = "0"
        
        divs = soup.find_all(['div', 'p'])
        for div in divs:
            try:
                row_text_full = div.get_text(strip=True)
                folder_name = extract_folder_name(row_text_full)
                if folder_name:
                    current_chapter = folder_name
                    continue

                clean_content = clean_korean_law_text(div.get_text(separator="\n"))
                clean_content = re.sub(r'\n\s*\n', '\n', clean_content).strip()
                if len(clean_content) < 2: continue
                if clean_content in ["시행규칙", "법률", "내용없음", ".", "-"]: continue
                
                folder_name_inner = extract_folder_name(clean_content)
                if folder_name_inner:
                    current_chapter = folder_name_inner
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
