import React, { useEffect, useState } from 'react';
import { parseCardStats, formatCardText } from '../utils/constants';

export const DashboardTab = ({ categories, savedCards, setActiveTab, setExpandedId, setActiveCard }: any) => {
  const safeCards = Array.isArray(savedCards) ? savedCards : [];
  const safeCategories = Array.isArray(categories) ? categories : [];
  
  let totalBlanks = 0;
  let totalFilled = 0;
  let totalWrong = 0;

  const folderStats: Record<string, { total: number; filled: number; wrong: number }> = {};
  
  safeCards.forEach((card: any) => {
    const folder = card.folder_name || '기본 폴더';
    if (!folderStats[folder]) folderStats[folder] = { total: 0, filled: 0, wrong: 0 };

    const { body } = formatCardText(card.content);
    const blanks = body.match(/\[\s*(.*?)\s*\]/g) || [];
    const blankCount = blanks.length;
    
    const stats = parseCardStats(card.memo);
    totalBlanks += blankCount;
    totalFilled += stats.filled;
    totalWrong += stats.wrongIndices.length;

    folderStats[folder].total += blankCount;
    folderStats[folder].filled += stats.filled;
    folderStats[folder].wrong += stats.wrongIndices.length;
  });

  const craftProgress = safeCategories.length > 0 ? Math.round((safeCards.length / safeCategories.length) * 100) : 0;
  
  const [recentCraftId, setRecentCraftId] = useState<number | null>(null);
  const [recentCraftTitle, setRecentCraftTitle] = useState("");
  const [recentEnhanceId, setRecentEnhanceId] = useState<number | null>(null);
  const [recentEnhanceTitle, setRecentEnhanceTitle] = useState("");
  
// 💡 [수정할 useEffect 부분]
  useEffect(() => {
    // 함수로 분리하여 데이터를 가져오게 합니다.
    const loadResumeData = () => {
      const cId = localStorage.getItem('blankd_last_crafted_id');
      const cTitle = localStorage.getItem('blankd_last_crafted_title');
      const eId = localStorage.getItem('blankd_last_enhanced_id');
      const eTitle = localStorage.getItem('blankd_last_enhanced_title');

      if (cId) setRecentCraftId(parseInt(cId, 10));
      setRecentCraftTitle(cTitle || "");
      if (eId) setRecentEnhanceId(parseInt(eId, 10));
      setRecentEnhanceTitle(eTitle || "");
    };

    // 1. 처음 렌더링 될 때 실행
    loadResumeData();

    // 2. 다른 탭이나 창에서 로컬스토리지가 변할 때 즉시 감지해서 화면 업데이트
    window.addEventListener('storage', loadResumeData);
    
    // 3. 카드 데이터(savedCards) 갱신이 완료되었을 때 한 번 더 확실하게 체크
    const timeoutId = setTimeout(() => loadResumeData(), 500);

    return () => {
      window.removeEventListener('storage', loadResumeData);
      clearTimeout(timeoutId);
    };
  }, [savedCards]);

  const sortedFolders = Object.keys(folderStats).sort();

  return (
    <div className="space-y-6 animate-in fade-in max-w-full pb-10">
      
      {/* 상단 통계 및 체크포인트 영역 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         
         {/* 💡 만들기 블록 */}
         <div className="bg-indigo-900/20 border border-indigo-500/30 p-4 rounded-sm flex flex-col justify-center">
            <div className="flex justify-between items-center mb-2">
                <div className="text-indigo-400 font-bold text-sm">만들기</div>
                {/* 우측 체크포인트 버튼 (만들기) */}
                {recentCraftId && (
                    <button 
                        onClick={() => {
                            setExpandedId(recentCraftId);
                            setActiveTab('create');
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-[10px] sm:text-xs font-bold rounded border border-indigo-500/30 transition-colors"
                        title="마지막으로 작업한 곳으로 이동"
                    >
                        <span>📍 최근 작업: <span className="font-normal opacity-80">{recentCraftTitle}</span></span>
                    </button>
                )}
            </div>
            <div className="flex items-end gap-2 mb-2">
               <span className="text-3xl font-bold text-white">{safeCards.length}</span>
               <span className="text-white/50 mb-1">/ {safeCategories.length} 조항</span>
            </div>
            <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden">
               <div className="bg-indigo-500 h-full transition-all duration-1000" style={{width: `${craftProgress}%`}}></div>
            </div>
         </div>

         {/* 💡 채우기 블록 */}
         <div className="bg-teal-900/20 border border-teal-500/30 p-4 rounded-sm flex flex-col justify-center">
            <div className="flex justify-between items-center mb-2">
                <div className="text-teal-400 font-bold text-sm">채우기</div>
                {/* 우측 체크포인트 버튼 (채우기) */}
                {recentEnhanceId && (
                    <button 
                        onClick={() => {
                            const matchedCard = safeCards.find((c: any) => c.id === recentEnhanceId);
                            if (matchedCard) {
                                setActiveCard(matchedCard);
                                setActiveTab('enhance');
                            } else if (safeCards.length > 0) {
                                setActiveCard(safeCards[0]);
                                setActiveTab('enhance');
                            }
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-teal-600/20 hover:bg-teal-600/40 text-teal-300 text-[10px] sm:text-xs font-bold rounded border border-teal-500/30 transition-colors"
                        title="마지막으로 풀던 카드로 이동"
                    >
                        <span>📍 이어서 하기: <span className="font-normal opacity-80">{recentEnhanceTitle}</span></span>
                    </button>
                )}
            </div>
            <div className="flex items-end gap-2 mb-2">
               <span className="text-3xl font-bold text-white">{totalFilled}</span>
               <span className="text-white/50 mb-1">회</span>
            </div>
            <div className="text-xs text-white/40">생성된 빈칸 수: {totalBlanks}개</div>
         </div>
      </div>
      
      <div className="text-white/50 font-bold text-sm mb-2 mt-6">폴더별 학습(채우기) 진척도</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 pt-2 border-t border-white/5 w-full">
        {sortedFolders.map(folder => {
          const fs = folderStats[folder];
          const fp = fs.total > 0 ? Math.round((fs.filled / fs.total) * 100) : 0;
          return (
            <div key={folder} className="bg-white/5 border border-white/5 p-2 sm:p-3 rounded-sm hover:bg-white/10 transition-colors flex flex-col gap-1.5 sm:gap-2">
              <div className="flex justify-between items-start">
                <span className="text-[10px] sm:text-[11px] font-bold text-amber-500/80 truncate pr-1 flex-1 leading-tight">{folder}</span>
                <span className="text-[9px] sm:text-[10px] text-white/40 font-mono">{fp}%</span>
              </div>
              <div className="w-full bg-black/40 h-1 rounded-full overflow-hidden">
                <div className="bg-amber-500/60 h-full transition-all duration-700" style={{ width: `${Math.min(fp, 100)}%` }}></div>
              </div>
              <div className="flex justify-between text-[8px] sm:text-[9px] font-mono tracking-tighter mt-0.5">
                <span className="text-white/40">반복:{fs.filled}</span>
                <span className="text-red-400/80">오답:{fs.wrong}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
