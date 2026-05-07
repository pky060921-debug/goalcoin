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
  const [parsedText, setParsedText] = useState("");
  const [selectedWords, setSelectedWords] = useState<Set<number>>(new Set());
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
    setLastSelected(idx);
  };

  const handleWordLongPress = (idx: number, e: any) => {
    e.preventDefault(); 
    if (lastSelected !== null) {
        const s = new Set(selectedWords);
        const start = Math.min(lastSelected, idx);
        const end = Math.max(lastSelected, idx);
        for(let i = start; i <= end; i++) s.add(i);
        setSelectedWords(s);
        setLastSelected(idx);
    } else {
        handleWordClick(idx);
    }
  };

  const triggerAiRecommend = async (cat: any, bodyText: string) => {
    addLog(`▶️ [AI 추천] ${cat.title} 분석 시작...`);
    try {
        const res = await fetch("https://api.blankd.top/api/recommend-blank", {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ wallet_address: safeAddress, content: bodyText })
        });
        const data = await res.json();
        if(data.task_id) {
            const poll = setInterval(async () => {
                const sRes = await fetch(`https://api.blankd.top/api/task-status?task_id=${data.task_id}`);
                const sData = await sRes.json();
                if(sData.status === 'completed') {
                    clearInterval(poll);
                    addLog(`✅ AI 추천 키워드 발견: ${sData.result.keyword}`);
                    const words = bodyText.split(SPLIT_REGEX);
                    const newSet = new Set(selectedWords);
                    words.forEach((w:string, i:number) => {
                        if(w.includes(sData.result.keyword)) newSet.add(i);
                    });
                    setSelectedWords(newSet);
                } else if(sData.status === 'error') {
                    clearInterval(poll);
                    addLog(`❌ AI 추천 실패: ${sData.message}`);
                }
            }, 2000);
        }
    } catch(e:any) { addLog(`❌ AI 통신 오류`); }
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

          <div className={`grid grid-cols-1 ${getGridClass(colCount)} gap-3 sm:gap-4 auto-rows-fr`}>
            {safeCategories.filter((c:any) => c.folder_name === folder).sort((a:any, b:any) => a.id - b.id).map((cat: any) => {
                const isExpanded = expandedId === cat.id;
                const contentToUse = cat.content || cat.title || "";
                
                let colClass = "";
                // 💡 [추가] 색상 변수 설정
                let titleColor = "text-amber-400";
                
                // 💡 [기존 로직 유지 + 색상 부여]
                if (viewMode === 'all' && colCount >= 3) {
                  if (contentToUse.includes('[법]')) { colClass = "md:col-start-1"; titleColor = "text-red-500"; }
                  else if (contentToUse.includes('[령]')) { colClass = "md:col-start-2"; titleColor = "text-blue-400"; }
                  else if (contentToUse.includes('[칙]') || contentToUse.includes('[규]')) { colClass = "md:col-start-3"; titleColor = "text-green-500"; }
                } else {
                  if (contentToUse.includes('[법]')) titleColor = "text-red-500";
                  else if (contentToUse.includes('[령]')) titleColor = "text-blue-400";
                  else if (contentToUse.includes('[칙]') || contentToUse.includes('[규]')) titleColor = "text-green-500";
                }
                
                if (isExpanded) colClass = "col-span-full";

                const { body } = formatCardText(contentToUse);
                const cleanTitle = getStrictTitleOnly(contentToUse);

                return (
                  <div key={cat.id} className={`relative transition-all w-full ${colClass}`}>
                    {!isExpanded ? (
                      <button {...createLongPressHandlers(() => handleDeleteCategory(cat.id))} 
                        onClick={() => { setExpandedId(cat.id); setSelectedWords(new Set()); setParsedText(body); setMemoInput(cat.memo || ""); setLastSelected(null); }} 
                        className="w-full h-full min-h-[60px] p-3 sm:p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-sm transition-colors hover:bg-indigo-900/40 flex flex-col gap-1.5 sm:gap-2 text-left">
                        {/* 💡 [적용] 제목 색상 변경 */}
                        <span className={`${titleColor} font-bold text-[11px] sm:text-[13px] leading-snug break-keep`}>{cleanTitle}</span>
                        {cat.memo && <div className="text-[9px] sm:text-[11px] text-teal-300 bg-teal-900/20 p-1.5 sm:p-2 rounded border border-teal-500/20 w-full truncate">{cat.memo}</div>}
                      </button>
                    ) : (
                      <div className="w-full p-4 sm:p-6 bg-[#0a0a0c] border border-indigo-500/50 rounded-sm space-y-3 sm:space-y-4 shadow-xl z-20 relative animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-1 sm:mb-2">
                          <span className={`${titleColor} font-bold text-[12px] sm:text-[14px] cursor-pointer`} onClick={() => setExpandedId(null)}>{cleanTitle}</span>
                          {useAiRecommend && (
                            <button onClick={(e) => { e.stopPropagation(); triggerAiRecommend(cat, body); }} className="text-[9px] sm:text-[11px] bg-indigo-600/30 text-indigo-300 border border-indigo-500/50 px-2 py-1 rounded hover:bg-indigo-600/50 transition-colors whitespace-nowrap">✨ AI 추천</button>
                          )}
                        </div>
                        <input type="text" value={memoInput} onChange={(e) => setMemoInput(e.target.value)} placeholder="암기 메모 입력..." className="w-full bg-black/50 border border-teal-500/30 p-2.5 sm:p-3 text-xs sm:text-sm text-teal-200 outline-none rounded-sm mb-2 sm:mb-4 transition-colors focus:border-teal-400" />
                        <div className="font-serif text-[13px] sm:text-[15px] leading-loose text-white/80 p-4 sm:p-5 bg-black/40 border border-white/10 max-h-72 sm:max-h-96 overflow-y-auto rounded select-none touch-manipulation whitespace-pre-wrap break-keep custom-scrollbar">
                          {parsedText.split(SPLIT_REGEX).map((word: string, idx: number) => {
                            if (!word) return null;
                            const isSelected = selectedWords.has(idx);
                            return (
                              <span key={idx} onClick={() => handleWordClick(idx)} onContextMenu={(e) => handleWordLongPress(idx, e)} className={`cursor-pointer px-[2px] rounded transition-colors ${isSelected ? 'bg-amber-500 text-black font-bold shadow-sm' : 'hover:bg-white/20'}`}>{word}</span>
                            )
                          })}
                        </div>
                        <button onClick={() => handleMakeBlankCard({ ...cat, title: cleanTitle, memo: memoInput }, parsedText, selectedWords, () => setExpandedId(null))} className="w-full py-2.5 sm:py-3 bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs sm:text-sm font-bold rounded-sm mt-2 transition-all hover:bg-amber-500/30 shadow-sm">지식 추출 저장</button>
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
