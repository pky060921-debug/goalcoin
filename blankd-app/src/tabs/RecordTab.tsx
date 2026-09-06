import React, { useState, useEffect } from 'react';

const getExtendedStats = (memoStr: string) => {
  try {
    if (memoStr && memoStr.trim().startsWith('{')) {
      const p = JSON.parse(memoStr || '{}');
      return {
        text: p.text || "", filled: p.filled || 0, wrongIndices: p.wrongIndices || [],
        upgrade: p.upgrade || 0, bestTime: p.bestTime || 0, totalCorrect: p.totalCorrect || 0, totalWrong: p.totalWrong || 0,
        history: p.history || [],
        ox_quiz: p.ox_quiz || null
      };
    }
  } catch(e) {}
  return { text: "", filled: 0, wrongIndices: [], upgrade: 0, bestTime: 0, totalCorrect: 0, totalWrong: 0, history: [], ox_quiz: null };
};

export const RecordTab = ({ savedCards, safeAddress, setActiveCard }: any) => {
  const [localCards, setLocalCards] = useState<any[]>([]);
  const [subTab, setSubTab] = useState<'blank' | 'exam'>('blank');
  const [expandedExamId, setExpandedExamId] = useState<string | number | null>(null);

  useEffect(() => { setLocalCards(Array.isArray(savedCards) ? savedCards : []); }, [savedCards]);

  // --- 빈칸 오답 ---
  const blankCards = localCards.filter(c => {
     const stats = getExtendedStats(c.memo);
     if (stats.ox_quiz) return false;
     const wWords = new Set(stats.history.flatMap((h: any) => h.wrongWords || []));
     return wWords.size > 0;
  });

  const getBlankFolders = () => {
     return Array.from(new Set(blankCards.map(c => c.folder_name))).filter(Boolean).sort();
  };

  // --- 모의고사 오답 ---
  const examCards = localCards.filter(c => {
     const stats = getExtendedStats(c.memo);
     return !!stats.ox_quiz;
  });

  const getExamFolders = () => {
     return Array.from(new Set(examCards.map(c => c.folder_name))).filter(Boolean).sort();
  };

  const renderBlankCard = (card: any) => {
     const stats = getExtendedStats(card.memo);
     const wrongWords = Array.from(new Set(stats.history.flatMap((h: any) => h.wrongWords || []))) as string[];
     const title = card.content.split('\n')[0].replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim() || '제목 없음';

     return (
       <div key={card.id} className="relative w-full perspective-1000 mb-2 animate-in fade-in">
         <div 
           onClick={() => setActiveCard(card)} // 💡 클릭 시 앱 메인의 CardModal(채우기 탭과 동일)을 띄움
           className="w-full text-left p-3 sm:p-4 rounded-sm transition-all duration-300 shadow-md border cursor-pointer flex flex-col justify-between items-start gap-2 bg-red-950/20 border-red-500/30 hover:bg-red-900/30"
         >
           <div className="flex justify-between items-center w-full gap-2">
              <div className="font-bold text-[11px] sm:text-[13px] tracking-tight leading-snug line-clamp-2 text-red-100">
                 {title}
              </div>
              <span className="shrink-0 bg-red-600 text-white text-[9px] sm:text-[10px] px-2 py-1 rounded-sm font-bold shadow-[0_0_10px_rgba(220,38,38,0.5)] animate-pulse">
                터치하여 복습 ▶
              </span>
           </div>
           
           <div className="flex flex-wrap gap-1 mt-2 w-full">
              <span className="text-[10px] text-red-400 font-bold w-full mb-0.5">틀렸던 빈칸:</span>
              {wrongWords.map(w => (
                 <span key={w} className="bg-red-900/50 text-red-200 border border-red-500/40 px-2 py-0.5 rounded-sm text-[10px] font-bold">
                    {w}
                 </span>
              ))}
           </div>
         </div>
       </div>
     );
  };

  const renderExamCard = (card: any) => {
     const stats = getExtendedStats(card.memo);
     const quiz = stats.ox_quiz;
     const isExpanded = expandedExamId === card.id;
     const title = card.content.split('\n')[0].replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim() || '기출 조항';

     return (
       <div key={card.id} className="relative w-full perspective-1000 mb-2 animate-in fade-in">
         <div 
           onClick={() => setExpandedExamId(isExpanded ? null : card.id)}
           className={`w-full text-left p-3 sm:p-4 rounded-sm transition-all duration-300 shadow-md border cursor-pointer flex flex-col justify-between items-start gap-2 ${isExpanded ? 'bg-indigo-900/30 border-indigo-500/50' : 'bg-indigo-950/20 border-indigo-500/30 hover:bg-indigo-900/30'}`}
         >
           <div className="flex justify-between items-center w-full gap-2">
              <div className="font-bold text-[11px] sm:text-[13px] tracking-tight leading-snug line-clamp-2 text-indigo-100">
                 {title}
              </div>
              <span className="shrink-0 bg-indigo-600 text-white text-[9px] sm:text-[10px] px-2 py-1 rounded-sm font-bold shadow-[0_0_10px_rgba(79,70,229,0.5)]">
                 {isExpanded ? '접기 ▲' : '해설 보기 ▼'}
              </span>
           </div>
           {!isExpanded && (
             <div className="text-[12px] text-white/80 mt-2 font-serif leading-relaxed line-clamp-2">
                Q. {quiz.question}
             </div>
           )}
         </div>

         {isExpanded && (
           <div className="w-full bg-[#0a0a0c] border border-indigo-500/30 p-4 mt-1 rounded-sm animate-in slide-in-from-top-2 shadow-inner flex flex-col gap-3">
              <div className="text-[13px] text-white/90 font-serif leading-relaxed">
                 <span className="text-indigo-400 font-bold mr-1">Q.</span> {quiz.question}
              </div>
              <div className="text-[12px] font-bold mt-2">
                 <span className={quiz.answer === 'O' ? 'text-teal-400 bg-teal-900/20 px-2 py-1 rounded border border-teal-500/30' : 'text-red-400 bg-red-900/20 px-2 py-1 rounded border border-red-500/30'}>
                    정답: {quiz.answer}
                 </span>
              </div>
              <div className="bg-indigo-900/20 border border-indigo-500/20 p-3 rounded-sm text-[12px] text-indigo-200/80 leading-relaxed font-serif break-keep mt-1">
                 <span className="text-indigo-400 font-bold block mb-1.5">[AI 해설]</span>
                 {quiz.explanation}
              </div>
           </div>
         )}
       </div>
     );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in pb-24 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-white/10 pb-4 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif text-current tracking-tight mb-2">기록실</h1>
          <p className="text-[11px] sm:text-xs text-white/40 leading-relaxed">
            빈칸 학습 중 틀렸던 오답과, 모의고사 뷰어에서 수집한 실전 오답을 나누어 복습합니다.
          </p>
        </div>
        
        {/* 💡 서브 탭 토글 버튼 */}
        <div className="flex bg-black/40 border border-white/10 p-1 rounded-sm shrink-0">
           <button 
             onClick={() => setSubTab('blank')}
             className={`px-4 py-2 text-[11px] sm:text-xs font-bold transition-all rounded-sm ${subTab === 'blank' ? 'bg-red-900/50 text-red-300 shadow-md' : 'text-white/40 hover:text-white/80'}`}
           >
             📝 빈칸 오답
           </button>
           <button 
             onClick={() => setSubTab('exam')}
             className={`px-4 py-2 text-[11px] sm:text-xs font-bold transition-all rounded-sm ${subTab === 'exam' ? 'bg-indigo-900/50 text-indigo-300 shadow-md' : 'text-white/40 hover:text-white/80'}`}
           >
             🎯 모의고사 오답
           </button>
        </div>
      </div>

      {subTab === 'blank' && (
        <div className="space-y-6 sm:space-y-8 w-full animate-in fade-in">
          {getBlankFolders().length === 0 ? (
            <div className="text-center py-20 text-teal-400/50 text-sm font-serif">현재 틀린 빈칸 문제가 없습니다! 완벽합니다.</div>
          ) : (
            getBlankFolders().map((folder: any) => {
              const folderCards = blankCards.filter(c => c.folder_name === folder);
              if (folderCards.length === 0) return null;
              
              const col1Cards = folderCards.filter((c:any) => { const f = c.content.split('\n')[0]||""; return !f.includes('[령]') && !f.includes('[칙]') && !f.includes('[규]') && !f.includes('[규정]'); });
              const col2Cards = folderCards.filter((c:any) => { const f = c.content.split('\n')[0]||""; return f.includes('[령]'); });
              const col3Cards = folderCards.filter((c:any) => { const f = c.content.split('\n')[0]||""; return f.includes('[칙]') || f.includes('[규]') || f.includes('[규정]'); });

              return (
                <div key={folder} className="mb-10 sm:mb-12 border-l-2 border-red-500/30 pl-2 sm:pl-4 bg-red-950/5 p-4 rounded-r-md">
                  <div className="text-sm sm:text-base text-red-300 mb-4 border-b border-red-500/20 pb-2 font-bold tracking-widest">{folder}</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 items-start w-full">
                    <div className="flex flex-col gap-2.5 w-full">
                      <div className="text-xs text-white/50 font-bold mb-1 text-center tracking-widest border-b border-white/5 pb-2">법 / 정관</div>
                      {col1Cards.map(c => renderBlankCard(c))}
                    </div>
                    <div className="flex flex-col gap-2.5 w-full">
                      <div className="text-xs text-white/50 font-bold mb-1 text-center tracking-widest border-b border-white/5 pb-2">시행령</div>
                      {col2Cards.map(c => renderBlankCard(c))}
                    </div>
                    <div className="flex flex-col gap-2.5 w-full">
                      <div className="text-xs text-white/50 font-bold mb-1 text-center tracking-widest border-b border-white/5 pb-2">시행규칙</div>
                      {col3Cards.map(c => renderBlankCard(c))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {subTab === 'exam' && (
        <div className="space-y-6 sm:space-y-8 w-full animate-in fade-in">
          {getExamFolders().length === 0 ? (
            <div className="text-center py-20 text-white/30 text-sm font-serif">저장된 모의고사 오답이 없습니다.</div>
          ) : (
            getExamFolders().map((folder: any) => {
              const folderCards = examCards.filter(c => c.folder_name === folder);
              if (folderCards.length === 0) return null;
              
              return (
                <div key={folder} className="mb-10 sm:mb-12 border-l-2 border-indigo-500/30 pl-2 sm:pl-4 bg-indigo-950/5 p-4 rounded-r-md">
                  <div className="text-sm sm:text-base text-indigo-300 mb-4 border-b border-indigo-500/20 pb-2 font-bold tracking-widest">{folder}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 items-start w-full">
                    {folderCards.map(c => renderExamCard(c))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
