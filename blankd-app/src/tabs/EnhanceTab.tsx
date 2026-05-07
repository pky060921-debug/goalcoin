import React, { useState, useEffect } from 'react';
import { getGridStyle, getStrictTitleOnly, formatCardText } from '../utils/constants';

export const EnhanceTab = ({ savedCards, colCount, viewMode, setActiveCard, handleUpdateMemo, handleDeleteCard }: any) => {
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

                return (
                  <div key={card.id} className="relative transition-all" style={gridStyle}>
                    {/* 💡 기존의 메모 <input> 태그를 완전히 제거하고, 카드 전체를 클릭 가능하도록 병합했습니다. */}
                    <div {...createLongPressHandlers(() => handleDeleteCard(card.id))} 
                         onClick={() => setActiveCard(card)} 
                         className={`w-full p-4 rounded-sm border transition-all h-full flex flex-col justify-start ${card.status === "BURNED" ? "border-white/5 bg-white/5" : "border-indigo-500/30 bg-indigo-900/20 hover:bg-indigo-900/40 cursor-pointer"}`}>
                      <div className="flex justify-between items-start w-full gap-2">
                        <div className="text-amber-400 font-bold text-[13px] text-left flex-1 leading-snug">{cleanTitle}</div>
                        <div className="text-[10px] text-teal-400 border border-teal-500/30 px-2 py-1 rounded whitespace-nowrap shrink-0 mt-0.5">반복.{card.level}</div>
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
