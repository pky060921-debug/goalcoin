export const SPLIT_REGEX = /(\s+|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]+|(?:은|는|이|가|을|를|의|에|에게|과|와|로서|로써|로|으로|도|만|부터|까지|이다|한다|하다|함|됨|됨을|함을|함으로써|됨으로써|대하여|대해|대한|관하여|관해|관한|등|및|에서|에서는|에서의|로부터|에의|로부터의|에도|에는|이나|나|라도|이라도|인가|든가|이든지|든지|적|적인|적으로|할|한|하는|된|될|되는|인|일|이고|이며|이면|이지|입니다|합니다|습니다)(?=\s|$|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]))/g;

export const formatCardText = (text?: string) => {
  if (!text) return { title: "제목 없음", body: "" };
  const str = String(text);
  
  // 💡 [핵심 패치] 강화 탭의 카드는 이미 "\n\n"으로 제목과 본문이 나뉘어 저장되어 있습니다.
  // 이 경우 정규식을 돌리지 않고 무조건 앞부분 전체를 제목으로 100% 보존합니다!
  if (str.includes('\n\n')) {
    const parts = str.split('\n\n');
    return {
      title: parts[0].trim(),
      body: parts.slice(1).join('\n\n').trimStart()
    };
  }

  let tag = "";
  let remaining = str.trimStart();
  
  // 1. [법], [령] 시스템 태그 분리
  const tagMatch = remaining.match(/^(\[(?:법|령|칙|규)\])/);
  if (tagMatch) {
    tag = tagMatch[1];
    remaining = remaining.substring(tag.length).trimStart();
  }

  // 2. 조항번호와 조항제목 추출 (반각/전각 괄호 및 띄어쓰기 모두 지원)
  const titleRegex = /(제\s*\d+\s*조(?:\s*의\s*\d+)?\s*(?:[(（][^)）]+[)）])?)/;
  const match = remaining.match(titleRegex);

  if (match && match.index !== undefined) {
    const titlePart = match[1].trim(); 
    const beforeTitle = remaining.substring(0, match.index).trim();
    const afterTitle = remaining.substring(match.index + match[1].length).trimStart();
    
    // 조항번호 앞뒤의 <개정...>, [본조신설] 등 모든 잡동사니를 모아 본문으로 합칩니다.
    let bodyPart = (beforeTitle ? beforeTitle + "\n" : "") + afterTitle;
    bodyPart = bodyPart.replace(/^[*]/, '').trimStart();

    return {
      title: tag ? `${tag} ${titlePart}` : titlePart,
      body: bodyPart
    };
  }

  // 3. 위 패턴이 없으면 동그라미나 줄바꿈에서 자릅니다.
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

// 💡 시스템 태그 제거 후 깔끔한 제목만 반환
export const getStrictTitleOnly = (text?: string) => {
  if (!text) return "제목 없음";
  const { title } = formatCardText(text);
  return title.replace(/\[(?:법|령|칙|규)\]/g, '').trim();
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
