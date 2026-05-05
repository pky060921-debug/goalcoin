export const SPLIT_REGEX = /(\s+|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]+|(?:은|는|이|가|을|를|의|에|에게|과|와|로서|로써|로|으로|도|만|부터|까지|이다|한다|하다|함|됨|됨을|함을|함으로써|됨으로써|대하여|대해|대한|관하여|관해|관한|등|및|에서|에서는|에서의|로부터|에의|로부터의|에도|에는|이나|나|라도|이라도|인가|든가|이든지|든지|적|적인|적으로|할|한|하는|된|될|되는|인|일|이고|이며|이면|이지|입니다|합니다|습니다)(?=\s|$|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]))/g;

export const getStrictCardTitle = (text?: string) => {
  if (!text) return "제목 없음";
  const str = String(text);
  const match = str.match(/^(\[.*?\]\s*제\s*\d+\s*조(?:의\s*\d+)?(?:\([^)]+\))?)/);
  return match ? match[1] : str.split('\n')[0].substring(0, 15) + "...";
};

// 💡 [핵심 패치] CSS Grid 줄바꿈 오류를 막기 위한 초정밀 3단 정렬 알고리즘
export const getSortNumber = (text?: string) => {
  if (!text) return 999999;
  const str = String(text);
  
  // 1. 조항 번호 추출 (예: 제10조, 제10조의2)
  const articleMatch = str.match(/제\s*(\d+)\s*조(?:의\s*(\d+))?/);
  let base = 999999;
  
  if (articleMatch) {
    base = parseInt(articleMatch[1]);
    // '의X' 가 있는 경우 소수점으로 추가 (예: 의2 -> 0.02)
    if (articleMatch[2]) {
      base += parseInt(articleMatch[2]) / 100;
    }
  }
  
  // 2. 법-령-칙 계층 구조에 따른 소수점 가중치 부여 (정렬 순서 완벽 강제)
  // 법이 무조건 앞서고, 령이 중간, 규/칙이 마지막에 오도록 정밀 조정합니다.
  let typeScore = 0.0004; // 태그가 없으면 맨 뒤로 밀림
  if (str.includes('[법]')) typeScore = 0.0001;
  else if (str.includes('[령]')) typeScore = 0.0002;
  else if (str.includes('[칙]') || str.includes('[규]')) typeScore = 0.0003;
  
  return base + typeScore; 
};

// 💡 HTML 표의 1,2,3열에 맞춰 각 태그별 자기 자리(Start 열)를 찾아가는 레이아웃 규칙
export const getColSpanAndStartClass = (text: string, currentViewMode: string, isExpanded: boolean, colCount: number) => {
  if (isExpanded) return "col-span-full";
  
  const isLaw = text?.includes('[법]');
  const isDecret = text?.includes('[령]');
  const isRule = text?.includes('[칙]') || text?.includes('[규]');
  
  if (currentViewMode === 'all' && colCount >= 3 && (isLaw || isDecret || isRule)) {
    // 3단 레이아웃일 때 절대 다른 열을 침범하지 않고 지정석에 꽂힙니다.
    if (isLaw) return "col-start-1 col-span-1";
    if (isDecret) return "col-start-2 col-span-1";
    if (isRule) return "col-start-3 col-span-1";
  }
  
  return "col-span-1";
};
