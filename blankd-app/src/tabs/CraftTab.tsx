import React, { useState, useEffect } from 'react';
import { getStrictCardTitle, getSortNumber, getColSpanAndStartClass, SPLIT_REGEX } from '../utils/constants';

export const CraftTab = ({ categories, colCount, viewMode, handleMakeBlankCard, handleAiRecommend, useAiRecommend, panelState }: any) => {
  const craftFolders = Array.from(new Set(categories.map((c:any)=>c.folder_name||'기본 폴더'))).sort() as string[];
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [parsedText, setParsedText] = useState("");
  const [selectedWords, setSelectedWords] = useState<Set<number>>(new Set());

  useEffect(() => {
    const initial: Record<string, boolean> = {};
    craftFolders.forEach(f => initial[f] = true);
    setOpenFolders(initial);
  }, [categories]);

  const toggleWord = (idx: number) => {
    const newSet = new Set(selectedWords);
    if (newSet.has(idx)) newSet.delete(idx); else newSet.add(idx);
    setSelectedWords(newSet);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
      <div className="lg:col-span-8 space-y-8">
        <div className="flex flex-wrap gap-2 mb-6">
          {craftFolders.map((f: string) => (
            <button key={f} onClick={() => setOpenFolders(p => ({...p, [f]: !p[f]}))} className={`px-4 py-2 text-[12px] font-bold border rounded-sm transition-all ${openFolders[f] ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-indigo-900/40 text-indigo-300 border-indigo-500/30'}`}>📁 {f}</button>
          ))}
        </div>
        {craftFolders.map((folder: string) => openFolders[folder] && (
          <div key={folder} className="mb-8">
            <div className="text-sm text-white/50 mb-3 border-b border-white/10 pb-2">{folder}</div>
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
              {categories.filter((c:any) => (c.folder_name || '기본 폴더') === folder).sort((a:any, b:any) => getSortNumber(a.title) - getSortNumber(b.title)).map((cat: any) => {
                const isExpanded = expandedId === cat.id;
                return (
                  <div key={cat.id} className={`${getColSpanAndStartClass(cat.title, viewMode, isExpanded, colCount)} relative`}>
                    {!isExpanded ? (
                      <button onClick={() => { setExpandedId(cat.id); setSelectedWords(new Set()); setParsedText(cat.content); }} className="w-full h-full p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-sm text-indigo-300 font-bold text-[13px]">{getStrictCardTitle(cat.title)}</button>
                    ) : (
                      <div className="w-full p-6 bg-[#0a0a0c] border border-indigo-500/50 rounded-sm space-y-4">
                        <div className="flex justify-between">
                          {useAiRecommend && <button onClick={() => handleAiRecommend(cat)} className="text-[10px] bg-teal-900/40 text-teal-400 px-2 py-1 rounded">✨ AI 추천</button>}
                          <button onClick={() => setExpandedId(null)} className="text-white/40 text-xs">닫기</button>
                        </div>
                        <div className="font-serif text-[15px] leading-loose text-white/80 p-4 bg-black/40 border border-white/10 max-h-64 overflow-y-auto">
                          {parsedText.split(SPLIT_REGEX).map((word: string, idx: number) => (
                            <span key={idx} onClick={() => toggleWord(idx)} className={`cursor-pointer px-[2px] rounded ${selectedWords.has(idx) ? 'bg-amber-500 text-black' : 'hover:bg-white/20'}`}>{word}</span>
                          ))}
                        </div>
                        <button onClick={() => handleMakeBlankCard(cat, parsedText, selectedWords)} className="w-full py-3 bg-amber-500/20 text-amber-400 text-sm font-bold">지식 추출 저장</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="lg:col-span-4 sticky top-12 h-fit border border-indigo-900/30 bg-indigo-950/5 p-4 rounded-sm">
        <div className="text-[10px] text-indigo-400 font-bold mb-4 uppercase">System Terminal - {panelState?.progress || 0}%</div>
        <div className="text-[11px] text-white/70 whitespace-pre-wrap">{panelState?.message || "대기 중..."}</div>
      </div>
    </div>
  );
};
