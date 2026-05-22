import React, { useState, useEffect } from 'react';
import { formatCardText, parseCardStats } from '../utils/constants';

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
            {safeCards.filter((c:any) => c.folder_name === folder).sort((a:any, b:any) => {
                const origIdA = parseInt((a.content.match(/\[\[ORIG_ID:(\d+)\]\]/) || [])[1] || a.id, 10);
                const origIdB = parseInt((b.content.match(/\[\[ORIG_ID:(\d+)\]\]/) || [])[1] || b.id, 10);
                return origIdA - origIdB;
            }).map((card: any) => {
                const cleanContent = card.content.replace(/\n\n\[\[ORIG_ID:\d+\]\]/g, '');
                
                // 💡 [초정밀 복구 로직] 본문 전체에서 조항명을 우선 탐색합니다.
                let displayTitle = "";
                try {
                  const rawTitle = card.title || "";
                  const regex = /(제\s*\d+\s*조(?:\s*의\s*\d+)?)\s*\(\s*([^)]+)\s*\)/;

                  // 1. 본문 전체에서 찾기 (빈칸 괄호 [[ ]] 가 포함되어 있어도 필터링함)
                  let match = cleanContent.match(regex);
                  if (match && !match[2].includes("내용")) {
                      displayTitle = `${match[1].replace(/\s+/g, '')} ${match[2].replace(/\[|\]/g, '').trim()}`;
                  } else {
                      // 2. 본문에 없으면 원본 제목에서 찾기
                      match = rawTitle.match(regex);
                      if (match && !match[2].includes("내용")) {
                          displayTitle = `${match[1].replace(/\s+/g, '')} ${match[2].replace(/\[|\]/g, '').trim()}`;
                      } else {
                          // 3. 다 없으면 태그와 괄호, '내용' 글자 삭제 후 기본 표시
                          displayTitle = rawTitle.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').replace(/내용/g, '').trim() || "제목 없음";
                      }
                  }
                } catch (error) {
                  console.error("[진단 오류] EnhanceTab 제목 추출 실패:", error, card);
                  displayTitle = "제목 오류";
                }

                const { body } = formatCardText(cleanContent);
                const totalBlanks = (body.match(/\[\s*(.*?)\s*\]/g) || []).length;
                const stats = parseCardStats(card.memo);
                const hasWrong = stats.wrongIndices.length > 0;
                
                let colClass = "";
                let titleColor = "text-teal-400";
                
                if (viewMode === 'all' && colCount >= 3) {
                  if (cleanContent.includes('[법]')) { colClass = "md:col-start-1"; titleColor = "text-red-500"; }
                  else if (cleanContent.includes('[령]')) { colClass = "md:col-start-2"; titleColor = "text-blue-400"; }
                  else if (cleanContent.includes('[칙]') || cleanContent.includes('[규]')) { colClass = "md:col-start-3"; titleColor = "text-green-500"; }
                } else {
                  if (cleanContent.includes('[법]')) titleColor = "text-red-500";
                  else if (cleanContent.includes('[령]')) titleColor = "text-blue-400";
                  else if (cleanContent.includes('[칙]') || cleanContent.includes('[규]')) titleColor = "text-green-500";
                }

                return (
                  <div key={card.id} className={`relative transition-all w-full ${colClass}`}>
                    <button {...createLongPressHandlers(() => handleDeleteCard(card.id))} onClick={(e) => { e.stopPropagation(); if (typeof setActiveCard === 'function') setActiveCard(card); }} className={`w-full p-3 sm:p-4 rounded-sm border transition-all flex flex-col justify-center ${hasWrong ? "border-red-500/40 bg-red-900/20" : "border-indigo-500/30 bg-indigo-900/20 hover:bg-indigo-900/40"} cursor-pointer shadow-sm hover:shadow-md`}>
                      <div className="flex flex-row justify-between items-center w-full gap-2">
                        <div className={`${titleColor} font-bold text-[11px] sm:text-[13px] text-left leading-snug truncate flex-1`}>{displayTitle}</div>
                        <div className="flex flex-nowrap gap-1 justify-end shrink-0 items-center overflow-visible">
                          <span className="text-[8px] sm:text-[9px] text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded bg-indigo-900/40 font-mono whitespace-nowrap">빈칸:{totalBlanks}</span>
                          <span className="text-[8px] sm:text-[9px] text-teal-300 border border-teal-500/30 px-1.5 py-0.5 rounded bg-teal-900/40 font-mono whitespace-nowrap">반복:{stats.filled}</span>
                          <span className={`text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded font-mono border whitespace-nowrap ${hasWrong ? 'text-white border-red-500/60 bg-red-600 font-bold animate-pulse shadow-sm' : 'text-white/30 border-white/5 bg-black/20'}`}>틀림:{stats.wrongIndices.length}</span>
                        </div>
                      </div>
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
