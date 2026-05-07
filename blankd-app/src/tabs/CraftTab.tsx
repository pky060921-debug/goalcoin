import React, { useState, useEffect } from 'react';
import { formatCardText, getStrictTitleOnly, SPLIT_REGEX } from '../utils/constants';

const getGridClass = (cols: number) => {
  if(cols === 1) return "md:grid-cols-1";
  if(cols === 2) return "md:grid-cols-2";
  if(cols === 3) return "md:grid-cols-3";
  if(cols === 4) return "md:grid-cols-4";
  if(cols === 5) return "md:grid-cols-5";
  return "md:grid-cols-3";
};

export const CraftTab = ({ categories, colCount, viewMode, useAiRecommend, safeAddress, lawFile, setLawFile, uploadLaw, handleMakeBlankCard, addLog, handleDeleteCategory }: any) => {
  const safeCategories = Array.isArray(categories) ? categories : [];
  const craftFolders = Array.from(new Set(safeCategories.map((c:any) => c.folder_name))).filter(f => f && f !== '기본 폴더').sort() as string[];
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  
  // 💡 [추가] 편집 기능을 위한 상태 (배열 관리)
  const [wordArray, setWordArray] = useState<string[]>([]);
  const [selectedWords, setSelectedWords] = useState<Set<number>>(new Set());
  const [pageBreaks, setPageBreaks] = useState<Set<number>>(new Set());
  const [memoInput, setMemoInput] = useState(""); 
  const [lastSelected, setLastSelected] = useState<number | null>(null);

  useEffect(() => {
    const initial: Record<string, boolean> = {};
    craftFolders.forEach(f => initial[f] = true);
    setOpenFolders(initial);
  }, [categories]);

  const createLongPressHandlers = (callback: () => void, ms = 800) => {
    let timer: any;
    const start = () => { timer = setTimeout(callback, ms); };
    const clear = () => { clearTimeout(timer); };
    return { onTouchStart: start, onTouchEnd: clear, onMouseDown: start, onMouseUp: clear, onMouseLeave: clear, onContextMenu: (e:any) => { e.preventDefault(); callback(); } };
  };

  const handleWordClick = (idx: number) => {
    const s = new Set(selectedWords);
    if(s.has(idx)) s.delete(idx); else s.add(idx);
    setSelectedWords(s);
  };

  // 💡 [신규] 우클릭(롱프레스) 시 페이지 분할
  const handleWordSplit = (idx: number, e: any) => {
    e.preventDefault(); 
    const p = new Set(pageBreaks);
    if (p.has(idx)) p.delete(idx);
    else if (window.confirm("이 위치에서 페이지를 나누시겠습니까?")) p.add(idx);
    setPageBreaks(p);
  };

  // 💡 [신규] 더블클릭 시 단어 병합
  const handleWordMerge = (idx: number) => {
    if (idx >= wordArray.length - 1) return;
    const newArray = [...wordArray];
    newArray[idx] = newArray[idx] + newArray[idx + 1];
    newArray.splice(idx + 1, 1);
    setWordArray(newArray);
    const newSet = new Set<number>();
    selectedWords.forEach(i => { if (i < idx) newSet.add(i); else if (i > idx) newSet.add(i - 1); });
    setSelectedWords(newSet);
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in w-full">
      <div className="flex gap-2 mb-2 sm:mb-4">
        <label className="flex-1 border border-white/20 p-2 sm:p-2.5 text-center text-[10px] sm:text-xs hover:bg-white/10 cursor-pointer text-white/80 rounded-sm transition-colors">
          <input type="file" accept=".pdf,.html" onChange={e => setLawFile(e.target.files?.[0] || null)} className="hidden"/> {lawFile ? `✅ ${lawFile.name}` : '+ 학습자료 업로드'}
        </label>
        <button onClick={uploadLaw} className="px-3 sm:px-4 border border-white/20 text-[10px] sm:text-xs hover:bg-white/10 transition-colors rounded-sm">전송</button>
      </div>

      <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4 sm:mb-6">
        {craftFolders.map((f: string) => <button key={f} onClick={() => setOpenFolders(p => ({...p, [f]: !p[f]}))} className={`px-2.5 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-[12px] font-bold border rounded-sm transition-all ${openFolders[f] ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm' : 'bg-indigo-900/40 text-indigo-300 border-indigo-500/30'}`}>📁 {f}</button>)}
      </div>
      
      {craftFolders.map((folder: string) => openFolders[folder] && (
        <div key={folder} className="mb-6 sm:mb-8 border-l border-white/5 pl-3 sm:pl-4">
          <div className="text-xs sm:text-sm text-white/50 mb-2 sm:mb-3 border-b border-white/10 pb-1.5 sm:pb-2 font-bold">{folder}</div>

          {/* 💡 [해결] auto-rows-fr을 제거하고 items-start를 추가하여 칸이 위아래로 커지는 현상을 해결했습니다. */}
          <div className={`grid grid-cols-1 ${getGridClass(colCount)} gap-3 sm:gap-4 items-start`}>
            {safeCategories.filter((c:any) => c.folder_name === folder).sort((a:any, b:any) => a.id - b.id).map((cat: any) => {
                const isExpanded = expandedId === cat.id;
                const contentToUse = cat.content || cat.title || "";
                const checkText = `${cat.title || ''} ${cat.content || ''}`;
                
                // 💡 아키님의 원본 colClass 배치 로직
                let colClass = "";
                let titleColor = "text-amber-400";
                
                if (viewMode === 'all' && colCount >= 3) {
                  if (checkText.includes('[법]')) { colClass = "md:col-start-1"; titleColor = "text-red-500"; }
                  else if (checkText.includes('[령]')) { colClass = "md:col-start-2"; titleColor = "text-blue-400"; }
                  else if (checkText.includes('[칙]') || checkText.includes('[규]')) { colClass = "md:col-start-3"; titleColor = "text-green-500"; }
                } else {
                  if (checkText.includes('[법]')) titleColor = "text-red-500";
                  else if (checkText.includes('[령]')) titleColor = "text-blue-400";
                  else if (checkText.includes('[칙]') || checkText.includes('[규]')) titleColor = "text-green-500";
                }
                
                if (isExpanded) colClass = "col-span-full";
                const cleanTitle = getStrictTitleOnly(contentToUse);

                return (
                  <div key={cat.id} className={`relative transition-all w-full ${colClass}`}>
                    {!isExpanded ? (
                      <button {...createLongPressHandlers(() => handleDeleteCategory(cat.id))} 
                        onClick={() => { 
                          setExpandedId(cat.id); setSelectedWords(new Set()); setPageBreaks(new Set()); setMemoInput(cat.memo || "");
                          const { body } = formatCardText(contentToUse);
                          setWordArray(body.split(SPLIT_REGEX).filter(w => w !== ""));
                        }} 
                        className="w-full min-h-[60px] p-3 sm:p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-sm transition-colors hover:bg-indigo-900/40 flex flex-col gap-1.5 sm:gap-2 text-left">
                        <span className={`${titleColor} font-bold text-[11px] sm:text-[13px] leading-snug break-keep`}>{cleanTitle}</span>
                        {cat.memo && <div className="text-[9px] sm:text-[11px] text-teal-300 bg-teal-900/20 p-1.5 sm:p-2 rounded border border-teal-500/20 w-full truncate">{cat.memo}</div>}
                      </button>
                    ) : (
                      <div className="w-full p-4 sm:p-6 bg-[#0a0a0c] border border-indigo-500/50 rounded-sm space-y-3 shadow-xl z-20 relative animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-1">
                          <span className={`${titleColor} font-bold text-[12px] sm:text-[14px] cursor-pointer`} onClick={() => setExpandedId(null)}>{cleanTitle}</span>
                        </div>
                        <input type="text" value={memoInput} onChange={(e) => setMemoInput(e.target.value)} placeholder="암기 메모 입력..." className="w-full bg-black/50 border border-teal-500/30 p-2 text-xs text-teal-200 outline-none rounded-sm" />
                        <div className="font-serif text-[13px] sm:text-[15px] leading-loose text-white/80 p-4 bg-black/40 border border-white/10 max-h-72 overflow-y-auto rounded select-none touch-manipulation whitespace-pre-wrap break-keep custom-scrollbar relative">
                          {wordArray.map((word, idx) => (
                            <React.Fragment key={idx}>
                              {pageBreaks.has(idx) && <div className="w-full border-t border-red-500/50 my-2 relative"><span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-black px-1 text-[8px] text-red-400 font-bold uppercase tracking-tighter">Page Break</span></div>}
                              <span onClick={() => handleWordClick(idx)} onContextMenu={(e) => handleWordSplit(idx, e)} onDoubleClick={() => handleWordMerge(idx)} className={`cursor-pointer px-[1px] rounded transition-colors ${selectedWords.has(idx) ? 'bg-amber-500 text-black font-bold' : 'hover:bg-white/20'}`}>{word}</span>
                            </React.Fragment>
                          ))}
                        </div>
                        <button onClick={() => handleMakeBlankCard({ ...cat, title: cleanTitle, memo: memoInput }, wordArray, selectedWords, pageBreaks, () => setExpandedId(null))} className="w-full py-2.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold rounded-sm hover:bg-amber-500/30">지식 추출 저장</button>
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
