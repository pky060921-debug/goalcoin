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
  const enhanceProgress = totalBlanks > 0 ? Math.round((totalFilled / totalBlanks) * 100) : 0;

  const [recentCraftId, setRecentCraftId] = useState<number | null>(null);
  const [recentCraftTitle, setRecentCraftTitle] = useState("");
  const [recentEnhanceId, setRecentEnhanceId] = useState<number | null>(null);
  const [recentEnhanceTitle, setRecentEnhanceTitle] = useState("");

  // 💡 [수정됨] 이어서 하기 상태 불러오기 로직 (새로고침 대응)
  useEffect(() => {
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

    loadResumeData();
    window.addEventListener('storage', loadResumeData);
    const timeoutId = setTimeout(() => loadResumeData(), 500);

    return () => {
      window.removeEventListener('storage', loadResumeData);
      clearTimeout(timeoutId);
    };
  }, [savedCards]);

  const sortedFolders = Object.keys(folderStats).sort((a, b) => {
    if (a === '기본 폴더') return 1;
    if (b === '기본 폴더') return -1;
    const matchA = a.match(/제\s*(\d+)\s*장/);
    const matchB = b.match(/제\s*(\d+)\s*장/);
    if (matchA && matchB) return parseInt(matchA[1]) - parseInt(matchB[1]);
    return a.localeCompare(b, 'ko');
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 py-4 sm:py-8 px-2 sm:px-0 animate-in fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
        <div className="bg-[#0a0a0c] border border-amber-500/20 p-5 sm:p-6 rounded-sm shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl group-hover:bg-amber-500/10 transition-all duration-700"></div>
          <h2 className="text-amber-500 font-bold mb-4 flex justify-between items-end relative z-10">
            <span className="text-lg sm:text-xl tracking-widest">만들기 진척도</span>
            <span className="text-3xl sm:text-4xl font-mono text-amber-400">{craftProgress}%</span>
          </h2>
          <div className="w-full bg-black/60 h-2 sm:h-3 rounded-full mb-3 overflow-hidden shadow-inner relative z-10 border border-white/5">
            <div className="bg-gradient-to-r from-amber-600 to-amber-400 h-full transition-all duration-1000 ease-out" style={{ width: `${craftProgress}%` }} />
          </div>
          <p className="text-xs sm:text-sm text-amber-500/60 font-mono relative z-10 tracking-wider">
            {safeCards.length} / {safeCategories.length} 조항 생성됨
          </p>
        </div>

        <div className="bg-[#0a0a0c] border border-teal-500/20 p-5 sm:p-6 rounded-sm shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl group-hover:bg-teal-500/10 transition-all duration-700"></div>
          <h2 className="text-teal-500 font-bold mb-4 flex justify-between items-end relative z-10">
            <span className="text-lg sm:text-xl tracking-widest">채우기 진척도</span>
            <span className="text-3xl sm:text-4xl font-mono text-teal-400">{enhanceProgress}%</span>
          </h2>
          <div className="w-full bg-black/60 h-2 sm:h-3 rounded-full mb-3 overflow-hidden shadow-inner relative z-10 border border-white/5">
            <div className="bg-gradient-to-r from-teal-600 to-teal-400 h-full transition-all duration-1000 ease-out" style={{ width: `${enhanceProgress}%` }} />
          </div>
          <div className="flex justify-between items-center relative z-10">
            <p className="text-xs sm:text-sm text-teal-500/60 font-mono tracking-wider">
              {totalFilled} / {totalBlanks} 빈칸 채움
            </p>
            <p className="text-[10px] sm:text-xs text-red-400/80 font-mono bg-red-900/20 px-2 py-1 rounded border border-red-500/20">
              오답: {totalWrong}
            </p>
          </div>
        </div>
      </div>

      {/* 💡 [복구됨] 이어서 하기 버튼 UI 영역 */}
      {(recentCraftId || recentEnhanceId) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          {recentCraftId && (
            <button 
              onClick={() => { setActiveTab('create'); setExpandedId(recentCraftId); }}
              className="bg-amber-900/20 border border-amber-500/30 p-4 rounded-sm flex flex-col items-start hover:bg-amber-900/40 transition-colors text-left"
            >
              <span className="text-[10px] text-amber-500 mb-1 font-bold tracking-widest">▶️ 이어서 만들기</span>
              <span className="text-xs font-bold text-amber-100 truncate w-full">{recentCraftTitle || "최근 작업 조항"}</span>
            </button>
          )}
          {recentEnhanceId && (
            <button 
              onClick={() => {
                const targetCard = safeCards.find((c:any) => c.id === recentEnhanceId);
                if (targetCard) setActiveCard(targetCard);
                else setActiveTab('enhance');
              }}
              className="bg-teal-900/20 border border-teal-500/30 p-4 rounded-sm flex flex-col items-start hover:bg-teal-900/40 transition-colors text-left"
            >
              <span className="text-[10px] text-teal-500 mb-1 font-bold tracking-widest">▶️ 이어서 채우기</span>
              <span className="text-xs font-bold text-teal-100 truncate w-full">{recentEnhanceTitle || "최근 학습 카드"}</span>
            </button>
          )}
        </div>
      )}
      
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
                <div className="bg-amber-500/60 h-full transition-all duration-700" style={{ width: `${Math.min(fp, 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
