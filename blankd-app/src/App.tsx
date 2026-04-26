import { useState, useEffect, useRef } from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";

interface Category { id: number; title: string; content: string; }
interface Card { id: number; content: string; answer: string; options: string[]; level: number; next_review: string; status: string; }

function App() {
  const enokiFlow = useEnokiFlow();
  const zkLogin = useZkLogin();
  const suiWalletAccount = useCurrentAccount();
  
  const accountAddress = suiWalletAccount?.address || zkLogin?.address;
  const account = accountAddress ? { address: accountAddress } : null;

  // 탭 관리: dashboard, craft, enhance, mission, community, mypage
  const [activeTab, setActiveTab] = useState('dashboard');

  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isBatching, setIsBatching] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [savedCards, setSavedCards] = useState<Card[]>([]);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [parsedText, setParsedText] = useState("");
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
    if (account) {
      loadCategories();
      loadMyCards();
    }
  }, [account]);

  const loadCategories = async () => {
    if (!account) return;
    try {
      const res = await fetch(`https://api.blankd.top/api/get-categories?wallet_address=${account.address}`);
      const data = await res.json();
      if (res.ok) setCategories(data.categories || []);
    } catch (err) { console.error(err); }
  };

  const loadMyCards = async () => {
    if (!account) return;
    try {
      const res = await fetch(`https://api.blankd.top/api/my-cards?wallet_address=${account.address}`);
      const data = await res.json();
      if (res.ok) setSavedCards(data.cards || []);
    } catch (err) { console.error(err); }
  };

  const handleFileUpload = async () => {
    if (!file || !account) return alert("파일을 선택해주세요.");
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("wallet_address", account.address);
    try {
      const res = await fetch("https://api.blankd.top/api/upload-pdf", { method: "POST", body: formData });
      if (res.ok) {
        alert("기록 보관소에 문서가 추가되었습니다.");
        loadCategories();
      }
    } finally { setIsUploading(false); }
  };

  const handleAutoMakeCard = async (cat: Category, silent = false) => {
    if (!account) return;
    const res = await fetch("https://api.blankd.top/api/auto-make-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet_address: account.address, category_id: cat.id, content: cat.content }),
    });
    if (res.ok && !silent) {
      alert("지식이 카드로 추출되었습니다.");
      loadMyCards();
    }
  };

  const handleBatchAutoMake = async () => {
    if (!account || categories.length === 0) return;
    if (!confirm("모든 문헌에서 일괄적으로 지식을 추출하시겠습니까?")) return;
    setIsBatching(true);
    for (const cat of categories) await handleAutoMakeCard(cat, true);
    setIsBatching(false);
    alert("일괄 추출이 완료되었습니다.");
    loadMyCards();
    setActiveTab('enhance');
  };

  const handleDeleteAll = async () => {
    if (!account || !confirm("보관소의 모든 데이터를 영구적으로 지우시겠습니까?")) return;
    const res = await fetch("https://api.blankd.top/api/delete-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet_address: account.address }),
    });
    if (res.ok) {
      alert("모든 기록이 소각되었습니다.");
      setCategories([]); setSavedCards([]); setParsedText("");
    }
  };

  const handleGoogleZkLogin = async () => {
    const createUrl = (enokiFlow as any).createAuthorizationURL || enokiFlow.createAuthorizationUrl;
    const url = await createUrl.call(enokiFlow, {
      provider: 'google',
      clientId: '536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com',
      redirectUrl: window.location.origin
    });
    window.location.href = url;
  };

  const loadTextForManualSelection = (content: string) => {
    setParsedText(content);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleMakeBlankCard = async () => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim() === "" || !account) return;

    const answerText = selection.toString().trim();
    const cardContent = parsedText.replace(answerText, `[ ${"＿".repeat(answerText.length)} ]`);
    
    const res = await fetch("https://api.blankd.top/api/save-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet_address: account.address, card_content: cardContent, answer_text: answerText }),
    });
    if (res.ok) {
      alert("선택하신 지식이 카드로 기록되었습니다.");
      window.getSelection()?.removeAllRanges();
      setParsedText(""); 
      loadMyCards(); 
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

  // UI 헬퍼
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
    <div className="min-h-screen bg-[#0d0d0f] text-[#d1d1d1] font-sans selection:bg-neutral-800 selection:text-white p-6 sm:p-12">
      {/* HEADER: 미니멀하고 정제된 형태 */}
      <header className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:justify-between sm:items-baseline border-b border-white/10 pb-8 mb-12 gap-4">
        <div>
          <h1 className="text-2xl font-light tracking-[0.3em] text-white">BLANK_D</h1>
          <p className="text-[10px] text-white/30 mt-2 uppercase tracking-widest">Effort To Earn Archive</p>
        </div>
        {account && (
          <div className="text-right text-[10px] text-white/30 tracking-wider">
            ID: {account.address.substring(0, 12)}...
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto">
        {!account ? (
          /* 메인 로그인: 고요한 서재의 입구 */
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
            {/* TABS: 얇은 선과 여백으로 구성된 고요한 네비게이션 */}
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

            {/* 1. DASHBOARD (열람실) */}
            {activeTab === 'dashboard' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 animate-in fade-in duration-700">
                <div className="border border-white/10 p-8 rounded-sm bg-white/[0.02]">
                  <div className="text-[10px] text-white/30 mb-4 tracking-widest uppercase">보유 지식</div>
                  <div className="text-4xl font-light text-white/90">{savedCards.length}</div>
                </div>
                <div className="border border-rose-900/30 p-8 rounded-sm bg-rose-950/10">
                  <div className="text-[10px] text-rose-400/50 mb-4 tracking-widest uppercase">망각 경고</div>
                  <div className="text-4xl font-light text-rose-400/80">{savedCards.filter(c => c.status === 'AT_RISK').length}</div>
                </div>
                <div className="border border-amber-900/30 p-8 rounded-sm bg-amber-950/10">
                  <div className="text-[10px] text-amber-500/50 mb-4 tracking-widest uppercase">영구 보존 (전설)</div>
                  <div className="text-4xl font-light text-amber-500/80">{savedCards.filter(c => c.level >= 3).length}</div>
                </div>
              </div>
            )}

            {/* 2. CRAFT (지식 추출) */}
            {activeTab === 'craft' && (
              <div className="space-y-12 animate-in fade-in duration-700">
                <div className="flex justify-between items-baseline border-b border-white/5 pb-4">
                  <h3 className="text-sm font-light tracking-[0.2em] text-white/80">문헌 수집</h3>
                  <button onClick={handleDeleteAll} className="text-[10px] text-rose-500/60 hover:text-rose-400 transition-all tracking-widest">
                    전체 기록 소각
                  </button>
                </div>
                
                <div className="relative border border-dashed border-white/20 p-12 text-center rounded-sm hover:border-white/40 hover:bg-white/[0.01] transition-all">
                  <input type="file" accept="*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="absolute inset-0 opacity-0 cursor-pointer" />
                  <div className="text-xs font-light text-white/40 tracking-wider">
                    {file ? file.name : "이곳을 눌러 문서(PDF, DOCX 등)를 업로드하십시오"}
                  </div>
                </div>
                
                <button 
                  onClick={handleFileUpload} 
                  disabled={isUploading || !file}
                  className="w-full py-4 border border-white/10 hover:border-white/40 text-white/80 transition-all text-xs font-light tracking-widest"
                >
                  {isUploading ? "추출 중..." : "문헌 분석 시작"}
                </button>

                {categories.length > 0 && (
                  <div className="mt-16 space-y-6">
                    <div className="flex justify-between items-baseline border-b border-white/5 pb-4">
                      <div className="text-xs font-light tracking-widest text-white/60">분석된 문헌 ({categories.length})</div>
                      <button onClick={handleBatchAutoMake} className="text-[10px] text-blue-400/70 hover:text-blue-300 tracking-widest">
                        {isBatching ? "일괄 추출 진행 중..." : "일괄 자동 추출"}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto scrollbar-hide pr-2">
                      {categories.map(cat => (
                        <div key={cat.id} className="border border-white/5 p-5 flex justify-between items-center group hover:border-white/20 transition-all bg-white/[0.01] rounded-sm">
                          <div className="flex-1 cursor-pointer" onClick={() => loadTextForManualSelection(cat.content)}>
                            <div className="text-sm font-medium text-white/80 tracking-wide">{cat.title}</div>
                            <div className="text-[11px] text-white/30 truncate mt-2 font-light">{cat.content}</div>
                          </div>
                          <button onClick={() => handleAutoMakeCard(cat)} className="text-[10px] text-white/40 group-hover:text-white/80 border border-white/10 px-4 py-2 hover:border-white/40 transition-all rounded-sm ml-4">
                            개별 추출
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* 수동 제작 */}
                {parsedText && (
                  <div className="mt-16 space-y-6">
                    <div className="text-xs font-light text-white/60 tracking-widest border-b border-white/5 pb-4">수동 추출</div>
                    <div ref={textRef} className="font-serif text-[15px] leading-relaxed text-white/70 h-64 overflow-y-auto border border-white/10 p-8 bg-[#0a0a0c] rounded-sm scrollbar-hide">
                      {parsedText}
                    </div>
                    <button onClick={handleMakeBlankCard} className="w-full py-4 border border-white/10 hover:border-white/40 transition-all text-xs font-light tracking-widest text-white/80">
                      선택한 구절을 지식으로 변환
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 3. ENHANCE (기억 강화) */}
            {activeTab === 'enhance' && (
              <div className="space-y-8 animate-in fade-in duration-700">
                <div className="text-xs font-light tracking-widest text-white/60 border-b border-white/5 pb-4">기억 보관소</div>
                
                {savedCards.length === 0 ? (
                  <div className="py-32 text-center text-white/20 text-xs tracking-widest font-light">보관된 지식이 없습니다.</div>
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
                          {isAtRisk && <div className="text-[10px] text-rose-400/80 tracking-widest mb-3 blink">! 복습 요망</div>}

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

            {/* 4. MY PAGE (지갑 연결) */}
            {activeTab === 'mypage' && (
              <div className="max-w-md mx-auto space-y-12 animate-in fade-in duration-700 py-16">
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

            {/* EMPTY TABS */}
            {(activeTab === 'mission' || activeTab === 'community') && (
              <div className="py-40 text-center border border-white/5 border-dashed rounded-sm mt-8">
                <div className="text-xs tracking-[0.3em] text-white/30 font-light">준비 중인 공간입니다.</div>
              </div>
            )}
          </>
        )}
      </main>

      {/* COMBAT MODAL (강화 팝업) */}
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

      {/* CSS */}
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
