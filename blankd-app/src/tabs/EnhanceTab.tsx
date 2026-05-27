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

export const EnhanceTab = ({ savedCards, colCount, viewMode, setActiveCard, setActiveTab, setExpandedId, handleDeleteCard }: any) => {
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
{safeCards
              .filter((c:any) => c && c.content && c.folder_name === folder) // 💡 방어막: 데이터가 확실히 있는 카드만 통과시킵니다.
              .sort((a:any, b:any) => a.id - b.id)
              .map((card: any) => {
                
                const cleanContent = card.content.replace(/\n\n\[\[ORIG_ID:\d+\]\]/g, '');
                
                // 💡 [수정] 본문 첫 줄에서 '[법]' 태그만 지우고 제목으로 사용합니다!
                let displayTitle = (cleanContent.split('\n')[0] || "")
                    .replace(/\[.*?\]/g, '')         // [법], [령] 태그 제거
                    .replace(/\(\s*내용\s*\)/g, '')  // (내용) 오염 제거
                    .replace(/내용/g, '')            // 내용 글자 제거
                    .trim();
                
                if (!displayTitle) displayTitle = "제목 없음";

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
                          <button 
                            onClick={(e) => {
                              e.stopPropagation(); 
                              
                              // 1. 꼬리표(ORIG_ID)가 있는지 먼저 찾습니다.
                              const match = card.content.match(/\[\[ORIG_ID:(\d+)\]\]/);
                              
                              if (match) {
                                // 꼬리표가 있으면 해당 조항 번호를 열어줍니다.
                                setExpandedId(parseInt(match[1], 10)); 
                                setActiveTab('craft'); // 💡 'create'가 아니라 'craft'가 정답입니다!
                              } else {
                                // 💡 꼬리표가 없는 옛날 카드를 눌렀을 때의 방어 로직
                                alert("이 카드는 예전에 생성되어 원본 조항 연결 고리(ORIG_ID)가 없습니다. \n만들기 탭에서 같은 이름의 조항을 직접 찾아 한 번 덮어써 주시면 영구적으로 연결됩니다!");
                                setActiveTab('craft'); // 그래도 만들기 탭으로는 이동시켜 줍니다.
                              }
                            }}
                            className="ml-1 px-1.5 py-0.5 bg-amber-900/40 text-amber-400 border border-amber-500/50 rounded font-mono text-[9px] hover:bg-amber-900/60 transition-colors cursor-pointer"
                          >
                            ✏️수정
                          </button>
                        </div>
                      </div>
                    </button>
                  </div>
                );
            })}          </div>
        </div>
      ))}
    </div>
  );
};
