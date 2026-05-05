import React from 'react';

export const DashboardTab = ({ categories = [], savedCards = [] }: any) => {
  const safeCategories = Array.isArray(categories) ? categories : [];
  const safeCards = Array.isArray(savedCards) ? savedCards : [];

  const allFolders = Array.from(new Set([
    ...safeCategories.map((c:any) => c.folder_name),
    ...safeCards.map((c:any) => c.folder_name)
  ])).filter(f => f && f !== '기본 폴더').sort();

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="p-6 bg-white/5 border border-white/10 rounded-sm">
          <div className="text-xs text-white/40 mb-2">총 발견된 조항</div>
          <div className="text-3xl font-light text-white">{safeCategories.length}</div>
        </div>
        <div className="p-6 bg-indigo-900/20 border border-indigo-500/30 rounded-sm">
          <div className="text-xs text-indigo-400 mb-2">제작된 빈칸 카드</div>
          <div className="text-3xl font-light text-indigo-100">{safeCards.length}</div>
        </div>
        <div className="p-6 bg-amber-900/20 border border-amber-500/30 rounded-sm">
          <div className="text-xs text-amber-400 mb-2">강화 진행 중 (LV.1 이상)</div>
          <div className="text-3xl font-light text-amber-100">{safeCards.filter(c => c.level >= 1).length}</div>
        </div>
      </div>

      <div className="border border-white/10 rounded-sm overflow-hidden">
        <div className="bg-white/5 px-6 py-4 border-b border-white/10 text-xs text-white/50 tracking-widest">장별 세부 진행 현황</div>
        <div className="divide-y divide-white/5">
          {allFolders.map((folder: any) => {
            const catCount = safeCategories.filter((c:any) => c.folder_name === folder).length;
            const cardCount = safeCards.filter((c:any) => c.folder_name === folder).length;
            const enhancedCount = safeCards.filter((c:any) => c.folder_name === folder && c.level >= 1).length;

            return (
              <div key={folder} className="p-6 flex flex-col sm:flex-row gap-6 items-center">
                <div className="text-sm font-bold text-white/80 w-48">📁 {folder}</div>
                <div className="flex-1 w-full grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-[10px] text-white/40 mb-1">전체 조항</div>
                    <div className="text-sm text-white">{catCount}개</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-indigo-400 mb-1">제작됨</div>
                    <div className="text-sm text-indigo-200">{cardCount}개</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-amber-400 mb-1">강화됨</div>
                    <div className="text-sm text-amber-200">{enhancedCount}개</div>
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
