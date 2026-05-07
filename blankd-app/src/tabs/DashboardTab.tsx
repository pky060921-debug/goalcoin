import React from 'react';
import { parseCardStats, formatCardText } from '../utils/constants';

export const DashboardTab = ({ categories, savedCards }: any) => {
  let totalBlanks = 0;
  let totalFilled = 0;
  let totalWrong = 0;

  const safeCards = Array.isArray(savedCards) ? savedCards : [];
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

  const progressPercent = totalBlanks > 0 ? Math.round((totalFilled / totalBlanks) * 100) : 0;
  const sortedFolders = Object.keys(folderStats).sort();

  return (
    <div className="space-y-4 animate-in fade-in max-w-full overflow-hidden w-full">
      <div className="flex flex-wrap gap-2 sm:gap-3 items-end">
        <div className="bg-[#0a0a0c] border border-white/5 px-3 sm:px-4 py-2 sm:py-3 rounded-sm flex flex-col gap-0.5 sm:gap-1 flex-1 min-w-[100px] sm:min-w-[120px]">
          <span className="text-[9px] sm:text-[10px] text-white/30 font-bold uppercase tracking-widest whitespace-nowrap">전체 빈칸</span>
          <span className="text-lg sm:text-xl font-light text-white">{totalBlanks} <span className="text-[9px] sm:text-[10px] text-white/20">EA</span></span>
        </div>
        <div className="bg-[#0a0a0c] border border-white/5 px-3 sm:px-4 py-2 sm:py-3 rounded-sm flex flex-col gap-0.5 sm:gap-1 flex-1 min-w-[100px] sm:min-w-[120px]">
          <span className="text-[9px] sm:text-[10px] text-teal-500/40 font-bold uppercase tracking-widest whitespace-nowrap">누적 정답</span>
          <span className="text-lg sm:text-xl font-light text-teal-400">{totalFilled} <span className="text-[9px] sm:text-[10px] text-white/20">EA</span></span>
        </div>
        <div className="bg-[#0a0a0c] border border-white/5 px-3 sm:px-4 py-2 sm:py-3 rounded-sm flex flex-col gap-0.5 sm:gap-1 flex-1 min-w-[100px] sm:min-w-[120px]">
          <span className="text-[9px] sm:text-[10px] text-red-500/40 font-bold uppercase tracking-widest whitespace-nowrap">누적 오답</span>
          <span className="text-lg sm:text-xl font-light text-red-400">{totalWrong} <span className="text-[9px] sm:text-[10px] text-white/20">EA</span></span>
        </div>
        
        <div className="w-full sm:flex-1 sm:min-w-[200px] bg-[#0a0a0c] border border-indigo-500/20 px-3 sm:px-4 py-2 sm:py-3 rounded-sm mt-2 sm:mt-0">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[9px] sm:text-[10px] text-indigo-400/50 font-bold tracking-widest uppercase">지식 동기화율</span>
            <span className="text-[11px] sm:text-xs font-bold text-indigo-300">{progressPercent}%</span>
          </div>
          <div className="w-full bg-black/50 h-1 rounded-full overflow-hidden">
            <div className="bg-indigo-500 h-full transition-all duration-1000" style={{ width: `${progressPercent}%` }}></div>
          </div>
        </div>
      </div>

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
                <div className="bg-amber-500/60 h-full transition-all duration-700" style={{ width: `${fp}%` }}></div>
              </div>
              <div className="flex justify-between text-[8px] sm:text-[9px] font-mono text-white/30 tracking-tighter">
                <span>V:{fs.total}</span>
                <span className="text-teal-500/60">O:{fs.filled}</span>
                {fs.wrong > 0 && <span className="text-red-500/60 animate-pulse">X:{fs.wrong}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
