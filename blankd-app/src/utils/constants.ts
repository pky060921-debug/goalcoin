export const SPLIT_REGEX = /(\s+|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]+|(?:은|는|이|가|을|를|의|에|에게|과|와|로서|로써|로|으로|도|만|부터|까지|이다|한다|하다|함|됨|됨을|함을|함으로써|됨으로써|대하여|대해|대한|관하여|관해|관한|등|및|에서|에서는|에서의|로부터|에의|로부터의|에도|에는|이나|나|라도|이라도|인가|든가|이든지|든지|적|적인|적으로|할|한|하는|된|될|되는|인|일|이고|이며|이면|이지|입니다|합니다|습니다)(?=\s|$|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]))/g;

export const formatCardText = (text?: string) => {
  if (!text) return { title: "제목 없음", body: "" };
  const str = String(text).trim();
  const match = str.match(/^(\[.*?\]\s*제\s*\d+\s*조(?:의\s*\d+)?(?:\([^)]+\))?[*\s]*)\s*(.*)/s);
  if (match) {
    return { title: match[1].trim(), body: match[2].trim() };
  }
  return { title: str.split('\n')[0].substring(0, 30), body: str };
};

// 💡 띄어쓰기, 별표(*)까지 완벽하게 추출
export const getStrictTitleOnly = (text?: string) => {
  if (!text) return "제목 없음";
  const str = String(text);
  const match = str.match(/(제\s*\d+\s*조(?:의\s*\d+)?\s*(?:\([^)]+\))?[*\s]*)/);
  if (match) {
    return match[1].trim(); 
  }
  return str.split('\n')[0].replace(/\[(법|령|칙|규)\]/g, '').trim();
};

// 💡 [핵심 복구] 압축 파일에 있던 오리지널 getGridStyle 코드로 100% 롤백!
export const getGridStyle = (text: string, studyMode: string, isExpanded: boolean) => {
  if (isExpanded) return { gridColumn: "1 / -1" };
  if (studyMode !== '법령') return {}; 

  const isLaw = text?.includes('[법]');
  const isDecret = text?.includes('[령]');
  const isRule = text?.includes('[칙]') || text?.includes('[규]');
  
  if (isLaw || isDecret || isRule) {
    if (isLaw) return { gridColumn: "1" };
    if (isDecret) return { gridColumn: "2" };
    if (isRule) return { gridColumn: "3" };
  }
  return {};
};
