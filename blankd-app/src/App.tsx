import { useState, useEffect, useRef } from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";

interface Category { id: number; title: string; content: string; }
interface Card { id: number; content: string; answer: string; options: string[]; level: number; next_review: string; status: string; }

// 🚨 [초정밀 업데이트] 대한민국 법령 3단 비교표 전용 조사 및 특수기호 분리 엔진
const SPLIT_REGEX = /(\s+|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]+|(?:은|는|이|가|을|를|의|에|에게|과|와|로서|로써|로|으로|도|만|부터|까지|이다|한다|함|됨|됨을|함을|함으로써|대하여|대해|대한|등|및|에서|에서는|에서의|로부터|에의|로부터의|에도|에는|이나|나|라도|이라도)(?=\s|$|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]))/g;

function App() {
  const enokiFlow = useEnokiFlow();
  const zkLogin = useZkLogin();
  const suiWalletAccount = useCurrentAccount();
  
  const safeAddress = suiWalletAccount?.address || zkLogin?.address || "";
  const isLoggedIn = safeAddress.length > 0;

  const [activeTab, setActiveTab] = useState('dashboard');
  const [file, setFile] = useState<File | null>(null);
  const [examFile, setExamFile] = useState<File | null>(null);
  
  const [panelState, setPanelState] = useState({
    status: 'idle', 
    title: '시스템 대기 중',
    message: '법령 문헌을 선택하거나 분석 개시 버튼을 눌러주세요.',
    current: 0,
    total: 0,
    logs: [] as string[]
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [savedCards, setSavedCards] = useState<Card[]>([]);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [relatedExams, setRelatedExams] = useState<any[]>([]);
  const [aiExplanation, setAiExplanation] = useState("");
  
  const [parsedText, setParsedText] = useState("");
  const [selectedWordIndices, setSelectedWordIndices] = useState<Set<number>>(new Set());
  
  // 🚨 [신규 추가] 레이아웃 설정 및 타이핑 모드 관련 State
  const [viewMode, setViewMode] = useState<'all' | '법' | '령' | '칙'>('all');
  const [colCount, setColCount] = useState<number>(3);
  const [cardColumns, setCardColumns] = useState<Record<number, number>>({});
  const [expandedCardId, setExpandedCardId] = useState<number | null>(null);
  const [answerInput, setAnswerInput] = useState("");
  const textRef = useRef<HTMLDivElement>(null);

  // 로컬 스토리지에서 카드 컬럼 상태 불러오기
  useEffect(() => {
    const savedCols = localStorage.getItem('cardColumns');
    if (savedCols) {
      try { setCardColumns(JSON.parse(savedCols)); } catch(e) {}
    }
  }, []);

  const updateCardColumn = (cardId: number, colIndex: number) => {
    const newCols = { ...cardColumns, [cardId]: colIndex };
    setCardColumns(newCols);
    localStorage.setItem('cardColumns', JSON.stringify(newCols));
  };

  // 배경 클릭 시 확장된 카드 축소
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.expandable-card')) {
        setExpandedCardId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const renderMaskedContent = (text: string) => {
    const parts = text.split(/(\[.*?\])/g);
    return parts.map((part, i) => {
      if (part.startsWith('[') && part.endsWith(']')) {
        return <span key={i} className="inline-block min-w-[60px] h-5 bg-white/10 border-b border-white/50 mx-1 align-middle"></span>;
      }
      return part;
    });
  };

  const updatePanel = (status: string, title: string, message: string, current=0, total=0) => {
    setPanelState(prev => ({
      status, title, message, current, total,
      logs: [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev.logs].slice(0, 10)
    }));
  };

  useEffect(() => {
    const handleAuth = async () => {
      try {
        await enokiFlow.handleAuthCallback();
        window.history.replaceState(null, '', window.location.pathname);
      } catch (err: any) { console.error(err); }
    };
    if (window.location.hash.includes("id_token=")) handleAuth();
  }, [enokiFlow]);

  useEffect(() => {
    if (isLoggedIn) {
      loadCategories();
      loadMyCards();
    }
  }, [isLoggedIn, safeAddress]);

  const loadCategories = async () => {
    if (!isLoggedIn) return;
    try {
      const res = await fetch(`https://api.blankd.top/api/get-categories?wallet_address=${safeAddress}`);
      const data = await res.json();
      if (res.ok) setCategories(data.categories || []);
    } catch (err) { console.error(err); }
  };

  const loadMyCards = async () => {
    if (!isLoggedIn) return;
    try {
      const res = await fetch(`https://api.blankd.top/api/my-cards?wallet_address=${safeAddress}`);
      const data = await res.json();
      if (res.ok) setSavedCards(data.cards || []);
    } catch (err) { console.error(err); }
  };

  const uploadFile = async (type: 'law' | 'exam') => {
    const targetFile = type === 'law' ? file : examFile;
    if (!targetFile) return alert("⚠️ 업로드할 파일을 먼저 선택해주세요.");
    
    updatePanel('loading', '통신 상태 확인 중', '백엔드 서버와 연결이 가능한지 핑(Ping) 테스트를 진행합니다...');
    
    try {
      const healthCheck = await fetch("https://api.blankd.top/api/health");
      if (!healthCheck.ok) throw new Error("서버 응답 오류");
    } catch (error: any) {
      updatePanel('error', '네트워크 연결 끊김 (Failed to Fetch)', `백엔드 서버와 통신할 수 없습니다: ${error.message}`);
      alert(`[🚨 치명적 연결 오류]\n서버와 통신할 수 없습니다.`);
      return;
    }

    updatePanel('loading', '파일 전송 및 파싱 중', `${targetFile.name} 파일을 분석 엔진으로 전송하고 있습니다...`);
    const formData = new FormData();
    formData.append("file", targetFile);
    formData.append("wallet_address", safeAddress);
    
    try {
      const endpoint = type === 'law' ? 'upload-pdf' : 'upload-exam';
      const res = await fetch(`https://api.blankd.top/api/${endpoint}`, {
        method: "POST",
        body: formData,
      });
      
      const responseText = await res.text(); 
      let data;
      try { data = JSON.parse(responseText); } 
      catch (e) { throw new Error(`알 수 없는 백엔드 응답:\n${responseText.substring(0,200)}`); }

      if (!res.ok) throw new Error(data.details || data.error || "서버 에러");
      
      updatePanel('success', '완료', type === 'law' ? `법령이 등록되었습니다.` : `모의고사가 파싱 및 저장되었습니다.`);
      if (type === 'law') { setFile(null); loadCategories(); } 
      else { setExamFile(null); }
    } catch (err: any) {
      updatePanel('error', '오류 발생', err.message);
      alert(`[🚨 오류 발생]\n${err.message}`);
    }
  };

  const handleAutoMakeCard = async (cat: Category, silent = false) => {
    if (!isLoggedIn) return;
    updatePanel('loading', 'AI 빈칸 추천 중', `[${cat.title}] 모의고사를 바탕으로 최적의 빈칸을 추출합니다...`);
    
    try {
      const res = await fetch("https://api.blankd.top/api/auto-make-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: safeAddress, category_id: cat.id, content: cat.content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      
      updatePanel('success', 'AI 추출 완료', data.message);
      loadMyCards();
    } catch (err: any) {
      updatePanel('error', '추출 실패', err.message);
    }
  };

  const handleBatchAutoMake = async () => {
    if (!isLoggedIn || categories.length === 0) return;
    if (!confirm("모든 문헌에서 일괄 추출을 진행하시겠습니까?")) return;
    
    for (let i = 0; i < categories.length; i++) {
      updatePanel('loading', '일괄 추출 중', `전체 문헌을 분석하고 있습니다...`, i + 1, categories.length);
      await handleAutoMakeCard(categories[i], true);
    }
    
    updatePanel('success', '일괄 완료', `모든 분석이 완료되었습니다.`);
    loadMyCards();
  };

  const handleDeleteCategory = async (cat_id: number) => {
    if (!isLoggedIn || !confirm("이 문헌을 개별 삭제하시겠습니까?")) return;
    try {
      const res = await fetch("https://api.blankd.top/api/delete-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: safeAddress, id: cat_id }),
      });
      if (res.ok) {
        alert("삭제되었습니다.");
        loadCategories();
      }
    } catch (err) { alert("삭제 실패"); }
  };

  const handleDeleteCard = async (card_id: number) => {
    if (!isLoggedIn || !confirm("이 카드를 영구 삭제하시겠습니까?")) return;
    try {
      const res = await fetch("https://api.blankd.top/api/delete-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: safeAddress, id: card_id }),
      });
      if (res.ok) {
        alert("카드가 삭제되었습니다.");
        loadMyCards();
      }
    } catch (err) { alert("삭제 실패"); }
  };

  const handleDeleteAll = async () => {
    if (!isLoggedIn || !confirm("보관소의 모든 데이터를 영구적으로 지우시겠습니까?")) return;
    const res = await fetch("https://api.blankd.top/api/delete-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet_address: safeAddress }),
    });
    if (res.ok) {
      alert("초기화되었습니다.");
      setCategories([]); setSavedCards([]); setParsedText(""); setFile(null); setExamFile(null);
      updatePanel('idle', '초기화 완료', '데이터가 리셋되었습니다.');
    }
  };

  const handleGoogleZkLogin = async () => {
    try {
      const createUrl = (enokiFlow as any).createAuthorizationURL || enokiFlow.createAuthorizationUrl;
      const url = await createUrl.call(enokiFlow, {
        provider: 'google',
        clientId: '536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com',
        redirectUrl: window.location.origin,
        network: 'testnet'
      });
      window.location.href = url;
    } catch (err: any) { alert(`로그인 에러: ${err.message}`); }
  };

  const handleGithubPull = async () => {
    try {
      const res = await fetch("https://api.blankd.top/api/github-pull", { method: 'POST' });
      const data = await res.json();
      alert(data.message || data.error);
    } catch (err) { alert("서버 연결 실패"); }
  };

  const loadTextForManualSelection = async (cat: Category) => {
    setParsedText(cat.content);
    setSelectedWordIndices(new Set()); 
    setAiExplanation("");
    updatePanel('loading', '기출 검색 중', '해당 조항과 관련된 문제를 검색합니다...');

    try {
      const res = await fetch("https://api.blankd.top/api/get-related-exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: cat.content, wallet_address: safeAddress }),
      });
      const data = await res.json();
      setRelatedExams(data.related_exams || []);
      updatePanel('idle', '준비 완료', '조항 분석 및 검색이 완료되었습니다.');
    } catch (err) {
      updatePanel('error', '검색 실패', '관련 기출문제 로드 중 에러가 발생했습니다.');
    }
  };

  const getAiExplanation = async (exam: any) => {
    setAiExplanation("AI가 법령을 근거로 해설을 작성하고 있습니다. 잠시만 기다려주세요...");
    try {
      const res = await fetch("https://api.blankd.top/api/generate-explanation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ law_text: parsedText, question: exam.question, answer: exam.answer }),
      });
      const data = await res.json();
      setAiExplanation(data.explanation || "해설 생성에 실패했습니다.");
    } catch (err) {
      setAiExplanation("서버와의 통신 오류로 해설을 가져오지 못했습니다.");
    }
  };

  const toggleWordSelection = (index: number) => {
    const newSet = new Set(selectedWordIndices);
    if (newSet.has(index)) newSet.delete(index);
    else newSet.add(index);
    setSelectedWordIndices(newSet);
  };

  const handleMakeBlankCard = async () => {
    if (!isLoggedIn || selectedWordIndices.size === 0) return alert("단어를 선택해주세요.");
    updatePanel('loading', '수동 저장 중', '카드를 저장하고 있습니다...');
    
    const words = parsedText.split(SPLIT_REGEX);
    let cardContent = ""; 
    let answerText = ""; 
    let isBlanking = false; 

    words.forEach((word, index) => {
      if (word === undefined || word === '') return;
      const isSelected = selectedWordIndices.has(index) && word.trim() !== "";

      if (isSelected) {
        if (!isBlanking) {
          cardContent += "[ ";
          if (answerText.length > 0) answerText += ", ";
          isBlanking = true;
        }
        cardContent += word;
        answerText += word;
      } else {
        if (isBlanking) {
          cardContent += " ]";
          isBlanking = false;
        }
        cardContent += word;
      }
    });
    
    if (isBlanking) {
      cardContent += " ]";
    }

    try {
      const res = await fetch("https://api.blankd.top/api/save-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: safeAddress, card_content: cardContent, answer_text: answerText }),
      });
      if (res.ok) {
        setSelectedWordIndices(new Set());
        setParsedText(""); 
        loadMyCards();
        updatePanel('success', '저장 완료', '카드가 성공적으로 추가되었습니다.');
      }
    } catch(err:any) {
      updatePanel('error', '저장 실패', err.message);
    }
  };

  const submitCombatAnswer = async (inputAnswer: string) => {
    if (!activeCard) return;
    
    // 단순 공백 제거 및 소문자화 후 비교 (관대한 채점)
    const isCorrect = inputAnswer.replace(/\s+/g, '').toLowerCase() === activeCard.answer.replace(/\s+/g, '').toLowerCase();
    
    const res = await fetch("https://api.blankd.top/api/submit-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card_id: activeCard.id, is_correct: isCorrect }),
    });
    if (res.ok) {
      alert(isCorrect ? "지식 보존 성공! 정답입니다." : `지식 보존 실패. 정답: [${activeCard.answer}]`);
      setActiveCard(null);
      loadMyCards();
    }
  };

  const getLevelTier = (level: number) => {
    if (level === 0) return "일반 (Normal)";
    if (level === 1) return "희귀 (Rare)";
    if (level === 2) return "영웅 (Epic)";
    return "전설 (Legend)";
  };
  
  const getTierClass = (level: number) => {
    if (level === 0) return "border-neutral-800 text-neutral-400";
    if (level === 1) return "border-blue-900/50 text-blue-300/80";
    if (level === 2) return "border-purple-900/50 text-purple-300/80";
    return "border-amber-900/50 text-amber-300/80";
  };

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-[#d1d1d1] font-sans selection:bg-neutral-800 selection:text-white p-6 sm:p-12 relative">
      
      <header className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:justify-between sm:items-baseline border-b border-white/10 pb-8 mb-12 gap-4">
        <div>
          <h1 className="text-2xl font-light tracking-[0.3em] text-white uppercase">Blank_D</h1>
          <p className="text-[10px] text-white/30 mt-2 uppercase tracking-widest">AI & Mock-Exam Driven Archive</p>
        </div>
        {isLoggedIn && <div className="text-right text-[10px] text-white/30 tracking-wider">ID: {safeAddress.substring(0, 12)}...</div>}
      </header>

      <main className="max-w-6xl mx-auto">
        {!isLoggedIn ? (
          <div className="flex flex-col items-center justify-center py-40">
            <button onClick={handleGoogleZkLogin} className="px-10 py-3 border border-white/20 hover:border-white/60 text-white/80 hover:text-white transition-all text-sm tracking-widest font-light">
              Google 이메일로 열기
            </button>
          </div>
        ) : (
          <>
            <nav className="flex gap-8 mb-16 border-b border-white/5 pb-4 overflow-x-auto scrollbar-hide">
              {[
                { id: 'dashboard', label: '열람실' },
                { id: 'craft', label: '지식 추출' },
                { id: 'enhance', label: '기억 강화' },
                { id: 'mypage', label: '설정' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`text-xs font-light tracking-[0.1em] transition-all whitespace-nowrap pb-4 -mb-[17px]
                    ${activeTab === tab.id ? 'text-white border-b border-white/50' : 'text-white/30 hover:text-white/60'}
                  `}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {activeTab === 'craft' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 animate-in fade-in duration-700">
                {/* 좌측 패널: 업로드 및 목록 */}
                <div className="lg:col-span-6 space-y-12">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h3 className="text-sm font-light tracking-[0.2em] text-white/80 border-b border-white/5 pb-2">1. 법령 문헌 업로드</h3>
                      <label className="block border border-dashed border-white/20 p-8 text-center hover:border-white/40 cursor-pointer">
                        <input type="file" accept=".pdf,.txt,.docx,.html,.htm" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
                        <div className="text-[10px] text-white/40">{file ? `✅ ${file.name}` : "파일 선택 (.pdf, .html)"}</div>
                      </label>
                      <button onClick={() => uploadFile('law')} className="w-full py-3 border border-white/10 hover:bg-white/10 text-xs">법령분석 개시</button>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-sm font-light tracking-[0.2em] text-teal-500/80 border-b border-white/5 pb-2">2. 모의고사 구조화</h3>
                      <label className="block border border-dashed border-teal-900/40 p-8 text-center hover:border-teal-500/40 cursor-pointer">
                        <input type="file" accept=".pdf,.txt,.docx,.html,.htm" onChange={(e) => setExamFile(e.target.files?.[0] || null)} className="hidden" />
                        <div className="text-[10px] text-teal-500/40">{examFile ? `✅ ${examFile.name}` : "파일 선택 (.pdf, .html)"}</div>
                      </label>
                      <button onClick={() => uploadFile('exam')} className="w-full py-3 border border-teal-900/30 hover:bg-teal-900/20 text-teal-500/80 text-xs">문제/정답/해설 DB 등록</button>
                    </div>
                  </div>

                  {categories.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-baseline border-b border-white/5 pb-2">
                        <div className="text-xs font-light text-white/60 tracking-widest">분석된 문헌 리스트</div>
                        <button onClick={handleBatchAutoMake} className="text-[10px] text-indigo-400">일괄 자동 추출</button>
                      </div>
                      <div className="flex gap-2 mb-4 mt-2">
                        <button onClick={() => setViewMode('all')} className={`px-3 py-1 text-[10px] rounded-sm transition-all ${viewMode === 'all' ? 'bg-white/20 text-white' : 'border border-white/10 text-white/40 hover:text-white/80'}`}>전체</button>
                        <button onClick={() => setViewMode('법')} className={`px-3 py-1 text-[10px] rounded-sm transition-all ${viewMode === '법' ? 'bg-white/20 text-white' : 'border border-white/10 text-white/40 hover:text-white/80'}`}>법률</button>
                        <button onClick={() => setViewMode('령')} className={`px-3 py-1 text-[10px] rounded-sm transition-all ${viewMode === '령' ? 'bg-white/20 text-white' : 'border border-white/10 text-white/40 hover:text-white/80'}`}>시행령</button>
                        <button onClick={() => setViewMode('칙')} className={`px-3 py-1 text-[10px] rounded-sm transition-all ${viewMode === '칙' ? 'bg-white/20 text-white' : 'border border-white/10 text-white/40 hover:text-white/80'}`}>시행규칙</button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 max-h-[350px] overflow-y-auto scrollbar-hide">
                        {categories.filter(c => viewMode === 'all' || c.title.includes(`[${viewMode}]`)).map(cat => (
                          <div key={cat.id} className="border border-white/5 p-4 flex justify-between items-center group bg-white/[0.01]">
                            <div className="flex-1 cursor-pointer pr-4" onClick={() => loadTextForManualSelection(cat)}>
                              <div className="text-xs text-white/80">{cat.title}</div>
                              <div className="text-[10px] text-white/30 truncate mt-1">{cat.content}</div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => handleDeleteCategory(cat.id)} className="text-[10px] border border-rose-900/30 text-rose-500/60 px-3 py-1.5 hover:border-rose-500/50 hover:bg-rose-900/20 whitespace-nowrap">
                                삭제
                              </button>
                              <button onClick={() => handleAutoMakeCard(cat)} className="text-[10px] border border-white/10 px-3 py-1.5 hover:border-white/40 whitespace-nowrap">
                                분석
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 🚨 수동 터미널 */}
                  {parsedText && (
                    <div className="space-y-4">
                      <div className="text-xs text-white/60 border-b border-white/5 pb-2">수동 터미널 (단어 및 조사 개별 터치)</div>
                      <div ref={textRef} className="font-serif text-[14px] leading-[2.5] text-white/70 h-48 overflow-y-auto border border-white/10 p-5 bg-[#0a0a0c] scrollbar-hide break-all">
                        {parsedText.split(SPLIT_REGEX).map((word, idx) => {
                          if (word === undefined || word === '') return null;
                          if (/^\s+$/.test(word)) return <span key={idx}>{word}</span>;
                          
                          const isSelected = selectedWordIndices.has(idx);
                          return (
                            <span 
                              key={idx} 
                              onClick={() => toggleWordSelection(idx)} 
                              className={`cursor-pointer px-[1px] py-[2px] mx-[1px] rounded transition-colors duration-150 ${isSelected ? 'bg-amber-500 text-black font-bold shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'hover:bg-white/20'}`}
                            >
                              {word}
                            </span>
                          );
                        })}
                      </div>
                      <button onClick={handleMakeBlankCard} className="w-full py-3 border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 text-xs tracking-widest">선택 지식 병합 및 추출</button>
                    </div>
                  )}
                </div>

                {/* 우측 패널 */}
                <div className="lg:col-span-6 flex flex-col space-y-6">
                  <div className="border border-indigo-900/30 bg-indigo-950/5 rounded-sm overflow-hidden sticky top-12 flex-shrink-0">
                    <div className="border-b border-indigo-900/30 p-4 bg-indigo-950/20 flex justify-between items-center">
                      <span className="text-[10px] tracking-widest text-indigo-400 font-bold uppercase">System Terminal</span>
                      <div className={`w-2 h-2 rounded-full ${panelState.status === 'loading' ? 'bg-indigo-500 animate-ping' : panelState.status === 'error' ? 'bg-rose-500' : 'bg-teal-500'}`}></div>
                    </div>
                    <div className="p-6 text-center space-y-3">
                      <div className={`text-sm tracking-widest ${panelState.status === 'error' ? 'text-rose-400' : 'text-white'}`}>{panelState.title}</div>
                      <div className="text-[11px] text-white/50 leading-relaxed font-light">{panelState.message}</div>
                      {panelState.total > 0 && (
                        <div className="w-full px-8 pt-2">
                          <div className="w-full bg-white/5 h-1 mb-2 rounded-full overflow-hidden">
                            <div className="bg-indigo-500 h-full transition-all duration-500" style={{ width: `${(panelState.current / panelState.total) * 100}%` }}></div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="h-20 bg-[#070709] border-t border-indigo-900/30 p-3 overflow-y-auto font-mono text-[9px] text-white/30 flex flex-col-reverse">
                      {panelState.logs.map((log, i) => <div key={i}>{log}</div>)}
                    </div>
                  </div>

                  <div className="flex-1 border border-indigo-900/30 bg-black/40 p-6 rounded-sm min-h-[300px]">
                    <h3 className="text-xs font-bold text-indigo-400 mb-6 tracking-widest uppercase">Related Mock-Exams</h3>
                    {relatedExams.length > 0 ? (
                      <div className="space-y-6 overflow-y-auto max-h-[500px] scrollbar-hide pr-2">
                        {relatedExams.map((exam, i) => (
                          <div key={i} className="p-4 bg-white/5 border border-white/10 rounded-sm">
                            <p className="text-xs text-amber-400 mb-2 leading-relaxed">Q. {exam.question}</p>
                            <p className="text-[11px] text-white/60 mb-4">A. {exam.answer}</p>
                            
                            {exam.explanation && exam.explanation.trim() !== "" && (
                              <p className="text-[10px] text-white/40 mb-4 bg-black/50 p-2 border border-white/5">
                                기존 해설: {exam.explanation}
                              </p>
                            )}

                            <button 
                              onClick={() => getAiExplanation(exam)}
                              className="text-[9px] px-3 py-1.5 border border-indigo-500/50 text-indigo-300 hover:bg-indigo-500/10 tracking-widest uppercase"
                            >
                              Gemma 26B 법령근거 해설 요청
                            </button>
                          </div>
                        ))}
                        
                        {aiExplanation && (
                          <div className="mt-6 p-5 border border-indigo-500/30 bg-indigo-950/20 rounded-sm">
                            <div className="text-[10px] text-indigo-300 mb-3 font-bold uppercase">AI Rationale Explanation</div>
                            <div className="text-[11px] leading-relaxed text-white/80 font-serif">
                              {aiExplanation}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="h-40 flex items-center justify-center text-[10px] text-white/20 uppercase tracking-widest">
                        관련된 기출문제가 없습니다.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Dashboard 탭 */}
            {activeTab === 'dashboard' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 animate-in fade-in">
                <div className="border border-white/10 p-8 rounded-sm bg-white/[0.02]">
                  <div className="text-[10px] text-white/30 mb-4 tracking-widest uppercase">보유 지식 (카드)</div>
                  <div className="text-4xl font-light text-white/90">{savedCards.length}</div>
                </div>
                <div className="border border-rose-900/30 p-8 rounded-sm bg-rose-950/10">
                  <div className="text-[10px] text-rose-400/50 mb-4 tracking-widest uppercase">망각 경고 (위험)</div>
                  <div className="text-4xl font-light text-rose-400/80">{savedCards.filter(c => c.status === 'AT_RISK').length}</div>
                </div>
                <div className="border border-amber-900/30 p-8 rounded-sm bg-amber-950/10">
                  <div className="text-[10px] text-amber-500/50 mb-4 tracking-widest uppercase">영구 보존 (전설)</div>
                  <div className="text-4xl font-light text-amber-500/80">{savedCards.filter(c => c.level >= 3).length}</div>
                </div>
              </div>
            )}

            {/* Enhance 탭 */}
            {activeTab === 'enhance' && (
              <div className="space-y-8 animate-in fade-in">
                <div className="flex justify-between items-center mb-4">
                  <div className="text-xs text-white/60">레이아웃 단수 설정</div>
                  <div className="flex gap-2">
                    {[2, 3, 4].map(num => (
                      <button key={num} onClick={() => setColCount(num)} className={`px-3 py-1 text-[10px] rounded-sm transition-all ${colCount === num ? 'bg-white/20 text-white' : 'border border-white/10 text-white/40 hover:text-white/80'}`}>{num}단</button>
                    ))}
                  </div>
                </div>
                {savedCards.length === 0 ? (
                  <div className="py-32 text-center text-white/20 text-xs tracking-widest">보관된 지식이 없습니다.</div>
                ) : (
                  <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
                    {Array.from({ length: colCount }).map((_, colIndex) => (
                      <div 
                        key={colIndex} 
                        className="min-h-[300px] border border-white/5 bg-white/[0.005] p-2 rounded-sm"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const cardId = parseInt(e.dataTransfer.getData('cardId'));
                          if (!isNaN(cardId)) updateCardColumn(cardId, colIndex);
                        }}
                      >
                        <div className="text-[10px] text-white/30 mb-4 text-center border-b border-white/5 pb-2">COLUMN {colIndex + 1}</div>
                        <div className="flex flex-col gap-4">
                          {savedCards.filter(c => (cardColumns[c.id] || 0) % colCount === colIndex).map((card) => {
                            const isExpanded = expandedCardId === card.id;
                            const displayTitle = card.content.substring(0, 20).replace(/\[.*?\]/g, '___') + "...";
                            return (
                              <div 
                                key={card.id} 
                                draggable 
                                onDragStart={(e) => e.dataTransfer.setData('cardId', card.id.toString())}
                                onClick={(e) => { e.stopPropagation(); setExpandedCardId(isExpanded ? null : card.id); }}
                                className={`expandable-card border p-5 transition-all cursor-pointer relative bg-white/[0.01] rounded-sm
                                  ${card.status === "BURNED" ? "border-white/5 opacity-30" : getTierClass(card.level)}`}
                              >
                                <div className="flex justify-between items-start mb-4">
                                  <span className="text-[10px] tracking-widest font-light">{getLevelTier(card.level)}</span>
                                  <div className="flex items-center gap-3">
                                    <span className="text-[10px] tracking-widest font-light text-white/40">LV.{card.level}</span>
                                    {card.status !== "BURNED" && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); handleDeleteCard(card.id); }} 
                                        className="text-[10px] text-rose-500/60 hover:text-rose-400 tracking-widest"
                                      >
                                        삭제
                                      </button>
                                    )}
                                  </div>
                                </div>
                                
                                {!isExpanded ? (
                                  <div className="text-[13px] font-serif text-white/80">{displayTitle}</div>
                                ) : (
                                  <div className="animate-in fade-in zoom-in-95 duration-200">
                                    <div className="text-[13px] leading-loose font-serif text-white/80 mb-6">
                                       {renderMaskedContent(card.content)}
                                    </div>
                                    <button 
                                       onClick={(e) => { e.stopPropagation(); setAnswerInput(""); setActiveCard(card); setExpandedCardId(null); }}
                                       className="w-full py-2 border border-white/10 text-[11px] text-white/60 hover:bg-white/10 hover:text-white transition-all"
                                    >
                                       기억 복원 도전 (타이핑)
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Mypage 탭 */}
            {activeTab === 'mypage' && (
              <div className="max-w-md mx-auto space-y-8 py-16 animate-in fade-in">
                <button onClick={handleGithubPull} className="w-full py-4 border border-teal-500/30 hover:border-teal-500/80 text-teal-300 text-xs">최신 코드 강제 동기화 (Pull)</button>
                <button onClick={handleDeleteAll} className="w-full py-4 border border-rose-900/30 text-rose-500/70 text-xs">전체 데이터 일괄 초기화</button>
                <div className="[&>button]:!w-full [&>button]:!bg-transparent [&>button]:!border [&>button]:!border-white/20 [&>button]:!text-white/80 [&>button]:!font-light [&>button]:!text-xs [&>button]:!tracking-widest [&>button]:!rounded-sm"><ConnectButton /></div>
              </div>
            )}
          </>
        )}
      </main>

      {/* 학습 강화 모달 (타이핑 버전) */}
      {activeCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0d0d0f]/95 backdrop-blur-sm animate-in fade-in">
          <div className="border border-white/10 bg-[#121214] w-full max-w-2xl p-10 shadow-2xl rounded-sm">
            <div className="flex justify-between items-baseline border-b border-white/5 pb-6 mb-8">
              <span className="font-light tracking-[0.2em] text-sm text-white/80">기억 복원 (LV.{activeCard.level})</span>
              <button onClick={() => setActiveCard(null)} className="text-white/40 hover:text-white text-sm font-light"> 닫기 </button>
            </div>
            <div className="p-8 border border-white/5 bg-[#0a0a0c] text-[15px] leading-loose font-serif text-white/90 mb-8 rounded-sm">
              {renderMaskedContent(activeCard.content)}
            </div>
            <div className="flex flex-col gap-4">
              <input 
                type="text" 
                autoFocus
                value={answerInput} 
                onChange={(e) => setAnswerInput(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && submitCombatAnswer(answerInput)}
                placeholder="빈칸에 들어갈 정답을 정확히 타이핑하세요"
                className="w-full bg-black/50 border border-white/20 p-4 text-white text-sm outline-none focus:border-indigo-500 transition-all"
              />
              <button 
                onClick={() => submitCombatAnswer(answerInput)} 
                className="w-full py-4 bg-indigo-600/20 border border-indigo-500/50 hover:bg-indigo-600/40 text-indigo-300 text-sm tracking-widest transition-all"
              >
                정답 제출
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`.scrollbar-hide::-webkit-scrollbar { display: none; } .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
    </div>
  );
}
export default App;
