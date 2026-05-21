import React, { useState, useEffect } from 'react';
import { formatCardText, getStrictTitleOnly, SPLIT_REGEX } from '../utils/constants';
import { api } from '../services/api';

const getGridClass = (cols: number) => {
  if(cols === 1) return "md:grid-cols-1";
  if(cols === 2) return "md:grid-cols-2";
  if(cols === 3) return "md:grid-cols-3";
  if(cols === 4) return "md:grid-cols-4";
  if(cols === 5) return "md:grid-cols-5";
  return "md:grid-cols-3";
};

type WordItem = { text: string; subWords: string[]; };

// 🔴 개선사항 1: 장(Chapter) 정렬 함수
// ────────────────────────────────────────
const sortChapters = (folders: string[]): string[] => {
  const chapterRegex = /^제\s*(\d+)\s*장/;
  
  return folders.sort((a, b) => {
    const matchA = a.match(chapterRegex);
    const matchB = b.match(chapterRegex);
    
    // 둘 다 장이면 번호로 정렬
    if (matchA && matchB) {
      const numA = parseInt(matchA[1]);
      const numB = parseInt(matchB[1]);
      return numA - numB;
    }
    
    // A만 장이면 앞으로
    if (matchA) return -1;
    // B만 장이면 앞으로
    if (matchB) return 1;
    
    // 둘 다 장이 아니면 알파벳 순서
    return a.localeCompare(b, 'ko');
  });
};

// 🔴 개선사항 2: 폴더 분류 함수
// ────────────────────────────────────────
const classifyFolder = (folderName: string) => {
  const chapterMatch = folderName.match(/^제\s*(\d+)\s*장/);
  const hasChapter = !!chapterMatch;
  const chapterNum = chapterMatch ? parseInt(chapterMatch[1]) : null;
  
  return {
    isChapter: hasChapter,
    chapterNum: chapterNum,
    displayName: folderName
  };
};

