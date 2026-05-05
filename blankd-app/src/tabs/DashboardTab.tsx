import React from 'react';

export const DashboardTab = ({ categories = [], savedCards = [] }: any) => {
  const safeCategories = Array.isArray(categories) ? categories : [];
  const safeCards = Array.isArray(savedCards) ? savedCards : [];

  // 💡 기본 폴더를 완벽하게 없앴습니다.
  const allFolders = Array.from(new Set([
    ...safeCategories.map((c:any) => c.folder_name),
    ...safeCards.map((c:any) => c.folder_name)
  ])).filter(f => f && f !== '기본 폴더').sort();

  if (allFolders.length === 0) {
    return <div className="text-center text-white/30 py-32 text-sm tracking-widest">진행 중인 데이터가 없습니다. 법령을 업로드해주세요.</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="border border-white/10 rounded-sm overflow-hidden">
        <div className="bg-white/5 px-6 py-4 border-b border-white/10 text-xs text-white/50 tracking-widest">장별 세부 진행 현황</div>
        <div className="divide-y divide-white/5">
          {allFolders.map((folder: any) => {
            const catCount = safeCategories.filter((c:any) => c.folder_name === folder).length;
            const cardCount = safeCards.filter((c:any) => c.folder_name === folder).length;
            const enhancedCount = safeCards.filter((c:any) => c.folder_name === folder && c.level >= 1).length;
            const totalCount = catCount + cardCount;

            return (
              <div key={folder} className="p-6 flex flex-col sm:flex-row gap-6 items-center hover:bg-white/[0.02] transition-colors">
                <div className="text-sm font-bold text-white/80 w-48">📁 {folder}</div>
                <div className="flex-1 w-full grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-[10px] text-white/40 mb-1">전체 조항</div>
                    <div className="text-lg font-light text-white">{totalCount}개</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-indigo-400 mb-1">제작된 카드</div>
                    <div className="text-lg font-light text-indigo-200">{cardCount}개</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-amber-400 mb-1">강화됨 (LV.1 이상)</div>
                    <div className="text-lg font-light text-amber-200">{enhancedCount}개</div>
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
