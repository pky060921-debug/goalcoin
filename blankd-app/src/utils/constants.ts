export const SPLIT_REGEX = /(\s+|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]+|(?:은|는|이|가|을|를|의|에|에게|과|와|로서|로써|로|으로|도|만|부터|까지|이다|한다|하다|함|됨|됨을|함을|함으로써|됨으로써|대하여|대해|대한|관하여|관해|관한|등|및|에서|에서는|에서의|로부터|에의|로부터의|에도|에는|이나|나|라도|이라도|인가|든가|이든지|든지|적|적인|적으로|할|한|하는|된|될|되는|인|일|이고|이며|이면|이지|입니다|합니다|습니다)(?=\s|$|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]))/g;

// 💡 [핵심 해결] 제목과 본문을 조항 괄호 뒤의 기호(① 등)를 기준으로 칼같이 나눕니다.
export const formatCardText = (text?: string) => {
  if (!text) return { title: "제목 없음", body: "" };
  const str = String(text).trim();
  
  // 1. 우선 정규식으로 조항 제목 부분을 찾습니다.
  // 제X조의X(명칭) 뒤에 동그라미 숫자(①~⑮)나 별표(*)가 오면 거기서 자릅니다.
  const splitMatch = str.match(/^(\[.*?\]\s*제\s*\d+\s*조(?:의\s*\d+)?\s*(?:\([^)]+\))?[*\s]*)(.*)/s);
  
  if (splitMatch) {
    let titlePart = splitMatch[1].trim();
    let bodyPart = splitMatch[2].trim();
    
    // 만약 타이틀 끝에 ① 같은 숫자가 붙어있다면 본문으로 밀어냅니다.
    const circleMatch = titlePart.match(/(.*)([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮].*)/);
    if (circleMatch) {
      titlePart = circleMatch[1].trim();
      bodyPart = circleMatch[2] + " " + bodyPart;
    }
    
    return { title: titlePart, body: bodyPart.trim() };
  }

  // 2. 정규식 실패 시 기존 줄바꿈 방식 사용
  if (str.includes('\n\n')) {
    const parts = str.split('\n\n');
    return { title: parts[0].trim(), body: parts.slice(1).join('\n\n').trim() };
  }
  
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

// 💡 [핵심 해결] 화면 표시용 제목에서도 동그라미 숫자를 완전히 제거합니다.
export const getStrictTitleOnly = (text?: string) => {
  if (!text) return "제목 없음";
  const { title } = formatCardText(text);
  // 시스템 태그 [법][령]... 만 제거하고 순수 제목 반환
  return title.replace(/\[(법|령|칙|규)\]/g, '').trim();
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
