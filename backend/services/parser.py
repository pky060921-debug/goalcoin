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
        
        # 💡 [위험 로직 완전 폐기] 표 상단에서 '요양급여' 단어로 칸을 통째로 날리던 위험한 코드를 완전히 삭제했습니다.
        
        rows = table.find_all('tr')
        for row_idx, row in enumerate(rows):
            tds = row.find_all('td', recursive=False)
            if not tds: continue
            
            # 💡 [장/절 탐지] 첫 번째 칸(법률)의 첫 줄에서 무조건 장(Chapter)을 빼냅니다.
            first_td_text = clean_korean_law_text(tds[0].get_text(separator='\n'))
            lines = [line.strip() for line in first_td_text.split('\n') if line.strip()]
            if lines:
                first_line = lines[0]
                if re.match(r'^제\s*\d+\s*[장편절]', first_line):
                    match = re.match(r'^제\s*\d+\s*[장편절][^\s]*', first_line)
                    if match:
                        raw_folder = match.group(0).strip()
                        if "총칙" in first_line and "총칙" not in raw_folder:
                            current_folder = f"{raw_folder} 총칙"
                        else:
                            current_folder = raw_folder
                elif first_line.startswith("부칙") and "제" not in first_line:
                    current_folder = "부칙"

            for col_idx, td in enumerate(tds):
                groups = td.find_all('div', class_='lsptnThdCmpGroup')
                for group in groups:
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
                    
                    # 💡 [정밀 타격 방어벽] 오직 '시행규칙(칙)'에 대해서만, 
                    # 텍스트 내에 "국민건강보험 요양급여의 기준에 관한 규칙" 또는 "요양급여비용의 내역" 등이 들어있으면 버림!
                    # 법이나 시행령은 절대 건드리지 않습니다.
                    if type_name == "칙" and ("요양급여의 기준에 관한 규칙" in html_content or "요양급여비용" in html_content):
                        # 하지만 이 조항이 진짜 '국민건강보험법 시행규칙' 소속이라면 살려야 하므로 소속 확인!
                        parent_td = group.find_parent('td')
                        if parent_td:
                             bold_p = parent_td.find('p', class_='txt_bold')
                             if bold_p and "요양급여" in bold_p.get_text():
                                 continue # 요양급여 관련 규칙의 칸이면 파싱 패스!

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
