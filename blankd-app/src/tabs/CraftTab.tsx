import React, { useState, useEffect } from 'react';
import { formatCardText, getGridStyle, getStrictTitleOnly, SPLIT_REGEX } from '../utils/constants';

export const CraftTab = ({ categories, studyMode, useAiRecommend, lawFile, setLawFile, uploadLaw, handleMakeBlankCard, handleAiRecommend, handleDeleteCategory }: any) => {
  const safeCategories = Array.isArray(categories) ? categories : [];
  const craftFolders = Array.from(new Set(safeCategories.map((c:any) => c.folder_name))).filter(f => f && f !== '기본 폴더').sort() as string[];
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [parsedText, setParsedText] = useState("");
  const [selectedWords, setSelectedWords] = useState<Set<number>>(new Set());
  const [memoInput, setMemoInput] = useState(""); 

  useEffect(() => {
    const initial: Record<string, boolean> = {};
    craftFolders.forEach(f => initial[f] = true);
    setOpenFolders(initial);
  }, [categories]);

  const createLongPressHandlers = (callback: () => void) => {
    let timer: any;
    return { onTouchStart: () => timer = setTimeout(callback, 800), onTouchEnd: () => clearTimeout(timer), onMouseDown: () => timer = setTimeout(callback, 800), onMouseUp: () => clearTimeout(timer) };
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex gap-2 mb-4">
        <label className="flex-1 border border-white/20 p-2 text-center text-xs hover:bg-white/10 cursor-pointer text-white/80">
          <input type="file" accept=".pdf,.html" onChange={e => setLawFile(e.target.files?.[0] || null)} className="hidden"/> {lawFile ? `✅ ${lawFile.name}` : '+ 학습자료 업로드'}
        </label>
        <button onClick={uploadLaw} className="px-4 border border-white/20 text-xs hover:bg-white/10 transition-colors">전송</button>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {craftFolders.map((f: string) => <button key={f} onClick={() => setOpenFolders(p => ({...p, [f]: !p[f]}))} className={`px-4 py-2 text-[12px] font-bold border rounded-sm transition-all ${openFolders[f] ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-indigo-900/40 text-indigo-300 border-indigo-500/30'}`}>📁 {f}</button>)}
      </div>
      
      {craftFolders.map((folder: string) => openFolders[folder] && (
        <div key={folder} className="mb-8">
          <div className="text-sm text-white/50 mb-3 border-b border-white/10 pb-2">{folder}</div>
          {studyMode === '법령' && (
            <div className="grid gap-4 mb-4 text-center font-bold text-white/40 text-[11px] uppercase tracking-widest" style={{ gridTemplateColumns: `repeat(3, minmax(0, 1fr))` }}>
               <div>법</div><div>시행령</div><div>시행규칙</div>
            </div>
          )}

          <div className={`grid gap-4 ${studyMode === '일반' ? 'grid-cols-1 md:grid-cols-2' : ''}`} style={studyMode === '법령' ? { gridTemplateColumns: `repeat(3, minmax(0, 1fr))` } : {}}>
            {safeCategories.filter((c:any) => c.folder_name === folder).sort((a:any, b:any) => a.id - b.id).map((cat: any) => {
                const isExpanded = expandedId === cat.id;
                const gridStyle = getGridStyle(cat.title, studyMode, isExpanded);
                const { body } = formatCardText(cat.content || cat.title);
                const cleanTitle = getStrictTitleOnly(cat.title);

                return (
                  <div key={cat.id} className="relative transition-all" style={gridStyle}>
                    {!isExpanded ? (
                      <button {...createLongPressHandlers(() => handleDeleteCategory(cat.id))} onClick={() => { setExpandedId(cat.id); setSelectedWords(new Set()); setParsedText(body); setMemoInput(cat.memo || ""); }} className="w-full h-full p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-sm text-left transition-colors hover:bg-indigo-900/40 flex flex-col gap-2">
                        <span className="text-amber-400 font-bold text-[13px] truncate w-full">{cleanTitle}</span>
                        {cat.memo && <div className="text-[11px] text-teal-300 bg-teal-900/20 p-2 rounded border border-teal-500/20 w-full truncate">{cat.memo}</div>}
                      </button>
                    ) : (
                      <div className="w-full p-6 bg-[#0a0a0c] border border-indigo-500/50 rounded-sm space-y-4 shadow-xl z-20 relative">
                        <div className="flex justify-between items-center mb-2 cursor-pointer" onClick={() => setExpandedId(null)}>
                          <span className="text-amber-400 font-bold text-[13px]">{cleanTitle}</span>
                        </div>
                        <input type="text" value={memoInput} onChange={(e) => setMemoInput(e.target.value)} placeholder="암기 메모 입력..." className="w-full bg-black/50 border border-teal-500/30 p-3 text-sm text-teal-200 outline-none rounded-sm mb-4" />
                        <div className="font-serif text-[15px] leading-loose text-white/80 p-5 bg-black/40 border border-white/10 max-h-64 overflow-y-auto rounded select-none touch-manipulation whitespace-pre-wrap">
                          {parsedText.split(SPLIT_REGEX).map((word: string, idx: number, arr: any[]) => {
                            if (!word) return null;
                            const isSelected = selectedWords.has(idx);
                            return (
                              <span key={idx} onClick={() => { const s = new Set(selectedWords); if(s.has(idx)) s.delete(idx); else s.add(idx); setSelectedWords(s); }} onDoubleClick={(e) => { e.preventDefault(); const s = new Set(selectedWords); s.add(idx); if (idx + 1 < arr.length) s.add(idx + 1); if (idx + 2 < arr.length) s.add(idx + 2); setSelectedWords(s); }} className={`cursor-pointer px-[2px] rounded transition-colors ${isSelected ? 'bg-amber-500 text-black font-bold' : 'hover:bg-white/20'}`}>{word}</span>
                            )
                          })}
                        </div>
                        <button onClick={() => handleMakeBlankCard({ ...cat, title: cat.title, memo: memoInput }, parsedText, selectedWords, () => setExpandedId(null))} className="w-full py-3 bg-amber-500/20 text-amber-400 border border-amber-500/30 text-sm font-bold rounded-sm mt-2">지식 추출 저장</button>
                      </div>
                    )}
                  </div>
                );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
