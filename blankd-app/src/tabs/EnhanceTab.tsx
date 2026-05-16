import React, { useState, useEffect } from 'react';
import { getStrictTitleOnly } from '../utils/constants';

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
  
  // 💡 [기능 보존] 강화 탭 폴더 상태 로컬 스토리지 연동
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() => {
    try { const saved = localStorage.getItem('blankd_enhance_folders'); return saved ? JSON.parse(saved) : {}; } 
    catch(e) { return {}; }
  });

  useEffect(() => {
    setOpenFolders(prev => {
      const next = { ...prev };
      let changed = false;
      enhanceFolders.forEach(f => {
        if (next[f] === undefined) { next[f] = true; changed = true; }
      });
      if (changed) localStorage.setItem('blankd_enhance_folders', JSON.stringify(next));
      return next;
    });
  }, [savedCards]);

  const handleToggleFolder = (f: string) => {
    setOpenFolders(prev => {
      const next = { ...prev, [f]: !prev[f] };
      localStorage.setItem('blankd_enhance_folders', JSON.stringify(next));
      return next;
    });
  };

  const createLongPressHandlers = (callback: () => void, ms = 800) => {
    let timer: any;
    const start = () => { timer = setTimeout(callback, ms); };
    const clear = () => { clearTimeout(timer); };
    return { onTouchStart: start, onTouchEnd: clear, onMouseDown: start, onMouseUp: clear, onMouseLeave: clear, onContextMenu: (e:any) => { e.preventDefault(); callback(); } };
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in w-full">
      <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4 sm:mb-6">
        {enhanceFolders.map((f: string) => (
          <button 
            key={f}
            onClick={() => handleToggleFolder(f)} 
            className={`px-3 py-1.5 sm:py-2 text-[10px] sm:text-[12px] font-bold border rounded-sm transition-all ${openFolders[f] ? 'bg-teal-600 border-teal-500 text-white shadow-sm' : 'bg-teal-900/40 text-teal-300 border-teal-500/30'}`}
          >
            📁 {f}
          </button>
        ))}
      </div>
      
      {enhanceFolders.map((folder: string) => openFolders[folder] && (
        <div key={folder} className="mb-6 sm:mb-8 border-l border-white/5 pl-3 sm:pl-4">
          <div className="text-xs sm:text-sm text-white/50 mb-2 sm:mb-3 border-b border-white/10 pb-1.5 sm:pb-2 font-bold">{folder}</div>
          <div className={`grid grid-cols-1 ${getGridClass(colCount)} gap-3 sm:gap-4 items-start`}>
            {safeCards.filter((c:any) => c.folder_name === folder).sort((a:any, b:any) => a.id - b.id).map((card: any) => {
                let colClass = "";
                let titleColor = "text-teal-400";
                const checkText = `${card.content || ''}`;

                if (checkText.includes('[법]')) titleColor = "text-red-400";
                else if (checkText.includes('[령]')) titleColor = "text-blue-400";
                else if (checkText.includes('[칙]') || checkText.includes('[규]')) titleColor = "text-green-400";
                
                const cleanTitle = getStrictTitleOnly(card.content || "");
                const isAtRisk = card.status === 'AT_RISK' || card.level === 0;

                return (
                  <button 
                    key={card.id}
                    {...createLongPressHandlers(() => handleDeleteCard(card.id))} 
                    onClick={() => setActiveCard(card)} 
                    className={`w-full min-h-[60px] p-3 sm:p-4 bg-[#0a0a0c] border rounded-sm transition-colors flex flex-col gap-1.5 sm:gap-2 text-left ${isAtRisk ? 'border-red-500/50 hover:bg-red-900/20' : 'border-teal-500/30 hover:bg-teal-900/40'}`}
                  >
                    <div className="flex justify-between items-start w-full gap-2">
                      <span className={`${titleColor} font-bold text-[11px] sm:text-[13px] leading-snug break-keep`}>{cleanTitle}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${isAtRisk ? 'bg-red-500/20 text-red-400' : 'bg-teal-500/20 text-teal-400'}`}>Lv.{card.level}</span>
                    </div>
                    <div className="text-[10px] text-white/40 truncate w-full">정답: {card.answer_text}</div>
                  </button>
                );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
