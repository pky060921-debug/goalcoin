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

const getGridClass = (cols: number) => {
  if(cols === 1) return "md:grid-cols-1";
  if(cols === 2) return "md:grid-cols-2";
  if(cols === 3) return "md:grid-cols-3";
  if(cols === 4) return "md:grid-cols-4";
  if(cols === 5) return "md:grid-cols-5";
  return "md:grid-cols-3";
};

export const RecordTab = ({ savedCards, safeAddress, setActiveCard, colCount }: any) => {
  const [localCards, setLocalCards] = useState<any[]>([]);
  const [subTab, setSubTab] = useState<'blank' | 'exam'>('blank');
  const [expandedExamId, setExpandedExamId] = useState<string | number | null>(null);

  useEffect(() => { setLocalCards(Array.isArray(savedCards) ? savedCards : []); }, [savedCards]);

  // --- 빈칸 오답 ---
  const blankCards = localCards.filter(c => {
     const stats = getExtendedStats(c.memo);
     if (stats.ox_quiz) return false;
     // 💡 [수정] 누적 히스토리가 아닌 '현재 남아있는 오답 인덱스' 기준으로 필터링
     // 오답을 다 맞추면 기록실 목록에서 자동으로 사라집니다.
     return stats.wrongIndices && stats.wrongIndices.length > 0;
  });

  const getBlankFolders = () => {
     return Array.from(new Set(blankCards.map(c => c.folder_name))).filter(f => f && f !== '기본 폴더').sort();
  };

  // --- 모의고사 오답 ---
  const examCards = localCards.filter(c => {
     const stats = getExtendedStats(c.memo);
     return !!stats.ox_quiz;
  });

  const getExamFolders = () => {
     return Array.from(new Set(examCards.map(c => c.folder_name))).filter(f => f && f !== '기본 폴더').sort();
  };

  const blankFoldersList = ['기본 폴더', ...getBlankFolders()].filter(f => blankCards.some(c => (c.folder_name || '기본 폴더') === f));
  const examFoldersList = ['기본 폴더', ...getExamFolders()].filter(f => examCards.some(c => (c.folder_name || '기본 폴더') === f));

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
          {blankFoldersList.length === 0 ? (
            <div className="text-center py-20 text-teal-400/50 text-sm font-serif">현재 틀린 빈칸 문제가 없습니다! 완벽합니다.</div>
          ) : (
            blankFoldersList.map((folder: string) => {
              const folderCards = blankCards.filter(c => (c.folder_name || '기본 폴더') === folder);
              if (folderCards.length === 0) return null;

              return (
                <div key={folder} className="mb-6 sm:mb-8 border-l rounded-l-sm pl-3 sm:pl-4 transition-all border-red-500/50">
                  <div className="text-xs sm:text-sm mb-2 sm:mb-3 border-b pb-1.5 sm:pb-2 font-bold transition-all text-red-400 border-red-500/30">
                    📁 {folder}
                  </div>

                  <div className={`grid grid-cols-1 ${getGridClass(colCount)} gap-3 sm:gap-4 items-start`}>
                    {folderCards.map(card => {
                        const cleanContent = card.content.replace(/\s*\[\[?ORIG_ID:\d+\]?\]?/g, '');
                        const lines = cleanContent.split('\n');
                        const firstLine = lines[0] || "";
                        
                        let displayTitle = firstLine
                          .replace(/\[(법\vert{}령\vert{}칙\vert{}규\vert{}정관\vert{}규정)\]/g, '')
                          .replace(/\(\s*내용\s*\)/g, '')
                          .replace(/내용/g, '')
                          .trim();
                        if (!displayTitle) displayTitle = "제목 없음";

                        let colClass = "md:col-start-1 md:col-span-1"; 
                        let titleColor = "text-red-500";
                        
                        if (firstLine.includes('[정관]')) {
                          colClass = "md:col-start-1 md:col-span-1";
                          titleColor = "text-yellow-500";
                        } else if (firstLine.includes('[칙]') || firstLine.includes('[규]') || firstLine.includes('[규정]')) { 
                          colClass = "md:col-start-3 md:col-span-1";
                          titleColor = "text-green-500";
                        } else if (firstLine.includes('[령]')) { 
                          colClass = "md:col-start-2 md:col-span-1";
                          titleColor = "text-blue-400";
                        } else {
                          colClass = "md:col-start-1 md:col-span-1";
                          titleColor = "text-red-500";
                        }

                        const bodyOnlyForStats = lines.slice(1).join('\n');
                        const totalBlanks = (bodyOnlyForStats.match(/\[\s*(.*?)\s*\]/g) || []).length;
                        const stats = getExtendedStats(card.memo);
                        
                        // 💡 [수정] 현재 남아있는 오답의 개수만 실시간으로 카운팅
                        const currentWrongCount = stats.wrongIndices ? stats.wrongIndices.length : 0;

                        const titleLen = displayTitle.length;
                        const titleSizing = titleLen > 25 ? 'text-[10px] sm:text-[11px] tracking-[calc(-0.06em)]' : 
                                            titleLen > 15 ? 'text-[11px] sm:text-[12px] tracking-tighter' : 
                                            'text-[12px] sm:text-[13px] tracking-tight';

                        return (
                          <div key={card.id} className={`relative transition-all w-full ${colClass}`}>
                            <div 
                              onClick={(e) => { e.stopPropagation(); setActiveCard(card); }} 
                              className="w-full p-2 sm:p-2.5 rounded-sm border flex flex-col justify-center cursor-pointer text-left border-red-500/40 bg-red-900/20 hover:bg-red-900/40 shadow-sm transition-all duration-200"
                            >
                              <div className="flex flex-row items-center justify-between w-full gap-2 overflow-hidden">
                                <div className={`${titleColor} font-bold ${titleSizing} text-left truncate leading-tight flex-1`} title={displayTitle}>
                                  {displayTitle}
                                </div>
                                <div className="flex flex-row items-center gap-1.5 shrink-0">
                                  <div className="flex flex-nowrap gap-0.5">
                                    <span className="text-[7px] sm:text-[8px] text-indigo-300 px-1 py-[1px] rounded font-mono whitespace-nowrap leading-none flex items-center">빈칸:{totalBlanks}</span>
                                    <span className="text-[7px] sm:text-[8px] text-white bg-red-600 font-bold px-1 py-[1px] rounded font-mono whitespace-nowrap leading-none flex items-center shadow-sm animate-pulse">오답:{currentWrongCount}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {subTab === 'exam' && (
        <div className="space-y-6 sm:space-y-8 w-full animate-in fade-in">
          {examFoldersList.length === 0 ? (
            <div className="text-center py-20 text-white/30 text-sm font-serif">저장된 모의고사 오답이 없습니다.</div>
          ) : (
            examFoldersList.map((folder: string) => {
              const folderCards = examCards.filter(c => (c.folder_name || '기본 폴더') === folder);
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
