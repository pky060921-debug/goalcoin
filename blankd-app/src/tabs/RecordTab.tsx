import React, { useState } from 'react';

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

  // 💡 메모 입력 후 바깥을 클릭(onBlur)하면 즉시 서버에 저장하는 함수
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
      // 저장 후 데이터 동기화
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
      if(typeof loadAllData === 'function') await loadAllData(true); 
    } catch (e) {} finally { setIsEnhancing(false); }
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in w-full pb-10">
      <div className="flex justify-between items-end mb-4 sm:mb-6 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif text-current tracking-tight">카드 수집 및 메모</h1>
          <p className="text-xs sm:text-sm text-white/40 mt-1">카드를 펼쳐 원문을 읽고, 나만의 학습 메모를 자유롭게 작성하세요.</p>
        </div>
        <div className="text-amber-400 font-bold text-[11px] sm:text-xs font-mono bg-black/40 px-3 py-1.5 border border-amber-500/30 rounded-sm shrink-0">
          보유: {goalBalance} P
        </div>
      </div>

      {/* 💡 채우기 탭과 100% 동일한 순서 배열을 위해 savedCards를 직접 매핑합니다. */}
      <div className={`grid grid-cols-1 ${getGridClass(colCount)} gap-4 items-start w-full`}>
        {savedCards.map((card: any) => {
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

          const previewContent = lines.length > 1 ? lines.slice(1).join(' ') : card.content;
          const previewText = previewContent.replace(/\[.*?\]/g, '___').substring(0, 80);

          let borderClass = "border-white/10 hover:border-teal-500/30";
          if (isMax) borderClass = "border-yellow-500/50 shadow-[0_0_10px_rgba(250,204,21,0.15)]";

          return (
            <div 
              key={card.id} 
              // 💡 카드가 펼쳐지면 'col-span-full'이 발동하여 화면 전체 가로길이를 꽉 채웁니다.
              className={`bg-[#0a0a0c] border rounded-sm transition-all duration-300 flex flex-col ${
                isExpanded 
                  ? 'col-span-full shadow-2xl scale-[1.01] z-10 border-teal-500/50 bg-[#0d0d12]' 
                  : borderClass
              }`}
            >
              <div 
                onClick={() => setExpandedId(isExpanded ? null : card.id)}
                className="p-4 cursor-pointer flex justify-between items-center border-b border-white/5 bg-white/5 hover:bg-white/10 transition-colors"
              >
                <div className="flex flex-col gap-1.5 overflow-hidden pr-4 w-full">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-white/50 font-mono tracking-widest bg-black/40 border border-white/10 px-2 py-0.5 rounded-sm shrink-0">
                      {card.folder_name || '기본 폴더'}
                    </span>
                    <div className={`text-[9px] font-mono font-bold whitespace-nowrap shrink-0 ${isMax ? 'text-yellow-500 animate-pulse' : 'text-white/50'}`}>
                      {isMax ? '★MAX' : `+${stats.upgrade} 강화`}
                    </div>
                  </div>
                  <span className={`font-bold truncate transition-colors ${isExpanded ? 'text-lg text-teal-300' : `text-sm ${titleColor}`}`}>
                    <span className="opacity-80 text-xs mr-1">{prefix}</span>{displayTitle}
                  </span>
                </div>
                <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-black/40 border border-white/10">
                  <span className={`text-white/50 text-xs transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                </div>
              </div>

              {isExpanded ? (
                <div className="p-5 sm:p-8 flex flex-col gap-6 bg-black/40 animate-in fade-in duration-200">
                  
                  <div className="flex flex-col gap-2.5">
                    <label className="text-xs font-bold text-white/40 tracking-widest flex justify-between">
                      <span>📖 원문 내용</span>
                    </label>
                    <div className="text-[15px] leading-relaxed text-white/80 whitespace-pre-wrap font-serif bg-black/40 p-5 sm:p-6 rounded border border-white/10 max-h-[400px] overflow-y-auto custom-scrollbar break-keep shadow-inner">
                      {card.content.replace(/##PAGE_BREAK##/g, '\n\n')}
                    </div>
                  </div>
                  
                  {/* 💡 넓고 거대한 메모 입력 영역 */}
                  <div className="flex flex-col gap-2.5 mt-2">
                    <div className="flex justify-between items-end">
                      <label className="text-xs font-bold text-amber-400 tracking-widest flex items-center gap-1.5">
                        <span>📝</span> 학습 메모 (인사이트)
                      </label>
                      <span className="text-[10px] text-white/30 hidden sm:inline">입력창 바깥을 클릭하면 자동 저장됩니다.</span>
                    </div>
                    <textarea
                      defaultValue={stats.text}
                      onBlur={(e) => handleMemoBlur(card, e.target.value)}
                      placeholder="이 조항의 암기 팁, 두음, 판례 등 학습에 필요한 메모를 자유롭게 작성하세요..."
                      className="w-full h-40 sm:h-48 bg-amber-950/10 border border-amber-500/30 rounded p-4 text-[13px] sm:text-sm text-amber-100/90 outline-none focus:border-amber-500 focus:bg-amber-950/20 focus:shadow-[0_0_15px_rgba(245,158,11,0.1)] transition-all resize-y custom-scrollbar leading-relaxed"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <div className="flex flex-col items-center justify-center text-[10px] sm:text-xs font-mono bg-black/40 p-3 rounded border border-white/5">
                        <span className="text-white/40 mb-1">최고기록</span>
                        <span className="text-teal-400 font-bold text-sm">{stats.bestTime > 0 ? `${stats.bestTime.toFixed(1)}초` : '-'}</span>
                    </div>
                    <div className="flex flex-col items-center justify-center text-[10px] sm:text-xs font-mono bg-black/40 p-3 rounded border border-white/5">
                        <span className="text-white/40 mb-1">누적반복</span>
                        <span className="text-indigo-400 font-bold text-sm">{stats.filled}회</span>
                    </div>
                    <div className="flex flex-col items-center justify-center text-[10px] sm:text-xs font-mono bg-black/40 p-3 rounded border border-white/5">
                        <span className="text-white/40 mb-1">정답/오답</span>
                        <span className="text-sm font-bold"><span className="text-green-400">{stats.totalCorrect}</span> <span className="text-white/30 text-xs">/</span> <span className="text-red-400">{stats.totalWrong}</span></span>
                    </div>
                  </div>

                  <button 
                      disabled={isMax || isEnhancing || !canUpgrade}
                      onClick={(e) => { e.stopPropagation(); handleEnhanceCard(card, stats); }}
                      className={`w-full py-3 mt-2 text-xs font-bold rounded-sm transition-all flex justify-center items-center gap-2 ${
                          isMax ? 'bg-yellow-600/20 text-yellow-500 border border-yellow-500/30 cursor-not-allowed' : 
                          !canUpgrade ? 'bg-gray-800/50 text-gray-500 border border-gray-600/30 cursor-not-allowed' :
                          goalBalance >= cost ? 'bg-white/10 hover:bg-white/20 text-white border border-white/20 shadow-lg' : 
                          'bg-red-900/20 text-red-500/50 border border-red-500/20 cursor-not-allowed'
                      }`}
                  >
                      {isMax ? '최고 레벨(50) 달성 완료' : !canUpgrade ? `강화 불가 (현재 학습 ${stats.filled}회 / 필요 ${stats.upgrade + 1}회)` : `💎 포인트로 강화 시도 (비용: ${cost}P)`}
                  </button>

                </div>
              ) : (
                <div className="p-4 text-[13px] text-white/40 line-clamp-2 leading-relaxed bg-black/20">
                  {previewText}...
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {savedCards.length === 0 && (
        <div className="text-center py-24 flex flex-col items-center gap-4">
          <span className="text-4xl opacity-20">🗂️</span>
          <span className="text-white/40 text-sm font-bold tracking-widest">수집된 카드가 없습니다.</span>
        </div>
      )}
    </div>
  );
};
