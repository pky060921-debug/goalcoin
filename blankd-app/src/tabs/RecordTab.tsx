import React, { useState, useEffect, useMemo } from 'react';

// 💡 기록 데이터 추출 유틸리티
const getExtendedStats = (memoStr: string) => {
  try {
    if (memoStr && memoStr.trim().startsWith('{')) {
      const p = JSON.parse(memoStr || '{}');
      return {
        text: p.text || "", filled: p.filled || 0, wrongIndices: p.wrongIndices || [],
        upgrade: p.upgrade || 0, bestTime: p.bestTime || 0, totalCorrect: p.totalCorrect || 0, totalWrong: p.totalWrong || 0,
        history: p.history || [] 
      };
    }
  } catch(e) {}
  return { text: "", filled: 0, wrongIndices: [], upgrade: 0, bestTime: 0, totalCorrect: 0, totalWrong: 0, history: [] };
};

// 💡 [신규] 오답노트 전용 미니 빈칸 입력기
const MiniInput = ({ expected, onSolve, abbrs }: any) => {
  const [val, setVal] = useState('');
  const [status, setStatus] = useState<'idle'|'correct'|'wrong'>('idle');

  const validAnswers = useMemo(() => {
      const expectedClean = expected.replace(/\s+/g, '').toLowerCase();
      const answers = [expectedClean];
      if (abbrs) {
          Object.entries(abbrs).forEach(([k, v]) => {
              const strK = k.replace(/\s+/g, '').toLowerCase();
              const strV = (v as string).replace(/\s+/g, '').toLowerCase();
              const orig = strK.length >= strV.length ? strK : strV;
              const short = strK.length < strV.length ? strK : strV;
              if (expectedClean === orig) answers.push(short);
          });
      }
      return answers;
  }, [expected, abbrs]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (status !== 'idle') return;
      const v = e.target.value;
      setVal(v);
      const cleanInput = v.replace(/\s+/g, '').toLowerCase();
      if (validAnswers.includes(cleanInput)) {
          setStatus('correct');
          setTimeout(onSolve, 150);
      }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (status !== 'idle') return;
      if (e.key === 'Enter') {
          e.preventDefault();
          if (!validAnswers.includes(val.replace(/\s+/g, '').toLowerCase())) {
              setStatus('wrong');
              setTimeout(() => {
                  setVal('');
                  setStatus('idle');
              }, 800); // 0.8초간 정답(힌트) 노출 후 리셋
          }
      }
  };

  return (
      <input
          value={status === 'wrong' ? expected : status === 'correct' ? expected : val}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          readOnly={status !== 'idle'}
          placeholder="?"
          className={`inline-block mx-1 px-1.5 py-0.5 text-center font-bold border-b-2 outline-none transition-all w-[4.5em] shadow-inner ${
              status === 'correct' ? 'bg-teal-900/40 text-teal-300 border-teal-500' : 
              status === 'wrong' ? 'bg-red-900/60 text-red-200 border-red-500 placeholder-red-300/50' :
              'bg-black/60 text-amber-300 border-amber-500/50 focus:border-amber-400 placeholder-white/20'
          }`}
      />
  );
};

// 💡 [신규] 오답 문장 렌더링 및 상태 관리 컴포넌트
const ReviewSentence = ({ sentence, wrongWords, globalDict }: any) => {
  const [solvedIndices, setSolvedIndices] = useState<Set<number>>(new Set());
  const parts = sentence.split(/(\[.*?\])/g);

  return (
      <div className="bg-black/60 text-white/80 border-l-2 border-red-500/50 p-3 rounded-r-sm text-[12px] sm:text-[13px] leading-relaxed font-serif break-keep my-2 shadow-sm">
          {parts.map((part: string, j: number) => {
              if (part.startsWith('[') && part.endsWith(']')) {
                  const inner = part.replace(/\[|\]/g, '').trim();
                  // 이 빈칸이 내가 과거에 틀렸던 단어인지 확인
                  const isWrongWord = wrongWords.some((w: string) => w.replace(/\s+/g, '') === inner.replace(/\s+/g, ''));
                  
                  if (isWrongWord) {
                      if (solvedIndices.has(j)) {
                          return (
                              <span key={j} className="text-teal-200 font-bold bg-teal-900/60 px-1.5 py-0.5 mx-1 rounded-sm border border-teal-500/50 shadow-sm transition-all duration-300 animate-in zoom-in">
                                  {inner}
                              </span>
                          );
                      } else {
                          // 아직 안 푼 오답 빈칸은 입력창으로 표시
                          return (
                              <MiniInput 
                                  key={j} 
                                  expected={inner} 
                                  abbrs={globalDict.abbrs} 
                                  onSolve={() => {
                                      const next = new Set(solvedIndices);
                                      next.add(j);
                                      setSolvedIndices(next);
                                  }} 
                              />
                          );
                      }
                  } else {
                      // 내가 틀리지 않았던 다른 빈칸들은 문맥 파악을 위해 그냥 텍스트로 고정 표시
                      return <span key={j} className="text-white/50 font-bold mx-1 bg-white/5 px-1 rounded-sm">{inner}</span>;
                  }
              }
              return <span key={j}>{part}</span>;
          })}
      </div>
  );
};

