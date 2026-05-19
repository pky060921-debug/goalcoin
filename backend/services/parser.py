import re
from bs4 import BeautifulSoup

def clean_korean_law_text(text, law_name):
    """
    특정 법령명을 인자로 받아 텍스트를 정제합니다.
    오류 진단: 정규식 처리 결과 텍스트가 비정상적으로 짧아지는지 확인 가능.
    """
    try:
        # 하드코딩 제거: law_name을 통해 유연하게 처리
        pattern = rf'(?:{law_name}|시행령|시행규칙)[\sㆍ]*'
        
        text = re.sub(r'-\s*\d+\s*-', '\n', text)
        text = re.sub(r'/?\d{4}\.\d{1,2}\.\d{1,2}\s*\d{2}:\d{2}.*', '\n', text)
        text = re.sub(r'\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2}', '\n', text)
        text = re.sub(pattern, ' ', text)
        text = re.sub(r'\n{3,}', '\n\n', text)
        
        return text.strip()
    except Exception as e:
        print(f"[Error] 정제 과정 오류 발생: {e}")
        return text

def parse_law_table(html_content, law_name):
    """
    HTML 파일의 3단 비교표 구조를 파싱합니다.
    """
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        table = soup.find('table', {'class': 'lsPtnThdCmpTable'})
        if not table:
            raise ValueError("테이블 구조를 찾을 수 없습니다.")
            
        rows = table.find_all('tr')
        parsed_data = []
        
        for idx, row in enumerate(rows):
            cols = row.find_all('td')
            if not cols or len(cols) < 3: 
                continue
            
            # 법령, 시행령, 시행규칙 추출
            data = {
                '법령': clean_korean_law_text(cols[0].get_text(strip=True), law_name),
                '시행령': clean_korean_law_text(cols[1].get_text(strip=True), law_name),
                '시행규칙': clean_korean_law_text(cols[2].get_text(strip=True), law_name)
            }
            parsed_data.append(data)
            
        return parsed_data

    except Exception as e:
        print(f"[Error] 파싱 중 오류 발생: {e}")
        return None

# 실행 및 오류 진단 포함 코드
def main():
    files = {
        "국민건강보험법": "국민건강보험법(위임조문 3단비교).html",
        "노인장기요양보험법": "노인장기요양보험법(위임조문 3단비교).html"
    }
    
    for name, filename in files.items():
        try:
            with open(filename, 'r', encoding='utf-8') as f:
                content = f.read()
                result = parse_law_table(content, name)
                if result:
                    print(f"[{name}] 성공적으로 {len(result)}개의 행을 추출했습니다.")
                    # 필요한 경우 여기서 result 데이터를 출력하거나 저장
        except FileNotFoundError:
            print(f"[Error] 파일을 찾을 수 없습니다: {filename}")
        except Exception as e:
            print(f"[Error] 처리 중 예기치 못한 오류: {e}")

if __name__ == "__main__":
    main()
