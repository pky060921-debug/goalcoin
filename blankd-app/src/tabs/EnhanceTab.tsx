import React, { useState, useEffect } from 'react';
import { getGridStyle, getStrictTitleOnly, formatCardText, getSortNumber, sortFolders } from '../utils/constants';

export const EnhanceTab = ({ savedCards, studyMode, setActiveCard, handleUpdateMemo, handleDeleteCard }: any) => {
  const safeCards = Array.isArray(savedCards) ? savedCards : [];
  const rawFolders = Array.from(new Set(safeCards.map((c:any) => c.folder_name))).filter(f => f && f !== '기본 폴더') as string[];
  const enhanceFolders = sortFolders(rawFolders);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const initial: Record<string, boolean> = {};
    enhanceFolders.forEach(f => initial[f] = true);
    setOpenFolders(initial);
  }, [savedCards]);

  const createLongPressHandlers = (callback: () => void) => {
    let timer: any;
    return { 
      onTouchStart: () => timer = setTimeout(callback, 800), 
      onTouchEnd: () => clearTimeout(timer), 
      onMouseDown: () => timer = setTimeout(callback, 800), 
      onMouseUp: () => clearTimeout(timer) 
    };
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex flex-wrap gap-2 mb-6">
        {enhanceFolders.map((f: string) => <button key={f} onClick={() => setOpenFolders(p => ({...p, [f]: !p[f]}))} className={`px-4 py-2 text-[12px] font-bold border rounded-sm transition-all ${openFolders[f] ? 'bg-amber-600 border-amber-500 text-white' : 'bg-amber-900/30 text-amber-300 border-amber-500/30'}`}>📁 {f}</button>)}
      </div>
      
      {enhanceFolders.map((folder: string) => openFolders[folder] && (
        <div key={folder} className="mb-8">
          <div className="text-sm text-white/50 mb-3 border-b border-white/10 pb-2">{folder}</div>
          
          {studyMode === '법령' && (
            <div className="grid gap-4 mb-4 text-center font-bold text-white/40 text-[11px] uppercase tracking-widest" style={{ gridTemplateColumns: `repeat(3, minmax(0, 1fr))` }}>
               <div>법</div>
               <div>시행령</div>
               <div>시행규칙</div>
            </div>
          )}

          {/* 💡 [핵심 복구] 인라인 스타일과 getSortNumber 마스터 정렬 동시 적용 */}
          <div className={`grid gap-4 ${studyMode === '일반' ? 'grid-cols-1 md:grid-cols-2' : ''}`} style={studyMode === '법령' ? { gridTemplateColumns: `repeat(3, minmax(0, 1fr))` } : {}}>
            {safeCards.filter((c:any) => c.folder_name === folder)
              .sort((a:any, b:any) => getSortNumber(a.content) - getSortNumber(b.content))
              .map((card: any) => {
                const gridStyle = getGridStyle(card.content, studyMode, false);
                const { title } = formatCardText(card.content);
                const cleanTitle = getStrictTitleOnly(title);

                return (
                  <div key={card.id} className="relative transition-all" style={gridStyle}>
                    <div {...createLongPressHandlers(() => handleDeleteCard(card.id))} className={`w-full p-4 text-left rounded-sm border transition-all h-full flex flex-col gap-2 ${card.status === "BURNED" ? "border-white/5 bg-white/5" : "border-indigo-500/30 bg-indigo-900/20 hover:bg-indigo-900/40 cursor-pointer"}`}>
                      
                      <div className="flex justify-between items-center w-full gap-2" onClick={() => setActiveCard(card)}>
                        <span className="text-amber-400 font-bold text-[13px] truncate flex-1">{cleanTitle}</span>
                        <span className="text-[10px] text-teal-400 border border-teal-500/30 px-2 py-1 rounded whitespace-nowrap shrink-0">반복.{card.level}</span>
                      </div>
                      
                      <input 
                        defaultValue={card.memo || ""} 
                        placeholder="암기 메모/두문자 입력..." 
                        onClick={(e) => e.stopPropagation()} 
                        onBlur={(e) => handleUpdateMemo(card.id, e.target.value)} 
                        className="text-[11px] text-teal-300 bg-teal-950/40 p-2 rounded border border-teal-500/30 w-full outline-none focus:border-teal-400 shrink-0" 
                      />
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
