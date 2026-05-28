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
      <div className="p-4 bg-red-950/20 border border-red-500/50 m-4 rounded text-red-200 font-mono text-xs">
        <h2 className="font-bold mb-2">🚨 시스템 런타임 크래시 발생</h2>
        <p>{this.state.errorMessage}</p>
        <button onClick={() => window.location.reload()} className="mt-3 px-3 py-1 bg-red-500 text-white rounded text-[11px]">앱 새로고침</button>
      </div>
    );
    return this.props.children;
  }
}

const useSpeechRecognition = (onResult: (text: string) => void) => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'ko-KR';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map(result => result.transcript)
          .join('');
        onResult(transcript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        if (event.error === 'not-allowed') {
          setIsListening(false);
        }
      };

      recognitionRef.current.onend = () => {
        if (isListening && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {
            console.error("음성 인식 재시작 오류:", e);
          }
        }
      };
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [onResult, isListening]);

  const toggleListening = () => {
    if (isListening) {
      setIsListening(false);
      recognitionRef.current?.stop();
    } else {
      setIsListening(true);
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.error("음성 인식 시작 오류:", e);
      }
    }
  };

  return { isListening, setIsListening, toggleListening, recognitionRef };
};

export default function App() {
  const [logs, setLogs] = useState<string[]>([]);
  const addLog = (msg: string) => {
    setLogs(prev => {
      const newLogs = [ `[${new Date().toLocaleTimeString()}] ${msg}`, ...prev ];
      return newLogs.slice(0, 4);
    });
  };

  return (
    <ErrorBoundary fallbackLog={addLog}>
      <BlankDMain AppLogs={logs} addLog={addLog} />
    </ErrorBoundary>
  );
}

