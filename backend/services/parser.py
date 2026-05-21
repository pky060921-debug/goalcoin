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
        current_chapter = "기본 폴더"  # 장이 발견되기 전 기본값
        
        context_map = {} 
        last_num = "부칙등"
        last_title = "내용"
        
        global_order = 0
        link_id_order_map = {}
        
        # 💡 [요양급여 기준 규칙 칸 제외 설정]
        col_excludes = set()
        thead = table.find('thead')
        if not thead:
            first_tr = table.find('tr')
            header_cells = first_tr.find_all(['th', 'td']) if first_tr else []
        else:
            header_cells = thead.find_all(['th', 'td'])
            
        for idx, cell in enumerate(header_cells):
            cell_text = cell.get_text(strip=True)
            if "요양급여의 기준" in cell_text or "요양급여비용" in cell_text:
                col_excludes.add(idx)
        
        rows = table.find_all('tr')
        for row_idx, row in enumerate(rows):
            tds = row.find_all('td', recursive=False)
            if not tds: continue
            
            # 💡 [장/절 폴더 추적 엔진 강화]
            # 셀이 1개이든 3개이든 첫 번째 칸에 '제 N 장' 텍스트가 있다면 무조건 상속받을 폴더명을 갱신합니다.
            first_cell_clean = clean_korean_law_text(tds[0].get_text(separator="\n", strip=True))
            first_cell_lines = [l.strip() for l in first_cell_clean.split('\n') if l.strip()]
            
            for line in first_cell_lines:
                # 공백이나 탭 문자가 섞여 있어도 '제X장' 또는 '제X절'을 완벽히 인식하여 매칭합니다.
                chapter_match = re.match(r'^제\s*\d+\s*[장편절](?:\s+[^\n]+)?', line)
                if chapter_match:
                    current_chapter = chapter_match.group(0).strip()
                    break
                elif line.startswith("부칙") and "제" not in line:
                    current_chapter = "부칙"
                    break
            
            # 행 전체가 하나로 합쳐진 제목 행일 경우, 폴더명만 갱신하고 조문 파싱 루프는 건너뜁니다.
            if len(tds) == 1:
                continue
            
            for col_idx, td in enumerate(tds):
                # 제외 대상인 '요양급여의 기준에 관한 규칙' 세로 칸은 원천 배제합니다.
                if col_idx in col_excludes:
                    continue
                    
                groups = td.find_all('div', class_='lsptnThdCmpGroup')
                for group in groups:
                    
                    # 💡 하위 라벨에 또 한 번 숨겨진 장/절 매칭 가드레일
                    label = group.find('label')
                    if label:
                        label_text = label.get_text(strip=True)
                        label_match = re.match(r'^제\s*\d+\s*[장편절](?:\s+[^\n]+)?', label_text)
                        if label_match:
                            current_chapter = label_match.group(0).strip()
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
                        my_num_title = title_match.group(1).strip() if title_match else "세부내용"
                        
                        if type_name == "법" and link_id:
                            context_map[link_id] = {"num": my_num, "title": my_num_title, "folder": current_chapter}
                        
                        if type_name == "법":
                            last_num = my_num
                            last_title = my_num_title
                    else:
                        if link_id and link_id in context_map:
                            my_num = context_map[link_id]["num"]
                            my_title = context_map[link_id]["title"]
                            current_chapter = context_map[link_id]["folder"] # 부모(법)의 폴더 흐름 동기화
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
                        "folder_name": current_chapter,
                        "sort_order": sort_order
                    })
                    
        categories.sort(key=lambda x: x["sort_order"])
        for cat in categories:
            del cat["sort_order"]
            
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
