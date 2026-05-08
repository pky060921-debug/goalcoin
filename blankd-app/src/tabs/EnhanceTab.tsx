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

          <div className={`grid grid-cols-1 ${getGridClass(colCount)} gap-3 sm:gap-4 items-start`}>
            {/* 💡 [핵심 복구] 만들기 탭과 완전히 동일한 법->령->규칙 이중 정렬 로직 */}
            {safeCards.filter((c:any) => c.folder_name === folder).sort((a:any, b:any) => {
                const textA = a.content || "";
                const textB = b.content || "";
                const getW = (t:string) => t.includes('[법]') ? 1 : t.includes('[령]') ? 2 : (t.includes('[칙]') || t.includes('[규]')) ? 3 : 4;
                const diff = getW(textA) - getW(textB);
                if (diff !== 0) return diff;
                return (getStrictTitleOnly(textA) || "").localeCompare((getStrictTitleOnly(textB) || ""), undefined, {numeric: true});
            }).map((card: any) => {
                const cleanTitle = getStrictTitleOnly(card.content);
                const { body } = formatCardText(card.content);
                const totalBlanks = (body.match(/\[\s*(.*?)\s*\]/g) || []).length;
                const stats = parseCardStats(card.memo);
                const hasWrong = stats.wrongIndices.length > 0;
                
                const checkText = `${card.content || ''}`;
                let colClass = "";
                let titleColor = "text-amber-400";
                
                // 💡 [핵심 복구] 만들기 탭과 동일한 3단 열 지정 (col-start) 로직
                if (viewMode === 'all' && colCount >= 3) {
                  if (checkText.includes('[법]')) { colClass = "md:col-start-1"; titleColor = "text-red-600"; }
                  else if (checkText.includes('[령]')) { colClass = "md:col-start-2"; titleColor = "text-blue-600"; }
                  else if (checkText.includes('[칙]') || checkText.includes('[규]')) { colClass = "md:col-start-3"; titleColor = "text-green-600"; }
                } else {
                  if (checkText.includes('[법]')) titleColor = "text-red-600";
                  else if (checkText.includes('[령]')) titleColor = "text-blue-600";
                  else if (checkText.includes('[칙]') || checkText.includes('[규]')) titleColor = "text-green-600";
                }

                return (
                  <div key={card.id} className={`relative transition-all w-full ${colClass}`}>
                    <div {...createLongPressHandlers(() => handleDeleteCard(card.id))} onClick={() => setActiveCard(card)} className={`w-full min-h-[60px] p-3 sm:p-4 rounded-sm border transition-colors flex flex-col justify-center gap-1.5 sm:gap-2 text-left ${hasWrong ? "border-red-500/40 bg-red-900/20" : "border-indigo-500/30 bg-indigo-900/20 hover:bg-indigo-900/40"} cursor-pointer shadow-sm hover:shadow-md`}>
                      
                      <span className={`${titleColor} font-bold text-[11px] sm:text-[13px] leading-snug break-keep`}>{cleanTitle}</span>
                      
                      <div className="flex flex-nowrap gap-1 justify-end shrink-0 items-center overflow-visible mt-1">
                        <span className="text-[8px] sm:text-[9px] text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded bg-indigo-900/40 font-mono whitespace-nowrap">빈칸:{totalBlanks}</span>
                        <span className="text-[8px] sm:text-[9px] text-teal-300 border border-teal-500/30 px-1.5 py-0.5 rounded bg-teal-900/40 font-mono whitespace-nowrap">채움:{stats.filled}</span>
                        <span className={`text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded font-mono border whitespace-nowrap ${hasWrong ? 'text-white border-red-500/60 bg-red-600 font-bold animate-pulse shadow-sm' : 'text-white/30 border-white/5 bg-black/20'}`}>틀림:{stats.wrongIndices.length}</span>
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