export const RecordTab = ({ savedCards, goalBalance, handleUpdateBalance, loadAllData, safeAddress }: any) => {
  const [expandedId, setExpandedId] = useState<string | number | null>(null);
  const [localCards, setLocalCards] = useState<any[]>([]);
  const [globalDict, setGlobalDict] = useState<{ abbrs: Record<string, string> }>({ abbrs: {} });

  useEffect(() => { setLocalCards(Array.isArray(savedCards) ? savedCards : []); }, [savedCards]);

  // 스마트 약어 채점 지원을 위해 전역 사전 불러오기
  useEffect(() => {
      if (safeAddress) {
          try {
              const dict = JSON.parse(localStorage.getItem(`blankd_off_dict_${safeAddress}`) || '{"abbrs":{}}');
              setGlobalDict(dict);
          } catch(e) {}
      }
  }, [safeAddress]);

  const renderExpandableWrongCard = (card: any, wrongWords: string[]) => {
    const isExpanded = expandedId === card.id;
    const lines = card.content.split('\n');
    const title = lines[0].replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim() || '제목 없음';

    const bodyText = lines.slice(1).join(' '); 
    const bodySentences = bodyText
      .replace(/([.!?])\s+/g, "$1|SPLIT|") 
      .split("|SPLIT|") 
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const wrongSentences = new Set<string>();
    
    wrongWords.forEach(ww => {
        const cleanWw = ww.replace(/\s+/g, '');
        bodySentences.forEach(line => {
            const blanksInLine = line.match(/\[(.*?)\]/g) || [];
            const hasMatch = blanksInLine.some(b => b.replace(/\[|\]|\s+/g, '') === cleanWw);
            if (hasMatch) {
                wrongSentences.add(line);
            }
        });
    });

    const sentencesArr = Array.from(wrongSentences);

    return (
      <div key={card.id} className="relative w-full perspective-1000 mb-2">
        <div 
          onClick={() => setExpandedId(isExpanded ? null : card.id)}
          className="w-full text-left p-3 sm:p-4 rounded-sm transition-all duration-300 shadow-md border cursor-pointer flex flex-col justify-between items-start gap-2 bg-red-950/20 border-red-500/30 hover:bg-red-900/30"
        >
          <div className="flex justify-between items-center w-full gap-2">
             <div className="font-bold text-[11px] sm:text-[13px] tracking-tight leading-snug line-clamp-2 text-red-100">
                {title}
             </div>
             <span className="shrink-0 bg-red-600 text-white text-[9px] sm:text-[10px] px-2 py-1 rounded-sm font-bold shadow-[0_0_10px_rgba(220,38,38,0.5)]">🚨 오답 발견</span>
          </div>
          
          <div className="flex flex-wrap gap-1 mt-2 w-full">
             <span className="text-[10px] text-red-400 font-bold w-full mb-0.5">내가 틀렸던 빈칸 단어:</span>
             {wrongWords.map(w => (
                <span key={w} className="bg-red-900/50 text-red-200 border border-red-500/40 px-2 py-0.5 rounded-sm text-[10px] font-bold">
                   {w}
                </span>
             ))}
          </div>
        </div>

        {isExpanded && (
          <div className="w-full bg-[#0a0a0c] border border-red-500/30 p-4 mt-1 rounded-sm animate-in slide-in-from-top-2 shadow-inner">
             <div className="flex flex-col gap-1 w-full">
               <div className="flex justify-between items-center border-b border-red-500/20 pb-2 mb-2">
                 <span className="text-[10px] text-red-400 font-bold tracking-widest">📝 직접 타이핑하여 빈칸을 다시 풀어보세요. (엔터: 정답 힌트)</span>
               </div>
               
               {sentencesArr.length > 0 ? sentencesArr.map((sentence, i) => (
                  <ReviewSentence key={i} sentence={sentence} wrongWords={wrongWords} globalDict={globalDict} />
               )) : (
                  <div className="text-white/40 text-[10px] py-2">오답 문장을 찾을 수 없습니다.</div>
               )}
             </div>
          </div>
        )}
      </div>
    );
  };

  const getFoldersWithMistakes = () => {
    const wrongFolders = new Set<string>();
    localCards.forEach(c => {
      const stats = getExtendedStats(c.memo);
      const allWrongWords = new Set(stats.history.flatMap((h: any) => h.wrongWords || []));
      if (allWrongWords.size > 0 && c.folder_name) {
        wrongFolders.add(c.folder_name);
      }
    });
    return Array.from(wrongFolders).sort();
  };

  const enhanceFolders = getFoldersWithMistakes();

  return (
    <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in pb-24 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-red-500/30 pb-4 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif text-red-400 tracking-tight mb-2">나의 취약점 (오답노트)</h1>
          <p className="text-[11px] sm:text-xs text-red-200/60 leading-relaxed">
            한 번이라도 <span className="text-red-400 font-bold">오답을 입력했거나 스킵한 빈칸</span>이 포함된 조항의 문장들을 복습합니다.
          </p>
        </div>
      </div>

      {enhanceFolders.length === 0 ? (
        <div className="text-center py-20 text-teal-400/50 text-sm font-serif flex flex-col items-center gap-2">
           <span className="text-3xl mb-2">🎉</span>
           <span>현재 틀린 문제가 하나도 없습니다! 완벽합니다.</span>
        </div>
      ) : (
        <div className="space-y-6 sm:space-y-8 w-full">
          {enhanceFolders.map((folder: string) => {
            const folderCards = localCards.filter(c => {
               if (c.folder_name !== folder) return false;
               const stats = getExtendedStats(c.memo);
               const allWrongWords = new Set(stats.history.flatMap((h: any) => h.wrongWords || []));
               return allWrongWords.size > 0;
            }).sort((a,b) => parseInt(a.id, 10) - parseInt(b.id, 10));
            
            if (folderCards.length === 0) return null;
            
            const col1Cards = folderCards.filter((c:any) => { const f = c.content.split('\n')[0]||""; return !f.includes('[령]') && !f.includes('[칙]') && !f.includes('[규]') && !f.includes('[규정]'); });
            const col2Cards = folderCards.filter((c:any) => { const f = c.content.split('\n')[0]||""; return f.includes('[령]'); });
            const col3Cards = folderCards.filter((c:any) => { const f = c.content.split('\n')[0]||""; return f.includes('[칙]') || f.includes('[규]') || f.includes('[규정]'); });

            return (
              <div key={folder} className="mb-10 sm:mb-12 border-l-2 border-red-500/30 pl-2 sm:pl-4 bg-red-950/5 p-4 rounded-r-md">
                <div className="text-sm sm:text-base text-red-300 mb-4 border-b border-red-500/20 pb-2 font-bold tracking-widest">{folder}</div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 items-start w-full">
                  <div className="flex flex-col gap-2.5 w-full">
                    <div className="text-xs text-white/50 font-bold mb-1 text-center tracking-widest border-b border-white/5 pb-2">법 / 정관</div>
                    {col1Cards.map(c => {
                       const stats = getExtendedStats(c.memo);
                       const wWords = Array.from(new Set(stats.history.flatMap((h: any) => h.wrongWords || [])));
                       return renderExpandableWrongCard(c, wWords as string[]);
                    })}
                  </div>
                  <div className="flex flex-col gap-2.5 w-full">
                    <div className="text-xs text-white/50 font-bold mb-1 text-center tracking-widest border-b border-white/5 pb-2">시행령</div>
                    {col2Cards.map(c => {
                       const stats = getExtendedStats(c.memo);
                       const wWords = Array.from(new Set(stats.history.flatMap((h: any) => h.wrongWords || [])));
                       return renderExpandableWrongCard(c, wWords as string[]);
                    })}
                  </div>
                  <div className="flex flex-col gap-2.5 w-full">
                    <div className="text-xs text-white/50 font-bold mb-1 text-center tracking-widest border-b border-white/5 pb-2">시행규칙</div>
                    {col3Cards.map(c => {
                       const stats = getExtendedStats(c.memo);
                       const wWords = Array.from(new Set(stats.history.flatMap((h: any) => h.wrongWords || [])));
                       return renderExpandableWrongCard(c, wWords as string[]);
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
