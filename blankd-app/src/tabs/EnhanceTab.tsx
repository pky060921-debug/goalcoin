import React from 'react';
import { getStrictCardTitle, getSortNumber, getColSpanAndStartClass } from '../utils/constants';

export const EnhanceTab = ({ savedCards, enhanceFolders, openEnhanceFolders, setOpenEnhanceFolders, colCount, viewMode, setActiveCard, handleDeleteCard, createLongPressHandlers }: any) => {
  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex flex-wrap gap-2 mb-6">
        {enhanceFolders.map((f: string) => (
          <button key={f} onClick={() => setOpenEnhanceFolders((p:any) => ({...p, [f]: !p[f]}))} className={`px-4 py-2 text-[12px] font-bold border rounded-sm transition-all ${openEnhanceFolders[f] ? 'bg-amber-600 border-amber-500' : 'bg-amber-900/30 text-amber-300 border-amber-500/30'}`}>📁 {f}</button>
        ))}
      </div>
      {enhanceFolders.map((folder: string) => openEnhanceFolders[folder] && (
        <div key={folder} className="mb-8">
          <div className="text-sm text-white/50 mb-3 border-b border-white/10 pb-2">{folder}</div>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
            {savedCards.filter((c:any) => (c.folder_name || '기본 폴더') === folder).sort((a:any, b:any) => getSortNumber(a.content) - getSortNumber(b.content)).map((card: any) => {
              const gridSpanClass = getColSpanAndStartClass(card.content, viewMode, false, colCount);
              return (
                <div key={card.id} className={`${gridSpanClass}`}>
                  <button 
                    {...createLongPressHandlers(() => handleDeleteCard(card.id))}
                    onClick={() => setActiveCard(card)}
                    className={`w-full p-5 text-center rounded-sm border transition-all ${card.status === "BURNED" ? "border-white/5 text-white/30" : "border-indigo-500/30 text-indigo-300 bg-indigo-900/20 hover:bg-indigo-900/40"}`}
                  >
                    <span className="text-[9px] text-amber-400 block mb-1">LV.{card.level}</span>
                    <div className="font-serif text-[13px] font-bold">{getStrictCardTitle(card.content)}</div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