function BlankDMain({ AppLogs, addLog }: { AppLogs: string[], addLog: (msg: string) => void }) {
  const enokiFlow = useEnokiFlow();
  const { providerState } = useZkLogin();
  const currentAccount = useCurrentAccount();
  const userEmail = providerState?.type === "authenticated" ? providerState.user.email : null;
  const isLoggedIn = !!userEmail;
  const safeAddress = userEmail || "guest_mode_address";

  const [activeTab, setActiveTab] = useState('progress');
  const [categories, setCategories] = useState<any[]>([]);
  const [savedCards, setSavedCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [lawFile, setLawFile] = useState<File | null>(null);
  
  const [colCount, setColCount] = useState(3);
  const [viewMode, setViewMode] = useState<'card'|'list'>('card');
  const [useAiRecommend, setUseAiRecommend] = useState(false);

  const [activeCard, setActiveCard] = useState<any | null>(null);
  const [answerInput, setAnswerInput] = useState("");
  const [inputStatus, setInputStatus] = useState<"typing" | "correct" | "wrong">("typing");
  const [elapsed, setElapsed] = useState(0);
  const totalTimeLimit = 15;

  const timerRef = useRef<any>(null);
  const currentBlankIdxRef = useRef<number>(0);
  const statsRef = useRef<{ text: string; filled: number; wrongIndices: number[] }>({ text: "", filled: 0, wrongIndices: [] });

  const [isMemoOpen, setIsMemoOpen] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<any>(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiRecommendations, setAiRecommendations] = useState<any[]>([]);

  // 💡 [추가] 이어서 하기 상태 실시간 추적 (로컬 스토리지 연동)
  const [recentCraftId, setRecentCraftId] = useState<number | null>(null);
  const [recentCraftTitle, setRecentCraftTitle] = useState("");
  const [recentEnhanceId, setRecentEnhanceId] = useState<number | null>(null);
  const [recentEnhanceTitle, setRecentEnhanceTitle] = useState("");

  useEffect(() => {
    const checkResumeData = () => {
      const cId = localStorage.getItem('blankd_last_crafted_id');
      const cTitle = localStorage.getItem('blankd_last_crafted_title');
      const eId = localStorage.getItem('blankd_last_enhanced_id');
      const eTitle = localStorage.getItem('blankd_last_enhanced_title');
      
      setRecentCraftId(cId ? parseInt(cId, 10) : null);
      setRecentCraftTitle(cTitle || "");
      setRecentEnhanceId(eId ? parseInt(eId, 10) : null);
      setRecentEnhanceTitle(eTitle || "");
    };
    checkResumeData();
    const interval = setInterval(checkResumeData, 1000); 
    return () => clearInterval(interval);
  }, []);

  const loadAllData = async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    try {
      const [catsData, cardsData] = await Promise.all([
        api.getCategories(safeAddress),
        api.getCards(safeAddress)
      ]);
      setCategories(Array.isArray(catsData) ? catsData : []);
      setSavedCards(Array.isArray(cardsData) ? cardsData : []);
      addLog("🔄 데이터 동기화 완료");
    } catch (e) {
      addLog("❌ 데이터 로드 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      loadAllData();
      
      if (activeTab === 'create' || activeTab === 'enhance' || activeTab === 'progress') {
        const checkData = async () => {
          try {
            const [newCats, newCards] = await Promise.all([
              api.getCategories(safeAddress),
              api.getCards(safeAddress)
            ]);
            
            if (JSON.stringify(newCats) !== JSON.stringify(categories) || JSON.stringify(newCards) !== JSON.stringify(savedCards)) {
                setCategories(Array.isArray(newCats) ? newCats : []);
                setSavedCards(Array.isArray(newCards) ? newCards : []);
                addLog("✨ 백그라운드 데이터 갱신");
            }
          } catch(e) {}
        };
        const interval = setInterval(checkData, 15000);
        return () => clearInterval(interval);
      }
    }
  }, [isLoggedIn, safeAddress, activeTab]);

  const handleGoogleLogout = async () => {
    await enokiFlow.logout();
    localStorage.clear();
    window.location.reload();
  };

  const uploadLaw = async () => {
    if (!lawFile) return alert("파일을 선택해주세요.");
    addLog(`⏳ 문헌 업로드 분석 시작: ${lawFile.name}`);
    try {
      const res = await api.uploadLawFile(safeAddress, lawFile);
      addLog(`✅ 분석 완료: ${res.count}개 조항 파싱됨`);
      setLawFile(null);
      await loadAllData();
    } catch (e) {
      addLog("❌ 문헌 분석 실패");
    }
  };

  const handleMakeBlankCard = async (cat: any, tokens: string[], selectedIndices: Set<number>, pageBreaks: Set<number>, memoText: string, origId: number, onSuccess?: () => void) => {
    let textBuilder = "";
    tokens.forEach((t, idx) => {
      if (pageBreaks.has(idx)) textBuilder += "\n---PAGE---\n";
      
      if (selectedIndices.has(idx)) {
        textBuilder += `[${t}]`;
      } else {
        textBuilder += t;
      }
    });

    const finalContent = `${cat.title || ""}\n${textBuilder}\n[[ORIG_ID:${origId}]]`;
    const finalMemo = stringifyCardStats(memoText, 0, []);

    try {
      await api.createCard({
        wallet_address: safeAddress,
        folder_name: cat.folder_name || "기본 폴더",
        content: finalContent,
        memo: finalMemo
      });
      addLog(`🃏 카드 생성 성공: ${getStrictTitleOnly(cat.title)}`);
      
      localStorage.setItem('blankd_last_crafted_id', origId.toString());
      localStorage.setItem('blankd_last_crafted_title', getStrictTitleOnly(cat.title));

      await loadAllData();
      if (onSuccess) onSuccess();
    } catch (e) {
      alert("카드 생성 실패");
    }
  };

  const handleDeleteCategory = async (id: number) => {
    try {
      await api.deleteCategory(safeAddress, id);
      addLog("🗑️ 조항 대기열에서 삭제 완료");
      await loadAllData();
    } catch (e) {
      alert("삭제 실패");
    }
  };

  const handleDeleteCard = async (id: number) => {
    if (!window.confirm("이 카드를 영구 삭제하시겠습니까?")) return;
    try {
      await api.deleteCard(safeAddress, id);
      addLog("🗑️ 학습 카드 삭제 완료");
      await loadAllData();
    } catch (e) {
      alert("카드 삭제 실패");
    }
  };

  const handleUpdateMemoBackground = async (cardId: number, nextMemo: string) => {
    try {
      await api.updateCardMemo(safeAddress, cardId, nextMemo);
    } catch(e){
    }
  };

  const processInput = (val: string) => {
    if (inputStatus !== "typing" || !activeCard) return;
    
    const { body } = formatCardText(activeCard.content);
    const blanks = [...body.matchAll(/\[\s*(.*?)\s*\]/g)].map(m => m[1].trim());
    const targetAnswer = blanks[currentBlankIdxRef.current].replace(/\s+/g, '').toLowerCase();
    const actualInput = val.replace(/\s+/g, '').toLowerCase();

    if (actualInput.includes(targetAnswer)) {
      if (currentBlankIdxRef.current < blanks.length - 1) {
        currentBlankIdxRef.current += 1;
        setAnswerInput("");
        addLog(`✨ 음성 정답! 다음 빈칸 대기중...`);
      } else {
        clearInterval(timerRef.current);
        setInputStatus("correct");
        statsRef.current.filled += 1;
        
        const finalMemo = stringifyCardStats(statsRef.current.text, statsRef.current.filled, Array.from(statsRef.current.wrongIndices));
        handleUpdateMemoBackground(activeCard.id, finalMemo);
        
        addLog("🎉 모든 빈칸 해제 완료! 통계 동기화됨");
      }
    }
  };

  const { isListening, setIsListening, recognitionRef } = useSpeechRecognition((transcript) => {
    if (inputStatus === "typing") {
      setAnswerInput(transcript);
      processInput(transcript);
    }
  });

  const handleSequentialInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (inputStatus !== "typing") return;
    
    const val = e.target.value;
    setAnswerInput(val);

    const { body } = formatCardText(activeCard.content);
    const blanks = [...body.matchAll(/\[\s*(.*?)\s*\]/g)].map(m => m[1].trim());
    const targetAnswer = blanks[currentBlankIdxRef.current];

    if (val.trim() === targetAnswer) {
      if (currentBlankIdxRef.current < blanks.length - 1) {
        currentBlankIdxRef.current += 1;
        setAnswerInput("");
        addLog(`✨ 정답! 다음 빈칸 입력`);
      } else {
        clearInterval(timerRef.current);
        setInputStatus("correct");
        
        statsRef.current.filled += 1;
        const finalMemo = stringifyCardStats(statsRef.current.text, statsRef.current.filled, Array.from(statsRef.current.wrongIndices));
        
        handleUpdateMemoBackground(activeCard.id, finalMemo);
        addLog("🎉 모든 빈칸 해제 완료! 통계 동기화됨");
      }
    }
  };

  useEffect(() => {
    if (activeCard) {
      setElapsed(0);
      setInputStatus("typing");
      setAnswerInput("");
      setIsMemoOpen(false);
      currentBlankIdxRef.current = 0;
      statsRef.current = parseCardStats(activeCard.memo);

      const match = activeCard.content.match(/\[\[ORIG_ID:(\d+)\]\]/);
      if (match) {
        localStorage.setItem('blankd_last_enhanced_id', activeCard.id.toString());
        localStorage.setItem('blankd_last_enhanced_title', activeCard.content.split('\n')[0]);
      }

      timerRef.current = setInterval(() => {
        setElapsed(prev => {
          if (prev >= totalTimeLimit) {
            clearInterval(timerRef.current);
            handleShowAnswer();
            return totalTimeLimit;
          }
          return prev + 0.1;
        });
      }, 100);
      
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (isListening && recognitionRef.current) {
        setIsListening(false);
        recognitionRef.current.stop();
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeCard]);

  const handleShowAnswer = () => {
    clearInterval(timerRef.current);
    setInputStatus("wrong");
    statsRef.current.wrongIndices = Array.from(new Set([...statsRef.current.wrongIndices, currentBlankIdxRef.current]));
    
    const finalMemo = stringifyCardStats(statsRef.current.text, statsRef.current.filled, Array.from(statsRef.current.wrongIndices));
    handleUpdateMemoBackground(activeCard.id, finalMemo);
    
    addLog("❌ 오답 처리 및 정답 오픈");
  };

  const handleAnkiReview = (reviewType: "again" | "hard" | "good" | "easy") => {
    if (!activeCard) return;
    
    addLog(`🧠 Anki 복습 강도 지정: [${reviewType.toUpperCase()}]`);
    
    if (reviewType === "again" || reviewType === "hard") {
        statsRef.current.wrongIndices = Array.from(new Set([...statsRef.current.wrongIndices, currentBlankIdxRef.current]));
    } else {
        statsRef.current.wrongIndices = statsRef.current.wrongIndices.filter(idx => idx !== currentBlankIdxRef.current);
    }
    
    const finalMemo = stringifyCardStats(statsRef.current.text, statsRef.current.filled, Array.from(statsRef.current.wrongIndices));
    
    handleUpdateMemoBackground(activeCard.id, finalMemo).then(() => {
        loadAllData().then(() => {
            const sorted = [...savedCards].sort((a,b) => a.id - b.id);
            const curIdx = sorted.findIndex(c => c.id === activeCard.id);
            
            if (curIdx !== -1 && curIdx < sorted.length - 1) {
                setActiveCard(sorted[curIdx + 1]);
            } else {
                setActiveCard(null);
            }
        });
    });
  };

  const renderContent = () => {
    if (!activeCard) return null;
    const { body } = formatCardText(activeCard.content);
    
    const tokens = body.split(SPLIT_REGEX).filter(w => w !== "");
    let blankCounter = 0;

    return (
      <div className="font-serif text-[15px] sm:text-[17px] leading-loose whitespace-pre-wrap break-keep text-white/90 select-none">
        {tokens.map((token, idx) => {
          const isBlank = token.startsWith("[") && token.endsWith("]");
          
          if (isBlank) {
            const currentCounter = blankCounter;
            blankCounter++;
            const cleanText = token.slice(1, -1).trim();

            if (currentCounter < currentBlankIdxRef.current) {
              return (
                <span key={idx} className="mx-1 px-1.5 bg-teal-500/20 text-teal-300 font-bold border-b border-teal-400/50">
                  {cleanText}
                </span>
              );
            } else if (currentCounter === currentBlankIdxRef.current) {
              if (inputStatus === "wrong") {
                return (
                  <span key={idx} className="mx-1 px-1.5 bg-red-600 text-white font-bold animate-pulse">
                    {cleanText}
                  </span>
                );
              }
              if (inputStatus === "correct") {
                return (
                  <span key={idx} className="mx-1 px-1.5 bg-teal-500 text-black font-bold">
                    {cleanText}
                  </span>
                );
              }
              return (
                <span key={idx} className="mx-1 px-3 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500 font-mono text-sm animate-pulse">
                  ??
                </span>
              );
            } else {
              return (
                <span key={idx} className="mx-1 px-2 bg-white/5 border border-white/10 text-white/10 select-none filter blur-[2px]">
                  🛑🛑
                </span>
              );
            }
          }
          
          if (token === "\n---PAGE---\n") {
             return <div key={idx} className="w-full border-t border-white/20 my-6 relative"><span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-black px-2 text-[10px] text-white/40 tracking-widest font-mono">PAGE BREAK</span></div>;
          }

          return <span key={idx}>{token}</span>;
        })}
      </div>
    );
  };

  const analyzeAllForTest = async () => {
    if (!savedCards || savedCards.length === 0) {
      alert("분석할 카드가 없습니다. 카드를 먼저 만들어주세요.");
      return;
    }
    
    setIsAiProcessing(true);
    addLog("🤖 모의고사 기반 AI 문헌 분석 시작 (전체 카드 대상)...");
    
    try {
      const data = await api.analyzeExam(safeAddress, savedCards);
      
      setAiAnalysisResult(data);
      addLog("✅ AI 문헌 분석 완료! 빈칸 추천 데이터가 생성되었습니다.");
      
      const newRecs = data.analysis.flatMap((item: any) => item.recommendations || []);
      setAiRecommendations(newRecs);
      
      setShowAiModal(true);
      
    } catch (e: any) {
      console.error(e);
      addLog(`❌ AI 분석 실패: ${e.message}`);
      alert("AI 분석 중 오류가 발생했습니다.");
    } finally {
      setIsAiProcessing(false);
    }
  };

  const applyAiRecommendations = () => {
     alert("이 기능은 현재 UI 통합 중입니다. (추천된 빈칸 목록을 카드에 일괄 적용하는 로직 추가 예정)");
     setShowAiModal(false);
  };

  let totalCardBlanks = 0;
  let minFilledCount = 9999;
  let totalWrongIndices = 0;
  let totalCardsWithWrong = 0;

  if (savedCards.length > 0) {
    savedCards.forEach(c => {
      const { body } = formatCardText(c.content);
      totalCardBlanks += (body.match(/\[\s*(.*?)\s*\]/g) || []).length;
      const st = parseCardStats(c.memo);
      if (st.filled < minFilledCount) minFilledCount = st.filled;
      totalWrongIndices += st.wrongIndices.length;
      if (st.wrongIndices.length > 0) totalCardsWithWrong += 1;
    });
  } else {
    minFilledCount = 0;
  }

  const passProbability = totalCardBlanks === 0 ? 0 : Math.max(0, 100 - Math.round((totalCardsWithWrong / savedCards.length) * 100));

  return (
    <div className="min-h-screen bg-[#030303] text-white flex flex-col font-sans select-none antialiased selection:bg-amber-500 selection:text-black">
      
      {/* 💡 [핵심] 상시 이어서 하기 버튼 및 글로벌 지표가 고정된 최상단 헤더 */}
      <header className="border-b border-white/10 bg-[#08080a] px-4 py-2.5 sticky top-0 z-40 backdrop-blur-md w-full">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <span className="text-[10px] sm:text-xs font-mono font-bold tracking-widest text-white/40 mr-1 uppercase">Resume:</span>
            
            {recentCraftId ? (
              <button 
                onClick={() => { setActiveTab('create'); setExpandedId(recentCraftId); }}
                className="bg-amber-900/30 border border-amber-500/40 px-2 sm:px-3 py-1 sm:py-1.5 rounded-sm flex items-center gap-1.5 hover:bg-amber-900/50 transition-all text-left max-w-[140px] sm:max-w-[200px]"
              >
                <span className="text-[9px] sm:text-[10px] text-amber-400 font-bold whitespace-nowrap">▶ 만들기:</span>
                <span className="text-[10px] sm:text-[11px] font-medium text-amber-100 truncate">{recentCraftTitle || "진행중"}</span>
              </button>
            ) : (
              <div className="text-[10px] sm:text-[11px] text-white/20 border border-white/5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-sm">만들기 기록 없음</div>
            )}

            {recentEnhanceId ? (
              <button 
                onClick={() => {
                  const targetCard = savedCards.find((c:any) => c.id === recentEnhanceId);
                  if (targetCard) setActiveCard(targetCard);
                  else setActiveTab('enhance');
                }}
                className="bg-teal-900/30 border border-teal-500/40 px-2 sm:px-3 py-1 sm:py-1.5 rounded-sm flex items-center gap-1.5 hover:bg-teal-900/50 transition-all text-left max-w-[140px] sm:max-w-[200px]"
              >
                <span className="text-[9px] sm:text-[10px] text-teal-400 font-bold whitespace-nowrap">▶ 채우기:</span>
                <span className="text-[10px] sm:text-[11px] font-medium text-teal-100 truncate">{recentEnhanceTitle || "진행중"}</span>
              </button>
            ) : (
              <div className="text-[10px] sm:text-[11px] text-white/20 border border-white/5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-sm">채우기 기록 없음</div>
            )}
          </div>

          <div className="flex items-center justify-between md:justify-end gap-3 sm:gap-4 shrink-0 mt-2 md:mt-0">
            <div className="flex items-center gap-2 sm:gap-3 font-mono">
              <div className="text-right">
                <span className="text-[8px] sm:text-[9px] text-white/40 block tracking-widest uppercase">Rotation</span>
                <span className="text-[10px] sm:text-xs font-bold text-amber-400">{minFilledCount} 회독</span>
              </div>
              <div className="h-5 sm:h-6 w-px bg-white/10"></div>
              <div className="text-right">
                <span className="text-[8px] sm:text-[9px] text-white/40 block tracking-widest uppercase">Pass Rate</span>
                <span className="text-[10px] sm:text-xs font-bold text-teal-400">{passProbability}%</span>
              </div>
            </div>
            
            <div className="h-5 sm:h-6 w-px bg-white/10 hidden sm:block"></div>

            <button onClick={handleGoogleLogout} className="border border-white/20 px-2 py-1 text-[9px] sm:text-[10px] hover:bg-white/10 tracking-wider font-mono rounded-sm text-white/70 whitespace-nowrap">LOGOUT</button>
          </div>
        </div>
      </header>

      {/* 💡 [핵심] 한 줄 아래로 독립적으로 분리된 탭 네비게이션 바 */}
      {isLoggedIn && (
        <nav className="border-b border-white/5 bg-black/40 py-1.5 px-4 overflow-x-auto whitespace-nowrap custom-scrollbar w-full mb-6">
          <div className="max-w-6xl mx-auto flex items-center justify-start gap-1 sm:gap-2">
            {[{ id: 'progress', label: '진행상황' }, { id: 'create', label: '만들기' }, { id: 'enhance', label: '채우기' }, { id: 'exam', label: '모의고사' }, { id: 'settings', label: '설정' }].map(tab => (
              <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id)} 
                className={`px-3 sm:px-4 py-1.5 text-[11px] sm:text-xs font-bold tracking-widest rounded-sm transition-all ${activeTab === tab.id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>
      )}
{!isLoggedIn ? (
        <main className="max-w-md mx-auto mt-20 sm:mt-24 flex flex-col items-center px-4">
          <h2 className="text-xl sm:text-2xl font-serif text-white mb-4 tracking-tight">빈칸개발 (BlankD)</h2>
          <p className="text-xs sm:text-sm text-white/40 mb-10 sm:mb-12 text-center leading-relaxed">인지 부하 이론 기반의 학습 플랫폼<br/>압도적인 영구 기억을 형성합니다.</p>
          <button onClick={async () => { window.location.href = await enokiFlow.createAuthorizationURL({ provider: 'google', clientId: '536814695888-bepe0chce3nq3oam3id83q7a50id36v6.apps.googleusercontent.com', redirectUrl: window.location.href.split('?')[0], extraParams: { scope: ['openid', 'email', 'profile'] } }); }} className="w-full bg-white text-black font-bold py-3.5 sm:py-4 rounded shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] transition-all flex items-center justify-center gap-3 text-xs sm:text-sm">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            구글 계정으로 동기화 시작
          </button>
        </main>
      ) : (
        <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 md:p-8 relative pb-24 font-sans text-pretty overflow-x-hidden transition-colors">
          
          {loading && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-amber-500 text-black text-[10px] font-bold px-3 py-1 rounded-b shadow-lg animate-pulse z-50">
              DATABANK SYNCHRONIZING...
            </div>
          )}
          
          {activeTab === 'progress' && (
            <DashboardTab 
              categories={categories} 
              savedCards={savedCards} 
              setActiveTab={setActiveTab} 
              setExpandedId={setExpandedId}
              setActiveCard={setActiveCard}
            />
          )}

          {activeTab === 'create' && (
            <CraftTab 
              categories={categories} 
              savedCards={savedCards}
              colCount={colCount}
              viewMode={viewMode}
              useAiRecommend={useAiRecommend}
              safeAddress={safeAddress}
              lawFile={lawFile}
              setLawFile={setLawFile}
              uploadLaw={uploadLaw}
              handleMakeBlankCard={handleMakeBlankCard}
              addLog={addLog}
              handleDeleteCategory={handleDeleteCategory}
              loadAllData={loadAllData}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
            />
          )}

          {activeTab === 'enhance' && (
             <EnhanceTab 
               savedCards={savedCards}
               colCount={colCount}
               viewMode={viewMode}
               setActiveCard={setActiveCard}
               setActiveTab={setActiveTab}
               setExpandedId={setExpandedId}
               handleDeleteCard={handleDeleteCard}
             />
          )}

          {activeTab === 'exam' && (
             <ExamTab safeAddress={safeAddress} addLog={addLog} />
          )}

          {activeTab === 'settings' && (
            <MypageTab 
               colCount={colCount}
               setColCount={setColCount}
               viewMode={viewMode}
               setViewMode={setViewMode}
               useAiRecommend={useAiRecommend}
               setUseAiRecommend={setUseAiRecommend}
               safeAddress={safeAddress}
               addLog={addLog}
            />
          )}
        </main>
      )}

      {/* 하단 로그 영역 */}
      <footer className="border-t border-white/5 bg-black/80 backdrop-blur text-[9px] sm:text-[10px] text-white/30 font-mono flex flex-col p-2 sm:p-3 fixed bottom-0 w-full z-40 max-h-24 sm:max-h-32 overflow-y-auto">
        {AppLogs.length > 0 ? AppLogs.map((log, idx) => (
          <div key={idx} className="flex gap-2">
            <span className="text-amber-500/50">SYS</span>
            <span className="break-all">{log}</span>
          </div>
        )) : <div>시스템 상태 정상 - 대기 중</div>}
      </footer>

      {/* 💡 기존의 모달 (음성인식, Anki 복습 포함 전체 코드 보존) */}
      {activeCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0a0a0c] border border-white/10 rounded-sm shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col relative overflow-hidden">
            <div className="absolute top-0 left-0 h-1 bg-white/10 w-full z-10">
              <div className={`h-full transition-all duration-100 ease-linear ${elapsed / totalTimeLimit > 0.8 ? 'bg-red-500' : 'bg-teal-500'}`} style={{ width: `${(elapsed / totalTimeLimit) * 100}%` }} />
            </div>
            
            <div className="p-4 sm:p-6 border-b border-white/10 flex justify-between items-start bg-white/5">
              <div className="flex-1 pr-4">
                <div className="text-[10px] text-teal-500/80 font-mono mb-1 tracking-widest uppercase">{activeCard.folder_name}</div>
                <h3 className="text-sm sm:text-base font-bold text-teal-100 tracking-tight leading-snug break-keep">{activeCard.content.split('\n')[0].replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '')}</h3>
              </div>
              <button onClick={() => { setActiveCard(null); setIsMemoOpen(false); }} className="text-white/30 hover:text-white p-2 shrink-0 transition-colors">✕</button>
            </div>

            <div className="p-4 sm:p-6 flex-1 overflow-y-auto custom-scrollbar relative">
              {renderContent()}
            </div>

            <div className="p-4 sm:p-6 bg-black/40 border-t border-white/5 space-y-4">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <input 
                  type="text" 
                  autoFocus 
                  value={answerInput} 
                  onChange={handleSequentialInput} 
                  disabled={inputStatus !== "typing"}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                  autoCapitalize="none"
                  onCompositionStart={(e) => { e.currentTarget.dataset.composing = "true"; }}
                  onCompositionEnd={(e) => { e.currentTarget.dataset.composing = "false"; }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.dataset.composing !== "true") {
                      const val = e.currentTarget.value;
                      const { body } = formatCardText(activeCard.content);
                      const blanks = [...body.matchAll(/\[\s*(.*?)\s*\]/g)].map(m => m[1].trim());
                      const targetAnswer = blanks[currentBlankIdxRef.current];

                      if (val.trim() === targetAnswer) {
                        if (currentBlankIdxRef.current < blanks.length - 1) {
                          currentBlankIdxRef.current += 1;
                          setAnswerInput("");
                          addLog(`✨ 정답! 다음 빈칸 입력`);
                        } else {
                          clearInterval(timerRef.current);
                          setInputStatus("correct");
                          statsRef.current.filled += 1;
                          const finalMemo = stringifyCardStats(statsRef.current.text, statsRef.current.filled, Array.from(statsRef.current.wrongIndices));
                          handleUpdateMemoBackground(activeCard.id, finalMemo);
                          addLog("🎉 모든 빈칸 해제 완료! 통계 동기화됨");
                        }
                      } else {
                         handleShowAnswer();
                      }
                    }
                  }}
                  className={`flex-1 h-10 sm:h-12 bg-[#0a0a0c] border-2 outline-none text-center font-bold text-sm sm:text-base rounded-sm transition-all shadow-inner ${
                    inputStatus === "wrong" ? "border-red-500 text-red-400 bg-red-950/30 animate-shake" : 
                    inputStatus === "correct" ? "border-teal-500 text-teal-400 bg-teal-950/30 shadow-[0_0_15px_rgba(20,184,166,0.2)]" : 
                    "border-teal-900/50 text-teal-100 focus:border-teal-500 focus:bg-teal-950/10"
                  }`} 
                  placeholder={inputStatus === "typing" ? "빈칸 내용 입력 후 Enter..." : inputStatus === "correct" ? "완료!" : "오답"} 
                />
                
                <button onClick={() => setIsMemoOpen(!isMemoOpen)} className={`h-10 sm:h-12 px-3 sm:px-4 border rounded-sm text-xs font-bold shrink-0 transition-all ${isMemoOpen ? 'bg-teal-600/30 border-teal-500/50 text-teal-300' : 'border-white/10 text-white/40 hover:bg-white/5'}`}>
                  {isMemoOpen ? '메모 닫기' : '📝 메모'}
                </button>
              </div>

              <div className="flex justify-between gap-2 overflow-x-auto custom-scrollbar pb-1">
                <button onClick={toggleListening} className={`px-3 py-1.5 border rounded-sm text-[10px] sm:text-[11px] font-bold shrink-0 transition-all flex items-center gap-1 ${isListening ? 'bg-teal-600/30 border-teal-500/50 text-teal-300 animate-pulse shadow-[0_0_10px_rgba(20,184,166,0.2)]' : 'bg-black/50 border-white/10 text-white/40 hover:bg-white/5'}`}>
                  {isListening ? '🎙️ 음성 인식 끄기 (활성화됨)' : '🎤 음성으로 입력 (계속 켜두기)'}
                </button>

                <button onClick={handleShowAnswer} className="px-3 py-1.5 bg-red-900/30 text-red-400 border border-red-500/50 rounded-sm text-[10px] sm:text-[11px] font-bold shrink-0 hover:bg-red-900/50 transition-all shadow-md">
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
                    className="text-[12px] sm:text-[13px] text-teal-300 bg-teal-950/20 p-2.5 sm:p-3 rounded border border-teal-500/30 w-full outline-none focus:border-teal-400 transition-all" 
                    autoFocus
                  />
                </div>
              )}

              {inputStatus === "correct" && (
                <div className="flex justify-between gap-2 pt-4 border-t border-white/10 animate-in slide-in-from-bottom-2">
                  <button onClick={() => handleAnkiReview("again")} className="flex-1 py-2 sm:py-2.5 bg-red-950/40 text-red-400 border border-red-900 rounded-sm text-[10px] sm:text-[11px] font-bold hover:bg-red-900/40 transition-colors">다시 (1m)</button>
                  <button onClick={() => handleAnkiReview("hard")} className="flex-1 py-2 sm:py-2.5 bg-orange-950/40 text-orange-400 border border-orange-900 rounded-sm text-[10px] sm:text-[11px] font-bold hover:bg-orange-900/40 transition-colors">어려움 (6m)</button>
                  <button onClick={() => handleAnkiReview("good")} className="flex-1 py-2 sm:py-2.5 bg-teal-950/40 text-teal-400 border border-teal-900 rounded-sm text-[10px] sm:text-[11px] font-bold hover:bg-teal-900/40 transition-colors">알맞음 (10m)</button>
                  <button onClick={() => handleAnkiReview("easy")} className="flex-1 py-2 sm:py-2.5 bg-blue-950/40 text-blue-400 border border-blue-900 rounded-sm text-[10px] sm:text-[11px] font-bold hover:bg-blue-900/40 transition-colors">쉬움 (4d)</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
           <div className="bg-[#0a0a0c] border border-amber-500/30 rounded shadow-2xl w-full max-w-lg p-6 flex flex-col">
              <h3 className="text-amber-400 font-bold mb-4">🤖 AI 모의고사 기반 빈칸 추천</h3>
              <div className="flex-1 overflow-y-auto custom-scrollbar mb-4 text-sm text-white/70 space-y-4 max-h-[50vh]">
                 <p>AI가 모의고사를 분석하여 출제 확률이 높은 핵심 키워드를 추천합니다.</p>
                 {aiRecommendations.length > 0 ? (
                    <ul className="list-disc pl-5 space-y-1">
                      {aiRecommendations.map((rec, i) => (
                        <li key={i} className="text-teal-300 font-mono">{rec.keyword} <span className="text-white/40 text-xs">({rec.reason})</span></li>
                      ))}
                    </ul>
                 ) : (
                    <p className="text-white/30">추천된 단어가 없습니다.</p>
                 )}
              </div>
              <div className="flex gap-2 justify-end mt-2">
                 <button onClick={() => setShowAiModal(false)} className="px-4 py-2 border border-white/20 text-white/50 rounded hover:bg-white/10 transition-colors">닫기</button>
                 <button onClick={applyAiRecommendations} className="px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/50 rounded hover:bg-amber-500/30 transition-colors">추천 빈칸 전체 적용</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
