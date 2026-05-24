import re
import sys
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
        print("\n" + "="*60)
        print("🚀 [진단 시작] 3단 비교표 파싱을 시작합니다.")
        print("="*60)
        
        categories = []
        current_chapter = "기본 폴더"
        
        context_map = {} 
        last_num = "부칙등"
        last_title = "내용"
        
        global_order = 0
        link_id_order_map = {}
        
        rows = table.find_all('tr')
        print(f"총 분석할 테이블 행(Row) 개수: {len(rows)}개\n")
        
        for row_idx, row in enumerate(rows):
            tds = row.find_all('td', recursive=False)
            if not tds: continue
            
            # 첫 번째 칸에서 장/절의 전체 이름을 유연하게 추출
            first_cell_clean = clean_korean_law_text(tds[0].get_text(separator="\n", strip=True))
            first_cell_lines = [l.strip() for l in first_cell_clean.split('\n') if l.strip()]
            
            for line in first_cell_lines:
                chapter_match = re.match(r'^제\s*\d+\s*[장편절](?:\s+[^\n]+)?', line)
                if chapter_match:
                    new_chapter = chapter_match.group(0).strip()
                    if current_chapter != new_chapter:
                        print(f"\n📁 [폴더 변경] 행 {row_idx}: '{current_chapter}' -> '{new_chapter}'")
                        current_chapter = new_chapter
                    break
                elif line.startswith("부칙") and "제" not in line:
                    if current_chapter != "부칙":
                        print(f"\n📁 [폴더 변경] 행 {row_idx}: '{current_chapter}' -> '부칙'")
                        current_chapter = "부칙"
                    break
            
            if len(tds) == 1:
                continue
            
            for col_idx, td in enumerate(tds):
                groups = td.find_all('div', class_='lsptnThdCmpGroup')
                for group in groups:
                    # 국민건강보험법 특정 규칙 예외 처리
                    is_yoyang_rule = False
                    parent_td = group.find_parent('td')
                    if parent_td:
                        bold_p = parent_td.find('p', class_='txt_bold')
                        if bold_p and "요양급여의 기준에 관한 규칙" in bold_p.get_text():
                            is_yoyang_rule = True
                            
                    if is_yoyang_rule:
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
                        first_line = content.split('\n')[0]
                        # 번호 추출 후 제목 다듬기
                        raw_title = re.sub(r'^제\s*\d+\s*조(?:의\s*\d+)?', '', first_line).strip()
                        my_title = re.sub(r'[\(\)\[\]]', '', raw_title).strip()
                        if not my_title: my_title = "세부내용"
                        
                        if type_name == "법" and link_id:
                            context_map[link_id] = {"num": my_num, "title": my_title, "folder": current_chapter}
                        
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
                            my_title = "세부내용" # 이전 제목 오염 방지
                            
                    clean_title = f"[{type_name}] {my_num} {my_title}"
                    
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
                        print(f"⚠️ [경고] 행 {row_idx}: {clean_title} 의 link_id를 찾지 못했습니다! (정렬이 밀릴 수 있습니다)")
                    
                    categories.append({
                        "title": clean_title, 
                        "content": content, 
                        "folder_name": current_chapter,
                        "sort_order": sort_order
                    })
                    
                    # 💡 4장 근처에서 문제가 발생한다고 하셨으므로, 4장일 때 집중 로그 출력
                    if "제4장" in current_chapter or "제 4장" in current_chapter:
                        print(f"  -> [추출] ID:{link_id if link_id else '없음'} | 정렬순서:{sort_order} | {clean_title}")
                    
        categories.sort(key=lambda x: x["sort_order"])
        for cat in categories:
            del cat["sort_order"]
            
        print("="*60)
        print(f"✅ 파싱 완료! 총 {len(categories)}개의 조항(카드)이 추출되었습니다.")
        print("="*60 + "\n")
        return categories

    else: 
        # HTML 3단표가 아닌 텍스트 본문일 경우
        print("\n⚠️ [진단] 3단 비교표(table)를 찾지 못해 일반 텍스트 모드로 파싱합니다.\n")
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
                
                first_line = clean_content.split('\n')[0]
                raw_title = re.sub(r'^제\s*\d+\s*조(?:의\s*\d+)?', '', first_line).strip()
                title_text = re.sub(r'[\(\)\[\]]', '', raw_title).strip()
                if not title_text: title_text = "세부내용"
                
                clean_title = f"[법] {article_num_str} {title_text}"
                categories.append({"title": clean_title, "content": clean_content, "folder_name": current_chapter})
            except Exception as e: 
                print(f"에러 발생: {e}")
                continue
        return categories
