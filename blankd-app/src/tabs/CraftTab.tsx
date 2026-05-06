import React, { useState, useEffect } from 'react';
import { formatCardText, getGridStyle, SPLIT_REGEX } from '../utils/constants';

export const CraftTab = ({ categories, colCount, viewMode, useAiRecommend, lawFile, setLawFile, uploadLaw, selectedCraftIds, setSelectedCraftIds, targetFolderName, setTargetFolderName, handleMoveCraftFolders, handleMakeBlankCard, handleAiRecommend, handleSplitCategory, handleDeleteCategory }: any) => {
  const safeCategories = Array.isArray(categories) ? categories : [];
  const craftFolders = Array.from(new Set(safeCategories.map((c:any) => c.folder_name))).filter(f => f && f !== '기본 폴더').sort() as string[];
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [parsedText, setParsedText] = useState("");
  const [selectedWords, setSelectedWords] = useState<Set<number>>(new Set());

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

  return (
    // 💡 1. 우측 터미널 공간을 완전히 없애고 전체 화면을 사용하도록 변경했습니다.
    <div className="animate-in fade-in space-y-8">
      <div className="flex gap-2 mb-4">
        <label className="flex-1 border border-white/20 p-2 text-center text-xs hover:bg-white/10 cursor-pointer text-white/80">
          <input type="file" accept=".pdf,.html" onChange={e => setLawFile(e.target.files?.[0] || null)} className="hidden"/> {lawFile ? `✅ ${lawFile.name}` : '+ 법령 파일(HTML/PDF) 업로드'}
        </label>
        <button onClick={uploadLaw} className="px-4 border border-white/20 text-xs hover:bg-white/10 transition-colors">전송</button>
      </div>

      {selectedCraftIds.size > 0 && (
        <div className="flex gap-2 items-center bg-indigo-900/20 p-3 rounded-sm border border-indigo-500/20 mb-4">
          <span className="text-xs text-indigo-300">{selectedCraftIds.size}개 선택됨</span>
          <input value={targetFolderName} onChange={e=>setTargetFolderName(e.target.value)} placeholder="새 폴더명 (예: 제1장 총칙)" className="bg-black/50 border border-white/20 text-xs p-2 text-white outline-none flex-1" />
          <button onClick={handleMoveCraftFolders} className="text-xs border border-indigo-500/50 bg-indigo-600/30 text-white px-4 py-2 hover:bg-indigo-600/50">선택한 조항 이동</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {craftFolders.map((f: string) => <button key={f} onClick={() => setOpenFolders(p => ({...p, [f]: !p[f]}))} className={`px-4 py-2 text-[12px] font-bold border rounded-sm transition-all ${openFolders[f] ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-indigo-900/40 text-indigo-300 border-indigo-500/30'}`}>📁 {f}</button>)}
      </div>
      
      {craftFolders.map((folder: string) => openFolders[folder] && (
        <div key={folder} className="mb-8">
          <div className="text-sm text-white/50 mb-3 border-b border-white/10 pb-2">{folder}</div>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
            {safeCategories
              .filter((c:any) => c.folder_name === folder)
              .filter((c:any) => {
                 if (viewMode === 'all') return true;
                 if (viewMode === '법' && c.title.includes('[법]')) return true;
                 if (viewMode === '령' && c.title.includes('[령]')) return true;
                 if (viewMode === '칙' && (c.title.includes('[칙]') || c.title.includes('[규]'))) return true;
                 return false;
              })
              .sort((a:any, b:any) => a.id - b.id)
              .map((cat: any) => {
                const isExpanded = expandedId === cat.id;
                const gridStyle = getGridStyle(cat.title, viewMode, isExpanded, colCount);
                
                // 💡 2. DB의 텍스트를 무조건 제목과 본문으로 쪼갭니다.
                const { title, body } = formatCardText(cat.content || cat.title);

                return (
                  <div key={cat.id} className="relative transition-all" style={gridStyle}>
                    <input type="checkbox" className="absolute top-2 right-2 z-10 w-4 h-4 cursor-pointer" checked={selectedCraftIds.has(cat.id)} onChange={() => { const s = new Set(selectedCraftIds); if(s.has(cat.id)) s.delete(cat.id); else s.add(cat.id); setSelectedCraftIds(s); }} />
                    {!isExpanded ? (
                      // 💡 3. 닫혀있는 카드 모양에서도 제목과 본문이 위아래로 나뉘도록 디자인 수정!
                      <button {...createLongPressHandlers(() => handleDeleteCategory(cat.id), 800)} onClick={() => { setExpandedId(cat.id); setSelectedWords(new Set()); setParsedText(`${title}\n\n${body}`); }} className="w-full h-full p-5 bg-indigo-900/20 border border-indigo-500/30 rounded-sm text-left transition-colors hover:bg-indigo-900/40 flex flex-col gap-3">
                        <span className="text-amber-400 font-bold text-[13px]">{title}</span>
                        <span className="text-white/60 text-[12px] leading-relaxed line-clamp-3 whitespace-pre-wrap">{body}</span>
                      </button>
                    ) : (
                      <div className="w-full p-6 bg-[#0a0a0c] border border-indigo-500/50 rounded-sm space-y-4 shadow-xl z-20 relative">
                        <div className="flex justify-between items-center mb-2">
                          {useAiRecommend && <button onClick={() => handleAiRecommend(cat)} className="text-[10px] bg-teal-900/40 text-teal-400 px-3 py-1.5 rounded hover:bg-teal-900/60 transition-colors">✨ AI 추천</button>}
                          <button onClick={() => setExpandedId(null)} className="text-white/40 text-xs hover:text-white">닫기</button>
                        </div>
                        
                        {/* 💡 4. 열렸을 때도 줄바꿈(whitespace-pre-wrap)이 완벽하게 유지됩니다. */}
                        <div className="font-serif text-[15px] leading-loose text-white/80 p-5 bg-black/40 border border-white/10 max-h-64 overflow-y-auto rounded select-none touch-manipulation whitespace-pre-wrap">
                          {parsedText.split(SPLIT_REGEX).map((word: string, idx: number, arr: any[]) => {
                            if (!word) return null;
                            const isSelected = selectedWords.has(idx);
                            return (
                              <span 
                                key={idx} 
                                onClick={() => { 
                                  const s = new Set(selectedWords); 
                                  if(s.has(idx)) s.delete(idx); else s.add(idx); 
                                  setSelectedWords(s); 
                                }} 
                                onDoubleClick={(e) => {
                                  e.preventDefault();
                                  const s = new Set(selectedWords);
                                  s.add(idx);
                                  if (idx + 1 < arr.length) s.add(idx + 1);
                                  if (idx + 2 < arr.length) s.add(idx + 2);
                                  setSelectedWords(s);
                                }}
                                {...createLongPressHandlers(() => handleSplitCategory(cat, idx, arr), 800)} 
                                className={`cursor-pointer px-[2px] rounded transition-colors ${isSelected ? 'bg-amber-500 text-black font-bold' : 'hover:bg-white/20'}`}
                              >
                                {word}
                              </span>
                            )
                          })}
                        </div>
                        <button onClick={() => handleMakeBlankCard({ ...cat, title }, parsedText, selectedWords, () => { setExpandedId(null); setSelectedWords(new Set()); })} className="w-full py-3 bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 text-sm font-bold tracking-widest transition-all rounded-sm mt-2">지식 추출 및 원본 삭제</button>
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
