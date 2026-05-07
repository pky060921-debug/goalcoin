import React, { useState, useEffect } from 'react';
import { getGridStyle, getStrictTitleOnly, formatCardText, parseCardStats } from '../utils/constants';

export const EnhanceTab = ({ savedCards, setActiveCard, handleDeleteCard }: any) => {
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
      <div className="flex flex-wrap gap-2 mb-6">
        {enhanceFolders.map((f: string) => <button key={f} onClick={() => setOpenFolders(p => ({...p, [f]: !p[f]}))} className={`px-3 py-1.5 text-[10px] sm:text-[12px] font-bold border rounded-sm transition-all ${openFolders[f] ? 'bg-amber-600 border-amber-500 text-white' : 'bg-amber-900/30 text-amber-300 border-amber-500/30'}`}>📁 {f}</button>)}
      </div>
      
      {enhanceFolders.map((folder: string) => openFolders[folder] && (
        <div key={folder} className="mb-8 border-l border-white/5 pl-4">
          <div className="text-xs sm:text-sm text-white/50 mb-4 border-b border-white/10 pb-2 font-bold">{folder}</div>
          
          <div className="hidden md:grid grid-cols-3 gap-4 mb-4 text-center font-bold text-white/20 text-[10px] uppercase tracking-widest">
             <div>법</div><div>시행령</div><div>시행규칙</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-fr">
            {safeCards.filter((c:any) => c.folder_name === folder).sort((a:any, b:any) => a.id - b.id).map((card: any) => {
                const cleanTitle = getStrictTitleOnly(card.content);
                const { body } = formatCardText(card.content);
                const totalBlanks = (body.match(/\[\s*(.*?)\s*\]/g) || []).length;
                const stats = parseCardStats(card.memo);
                const hasWrong = stats.wrongIndices.length > 0;
                
                const gridStyle = getGridStyle(card.content, 'all', false, 3);

                return (
                  <div key={card.id} className="relative transition-all" style={gridStyle}>
                    <div {...createLongPressHandlers(() => handleDeleteCard(card.id))} 
                         onClick={() => setActiveCard(card)} 
                         className={`w-full h-full p-4 rounded-sm border transition-all flex flex-col justify-between ${hasWrong ? "border-red-500/40 bg-red-900/10 shadow-[0_0_10px_rgba(220,38,38,0.1)]" : "border-indigo-500/30 bg-indigo-900/20 hover:bg-indigo-900/40"} cursor-pointer`}>
                      
                      <div className="flex flex-col gap-3 w-full h-full">
                        <div className={`font-bold text-[12px] sm:text-[13px] text-left leading-relaxed break-keep ${hasWrong ? "text-red-300" : "text-amber-400"}`}>
                          {cleanTitle}
                        </div>
                        
                        {/* 💡 [수정] 약어 제거 및 0일 때도 항상 틀림:X 표시 */}
                        <div className="flex flex-wrap gap-1.5 justify-start mt-auto">
                          <span className="text-[9px] sm:text-[10px] text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded bg-indigo-900/40 font-mono">빈칸:{totalBlanks}</span>
                          <span className="text-[9px] sm:text-[10px] text-teal-300 border border-teal-500/30 px-1.5 py-0.5 rounded bg-teal-900/40 font-mono">채움:{stats.filled}</span>
                          <span className={`text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded font-mono border ${hasWrong ? 'text-white border-red-500/50 bg-red-600 font-bold animate-pulse shadow-sm' : 'text-white/30 border-white/5 bg-black/20'}`}>틀림:{stats.wrongIndices.length}</span>
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
