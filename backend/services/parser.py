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
    print("\n🔍 ==================== [아키 엔진: 파서 정밀 진단 시스템 가동] ====================")
    soup = BeautifulSoup(html_content, 'html.parser')
    table = soup.find('table', {'class': 'lsPtnThdCmpTable'})
    
    if table:
        print("[진단-성공] 3단 비교표 테이블(lsPtnThdCmpTable)을 정상 감지했습니다.")
        categories = []
        current_chapter = "기본 폴더"
        
        context_map = {} 
        last_num = "부칙등"
        last_title = "내용"
        
        global_order = 0
        link_id_order_map = {}
        
        # 💡 요양급여의 기준에 관한 규칙 제외 설정 (기존 안정 로직)
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
        print(f"[진단-정보] 제외 대상 Column 인덱스 번호 리스트: {list(col_excludes)}")
        
        rows = table.find_all('tr')
        print(f"[진단-정보] 총 스캔 대상 HTML 행(Row) 개수: {len(rows)}개")
        
        for row_idx, row in enumerate(rows):
            tds = row.find_all('td', recursive=False)
            if not tds: continue
            
            # 💡 [진단 핵심 1] 첫 번째 칸의 텍스트가 정규식에 걸리는지 추적 중계
            first_cell_clean = clean_korean_law_text(tds[0].get_text(separator="\n", strip=True))
            first_cell_lines = [l.strip() for l in first_cell_clean.split('\n') if l.strip()]
            
            for line in first_cell_lines:
                chapter_match = re.match(r'^제\s*\d+\s*[장편절](?:\s+[^\n]+)?', line)
                if chapter_match:
                    old_folder = current_chapter
                    current_chapter = chapter_match.group(0).strip()
                    print(f"   └ [진단-폴더전환] 행 번호 {row_idx}: 폴더가 [{old_folder}] ──> [{current_chapter}]로 변경되었습니다.")
                    break
                elif line.startswith("부칙") and "제" not in line:
                    current_chapter = "부칙"
                    print(f"   └ [진단-폴더전환] 행 번호 {row_idx}: 부칙 구간에 진입하여 폴더가 [부칙]으로 고정됩니다.")
                    break
            
            if len(tds) == 1:
                print(f"[진단-행스킵] 행 번호 {row_idx}: 1칸짜리 병합행(장/절 타이틀 행)이므로 폴더명만 보존하고 넘어갑니다. (텍스트: {first_cell_lines[:1]})")
                continue
            
            for col_idx, td in enumerate(tds):
                if col_idx in col_excludes:
                    continue
                    
                groups = td.find_all('div', class_='lsptnThdCmpGroup')
                for group in groups:
                    label = group.find('label')
                    if label:
                        text = label.get_text(strip=True)
                        label_match = re.match(r'^제\s*\d+\s*[장편절](?:\s+[^\n]+)?', text)
                        if label_match:
                            current_chapter = label_match.group(0).strip()
                            print(f"       └ [진단-라벨폴더] 내부 라벨에서 장/절 발견: 폴더 [{current_chapter}] 갱신")
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
                            last_title = my_title
                    else:
                        if link_id and link_id in context_map:
                            my_num = context_map[link_id]["num"]
                            my_title = context_map[link_id]["title"]
                            current_chapter = context_map[link_id]["folder"]
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
            
        print(f"[진단-완료] 파싱 최종 완료됨: 총 {len(categories)}개 조항 빌드 완료.")
        print("💡 ==================== [진단 시스템 종료] ====================\n")
        return categories

    else:
        print("[진단-실패] 테이블을 찾지 못해 백업 단일 법령 파서로 긴급 우회합니다.")
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
