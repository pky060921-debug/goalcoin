export const SPLIT_REGEX = /(\s+|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]+|(?:은|는|이|가|을|를|의|에|에게|과|와|로서|로써|로|으로|도|만|부터|까지|이다|한다|하다|함|됨|됨을|함을|함으로써|됨으로써|대하여|대해|대한|관하여|관해|관한|등|및|에서|에서는|에서의|로부터|에의|로부터의|에도|에는|이나|나|라도|이라도|인가|든가|이든지|든지|적|적인|적으로|할|한|하는|된|될|되는|인|일|이고|이며|이면|이지|입니다|합니다|습니다)(?=\s|$|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]))/g;

export const getStrictTitleOnly = (text?: string) => {
  if (!text) return "제목 없음";
  const str = String(text);
  const match = str.match(/(제\s*\d+\s*조(?:의\s*\d+)?\s*(?:\([^)]+\))?[*\s]*)/);
  if (match) {
    return match[1].trim(); 
  }
  return str.split('\n')[0].replace(/\[(법|령|칙|규)\]/g, '').trim();
};

export const formatCardText = (text?: string) => {
  if (!text) return { title: "제목 없음", body: "" };
  const str = String(text).trim();
  if (str.includes('\n\n')) {
    const parts = str.split('\n\n');
    return { title: parts[0].trim(), body: parts.slice(1).join('\n\n').trim() };
  }
  const match = str.match(/^(\[.*?\]\s*제\s*\d+\s*조(?:의\s*\d+)?\s*(?:\([^)]+\))?[*\s]*)\s*(.*)/s);
  if (match) {
    return { title: match[1].trim(), body: match[2].trim() };
  }
  return { title: str.split('\n')[0].substring(0, 30), body: str };
};

// 💡 [핵심 패치 1] 폴더(제1장, 제10장, 제2장)를 정확히 숫자로 인식하여 정렬
export const sortFolders = (folders: string[]) => {
  return folders.sort((a, b) => {
    const matchA = a.match(/제\s*(\d+)\s*장/);
    const matchB = b.match(/제\s*(\d+)\s*장/);
    const numA = matchA ? parseInt(matchA[1], 10) : 999999;
    const numB = matchB ? parseInt(matchB[1], 10) : 999999;
    if (numA !== numB) return numA - numB;
    return a.localeCompare(b);
  });
};

// 💡 [핵심 패치 2] 조항(제1조)을 숫자로 인식하고, 법->령->칙 순으로 미세조정 정렬
export const getSortNumber = (text?: string) => {
  if (!text) return 999999;
  const str = String(text);
  const articleMatch = str.match(/제\s*(\d+)\s*조(?:의\s*(\d+))?/);
  let base = 999999;
  if (articleMatch && articleMatch[1]) {
    base = parseInt(articleMatch[1], 10);
    if (articleMatch[2]) base += parseInt(articleMatch[2], 10) / 1000;
  }
  let typeScore = 0.0004;
  if (str.includes('[법]')) typeScore = 0.0001;
  else if (str.includes('[령]')) typeScore = 0.0002;
  else if (str.includes('[칙]') || str.includes('[규]')) typeScore = 0.0003;
  return base + typeScore; 
};

// 💡 [핵심 패치 3] 인라인 스타일의 버그를 버리고, Tailwind 네이티브 클래스로 각 열을 강제 고정
export const getGridClass = (text: string, studyMode: string, isExpanded: boolean) => {
  if (isExpanded) return "col-span-full"; 
  if (studyMode !== '법령') return "col-span-1";

  const isLaw = text?.includes('[법]');
  const isDecret = text?.includes('[령]');
  const isRule = text?.includes('[칙]') || text?.includes('[규]');
  
  if (isLaw) return "col-start-1 col-span-1";
  if (isDecret) return "col-start-2 col-span-1";
  if (isRule) return "col-start-3 col-span-1";
  return "col-span-1";
};
