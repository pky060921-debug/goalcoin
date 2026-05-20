import React, { useState, useEffect, useRef } from 'react';
import { getStrictTitleOnly, formatCardText, parseCardStats } from '../utils/constants';

const getGridClass = (cols: number) => {
  if(cols === 1) return "md:grid-cols-1";
  if(cols === 2) return "md:grid-cols-2";
  if(cols === 3) return "md:grid-cols-3";
  if(cols === 4) return "md:grid-cols-4";
  if(cols === 5) return "md:grid-cols-5";
  return "md:grid-cols-3";
};

export const EnhanceTab = ({ savedCards, colCount, viewMode, setActiveCard, handleDeleteCard, safeAddress }: any) => {
  const safeCards = Array.isArray(savedCards) ? savedCards : [];
  
  // 💡 정렬: 폴더 이름 기준 숫자 추출 오름차순
  const sortFolders = (folders: string[]) => {
    return folders.sort((a, b) => {
      const matchA = a.match(/\d+/);
      const matchB = b.match(/\d+/);
      if (matchA && matchB) return parseInt(matchA[0]) - parseInt(matchB[0]);
      return a.localeCompare(b);
    });
  };

  const rawFolders = Array.from(new Set(safeCards.map((c:any) => c.folder_name))).filter(f => f && f !== '기본 폴더') as string[];
  const enhanceFolders = sortFolders(rawFolders);
  
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() => {
    try { const saved = localStorage.getItem('blankd_enhance_folders'); return saved ? JSON.parse(saved) : {}; } 
    catch(e) { return {}; }
  });

  const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});

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

    // 💡 체크포인트(마지막 푼 카드) 위치로 스크롤 및 폴더 열기
    if (safeAddress) {
        fetch(`https://api.blankd.top/api/get-checkpoint?wallet_address=${safeAddress}&tab=enhance`)
          .then(res => res.json())
          .then(data => {
              if(data.last_id) {
                  const targetCard = safeCards.find((c:any) => c.id === data.last_id);
                  if(targetCard) {
                      setOpenFolders(prev => ({...prev, [targetCard.folder_name]: true}));
                      setTimeout(() => {
                          itemRefs.current[data.last_id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          // 시각적 강조 효과 (옵션)
                          itemRefs.current[data.last_id]?.classList.add('ring-2', 'ring-amber-500', 'ring-offset-2', 'ring-offset-black');
                      }, 500);
                  }
              }
          });
      }
  }, [savedCards, safeAddress]);

  const handleToggleFolder = (f: string) => {
    setOpenFolders(prev => {
      const next = { ...prev, [f]: !prev[f] };
      localStorage.setItem('blankd_enhance_folders', JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in w-full">
      <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4 sm:mb-6">
        {enhanceFolders.map((f: string) => (
          <button 
            key={f}
            onClick={() => handleToggleFolder(f)} 
            className={`pl-2.5 pr-2.5 py-1.5 sm:py-2 text-[10px] sm:text-[12px] font-bold border rounded-sm transition-all ${openFolders[f] ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm' : 'bg-indigo-900/40 text-indigo-300 border-indigo-500/30'}`}
          >
            📁 {f}
          </button>
        ))}
      </div>
      
      {enhanceFolders.map((folder: string) => openFolders[folder] && (
        <div key={folder} className="mb-6 sm:mb-8 border-l border-white/5 pl-3 sm:pl-4">
          <div className="text-xs sm:text-sm text-white/50 mb-2 sm:mb-3 border-b border-white/10 pb-1.5 sm:pb-2 font-bold">{folder}</div>
          <div className={`grid grid-cols-1 ${getGridClass(colCount)} gap-3 sm:gap-4`}>
            {/* id 순으로 정렬하여 조문 순서 보장 */}
            {safeCards.filter((c:any) => c.folder_name === folder).sort((a:any, b:any) => a.id - b.id).map((card: any) => {
                const stats = parseCardStats(card.card_stats);
                const hasWrong = stats.wrongIndices.length > 0;
                
                let titleColor = "text-amber-400";
                const checkText = card.title || "";
                if (checkText.includes('[법]')) titleColor = "text-red-500";
                else if (checkText.includes('[령]')) titleColor = "text-blue-400";
                else if (checkText.includes('[칙]') || checkText.includes('[규]')) titleColor = "text-green-500";
                
                const cleanTitle = getStrictTitleOnly(checkText);
                
                let totalBlanks = 0;
                try {
                  const contentObj = JSON.parse(card.card_content);
                  if (Array.isArray(contentObj.blanks)) {
                    totalBlanks = contentObj.blanks.length;
                  }
                } catch(e) {}

                return (
                  <div key={card.id} className="relative group w-full" ref={el => itemRefs.current[card.id] = el}>
                    <button 
                      onClick={() => {
                        // 💡 문제 풀이 진입 시 체크포인트 저장
                        fetch(`https://api.blankd.top/api/save-checkpoint`, {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({wallet_address: safeAddress, tab: 'enhance', last_id: card.id})
                        });
                        setActiveCard(card);
                      }} 
                      className={`w-full min-h-[60px] p-3 sm:p-4 rounded-sm border transition-all flex flex-col justify-center ${hasWrong ? "border-red-500/40 bg-red-900/20" : "border-indigo-500/30 bg-indigo-900/20 hover:bg-indigo-900/40"} cursor-pointer shadow-sm hover:shadow-md`}
                    >
                      {/* ... 카드 내부 UI (기존과 동일) ... */}
                      <div className="flex flex-row justify-between items-center w-full gap-2">
                        <div className={`${titleColor} font-bold text-[11px] sm:text-[13px] text-left leading-snug truncate flex-1`}>{cleanTitle}</div>
                        <div className="flex flex-nowrap gap-1 justify-end shrink-0 items-center overflow-visible">
                          <span className="text-[8px] sm:text-[9px] text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded bg-indigo-900/40 font-mono whitespace-nowrap">빈칸:{totalBlanks}</span>
                          <span className="text-[8px] sm:text-[9px] text-teal-300 border border-teal-500/30 px-1.5 py-0.5 rounded bg-teal-900/40 font-mono whitespace-nowrap">반복:{stats.filled}</span>
                          <span className={`text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded font-mono border whitespace-nowrap ${hasWrong ? 'text-white border-red-500/50 bg-red-900/50 font-bold' : 'text-gray-500 border-gray-700 bg-black/40'}`}>오답:{stats.wrongIndices.length}</span>
                        </div>
                      </div>
                    </button>
                    <span
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`'${cleanTitle}' 카드를 정말 삭제하시겠습니까?`)) {
                            handleDeleteCard(card.id);
                          }
                        }}
                        className="absolute top-1/2 -translate-y-1/2 right-3 w-5 h-5 flex items-center justify-center border border-white/10 text-white/30 hover:text-red-400 hover:border-red-500/30 rounded-full text-[10px] bg-black/40 md:opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer z-10"
                        title="카드 삭제"
                      >
                        ✕
                      </span>
                  </div>
                );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
