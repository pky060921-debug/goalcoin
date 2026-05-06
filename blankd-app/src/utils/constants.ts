export const SPLIT_REGEX = /(\s+|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]+|(?:은|는|이|가|을|를|의|에|에게|과|와|로서|로써|로|으로|도|만|부터|까지|이다|한다|하다|함|됨|됨을|함을|함으로써|됨으로써|대하여|대해|대한|관하여|관해|관한|등|및|에서|에서는|에서의|로부터|에의|로부터의|에도|에는|이나|나|라도|이라도|인가|든가|이든지|든지|적|적인|적으로|할|한|하는|된|될|되는|인|일|이고|이며|이면|이지|입니다|합니다|습니다)(?=\s|$|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]))/g;

// 💡 [버그수정] 제목과 본문을 확실히 분리하여 문제 풀이 시 중복 노출 방지
export const formatCardText = (text?: string) => {
  if (!text) return { title: "제목 없음", body: "" };
  const str = String(text).trim();
  
  // 줄바꿈 두 번(\n\n)이 있으면 제목과 본문의 명확한 구분선으로 인지
  if (str.includes('\n\n')) {
    const parts = str.split('\n\n');
    return { title: parts[0].trim(), body: parts.slice(1).join('\n\n').trim() };
  }
  
  // 구분선이 없으면 첫 줄을 제목으로, 나머지를 본문으로 분리
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

// 💡 [버그수정] 조항번호 뒤의 조항명(목적 등)과 별표(*)를 온전히 보존하여 추출
export const getStrictTitleOnly = (text?: string) => {
  if (!text) return "제목 없음";
  const str = String(text).trim();
  const firstLine = str.split('\n')[0];
  // 시스템 태그 [법][령][칙][규]만 제거하고 나머지는 괄호 포함 그대로 반환
  return firstLine.replace(/\[(법|령|칙|규)\]/g, '').trim();
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

// 💡 [원본복구] 아키님이 주신 압축파일의 완벽했던 그리드 로직 100% 복구
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
