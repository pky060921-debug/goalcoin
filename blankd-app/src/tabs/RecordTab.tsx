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
  const [expandedCard, setExpandedCard] = useState<any | null>(null);

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
      setExpandedCard({ ...card, memo: newMemo });
    } catch (e) {} finally { setIsEnhancing(false); }
  };

  // 💡 [수정] 조항명만 깔끔하게 보여주는 리스트형 카드 렌더링
  const renderListCard = (card: any) => {
    const lines = card.content.replace(/\s*\[\[?ORIG_ID:\d+\]?\]?/g, '').split('\n');
    const firstLine = lines[0] || "";
    
    let displayTitle = firstLine.replace(/\[(법|령|칙|규|정관|규정)\]/g, '').replace(/\(\s*내용\s*\)/g, '').replace(/내용/g, '').trim();
    if (!displayTitle) displayTitle = "제목 없음";

    let prefix = "[법]"; let titleColor = "text-red-400"; let borderColor = "border-red-500/30";
    if (firstLine.includes('[정관]')) { prefix = "[정관]"; titleColor = "text-yellow-400"; borderColor = "border-yellow-500/30"; }
    else if (firstLine.includes('[칙]') || firstLine.includes('[규]') || firstLine.includes('[규정]')) { prefix = "[칙]"; titleColor = "text-green-400"; borderColor = "border-green-500/30"; }
    else if (firstLine.includes('[령]')) { prefix = "[령]"; titleColor = "text-blue-400"; borderColor = "border-blue-500/30"; }

    return (
        <div 
            key={card.id} 
            onClick={() => setExpandedCard(card)}
            className={`cursor-pointer bg-black/40 border ${borderColor} hover:bg-white/5 p-3 sm:p-4 rounded transition-all hover:-translate-y-0.5 shadow-sm hover:shadow-md flex items-center justify-between group`}
        >
            <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
                <span className={`text-xs sm:text-sm font-black ${titleColor} shrink-0`}>{prefix}</span>
                <span className="text-sm sm:text-base font-bold text-white/90 truncate group-hover:text-white transition-colors">
                    {displayTitle}
                </span>
            </div>
            <div className="shrink-0 text-white/20 text-xs pl-2 group-hover:text-teal-400 transition-colors">
                상세보기 ▶
            </div>
        </div>
    );
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in w-full pb-10">
      <div className="flex justify-between items-end mb-4 sm:mb-6 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif text-current tracking-tight">카드 수집 및 메모</h1>
          <p className="text-xs sm:text-sm text-white/40 mt-1">조항명을 클릭해 원문을 확인하고 학습 메모를 작성하세요.</p>
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
                  {col1Cards.map(c => renderListCard(c))}
                </div>
                
                <div className="flex flex-col gap-2.5 w-full">
                  <div className="text-xs text-blue-400/70 font-bold mb-1 text-center tracking-widest border-b border-white/5 pb-2">시행령</div>
                  {col2Cards.map(c => renderListCard(c))}
                </div>
                
                <div className="flex flex-col gap-2.5 w-full">
                  <div className="text-xs text-green-400/70 font-bold mb-1 text-center tracking-widest border-b border-white/5 pb-2">시행규칙 / 규정</div>
                  {col3Cards.map(c => renderListCard(c))}
                </div>

              </div>
            </div>
          );
        })}
      </div>

      {/* 💡 [수정] 모달 레이아웃 비율 변경 (목적/원문은 작게, 메모는 넓게) */}
      {expandedCard && (() => {
        const stats = getExtendedStats(expandedCard.memo);
        const cost = (stats.upgrade + 1) * 20;
        const isMax = stats.upgrade >= 50;
        const canUpgrade = stats.upgrade < stats.filled;

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 sm:p-8 animate-in fade-in" onClick={() => setExpandedCard(null)}>
            <div 
                className="bg-[#0a0a0c] border border-teal-500/30 shadow-[0_0_50px_rgba(20,184,166,0.1)] flex flex-col md:flex-row w-full max-w-5xl h-[85vh] rounded-2xl overflow-hidden relative" 
                onClick={e => e.stopPropagation()}
            >
                <button onClick={() => setExpandedCard(null)} className="absolute top-4 right-4 w-10 h-10 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-white/20 z-50 transition-colors">✕</button>

                {/* 왼쪽 사이드바 (카드 정보 및 강화 버튼) */}
                <div className="w-full md:w-[35%] bg-gradient-to-br from-[#1a1a24] to-black border-r border-white/10 p-6 sm:p-8 flex flex-col items-center justify-center relative overflow-hidden shrink-0">
                    <div className="absolute top-6 left-6 text-xl font-black text-white/20 tracking-widest">Lv.{stats.upgrade}</div>
                    
                    <div className="text-center w-full z-10">
                        <div className="inline-block px-4 py-1.5 bg-white/5 border border-white/10 rounded-full text-xs text-teal-400 font-bold tracking-widest mb-6">
                            {expandedCard.folder_name}
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-bold text-white break-keep leading-snug mb-8">
                            {expandedCard.content.split('\n')[0].replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim() || "제목 없음"}
                        </h2>
                    </div>

                    <div className="grid grid-cols-2 gap-3 w-full z-10 mb-8">
                        <div className="bg-black/40 border border-white/10 p-3 rounded-lg text-center">
                            <span className="block text-[10px] text-white/40 mb-1">누적 학습</span>
                            <span className="text-lg font-bold text-indigo-400 font-mono">{stats.filled}회</span>
                        </div>
                        <div className="bg-black/40 border border-white/10 p-3 rounded-lg text-center">
                            <span className="block text-[10px] text-white/40 mb-1">최고 기록</span>
                            <span className="text-lg font-bold text-teal-400 font-mono">{stats.bestTime > 0 ? `${stats.bestTime.toFixed(1)}s` : '-'}</span>
                        </div>
                    </div>

                    <button 
                        disabled={isMax || isEnhancing || !canUpgrade}
                        onClick={() => handleEnhanceCard(expandedCard, stats)}
                        className={`w-full py-4 text-sm font-bold rounded-xl transition-all shadow-lg z-10 ${
                            isMax ? 'bg-yellow-600/20 text-yellow-500 border border-yellow-500/30 cursor-not-allowed' : 
                            !canUpgrade ? 'bg-gray-800/50 text-gray-500 border border-gray-600/30 cursor-not-allowed' :
                            goalBalance >= cost ? 'bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-500 hover:to-indigo-500 text-white border border-transparent hover:scale-[1.02]' : 
                            'bg-red-900/20 text-red-500/50 border border-red-500/20 cursor-not-allowed'
                        }`}
                    >
                        {isMax ? '마스터 달성 완료 (MAX)' : !canUpgrade ? `강화 불가 (학습 ${stats.filled}회 / 필요 ${stats.upgrade + 1}회)` : `💎 ${cost}P로 카드 강화하기`}
                    </button>
                </div>

                {/* 오른쪽 패널 (원문 및 메모) */}
                <div className="w-full md:w-[65%] flex flex-col h-full bg-[#0d0d12]">
                    
                    {/* 💡 [수정] 목적/원문 영역은 작게 (최대 높이 35% 제한) */}
                    <div className="p-5 sm:p-6 border-b border-white/10 overflow-y-auto max-h-[35%] min-h-[25%] custom-scrollbar shadow-inner bg-black/20 shrink-0">
                        <h3 className="text-xs font-bold text-white/40 mb-3 flex items-center gap-2"><span className="text-base">📖</span> 조항 원문</h3>
                        <p className="text-[14px] sm:text-[15px] text-white/70 whitespace-pre-wrap font-serif leading-relaxed break-keep">
                            {expandedCard.content.replace(/##PAGE_BREAK##/g, '\n\n')}
                        </p>
                    </div>

                    {/* 💡 [수정] 메모 영역은 남은 공간을 모두 차지하도록 크게 (flex-1) */}
                    <div className="p-5 sm:p-6 flex-1 flex flex-col">
                        <h3 className="text-xs font-bold text-amber-400 mb-3 flex justify-between items-end">
                            <span className="flex items-center gap-2"><span className="text-base">📝</span> 나만의 학습 메모</span>
                            <span className="text-white/30 text-[10px] font-normal tracking-widest bg-white/5 px-2 py-1 rounded hidden sm:block">입력창 바깥 클릭 시 자동 저장됨</span>
                        </h3>
                        <textarea
                            defaultValue={stats.text}
                            onBlur={(e) => handleMemoBlur(expandedCard, e.target.value)}
                            placeholder="이 조항의 암기 팁, 두음, 판례 등 학습에 필요한 메모를 자유롭게 작성하세요..."
                            className="flex-1 w-full bg-amber-950/10 border border-amber-500/30 rounded-xl p-5 text-amber-100/90 text-[15px] outline-none focus:border-amber-500 focus:bg-amber-950/20 focus:shadow-[0_0_20px_rgba(245,158,11,0.1)] transition-all resize-none custom-scrollbar leading-relaxed"
                        />
                    </div>
                </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};
