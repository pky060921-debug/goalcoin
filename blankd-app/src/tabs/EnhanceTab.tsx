import React, { useState, useEffect } from 'react';
import { formatCardText, parseCardStats, SPLIT_REGEX } from '../utils/constants';
import { api } from '../services/api';

const getGridClass = (cols: number) => {
  if(cols === 1) return "md:grid-cols-1";
  if(cols === 2) return "md:grid-cols-2";
  if(cols === 3) return "md:grid-cols-3";
  if(cols === 4) return "md:grid-cols-4";
  if(cols === 5) return "md:grid-cols-5";
  return "md:grid-cols-3";
};

export const EnhanceTab = ({ savedCards, colCount, viewMode, setActiveCard, setActiveTab, setExpandedId, loadAllData, safeAddress, globalDict }: any) => {
  
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [editContent, setEditContent] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<'editor' | 'include' | 'exclude' | null>('include');

  const [localCards, setLocalCards] = useState<any[]>([]);
  const [movingId, setMovingId] = useState<number | null>(null);

  const enhanceFolders = Array.from(new Set(localCards.map((c:any) => c.folder_name))).filter(f => f && f !== '기본 폴더').sort() as string[];
  
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() => {
    try { const saved = localStorage.getItem('blankd_enhance_folders'); return saved ? JSON.parse(saved) : {}; } 
    catch(e) { return {}; }
  });
  
  useEffect(() => {
    if (!movingId && !editingId) {
      setLocalCards(Array.isArray(savedCards) ? savedCards : []);
    }
  }, [savedCards, movingId, editingId]);

  useEffect(() => {
    setOpenFolders(prev => {
      const next = { ...prev }; let changed = false;
      enhanceFolders.forEach(f => { if (next[f] === undefined) { next[f] = true; changed = true; } });
      if (changed) localStorage.setItem('blankd_enhance_folders', JSON.stringify(next)); return next;
    });
  }, [localCards, enhanceFolders]);

  const handleToggleFolder = (f: string) => {
    setOpenFolders(prev => { const next = { ...prev, [f]: !prev[f] }; localStorage.setItem('blankd_enhance_folders', JSON.stringify(next)); return next; });
  };

  const createLongPressHandlers = (callback: () => void, ms = 800) => {
    let timer: any;
    const start = () => { timer = setTimeout(callback, ms); };
    const clear = () => { clearTimeout(timer); };
    return { onTouchStart: start, onTouchEnd: clear, onMouseDown: start, onMouseUp: clear, onMouseLeave: clear, onContextMenu: (e:any) => { e.preventDefault(); callback(); } };
  };

  const triggerMoveApi = async (folder: string, index: number, direction: 'up' | 'down', folderCards: any[]) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newFolderCards = [...folderCards];
    [newFolderCards[index], newFolderCards[targetIndex]] = [newFolderCards[targetIndex], newFolderCards[index]];
    const orderedIds = newFolderCards.map(c => c.id);

    try {
      await fetch("https://api.blankd.top/api/update-order", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, table: 'cards', ordered_ids: orderedIds })
      });
    } catch (err) { console.error("순서 변경 실패:", err); }
  };

  const handleMoveCard = async (folder: string, index: number, direction: 'up' | 'down') => {
    const folderCards = localCards.filter((c:any) => c && c.content && c.folder_name === folder);
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === folderCards.length - 1) return;
    
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const card = folderCards[index];
    const targetCard = folderCards[targetIndex];
    
    setLocalCards(prevCards => {
      const next = [...prevCards];
      const g1 = next.findIndex(c => c.id === card.id);
      const g2 = next.findIndex(c => c.id === targetCard.id);
      [next[g1], next[g2]] = [next[g2], next[g1]];
      return next;
    });

    await triggerMoveApi(folder, index, direction, folderCards);
    if (loadAllData) loadAllData();
  };

  useEffect(() => {
    if (!movingId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        setMovingId(null);
        if (loadAllData) loadAllData(); 
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        setLocalCards(prevCards => {
          const card = prevCards.find(c => c.id === movingId);
          if (!card) return prevCards;
          const folder = card.folder_name;
          const folderCards = prevCards.filter(c => c && c.content && c.folder_name === folder);
          const idx = folderCards.findIndex(c => c.id === movingId);
          
          if (e.key === 'ArrowUp' && idx > 0) {
            const targetCard = folderCards[idx - 1];
            triggerMoveApi(folder, idx, 'up', folderCards);
            const next = [...prevCards];
            const g1 = next.findIndex(c => c.id === card.id);
            const g2 = next.findIndex(c => c.id === targetCard.id);
            [next[g1], next[g2]] = [next[g2], next[g1]];
            setTimeout(() => document.getElementById(`enhance-card-${movingId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
            return next;
          } 
          else if (e.key === 'ArrowDown' && idx < folderCards.length - 1) {
            const targetCard = folderCards[idx + 1];
            triggerMoveApi(folder, idx, 'down', folderCards);
            const next = [...prevCards];
            const g1 = next.findIndex(c => c.id === card.id);
            const g2 = next.findIndex(c => c.id === targetCard.id);
            [next[g1], next[g2]] = [next[g2], next[g1]];
            setTimeout(() => document.getElementById(`enhance-card-${movingId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
            return next;
          }
          return prevCards;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [movingId, safeAddress, loadAllData]);

  // 💡 [치명적 버그 수정 완료] 시스템 태그 훼손 방지 및 자가 치유 엔진 적용
  const autoApplyDict = (content: string) => {
    if (!globalDict) return content;
    
    // 1. 이미 훼손된 태그 [ORIG_ID:xxx] 가 있다면 0.1초 만에 정상 태그로 자가 치유 복구합니다.
    let fixedContent = content.replace(/\[ORIG_ID:(\d+)\]/g, '[[ORIG_ID:$1]]');
    
    const lines = fixedContent.split('\n');
    const titleLine = lines[0] || '';
    const restContent = lines.length > 1 ? lines.slice(1).join('\n') : '';

    const stopWords = globalDict.custom_stopwords || globalDict.stopwords || [];
    const abbrevKeys = Object.keys(globalDict.abbreviations || {});
    const includeWords = Array.from(new Set([...(globalDict.custom_inclusions || globalDict.inclusions || []), ...abbrevKeys])).filter(w => w.trim() !== '').sort((a, b) => b.length - a.length);

    let tokens = restContent.split(/(\[\[ORIG_ID:\d+\]\]|\[[^\]]+\])/g);
    for (let i = 0; i < tokens.length; i++) {
      if (!tokens[i]) continue;
      // 2. ORIG_ID 태그는 어떠한 사전 규칙도 건드리지 못하게 절대 보호합니다.
      if (tokens[i].startsWith('[[ORIG_ID:')) continue;
      
      if (tokens[i].startsWith('[') && tokens[i].endsWith(']')) {
        let innerText = tokens[i].slice(1, -1);
        if (stopWords.includes(innerText.trim())) { tokens[i] = innerText; }
      } else {
        let text = tokens[i];
        includeWords.forEach((iw: string) => {
          const escaped = iw.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(${escaped})`, 'g');
          let parts = text.split(/(\[[^\]]+\])/g);
          for(let j=0; j<parts.length; j++){
            if(!parts[j].startsWith('[')){ parts[j] = parts[j].replace(regex, '[$1]'); }
          }
          text = parts.join('');
        });
        tokens[i] = text;
      }
    }
    
    // 3. 괄호 중복 제거 로직에서 시스템 태그는 100% 면제(열외)시킵니다.
    for (let i = 0; i < tokens.length; i++) {
      if (!tokens[i].startsWith('[[ORIG_ID:')) {
         tokens[i] = tokens[i].replace(/\[+/g, '[').replace(/\]+/g, ']');
      }
    }

    return titleLine + (lines.length > 1 ? '\n' : '') + tokens.join('');
  };

  const handleAddAdjacent = (folder: string, index: number, type: '령' | '칙') => {
    const folderCards = localCards.filter((c:any) => c && c.content && c.folder_name === folder);
    const origCard = folderCards[index];
    const tempId = `temp_${Date.now()}`;
    const newTitle = type === '령' ? '[령] 새 시행령' : '[칙] 새 시행규칙';
    
    const newCard = {
        id: tempId,
        folder_name: folder,
        content: `${newTitle}\n\n내용을 입력하세요.`,
        memo: JSON.stringify({ text: "", filled: 0, wrongIndices: [] }),
        answer_text: "",
        isTemp: true,
        insertAfterId: origCard.id
    };

    const nextCards = [...localCards];
    const globalIdx = nextCards.findIndex(c => c.id === origCard.id);
    nextCards.splice(globalIdx + 1, 0, newCard); 
    setLocalCards(nextCards);

    setEditingId(tempId);
    setEditContent(newCard.content);
    setActiveTool('editor');
  };

  const handleSaveEdit = async (card: any) => {
    setIsSaving(true); setErrorMsg(null);
    try {
      let sanitizedContent = editContent;
      
      // 💡 [안전 보장] 훼손된 태그까지 정밀 탐지하여 100% 정상 태그로 재결합합니다.
      const origIdMatch = editContent.match(/\[\[?ORIG_ID:(\d+)\]?\]?/);
      if (origIdMatch) {
        const systemTag = origIdMatch[0];
        const origIdNum = origIdMatch[1]; // 번호만 순수하게 추출
        const correctSystemTag = `[[ORIG_ID:${origIdNum}]]`;
        
        const bodyText = editContent.replace(systemTag, '');
        const cleanBody = bodyText.replace(/\[+/g, '[').replace(/\]+/g, ']');
        sanitizedContent = cleanBody.trim() + '\n\n' + correctSystemTag;
      } else { 
        sanitizedContent = editContent.replace(/\[+/g, '[').replace(/\]+/g, ']'); 
      }

      // 💡 빈칸 정답을 파싱할 때 ORIG_ID 라는 글자 자체가 절대 정답으로 지정되지 못하게 원천 차단 필터 삽입
      const newAnswers = (sanitizedContent.match(/\[\s*(.*?)\s*\]/g) || [])
        .map(b => b.replace(/\[|\]/g, '').trim())
        .filter(a => !a.startsWith('ORIG_ID:')) // 철통 방어벽
        .filter(Boolean)
        .join(", ");
        
      const isTemp = card.isTemp || typeof card.id === 'string';
      
      const payload = { 
        wallet_address: safeAddress || "ENOKI_USER", 
        card_id: isTemp ? null : parseInt(card.id, 10), 
        card_content: sanitizedContent, 
        answer_text: newAnswers, 
        folder_name: card.folder_name, 
        memo: card.memo 
      };

      const res = await fetch("https://api.blankd.top/api/save-card", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("서버에서 수정 요청 거부됨");

      if (isTemp && card.insertAfterId) {
        const resData = await res.json().catch(()=>({}));
        const newCardId = resData.card_id || resData.id;
        
        const listRes = await fetch(`https://api.blankd.top/api/my-cards?wallet_address=${safeAddress}&t=${Date.now()}`);
        const listData = await listRes.json();
        const allCards = listData.cards || [];
        const folderCards = allCards.filter((c:any) => c.folder_name === card.folder_name);
        
        let createdCard = newCardId ? folderCards.find((c:any) => c.id === newCardId) : folderCards.filter((c:any) => c.content === sanitizedContent).pop();
        
        if (createdCard) {
            const otherFolderCards = folderCards.filter((c:any) => c.id !== createdCard.id);
            const targetIdx = otherFolderCards.findIndex((c:any) => c.id === card.insertAfterId);
            if (targetIdx !== -1) {
                otherFolderCards.splice(targetIdx + 1, 0, createdCard);
                const orderedIds = otherFolderCards.map((c:any) => c.id);
                await fetch("https://api.blankd.top/api/update-order", {
                    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, table: 'cards', ordered_ids: orderedIds })
                });
            }
        }
      } else {
        card.content = sanitizedContent; card.answer_text = newAnswers;
      }
      
      if (typeof loadAllData === 'function') await loadAllData();
      setEditingId(null); 
    } catch (error: any) { setErrorMsg(error.message || "서버 통신 실패"); } finally { setIsSaving(false); }
  };

  const renderInteractiveText = () => {
    const lines = editContent.split('\n');
    const titleLine = lines[0] || '';
    const restLines = lines.slice(1).join('\n');
    
    // 💡 [에디터 화면 치유] 훼손된 태그와 정상 태그 모두 분리해내어 에디터에 깔끔하게 띄워줍니다.
    const tokens = restLines.split(/(\s+|\n|---|\[\[?ORIG_ID:\d+\]?\]?|\[[^\]]+\])/g).filter(Boolean);

    return (
      <div className={`w-full bg-black/40 p-4 rounded border border-white/10 leading-loose font-sans ${activeTool ? 'select-none' : ''} min-h-[160px] max-h-[400px] overflow-y-auto custom-scrollbar`}>
        <div className="text-amber-400 font-bold mb-2 pb-2 border-b border-white/10 select-none opacity-70 cursor-not-allowed">
          {titleLine}
        </div>
        {tokens.map((token, idx) => {
          const isOrigId = token.startsWith('[[ORIG_ID:') || token.startsWith('[ORIG_ID:');
          const isBracketed = token.startsWith('[') && token.endsWith(']') && !isOrigId;
          const isPageBreak = token === '---';
          const isNewline = token === '\n';
          const isWhitespace = /^\s+$/.test(token);
          
          if (isOrigId) return <div key={idx} className="inline-block text-[10px] text-white/20 font-mono bg-white/5 px-2 py-0.5 rounded mr-2 mb-2 select-none cursor-default">🔗 시스템 태그 보호중</div>;
          if (isPageBreak) return <div key={idx} className="my-6 border-b-2 border-dashed border-white/20 relative flex justify-center cursor-default"><span className="absolute -top-3 bg-[#0a0a0c] px-3 py-0.5 rounded-full text-[10px] text-white/40 font-bold border border-white/10">✂️ PAGE BREAK (---)</span></div>;
          if (isNewline) return <br key={idx} />;
          if (isWhitespace) return <span key={idx}>{token}</span>;

          let btnClass = "inline-block rounded px-1.5 py-0.5 mx-0.5 transition-all ";
          if (activeTool === 'include') {
            if (isBracketed) btnClass += "bg-teal-900/20 text-teal-500/50 border border-teal-500/10 cursor-not-allowed";
            else btnClass += "text-white/80 cursor-pointer bg-white/5 hover:bg-teal-500/40 hover:text-white hover:scale-105 active:scale-95 border border-transparent hover:border-teal-400/50 shadow-sm";
          } else if (activeTool === 'exclude') {
            if (isBracketed) btnClass += "bg-teal-900/60 text-teal-200 border border-teal-500/60 cursor-pointer hover:bg-red-600/80 hover:text-white hover:border-red-400 hover:scale-105 active:scale-95 hover:line-through shadow-md";
            else btnClass += "text-white/30 cursor-default";
          } else {
            if (isBracketed) btnClass += "bg-teal-900/30 text-teal-400 border border-teal-500/30 cursor-default";
            else btnClass += "text-white/77 cursor-default";
          }

          return (
            <span key={idx} onClick={() => {
                if (activeTool === 'include' && !isBracketed) {
                  const newTokens = [...tokens]; newTokens[idx] = `[${token}]`; setEditContent(titleLine + '\n' + newTokens.join(''));
                } else if (activeTool === 'exclude' && isBracketed) {
                  const newTokens = [...tokens]; newTokens[idx] = token.slice(1, -1); setEditContent(titleLine + '\n' + newTokens.join(''));
                }
              }} className={btnClass}
            >{isBracketed ? token.slice(1, -1) : token}</span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in w-full">
      <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4 sm:mb-6">
        {enhanceFolders.map((f: string) => (
          <button key={f} onClick={() => handleToggleFolder(f)} className={`px-3 py-1.5 sm:py-2 text-[10px] sm:text-[12px] font-bold border rounded-sm transition-all ${openFolders[f] ? 'bg-teal-600 border-teal-500 text-white shadow-sm' : 'bg-teal-900/40 text-teal-300 border-teal-500/30'}`}>
            📁 {f}
          </button>
        ))}
      </div>
      
      {enhanceFolders.map((folder: string) => openFolders[folder] && (
        <div key={folder} className="mb-6 sm:mb-8 border-l border-white/5 pl-3 sm:pl-4">
          <div className="text-xs sm:text-sm text-white/50 mb-2 sm:mb-3 border-b border-white/10 pb-1.5 sm:pb-2 font-bold">{folder}</div>
          <div className={`grid grid-cols-1 ${getGridClass(colCount)} gap-3 sm:gap-4 items-start`}>
            {localCards.filter((c:any) => c && c.content && c.folder_name === folder).map((card: any, idx: number, folderCards: any[]) => {
                try {
                  // 💡 화면 렌더링 시에도 훼손된 태그까지 완벽하게 걸러내어 표시합니다.
                  const cleanContent = card.content.replace(/\s*\[\[?ORIG_ID:\d+\]?\]?/g, '');
                  let displayTitle = (cleanContent.split('\n')[0] || "").replace(/\[.*?\]/g, '').replace(/\(\s*내용\s*\)/g, '').replace(/내용/g, '').trim();
                  if (!displayTitle) displayTitle = "제목 없음";

                  const lines = cleanContent.split('\n');
                  const bodyOnlyForStats = lines.slice(1).join('\n');
                  const totalBlanks = (bodyOnlyForStats.match(/\[\s*(.*?)\s*\]/g) || []).length;
                  
                  const stats = parseCardStats(card.memo);
                  const hasWrong = stats.wrongIndices.length > 0;
                  
                  let colClass = ""; let titleColor = "text-teal-400";
                  if (viewMode === 'all' && colCount >= 3) {
                    if (cleanContent.includes('[법]')) { colClass = "md:col-start-1"; titleColor = "text-red-500"; }
                    else if (cleanContent.includes('[령]')) { colClass = "md:col-start-2"; titleColor = "text-blue-400"; }
                    else if (cleanContent.includes('[칙]') || cleanContent.includes('[규]')) { colClass = "md:col-start-3"; titleColor = "text-green-500"; }
                  } else {
                    if (cleanContent.includes('[법]')) titleColor = "text-red-500";
                    else if (cleanContent.includes('[령]')) titleColor = "text-blue-400";
                    else if (cleanContent.includes('[칙]') || cleanContent.includes('[규]')) titleColor = "text-green-500";
                  }

                  if (editingId === card.id) colClass = "col-span-full";

                  return (
                    <div key={card.id} id={`enhance-card-${card.id}`} className={`relative transition-all w-full ${colClass}`}>
                      {editingId === card.id ? (
                        <div className="relative flex flex-col p-4 rounded-sm border border-amber-500/50 bg-[#0a0a0c] transition-all duration-300 w-full shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
                            <span className="text-[12px] text-amber-400 font-bold flex items-center gap-2">🛠️ 빈칸 직접 수정 모드</span>
                            <div className="flex items-center gap-1.5 bg-black/50 p-1 rounded-md border border-white/10">
                              <button onClick={() => setActiveTool(activeTool === 'editor' ? null : 'editor')} className={`px-2.5 py-1.5 rounded text-[10px] font-bold ${activeTool === 'editor' ? 'bg-amber-600/90 text-white' : 'bg-white/5 text-white/50'}`}>📝 직접 타이핑</button>
                              <div className="w-px h-4 bg-white/10 mx-0.5"></div>
                              <button onClick={() => setActiveTool(activeTool === 'include' ? null : 'include')} className={`px-2.5 py-1.5 rounded text-[10px] font-bold ${activeTool === 'include' ? 'bg-teal-600/90 text-white' : 'bg-white/5 text-white/50'}`}>➕ 클릭 포함</button>
                              <button onClick={() => setActiveTool(activeTool === 'exclude' ? null : 'exclude')} className={`px-2.5 py-1.5 rounded text-[10px] font-bold ${activeTool === 'exclude' ? 'bg-red-600/90 text-white' : 'bg-white/5 text-white/50'}`}>➖ 클릭 제외</button>
                            </div>
                          </div>
                          
                          {activeTool === 'editor' ? (
                            <textarea value={editContent} onChange={(e) => { setEditContent(e.target.value); }} className="w-full min-h-[160px] max-h-[400px] bg-black/60 text-amber-50 text-[12px] p-4 rounded border border-white/10 outline-none resize-none custom-scrollbar" placeholder="직접 입력하거나 [ ] 기호로 감싸세요." />
                          ) : renderInteractiveText()}
                          
                          {errorMsg && <div className="text-red-400 text-[10px] mt-3 font-bold">{errorMsg}</div>}
                          
                          <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-white/10">
                            <button onClick={(e) => { e.stopPropagation(); setEditingId(null); if(card.isTemp) { setLocalCards(prev=>prev.filter(c=>c.id!==card.id)); } }} className="px-4 py-2 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 rounded-sm text-[11px] font-bold">취소</button>
                            <button onClick={(e) => { e.stopPropagation(); handleSaveEdit(card); }} className="px-5 py-2 bg-amber-600 text-white hover:bg-amber-500 rounded-sm text-[11px] font-bold">{isSaving ? '저장 중...' : '💾 내용 저장'}</button>
                          </div>
                        </div>
                      ) : (
                        <button {...createLongPressHandlers(() => (card.id))} onClick={(e) => { e.stopPropagation(); if (typeof setActiveCard === 'function') setActiveCard(card); }} className={`w-full p-3 sm:p-4 rounded-sm border flex flex-col justify-center gap-2 ${movingId === card.id ? "border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)] bg-blue-900/30 ring-2 ring-blue-500/50" : hasWrong ? "border-red-500/40 bg-red-900/20" : "border-indigo-500/30 bg-indigo-900/20 hover:bg-indigo-900/40"} shadow-sm transition-all duration-200`}>
                          
                          <div className="flex w-full">
                            <div className={`${titleColor} font-bold text-[12px] sm:text-[14px] leading-snug break-keep text-left flex-1`}>{displayTitle}</div>
                          </div>
                          
                          {movingId === card.id ? (
                            <div className="flex items-center justify-between w-full mt-2 pt-2 border-t border-blue-500/30 animate-in fade-in">
                              <span className="text-blue-300 text-[11px] font-bold flex items-center gap-1.5">
                                <span className="animate-bounce">↕️</span> 방향키(↑, ↓)로 이동 후 Enter 입력
                              </span>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setMovingId(null); if(loadAllData) loadAllData(); }} 
                                className="px-3 py-1 bg-blue-600 text-white text-[10px] font-bold rounded-sm shadow-md hover:bg-blue-500 transition-colors"
                              >
                                ✅ 완료
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-row justify-between items-center w-full mt-1 border-t border-white/5 pt-2">
                              <div className="flex flex-nowrap gap-1">
                                <span className="text-[8px] sm:text-[9px] text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded bg-indigo-900/40 font-mono whitespace-nowrap">빈칸:{totalBlanks}</span>
                                <span className="text-[8px] sm:text-[9px] text-teal-300 border border-teal-500/30 px-1.5 py-0.5 rounded bg-teal-900/40 font-mono whitespace-nowrap">반복:{stats.filled}</span>
                                <span className={`text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded font-mono border whitespace-nowrap ${hasWrong ? 'text-white border-red-500/60 bg-red-600 font-bold animate-pulse shadow-sm' : 'text-white/30 border-white/5 bg-black/20'}`}>틀림:{stats.wrongIndices.length}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button onClick={(e) => { e.stopPropagation(); setMovingId(card.id); }} className="px-1.5 py-0.5 bg-blue-900/40 text-blue-400 border border-blue-500/50 rounded font-mono text-[9px] hover:bg-blue-900/60 transition-colors cursor-pointer flex items-center gap-1">↕️ 이동</button>
                                <button onClick={(e) => { e.stopPropagation(); handleAddAdjacent(folder, idx, '령'); }} className="px-1.5 py-0.5 bg-teal-900/40 text-teal-400 border border-teal-500/50 rounded font-mono text-[9px] hover:bg-teal-900/60 transition-colors cursor-pointer">+령</button>
                                <button onClick={(e) => { e.stopPropagation(); handleAddAdjacent(folder, idx, '칙'); }} className="px-1.5 py-0.5 bg-green-900/40 text-green-400 border border-green-500/50 rounded font-mono text-[9px] hover:bg-green-900/60 transition-colors cursor-pointer">+칙</button>
                                
                                <button onClick={(e) => { e.stopPropagation(); setEditingId(card.id); const preProcessedContent = autoApplyDict(card.content); setEditContent(preProcessedContent); setActiveTool('editor'); }} className="px-1.5 py-0.5 bg-amber-900/40 text-amber-400 border border-amber-500/50 rounded font-mono text-[9px] hover:bg-amber-900/60 transition-colors">✏️수정</button>
                                <button onClick={async (e) => { e.stopPropagation(); if (confirm(`'${displayTitle}' 카드를 정말 삭제하시겠습니까?`)) { try { const res = await fetch("https://api.blankd.top/api/delete-card", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, id: card.id, card_id: card.id }) }); if (!res.ok) throw new Error(); if (loadAllData) await loadAllData(); } catch (err) { alert("카드 삭제에 실패했습니다."); } } }} className="ml-1 px-1.5 py-0.5 bg-red-900/40 text-red-400 border border-red-500/50 rounded font-mono text-[9px] hover:bg-red-900/60 transition-colors">🗑️삭제</button>
                              </div>
                            </div>
                          )}

                        </button>
                      )}
                    </div>
                  );
                } catch (renderError: any) { return <div key={card.id || Math.random()} className="text-red-500 text-xs p-2 border border-red-500/50 bg-red-900/20">카드 렌더링 오류 진단: {renderError.message}</div>; }
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