export const CraftTab = ({ categories, colCount, viewMode, useAiRecommend, safeAddress, lawFile, setLawFile, uploadLaw, handleMakeBlankCard, addLog, handleDeleteCategory, loadAllData }: any) => {
  const safeCategories = Array.isArray(categories) ? categories : [];
  
  // 🔴 개선사항 3: 폴더 추출 및 정렬
  // ────────────────────────────────────────
  const craftFolders = sortChapters(
    Array.from(new Set(safeCategories.map((c:any) => c.folder_name)))
      .filter(f => f && f !== '기본 폴더') as string[]
  );
  
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() => {
    try { const saved = localStorage.getItem('blankd_craft_folders'); return saved ? JSON.parse(saved) : {}; } 
    catch(e) { return {}; }
  });

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [wordArray, setWordArray] = useState<WordItem[]>([]);
  const [selectedWords, setSelectedWords] = useState<Set<number>>(new Set());
  const [pageBreaks, setPageBreaks] = useState<Set<number>>(new Set());
  const [memoInput, setMemoInput] = useState(""); 
  const [isEraserMode, setIsEraserMode] = useState(false);
  
  const [isEditingText, setIsEditingText] = useState(false);
  const [editingContent, setEditingContent] = useState("");
  const [showStopWordsSettings, setShowStopWordsSettings] = useState(false);
  
  const [customStopWords, setCustomStopWords] = useState<string[]>([]);
  const [customIncludeWords, setCustomIncludeWords] = useState<string[]>([]);
  const [newStopWord, setNewStopWord] = useState("");
  const [newIncludeWord, setNewIncludeWord] = useState("");

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (safeAddress) {
      api.getStopwords(safeAddress).then(data => {
        if (data && data.stopwords) {
          if (Array.isArray(data.stopwords)) {
            setCustomStopWords(data.stopwords);
            setCustomIncludeWords([]);
          } else {
            setCustomStopWords(data.stopwords.stop || []);
            setCustomIncludeWords(data.stopwords.include || []);
          }
        }
      }).catch(err => addLog("⚠️ 단어 설정 DB 동기화 실패"));
    }
  }, [safeAddress]);

  const saveWordsToDB = async (stops: string[], includes: string[]) => {
    try {
      await api.updateStopwords(safeAddress, { stop: stops, include: includes });
      addLog(`✅ 단어 설정 DB 동기화 완료`);
    } catch(e) { alert("DB 저장 실패"); }
  };

  const handleAddStopWord = () => {
    if (!newStopWord.trim()) return;
    const words = newStopWord.split(',').map(w => w.trim()).filter(w => w);
    const nextList = Array.from(new Set([...customStopWords, ...words]));
    setCustomStopWords(nextList);
    setNewStopWord("");
    saveWordsToDB(nextList, customIncludeWords);
  };

  const handleRemoveStopWord = (wordToRemove: string) => {
    const nextList = customStopWords.filter(w => w !== wordToRemove);
    setCustomStopWords(nextList);
    saveWordsToDB(nextList, customIncludeWords);
  };

  const handleAddIncludeWord = () => {
    if (!newIncludeWord.trim()) return;
    const words = newIncludeWord.split(',').map(w => w.trim()).filter(w => w);
    const nextList = Array.from(new Set([...customIncludeWords, ...words]));
    setCustomIncludeWords(nextList);
    setNewIncludeWord("");
    saveWordsToDB(customStopWords, nextList);
  };

  const handleRemoveIncludeWord = (wordToRemove: string) => {
    const nextList = customIncludeWords.filter(w => w !== wordToRemove);
    setCustomIncludeWords(nextList);
    saveWordsToDB(customStopWords, nextList);
  };

  useEffect(() => {
    setOpenFolders(prev => {
      const next = { ...prev };
      let changed = false;
      craftFolders.forEach(f => {
        if (next[f] === undefined) { next[f] = true; changed = true; }
      });
      if (changed) localStorage.setItem('blankd_craft_folders', JSON.stringify(next));
      return next;
    });
  }, [categories]);

  const handleToggleFolder = (f: string) => {
    setOpenFolders(prev => {
      const next = { ...prev, [f]: !prev[f] };
      localStorage.setItem('blankd_craft_folders', JSON.stringify(next));
      return next;
    });
  };

  const createLongPressHandlers = (catId: number) => {
    let timer: any;
    const start = () => {
      timer = setTimeout(() => {
        if (!isSelectMode) {
          setIsSelectMode(true);
          setCheckedIds(new Set([catId]));
          addLog("📦 일괄 선택 모드가 활성화되었습니다.");
        }
      }, 700);
    };
    const clear = () => { clearTimeout(timer); };
    return {
      onTouchStart: start, onTouchEnd: clear,
      onMouseDown: start, onMouseUp: clear, onMouseLeave: clear,
      onContextMenu: (e: any) => { e.preventDefault(); }
    };
  };

  const handleToggleCheck = (catId: number) => {
    const next = new Set(checkedIds);
    if (next.has(catId)) next.delete(catId); else next.add(catId);
    setCheckedIds(next);
    if (next.size === 0) setIsSelectMode(false);
  };

  const handleBatchDelete = async () => {
    if (checkedIds.size === 0) return;
    if (window.confirm(`선택한 ${checkedIds.size}개의 조항을 일괄 삭제하시겠습니까?`)) {
      addLog(`🗑️ ${checkedIds.size}개 조항 일괄 삭제 시작...`);
      try {
        for (const id of Array.from(checkedIds)) {
          await handleDeleteCategory(id);
        }
        setCheckedIds(new Set());
        setIsSelectMode(false);
        addLog(`✅ 일괄 삭제 완료`);
      } catch(e) { addLog("❌ 일괄 삭제 실패"); }
    }
  };

  const openCategory = (cat: any) => {
    setExpandedId(cat.id);
    const words = cat.content.split(SPLIT_REGEX).map((word: string) => ({text: word, subWords: [word]}));
    setWordArray(words);
    setEditingContent(cat.content);
    setSelectedWords(new Set());
    setPageBreaks(new Set());
    setMemoInput(cat.memo || '');
  };

  const handleEditToggle = () => {
    if (isEditingText) {
      setWordArray(editingContent.split(SPLIT_REGEX).map((word: string) => ({text: word, subWords: [word]})));
    }
    setIsEditingText(!isEditingText);
  };

  const handleWordClick = (idx: number) => {
    setSelectedWords(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const handleWordSplit = (idx: number, e: any) => {
    e.preventDefault();
    const word = wordArray[idx].text;
    const [part1, part2] = [word.substring(0, word.length >> 1), word.substring(word.length >> 1)];
    const updated = [...wordArray];
    updated[idx] = {text: part1, subWords: [part1]};
    updated.splice(idx + 1, 0, {text: part2, subWords: [part2]});
    setWordArray(updated);
  };

  const handleWordMerge = (idx: number) => {
    if (idx > 0) {
      const updated = [...wordArray];
      const merged = wordArray[idx - 1].text + wordArray[idx].text;
      updated[idx - 1] = {text: merged, subWords: [merged]};
      updated.splice(idx, 1);
      setWordArray(updated);
    }
  };

  return (
    <div className="bg-black/20 rounded-lg p-3 sm:p-6">
      {/* 📂 HTML 파일 업로드 섹션 */}
      <div className="mb-6 pb-6 border-b border-white/10">
        <label className="block text-xs sm:text-sm font-bold text-amber-400 mb-3">
          📄 법령 HTML 파일 업로드
        </label>
        <div className="flex gap-2 items-center">
          <input 
            type="file" 
            accept=".html,.htm,.txt" 
            onChange={(e) => setLawFile(e.target.files?.[0] || null)}
            className="flex-1 text-xs"
          />
          <button onClick={uploadLaw} className="px-3 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded hover:bg-amber-500/30 text-xs font-bold">
            업로드 & 분석
          </button>
        </div>
      </div>

      {/* 📊 전체 통계 */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-indigo-900/20 border border-indigo-500/30 p-2 sm:p-3 rounded text-center">
          <div className="text-[10px] sm:text-xs text-indigo-300">전체 조항</div>
          <div className="text-sm sm:text-lg font-bold text-indigo-400">{safeCategories.length}</div>
        </div>
        <div className="bg-blue-900/20 border border-blue-500/30 p-2 sm:p-3 rounded text-center">
          <div className="text-[10px] sm:text-xs text-blue-300">폴더 수</div>
          <div className="text-sm sm:text-lg font-bold text-blue-400">{craftFolders.length}</div>
        </div>
        <div className="bg-emerald-900/20 border border-emerald-500/30 p-2 sm:p-3 rounded text-center">
          <div className="text-[10px] sm:text-xs text-emerald-300">기본 폴더</div>
          <div className="text-sm sm:text-lg font-bold text-emerald-400">
            {safeCategories.filter((c:any) => c.folder_name === '기본 폴더').length}
          </div>
        </div>
        {isSelectMode && (
          <div className="bg-amber-900/20 border border-amber-500/30 p-2 sm:p-3 rounded text-center">
            <div className="text-[10px] sm:text-xs text-amber-300">선택됨</div>
            <div className="text-sm sm:text-lg font-bold text-amber-400">{checkedIds.size}</div>
          </div>
        )}
      </div>

      {/* 🔍 단어 설정 팝업 */}
      {showStopWordsSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-black border border-white/20 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <h3 className="text-white font-bold mb-4">📝 제외/포함 단어 설정</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-white/70 block mb-2">제외할 단어 (쉼표로 구분)</label>
                <input type="text" value={newStopWord} onChange={(e) => setNewStopWord(e.target.value)} placeholder="예: 그, 이, 것" className="w-full bg-white/5 border border-white/20 p-2 text-white rounded text-xs outline-none" />
                <button onClick={handleAddStopWord} className="mt-2 px-3 py-1 bg-red-500/20 text-red-400 text-xs rounded hover:bg-red-500/30">추가</button>
                <div className="mt-2 flex flex-wrap gap-1">
                  {customStopWords.map(w => (
                    <span key={w} className="bg-red-900/30 text-red-300 px-2 py-1 rounded text-xs flex items-center gap-1">
                      {w} <button onClick={() => handleRemoveStopWord(w)} className="text-red-400 hover:text-red-300">×</button>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-white/70 block mb-2">포함할 단어 (쉼표로 구분)</label>
                <input type="text" value={newIncludeWord} onChange={(e) => setNewIncludeWord(e.target.value)} placeholder="예: 법, 조, 항" className="w-full bg-white/5 border border-white/20 p-2 text-white rounded text-xs outline-none" />
                <button onClick={handleAddIncludeWord} className="mt-2 px-3 py-1 bg-green-500/20 text-green-400 text-xs rounded hover:bg-green-500/30">추가</button>
                <div className="mt-2 flex flex-wrap gap-1">
                  {customIncludeWords.map(w => (
                    <span key={w} className="bg-green-900/30 text-green-300 px-2 py-1 rounded text-xs flex items-center gap-1">
                      {w} <button onClick={() => handleRemoveIncludeWord(w)} className="text-green-400 hover:text-green-300">×</button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <button onClick={() => setShowStopWordsSettings(false)} className="mt-4 w-full px-4 py-2 bg-white/10 text-white rounded hover:bg-white/20">닫기</button>
          </div>
        </div>
      )}

      {/* 📂 폴더 및 조항 렌더링 */}
      {/* 🔴 개선사항 4: 장별 폴더를 시각적으로 구분 */}
      <div className="space-y-3">
        {craftFolders.length === 0 && (
          <div className="text-center py-8 text-white/40 text-xs">
            📁 위에서 HTML 파일을 업로드하면 폴더가 자동 생성됩니다.
          </div>
        )}

        {craftFolders.map((folder: string) => {
          const folderInfo = classifyFolder(folder);
          const isFolderOpen = openFolders[folder] !== false;
          const folderItems = safeCategories.filter((c:any) => c.folder_name === folder).sort((a:any, b:any) => a.id - b.id);
          
          return (
            <div key={folder} className={`border rounded-lg transition-all ${
              folderInfo.isChapter 
                ? 'border-blue-500/50 bg-blue-950/20' 
                : 'border-white/20 bg-white/5'
            }`}>
              {/* 폴더 헤더 */}
              <button
                onClick={() => handleToggleFolder(folder)}
                className="w-full px-4 py-3 sm:py-4 flex items-center gap-2 hover:bg-white/5 transition-colors"
              >
                <span className="text-lg">{isFolderOpen ? '📂' : '📁'}</span>
                <span className={`flex-1 text-left font-bold text-sm sm:text-base ${
                  folderInfo.isChapter ? 'text-blue-300' : 'text-white/80'
                }`}>
                  {folderInfo.displayName}
                </span>
                <span className={`text-xs sm:text-sm px-2 py-1 rounded ${
                  folderInfo.isChapter
                    ? 'bg-blue-500/20 text-blue-300'
                    : 'bg-white/10 text-white/60'
                }`}>
                  {folderItems.length}개
                </span>
              </button>

              {/* 폴더 내용 */}
              {isFolderOpen && (
                <div className={`border-t border-white/10 p-4 space-y-2 ${
                  getGridClass(colCount)
                } grid`}>
                  {folderItems.map((cat: any) => {
                    const contentToUse = cat.content || "";
                    const isExpanded = expandedId === cat.id;
                    const isChecked = checkedIds.has(cat.id);
                    let colClass = `col-span-1`;
                    let titleColor = "text-white/70";

                    const checkText = contentToUse.substring(0, 50);
                    if (checkText.includes('[법]')) titleColor = "text-red-400";
                    else if (checkText.includes('[령]')) titleColor = "text-blue-400";
                    else if (checkText.includes('[칙]') || checkText.includes('[규]')) titleColor = "text-green-500";
                    
                    if (isExpanded) colClass = "col-span-full";
                    const cleanTitle = getStrictTitleOnly(contentToUse);

                    return (
                      <div key={cat.id} className={`relative transition-all w-full ${colClass}`}>
                        {!isExpanded ? (
                          <div className="relative group/card w-full flex items-center gap-2">
                            {isSelectMode && (
                              <input 
                                type="checkbox" 
                                checked={isChecked}
                                onChange={() => handleToggleCheck(cat.id)}
                                className="w-4 h-4 rounded border-white/20 bg-black accent-amber-500 cursor-pointer shrink-0 transition-all"
                              />
                            )}

                            <button 
                              {...createLongPressHandlers(cat.id)}
                              onClick={() => openCategory(cat)} 
                              className={`flex-1 min-h-[60px] p-3 sm:p-4 bg-indigo-900/20 border rounded-sm transition-colors hover:bg-indigo-900/40 flex flex-col gap-1.5 sm:gap-2 text-left relative pr-10 ${isChecked ? 'border-amber-500/50 bg-amber-950/10' : 'border-indigo-500/30'}`}
                            >
                              <span className={`${titleColor} font-bold text-[11px] sm:text-[13px] leading-snug break-keep`}>{cleanTitle}</span>
                              {cat.memo && <div className="text-[9px] sm:text-[11px] text-teal-300 bg-teal-900/20 p-1.5 sm:p-2 rounded border border-teal-500/20 w-full truncate">{cat.memo}</div>}
                              
                              {!isSelectMode && (
                                <span
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (confirm(`'${cleanTitle}' 조항을 대기열에서 즉시 삭제하시겠습니까?`)) {
                                      await handleDeleteCategory(cat.id);
                                    }
                                  }}
                                  className="absolute top-1/2 -translate-y-1/2 right-3 w-5 h-5 flex items-center justify-center border border-white/10 text-white/30 hover:text-red-400 hover:border-red-500/30 rounded-full text-[10px] bg-black/40 md:opacity-0 group-hover/card:opacity-100 transition-all duration-150 cursor-pointer"
                                  title="즉시 삭제"
                                >
                                  ✕
                                </span>
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="w-full p-4 sm:p-6 bg-[#0a0a0c] border border-indigo-500/50 rounded-sm space-y-3 shadow-xl z-20 relative animate-in zoom-in-95">
                            <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <span className={`${titleColor} font-bold text-[12px] sm:text-[14px] cursor-pointer`} onClick={() => setExpandedId(null)}>{cleanTitle}</span>
                                <button 
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const newFolder = prompt("이동시킬 폴더명:", cat.folder_name);
                                    if (newFolder && newFolder.trim() !== "" && newFolder !== cat.folder_name) {
                                      try { await api.updateCategoryFolder(safeAddress, cat.id, newFolder.trim()); window.location.reload(); } catch (err) {}
                                    }
                                  }}
                                  className="px-2 py-0.5 bg-white/5 border border-white/20 rounded-sm text-[9px] text-white/50 hover:bg-white/10 transition-colors"
                                >📂 폴더 이동</button>
                              </div>
                              
                              <div className="flex gap-2">
                                <button 
                                  onClick={handleEditToggle} 
                                  className={`px-3 py-1 text-[11px] font-bold rounded-sm border transition-all ${isEditingText ? 'bg-green-600 border-green-500 text-white shadow-[0_0_10px_rgba(34,197,94,0.3)]' : 'bg-white/5 border-white/20 text-white/50 hover:bg-white/10'}`}
                                >
                                  {isEditingText ? '✅ 텍스트 적용' : '✏️ 원본 텍스트 편집'}
                                </button>

                                {!isEditingText && (
                                  <button onClick={() => setIsEraserMode(!isEraserMode)} className={`px-3 py-1 text-[11px] font-bold rounded-sm border transition-all ${isEraserMode ? 'bg-red-600 border-red-500 text-white animate-pulse' : 'bg-white/5 border-white/20 text-white/50 hover:bg-white/10'}`}>
                                    {isEraserMode ? '🗑️ 지우개 켜짐' : '🧹 지우개 모드'}
                                  </button>
                                )}
                              </div>
                            </div>

                            <input type="text" value={memoInput} onChange={(e) => setMemoInput(e.target.value)} placeholder="암기 메모 입력..." className="w-full bg-black/50 border border-teal-500/30 p-2 text-xs text-teal-200 outline-none rounded-sm" />
                            
                            {isEditingText ? (
                              <div className="w-full relative mt-2 animate-in fade-in zoom-in-95">
                                <textarea
                                  value={editingContent}
                                  onChange={(e) => setEditingContent(e.target.value)}
                                  className="w-full h-48 bg-black border border-green-500/50 p-4 text-green-100 text-[13px] sm:text-[15px] leading-loose rounded outline-none resize-y custom-scrollbar"
                                  placeholder="원하는 대로 내용을 지우거나 띄어쓰기를 수정하세요..."
                                />
                                <div className="absolute top-2 right-2 text-[10px] text-green-400 bg-black/50 px-2 py-1 rounded">수정 후 [✅ 텍스트 적용] 버튼 클릭</div>
                              </div>
                            ) : (
                              <div className={`font-serif mt-2 text-[13px] sm:text-[15px] leading-loose text-white/80 p-4 bg-black/40 border max-h-72 overflow-y-auto rounded select-none touch-manipulation whitespace-pre-wrap break-keep custom-scrollbar relative transition-all ${isEraserMode ? 'border-red-500/50 ring-1 ring-red-500/30' : 'border-white/10'}`}>
                                {wordArray.map((wordObj, idx) => {
                                  const word = wordObj.text;
                                  const isSymbolOnly = !/[a-zA-Z0-9가-힣]/.test(word) && word.trim() !== "";
                                  const isMerged = wordObj.subWords.length > 1;
                                  const isSelected = selectedWords.has(idx);

                                  return (
                                    <React.Fragment key={idx}>
                                      {pageBreaks.has(idx) && <div className="w-full border-t border-red-500/50 my-2 relative"><span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-black px-1 text-[8px] text-red-400 font-bold uppercase tracking-tighter">Page Break</span></div>}
                                      <span 
                                        onClick={() => { if (isEraserMode || !isSymbolOnly) handleWordClick(idx); }} 
                                        onContextMenu={(e) => handleWordSplit(idx, e)} 
                                        onDoubleClick={() => { if (!isSymbolOnly || isMerged) handleWordMerge(idx); }} 
                                        className={`px-[1px] rounded transition-colors ${
                                          isSelected ? 'bg-amber-500 text-black font-bold cursor-pointer' : 
                                          isEraserMode ? 'hover:bg-red-500/50 hover:text-white text-red-100 cursor-pointer' : 
                                          isSymbolOnly ? 'text-white/30 cursor-default' : 
                                          isMerged ? 'bg-indigo-900/30 border-b border-indigo-500/50 hover:bg-indigo-800/40 cursor-pointer' : 
                                          'hover:bg-white/10 cursor-pointer'
                                        }`}
                                        title={isSelected ? "클릭하여 빈칸에서 해제" : "클릭하여 빈칸으로 지정"}
                                      >
                                        {word}
                                      </span>
                                    </React.Fragment>
                                  );
                                })}
                              </div>
                            )}
                            
                            <button 
                              disabled={isEditingText}
                              onClick={() => {
                                const folderCats = safeCategories.filter((c:any) => c.folder_name === cat.folder_name).sort((a:any, b:any) => a.id - b.id);
                                const currentIdx = folderCats.findIndex(c => c.id === cat.id);
                                const nextCat = folderCats[currentIdx + 1];
                                
                                handleMakeBlankCard(cat, wordArray.map(w => w.text), selectedWords, pageBreaks, memoInput, () => {
                                    if (nextCat) openCategory(nextCat);
                                    else setExpandedId(null);
                                });
                              }} 
                              className={`w-full py-2.5 text-xs sm:text-sm font-bold rounded-sm mt-2 transition-all ${isEditingText ? 'bg-white/5 text-white/30 border border-white/10 cursor-not-allowed' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'}`}
                            >
                              {isEditingText ? '텍스트 적용 후에 저장할 수 있습니다' : '지식 추출 저장 및 다음 조항 이어서 만들기'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                })}
                {isSelectMode && checkedIds.size > 0 && (
                  <button 
                    onClick={handleBatchDelete}
                    className="col-span-full px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded hover:bg-red-500/30 text-sm font-bold"
                  >
                    🗑️ 선택한 {checkedIds.size}개 삭제
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
