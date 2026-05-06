export const SPLIT_REGEX = /(\s+|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]+|(?:은|는|이|가|을|를|의|에|에게|과|와|로서|로써|로|으로|도|만|부터|까지|이다|한다|하다|함|됨|됨을|함을|함으로써|됨으로써|대하여|대해|대한|관하여|관해|관한|등|및|에서|에서는|에서의|로부터|에의|로부터의|에도|에는|이나|나|라도|이라도|인가|든가|이든지|든지|적|적인|적으로|할|한|하는|된|될|되는|인|일|이고|이며|이면|이지|입니다|합니다|습니다)(?=\s|$|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]))/g;

export const formatCardText = (text?: string) => {
  if (!text) {
      console.log("[DEBUG formatCardText] 데이터가 비어 있습니다.");
      return { title: "제목 없음", body: "" };
  }
  
  const str = String(text);
  console.log(`\n--- [DEBUG] 텍스트 분리 분석 시작 ---`);
  console.log(`[DEBUG] 원본 텍스트 미리보기:`, str.substring(0, 60) + "...");
  
  let tag = "";
  let remaining = str.trimStart();
  
  const tagMatch = remaining.match(/^(\[.*?\])/);
  if (tagMatch) {
    tag = tagMatch[1];
    remaining = remaining.substring(tag.length).trimStart();
    console.log(`[DEBUG] 시스템 태그 감지: ${tag}`);
  }

  // 동그라미 숫자 또는 줄바꿈 탐지
  const circleMatch = remaining.match(/([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]|\n)/);
  
  if (circleMatch && circleMatch.index !== undefined) {
    const splitIdx = circleMatch.index;
    const titlePart = remaining.substring(0, splitIdx).trim();
    const bodyPart = remaining.substring(splitIdx);
    
    console.log(`[DEBUG] 분리 지점 발견! 인덱스: ${splitIdx} (트리거 문자: ${circleMatch[0] === '\n' ? '줄바꿈(\\n)' : circleMatch[0]})`);
    console.log(`[DEBUG] 확정된 제목: ${tag ? tag + " " : ""}${titlePart}`);
    console.log(`[DEBUG] 확정된 본문 미리보기: ${bodyPart.substring(0, 30)}...`);
    
    return {
      title: tag ? `${tag} ${titlePart}` : titlePart,
      body: bodyPart
    };
  }

  console.log(`[DEBUG] 동그라미 번호나 줄바꿈을 찾지 못했습니다. 전체를 반환합니다.`);
  return { title: str.trim(), body: str.trim() };
};

export const extractLawTag = (title: string) => {
  if (title.includes('[법]')) return '법';
  if (title.includes('[령]')) return '시행령';
  if (title.includes('[칙]') || title.includes('[규]')) return '시행규칙';
  return '';
};

export const getStrictTitleOnly = (text?: string) => {
  if (!text) return "제목 없음";
  const { title } = formatCardText(text);
  const cleanTitle = title.replace(/\[.*?\]/g, '').trim();
  console.log(`[DEBUG getStrictTitleOnly] 최종 출력 타이틀: ${cleanTitle}`);
  return cleanTitle;
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
