import React, { useState, useEffect } from 'react';
import { getGridStyle, getStrictTitleOnly, formatCardText, parseCardStats } from '../utils/constants';

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
    <div className="space-y-8 animate-in fade-in">
      <div className="flex flex-wrap gap-2 mb-6">
        {enhanceFolders.map((f: string) => <button key={f} onClick={() => setOpenFolders(p => ({...p, [f]: !p[f]}))} className={`px-4 py-2 text-[12px] font-bold border rounded-sm transition-all ${openFolders[f] ? 'bg-amber-600 border-amber-500 text-white' : 'bg-amber-900/30 text-amber-300 border-amber-500/30'}`}>📁 {f}</button>)}
      </div>
      
      {enhanceFolders.map((folder: string) => openFolders[folder] && (
        <div key={folder} className="mb-8 border-l border-white/5 pl-4">
          <div className="text-sm text-white/50 mb-3 border-b border-white/10 pb-2">{folder}</div>
          {viewMode === 'all' && colCount >= 3 && (
            <div className="grid gap-4 mb-4 text-center font-bold text-white/40 text-[11px] uppercase tracking-widest" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
               <div>법</div><div>시행령</div><div>시행규칙</div>
            </div>
          )}

          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
            {safeCards.filter((c:any) => c.folder_name === folder).sort((a:any, b:any) => a.id - b.id).map((card: any) => {
                const gridStyle = getGridStyle(card.content, viewMode, false, colCount);
                const cleanTitle = getStrictTitleOnly(card.content);
                const { body } = formatCardText(card.content);
                const totalBlanks = (body.match(/\[\s*(.*?)\s*\]/g) || []).length;
                const stats = parseCardStats(card.memo);
                const hasWrong = stats.wrongIndices.length > 0;

                return (
                  <div key={card.id} className="relative transition-all" style={gridStyle}>
                    <div {...createLongPressHandlers(() => handleDeleteCard(card.id))} onClick={() => setActiveCard(card)} className={`w-full p-4 rounded-sm border transition-all h-full flex flex-col justify-start ${hasWrong ? "border-red-500/30 bg-red-900/10" : "border-indigo-500/30 bg-indigo-900/20 hover:bg-indigo-900/40"} cursor-pointer`}>
                      <div className="flex justify-between items-start w-full gap-3">
                        <div className="text-amber-400 font-bold text-[13px] text-left leading-snug break-keep flex-1">{cleanTitle}</div>
                        <div className="flex gap-1 flex-wrap justify-end shrink-0 items-start mt-0.5">
                          <span className="text-[10px] text-indigo-300 border border-indigo-500/30 px-1 py-0.5 rounded whitespace-nowrap bg-indigo-900/20">빈칸 {totalBlanks}</span>
                          <span className="text-[10px] text-teal-300 border border-teal-500/30 px-1 py-0.5 rounded whitespace-nowrap bg-teal-900/20">채움 {stats.filled}</span>
                          {hasWrong && <span className="text-[10px] text-red-300 border border-red-500/30 px-1 py-0.5 rounded whitespace-nowrap bg-red-900/20 animate-pulse text-pretty">틀림 {stats.wrongIndices.length}</span>}
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
