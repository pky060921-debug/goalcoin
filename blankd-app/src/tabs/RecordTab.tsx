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

export const RecordTab = ({ savedCards, goalBalance, handleUpdateBalance, loadAllData, safeAddress }: any) => {
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

  const handleMemoBlur = async (card: any, newText: string) => {
    let stats = getExtendedStats(card.memo);
    stats.text = newText;
    const newMemo = JSON.stringify(stats);

    try {
      await fetch("https://api.blankd.top/api/save-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: safeAddress,
          card_id: card.id,
          card_content: card.content,
          answer_text: card.answer_text || "",
          folder_name: card.folder_name,
          memo: newMemo
        })
      });
      if(typeof loadAllData === 'function') loadAllData(true);
    } catch(e) {
      console.error("메모 저장 실패:", e);
    }
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
      await loadAllData(true); 
    } catch (e) {} finally { setIsEnhancing(false); }
  };

  // 💡 인라인 아코디언형 TCG 카드 렌더링
  const renderExpandableTCGCard = (card: any) => {
    const lines = card.content.replace(/\s*\[\[?ORIG_ID:\d+\]?\]?/g, '').split('\n');
    const firstLine = lines[0] || "";
    
    let displayTitle = firstLine.replace(/\[(법|령|칙|규|정관|규정)\]/g, '').replace(/\(\s*내용\s*\)/g, '').replace(/내용/g, '').trim();
    if (!displayTitle) displayTitle = "제목 없음";

    let prefix = "[법]"; let titleColor = "text-red-400"; let borderColor = "border-red-500/30";
    if (firstLine.includes('[정관]')) { prefix = "[정관]"; titleColor = "text-yellow-400"; borderColor = "border-yellow-500/30"; }
    else if (firstLine.includes('[칙]') || firstLine.includes('[규]') || firstLine.includes('[규정]')) { prefix = "[칙]"; titleColor = "text-green-400"; borderColor = "border-green-500/30"; }
    else if (firstLine.includes('[령]')) { prefix = "[령]"; titleColor = "text-blue-400"; borderColor = "border-blue-500/30"; }

    const stats = getExtendedStats(card.memo);
    const isExpanded = expandedId === card.id;
    const isMax = stats.upgrade >= 50;
    const canUpgrade = stats.upgrade < stats.filled;
    const cost = (stats.upgrade + 1) * 20;

    let rarityBorder = "border-gray-600/50";
    let rarityBg = "bg-gradient-to-b from-gray-800 to-[#0a0a0c]";
    let rarityGlow = "";

    if (isMax) { 
        rarityBorder = "border-yellow-400"; rarityBg = "bg-gradient-to-b from-yellow-900/50 to-black"; 
        rarityGlow = "shadow-[0_0_15px_rgba(250,204,21,0.5)]"; 
    }
    else if (stats.upgrade >= 30) { 
        rarityBorder = "border-purple-500"; rarityBg = "bg-gradient-to-b from-purple-900/50 to-black"; 
        rarityGlow = "shadow-[0_0_10px_rgba(168,85,247,0.3)]"; 
    }
    else if (stats.upgrade >= 15) { 
        rarityBorder = "border-blue-500"; rarityBg = "bg-gradient-to-b from-blue-900/50 to-black"; 
        rarityGlow = "shadow-[0_0_10px_rgba(59,130,246,0.2)]"; 
    }
    else if (stats.upgrade >= 5) { 
        rarityBorder = "border-green-500"; rarityBg = "bg-gradient-to-b from-green-900/50 to-black"; 
    }

    const accuracy = stats.totalCorrect + stats.totalWrong > 0 
        ? Math.round((stats.totalCorrect / (stats.totalCorrect + stats.totalWrong)) * 100) 
        : 0;

    return (
        <div key={card.id} className={`flex flex-col border ${borderColor} rounded-md bg-black/40 hover:bg-white/5 transition-all w-full overflow-hidden`}>
            
            {/* 💡 심플한 목록 뷰 (클릭 시 펼쳐짐) */}
            <div 
                onClick={() => setExpandedId(isExpanded ? null : card.id)}
                className="cursor-pointer p-3 sm:p-4 flex items-center justify-between group"
            >
                <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
                    <span className={`text-xs sm:text-sm font-black ${titleColor} shrink-0`}>{prefix}</span>
                    <span className="text-sm sm:text-base font-bold text-white/90 truncate group-hover:text-white transition-colors">
                        {displayTitle}
                    </span>
                </div>
                <div className="shrink-0 flex items-center gap-3">
                    <span className={`text-[10px] font-bold ${isMax ? 'text-yellow-400' : 'text-white/40'}`}>Lv.{stats.upgrade}</span>
                    <span className={`text-white/20 text-xs transition-transform duration-300 ${isExpanded ? 'rotate-180 text-teal-400' : ''}`}>▼</span>
                </div>
            </div>

            {/* 💡 밑으로 펼쳐지는 TCG 카드 영역 */}
            {isExpanded && (
                <div className="p-4 border-t border-white/10 flex justify-center bg-black/60 animate-in fade-in slide-in-from-top-2">
                    
                    <div className={`w-full max-w-sm relative rounded-xl border-[3px] ${rarityBorder} ${rarityBg} ${rarityGlow} p-3 sm:p-4 flex flex-col gap-4 shadow-2xl`}>
                        
                        {/* TCG 상단: 카드 제목 */}
                        <div className="flex justify-between items-center pb-2 border-b border-white/10">
                            <span className={`text-sm sm:text-base font-black ${titleColor} tracking-tight`}>{prefix} {displayTitle}</span>
                            <span className={`text-xs font-bold ${isMax ? 'text-yellow-400 animate-pulse' : 'text-white/70'}`}>
                                {isMax ? '★MAX' : `Lv.${stats.upgrade}`}
                            </span>
                        </div>

                        {/* TCG 중앙: 이미지 부분 (메모 입력창) */}
                        <div className="flex flex-col h-40 sm:h-48 bg-black/80 rounded-lg border border-white/10 p-3 shadow-inner relative group">
                            <div className="absolute top-2 left-3 text-[9px] font-bold text-amber-400/50 tracking-widest flex items-center gap-1">
                                <span>📝</span> MEMO
                            </div>
                            <textarea
                                defaultValue={stats.text}
                                onBlur={(e) => handleMemoBlur(card, e.target.value)}
                                placeholder="이 곳에 암기 팁, 두음, 판례 등을 기록하세요. (바깥쪽 클릭 시 자동 저장)"
                                className="w-full h-full bg-transparent text-amber-100/90 text-xs sm:text-sm outline-none resize-none custom-scrollbar mt-4 pt-1 leading-relaxed"
                            />
                        </div>

                        {/* TCG 하단: 전적 기록 */}
                        <div className="grid grid-cols-3 gap-2 text-center bg-black/60 rounded-lg py-2 border border-white/10">
                            <div>
                                <span className="block text-[9px] text-white/30 mb-0.5 tracking-widest">학습 횟수</span>
                                <span className="text-[13px] font-mono font-bold text-indigo-400">{stats.filled}</span>
                            </div>
                            <div>
                                <span className="block text-[9px] text-white/30 mb-0.5 tracking-widest">최고 속도</span>
                                <span className="text-[13px] font-mono font-bold text-teal-400">{stats.bestTime > 0 ? `${stats.bestTime.toFixed(1)}s` : '-'}</span>
                            </div>
                            <div>
                                <span className="block text-[9px] text-white/30 mb-0.5 tracking-widest">정답률</span>
                                <span className="text-[13px] font-mono font-bold text-green-400">{accuracy}%</span>
                            </div>
                        </div>

                        {/* TCG 액션: 강화 버튼 */}
                        <button 
                            disabled={isMax || isEnhancing || !canUpgrade}
                            onClick={(e) => { e.stopPropagation(); handleEnhanceCard(card, stats); }}
                            className={`w-full py-2.5 text-xs font-bold rounded-lg transition-all shadow-md mt-1 ${
                                isMax ? 'bg-yellow-600/20 text-yellow-500 border border-yellow-500/30 cursor-not-allowed' : 
                                !canUpgrade ? 'bg-gray-800/50 text-gray-500 border border-gray-600/30 cursor-not-allowed' :
                                goalBalance >= cost ? 'bg-white/10 hover:bg-white/20 text-white border border-white/20' : 
                                'bg-red-900/20 text-red-500/50 border border-red-500/20 cursor-not-allowed'
                            }`}
                        >
                            {isMax ? '최고 레벨 (MAX)' : !canUpgrade ? `학습 부족 (현재 ${stats.filled}회 / 필요 ${stats.upgrade + 1}회)` : `💎 ${cost}P 사용해 카드 강화`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in w-full pb-10">
      <div className="flex justify-between items-end mb-4 sm:mb-6 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif text-current tracking-tight">카드 수집 (TCG)</h1>
          <p className="text-xs sm:text-sm text-white/40 mt-1">리스트를 클릭해 카드를 펼치고 기록과 메모를 확인하세요.</p>
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
      
      <div className="overflow-y-auto max-h-[70vh] custom-scrollbar pr-2 pb-10">
        {enhanceFolders.map((folder: string) => {
          if (!openFolders[folder]) return null;

          const folderCards = localCards.filter((c:any) => c && c.content && c.folder_name === folder);
          
          const col1Cards = folderCards.filter(c => { const f = c.content.split('\n')[0]||""; return f.includes('[정관]') || (!f.includes('[령]') && !f.includes('[칙]') && !f.includes('[규]') && !f.includes('[규정]')); });
          const col2Cards = folderCards.filter(c => { const f = c.content.split('\n')[0]||""; return f.includes('[령]'); });
          const col3Cards = folderCards.filter(c => { const f = c.content.split('\n')[0]||""; return f.includes('[칙]') || f.includes('[규]') || f.includes('[규정]'); });

          return (
            <div key={folder} className="mb-10 sm:mb-12 border-l-2 border-white/10 pl-2 sm:pl-4">
              <div className="text-sm sm:text-base text-white/70 mb-4 border-b border-white/10 pb-2 font-bold tracking-widest">{folder}</div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 items-start w-full">
                
                <div className="flex flex-col gap-2.5 w-full">
                  <div className="text-xs text-red-400/70 font-bold mb-1 text-center tracking-widest border-b border-white/5 pb-2">법 / 정관</div>
                  {col1Cards.map(c => renderExpandableTCGCard(c))}
                </div>
                
                <div className="flex flex-col gap-2.5 w-full">
                  <div className="text-xs text-blue-400/70 font-bold mb-1 text-center tracking-widest border-b border-white/5 pb-2">시행령</div>
                  {col2Cards.map(c => renderExpandableTCGCard(c))}
                </div>
                
                <div className="flex flex-col gap-2.5 w-full">
                  <div className="text-xs text-green-400/70 font-bold mb-1 text-center tracking-widest border-b border-white/5 pb-2">시행규칙 / 규정</div>
                  {col3Cards.map(c => renderExpandableTCGCard(c))}
                </div>

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
