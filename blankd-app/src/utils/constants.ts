export const SPLIT_REGEX = /(\s+|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]+|(?:은|는|이|가|을|를|의|에|에게|과|와|로서|로써|로|으로|도|만|부터|까지|이다|한다|하다|함|됨|됨을|함을|함으로써|됨으로써|대하여|대해|대한|관하여|관해|관한|등|및|에서|에서는|에서의|로부터|에의|로부터의|에도|에는|이나|나|라도|이라도|인가|든가|이든지|든지|적|적인|적으로|할|한|하는|된|될|되는|인|일|이고|이며|이면|이지|입니다|합니다|습니다)(?=\s|$|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]))/g;

// 💡 [핵심 해결] 줄바꿈(\n)을 유지하고 ① 숫자를 본문으로 이동
export const formatCardText = (text?: string) => {
  if (!text) return { title: "제목 없음", body: "" };
  const str = String(text); // trim()을 함부로 하지 않아 줄바꿈 보존
  
  // 1. 조항 제목 패턴 매칭 (괄호까지)
  const splitMatch = str.match(/^(\[.*?\]\s*제\s*\d+\s*조(?:의\s*\d+)?\s*(?:\([^)]+\))?[*\s]*)(.*)/s);
  
  if (splitMatch) {
    let titlePart = splitMatch[1];
    let bodyPart = splitMatch[2];
    
    // 💡 제목 끝에 ①~⑮ 숫자가 붙어있다면 본문으로 떼어냄
    const circleMatch = titlePart.match(/(.*?)([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮].*)/);
    if (circleMatch) {
      titlePart = circleMatch[1];
      bodyPart = circleMatch[2] + bodyPart;
    }
    
    return { title: titlePart.trim(), body: bodyPart }; // 본문은 앞 공백만 제거, 줄바꿈 보존
  }

  // 매칭 실패 시 줄바꿈 기준으로 분리
  const lines = str.split('\n');
  return { title: lines[0].trim(), body: lines.slice(1).join('\n') };
};

export const extractLawTag = (title: string) => {
  if (title.includes('[법]')) return '법';
  if (title.includes('[령]')) return '시행령';
  if (title.includes('[칙]') || title.includes('[규]')) return '시행규칙';
  return '';
};

// 💡 제목에서 시스템 태그 및 동그라미 숫자 완전 제거
export const getStrictTitleOnly = (text?: string) => {
  if (!text) return "제목 없음";
  const { title } = formatCardText(text);
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

// 💡 [원본 복구] 아키님께서 되돌리신 그 완벽한 3단 그리드 로직
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
