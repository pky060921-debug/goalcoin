import React, { useState, useEffect } from 'react';
import { getStrictTitleOnly, formatCardText, parseCardStats } from '../utils/constants';

const getGridClass = (cols: number) => {
  if(cols === 1) return "md:grid-cols-1";
  if(cols === 2) return "md:grid-cols-2";
  if(cols === 3) return "md:grid-cols-3";
  if(cols === 4) return "md:grid-cols-4";
  if(cols === 5) return "md:grid-cols-5";
  return "md:grid-cols-3";
};

// 💡 [핵심 해결] 제목의 키워드에 따라 무조건 1열, 2열, 3열에 박아넣는 절대 위치 함수
const getGridStyle = (text: string, viewMode: string, isExpanded: boolean, colCount: number) => {
    if (isExpanded) return { gridColumn: "1 / -1" };
    if (viewMode === 'all' && colCount >= 3) {
      if (text.includes('[법]')) return { gridColumnStart: 1 };
      if (text.includes('[령]')) return { gridColumnStart: 2 };
      if (text.includes('[칙]') || text.includes('[규]')) return { gridColumnStart: 3 };
    }
    return {};
};

export const EnhanceTab = ({ savedCards, colCount, viewMode, setActiveCard, handleDeleteCard }: any) => {
  const safeCards = Array.isArray(savedCards) ? savedCards : [];
  const enhanceFolders = Array.from(new Set(safeCards.map((c:any) => c.folder_name))).filter(f => f && f !== '기본 폴더').sort() as string[];
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const initial: Record<string, boolean> = {};
    enhanceFolders.forEach(f => initial[f] = true);
    setOpenFolders(initial);
  }, [savedCards]);

  const createLongPressHandlers = (callback: () => void, ms = 800) => {
    let timer: any;
    const start = () => { timer = setTimeout(callback, ms); };
    const clear = () => { clearTimeout(timer); };
    return { onTouchStart: start, onTouchEnd: clear, onMouseDown: start, onMouseUp: clear, onMouseLeave: clear, onContextMenu: (e:any) => { e.preventDefault(); callback(); } };
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in w-full">
      <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4 sm:mb-6">
        {enhanceFolders.map((f: string) => <button key={f} onClick={() => setOpenFolders(p => ({...p, [f]: !p[f]}))} className={`px-2.5 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-[12px] font-bold border rounded-sm transition-all ${openFolders[f] ? 'bg-amber-600 border-amber-500 text-white shadow-sm' : 'bg-amber-900/30 text-amber-300 border-amber-500/30'}`}>📁 {f}</button>)}
      </div>
      
      {enhanceFolders.map((folder: string) => openFolders[folder] && (
        <div key={folder} className="mb-6 sm:mb-8 border-l border-white/5 pl-3 sm:pl-4">
          <div className="text-xs sm:text-sm text-white/50 mb-2 sm:mb-3 border-b border-white/10 pb-1.5 sm:pb-2 font-bold">{folder}</div>

          {/* 💡 그리드 기본 속성은 유지 */}
          <div className={`grid grid-cols-1 ${getGridClass(colCount)} gap-3 sm:gap-4 items-start`}>
            
            {/* 💡 카드의 본문(content)을 기준으로 법->령->칙 순서가 되도록 1차 정렬 */}
            {safeCards.filter((c:any) => c.folder_name === folder).sort((a:any, b:any) => {
                const textA = a.content || "";
                const textB = b.content || "";
                const getW = (t:string) => t.includes('[법]') ? 1 : t.includes('[령]') ? 2 : (t.includes('[칙]') || t.includes('[규]')) ? 3 : 4;
                const diff = getW(textA) - getW(textB);
                if (diff !== 0) return diff;
                
                // 조문 번호 숫자 기준으로 2차 정렬
                return (getStrictTitleOnly(textA) || "").localeCompare((getStrictTitleOnly(textB) || ""), undefined, {numeric: true});
            }).map((card: any) => {
                const cleanTitle = getStrictTitleOnly(card.content);
                const { body } = formatCardText(card.content);
                const totalBlanks = (body.match(/\[\s*(.*?)\s*\]/g) || []).length;
                const stats = parseCardStats(card.memo);
                const hasWrong = stats.wrongIndices.length > 0;
                const checkText = `${card.content || ''}`;

                let titleColor = "text-amber-400";
                if (checkText.includes('[법]')) titleColor = "text-red-500";
                else if (checkText.includes('[령]')) titleColor = "text-blue-400";
                else if (checkText.includes('[칙]') || checkText.includes('[규]')) titleColor = "text-green-500";

                // 💡 [핵심 해결] getGridStyle 함수를 호출하여 카드가 들어가야 할 정확한 열 번호를 받아옴!
                const gridStyle = getGridStyle(checkText, viewMode, false, colCount);

                return (
                  // 💡 받아온 gridStyle 객체를 style 속성으로 강제 주입!
                  <div key={card.id} className="relative transition-all w-full" style={gridStyle}>
                    <div {...createLongPressHandlers(() => handleDeleteCard(card.id))} onClick={() => setActiveCard(card)} className={`w-full p-3 sm:p-4 rounded-sm border transition-all flex flex-col justify-center ${hasWrong ? "border-red-500/40 bg-red-900/20" : "border-indigo-500/30 bg-indigo-900/20 hover:bg-indigo-900/40"} cursor-pointer shadow-sm hover:shadow-md`}>
                      <div className="flex flex-row justify-between items-center w-full gap-2">
                        <div className={`${titleColor} font-bold text-[11px] sm:text-[13px] text-left leading-snug truncate flex-1`}>{cleanTitle}</div>
                        <div className="flex flex-nowrap gap-1 justify-end shrink-0 items-center overflow-visible">
                          <span className="text-[8px] sm:text-[9px] text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded bg-indigo-900/40 font-mono whitespace-nowrap">빈칸:{totalBlanks}</span>
                          <span className="text-[8px] sm:text-[9px] text-teal-300 border border-teal-500/30 px-1.5 py-0.5 rounded bg-teal-900/40 font-mono whitespace-nowrap">채움:{stats.filled}</span>
                          <span className={`text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded font-mono border whitespace-nowrap ${hasWrong ? 'text-white border-red-500/60 bg-red-600 font-bold animate-pulse shadow-sm' : 'text-white/30 border-white/5 bg-black/20'}`}>틀림:{stats.wrongIndices.length}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
