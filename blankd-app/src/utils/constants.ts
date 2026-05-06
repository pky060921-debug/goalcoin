export const SPLIT_REGEX = /(\s+|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]+|(?:은|는|이|가|을|를|의|에|에게|과|와|로서|로써|로|으로|도|만|부터|까지|이다|한다|하다|함|됨|됨을|함을|함으로써|됨으로써|대하여|대해|대한|관하여|관해|관한|등|및|에서|에서는|에서의|로부터|에의|로부터의|에도|에는|이나|나|라도|이라도|인가|든가|이든지|든지|적|적인|적으로|할|한|하는|된|될|되는|인|일|이고|이며|이면|이지|입니다|합니다|습니다)(?=\s|$|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]))/g;

// 💡 [핵심 패치] 태그 유무와 상관없이 '제X조(명칭)'까지만 제목으로 삼고, ①부터는 무조건 본문으로 넘깁니다.
export const formatCardText = (text?: string) => {
  if (!text) return { title: "제목 없음", body: "" };
  const str = String(text).trim();

  // (?:\[.*?\]\s*)? -> 태그가 있어도 되고 없어도 됨
  // [*\s]* -> 제목 끝의 별표(*)와 공백을 모두 포함하여 자름
  const match = str.match(/^((?:\[.*?\]\s*)?제\s*\d+\s*조(?:의\s*\d+)?\s*(?:\([^)]+\))?[*\s]*)(.*)/s);
  
  if (match) {
    // match[1]은 "제3조의2(국민건강보험종합계획의 수립 등) "
    // match[2]는 "① 보건복지부장관은..."
    return { title: match[1].trim(), body: match[2].trim() };
  }

  // 예외 시 줄바꿈 분리
  const lines = str.split('\n');
  if (lines.length > 1) {
    return { title: lines[0].trim(), body: lines.slice(1).join('\n').trim() };
  }
  
  return { title: str, body: str };
};

export const extractLawTag = (title: string) => {
  if (title.includes('[법]')) return '법';
  if (title.includes('[령]')) return '시행령';
  if (title.includes('[칙]') || title.includes('[규]')) return '시행규칙';
  return '';
};

// 💡 화면 출력용 순수 제목 (시스템 태그 제거)
export const getStrictTitleOnly = (text?: string) => {
  if (!text) return "제목 없음";
  const { title } = formatCardText(text);
  return title.replace(/\[.*?\]/g, '').trim();
};

export const getSortNumber = (text?: string) => {
  if (!text) return 999999;
  const str = String(text);
  const articleMatch = str.match(/제\s*(\d+)\s*조(?:의\s*(\d+))?/);
  let base = 999999;
  if (articleMatch) {
    base = parseInt(articleMatch[1]);
    if (articleMatch[2]) base += parseInt(articleMatch[2]) / 1000;
  }
  let typeScore = 0.0004;
  if (str.includes('[법]')) typeScore = 0.0001;
  else if (str.includes('[령]')) typeScore = 0.0002;
  else if (str.includes('[칙]') || str.includes('[규]')) typeScore = 0.0003;
  return base + typeScore; 
};

// 💡 아키님 원본의 완벽한 그리드 분리 속성
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
