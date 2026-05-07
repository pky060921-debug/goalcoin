import React, { useState, useEffect } from 'react';
import { getStrictTitleOnly, formatCardText, parseCardStats } from '../utils/constants';

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

          <div className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(180px, 1fr))` }}>
            {safeCards.filter((c:any) => c.folder_name === folder).sort((a:any, b:any) => a.id - b.id).map((card: any) => {
                const cleanTitle = getStrictTitleOnly(card.content);
                const { body } = formatCardText(card.content);
                const totalBlanks = (body.match(/\[\s*(.*?)\s*\]/g) || []).length;
                const stats = parseCardStats(card.memo);
                const hasWrong = stats.wrongIndices.length > 0;

                return (
                  <div key={card.id} className="relative transition-all w-full">
                    <div {...createLongPressHandlers(() => handleDeleteCard(card.id))} onClick={() => setActiveCard(card)} className={`w-full p-3 sm:p-4 rounded-sm border transition-all h-full flex flex-col justify-start ${hasWrong ? "border-red-500/40 bg-red-900/20" : "border-indigo-500/30 bg-indigo-900/20 hover:bg-indigo-900/40"} cursor-pointer shadow-sm hover:shadow-md`}>
                      <div className="flex justify-between items-start w-full gap-2 sm:gap-3 flex-col sm:flex-row">
                        <div className={`font-bold text-[11px] sm:text-[13px] text-left leading-snug break-keep w-full sm:flex-1 ${hasWrong ? "text-red-300" : "text-amber-400"}`}>{cleanTitle}</div>
                        <div className="flex gap-1 flex-wrap justify-start sm:justify-end shrink-0 items-center mt-1 sm:mt-0">
                          <span className="text-[9px] sm:text-[10px] text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded whitespace-nowrap bg-indigo-900/20 font-mono">빈칸 {totalBlanks}</span>
                          <span className="text-[9px] sm:text-[10px] text-teal-300 border border-teal-500/30 px-1.5 py-0.5 rounded whitespace-nowrap bg-teal-900/20 font-mono">채움 {stats.filled}</span>
                          {hasWrong && <span className="text-[9px] sm:text-[10px] text-white border border-red-500/60 px-1.5 py-0.5 rounded whitespace-nowrap bg-red-600 font-bold animate-pulse shadow-sm">오답 {stats.wrongIndices.length}</span>}
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
