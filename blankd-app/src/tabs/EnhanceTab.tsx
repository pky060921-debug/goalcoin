import React, { useState, useEffect } from 'react';
import { getStrictCardTitle, getSortNumber, getColSpanAndStartClass } from '../utils/constants';

export const EnhanceTab = ({ savedCards, colCount, viewMode, setActiveCard, handleDeleteCard, selectedEnhanceIds, setSelectedEnhanceIds, targetFolderName, setTargetFolderName, handleMoveEnhanceFolders }: any) => {
  const safeCards = Array.isArray(savedCards) ? savedCards : [];
  const enhanceFolders = Array.from(new Set(safeCards.map((c:any)=>c.folder_name||'기본 폴더'))).sort() as string[];
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const initial: Record<string, boolean> = {};
    enhanceFolders.forEach(f => initial[f] = true);
    setOpenFolders(initial);
  }, [savedCards]);

  // 💡 렌더링 에러(310) 방지
  const createLongPressHandlers = (callback: () => void, ms = 800) => {
    let timer: any;
    const start = () => { timer = setTimeout(callback, ms); };
    const clear = () => { clearTimeout(timer); };
    return { 
      onTouchStart: start, onTouchEnd: clear, 
      onMouseDown: start, onMouseUp: clear, onMouseLeave: clear, 
      onContextMenu: (e:any) => { e.preventDefault(); callback(); } 
    };
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* 폴더 대량 이동 UI */}
      {selectedEnhanceIds.size > 0 && (
        <div className="flex gap-2 items-center bg-amber-900/20 p-3 rounded-sm border border-amber-500/20 mb-4">
          <span className="text-xs text-amber-300">{selectedEnhanceIds.size}개 선택됨</span>
          <input value={targetFolderName} onChange={e=>setTargetFolderName(e.target.value)} placeholder="새 폴더명" className="bg-black/50 border border-white/20 text-xs p-2 text-white outline-none flex-1" />
          <button onClick={handleMoveEnhanceFolders} className="text-xs border border-amber-500/50 bg-amber-600/30 text-white px-4 py-2 hover:bg-amber-600/50">폴더로 이동</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {enhanceFolders.map((f: string) => <button key={f} onClick={() => setOpenFolders(p => ({...p, [f]: !p[f]}))} className={`px-4 py-2 text-[12px] font-bold border rounded-sm transition-all ${openFolders[f] ? 'bg-amber-600 border-amber-500 text-white' : 'bg-amber-900/30 text-amber-300 border-amber-500/30'}`}>📁 {f}</button>)}
      </div>
      
      {enhanceFolders.map((folder: string) => openFolders[folder] && (
        <div key={folder} className="mb-8">
          <div className="text-sm text-white/50 mb-3 border-b border-white/10 pb-2">{folder}</div>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
            {safeCards.filter((c:any) => (c.folder_name || '기본 폴더') === folder).sort((a:any, b:any) => getSortNumber(a.content) - getSortNumber(b.content)).map((card: any) => {
              const gridSpanClass = getColSpanAndStartClass(card.content, viewMode, false, colCount);
              return (
                <div key={card.id} className={`${gridSpanClass} relative`}>
                  <input type="checkbox" className="absolute top-2 right-2 z-10 w-4 h-4 cursor-pointer" checked={selectedEnhanceIds.has(card.id)} onChange={() => { const s = new Set(selectedEnhanceIds); if(s.has(card.id)) s.delete(card.id); else s.add(card.id); setSelectedEnhanceIds(s); }} />
                  <button 
                    {...createLongPressHandlers(() => handleDeleteCard(card.id), 800)}
                    onClick={() => setActiveCard(card)}
                    className={`w-full p-5 text-center rounded-sm border transition-all h-full ${card.status === "BURNED" ? "border-white/5 text-white/30" : "border-indigo-500/30 text-indigo-300 bg-indigo-900/20 hover:bg-indigo-900/40"}`}
                  >
                    <span className="text-[9px] text-amber-400 block mb-1">LV.{card.level}</span>
                    <div className="font-serif text-[13px] font-bold leading-relaxed">{getStrictCardTitle(card.content)}</div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
