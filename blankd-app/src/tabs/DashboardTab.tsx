import React from 'react';

export const DashboardTab = ({ categories, savedCards }: any) => {
  const allFolders = Array.from(new Set([...categories.map((c:any)=>c.folder_name||'기본 폴더'), ...savedCards.map((c:any)=>c.folder_name||'기본 폴더')])).sort();

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="border border-white/10 rounded-sm overflow-hidden">
        <div className="bg-white/5 px-6 py-4 border-b border-white/10 text-xs text-white/50 tracking-widest">장별 학습 진행률 현황</div>
        <div className="divide-y divide-white/5">
          {allFolders.map(folder => {
            const folderCats = categories.filter((c:any) => (c.folder_name||'기본 폴더') === folder);
            const folderCards = savedCards.filter((c:any) => (c.folder_name||'기본 폴더') === folder);
            const total = folderCats.length + folderCards.length;
            const progress = total === 0 ? 0 : (folderCards.length / total) * 100;
            const memorized = folderCards.filter((c:any) => c.level >= 1).length;
            const memoProgress = folderCards.length === 0 ? 0 : (memorized / folderCards.length) * 100;

            return (
              <div key={folder} className="p-6 flex flex-col sm:flex-row gap-6 items-center">
                <div className="text-sm font-bold text-white/80 w-32">📁 {folder}</div>
                <div className="flex-1 w-full space-y-4">
                  <div>
                    <div className="flex justify-between text-[10px] text-indigo-400 mb-1"><span>지식 추출 진행률</span><span>{folderCards.length} / {total} 완료</span></div>
                    <div className="h-1.5 w-full bg-black border border-indigo-900/30 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500" style={{ width: `${progress}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-amber-400 mb-1"><span>기억 강화 성공률</span><span>{memorized} / {folderCards.length || 1} 방어됨</span></div>
                    <div className="h-1.5 w-full bg-black border border-amber-900/30 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500" style={{ width: `${memoProgress}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
