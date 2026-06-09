import React, { useState, useEffect } from 'react';
import { SPLIT_REGEX } from '../utils/constants';

const getGridClass = (cols: number) => {
  if (cols === 1) return "md:grid-cols-1";
  if (cols === 2) return "md:grid-cols-2";
  if (cols === 3) return "md:grid-cols-3";
  if (cols === 4) return "md:grid-cols-4";
  if (cols === 5) return "md:grid-cols-5";
  return "md:grid-cols-3";
};

const sortChapters = (folders: string[]): string[] => {
  return folders.sort((a, b) => {
    const matchA = a.match(/^제\s*(\d+)\s*장/);
    const matchB = b.match(/^제\s*(\d+)\s*장/);
    if (matchA && matchB) return parseInt(matchA[1]) - parseInt(matchB[1]);
    if (matchA) return -1;
    if (matchB) return 1;
    return a.localeCompare(b, 'ko');
  });
};

type WordItem = { text: string; subWords: string[]; };

export const CraftTab = ({ categories, savedCards, colCount, viewMode, safeAddress, setCategories, setExpandedId, expandedId, setSavedCards }: any) => {
  const safeCategories = Array.isArray(categories) ? categories : [];
  const safeCards = Array.isArray(savedCards) ? savedCards : [];

  const folders = Array.from(new Set(safeCategories.map((c: any) => c.folder_name))).filter(f => f).sort() as string[];
  const sortedFolders = sortChapters(folders);

  const [wordArray, setWordArray] = useState<WordItem[]>([]);
  const [selectedWords, setSelectedWords] = useState<number[]>([]);
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);
  const [memoInput, setMemoInput] = useState('');
  
  // 💡 [신규 추가] 원본 소스 직접 편집을 위한 상태 엔진 (EnhanceTab 양식 이식)
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editArticleText, setEditArticleText] = useState('');

  useEffect(() => {
    if (expandedId) {
      try {
        const cat = safeCategories.find((c: any) => c.id === expandedId);
        if (cat) {
          console.log("[Craft 진단] 아코디언 토글 파싱 시작. ID:", expandedId);
          const textToParse = cat.article_text || "";
          
          const rawTokens = textToParse.split(SPLIT_REGEX).filter((t: string) => t !== undefined);
          const processed: WordItem[] = [];
          rawTokens.forEach((token: string) => {
            if (!token) return;
            if (/\s+/.test(token)) {
              processed.push({ text: token, subWords: [] });
            } else {
              const sub = token.split(/([,.:;()\[\]{}""''])/).filter(Boolean);
              if (sub.length > 1) {
                sub.forEach(s => processed.push({ text: s, subWords: [] }));
              } else {
                processed.push({ text: token, subWords: [] });
              }
            }
          });

          setWordArray(processed);
          setSelectedWords([]);
          setPageBreaks([]);
          setMemoInput("");
          setEditArticleText(textToParse);
          setEditingCatId(null);
        }
      } catch (err) {
        console.error("[Craft 진단 오류] 토글 컴포넌트 마운트 실패:", err);
      }
    }
  }, [expandedId, categories]);

  // 💡 원본 데이터 직접 타이핑 편집 완료 및 API 서버 저장 핸들러
  const handleSaveEditedText = async (catId: number) => {
    try {
      console.log(`[Craft 진단] 원본 텍스트 직접 변경사항 서버 전송 시도. ID: ${catId}`);
      const res = await fetch(`https://api.blankd.top/api/update-category-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: safeAddress,
          id: catId,
          article_text: editArticleText
        })
      });
      if (!res.ok) throw new Error("원본 텍스트 수정 반영에 실패했습니다.");
      
      setCategories((prev: any[]) => prev.map(c => c.id === catId ? { ...c, article_text: editArticleText } : c));
      setEditingCatId(null);
      console.log("[Craft 진단] 원본 직접 편집 동기화 100% 완료");
    } catch (err) {
      console.error("[Craft 진단 오류] 원본 수정 데이터 덤프 에러:", err);
      alert("서버 연결 불안정으로 원본 텍스트 수정에 실패했습니다.");
    }
  };

  const handleMakeBlankCard = async (cat: any, tokens: string[], blankIndices: number[], breaks: number[], memoStr: string, catId: number, onSuccess?: () => void) => {
    try {
      if (blankIndices.length === 0) {
        alert("빈칸으로 지정할 형태소를 한 개 이상 마킹하세요.");
        return;
      }

      console.log("[Craft 진단] 빈칸 인지 데이터 빌드 가동");
      let formattedContent = `▶ ${cat.title}\n`;
      let currentLine = "";

      tokens.forEach((token, idx) => {
        let wordStr = token;
        if (blankIndices.includes(idx)) {
          wordStr = `[${wordStr}]`;
        }
        currentLine += wordStr;
        if (breaks.includes(idx) || token.includes('\n')) {
          formattedContent += currentLine.trim() + "\n";
          currentLine = "";
        }
      });
      if (currentLine.trim()) {
        formattedContent += currentLine.trim() + "\n";
      }

      const res = await fetch(`https://api.blankd.top/api/create-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: safeAddress,
          category_id: catId,
          card_content: formattedContent.trim(),
          answer_text: "", 
          options_json: JSON.stringify([]),
          level: 0,
          memo: memoStr || "[]"
        })
      });

      if (!res.ok) throw new Error("서버 카드 인덱싱 실패");
      const newCard = await res.json();
      
      setSavedCards((prev: any[]) => [...prev, newCard]);
      console.log("[Craft 진단] 신규 빈칸 노드 안착 완료:", newCard.id);
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error("[Craft 진단 오류] 카드 인클루전 빌드 실패:", err);
    }
  };

  const filteredCategories = safeCategories.filter((cat: any) => {
    const isCreated = safeCards.some((c: any) => c.category_id === cat.id);
    if (viewMode === 'all') return true;
    if (viewMode === 'pending') return !isCreated;
    if (viewMode === 'completed') return isCreated;
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-4 px-4 animate-in fade-in duration-300">
      <div className="text-white/40 text-xs font-mono">
        💡 대기열 조항을 선택하여 단어를 터치바인딩하고, 필요 시 원본 소스를 타이핑 편집하여 수정한 뒤 카드를 배포하세요.
      </div>

      <div className="space-y-8">
      {sortedFolders.map(folderName => {
        const folderCats = filteredCategories.filter((c: any) => c.folder_name === folderName).sort((a: any, b: any) => a.id - b.id);
        if (folderCats.length === 0) return null;

        return (
          <div key={folderName} className="space-y-3">
            <div className="text-xs font-bold text-amber-500 bg-amber-500/5 px-3 py-1.5 border border-amber-500/10 rounded-sm font-serif tracking-wide">
              {folderName}
            </div>
            <div className={`grid gap-3 ${getGridClass(colCount)}`}>
              {folderCats.map((cat: any) => {
                const isExpanded = expandedId === cat.id;
                const isAlreadyCreated = safeCards.some((c: any) => c.category_id === cat.id);

                return (
                  <div 
                    key={cat.id} 
                    className={`border rounded-sm transition-all flex flex-col justify-between ${isExpanded ? 'border-amber-500 bg-[#0c0c0e] shadow-xl md:col-span-full' : isAlreadyCreated ? 'border-white/5 bg-white/[0.02] opacity-60 hover:opacity-100' : 'border-white/10 bg-[#08080a] hover:border-white/20'}`}
                  >
                    <button 
                      onClick={() => {
                        console.log("[Craft 진단] 아코디언 토글 제어:", cat.id);
                        setExpandedId(isExpanded ? null : cat.id);
                      }}
                      className="w-full text-left p-4 flex justify-between items-start gap-2 cursor-pointer"
                    >
                      <div>
                        <div className="text-xs font-bold text-white/80 group-hover:text-white leading-tight font-serif">{cat.title}</div>
                        {!isExpanded && <p className="text-[11px] text-white/40 line-clamp-2 mt-1 leading-relaxed">{cat.article_text}</p>}
                      </div>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${isAlreadyCreated ? 'bg-indigo-950 text-indigo-400 border border-indigo-900/40' : 'bg-amber-950 text-amber-400 border border-amber-900/40'}`}>
                        {isAlreadyCreated ? "제작됨" : "대기"}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="p-4 pt-0 border-t border-white/5 bg-black/30 space-y-4 animate-in slide-in-from-top-2 duration-200">
                        
                        {/* 💡 [수정 사항] EnhanceTab과 완벽 일치시킨 직접 타이핑 편집 폼 셋업 */}
                        <div className="bg-black/40 border border-white/5 p-3 rounded-sm space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-white/40 font-mono">ORIGINAL SOURCE TEXT EDIT</span>
                            {editingCatId !== cat.id ? (
                              <button 
                                onClick={() => {
                                  setEditingCatId(cat.id);
                                  setEditArticleText(cat.article_text || "");
                                }}
                                className="px-2 py-0.5 bg-amber-900/40 text-amber-400 border border-amber-500/30 rounded font-mono text-[10px] hover:bg-amber-900/60 cursor-pointer"
                              >
                                ✏️ 원본 직접수정
                              </button>
                            ) : (
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => handleSaveEditedText(cat.id)}
                                  className="px-2 py-0.5 bg-teal-900/60 text-teal-300 border border-teal-500/50 rounded font-mono text-[10px] hover:bg-teal-900/80 cursor-pointer font-bold"
                                >
                                  💾 저장
                                </button>
                                <button 
                                  onClick={() => setEditingCatId(null)}
                                  className="px-2 py-0.5 bg-white/5 text-white/40 border border-white/10 rounded font-mono text-[10px] hover:bg-white/10 cursor-pointer"
                                >
                                  취소
                                </button>
                              </div>
                            )}
                          </div>
                          
                          {editingCatId === cat.id ? (
                            <textarea
                              value={editArticleText}
                              onChange={(e) => setEditArticleText(e.target.value)}
                              className="w-full min-h-[120px] bg-[#050507] border border-amber-500/30 text-xs text-amber-100 p-2.5 rounded focus:outline-none focus:border-amber-500 font-sans leading-relaxed"
                            />
                          ) : (
                            <div className="text-xs text-white/70 leading-relaxed font-sans whitespace-pre-wrap select-none p-1">
                              {cat.article_text}
                            </div>
                          )}
                        </div>

                        {/* 💡 [지우개 모드 완전 삭제] 퓨어 마킹 영역 구성 */}
                        {editingCatId !== cat.id && (
                          <div className="space-y-3">
                            <div className="text-[10px] text-amber-400/70 font-bold font-mono">🎯 빈칸 마킹 터치 채널</div>
                            <div className="flex flex-wrap gap-x-1.5 gap-y-2 p-3 bg-black/60 rounded-sm border border-white/5 leading-relaxed select-none">
                              {wordArray.map((word, idx) => {
                                const isSelected = selectedWords.includes(idx);
                                const isBreak = pageBreaks.includes(idx);
                                if (/\s+/.test(word.text)) {
                                  return <span key={idx} className="w-1" />;
                                }
                                return (
                                  <span key={idx} className="inline-flex items-center gap-0.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (selectedWords.includes(idx)) {
                                          setSelectedWords(prev => prev.filter(i => i !== idx));
                                        } else {
                                          setSelectedWords(prev => [...prev, idx]);
                                        }
                                      }}
                                      className={`px-1 py-0.5 rounded-sm text-xs font-medium font-sans cursor-pointer transition-all ${isSelected ? 'bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20' : 'bg-white/5 text-white/80 hover:bg-white/10 border border-white/5'}`}
                                    >
                                      {word.text}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (pageBreaks.includes(idx)) {
                                          setPageBreaks(prev => prev.filter(i => i !== idx));
                                        } else {
                                          setPageBreaks(prev => [...prev, idx]);
                                        }
                                      }}
                                      className={`text-[9px] px-0.5 font-mono opacity-30 hover:opacity-100 transition-opacity ${isBreak ? 'text-red-500 opacity-100 font-bold' : 'text-white/40'}`}
                                      title="줄바꿈 토글"
                                    >
                                      ↵
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {editingCatId !== cat.id && (
                          <div className="pt-2 border-t border-white/5 flex flex-col gap-2">
                            <input
                              type="text"
                              value={memoInput}
                              onChange={(e) => setMemoInput(e.target.value)}
                              placeholder="기억 연상 기법용 힌트 텍스트 입력 (선택사항)"
                              className="w-full bg-[#050507] border border-white/10 text-xs text-white/80 px-3 py-2 rounded focus:outline-none focus:border-white/20 font-sans"
                            />
                            <button 
                              onClick={() => {
                                const folderCats = safeCategories.filter((c: any) => c.folder_name === cat.folder_name).sort((a: any, b: any) => a.id - b.id);
                                const currentIdx = folderCats.findIndex(c => c.id === cat.id);
                                const nextCat = folderCats[currentIdx + 1];
                                
                                handleMakeBlankCard(cat, wordArray.map(w => w.text), selectedWords, pageBreaks, memoInput, cat.id, () => {
                                    if (nextCat) {
                                        setExpandedId(nextCat.id);
                                    } else {
                                        setExpandedId(null);
                                    }
                                });
                              }} 
                              className="w-full py-2.5 text-xs sm:text-sm font-bold rounded-sm mt-1 transition-all bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 cursor-pointer"
                            >
                              ✨ 빈칸 카드 완성 및 보관 배포
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      </div> 
    </div>
  );
};
