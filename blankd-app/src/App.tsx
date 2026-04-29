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
  
  // 🚨 [UI 개편] 우측 진행 상황 패널을 위한 상태 관리
  const [panelState, setPanelState] = useState({
    status: 'idle', // 'idle' | 'loading' | 'success' | 'error'
    title: '시스템 대기 중',
    message: '법령 문헌을 선택하거나 분석 개시 버튼을 눌러주세요.',
    current: 0,
    total: 0,
    logs: [] as string[]
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [savedCards, setSavedCards] = useState<Card[]>([]);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [aiText, setAiText] = useState("");
  const [parsedText, setParsedText] = useState("");
  const [selectedWordIndices, setSelectedWordIndices] = useState<Set<number>>(new Set());
  const textRef = useRef<HTMLDivElement>(null);

  // 우측 터미널 패널 조작 함수
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

  // 🚨 [진단 시스템 탑재] 파일 업로드 및 Failed to Fetch 진단
  const uploadFile = async (type: 'law' | 'exam') => {
    const targetFile = type === 'law' ? file : examFile;
    if (!targetFile) return alert("⚠️ 업로드할 파일을 먼저 선택해주세요.");
    
    updatePanel('loading', '통신 상태 확인 중', '백엔드 서버와 연결이 가능한지 핑(Ping) 테스트를 진행합니다...');
    
    // 1단계 진단: 백엔드 생존 여부 핑 테스트
    try {
      const healthCheck = await fetch("https://api.blankd.top/api/health");
      if (!healthCheck.ok) throw new Error("서버가 응답하지만 에러를 반환했습니다.");
    } catch (error: any) {
      updatePanel('error', '네트워크 연결 끊김 (Failed to Fetch)', `백엔드 서버(맥미니)가 꺼져있거나, 클라우드플레어 터널 설정 오류, 혹은 CORS 정책에 의해 연결이 강제로 차단되었습니다. 자세한 에러: ${error.message}`);
      alert(`[🚨 치명적 연결 오류]\n서버와 통신할 수 없습니다. 터미널에서 pm2 status를 확인하거나 ngrok/cloudflare 터널이 켜져 있는지 확인하세요.`);
      return;
    }

    // 2단계 진단: 본격적인 업로드 시작
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
      catch (e) { throw new Error(`백엔드 엔진이 JSON 대신 알 수 없는 응답을 보냈습니다:\n${responseText.substring(0,200)}`); }

      if (!res.ok) throw new Error(data.details || data.error || "알 수 없는 서버 에러");
      
      updatePanel('success', '업로드 및 파싱 완료', `성공적으로 데이터가 등록되었습니다! 이제 문헌 리스트에서 AI 분석을 개시할 수 있습니다.`);
      if (type === 'law') {
        setFile(null);
        loadCategories();
      } else {
        setExamFile(null);
      }
    } catch (err: any) {
      updatePanel('error', '분석 엔진 치명적 오류', `코드 실행 중 에러가 발생했습니다: ${err.message}`);
      alert(`[🚨 엔진 오류 발생]\n${err.message}`);
    }
  };

  const handleAutoMakeCard = async (cat: Category, silent = false) => {
    if (!isLoggedIn) return;
    updatePanel('loading', 'AI 로컬 엔진 구동 중', `[${cat.title}] 조항을 26B 파라미터 모델이 분석하여 핵심 빈칸을 추출하고 있습니다...`);
    
    try {
      const res = await fetch("https://api.blankd.top/api/auto-make-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: safeAddress, category_id: cat.id, content: cat.content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      
      updatePanel('success', 'AI 추출 완료', `[${cat.title}] 분석 성공: ${data.message}`);
      loadMyCards();
    } catch (err: any) {
      updatePanel('error', 'AI 분석 실패', `[${cat.title}] 분석 중 오류가 발생했습니다: ${err.message}`);
    }
  };

  const handleBatchAutoMake = async () => {
    if (!isLoggedIn || categories.length === 0) return;
    if (!confirm("모든 문헌에서 일괄 추출을 진행하시겠습니까? 시간이 소요될 수 있습니다.")) return;
    
    for (let i = 0; i < categories.length; i++) {
      updatePanel('loading', 'AI 일괄 추출 진행 중', `전체 문헌을 순차적으로 분석하고 있습니다...`, i + 1, categories.length);
      await handleAutoMakeCard(categories[i], true);
    }
    
    updatePanel('success', '일괄 추출 대성공', `모든 문헌의 AI 분석이 완료되었습니다. 기억 강화 탭에서 확인하세요.`);
    loadMyCards();
  };

  const handleDeleteAll = async () => {
    if (!isLoggedIn || !confirm("보관소의 모든 데이터를 영구적으로 지우시겠습니까?")) return;
    const res = await fetch("https://api.blankd.top/api/delete-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet_address: safeAddress }),
    });
    if (res.ok) {
      alert("모든 기록이 소각되었습니다.");
      setCategories([]); setSavedCards([]); setParsedText(""); setFile(null); setExamFile(null);
      updatePanel('idle', '초기화 완료', '시스템이 성공적으로 리셋되었습니다.');
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
    } catch (err: any) { alert(`[로그인 에러 발생!]\n원인: ${err.message}`); }
  };

  const loadTextForManualSelection = (content: string) => {
    setParsedText(content);
    setSelectedWordIndices(new Set()); 
  };

  const toggleWordSelection = (index: number) => {
    const newSet = new Set(selectedWordIndices);
    if (newSet.has(index)) newSet.delete(index);
    else newSet.add(index);
    setSelectedWordIndices(newSet);
  };

  const handleMakeBlankCard = async () => {
    if (!isLoggedIn || selectedWordIndices.size === 0) return alert("단어를 선택해주세요.");
    updatePanel('loading', '수동 지식 저장 중', '선택하신 단어를 빈칸 카드로 변환하여 저장합니다...');
    
    const words = parsedText.split(/(\s+)/);
    let cardContent = ""; let answerText = ""; 
    words.forEach((word, index) => {
      if (selectedWordIndices.has(index) && word.trim() !== "") {
        cardContent += `[ ${word} ]`;
        answerText += answerText ? ` ${word}` : word; 
      } else { cardContent += word; }
    });

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
        updatePanel('success', '지식 각인 완료', '수동으로 선택하신 단어가 성공적으로 저장되었습니다.');
      }
    } catch(err:any) {
      updatePanel('error', '저장 오류', err.message);
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
      
      <header className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:justify-between sm:items-baseline border-b border-white/10 pb-8 mb-12 gap-4">
        <div>
          <h1 className="text-2xl font-light tracking-[0.3em] text-white uppercase">Blank_D</h1>
          <p className="text-[10px] text-white/30 mt-2 uppercase tracking-widest">AI Driven Legal Archive</p>
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
                {/* 🚨 [좌측 패널]: 업로드 및 파일 목록 */}
                <div className="lg:col-span-7 space-y-12">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h3 className="text-sm font-light tracking-[0.2em] text-white/80 border-b border-white/5 pb-2">1. 법령 문헌 업로드</h3>
                      <label className="block border border-dashed border-white/20 p-8 text-center hover:border-white/40 cursor-pointer">
                        <input type="file" accept=".pdf,.txt,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
                        <div className="text-[10px] text-white/40">{file ? `✅ ${file.name}` : "파일 선택"}</div>
                      </label>
                      <button onClick={() => uploadFile('law')} className="w-full py-3 border border-white/10 hover:bg-white/10 text-xs">법령분석 개시</button>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-sm font-light tracking-[0.2em] text-teal-500/80 border-b border-white/5 pb-2">2. 모의고사 가중치 추가</h3>
                      <label className="block border border-dashed border-teal-900/40 p-8 text-center hover:border-teal-500/40 cursor-pointer">
                        <input type="file" accept=".pdf,.txt,.docx" onChange={(e) => setExamFile(e.target.files?.[0] || null)} className="hidden" />
                        <div className="text-[10px] text-teal-500/40">{examFile ? `✅ ${examFile.name}` : "모의고사 파일 선택"}</div>
                      </label>
                      <button onClick={() => uploadFile('exam')} className="w-full py-3 border border-teal-900/30 hover:bg-teal-900/20 text-teal-500/80 text-xs">기출문제 등록</button>
                    </div>
                  </div>

                  {categories.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-baseline border-b border-white/5 pb-2">
                        <div className="text-xs font-light text-white/60 tracking-widest">분석된 문헌 리스트</div>
                        <button onClick={handleBatchAutoMake} className="text-[10px] text-indigo-400">일괄 자동 추출</button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 max-h-[350px] overflow-y-auto scrollbar-hide">
                        {categories.map(cat => (
                          <div key={cat.id} className="border border-white/5 p-4 flex justify-between items-center group bg-white/[0.01]">
                            <div className="flex-1 cursor-pointer pr-4" onClick={() => loadTextForManualSelection(cat.content)}>
                              <div className="text-xs text-white/80">{cat.title}</div>
                              <div className="text-[10px] text-white/30 truncate mt-1">{cat.content}</div>
                            </div>
                            <button onClick={() => handleAutoMakeCard(cat)} className="text-[10px] border border-white/10 px-3 py-1.5 hover:border-white/40 whitespace-nowrap">
                              분석
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {parsedText && (
                    <div className="space-y-4">
                      <div className="text-xs text-white/60 border-b border-white/5 pb-2">수동 터미널 (단어 터치)</div>
                      <div ref={textRef} className="font-serif text-[13px] leading-relaxed text-white/70 h-40 overflow-y-auto border border-white/10 p-4 bg-[#0a0a0c] scrollbar-hide">
                        {parsedText.split(/(\s+)/).map((word, idx) => {
                          if (word.trim() === '') return <span key={idx}>{word}</span>;
                          return (
                            <span key={idx} onClick={() => toggleWordSelection(idx)} className={`cursor-pointer px-1 mx-[1px] rounded ${selectedWordIndices.has(idx) ? 'bg-amber-500/80 text-black font-bold' : 'hover:bg-white/10'}`}>
                              {word}
                            </span>
                          );
                        })}
                      </div>
                      <button onClick={handleMakeBlankCard} className="w-full py-3 border border-white/10 hover:border-white/40 text-xs">선택 단어 추출</button>
                    </div>
                  )}
                </div>

                {/* 🚨 [우측 패널]: AI 진행 상황 및 터미널 모니터 */}
                <div className="lg:col-span-5 h-[600px] border border-indigo-900/30 bg-indigo-950/5 flex flex-col rounded-sm overflow-hidden sticky top-12">
                  <div className="border-b border-indigo-900/30 p-4 bg-indigo-950/20 flex justify-between items-center">
                    <span className="text-[10px] tracking-widest text-indigo-400 font-bold uppercase">AI Analysis Terminal</span>
                    <div className="flex gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${panelState.status === 'loading' ? 'bg-indigo-500 animate-ping' : panelState.status === 'error' ? 'bg-rose-500' : 'bg-teal-500'}`}></div>
                    </div>
                  </div>
                  
                  <div className="p-8 flex-1 flex flex-col justify-center items-center text-center space-y-6">
                    <div className={`text-sm font-light tracking-widest ${panelState.status === 'error' ? 'text-rose-400' : 'text-white'}`}>
                      {panelState.title}
                    </div>
                    
                    <div className="text-[11px] text-white/50 leading-relaxed font-light break-keep px-4">
                      {panelState.message}
                    </div>

                    {panelState.total > 0 && (
                      <div className="w-full max-w-[80%] pt-4">
                        <div className="w-full bg-white/5 h-1 mb-2 rounded-full overflow-hidden">
                          <div className="bg-indigo-500 h-full transition-all duration-500" style={{ width: `${(panelState.current / panelState.total) * 100}%` }}></div>
                        </div>
                        <div className="text-[9px] text-white/30 flex justify-between">
                          <span>PROGRESS</span>
                          <span>{panelState.current} / {panelState.total}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="h-40 bg-[#070709] border-t border-indigo-900/30 p-4 overflow-y-auto scrollbar-hide font-mono text-[9px] text-white/30 flex flex-col-reverse">
                    {panelState.logs.map((log, i) => <div key={i} className="mb-1">{log}</div>)}
                  </div>
                </div>
              </div>
            )}

            {/* (Dashboard, Enhance, Mypage, Modal 코드는 기존 구조 완벽 유지) */}
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

            {activeTab === 'enhance' && (
              <div className="space-y-8 animate-in fade-in">
                {savedCards.length === 0 ? (
                  <div className="py-32 text-center text-white/20 text-xs tracking-widest">보관된 지식이 없습니다.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {savedCards.map((card) => (
                      <div key={card.id} onClick={() => card.status !== "BURNED" && setActiveCard(card)}
                        className={`border p-6 transition-all cursor-pointer relative bg-white/[0.01] rounded-sm
                          ${card.status === "BURNED" ? "border-white/5 opacity-30" : getTierClass(card.level)}`}
                      >
                        <div className="flex justify-between mb-6 text-[10px] tracking-widest font-light">
                          <span>{getLevelTier(card.level)}</span><span className="text-white/40">LV.{card.level}</span>
                        </div>
                        <div className="text-[13px] leading-loose font-serif text-white/80 line-clamp-3 mb-6">{card.content}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'mypage' && (
              <div className="max-w-md mx-auto space-y-6 py-16 animate-in fade-in">
                <button onClick={handleDeleteAll} className="w-full py-4 border border-rose-900/30 text-rose-500/70 text-xs">전체 데이터 초기화</button>
                <div className="[&>button]:!w-full [&>button]:!bg-transparent [&>button]:!border [&>button]:!border-white/20 [&>button]:!text-white/80 [&>button]:!font-light [&>button]:!text-xs [&>button]:!tracking-widest [&>button]:!rounded-sm"><ConnectButton /></div>
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
              <button onClick={() => setActiveCard(null)} className="text-white/40 hover:text-white text-sm font-light"> 닫기 </button>
            </div>
            <div className="p-8 border border-white/5 bg-[#0a0a0c] text-[15px] leading-loose font-serif text-white/90 mb-8 rounded-sm">{activeCard.content}</div>
            <div className="grid grid-cols-1 gap-4">
              {activeCard.options?.map((opt, idx) => (
                <button key={idx} onClick={() => submitCombatAnswer(opt)} className="text-left px-8 py-5 border border-white/10 hover:border-white/50 text-[13px] text-white/80 hover:bg-white/[0.02]">
                  <span className="inline-block w-8 text-white/30">{idx + 1}.</span> {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`.scrollbar-hide::-webkit-scrollbar { display: none; } .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
    </div>
  );
}
export default App;
