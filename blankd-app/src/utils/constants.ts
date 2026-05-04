export const SPLIT_REGEX = /(\s+|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]+|(?:은|는|이|가|을|를|의|에|에게|과|와|로서|로써|로|으로|도|만|부터|까지|이다|한다|하다|함|됨|됨을|함을|함으로써|됨으로써|대하여|대해|대한|관하여|관해|관한|등|및|에서|에서는|에서의|로부터|에의|로부터의|에도|에는|이나|나|라도|이라도|인가|든가|이든지|든지|적|적인|적으로|할|한|하는|된|될|되는|인|일|이고|이며|이면|이지|입니다|합니다|습니다)(?=\s|$|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]))/g;

export const getStrictCardTitle = (text?: string) => {
  if (!text) return "제목 없음";
  const str = String(text);
  const match = str.match(/^(\[.*?\]\s*제\s*\d+\s*조(?:의\s*\d+)?(?:\([^)]+\))?)/);
  return match ? match[1] : str.split('\n')[0].substring(0, 15) + "...";
};

export const getSortNumber = (text?: string) => {
  if (!text) return 999999;
  const match = String(text).match(/제\s*(\d+)\s*조/);
  return match ? parseInt(match[1]) : 999999;
};

export const getColSpanAndStartClass = (text: string, currentViewMode: string, isExpanded: boolean, colCount: number) => {
  if (isExpanded) return "col-span-full";
  const isLaw = text?.includes('[법]');
  const isDecret = text?.includes('[령]');
  const isRule = text?.includes('[칙]') || text?.includes('[규]'); // 시행규칙 버그 해결
  
  if (currentViewMode === 'all' && colCount >= 3 && (isLaw || isDecret || isRule)) {
    if (isLaw) return "md:col-start-1 col-span-1";
    if (isDecret) return "md:col-start-2 col-span-1";
    if (isRule) return "md:col-start-3 col-span-1";
  }
  return "col-span-full";
};
