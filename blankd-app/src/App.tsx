import React, { useState, useEffect, Component, ReactNode, useRef } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { api } from "./services/api";
import { SPLIT_REGEX, formatCardText, parseCardStats, stringifyCardStats, getStrictTitleOnly } from "./utils/constants";
import { CardModal } from "./components/CardModal";
import { DashboardTab } from "./tabs/DashboardTab";
import { CraftTab } from "./tabs/CraftTab";
import { EnhanceTab } from "./tabs/EnhanceTab";
import { ExamTab } from "./tabs/ExamTab";
import { MypageTab } from "./tabs/MypageTab";

class ErrorBoundary extends Component<{children: ReactNode, fallbackLog: (msg: string) => void}, {hasError: boolean, errorMessage: string}> {
  constructor(props: any) { 
    super(props);
    this.state = { hasError: false, errorMessage: "" }; 
  }
  static getDerivedStateFromError(error: any) { 
    return { hasError: true, errorMessage: error.message };
  }
  componentDidCatch(error: any, errorInfo: any) { 
    this.props.fallbackLog(`❌ 런타임 에러: ${error.message}`);
  }
  render() {
    if (this.state.hasError) return (
      <div className="p-4 bg-red-900/20 border border-red-500 rounded text-red-200">
        치명적 오류 발생: {this.state.errorMessage} <br/><button onClick={() => window.location.reload()} className="mt-2 px-3 py-1 bg-red-500 text-white rounded">새로고침</button>
      </div>
    );
    return this.props.children;
  }
}

