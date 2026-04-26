import { useState, useEffect, useRef } from "react";
import { Loader2, BookOpen, UploadCloud, Sparkles, Layers, Swords, ShieldAlert, Bot, Flame } from "lucide-react";
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

  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
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
      } catch (err: any) { 
        alert(`[Callback 에러]\n${err.message || JSON.stringify(err)}`);
      }
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
      if (!res.ok) throw new Error(data.details || data.error);
      setSavedCards(data.cards || []);
    } catch (error: any) {
      alert(`[DB 통신 에러]\n서버가 꺼져있거나 접속할 수 없습니다.\n자세한 에러: ${error.message}`);
    }
  };

  const handleFileUpload = async () => {
    if (!file || !account) return alert("파일을 선택하고 로그인하세요.");
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("wallet_address", account.address); 
    
    try {
      const res = await fetch("https://api.blankd.top/api/upload-pdf", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      
      alert(`성공! 문서가 ${data.count}개의 조문으로 분석되었습니다.`);
      loadCategories();
    } catch (error: any) {
      alert(`[API 에러] 파일 분석 실패:\n${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleAutoMakeCard = async (cat: Category) => {
    if (!account) return;
    try {
      const res = await fetch("https://api.blankd.top/api/auto-make-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          wallet_address: account.address, 
          category_id: cat.id,
          content: cat.content
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      
      alert(data.message);
      loadMyCards();
    } catch (error: any) {
      alert(`[API 에러] 자동 제작 실패:\n${error.message}`);
    }
  };

  const loadTextForManualSelection = (content: string) => {
    setParsedText(content);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleMakeBlankCard = async () => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim() === "" || !account) {
      return alert("카드로 제작할 단어를 마우스로 드래그하세요!");
    }

    const answerText = selection.toString().trim();
    const cardContent = parsedText.replace(answerText, `[ ${"＿".repeat(answerText.length)} ]`);
    
    try {
      const res = await fetch("https://api.blankd.top/api/save-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          wallet_address: account.address, 
          card_content: cardContent,
          answer_text: answerText 
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      
      alert("성공적으로 카드가 제작되었습니다!");
      window.getSelection()?.removeAllRanges();
      setParsedText(""); 
      loadMyCards(); 
    } catch (error: any) {
      alert(`[API 에러] 수동 제작 실패: \n${error.message}`);
    }
  };

  const submitCombatAnswer = async (selectedOption: string) => {
    if (!activeCard) return;
    const isCorrect = selectedOption === activeCard.answer;
    try {
      const res = await fetch("https://api.blankd.top/api/submit-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card_id: activeCard.id, is_correct: isCorrect }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      
      if (isCorrect) alert(`💥 방어 성공! (정답)\n${data.message}`);
      else alert(`☠️ 방어 실패! (오답)\n정답은 [${activeCard.answer}] 입니다.\n${data.message}`);
      
      setActiveCard(null);
      loadMyCards();
    } catch (error: any) {
      alert(`[API 에러] 전투 처리 실패:\n${error.message}`);
    }
  };

  // 🚨 [진단 전용] 왜 403이 뜨는지 낱낱이 파헤치는 함수
  const handleGoogleZkLogin = async () => {
    let debugInfo = "=== 🔍 로그인 진단 정보 ===\n";
    try {
      // 1. 브라우저가 인식하는 진짜 Origin
      const currentOrigin = window.location.origin;
      debugInfo += `1. Origin: [${currentOrigin}]\n`;
      
      // 2. 보안 환경 여부 (https 여부)
      const isSecure = window.isSecureContext;
      debugInfo += `2. 보안(HTTPS) 상태: ${isSecure ? '안전함' : '위험함(False)'}\n`;

      // 3. 사용하려는 Client ID
      const clientId = '536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com';
      debugInfo += `3. Client ID: ${clientId.substring(0, 15)}...\n`;

      const createUrl = enokiFlow.createAuthorizationUrl || (enokiFlow as any).createAuthorizationURL;
      if (!createUrl) throw new Error("인증 함수를 찾을 수 없습니다.");

      // 시도하기 전에 정보부터 띄움
      debugInfo += `\n>> Enoki 서버로 위 정보를 보냅니다.`;
      console.log(debugInfo);

      const url = await createUrl.call(enokiFlow, {
        provider: 'google',
        clientId: clientId,
        redirectUrl: currentOrigin,
        network: 'testnet'
      });
      
      window.location.href = url;
    } catch (err: any) { 
      debugInfo += `\n\n[🚨 차단(에러) 상세 내용]\n메시지: ${err.message}\n응답: ${JSON.stringify(err)}`;
      // 에러가 나면 화면에 팝업을 띄워서 사용자에게 보여줌
      alert(debugInfo); 
    }
  };

  const getLevelColor = (level: number) => {
    if (level === 0) return "border-slate-500 shadow-slate-500/20"; 
    if (level === 1) return "border-blue-500 shadow-blue-500/30"; 
    if (level === 2) return "border-purple-500 shadow-purple-500/40"; 
    return "border-yellow-500 shadow-yellow-500/50"; 
  };

  return (
    <div className="min-h-screen bg-[#0A0F1C] text-slate-300 font-sans pb-24 relative">
      <header className="sticky top-0 z-10 backdrop-blur-md bg-[#0A0F1C]/80 border-b border-white/5 mb-8">
        <div className="max-w-4xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-xl">
              <BookOpen className="text-indigo-400 w-6 h-6" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300">BlankD</h1>
          </div>
          <div className="flex items-center gap-4">
            {account && (
              <div className="flex items-center gap-3">
                <ConnectButton />
                {zkLogin?.address && (
                  <button onClick={() => enokiFlow.logout().then(()=>window.location.reload())} className="text-xs font-bold text-slate-500 hover:text-rose-400 transition-colors">로그아웃</button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 space-y-8">
        {!account ? (
          <div className="text-center py-16 px-6 bg-[#111827]/80 rounded-3xl shadow-2xl max-w-md mx-auto">
            <h2 className="text-2xl font-bold text-slate-100 mb-8">BlankD 시작하기</h2>
            <div className="space-y-4">
              <ConnectButton connectText="Splash 지갑 연결" />
              <button onClick={handleGoogleZkLogin} className="w-full bg-white text-slate-900 font-bold py-3.5 rounded-xl flex justify-center items-center gap-3">
                 구글 이메일로 시작하기 (진단 모드)
              </button>
            </div>
          </div>
        ) : (
          <>
            <section className="bg-[#111827]/80 border border-white/10 p-8 rounded-3xl flex flex-col items-center gap-5">
              <UploadCloud className="w-8 h-8 text-indigo-400" />
              <label className="flex items-center justify-center w-full px-4 py-3 bg-[#1F2937] border border-dashed border-slate-600 rounded-xl cursor-pointer hover:border-indigo-400 text-sm">
                <span>{file ? file.name : "학습할 문서 (PDF, TXT, HTML, DOCX) 선택"}</span>
                <input type="file" accept="*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
              </label>
              <button onClick={handleFileUpload} disabled={isUploading || !file} className="w-full bg-indigo-600 py-3.5 rounded-xl font-semibold">
                {isUploading ? <Loader2 className="animate-spin w-5 h-5 mx-auto" /> : "문서 추출 및 카테고리 분리"}
              </button>
            </section>

            {parsedText && (
              <section className="bg-[#111827] border border-teal-500/30 p-6 sm:p-8 rounded-3xl shadow-[0_0_20px_rgba(20,184,166,0.1)] space-y-5">
                <div className="flex items-center gap-2 text-teal-400 font-bold mb-2">
                  <Flame className="w-5 h-5" /> 수동 카드 제작 모드
                </div>
                <div ref={textRef} className="bg-[#0A0F1C] p-6 rounded-2xl text-[15px] leading-loose h-64 overflow-y-auto border border-white/5 shadow-inner">
                  {parsedText}
                </div>
                <button onClick={handleMakeBlankCard} className="w-full bg-teal-600/20 hover:bg-teal-600/40 border border-teal-500/30 py-4 rounded-xl font-semibold text-teal-300 transition-all flex items-center justify-center gap-2">
                  드래그한 단어로 직접 카드 제작
                </button>
              </section>
            )}

            {categories.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2"><BookOpen className="w-5 h-5"/> 문서 분석 결과 ({categories.length}건)</h2>
                <div className="grid grid-cols-1 gap-4 max-h-96 overflow-y-auto pr-2">
                  {categories.map(cat => (
                    <div key={cat.id} className="bg-[#111827] p-5 rounded-xl border border-white/5 flex justify-between items-center gap-4 hover:border-indigo-500/30 transition-colors">
                      <div className="flex-1 cursor-pointer" onClick={() => loadTextForManualSelection(cat.content)}>
                        <h3 className="font-bold text-indigo-300 hover:text-indigo-200">{cat.title}</h3>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-1">{cat.content}</p>
                      </div>
                      <button onClick={() => handleAutoMakeCard(cat)} className="flex-shrink-0 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all">
                        <Bot className="w-4 h-4"/> AI 자동 제작
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {savedCards.length > 0 && (
              <section className="space-y-4 pt-8">
                <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                  <Layers className="w-6 h-6 text-cyan-400" />
                  <h2 className="text-xl font-bold text-slate-100">내 컬렉션 (인벤토리)</h2>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {savedCards.map((card) => {
                    const isBurned = card.status === "BURNED";
                    const isAtRisk = card.status === "AT_RISK";

                    return (
                      <div 
                        key={card.id} 
                        onClick={() => {
                          if (isBurned) return alert("이미 소각된 카드입니다.");
                          setActiveCard(card);
                        }}
                        className={`group bg-[#111827] p-5 rounded-2xl border-2 cursor-pointer shadow-lg relative overflow-hidden
                          ${isBurned ? "opacity-50 grayscale border-red-900/50" : getLevelColor(card.level)}
                        `}
                      >
                        <div className="absolute top-3 right-3 bg-black/50 px-2 py-1 rounded-md border border-white/10">
                          <span className="text-xs font-bold text-yellow-400">Lv.{card.level}</span>
                        </div>
                        {isAtRisk && (
                          <div className="absolute top-3 left-3 flex items-center gap-1 text-red-400 text-xs font-bold animate-pulse">
                            <ShieldAlert className="w-4 h-4" /> 방어 필요!
                          </div>
                        )}
                        {isBurned && (
                          <div className="absolute inset-0 bg-red-950/80 flex items-center justify-center z-10 backdrop-blur-sm">
                            <span className="text-red-400 font-black text-xl border-2 border-red-500/50 px-4 py-2 rounded-lg rotate-[-10deg]">BURNED</span>
                          </div>
                        )}
                        <div className="mt-6 text-[14px] text-slate-300 leading-relaxed line-clamp-3">
                          {card.content}
                        </div>
                        {!isBurned && (
                          <div className="mt-4 text-xs text-slate-500 flex justify-between items-center border-t border-white/5 pt-3">
                            <span>마감: {new Date(card.next_review).toLocaleString()}</span>
                            <span className="text-cyan-400 font-semibold flex items-center gap-1">전투 돌입 <Swords className="w-3 h-3" /></span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {activeCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#111827] w-full max-w-lg rounded-3xl border-2 border-cyan-500/30 overflow-hidden flex flex-col">
            <div className="bg-gradient-to-r from-cyan-950 to-blue-950 p-4 border-b border-cyan-500/20 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Swords className="text-cyan-400 w-5 h-5" />
                <span className="font-bold text-cyan-50">방어전 개시 (Lv.{activeCard.level})</span>
              </div>
              <button onClick={() => setActiveCard(null)} className="text-slate-400 hover:text-white text-xl leading-none">&times;</button>
            </div>
            
            <div className="p-6 sm:p-8 space-y-8">
              <div className="bg-[#0A0F1C] p-5 rounded-2xl text-[15px] leading-relaxed text-slate-200 border border-white/5 shadow-inner">
                {activeCard.content}
              </div>
              
              <div className="space-y-3">
                <p className="text-xs text-center text-slate-500 mb-4 font-semibold tracking-wider">빈칸에 들어갈 알맞은 단어를 선택하세요</p>
                {activeCard.options?.map((opt, idx) => (
                  <button 
                    key={idx}
                    onClick={() => submitCombatAnswer(opt)}
                    className="w-full text-left px-5 py-4 bg-[#1F2937] hover:bg-cyan-900/40 border border-slate-700 hover:border-cyan-500/50 rounded-xl text-slate-300 font-medium transition-all"
                  >
                    <span className="inline-block w-6 text-slate-500 text-xs">{idx + 1}.</span> {opt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
