export const SPLIT_REGEX = /(\s+|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]+|(?:은|는|이|가|을|를|의|에|에게|과|와|로서|로써|로|으로|도|만|부터|까지|이다|한다|하다|함|됨|됨을|함을|함으로써|됨으로써|대하여|대해|대한|관하여|관해|관한|등|및|에서|에서는|에서의|로부터|에의|로부터의|에도|에는|이나|나|라도|이라도|인가|든가|이든지|든지|적|적인|적으로|할|한|하는|된|될|되는|인|일|이고|이며|이면|이지|입니다|합니다|습니다)(?=\s|$|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]))/g;

// 💡 [신규 추가] DB의 memo 필드에 일반 메모와 통계(채운 갯수, 오답 배열)를 분리/저장하는 함수
export const parseCardStats = (memoStr?: string) => {
  if (!memoStr) return { text: "", filled: 0, wrongIndices: [] };
  const delim = '###STATS###';
  if (memoStr.includes(delim)) {
    try {
      const [text, statsStr] = memoStr.split(delim);
      const stats = JSON.parse(statsStr);
      return { text: text || "", filled: stats.filled || 0, wrongIndices: stats.wrongIndices || [] };
    } catch (e) {
      return { text: memoStr, filled: 0, wrongIndices: [] };
    }
  }
  return { text: memoStr, filled: 0, wrongIndices: [] };
};

export const stringifyCardStats = (text: string, filled: number, wrongIndices: number[]) => {
  return `${text}###STATS###${JSON.stringify({ filled, wrongIndices })}`;
};

export const formatCardText = (text?: string) => {
  if (!text) return { title: "제목 없음", body: "" };
  const str = String(text);
  
  if (str.includes('\n\n')) {
    const parts = str.split('\n\n');
    return {
      title: parts[0].trim(),
      body: parts.slice(1).join('\n\n').trimStart()
    };
  }

  let tag = "";
  let remaining = str.trimStart();
  
  const tagMatch = remaining.match(/^(\[(?:법|령|칙|규)\])/);
  if (tagMatch) {
    tag = tagMatch[1];
    remaining = remaining.substring(tag.length).trimStart();
  }

  const titleRegex = /(제\s*\d+\s*조(?:\s*의\s*\d+)?\s*(?:[(（][^)）]+[)）])?)/;
  const match = remaining.match(titleRegex);

  if (match && match.index !== undefined) {
    const titlePart = match[1].trim(); 
    const beforeTitle = remaining.substring(0, match.index).trim();
    const afterTitle = remaining.substring(match.index + match[1].length).trimStart();
    
    let bodyPart = (beforeTitle ? beforeTitle + "\n" : "") + afterTitle;
    bodyPart = bodyPart.replace(/^[*]/, '').trimStart();

    return {
      title: tag ? `${tag} ${titlePart}` : titlePart,
      body: bodyPart
    };
  }

  const circleMatch = remaining.match(/([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]|\n)/);
  if (circleMatch && circleMatch.index !== undefined) {
    const splitIdx = circleMatch.index;
    return {
      title: tag ? `${tag} ${remaining.substring(0, splitIdx).trim()}` : remaining.substring(0, splitIdx).trim(),
      body: remaining.substring(splitIdx)
    };
  }

  return { title: str.trim(), body: str.trim() };
};

export const extractLawTag = (title: string) => {
  if (title.includes('[법]')) return '법';
  if (title.includes('[령]')) return '시행령';
  if (title.includes('[칙]') || title.includes('[규]')) return '시행규칙';
  return '';
};

export const getStrictTitleOnly = (text: string) => {
  if (!text) return "제목 없음";
  
  // 💡 정규식 개선: '제XX조' 패턴을 찾고, 그 뒤에 오는 내용을 괄호와 관계없이 추출합니다.
  // 1. '제'로 시작하여 '조'로 끝나는 조항 번호 패턴
  // 2. 그 뒤에 오는 공백과 나머지 조항명 (괄호 포함)을 추출
  const match = text.match(/(제\s*\d+\s*조(?:\s*의\s*\d+)?)\s*(.*)/);
  
  if (match) {
    const articleNumber = match[1].replace(/\s+/g, ' '); // 제41조
    const titleName = match[2] ? match[2].replace(/[()]/g, '').trim() : ""; // 괄호 제거 후 이름만
    return `${articleNumber} ${titleName}`.trim();
  }
  
  // 실패 시 첫 줄 반환
  return text.split('\n')[0].replace(/[()]/g, '').trim();
};

export const getSortNumber = (text?: string) => {
  if (!text) return 999999;
  const str = String(text);
  
  // 1. 조항 번호 추출
  const articleMatch = str.match(/제\s*(\d+)\s*조(?:의\s*(\d+))?/);
  let base = 999999;
  if (articleMatch) {
    base = parseInt(articleMatch[1]) * 1000; // 조항 번호에 가중치
    if (articleMatch[2]) base += parseInt(articleMatch[2]);
  }

  // 2. 법/령/칙 점수 (법=0.1, 령=0.2, 칙=0.3) -> 작은 게 앞에 옴
  let typeScore = 0.4; // 나머지
  if (str.includes('[법]')) typeScore = 0.1;
  else if (str.includes('[령]')) typeScore = 0.2;
  else if (str.includes('[칙]') || str.includes('[규]')) typeScore = 0.3;
  
  return base + typeScore; 
};

export const getGridStyle = (text: string, currentViewMode: string, isExpanded: boolean, colCount: number) => {
  if (isExpanded) return { gridColumn: "1 / -1" }; 
  const isLaw = text?.includes('[법]');
  const isDecret = text?.includes('[령]');
  const isRule = text?.includes('[칙]') || text?.includes('[규]');
  
  if (currentViewMode === 'all' && colCount >= 3 && (isLaw || isDecret || isRule)) {
    if (isLaw) return { gridColumn: "1" };
    if (isDecret) return { gridColumn: "2" };
    if (isRule) return { gridColumn: "3" };
  }
  return {};
};
