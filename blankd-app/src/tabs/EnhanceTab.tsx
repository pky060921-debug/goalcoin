import React, { useState, useEffect } from 'react';
import { formatCardText, getGridStyle } from '../utils/constants';

export const EnhanceTab = ({ savedCards, studyMode, setActiveCard, handleDeleteCard, handleUpdateMemo }: any) => {
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
        <div key={folder} className="mb-8">
          <div className="text-sm text-white/50 mb-3 border-b border-white/10 pb-2">{folder}</div>
          
          {studyMode === '법령' && (
            <div className="grid gap-4 mb-4 text-center font-bold text-white/40 text-[11px] uppercase tracking-widest" style={{ gridTemplateColumns: `repeat(3, minmax(0, 1fr))` }}>
               <div>법 (Law)</div>
               <div>시행령 (Decree)</div>
               <div>시행규칙 (Rule)</div>
            </div>
          )}

          <div className={`grid gap-4 ${studyMode === '일반' ? 'grid-cols-1 md:grid-cols-2' : ''}`} style={studyMode === '법령' ? { gridTemplateColumns: `repeat(3, minmax(0, 1fr))` } : {}}>
            {safeCards
              .filter((c:any) => c.folder_name === folder)
              .sort((a:any, b:any) => a.id - b.id)
              .map((card: any) => {
                const gridStyle = getGridStyle(card.content, studyMode, false);
                const { title, body } = formatCardText(card.content);
                const cleanTitle = title.replace(/\[법\]|\[령\]|\[칙\]|\[규\]/g, '').trim();

                return (
                  <div key={card.id} className="relative transition-all" style={gridStyle}>
                    <div 
                      {...createLongPressHandlers(() => handleDeleteCard(card.id), 800)}
                      className={`w-full p-5 text-left rounded-sm border transition-all h-full flex flex-col gap-3 ${card.status === "BURNED" ? "border-white/5 bg-white/5" : "border-indigo-500/30 bg-indigo-900/20 hover:bg-indigo-900/40 cursor-pointer"}`}
                    >
                      <div className="flex justify-between items-center w-full" onClick={() => setActiveCard(card)}>
                        <span className="text-amber-400 font-bold text-[13px]">{cleanTitle}</span>
                        {/* 💡 요청하신 반복 횟수(레벨) 복구 (X버튼은 삭제된 상태 유지) */}
                        <span className="text-[10px] text-teal-400 border border-teal-500/30 px-2 py-1 rounded whitespace-nowrap">반복.{card.level}</span>
                      </div>
                      
                      <input 
                        defaultValue={card.memo || ""}
                        placeholder="암기 메모/두문자 입력..."
                        onClick={(e) => e.stopPropagation()} 
                        onBlur={(e) => handleUpdateMemo(card.id, e.target.value)}
                        className="text-[11px] text-teal-300 bg-teal-950/40 p-2 rounded border border-teal-500/30 w-full outline-none focus:border-teal-400 focus:bg-teal-900/40 transition-colors placeholder-teal-800"
                      />

                      <div className="text-white/70 text-[12px] leading-relaxed whitespace-pre-wrap line-clamp-3 w-full" onClick={() => setActiveCard(card)}>{body}</div>
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
