import re
import html
from datetime import datetime, timedelta

def clean_korean_law_text(text):
    text = re.sub(r'-\s*\d+\s*-', '\n', text)
    text = re.sub(r'/?\d{4}\.\d{1,2}\.\d{1,2}\s*\d{2}:\d{2}.*', '\n', text)
    text = re.sub(r'\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2}', '\n', text)
    text = re.sub(r'(?:국민건강보험법|시행령|시행규칙)[\sㆍ]*', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def normalize_text(text):
    text = re.sub(r'(\s*)(제\s*\d+\s*조)', r'\n\n\2', text)
    text = re.sub(r'(\s*)(①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)', r'\n\2', text)
    text = re.sub(r'([^\n다까요\.])\n(?!(제\s*\d+\s*조|①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩))', r'\1 ', text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def parse_html_3col_law(raw_text):
    unescaped = html.unescape(raw_text)
    pre_clean = re.sub(r'<(br|p|div|li)[^>]*>', '\n', unescaped, flags=re.IGNORECASE)
    pre_clean = re.sub(r'</(p|div|li|td|tr)>', '\n', pre_clean, flags=re.IGNORECASE)
    rows = re.split(r'<tr[^>]*>', pre_clean, flags=re.IGNORECASE)
    categories = []
    
    if len(rows) > 1:
        current_chapter = "기본 폴더"
        current_law_num = "000조"
        type_names = {0: '법', 1: '령', 2: '규'} # 3번째 단은 [규]로 파싱
        
        for row_html in rows[1:]:
            try:
                row_text = re.sub(r'<[^>]+>', ' ', row_html).strip()
                row_text = re.sub(r'\s+', ' ', row_text)
                
                # '제X장' 폴더(장별) 추출 로직
                chap_match = re.search(r'제\s*(\d+)\s*장\s*(.*)', row_text)
                if chap_match:
                    c_num = chap_match.group(1)
                    c_name = re.sub(r'[^\w\s]', '', chap_match.group(2).split('(')[0]).strip()[:15] or "총칙"
                    current_chapter = f"제{int(c_num)}장 {c_name}"
                    if len(row_text) < 40 and "조" not in row_text:
                        continue

                cols = re.split(r'<td[^>]*>', row_html, flags=re.IGNORECASE)[1:]
                if not cols: continue
                c0_raw = re.sub(r'<[^>]+>', '', cols[0]).strip()
                is_act_cell = bool(re.match(r'^\s*제\s*\d+\s*조(?:\s*의\s*\d+)?', c0_raw))
                mapped_cols = ["", "", ""]
                
                if len(cols) >= 3: 
                    mapped_cols = cols[:3]
                elif len(cols) == 2:
                    if is_act_cell: mapped_cols[0], mapped_cols[1] = cols[0], cols[1]
                    else: mapped_cols[1], mapped_cols[2] = cols[0], cols[1]
                elif len(cols) == 1:
                    if is_act_cell: mapped_cols[0] = cols[0]
                    else: mapped_cols[1] = cols[0]

                if mapped_cols[0].strip():
                    law_match = re.search(r'제\s*(\d+)\s*조(?:\s*의\s*(\d+))?', re.sub(r'<[^>]+>', '', mapped_cols[0]))
                    if law_match:
                        main_num, ext_part = law_match.group(1), law_match.group(2)
                        current_law_num = f"{int(main_num):03d}조"
                        if ext_part: current_law_num += f"의{ext_part}"
                
                if current_law_num == "000조":
                    fallback = re.search(r'제\s*(\d+)\s*조(?:\s*의\s*(\d+))?', row_text)
                    if fallback:
                        main_num, ext_part = fallback.group(1), fallback.group(2)
                        current_law_num = f"{int(main_num):03d}조"
                        if ext_part: current_law_num += f"의{ext_part}"

                for col_idx in range(3):
                    html_content = mapped_cols[col_idx]
                    if not html_content or len(html_content) < 5: continue
                    clean_content = re.sub(r'<[^>]+>', '', html_content)
                    if re.search(r'국민건강보험\s*요양급여의\s*기준', clean_content): continue
                    clean_content = re.sub(r'「?국민건강보험법\s*시행(?:령|규칙)」?', '', clean_content)
                    clean_content = re.sub(r'([^\n])\s*(\d+\.)', r'\1\n\2', clean_content)
                    clean_content = re.sub(r'[①-⑮\[<].*?[\d\.]+.*?[\]>]', '', clean_content)
                    clean_content = clean_content.replace("시행령", "").replace("시행규칙", "")
                    clean_content = re.sub(r'[ \t]+', ' ', clean_content)
                    clean_content = re.sub(r'\n\s*\n', '\n', clean_content).strip()
                    if len(clean_content) < 2: continue
                    if clean_content in ["시행규칙", "법률", "내용없음", ".", "-"]: continue
                    
                    article_match = re.search(r'제\s*(\d+)\s*조(?:\s*의\s*(\d+))?', clean_content)
                    if article_match:
                        main_n, ext_n = article_match.group(1), article_match.group(2)
                        article_num_str = f"제{main_n}조" + (f"의{ext_n}" if ext_n else "")
                    else: article_num_str = current_law_num.lstrip('0')
                    
                    title_match = re.search(r'\((.*?)\)', clean_content)
                    if title_match: title_text = title_match.group(1).strip()
                    else: title_text = clean_content.replace(article_num_str, "").strip().split('\n')[0][:15]
                    
                    clean_title = f"[{type_names.get(col_idx, '법')}] {article_num_str} {title_text}"
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
