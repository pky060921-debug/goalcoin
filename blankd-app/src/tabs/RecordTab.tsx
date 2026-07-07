import React, { useState, useEffect } from 'react';

const getExtendedStats = (memoStr: string) => {
  try {
    if (memoStr && memoStr.trim().startsWith('{')) {
      const p = JSON.parse(memoStr || '{}');
      return {
        text: p.text || "", filled: p.filled || 0, wrongIndices: p.wrongIndices || [],
        upgrade: p.upgrade || 0, bestTime: p.bestTime || 0, totalCorrect: p.totalCorrect || 0, totalWrong: p.totalWrong || 0,
        ox_quiz: p.ox_quiz || null // 💡 OX 퀴즈 데이터 저장 공간 추가
      };
    }
  } catch(e) {}
  return { text: "", filled: 0, wrongIndices: [], upgrade: 0, bestTime: 0, totalCorrect: 0, totalWrong: 0, ox_quiz: null };
};

export const RecordTab = ({ savedCards, goalBalance, handleUpdateBalance, loadAllData, safeAddress }: any) => {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | number | null>(null);

  const [localCards, setLocalCards] = useState<any[]>([]);
  const enhanceFolders = Array.from(new Set(localCards.map((c:any) => c.folder_name))).filter(f => f && f !== '기본 폴더').sort() as string[];
  
  // 💡 OX 퀴즈 일괄 생성용 상태
  const [isGeneratingOX, setIsGeneratingOX] = useState(false);
  const [oxProgress, setOxProgress] = useState({ current: 0, total: 0 });
  
  // 💡 OX 퀴즈 모달용 상태
  const [oxModalCard, setOxModalCard] = useState<any>(null);
  const [oxUserAnswer, setOxUserAnswer] = useState<string | null>(null);

  useEffect(() => { setLocalCards(Array.isArray(savedCards) ? savedCards : []); }, [savedCards]);

  // 🤖 AI 일괄 생성 로직 (진행률 표시 포함)
  const handleGenerateAllOX = async () => {
    const cardsWithoutOX = localCards.filter(c => !getExtendedStats(c.memo).ox_quiz);
    
    if (cardsWithoutOX.length === 0) {
      alert("모든 조항에 이미 실전 OX 퀴즈가 생성되어 있습니다!");
      return;
    }

    if (!window.confirm(`총 ${cardsWithoutOX.length}개의 조항에 대해 AI 출제위원이 OX 퀴즈를 생성합니다.\n조항이 많을 경우 시간이 다소 소요될 수 있습니다. 진행하시겠습니까?`)) return;

    setIsGeneratingOX(true);
    setOxProgress({ current: 0, total: cardsWithoutOX.length });

    let currentProgress = 0;
    const updatedCards = [...localCards];

    for (const card of cardsWithoutOX) {
      try {
        const res = await fetch("https://api.blankd.top/api/generate-ox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: card.content })
        });
        
        if (res.ok) {
          const quizData = await res.json();
          const exStats = getExtendedStats(card.memo);
          exStats.ox_quiz = quizData;
          const newMemo = JSON.stringify(exStats);
          
          // 백엔드 DB 저장
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

          // 로컬 화면 갱신
          const cardIndex = updatedCards.findIndex(c => c.id === card.id);
          if (cardIndex !== -1) updatedCards[cardIndex] = { ...card, memo: newMemo };
          setLocalCards([...updatedCards]);
        }
      } catch (e) {
        console.error("OX 생성 실패:", e);
      }
      
      currentProgress++;
      setOxProgress({ current: currentProgress, total: cardsWithoutOX.length });
    }

    setIsGeneratingOX(false);
    localStorage.setItem(`blankd_off_card_${safeAddress}`, JSON.stringify(updatedCards));
    if (typeof loadAllData === 'function') await loadAllData(true);
    alert(`✅ 완벽합니다! 총 ${currentProgress}개의 실전 OX 퀴즈가 성공적으로 출제되었습니다.`);
  };

  const renderExpandableTCGCard = (card: any) => {
    const stats = getExtendedStats(card.memo);
    const isExpanded = expandedId === card.id;
    const title = card.content.split('\n')[0].replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim() || '제목 없음';
    const hasOX = !!stats.ox_quiz;

    return (
      <div key={card.id} className="relative w-full perspective-1000 mb-2">
        <div 
          onClick={() => {
            if (hasOX) { setOxModalCard(card); setOxUserAnswer(null); } 
            else { setExpandedId(isExpanded ? null : card.id); }
          }}
          className={`w-full text-left p-3 sm:p-4 rounded-sm transition-all duration-300 shadow-md border cursor-pointer flex flex-col justify-between items-start gap-2 ${
            hasOX ? 'bg-indigo-900/10 border-indigo-500/30 hover:bg-indigo-900/20' : 'bg-black/40 border-white/5 hover:border-white/20'
          }`}
        >
          <div className="flex justify-between items-center w-full gap-2">
             <div className={`font-bold text-[11px] sm:text-[13px] tracking-tight leading-snug line-clamp-2 ${hasOX ? 'text-indigo-100' : 'text-white/80'}`}>
                {title}
             </div>
             {hasOX ? (
               <span className="shrink-0 bg-indigo-600 text-white text-[9px] sm:text-[10px] px-2 py-1 rounded-sm font-bold shadow-[0_0_10px_rgba(79,70,229,0.5)] animate-pulse">🎯 OX 가능</span>
             ) : (
               <span className="shrink-0 text-white/30 text-[9px] sm:text-[10px] border border-white/10 px-2 py-1 rounded-sm">미생성</span>
             )}
          </div>
          
          <div className="flex justify-between w-full items-end mt-1">
             <div className="text-[10px] font-mono text-white/40">누적 완주 {stats.filled}회</div>
          </div>
        </div>

        {isExpanded && !hasOX && (
          <div className="w-full bg-[#0a0a0c] border border-white/10 p-3 mt-1 rounded-sm text-[11px] sm:text-[12px] text-white/60 leading-relaxed font-serif animate-in slide-in-from-top-2">
             {card.content.split('\n').slice(1).join('\n')}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in pb-24 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-white/10 pb-4 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif text-current tracking-tight mb-2">실전 기출 수집함</h1>
          <p className="text-[11px] sm:text-xs text-white/40 leading-relaxed">
            마스터한 조항들이 보관됩니다. 카드를 눌러 <span className="text-indigo-400 font-bold">AI가 출제한 실전 OX 퀴즈</span>에 도전하세요.
          </p>
        </div>
        
        {/* 🤖 AI 일괄 생성 버튼 영역 */}
        <button 
           onClick={handleGenerateAllOX} 
           disabled={isGeneratingOX || localCards.length === 0}
           className={`px-4 py-2.5 rounded-sm font-bold text-[11px] sm:text-xs transition-all shadow-lg flex items-center gap-2 ${
             isGeneratingOX ? 'bg-white/5 text-white/30 border border-white/10 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-500 border border-indigo-400'
           }`}
        >
           {isGeneratingOX ? '⏳ 출제 위원 가동 중...' : '🤖 전체 조항 OX 퀴즈 일괄 생성'}
        </button>
      </div>

      {/* 🚀 진행률(Progress) 표시 바 */}
      {isGeneratingOX && (
        <div className="w-full bg-black/40 border border-indigo-500/30 p-4 rounded-sm animate-pulse shadow-inner">
          <div className="flex justify-between items-center text-[11px] font-bold text-indigo-400 mb-3">
             <div className="flex items-center gap-2">
               <span className="text-base">🧠</span>
               <span>인공지능 출제위원이 기출 패턴을 분석하여 함정 문제를 만들고 있습니다...</span>
             </div>
             <span>{oxProgress.current} / {oxProgress.total} 개 완료</span>
          </div>
          <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
             <div 
               className="bg-indigo-500 h-full transition-all duration-300 ease-out" 
               style={{width: `${oxProgress.total > 0 ? (oxProgress.current / oxProgress.total) * 100 : 0}%`}}
             ></div>
          </div>
        </div>
      )}

      {enhanceFolders.length === 0 && localCards.length > 0 && (
        <div className="text-center py-20 text-white/30 text-sm font-serif">카테고리 분류가 진행되지 않았습니다.</div>
      )}

      {enhanceFolders.length === 0 && localCards.length === 0 && (
        <div className="text-center py-20 text-white/30 text-sm font-serif">아직 수집된 법령 카드가 없습니다.</div>
      )}

      <div className="space-y-6 sm:space-y-8 w-full">
        {enhanceFolders.map((folder: string) => {
          const folderCards = localCards.filter(c => c.folder_name === folder).sort((a,b) => parseInt(a.id, 10) - parseInt(b.id, 10));
          if (folderCards.length === 0) return null;
          
          const col1Cards = folderCards.filter((c:any) => { const f = c.content.split('\n')[0]||""; return !f.includes('[령]') && !f.includes('[칙]') && !f.includes('[규]') && !f.includes('[규정]'); });
          const col2Cards = folderCards.filter((c:any) => { const f = c.content.split('\n')[0]||""; return f.includes('[령]'); });
          const col3Cards = folderCards.filter((c:any) => { const f = c.content.split('\n')[0]||""; return f.includes('[칙]') || f.includes('[규]') || f.includes('[규정]'); });

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
                  <div className="text-xs text-green-400/70 font-bold mb-1 text-center tracking-widest border-b border-white/5 pb-2">시행규칙</div>
                  {col3Cards.map(c => renderExpandableTCGCard(c))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 🎯 OX 퀴즈 모달창 */}
      {oxModalCard && getExtendedStats(oxModalCard.memo).ox_quiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0a0a0c] border border-indigo-500/30 p-6 sm:p-8 rounded-sm shadow-2xl w-full max-w-lg flex flex-col gap-6 relative">
            <button onClick={() => setOxModalCard(null)} className="absolute top-4 right-4 text-white/30 hover:text-white transition-colors text-xl font-bold">✕</button>
            
            <div className="text-center space-y-1">
               <div className="text-[10px] text-indigo-400 font-bold tracking-widest uppercase">기출 변형 실전 모의고사</div>
               <h3 className="text-[13px] font-bold text-white/70 line-clamp-1">{oxModalCard.content.split('\n')[0].replace(/\[.*?\]/g, '').trim()}</h3>
            </div>

            <div className="bg-black/50 p-5 rounded-sm border border-white/5 text-[15px] sm:text-base font-serif leading-relaxed text-white break-keep text-center">
               "{getExtendedStats(oxModalCard.memo).ox_quiz.question}"
            </div>

            {!oxUserAnswer ? (
              <div className="grid grid-cols-2 gap-4 mt-2">
                 <button onClick={() => setOxUserAnswer('O')} className="py-4 text-2xl font-bold rounded-sm border border-teal-500/30 text-teal-400 bg-teal-900/10 hover:bg-teal-900/30 transition-all shadow-md">O</button>
                 <button onClick={() => setOxUserAnswer('X')} className="py-4 text-2xl font-bold rounded-sm border border-red-500/30 text-red-400 bg-red-900/10 hover:bg-red-900/30 transition-all shadow-md">X</button>
              </div>
            ) : (
              <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-2">
                 {oxUserAnswer === getExtendedStats(oxModalCard.memo).ox_quiz.answer ? (
                    <div className="text-center text-teal-400 font-bold text-lg p-3 bg-teal-900/20 border border-teal-500/30 rounded-sm">🎉 정답입니다!</div>
                 ) : (
                    <div className="text-center text-red-400 font-bold text-lg p-3 bg-red-900/20 border border-red-500/30 rounded-sm">🚨 틀렸습니다!</div>
                 )}
                 
                 <div className="bg-white/5 border border-white/10 p-4 rounded-sm text-[13px] text-white/80 leading-relaxed font-serif">
                    <span className="text-indigo-400 font-bold block mb-2">[해설 및 오답 노트]</span>
                    {getExtendedStats(oxModalCard.memo).ox_quiz.explanation}
                 </div>
                 
                 <button onClick={() => setOxModalCard(null)} className="w-full py-3 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-sm transition-colors mt-2">
                    닫기
                 </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
