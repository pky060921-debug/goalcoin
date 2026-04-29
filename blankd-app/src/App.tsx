import { useState, useEffect, useRef } from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";

interface Category { id: number; title: string; content: string; }
interface Card { id: number; content: string; answer: string; options: string[]; level: number; next_review: string; status: string; }

function App() {
  const enokiFlow = useEnokiFlow();
  const zkLogin = useZkLogin();
  const suiWalletAccount = useCurrentAccount();
  
  const safeAddress = suiWalletAccount?.address || zkLogin?.address || "";
  const isLoggedIn = safeAddress.length > 0;

  const [activeTab, setActiveTab] = useState('dashboard');
  const [file, setFile] = useState<File | null>(null);
  const [examFile, setExamFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isBatching, setIsBatching] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [savedCards, setSavedCards] = useState<Card[]>([]);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  
  const [aiText, setAiText] = useState("");
  const [aiResult, setAiResult] = useState<any>(null);

  const [parsedText, setParsedText] = useState("");
  const [selectedWordIndices, setSelectedWordIndices] = useState<Set<number>>(new Set());
  const textRef = useRef<HTMLDivElement>(null);

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
    if (!targetFile) return alert("⚠️ 파일이 제대로 선택되지 않았습니다. 점선 박스를 눌러 파일을 먼저 선택해주세요!");
    if (!isLoggedIn) return alert("⚠️ 로그인 정보(지갑 주소)를 찾을 수 없습니다.");
    
    setIsProcessing(true);
    alert(`[진단 1단계] ${targetFile.name} 파일을 서버로 전송합니다... (확인을 누르시면 진행됩니다)`);
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
      alert(`[진단 2단계] 서버에서 응답이 도착했습니다! (상태 코드: ${res.status})`);
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`백엔드가 에러 페이지(HTML 등)를 보냈습니다:\n${responseText.substring(0, 100)}...`);
      }

      if (!res.ok) throw new Error(data.details || data.error || "알 수 없는 서버 에러");
      alert(type === 'law' ? "✅ 법령 문헌이 성공적으로 등록되었습니다." : "✅ 모의고사 데이터가 성공적으로 추가되었습니다.");
      if (type === 'law') loadCategories();
    } catch (err: any) {
      alert(`[🚨 문제은행 업로드 치명적 오류]\n${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAutoMakeCard = async (cat: Category, silent = false) => {
    if (!isLoggedIn) return;
    setIsProcessing(true);
    try {
      const res = await fetch("https://api.blankd.top/api/auto-make-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: safeAddress, category_id: cat.id, content: cat.content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      if (!silent) {
        alert(data.message);
        loadMyCards();
      }
    } catch (err: any) {
      if (!silent) alert(`[오류] AI 추출 실패: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBatchAutoMake = async () => {
    if (!isLoggedIn || categories.length === 0) return;
    if (!confirm("모든 문헌에서 26B 모델 기반 일괄 추출을 진행하시겠습니까?\n(문헌 수에 따라 시간이 꽤 소요될 수 있습니다.)")) return;
    
    setIsBatching(true);
    for (const cat of categories) {
      await handleAutoMakeCard(cat, true);
    }
    setIsBatching(false);
    alert("모든 문헌의 일괄 추출이 완료되었습니다.");
    loadMyCards();
    setActiveTab('enhance');
  };

  const handleDeleteAll = async () => {
    if (!isLoggedIn || !confirm("보관소의 모든 데이터(법령, 카드, 모의고사, AI분석)를 영구적으로 지우시겠습니까?")) return;
    const res = await fetch("https://api.blankd.top/api/delete-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet_address: safeAddress }),
    });
    if (res.ok) {
      alert("모든 기록이 소각되었습니다.");
      setCategories([]); setSavedCards([]); setParsedText(""); setFile(null); setExamFile(null); setAiResult(null);
    }
  };

  const handleGoogleZkLogin = async () => {
    try {
      const createUrl = (enokiFlow as any).createAuthorizationURL || enokiFlow.createAuthorizationUrl;
      if (!createUrl) throw new Error("Enoki 인증 함수를 찾을 수 없습니다.");
      const url = await createUrl.call(enokiFlow, {
        provider: 'google',
        clientId: '536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com',
        redirectUrl: window.location.origin,
        network: 'testnet'
      });
      window.location.href = url;
    } catch (err: any) {
      alert(`[로그인 에러 발생!]\n원인: ${err.message}`);
    }
  };

  const handleGithubPull = async () => {
    if (!confirm("GitHub에서 최신 코드를 다운로드(Pull) 하여 서버를 업데이트 하시겠습니까?")) return;
    setIsProcessing(true);
    try {
      const res = await fetch("https://api.blankd.top/api/github-pull", { method: 'POST' });
      const data = await res.json();
      alert(data.message || data.error);
    } catch (err) {
      alert("서버 연결 실패");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAiAnalyze = async () => {
    if (!aiText) return alert("분석할 텍스트를 입력하세요.");
    if (!isLoggedIn) return alert("⚠️ 로그인 정보가 없습니다.");
    setIsProcessing(true);
    try {
      const res = await fetch("https://api.blankd.top/api/ai-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: safeAddress, text: aiText }),
      });
      const data = await res.json();
      if (res.ok) {
        setAiResult(data.data);
        alert("AI 분석이 완료되고 문제은행에 저장되었습니다!");
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      alert(`[AI 분석 오류]\n${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const loadTextForManualSelection = (content: string) => {
    setParsedText(content);
    setSelectedWordIndices(new Set()); 
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleWordSelection = (index: number) => {
    const newSet = new Set(selectedWordIndices);
    if (newSet.has(index)) newSet.delete(index);
    else newSet.add(index);
    setSelectedWordIndices(newSet);
  };

  const handleMakeBlankCard = async () => {
    if (!isLoggedIn) return;
    if (selectedWordIndices.size === 0) return alert("빈칸으로 만들 단어를 터치하여 선택해주세요.");

    setIsProcessing(true);
    const words = parsedText.split(/(\s+)/);
    let cardContent = "";
    let answerText = ""; 

    words.forEach((word, index) => {
      if (selectedWordIndices.has(index) && word.trim() !== "") {
        cardContent += `[ ${word} ]`;
        answerText += answerText ? ` ${word}` : word; 
      } else {
        cardContent += word;
      }
    });

    try {
      const res = await fetch("https://api.blankd.top/api/save-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: safeAddress, card_content: cardContent, answer_text: answerText }),
      });
      if (res.ok) {
        alert("선택하신 지식이 터치 카드로 기록되었습니다.");
        setSelectedWordIndices(new Set());
        setParsedText(""); 
        loadMyCards();
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const submitCombatAnswer = async (selectedOption: string) => {
    if (!activeCard) return;
    const isCorrect = selectedOption === activeCard.answer;
    const res = await fetch("https://api.blankd.top/api/submit-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card_id: activeCard.id, is_correct: isCorrect }),
    });
    if (res.ok) {
      alert(isCorrect ? "지식 보존 성공" : `지식 보존 실패. 정답: [${activeCard.answer}]`);
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
      
      <header className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:justify-between sm:items-baseline border-b border-white/10 pb-8 mb-12 gap-4">
        <div>
          <h1 className="text-2xl font-light tracking-[0.3em] text-white uppercase">Blank_D</h1>
          <p className="text-[10px] text-white/30 mt-2 uppercase tracking-widest">AI & Mock-Exam Driven Archive</p>
        </div>
    
        {isLoggedIn && (
          <div className="text-right text-[10px] text-white/30 tracking-wider">
            ID: {safeAddress.substring(0, 12)}...
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto">
        {!isLoggedIn ? (
          <div className="flex flex-col items-center justify-center py-40">
            <p className="text-xs font-light text-white/40 mb-12 tracking-[0.2em] uppercase">Enter the Archive</p>
            <button 
              onClick={handleGoogleZkLogin}
              className="px-10 py-3 border border-white/20 hover:border-white/60 text-white/80 hover:text-white transition-all text-sm tracking-widest font-light"
            >
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
                { id: 'mission', label: '임무' },
                { id: 'community', label: '집단 지성' },
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

            {activeTab === 'dashboard' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 animate-in fade-in duration-700">
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

            {activeTab === 'craft' && (
              <div className="space-y-16 animate-in fade-in duration-700">
                
                <div className="border border-indigo-900/30 p-8 rounded-sm bg-indigo-950/10 space-y-6">
                  <h3 className="text-sm font-light tracking-[0.2em] text-indigo-300">0. AI 조력자 능동 분석실</h3>
                  <textarea 
                    value={aiText} 
                    onChange={(e) => setAiText(e.target.value)}
                    rows={4} 
                    className="w-full bg-[#0a0a0c] border border-white/10 p-4 text-[13px] text-white/70 font-serif"
                    placeholder="모의고사나 법령 텍스트를 입력하면 AI가 분류, 요약, 핵심 빈칸을 추출하여 저장합니다."
                  />
                  <button onClick={handleAiAnalyze} className="w-full py-4 border border-indigo-500/50 text-indigo-300 hover:bg-indigo-500/10 transition-all text-xs font-light tracking-widest">
                    AI 분석 및 문제은행 등록
                  </button>
                  
                  {aiResult && (
                    <div className="mt-6 p-6 border border-white/10 bg-black/40 text-[13px] text-white/80 space-y-2">
                      <p><strong className="text-indigo-400">주제:</strong> {aiResult.topic}</p>
                      <p><strong className="text-indigo-400">요약:</strong> {aiResult.summary}</p>
                      <p><strong className="text-teal-400">추천 빈칸:</strong> {aiResult.recommended_blanks?.join(", ")}</p>
                      {aiResult.quiz && (
                        <div className="mt-4 p-4 border border-white/5 bg-white/[0.02]">
                          <p className="text-amber-400 font-bold mb-2">Q. {aiResult.quiz.question}</p>
                          <ul className="pl-4">
                            {aiResult.quiz.options?.map((opt: string, i: number) => <li key={i}>{i+1}. {opt}</li>)}
                          </ul>
                          <p className="mt-2 text-white/50">정답: {aiResult.quiz.answer}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-6">
                    <div className="flex justify-between items-baseline border-b border-white/5 pb-4">
                      <h3 className="text-sm font-light tracking-[0.2em] text-white/80">1. 법령 문헌 수집</h3>
                      <button onClick={handleDeleteAll} className="text-[10px] text-rose-500/60 hover:text-rose-400 transition-all tracking-widest">
                        데이터 전체 소각
                      </button>
                    </div>
                    <label className="block relative border border-dashed border-white/20 p-12 text-center rounded-sm hover:border-white/40 hover:bg-white/[0.01] transition-all cursor-pointer">
                      <input type="file" accept="*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
                      <div className="text-xs font-light text-white/40 tracking-wider">
                        {file ? `✅ 선택됨: ${file.name}` : "이곳을 눌러 문서(법령 등) 업로드"}
                      </div>
                    </label>
                    <button 
                      onClick={() => uploadFile('law')} 
                      className={`w-full py-4 border transition-all text-xs font-light tracking-widest ${
                        file ? "border-white/50 text-white hover:bg-white/10" : "border-white/10 text-white/30 cursor-not-allowed"
                      }`}
                    >
                      법령 분석 개시
                    </button>
                  </div>

                  <div className="space-y-6">
                    <div className="flex justify-between items-baseline border-b border-white/5 pb-4">
                      <h3 className="text-sm font-light tracking-[0.2em] text-white/80">2. 모의고사 기출 수집</h3>
                    </div>
                    <label className="block relative border border-dashed border-white/20 p-12 text-center rounded-sm hover:border-white/40 hover:bg-white/[0.01] transition-all cursor-pointer">
                      <input type="file" accept="*" onChange={(e) => setExamFile(e.target.files?.[0] || null)} className="hidden" />
                      <div className="text-xs font-light text-white/40 tracking-wider">
                        {examFile ? `✅ 선택됨: ${examFile.name}` : "이곳을 눌러 문서(모의고사) 업로드"}
                      </div>
                    </label>
                    <button 
                      onClick={() => uploadFile('exam')} 
                      className={`w-full py-4 border transition-all text-xs font-light tracking-widest ${
                        examFile ? "border-teal-500/50 text-teal-300 hover:bg-teal-500/10" : "border-white/10 text-white/30 cursor-not-allowed"
                      }`}
                    >
                      가중치 데이터베이스에 추가
                    </button>
                  </div>
                </div>

                {categories.length > 0 && (
                  <div className="mt-16 space-y-6">
                    <div className="flex justify-between items-baseline border-b border-white/5 pb-4">
                      <div className="text-xs font-light tracking-widest text-white/60">분석된 문헌 리스트 ({categories.length})</div>
                      <button onClick={handleBatchAutoMake} className="text-[10px] text-blue-400/70 hover:text-blue-300 tracking-widest">
                        AI 일괄 자동 추출
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto scrollbar-hide pr-2">
                      {categories.map(cat => (
                        <div key={cat.id} className="border border-white/5 p-5 flex justify-between items-center group hover:border-white/20 transition-all bg-white/[0.01] rounded-sm">
                          <div className="flex-1 cursor-pointer" onClick={() => loadTextForManualSelection(cat.content)}>
                            <div className="text-sm font-medium text-white/80 tracking-wide">{cat.title}</div>
                            <div className="text-[11px] text-white/30 truncate mt-2 font-light">{cat.content}</div>
                          </div>
                          <button onClick={() => handleAutoMakeCard(cat)} className="text-[10px] text-white/40 group-hover:text-white/80 border border-white/10 px-4 py-2 hover:border-white/40 transition-all rounded-sm ml-4 whitespace-nowrap">
                            AI 26B 추출
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {parsedText && (
                  <div className="mt-16 space-y-6">
                    <div className="text-xs font-light text-white/60 tracking-widest border-b border-white/5 pb-4">수동 추출 터미널 (단어 터치)</div>
                    <div ref={textRef} className="font-serif text-[15px] leading-relaxed text-white/70 h-64 overflow-y-auto border border-white/10 p-8 bg-[#0a0a0c] rounded-sm scrollbar-hide">
                      {parsedText.split(/(\s+)/).map((word, idx) => {
                        if (word.trim() === '') return <span key={idx}>{word}</span>;
                        const isSelected = selectedWordIndices.has(idx);
                        return (
                          <span 
                            key={idx} 
                            onClick={() => toggleWordSelection(idx)}
                            className={`cursor-pointer px-1 mx-[1px] rounded transition-colors ${isSelected ? 'bg-amber-500/80 text-black font-bold' : 'hover:bg-white/10'}`}
                          >
                            {word}
                          </span>
                        );
                      })}
                    </div>
                    <button onClick={handleMakeBlankCard} className="w-full py-4 border border-white/10 hover:border-white/40 transition-all text-xs font-light tracking-widest text-white/80">
                      선택한 단어들을 빈칸 지식으로 변환 저장
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'enhance' && (
              <div className="space-y-8 animate-in fade-in duration-700">
                <div className="text-xs font-light tracking-widest text-white/60 border-b border-white/5 pb-4">기억 보관소 (덱)</div>
                
                {savedCards.length === 0 ? (
                  <div className="py-32 text-center text-white/20 text-xs tracking-widest font-light">보관된 지식이 없습니다. 지식 추출을 먼저 진행하십시오.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {savedCards.map((card) => {
                      const isBurned = card.status === "BURNED";
                      const isAtRisk = card.status === "AT_RISK";
                      return (
                        <div 
                          key={card.id} 
                          onClick={() => !isBurned && setActiveCard(card)}
                          className={`border p-6 transition-all cursor-pointer relative bg-white/[0.01] rounded-sm
                            ${isBurned ? "border-white/5 opacity-30" : getTierClass(card.level)}
                            ${!isBurned && "hover:border-white/50 hover:bg-white/[0.02]"}
                          `}
                        >
                          <div className="flex justify-between items-start mb-6">
                            <span className="text-[10px] tracking-widest font-light">{getLevelTier(card.level)}</span>
                            <span className="text-[10px] tracking-widest font-light text-white/40">LV.{card.level}</span>
                          </div>
                          
                          {isBurned && <div className="absolute inset-0 flex items-center justify-center font-light tracking-[0.5em] text-white/20">DELETED</div>}
                          {isAtRisk && <div className="text-[10px] text-rose-400/80 tracking-widest mb-3 blink">! 방어 요망</div>}

                          <div className="text-[13px] leading-loose font-serif text-white/80 line-clamp-3 mb-6">
                            {card.content}
                          </div>
                          
                          <div className="text-[9px] text-white/30 tracking-widest flex justify-between items-center border-t border-white/5 pt-4">
                            <span>보존 기한: {new Date(card.next_review).toLocaleDateString()}</span>
                            {!isBurned && <span className="text-white/50 group-hover:text-white/90">복습하기</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'mypage' && (
              <div className="max-w-md mx-auto space-y-12 animate-in fade-in duration-700 py-16">
                
                <div className="space-y-6 border border-teal-900/30 p-10 rounded-sm bg-teal-950/10">
                  <h3 className="text-xs font-light tracking-widest text-teal-400 border-b border-teal-500/20 pb-4">시스템 관리자 전용</h3>
                  <p className="text-[11px] text-white/40 leading-relaxed font-light">GitHub 저장소의 최신 커밋 내역을 서버로 동기화(Pull) 합니다.</p>
                  <button onClick={handleGithubPull} className="w-full py-4 border border-teal-500/50 text-teal-300 hover:bg-teal-500/20 font-light text-xs tracking-widest transition-all rounded-sm">
                    GitHub 최신 코드 강제 적용 (Pull)
                  </button>
                </div>

                <div className="space-y-6 border border-white/10 p-10 rounded-sm bg-white/[0.01]">
                  <h3 className="text-xs font-light tracking-widest text-white/60 border-b border-white/5 pb-4">외부 자산 연결</h3>
                  <p className="text-[11px] text-white/40 leading-relaxed font-light">
                    Slush 지갑 또는 PC 확장 프로그램을 연결하여 온체인 데이터를 동기화합니다.
                  </p>
                  <div className="[&>button]:!w-full [&>button]:!bg-transparent [&>button]:!border [&>button]:!border-white/20 [&>button]:!text-white/80 [&>button]:!font-light [&>button]:!text-xs [&>button]:!tracking-widest [&>button]:!rounded-sm hover:[&>button]:!border-white/60 hover:[&>button]:!text-white">
                    <ConnectButton connectText="지갑 연결하기" />
                  </div>
                </div>

                <div className="space-y-6 border border-white/10 p-10 rounded-sm bg-white/[0.01]">
                  <h3 className="text-xs font-light tracking-widest text-white/60 border-b border-white/5 pb-4">접속 종료</h3>
                  <button 
                    onClick={() => enokiFlow.logout().then(()=>window.location.reload())}
                    className="w-full py-4 border border-rose-900/30 text-rose-500/70 hover:text-rose-400 font-light text-xs tracking-widest transition-all rounded-sm"
                  >
                    로그아웃
                  </button>
                </div>
              </div>
            )}

            {(activeTab === 'mission' || activeTab === 'community') && (
              <div className="py-40 text-center border border-white/5 border-dashed rounded-sm mt-8">
                <div className="text-xs tracking-[0.3em] text-white/30 font-light">준비 중인 공간입니다.</div>
              </div>
            )}
          </>
        )}
      </main>

      {activeCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0d0d0f]/95 backdrop-blur-sm animate-in fade-in">
          <div className="border border-white/10 bg-[#121214] w-full max-w-2xl p-10 shadow-2xl rounded-sm">
            <div className="flex justify-between items-baseline border-b border-white/5 pb-6 mb-8">
              <span className="font-light tracking-[0.2em] text-sm text-white/80">기억 복원 (LV.{activeCard.level})</span>
              <button onClick={() => setActiveCard(null)} className="text-white/40 hover:text-white transition-colors text-sm font-light"> 닫기 </button>
            </div>
            
            <div className="p-8 border border-white/5 bg-[#0a0a0c] text-[15px] leading-loose font-serif text-white/90 mb-8 rounded-sm">
              {activeCard.content}
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              {activeCard.options?.map((opt, idx) => (
                <button 
                  key={idx}
                  onClick={() => submitCombatAnswer(opt)}
                  className="w-full text-left px-8 py-5 border border-white/10 hover:border-white/50 transition-all font-light text-[13px] tracking-wide text-white/80 rounded-sm hover:bg-white/[0.02]"
                >
                  <span className="inline-block w-8 text-white/30">{idx + 1}.</span> {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="fixed bottom-10 right-10 flex items-center gap-3 bg-black/80 px-4 py-2 border border-white/20 rounded-sm z-50">
          <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
          <span className="text-[10px] text-white/60 tracking-widest uppercase">System Processing...</span>
        </div>
      )}

      <style>{`
        .blink { animation: blink-animation 1.5s steps(2, start) infinite; }
        @keyframes blink-animation { to { visibility: hidden; } }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

export default App;
