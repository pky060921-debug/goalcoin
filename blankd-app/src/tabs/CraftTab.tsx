import React, { useState, useRef } from 'react';
import { getStrictCardTitle, getSortNumber, getColSpanAndStartClass, SPLIT_REGEX } from '../utils/constants';

export const CraftTab = ({ categories, colCount, viewMode, useAiRecommend, panelState, lawFile, setLawFile, examFile, setExamFile, uploadLaw, uploadExam, selectedCraftIds, setSelectedCraftIds, targetFolderName, setTargetFolderName, handleMoveCraftFolders, handleMakeBlankCard, handleAiRecommend, handleSplitCategory, handleDeleteCategory }: any) => {
  const craftFolders = Array.from(new Set(categories.map((c:any) => c.folder_name || '기본 폴더'))).sort() as string[];
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [parsedText, setParsedText] = useState("");
  const [selectedWords, setSelectedWords] = useState<Set<number>>(new Set());

  const useLongPress = (callback: () => void, ms = 800) => {
    const timerRef = useRef<any>(null);
    const start = () => { timerRef.current = setTimeout(callback, ms); };
    const clear = () => { clearTimeout(timerRef.current); };
    return { onTouchStart: start, onTouchEnd: clear, onMouseDown: start, onMouseUp: clear, onMouseLeave: clear, onContextMenu: (e:any) => { e.preventDefault(); callback(); } };
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 animate-in fade-in">
      <div className="lg:col-span-8 space-y-8">
        {/* 파일 업로드 영역 부활 */}
        <div className="flex gap-2 mb-4">
          <label className="flex-1 border border-white/20 p-2 text-center text-xs hover:bg-white/10 cursor-pointer text-white/80">
            <input type="file" accept=".pdf,.html" onChange={e => setLawFile(e.target.files?.[0] || null)} className="hidden"/> {lawFile ? `✅ ${lawFile.name}` : '+ 법령 업로드'}
          </label>
          <button onClick={uploadLaw} className="px-4 border border-white/20 text-xs">전송</button>
          
          <label className="flex-1 border border-teal-900/40 p-2 text-center text-xs hover:bg-teal-900/20 cursor-pointer text-teal-400">
            <input type="file" accept=".pdf,.html" onChange={e => setExamFile(e.target.files?.[0] || null)} className="hidden"/> {examFile ? `✅ ${examFile.name}` : '+ 모의고사 업로드'}
          </label>
          <button onClick={uploadExam} className="px-4 border border-teal-900/40 text-xs text-teal-400">전송</button>
        </div>

        {/* 폴더 대량 이동 UI 부활 */}
        {selectedCraftIds.size > 0 && (
          <div className="flex gap-2 items-center bg-indigo-900/20 p-3 rounded-sm border border-indigo-500/20 mb-4">
            <span className="text-xs text-indigo-300">{selectedCraftIds.size}개 선택됨</span>
            <input value={targetFolderName} onChange={e=>setTargetFolderName(e.target.value)} placeholder="새 폴더명" className="bg-black/50 border border-white/20 text-xs p-2 text-white outline-none flex-1" />
            <button onClick={handleMoveCraftFolders} className="text-xs border border-indigo-500/50 bg-indigo-600/30 text-white px-4 py-2">폴더로 이동</button>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-6">
          {craftFolders.map((f: string) => <button key={f} onClick={() => setOpenFolders(p => ({...p, [f]: !p[f]}))} className={`px-4 py-2 text-[12px] font-bold border rounded-sm transition-all ${openFolders[f] ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-indigo-900/40 text-indigo-300 border-indigo-500/30'}`}>📁 {f}</button>)}
        </div>
        {craftFolders.map((folder: string) => openFolders[folder] && (
          <div key={folder} className="mb-8">
            <div className="text-sm text-white/50 mb-3 border-b border-white/10 pb-2">{folder}</div>
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
              {categories.filter((c:any) => (c.folder_name || '기본 폴더') === folder).sort((a:any, b:any) => getSortNumber(a.title) - getSortNumber(b.title)).map((cat: any) => {
                const isExpanded = expandedId === cat.id;
                return (
                  <div key={cat.id} className={`${getColSpanAndStartClass(cat.title, viewMode, isExpanded, colCount)} relative`}>
                    <input type="checkbox" className="absolute top-2 right-2 z-10 w-4 h-4 cursor-pointer" checked={selectedCraftIds.has(cat.id)} onChange={() => { const s = new Set(selectedCraftIds); if(s.has(cat.id)) s.delete(cat.id); else s.add(cat.id); setSelectedCraftIds(s); }} />
                    {!isExpanded ? (
                      <button {...useLongPress(() => handleDeleteCategory(cat.id), 800)} onClick={() => { setExpandedId(cat.id); setSelectedWords(new Set()); setParsedText(cat.content); }} className="w-full h-full p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-sm text-indigo-300 font-bold text-[13px]">{getStrictCardTitle(cat.title)}</button>
                    ) : (
                      <div className="w-full p-6 bg-[#0a0a0c] border border-indigo-500/50 rounded-sm space-y-4">
                        <div className="flex justify-between">
                          {useAiRecommend && <button onClick={() => handleAiRecommend(cat)} className="text-[10px] bg-teal-900/40 text-teal-400 px-2 py-1 rounded">✨ AI 추천</button>}
                          <button onClick={() => setExpandedId(null)} className="text-white/40 text-xs">닫기</button>
                        </div>
                        <div className="font-serif text-[15px] leading-loose text-white/80 p-4 bg-black/40 border border-white/10 max-h-64 overflow-y-auto">
                          {parsedText.split(SPLIT_REGEX).map((word: string, idx: number, arr: any[]) => {
                            if (!word) return null;
                            const isSelected = selectedWords.has(idx);
                            return <span key={idx} onClick={() => { const s = new Set(selectedWords); if(s.has(idx)) s.delete(idx); else s.add(idx); setSelectedWords(s); }} {...useLongPress(() => handleSplitCategory(cat, idx, arr), 800)} className={`cursor-pointer px-[2px] rounded ${isSelected ? 'bg-amber-500 text-black' : 'hover:bg-white/20'}`}>{word}</span>
                          })}
                        </div>
                        <button onClick={() => handleMakeBlankCard(cat, parsedText, selectedWords, () => { setExpandedId(null); setSelectedWords(new Set()); })} className="w-full py-3 bg-amber-500/20 text-amber-400 text-sm font-bold">지식 추출 및 원본 삭제</button>
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
