import React, { useEffect, useState } from 'react';
import { parseCardStats, formatCardText, getStrictTitleOnly } from '../utils/constants'; 

export const DashboardTab = ({ categories, savedCards }: any) => {
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
  
  const [recentCraft, setRecentCraft] = useState("");
  const [recentEnhance, setRecentEnhance] = useState("");
  
  useEffect(() => {
    setRecentCraft(localStorage.getItem('blankd_last_crafted') || "아직 생성된 카드가 없습니다");
    setRecentEnhance(localStorage.getItem('blankd_last_enhanced') || "학습 기록이 없습니다");
  }, [safeCards]);

  const sortedFolders = Object.keys(folderStats).sort();

  return (
    <div className="space-y-6 animate-in fade-in max-w-full pb-10">
      
      {/* 상단 통계 영역 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         <div className="bg-indigo-900/20 border border-indigo-500/30 p-4 rounded-sm flex flex-col justify-center">
            <div className="text-indigo-400 font-bold text-sm mb-2">지식 추출(만들기) 진척도</div>
            <div className="flex items-end gap-2 mb-2">
               <span className="text-3xl font-bold text-white">{safeCards.length}</span>
               <span className="text-white/50 mb-1">/ {safeCategories.length} 조항</span>
            </div>
            <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden">
               <div className="bg-indigo-500 h-full transition-all duration-1000" style={{width: `${craftProgress}%`}}></div>
            </div>
         </div>

         <div className="bg-teal-900/20 border border-teal-500/30 p-4 rounded-sm flex flex-col justify-center">
            <div className="text-teal-400 font-bold text-sm mb-2">총 누적 반복 횟수 (채우기)</div>
            <div className="flex items-end gap-2 mb-2">
               <span className="text-3xl font-bold text-white">{totalFilled}</span>
               <span className="text-white/50 mb-1">회</span>
            </div>
            <div className="text-xs text-white/40">생성된 빈칸 수: {totalBlanks}개</div>
         </div>
      </div>

      {/* 💡 체크포인트(최근 활동) 영역 추가 */}
      <div className="bg-black/40 border border-white/10 p-4 rounded-sm">
         <div className="text-amber-400 font-bold text-sm mb-3">최근 활동 기록 (체크포인트)</div>
         <div className="flex flex-col gap-2">
            <div className="bg-white/5 p-3 rounded-sm border border-white/5 flex justify-between items-center">
               <span className="text-xs text-white/50">마지막으로 만든 카드</span>
               <span className="text-sm font-bold text-indigo-300 truncate max-w-[60%]">{recentCraft}</span>
            </div>
            <div className="bg-white/5 p-3 rounded-sm border border-white/5 flex justify-between items-center">
               <span className="text-xs text-white/50">마지막으로 학습한 카드</span>
               <span className="text-sm font-bold text-teal-300 truncate max-w-[60%]">{recentEnhance}</span>
            </div>
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
