import React, { useState } from 'react';

// 안전하게 JSON 메모를 파싱하는 내부 헬퍼 (App.tsx와 공유 구조)
const getExtendedStats = (memoStr: string) => {
  try {
    const p = JSON.parse(memoStr || '{}');
    return {
      text: p.text || "",
      filled: p.filled || 0,
      wrongIndices: p.wrongIndices || [],
      upgrade: p.upgrade || 0,       // 강화 수치
      bestTime: p.bestTime || 0,     // 최고 클리어 시간
      totalCorrect: p.totalCorrect || 0, // 누적 정답 수
      totalWrong: p.totalWrong || 0      // 누적 오답 수
    };
  } catch(e) {
    return { text: "", filled: 0, wrongIndices: [], upgrade: 0, bestTime: 0, totalCorrect: 0, totalWrong: 0 };
  }
};

export const RecordTab = ({ savedCards, goalBalance, handleUpdateBalance, loadAllData, safeAddress }: any) => {
  const [isEnhancing, setIsEnhancing] = useState(false);

  // CCG 카드 강화 로직
  const handleEnhanceCard = async (card: any, currentStats: any) => {
    if (currentStats.upgrade >= 10) {
      alert("이미 최고 레벨(MAX)에 도달한 카드입니다!");
      return;
    }

    const cost = (currentStats.upgrade + 1) * 20; // 1강 20P, 2강 40P ... 점점 비싸집니다.
    if (goalBalance < cost) {
      alert(`포인트가 부족합니다! (필요 포인트: ${cost}P)`);
      return;
    }

    if (!confirm(`[${cost}P]를 사용하여 이 카드를 강화하시겠습니까?`)) return;

    setIsEnhancing(true);
    handleUpdateBalance(-cost);

    currentStats.upgrade += 1;
    const newMemo = JSON.stringify(currentStats);

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
      await loadAllData(); // 화면 갱신
    } catch (e) {
      console.error("강화 실패", e);
    } finally {
      setIsEnhancing(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in">
      <div className="flex justify-between items-end mb-6 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif text-current tracking-tight">카드 컬렉션</h1>
          <p className="text-xs sm:text-sm text-white/40 mt-1">학습 기록을 수집하고 포인트를 사용하여 카드를 강화(MAX +10) 하세요.</p>
        </div>
        <div className="text-amber-400 font-bold font-mono bg-black/40 px-4 py-2 border border-amber-500/30 rounded-sm">
          보유: {goalBalance} P
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {savedCards.filter((c:any) => c && c.content && c.folder_name !== '기본 폴더').map((card: any) => {
          const stats = getExtendedStats(card.memo);
          const firstLine = card.content.split('\n')[0] || "제목 없음";
          const displayTitle = firstLine.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
          
          let prefix = "법";
          if (firstLine.includes('[정관]')) prefix = "정관";
          else if (firstLine.includes('[령]')) prefix = "령";
          else if (firstLine.includes('[칙]') || firstLine.includes('[규]')) prefix = "칙";

          const isMax = stats.upgrade >= 10;
          const cost = (stats.upgrade + 1) * 20;

          // 등급별 시각 효과 (일반 -> 레어 -> 에픽 -> 전설)
          let borderClass = "border-white/10 bg-[#08080a]";
          let headerClass = "bg-white/5 text-white/50";
          
          if (isMax) {
            borderClass = "border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.4)] bg-gradient-to-b from-[#1a1500] to-[#0a0a0c]";
            headerClass = "bg-gradient-to-r from-yellow-600 via-amber-500 to-yellow-600 text-black font-extrabold animate-pulse";
          } else if (stats.upgrade >= 7) {
            borderClass = "border-fuchsia-500 shadow-[0_0_10px_rgba(217,70,239,0.2)] bg-[#10081a]";
            headerClass = "bg-fuchsia-900/80 text-fuchsia-200 font-bold";
          } else if (stats.upgrade >= 4) {
            borderClass = "border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.1)] bg-[#08101a]";
            headerClass = "bg-blue-900/60 text-blue-200 font-bold";
          }

          return (
            <div key={card.id} className={`flex flex-col rounded-sm border overflow-hidden transition-all hover:scale-[1.02] ${borderClass}`}>
              
              <div className={`px-3 py-2 flex justify-between items-center ${headerClass}`}>
                <span className="text-[10px] tracking-wider">[{prefix}]</span>
                <span className="text-[14px] font-mono tracking-tighter">
                  {isMax ? '★ MAX' : `+${stats.upgrade}`}
                </span>
              </div>

              <div className="p-4 flex flex-col flex-1">
                <h3 className="font-bold text-[13px] text-white/90 leading-tight mb-4 h-10 line-clamp-2" title={displayTitle}>
                  {displayTitle}
                </h3>
                
                <div className="space-y-2 mb-4 flex-1">
                  <div className="flex justify-between items-center text-[11px] font-mono bg-black/40 p-1.5 rounded border border-white/5">
                    <span className="text-white/40">최고 기록</span>
                    <span className="text-teal-400 font-bold">{stats.bestTime > 0 ? `${stats.bestTime.toFixed(1)}초` : '기록 없음'}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-mono bg-black/40 p-1.5 rounded border border-white/5">
                    <span className="text-white/40">누적 반복</span>
                    <span className="text-indigo-400 font-bold">{stats.filled}회 독파</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-mono bg-black/40 p-1.5 rounded border border-white/5">
                    <span className="text-white/40">정답 / 오답</span>
                    <span className="font-bold"><span className="text-green-400">O:{stats.totalCorrect}</span> <span className="text-white/30">|</span> <span className="text-red-400">X:{stats.totalWrong}</span></span>
                  </div>
                </div>

                <div className="mb-4 bg-white/5 p-2 rounded border border-white/5 h-16 overflow-y-auto custom-scrollbar">
                  <span className="text-[10px] text-amber-300/80 font-serif leading-snug">
                    {stats.text ? `"${stats.text}"` : "메모가 없습니다."}
                  </span>
                </div>

                <button 
                  disabled={isMax || isEnhancing}
                  onClick={() => handleEnhanceCard(card, stats)}
                  className={`w-full py-2 text-[11px] font-bold rounded-sm transition-all flex justify-center items-center gap-1 ${
                    isMax ? 'bg-yellow-500 text-black shadow-inner cursor-not-allowed' : 
                    goalBalance >= cost ? 'bg-white/10 hover:bg-white/20 text-white border border-white/20' : 
                    'bg-red-900/20 text-red-500/50 border border-red-500/20 cursor-not-allowed'
                  }`}
                >
                  {isMax ? '전설 등급 달성' : `💎 강화 시도 (${cost}P)`}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
