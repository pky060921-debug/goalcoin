import React from 'react';
import { parseCardStats, formatCardText } from '../utils/constants';

export const DashboardTab = ({ categories, savedCards }: any) => {
  let totalBlanks = 0;
  let totalFilled = 0;
  let totalWrong = 0;

  const safeCards = Array.isArray(savedCards) ? savedCards : [];
  
  safeCards.forEach((card: any) => {
    const { body } = formatCardText(card.content);
    const blanks = body.match(/\[\s*(.*?)\s*\]/g) || [];
    totalBlanks += blanks.length;

    const stats = parseCardStats(card.memo);
    totalFilled += stats.filled;
    totalWrong += stats.wrongIndices.length;
  });

  const progressPercent = totalBlanks > 0 ? Math.round((totalFilled / totalBlanks) * 100) : 0;

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0a0a0c] border border-indigo-500/30 p-6 rounded-sm shadow-lg flex flex-col gap-2">
          <span className="text-teal-500/50 font-bold text-xs uppercase tracking-widest">전체 생성 빈칸</span>
          <span className="text-3xl font-light text-white">{totalBlanks} <span className="text-sm text-white/40">개</span></span>
        </div>
        <div className="bg-[#0a0a0c] border border-indigo-500/30 p-6 rounded-sm shadow-lg flex flex-col gap-2">
          <span className="text-teal-500/50 font-bold text-xs uppercase tracking-widest">누적 정답 (채운 빈칸)</span>
          <span className="text-3xl font-light text-teal-400">{totalFilled} <span className="text-sm text-white/40">개</span></span>
        </div>
        <div className="bg-[#0a0a0c] border border-indigo-500/30 p-6 rounded-sm shadow-lg flex flex-col gap-2">
          <span className="text-red-500/50 font-bold text-xs uppercase tracking-widest">현재 오답 누적</span>
          <span className="text-3xl font-light text-red-400">{totalWrong} <span className="text-sm text-white/40">개</span></span>
        </div>
      </div>

      <div className="bg-[#0a0a0c] border border-white/10 p-8 rounded-sm shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
          <svg className="w-32 h-32 text-indigo-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zm0 7.5l-10-5v10l10 5 10-5v-10l-10 5z"/></svg>
        </div>
        <h3 className="text-lg font-serif text-white mb-4 relative z-10">지식 동기화율 (Progress)</h3>
        <div className="w-full bg-white/5 h-4 rounded-full overflow-hidden mb-2 relative z-10">
          <div className="bg-indigo-500 h-full transition-all duration-1000 ease-out" style={{ width: `${progressPercent}%` }}></div>
        </div>
        <p className="text-right text-sm text-indigo-400 font-bold relative z-10">{progressPercent}% 완료</p>
      </div>
    </div>
  );
};
