export const SPLIT_REGEX = /(\s+|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]+|(?:은|는|이|가|을|를|의|에|에게|과|와|로서|로써|로|으로|도|만|부터|까지|이다|한다|하다|함|됨|됨을|함을|함으로써|됨으로써|대하여|대해|대한|관하여|관해|관한|등|및|에서|에서는|에서의|로부터|에의|로부터의|에도|에는|이나|나|라도|이라도|인가|든가|이든지|든지|적|적인|적으로|할|한|하는|된|될|되는|인|일|이고|이며|이면|이지|입니다|합니다|습니다)(?=\s|$|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]))/g;

export const getStrictCardTitle = (text?: string) => {
  if (!text) return "제목 없음";
  const str = String(text);
  const match = str.match(/^(\[.*?\]\s*제\s*\d+\s*조(?:의\s*\d+)?(?:\([^)]+\))?)/);
  return match ? match[1] : str.split('\n')[0].substring(0, 15) + "...";
};

// 💡 [핵심 패치 1] 조항 번호와 계층(법/령/칙)을 기준으로 완벽한 정렬 강제
export const getSortNumber = (text?: string) => {
  if (!text) return 999999;
  const str = String(text);
  
  // '의' 주변의 띄어쓰기 예외까지 모두 잡아냅니다.
  const articleMatch = str.match(/제\s*(\d+)\s*조(?:의\s*(\d+))?/);
  let base = 999999;
  
  if (articleMatch) {
    base = parseInt(articleMatch[1]);
    if (articleMatch[2]) {
      base += parseInt(articleMatch[2]) / 1000;
    }
  }
  
  // 같은 번호일 경우 무조건 법 -> 령 -> 규 순서로 정렬되도록 소수점 가중치 부여
  let typeScore = 0.0004;
  if (str.includes('[법]')) typeScore = 0.0001;
  else if (str.includes('[령]')) typeScore = 0.0002;
  else if (str.includes('[칙]') || str.includes('[규]')) typeScore = 0.0003;
  
  return base + typeScore; 
};

// 💡 [핵심 패치 2] Tailwind 증발 오류 방지를 위한 직접(Inline) Grid 스타일 생성기
export const getGridStyle = (text: string, currentViewMode: string, isExpanded: boolean, colCount: number) => {
  if (isExpanded) return { gridColumn: "1 / -1" }; // 확장 시 전체 너비 사용
  
  const isLaw = text?.includes('[법]');
  const isDecret = text?.includes('[령]');
  const isRule = text?.includes('[칙]') || text?.includes('[규]');
  
  // 전체 뷰이고 3단 이상일 때, 무조건 지정된 열(1단, 2단, 3단)에 꽂아 넣습니다!
  if (currentViewMode === 'all' && colCount >= 3 && (isLaw || isDecret || isRule)) {
    if (isLaw) return { gridColumn: "1 / span 1" };
    if (isDecret) return { gridColumn: "2 / span 1" };
    if (isRule) return { gridColumn: "3 / span 1" };
  }
  
  return {}; // 그 외의 뷰 모드나 단일 모바일 화면에서는 자연스럽게 배치
};
