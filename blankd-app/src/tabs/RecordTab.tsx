import React, { useState, useEffect } from 'react';

const getExtendedStats = (memoStr: string) => {
  try {
    if (memoStr && memoStr.trim().startsWith('{')) {
      const p = JSON.parse(memoStr || '{}');
      return {
        text: p.text || "", filled: p.filled || 0, wrongIndices: p.wrongIndices || [],
        upgrade: p.upgrade || 0, bestTime: p.bestTime || 0, totalCorrect: p.totalCorrect || 0, totalWrong: p.totalWrong || 0
      };
    }
  } catch(e) {}
  return { text: "", filled: 0, wrongIndices: [], upgrade: 0, bestTime: 0, totalCorrect: 0, totalWrong: 0 };
};

const getGridClass = (cols: number) => {
  if(cols === 1) return "md:grid-cols-1";
  if(cols === 2) return "md:grid-cols-2";
  if(cols === 3) return "md:grid-cols-3";
  if(cols === 4) return "md:grid-cols-4";
  if(cols === 5) return "md:grid-cols-5";
  return "md:grid-cols-3";
};

export const RecordTab = ({ savedCards, goalBalance, handleUpdateBalance, loadAllData, safeAddress, colCount = 3 }: any) => {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | number | null>(null);

  const [localCards, setLocalCards] = useState<any[]>([]);
  const enhanceFolders = Array.from(new Set(localCards.map((c:any) => c.folder_name))).filter(f => f && f !== '기본 폴더').sort() as string[];
  
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  useEffect(() => { setLocalCards(Array.isArray(savedCards) ? savedCards : []); }, [savedCards]);

  useEffect(() => {
    if (!safeAddress) return;
    try {
      const saved = localStorage.getItem(`blankd_enhance_folders_${safeAddress}`);
      if (saved) setOpenFolders(JSON.parse(saved));
    } catch(e) {}
  }, [safeAddress]);

  useEffect(() => {
    if (!safeAddress) return;
    setOpenFolders(prev => {
      const next = { ...prev }; let changed = false;
      enhanceFolders.forEach(f => { if (next[f] === undefined) { next[f] = true; changed = true; } });
      if (changed) localStorage.setItem(`blankd_enhance_folders_${safeAddress}`, JSON.stringify(next)); 
      return next;
    });
  }, [localCards, enhanceFolders, safeAddress]);

  const handleToggleFolder = (f: string) => {
    setOpenFolders(prev => { 
      const next = { ...prev, [f]: !prev[f] }; 
      localStorage.setItem(`blankd_enhance_folders_${safeAddress}`, JSON.stringify(next)); 
      return next; 
    });
  };

  const handleEnhanceCard = async (card: any, currentStats: any) => {
    if (currentStats.upgrade >= 50) { 
        alert("이미 최고 레벨(MAX 50)에 도달한 카드입니다!"); 
        return; 
    }
    if (currentStats.upgrade >= currentStats.filled) { 
        alert(`카드를 더 학습(채우기)해야 강화할 수 있습니다.\n(현재 학습: ${currentStats.filled}회 / 강화: +${currentStats.upgrade})`); 
        return; 
    }

    const cost = (currentStats.upgrade + 1) * 20;
    if (goalBalance < cost) { alert(`포인트가 부족합니다! (필요 포인트: ${cost}P)`); return; }
    if (!confirm(`[${cost}P]를 사용하여 이 카드를 강화하시겠습니까?\n(현재 +${currentStats.upgrade} ➔ +${currentStats.upgrade + 1})`)) return;

    setIsEnhancing(true); handleUpdateBalance(-cost);
    currentStats.upgrade += 1;
    const newMemo = JSON.stringify(currentStats);

    try {
      await fetch("https://api.blankd.top/api/save-card", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: safeAddress, card_id: card.id, card_content: card.content, answer_text: card.answer_text || "", folder_name: card.folder_name, memo: newMemo })
      });
      await loadAllData(); 
    } catch (e) {} finally { setIsEnhancing(false); }
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in w-full">
      <div className="flex justify-between items-end mb-4 sm:mb-6 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif text-current tracking-tight">카드 수집</h1>
          <p className="text-xs sm:text-sm text-white/40 mt-1">카드를 클릭해 강화(MAX 50)하고 기록을 확인하세요.</p>
        </div>
        <div className="text-amber-400 font-bold text-[11px] sm:text-xs font-mono bg-black/40 px-3 py-1.5 border border-amber-500/30 rounded-sm shrink-0">
          보유: {goalBalance} P
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4">
        {enhanceFolders.map((f: string) => (
          <button key={f} onClick={() => handleToggleFolder(f)} className={`px-3 py-1.5 sm:py-2 text-[10px] sm:text-[12px] font-bold border rounded-sm transition-all ${openFolders[f] ? 'bg-teal-600 border-teal-500 text-white shadow-sm' : 'bg-teal-900/40 text-teal-300 border-teal-500/30'}`}>
            📁 {f}
          </button>
        ))}
      </div>
      
      <div className="overflow-y-auto max-h-[60vh] custom-scrollbar pr-2 pb-10">
        {enhanceFolders.map((folder: string) => {
          if (!openFolders[folder]) return null;

          const folderCards = localCards.filter((c:any) => c && c.content && c.folder_name === folder);
          
          const col1Cards = folderCards.filter(c => { const f = c.content.split('\n')[0]||""; return f.includes('[정관]') || (!f.includes('[령]') && !f.includes('[칙]') && !f.includes('[규]') && !f.includes('[규정]')); });
          const col2Cards = folderCards.filter(c => { const f = c.content.split('\n')[0]||""; return f.includes('[령]'); });
          const col3Cards = folderCards.filter(c => { const f = c.content.split('\n')[0]||""; return f.includes('[칙]') || f.includes('[규]') || f.includes('[규정]'); });

          return (
            <div key={folder} className="mb-6 sm:mb-8 border-l border-white/5 pl-2 sm:pl-3">
              <div className="text-xs sm:text-sm text-white/50 mb-2 sm:mb-3 border-b border-white/10 pb-1.5 sm:pb-2 font-bold">{folder}</div>
              
              <div className={`grid grid-cols-1 ${getGridClass(colCount)} gap-1.5 sm:gap-2 items-start w-full`}>
                
                <div className="flex flex-col gap-1.5 w-full bg-white/5 rounded-sm p-1.5 border border-white/5 h-auto">
                  <div className="text-[10px] text-white/30 font-bold mb-0.5 text-center tracking-widest border-b border-white/5 pb-1">법 / 정관</div>
                  {col1Cards.map(c => renderTightCard(c))}
                </div>
                
                <div className="flex flex-col gap-1.5 w-full bg-white/5 rounded-sm p-1.5 border border-white/5 h-auto">
                  <div className="text-[10px] text-white/30 font-bold mb-0.5 text-center tracking-widest border-b border-white/5 pb-1">시행령</div>
                  {col2Cards.map(c => renderTightCard(c))}
                </div>
                
                <div className="flex flex-col gap-1.5 w-full bg-white/5 rounded-sm p-1.5 border border-white/5 h-auto">
                  <div className="text-[10px] text-white/30 font-bold mb-0.5 text-center tracking-widest border-b border-white/5 pb-1">시행규칙 / 규정</div>
                  {col3Cards.map(c => renderTightCard(c))}
                </div>

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  function renderTightCard(card: any) {
    const lines = card.content.replace(/\s*\[\[?ORIG_ID:\d+\]?\]?/g, '').split('\n');
    const firstLine = lines[0] || "";
    
    let displayTitle = firstLine.replace(/\[(법|령|칙|규|정관|규정)\]/g, '').replace(/\(\s*내용\s*\)/g, '').replace(/내용/g, '').trim();
    if (!displayTitle) displayTitle = "제목 없음";

    let prefix = "[법]"; let titleColor = "text-red-500";
    if (firstLine.includes('[정관]')) { prefix = "[정관]"; titleColor = "text-yellow-500"; }
    else if (firstLine.includes('[칙]') || firstLine.includes('[규]') || firstLine.includes('[규정]')) { prefix = "[칙]"; titleColor = "text-green-500"; }
    else if (firstLine.includes('[령]')) { prefix = "[령]"; titleColor = "text-blue-400"; }

    const stats = getExtendedStats(card.memo);
    const isMax = stats.upgrade >= 50;
    const canUpgrade = stats.upgrade < stats.filled;
    const cost = (stats.upgrade + 1) * 20;
    const isExpanded = expandedId === card.id;

    let borderClass = "border-white/10 bg-black/40 hover:bg-white/5";
    if (isMax) borderClass = "border-yellow-500/50 bg-yellow-950/20 shadow-[0_0_10px_rgba(250,204,21,0.15)]";
    else if (stats.upgrade >= 40) borderClass = "border-red-500/40 bg-red-950/20";
    else if (stats.upgrade >= 30) borderClass = "border-fuchsia-500/40 bg-fuchsia-950/20";
    else if (stats.upgrade >= 20) borderClass = "border-purple-500/40 bg-purple-950/20";
    else if (stats.upgrade >= 10) borderClass = "border-blue-500/40 bg-blue-950/20";
    else if (stats.upgrade >= 5) borderClass = "border-teal-500/40 bg-teal-950/20";

    return (
        <div key={card.id} onClick={() => setExpandedId(isExpanded ? null : card.id)} className={`relative flex flex-col rounded-sm border transition-all cursor-pointer p-1.5 w-full ${borderClass}`}>
            <div className="flex justify-between items-center gap-2">
                <div className={`${titleColor} font-bold text-[11px] truncate w-full`} title={`${prefix} ${displayTitle}`}>
                    <span className="opacity-80">{prefix}</span> {displayTitle}
                </div>
                <div className={`text-[9px] font-mono font-bold whitespace-nowrap shrink-0 ${isMax ? 'text-yellow-500 animate-pulse' : 'text-white/50'}`}>
                    {isMax ? '★MAX' : `+${stats.upgrade}`}
                </div>
            </div>

            <div className="text-[10px] text-white/40 mt-0.5 truncate w-full font-serif" title={stats.text || "메모 없음"}>
                {stats.text || "메모 없음"}
            </div>

            {isExpanded && (
                <div className="mt-2 pt-2 border-t border-white/10 flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1">
                    <div className="flex justify-between items-center text-[9px] font-mono bg-black/40 p-1 rounded border border-white/5">
                        <span className="text-white/40">최고기록</span><span className="text-teal-400 font-bold">{stats.bestTime > 0 ? `${stats.bestTime.toFixed(1)}초` : '-'}</span>
                    </div>
                    <div className="flex justify-between items-center text-[9px] font-mono bg-black/40 p-1 rounded border border-white/5">
                        <span className="text-white/40">누적반복</span><span className="text-indigo-400 font-bold">{stats.filled}회</span>
                    </div>
                    <div className="flex justify-between items-center text-[9px] font-mono bg-black/40 p-1 rounded border border-white/5">
                        <span className="text-white/40">정답/오답</span><span><span className="text-green-400">O:{stats.totalCorrect}</span> <span className="text-white/30">|</span> <span className="text-red-400">X:{stats.totalWrong}</span></span>
                    </div>
                    <button 
                        disabled={isMax || isEnhancing || !canUpgrade}
                        onClick={(e) => { e.stopPropagation(); handleEnhanceCard(card, stats); }}
                        className={`w-full py-1.5 mt-1 text-[10px] font-bold rounded-sm transition-all flex justify-center items-center gap-1 ${
                            isMax ? 'bg-yellow-600/20 text-yellow-500 border border-yellow-500/30 cursor-not-allowed' : 
                            !canUpgrade ? 'bg-gray-800/50 text-gray-500 border border-gray-600/30 cursor-not-allowed' :
                            goalBalance >= cost ? 'bg-white/10 hover:bg-white/20 text-white border border-white/20' : 
                            'bg-red-900/20 text-red-500/50 border border-red-500/20 cursor-not-allowed'
                        }`}
                    >
                        {isMax ? '최고 레벨(50) 달성' : !canUpgrade ? `강화 불가 (학습 ${stats.filled}회 / 필요 ${stats.upgrade + 1}회)` : `💎 강화 시도 (${cost}P)`}
                    </button>
                </div>
            )}
        </div>
    );
  }
};