export default function App() {
  const account = useCurrentAccount();
  const enokiFlow = useEnokiFlow();
  const { zkLoginSession } = useZkLogin();

  const safeAddress = account?.address || zkLoginSession?.address || "";
  
  const [activeTab, setActiveTab] = useState("dashboard");
  const [categories, setCategories] = useState<any[]>([]);
  const [savedCards, setSavedCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'all' | 'one'>('all');
  const [colCount, setColCount] = useState<number>(3);
  const [useAiRecommend, setUseAiRecommend] = useState(true);
  const [lawFile, setLawFile] = useState<File | null>(null);
  
  const [activeCard, setActiveCard] = useState<any>(null);
  const [answerInput, setAnswerInput] = useState("");
  const [inputStatus, setInputStatus] = useState<'idle'|'correct'|'wrong'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [timerActive, setTimerActive] = useState(false);

  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  
  const [totalTimeLimit, setTotalTimeLimit] = useState(60); 
  const statsRef = useRef({ text: "", filled: 0, wrongIndices: new Set<number>() });
  const [isMemoOpen, setIsMemoOpen] = useState(false);

  const addLog = (msg: string) => setLogs(p => [...p.slice(-4), msg]);

  useEffect(() => {
    const savedLimit = localStorage.getItem('blankd_time_limit');
    if (savedLimit) setTotalTimeLimit(parseInt(savedLimit, 10));
  }, []);

  const handleSetTimeLimit = (val: number) => {
    setTotalTimeLimit(val);
    localStorage.setItem('blankd_time_limit', val.toString());
  };

  const loadAllData = async () => {
    if (!safeAddress) return;
    setLoading(true);
    addLog("⏳ 데이터 동기화 중...");
    try {
      const [catData, cardData] = await Promise.all([
        api.getCategories(safeAddress),
        api.getMyCards(safeAddress)
      ]);
      setCategories(catData.categories || []);
      setSavedCards(cardData.cards || []);
      addLog("✅ 데이터 동기화 완료.");
    } catch (e: any) {
      addLog(`❌ 동기화 실패: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (safeAddress) {
      addLog("🟢 지갑/구글 로그인 성공.");
      loadAllData();
    } else {
      setCategories([]);
      setSavedCards([]);
    }
  }, [safeAddress]);

  const uploadLaw = async () => {
    if (!lawFile || !safeAddress) return alert("파일을 선택하세요.");
    setLoading(true);
    addLog(`📤 법령 파일 전송 중... (${lawFile.name})`);
    try {
      await api.uploadExamCoop(lawFile, safeAddress);
      addLog("✅ 법령 파일 처리 완료. 백엔드에서 조항별로 분리하여 카테고리에 저장했습니다.");
      setLawFile(null);
      await loadAllData();
    } catch (e: any) {
      addLog(`❌ 업로드 실패: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCategory = async (id: number) => {
    setLoading(true);
    addLog("🗑️ 카테고리 삭제 중...");
    try {
      const res = await fetch("https://api.blankd.top/api/delete-category", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: safeAddress, id })
      });
      if (!res.ok) throw new Error("삭제 실패");
      addLog("✅ 카테고리 삭제 완료.");
      await loadAllData();
    } catch (e: any) {
      addLog(`❌ 삭제 실패: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCard = async (id: number) => {
    if (!window.confirm("카드를 삭제하시겠습니까?")) return;
    setLoading(true);
    addLog("🗑️ 카드 삭제 중...");
    try {
      await api.deleteCard(safeAddress, id);
      addLog("✅ 카드 삭제 완료.");
      await loadAllData();
    } catch (e: any) {
      addLog(`❌ 삭제 실패: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMakeBlankCard = async (
    category: any, 
    words: string[], 
    selectedIndices: Set<number>, 
    pageBreaks: Set<number>, 
    memoInput: string,
    onSuccess?: () => void 
  ) => {
    if (selectedIndices.size === 0) return alert("빈칸으로 만들 단어를 하나 이상 선택하세요.");
    
    const existingCard = savedCards.find((c: any) => {
      const match = c.content.match(/\[\[ORIG_ID:(\d+)\]\]/);
      return match && parseInt(match[1]) === category.id;
    });

    setLoading(true);
    addLog(`✨ '${getStrictTitleOnly(category.title)}' 카드 생성/덮어쓰기 진행 중...`);
    try {
      if (existingCard) {
         await api.deleteCard(safeAddress, existingCard.id);
      }

      let content = "";
      words.forEach((w, i) => {
        if (pageBreaks.has(i)) content += "\n\n##PAGE_BREAK##\n\n";
        content += selectedIndices.has(i) ? `[${w}]` : w;
      });
      content += `\n\n[[ORIG_ID:${category.id}]]`;

      const memoData = stringifyCardStats(memoInput, 0, []);

      const res = await fetch("https://api.blankd.top/api/save-card", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: safeAddress,
          title: getStrictTitleOnly(category.title),
          content: content,
          memo: memoData,
          folder_name: category.folder_name || '기본 폴더'
        })
      });
      if (!res.ok) throw new Error("저장 실패");
      
      addLog(`✅ 카드 생성 완료! (빈칸 ${selectedIndices.size}개)`);
      await loadAllData();

      if (onSuccess) onSuccess(); 
      
    } catch (e: any) {
      addLog(`❌ 생성 실패: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let timer: any;
    if (timerActive) {
      timer = setInterval(() => {
        setElapsed(prev => {
          if (prev >= totalTimeLimit && totalTimeLimit > 0) {
            handleTimeOver();
            return totalTimeLimit;
          }
          return prev + 0.1;
        });
      }, 100);
    }
    return () => clearInterval(timer);
  }, [timerActive, totalTimeLimit]);

  const handleTimeOver = () => {
    setTimerActive(false);
    if (!activeCard) return;
    
    const cleanContent = activeCard.content.replace(/\n\n\[\[ORIG_ID:\d+\]\]/g, '');
    const { body } = formatCardText(cleanContent);
    const parts = body.split(/(\[.*?\]|##PAGE_BREAK##)/g).filter(p => p !== '');
    let blankIndex = -1;
    let foundCurrent = false;

    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith('[') && parts[i].endsWith(']')) {
        blankIndex++;
        if (blankIndex === currentBlankIndex) {
          setInputStatus('wrong');
          statsRef.current.wrongIndices.add(blankIndex);
          setTimeout(() => {
            setInputStatus('idle');
            setAnswerInput("");
            setCurrentBlankIndex(prev => prev + 1);
            setTimerActive(true);
          }, 800);
          foundCurrent = true;
          break;
        }
      }
    }

    if (!foundCurrent) {
      handleCompleteCard();
    }
  };

  const handleCompleteCard = () => {
    setTimerActive(false);
    statsRef.current.filled += 1;
    
    if (activeCard) {
      handleUpdateMemoBackground(activeCard.id, stringifyCardStats(statsRef.current.text, statsRef.current.filled, Array.from(statsRef.current.wrongIndices)));
    }
    setTimeout(() => {
      setActiveCard(null);
      setCurrentBlankIndex(0);
      setAnswerInput("");
      setElapsed(0);
      setIsMemoOpen(false);
      
      const el = document.getElementById("answer-input");
      if (el) el.blur();
      
      if (isListening && recognitionRef.current) {
        recognitionRef.current.stop();
        setIsListening(false);
      }
    }, 1500);
  };

  const handleUpdateMemoBackground = async (cardId: number, newMemo: string) => {
    try {
      await fetch("https://api.blankd.top/api/update-card", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: safeAddress, id: cardId, memo: newMemo })
      });
      loadAllData();
    } catch(e) {}
  };

  const [currentBlankIndex, setCurrentBlankIndex] = useState(0);

  useEffect(() => {
    if (activeCard) {
      setTimerActive(true);
      setElapsed(0);
      setCurrentBlankIndex(0);
      setAnswerInput("");
      setIsMemoOpen(false);
      
      const initialStats = parseCardStats(activeCard.memo);
      statsRef.current = { text: initialStats.text, filled: initialStats.filled, wrongIndices: new Set() };
    } else {
      setTimerActive(false);
      if (isListening && recognitionRef.current) {
        recognitionRef.current.stop();
        setIsListening(false);
      }
    }
  }, [activeCard]);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const sr = new (window as any).webkitSpeechRecognition();
      sr.continuous = true;
      sr.interimResults = true;
      sr.lang = 'ko-KR';

      sr.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const currentText = finalTranscript || interimTranscript;
        
        if (currentText.trim()) {
           const cleanedText = currentText.replace(/\s+/g, '').replace(/[.,!?]/g, '');
           setAnswerInput(cleanedText);
           
           if (event.results[event.results.length -1].isFinal) {
              handleSequentialInput(cleanedText);
              setAnswerInput("");
           }
        }
      };

      sr.onerror = (event: any) => {
        console.error("음성 인식 오류:", event.error);
        if (event.error === 'not-allowed') {
          setIsListening(false);
          addLog("⚠️ 마이크 권한이 거부되었습니다.");
        }
      };
      
      sr.onend = () => {
         if (isListening) {
             try { sr.start(); } catch(e) {}
         }
      };

      recognitionRef.current = sr;
    }
  }, [isListening]);

  const toggleVoiceRecognition = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsListening(true);
        } catch (e) {
          console.error(e);
        }
      } else {
        alert("이 브라우저에서는 음성 인식을 지원하지 않습니다.");
      }
    }
  };

  const handleSequentialInput = (overrideInput?: string | any) => {
    let inputVal = typeof overrideInput === 'string' ? overrideInput : answerInput;
    if (!inputVal.trim() && !overrideInput) return;
    
    if (!activeCard) return;

    const cleanContent = activeCard.content.replace(/\n\n\[\[ORIG_ID:\d+\]\]/g, '');
    const { body } = formatCardText(cleanContent);
    const parts = body.split(/(\[.*?\]|##PAGE_BREAK##)/g).filter(p => p !== '');
    
    let blankIndex = -1;
    let foundCurrent = false;

    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith('[') && parts[i].endsWith(']')) {
        blankIndex++;
        if (blankIndex === currentBlankIndex) {
          const rawCorrectAnswer = parts[i].slice(1, -1);
          const normalizedCorrect = rawCorrectAnswer.replace(/\s+/g, '');
          const normalizedInput = inputVal.replace(/\s+/g, '');
          
          if (normalizedInput === normalizedCorrect) {
            setInputStatus('correct');
            setTimeout(() => {
              setInputStatus('idle');
              setAnswerInput("");
              setCurrentBlankIndex(prev => prev + 1);
            }, 300);
          } else {
            setInputStatus('wrong');
            statsRef.current.wrongIndices.add(blankIndex);
            setTimeout(() => {
              setInputStatus('idle');
              setAnswerInput("");
              setCurrentBlankIndex(prev => prev + 1);
            }, 800);
          }
          foundCurrent = true;
          break;
        }
      }
    }

    if (!foundCurrent) {
       handleCompleteCard();
    }
  };

  const handleShowAnswer = () => {
     if (!activeCard) return;
     setInputStatus('wrong');
     statsRef.current.wrongIndices.add(currentBlankIndex);
     setTimeout(() => {
        setInputStatus('idle');
        setAnswerInput("");
        setCurrentBlankIndex(prev => prev + 1);
     }, 800);
  };

  return (
    <ErrorBoundary fallbackLog={addLog}>
      <div className="min-h-screen bg-[#050505] text-white/90 font-sans selection:bg-amber-500/30 overflow-x-hidden">
        
        {/* 상단 네비게이션 */}
        <header className="fixed top-0 w-full z-40 bg-black/60 backdrop-blur-md border-b border-white/5">
          <div className="max-w-7xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl sm:text-2xl tracking-tighter font-black bg-gradient-to-r from-white to-white/40 bg-clip-text text-transparent">
                BD
              </span>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">BETA</span>
            </div>
            
            <nav className="flex gap-1 sm:gap-2">
              {[
                { id: "dashboard", label: "대시보드" },
                { id: "craft", label: "만들기" },
                { id: "enhance", label: "채우기" },
                { id: "exam", label: "모의고사" },
                { id: "mypage", label: "마이페이지" }
              ].map(t => (
                <button 
                  key={t.id} 
                  onClick={() => setActiveTab(t.id)} 
                  className={`px-3 sm:px-4 py-2 rounded-sm text-[11px] sm:text-[13px] font-bold transition-all ${activeTab === t.id ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'text-white/50 hover:bg-white/10 hover:text-white'}`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>
        </header>

        {/* 메인 콘텐츠 구역 */}
        <main className="max-w-7xl mx-auto px-4 pt-20 sm:pt-24 pb-32">
          {!safeAddress ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
               <div className="text-4xl sm:text-5xl font-black tracking-tighter mb-4 text-center leading-tight">
                  <span className="text-white">빈칸</span><span className="text-white/20">의</span> <br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500">제왕</span>
               </div>
               <p className="text-sm text-white/40 text-center max-w-md leading-relaxed">
                  로그인하여 나만의 지식 추출기를 가동하세요.<br/>당신의 모든 학습 기록은 암호화되어 안전하게 보관됩니다.
               </p>
               <button 
                 onClick={() => enokiFlow.createAuthorizationURL({ provider: 'google', network: 'testnet', clientId: '1074121226922-b5e02hft0i28m5en9e2v8e7b154lsk1a.apps.googleusercontent.com' }).then(url => { window.location.href = url; })} 
                 className="px-8 py-4 bg-white text-black font-bold rounded shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:scale-105 transition-all text-sm"
               >
                 Google 계정으로 시작하기
               </button>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              {activeTab === "dashboard" && <DashboardTab savedCards={savedCards} categories={categories} />}
              {activeTab === "craft" && <CraftTab categories={categories} savedCards={savedCards} colCount={colCount} viewMode={viewMode} useAiRecommend={useAiRecommend} safeAddress={safeAddress} lawFile={lawFile} setLawFile={setLawFile} uploadLaw={uploadLaw} handleMakeBlankCard={handleMakeBlankCard} addLog={addLog} handleDeleteCategory={handleDeleteCategory} loadAllData={loadAllData} expandedId={expandedId} setExpandedId={setExpandedId} />}
              {activeTab === "enhance" && <EnhanceTab savedCards={savedCards} colCount={colCount} viewMode={viewMode} setActiveCard={setActiveCard} handleDeleteCard={handleDeleteCard} />}
              {activeTab === "exam" && <ExamTab safeAddress={safeAddress} addLog={addLog} />}
              {activeTab === "mypage" && <MypageTab safeAddress={safeAddress} enokiFlow={enokiFlow} colCount={colCount} setColCount={setColCount} viewMode={viewMode} setViewMode={setViewMode} useAiRecommend={useAiRecommend} setUseAiRecommend={setUseAiRecommend} timeLimit={totalTimeLimit} setTimeLimit={handleSetTimeLimit} />}
            </div>
          )}
        </main>

        {/* 카드 학습 모달 */}
        <CardModal 
          activeCard={activeCard} 
          totalTimeLimit={totalTimeLimit} 
          elapsed={elapsed} 
          answerInput={answerInput}
          setAnswerInput={setAnswerInput}
          inputStatus={inputStatus}
          handleSequentialInput={handleSequentialInput}
          renderContent={() => {
            const cleanContent = activeCard.content.replace(/\n\n\[\[ORIG_ID:\d+\]\]/g, '');
            
            // 💡 [수정] 모달창 내부 제목 정밀 복구 로직
            let displayTitle = "";
            try {
              const rawTitle = activeCard.title || "";
              const regex = /(제\s*\d+\s*(?:조|장|편|관)(?:\s*의\s*\d+)?)\s*\(\s*([^)]+)\s*\)/;

              let match = cleanContent.match(regex);
              if (match && !match[2].includes("내용")) {
                  displayTitle = `${match[1].replace(/\s+/g, '')} ${match[2].replace(/\[|\]/g, '').trim()}`;
              } else {
                  match = rawTitle.match(regex);
                  if (match && !match[2].includes("내용")) {
                      displayTitle = `${match[1].replace(/\s+/g, '')} ${match[2].replace(/\[|\]/g, '').trim()}`;
                  } else {
                      const firstLine = (cleanContent.split('\n')[0] || rawTitle).trim();
                      displayTitle = firstLine.replace(/\[.*?\]/g, '').replace(/\(\s*내용\s*\)/g, '').trim() || "제목 없음";
                  }
              }
            } catch (error) {
              displayTitle = "제목 오류";
            }

            const { body } = formatCardText(cleanContent);
            const parts = body.split(/(\[.*?\]|##PAGE_BREAK##)/g).filter(p => p !== ''); 
            
            let displayPage = 0; 
            let tempGlobalBlank = 0; 
            let tempPage = 0;
            const currentBlankIdx = currentBlankIndex;

            const blanks: any[] = [];
            for (let part of parts) {
                if (part === '##PAGE_BREAK##') tempPage++;
                else if (part.startsWith('[') && part.endsWith(']')) {
                    blanks.push({ correct: tempGlobalBlank < currentBlankIdx });
                    if (tempGlobalBlank === currentBlankIdx) { 
                      displayPage = tempPage;
                    }
                    tempGlobalBlank++;
                }
            }

            let renderPage = 0;
            let bIdx = 0;
            const contentToRender: any[] = [];
            parts.forEach((part: string, i: number) => {
              if (part === '##PAGE_BREAK##') { renderPage++; return; }
              if (renderPage === displayPage) {
                  if (part.startsWith('[') && part.endsWith(']')) {
                    const isCorrect = blanks[bIdx]?.correct; 
                    const isCurrent = bIdx === currentBlankIdx; 
                    const isWrong = statsRef.current.wrongIndices.has(bIdx); 
                    
                    if (isCorrect) {
                      contentToRender.push(
                        <span key={i} className={`font-bold mx-1 px-1 rounded ${isWrong ? 'text-red-400 bg-red-900/20' : 'text-teal-400 bg-teal-900/20'}`}>
                          {part.replace(/\[|\]/g, '')}
                        </span>
                      );
                    }
                    else if (isCurrent) {
                      contentToRender.push(
                        <input 
                          key={i}
                          autoFocus
                          value={answerInput}
                          onChange={(e) => setAnswerInput(e.target.value)}
                          onKeyDown={(e) => {
                            if(e.key === 'Enter') handleSequentialInput(e.currentTarget.value);
                          }}
                          placeholder="입력..."
                          style={{ width: `${Math.max(60, answerInput.length * 15 + 40)}px` }}
                          className={`inline-block h-6 bg-indigo-900/30 border-b-2 outline-none text-center font-bold transition-all mx-1 px-1 rounded-t-sm ${
                            inputStatus === 'wrong' 
                              ? 'border-red-500 text-red-400 bg-red-900/40 animate-shake' 
                              : 'border-indigo-400 text-amber-300 focus:border-amber-400'
                          }`}
                        />
                      );
                    }
                    else {
                      contentToRender.push(
                        <span key={i} className="inline-block min-w-[50px] h-5 bg-white/5 border-b border-white/20 mx-1 align-middle rounded-sm"></span>
                      );
                    }
                    bIdx++;
                  } else {
                    contentToRender.push(<span key={i}>{part}</span>);
                  }
              } else if (part.startsWith('[') && part.endsWith(']')) {
                bIdx++;
              }
            });

            return (
              <div className="flex flex-col gap-6 w-full">
                <div className="flex justify-between items-center border-b border-white/10 pb-2">
                    <span className="text-amber-400 font-bold text-[14px] leading-tight">{displayTitle}</span>
                    <span className="text-[12px] text-white/40 font-mono bg-white/5 px-2 py-1 rounded shadow-sm">Page {displayPage + 1}</span>
                </div>
                
                <div className="whitespace-pre-wrap leading-relaxed text-[15px] font-serif break-keep min-h-[160px]">{contentToRender}</div>
                
                <div className="flex justify-between items-center w-full mb-2 gap-2 flex-wrap">
                  <button onClick={() => setIsMemoOpen(!isMemoOpen)} className="px-3 py-1.5 bg-teal-900/30 text-teal-400 border border-teal-500/50 rounded-sm text-[11px] font-bold shrink-0 hover:bg-teal-900/50 transition-all shadow-md">
                    {isMemoOpen ? '닫기 ✕' : '📝 메모 열기'}
                  </button>
                  
                  <button 
                    onClick={toggleVoiceRecognition} 
                    className={`flex-1 min-w-[120px] py-1.5 border rounded-sm text-[11px] font-bold transition-all shadow-md ${
                      isListening 
                        ? 'bg-red-600/50 text-white border-red-500 animate-pulse' 
                        : 'bg-blue-900/30 text-blue-400 border-blue-500/50 hover:bg-blue-900/50'
                    }`}
                  >
                    {isListening ? '🎙️ 음성 인식 끄기 (활성화됨)' : '🎤 음성으로 입력 (계속 켜두기)'}
                  </button>

                  <button onClick={handleShowAnswer} className="px-3 py-1.5 bg-red-900/30 text-red-400 border border-red-500/50 rounded-sm text-[11px] font-bold shrink-0 hover:bg-red-900/50 transition-all shadow-md">
                    정답 보기 (오답 처리)
                  </button>
                </div>
                
                {isMemoOpen && (
                  <div className="pt-4 border-t border-white/10 w-full animate-in slide-in-from-top-2">
                    <input 
                      defaultValue={statsRef.current.text || ""} 
                      placeholder="학습 인사이트 기록..." 
                      onBlur={(e) => { 
                        statsRef.current.text = e.target.value; 
                        handleUpdateMemoBackground(activeCard.id, stringifyCardStats(statsRef.current.text, statsRef.current.filled, Array.from(statsRef.current.wrongIndices))); 
                      }} 
                      className="text-[13px] text-teal-300 bg-teal-950/20 p-3 rounded border border-teal-500/30 w-full outline-none focus:border-teal-400 transition-all" 
                      autoFocus
                    />
                  </div>
                )}
              </div>
            );
          }} 
          onClose={() => { setActiveCard(null); setIsListening(false); if (recognitionRef.current) recognitionRef.current.stop(); }} 
        />

        {/* 시스템 로그 */}
        {logs.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-1.5 z-50 pointer-events-none w-full max-w-sm px-4">
            {logs.map((log, i) => (
              <div key={i} className="bg-black/80 backdrop-blur text-[10px] sm:text-[11px] text-white/70 px-3 py-2 rounded-sm border border-white/10 shadow-xl animate-in slide-in-from-bottom-2 whitespace-pre-wrap break-words">
                {log}
              </div>
            ))}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
