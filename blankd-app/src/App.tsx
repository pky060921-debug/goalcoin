import { useState, useRef, useEffect } from "react";
import { Highlighter, Loader2, BookOpen, UploadCloud, Sparkles, Layers, CheckCircle2, BrainCircuit, Swords, Flame, ShieldAlert } from "lucide-react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";

// 백엔드에서 넘어오는 카드 데이터 규격 (TypeScript Interface)
interface Card {
  id: number;
  content: string;
  answer: string;
  options: string[];
  level: number;
  next_review: string;
  status: string;
}

function App() {
  const enokiFlow = useEnokiFlow();
  const zkLogin = useZkLogin();
  const suiWalletAccount = useCurrentAccount();
  
  const accountAddress = suiWalletAccount?.address || zkLogin?.address;
  const account = accountAddress ? { address: accountAddress } : null;

  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedText, setParsedText] = useState("");
  const [savedCards, setSavedCards] = useState<Card[]>([]);
  
  // 🚨 전투(문제 풀이) 팝업창 관리를 위한 상태
  const [activeCard, setActiveCard] = useState<Card | null>(null);

  const textRef = useRef<HTMLDivElement>(null);

  // 1. 구글 로그인 토큰 마중물 로직
  useEffect(() => {
    const handleAuth = async () => {
      try {
        await enokiFlow.handleAuthCallback();
        window.history.replaceState(null, '', window.location.pathname);
      } catch (error: any) {
        alert(`[에러] zkLogin 처리 실패: ${error.message || JSON.stringify(error)}`);
      }
    };
    if (window.location.hash.includes("id_token=")) handleAuth();
  }, [enokiFlow]);

  // 2. 로그인 완료 시 인벤토리(내 카드) 불러오기
  useEffect(() => {
    if (account) loadMyCards();
  }, [account]);

  const loadMyCards = async () => {
    if (!account) return;
    try {
      const res = await fetch(`https://api.blankd.top/api/my-cards?wallet_address=${account.address}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "카드 목록 불러오기 실패");
      setSavedCards(data.cards || []);
    } catch (error: any) {
      alert(`[DB 에러] 카드 목록 로드 실패: \n${error.message}`);
    }
  };

  const handleFileUpload = async () => {
    if (!file) return alert("법령 PDF 파일을 선택해주세요.");
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("https://api.blankd.top/api/upload-pdf", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      setParsedText(data.preview);
    } catch (error: any) {
      alert(`[API 에러] 파일 업로드 실패: \n${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleMakeBlankCard = async () => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim() === "" || !account) {
      return alert("카드로 제련할 단어를 드래그하고 로그인 상태를 확인하세요!");
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
          answer_text: answerText // 🚨 백엔드에 정답을 같이 보냄
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      
      alert("성공적으로 카드가 제련되었습니다!");
      window.getSelection()?.removeAllRanges();
      loadMyCards(); // 카드 제련 성공 시 인벤토리 즉시 새로고침
    } catch (error: any) {
      alert(`[API 에러] 카드 저장 실패: \n${error.message}`);
    }
  };

  // 🚨 신규: 사용자가 정답 보기 중 하나를 선택했을 때 (전투 처리)
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
      
      // 결과 애니메이션 대신 확실한 알림창 (추후 애니메이션 이식 가능)
      if (isCorrect) {
        alert(`💥 타격 성공! (정답)\n${data.message}`);
      } else {
        alert(`☠️ 타격 실패! (오답)\n정답은 [${activeCard.answer}] 입니다.\n${data.message}`);
      }
      
      setActiveCard(null); // 전투 모달 닫기
      loadMyCards(); // 인벤토리 갱신 (레벨업 및 타이머 반영)
    } catch (error: any) {
      alert(`[API 에러] 전투 처리 실패: \n${error.message}`);
    }
  };

  const handleGoogleZkLogin = async () => {
    const protocol = window.location.protocol;
    const host = window.location.host;
    const redirectUrl = `${protocol}//${host}`;

    try {
      const url = await enokiFlow.createAuthorizationURL({
        provider: 'google',
        clientId: '536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com',
        redirectUrl,
        network: 'testnet'
      });
      window.location.href = url;
    } catch (err: any) {
      alert(`[에러] 구글 로그인 URL 생성 실패: \n${err.message || JSON.stringify(err)}`);
    }
  };

  const handleLogout = async () => {
    try { await enokiFlow.logout(); } catch (e) {}
    window.location.reload();
  };

  // 헬퍼 함수: 레벨에 따른 카드 테두리 색상 결정
  const getLevelColor = (level: number) => {
    if (level === 0) return "border-slate-500 shadow-slate-500/20"; // 일반 (노멀)
    if (level === 1) return "border-blue-500 shadow-blue-500/30"; // 레어
    if (level === 2) return "border-purple-500 shadow-purple-500/40"; // 에픽
    return "border-yellow-500 shadow-yellow-500/50"; // 전설
  };

  return (
    <div className="min-h-screen bg-[#0A0F1C] text-slate-300 font-sans selection:bg-indigo-500/40 selection:text-indigo-100 pb-24 relative">
      <header className="sticky top-0 z-10 backdrop-blur-md bg-[#0A0F1C]/80 border-b border-white/5 mb-8">
        <div className="max-w-3xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-xl border border-indigo-500/20">
              <BookOpen className="text-indigo-400 w-6 h-6" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300">BlankD</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-400">
              <Sparkles className="w-3.5 h-3.5 text-yellow-500" /> Effort to Earn
            </div>
            {account && (
              <div className="flex items-center gap-3">
                <ConnectButton />
                {zkLogin?.address && (
                  <button onClick={handleLogout} className="text-xs font-bold text-slate-500 hover:text-rose-400 transition-colors">로그아웃</button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 space-y-8">
        {!account ? (
          <div className="text-center py-16 px-6 bg-[#111827]/80 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl max-w-md mx-auto">
            <Sparkles className="w-12 h-12 text-indigo-400 mx-auto mb-6 opacity-80" />
            <h2 className="text-2xl font-bold text-slate-100 mb-3">BlankD 시작하기</h2>
            <div className="space-y-5 mt-10">
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-slate-500 text-left pl-1">Web3 지갑 연결</span>
                <div className="[&>button]:!w-full [&>button]:!py-3.5 [&>button]:!rounded-xl [&>button]:!bg-indigo-600 hover:[&>button]:!bg-indigo-500">
                  <ConnectButton connectText="Splash 지갑 연결" />
                </div>
              </div>
              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-white/10"></div>
                <span className="flex-shrink-0 mx-4 text-slate-500 text-xs font-medium">또는</span>
                <div className="flex-grow border-t border-white/10"></div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-slate-500 text-left pl-1">소셜 계정 로그인</span>
                <button onClick={handleGoogleZkLogin} className="w-full bg-white hover:bg-slate-100 text-slate-900 font-bold py-3.5 rounded-xl flex justify-center items-center gap-3 shadow-md transition-all">
                  <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  구글 이메일로 시작하기
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* 1. PDF 업로드 영역 */}
            <section className="bg-[#111827]/80 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-5">
              <UploadCloud className="w-8 h-8 text-indigo-400" />
              <label className="flex items-center justify-center w-full px-4 py-3 bg-[#1F2937] border border-dashed border-slate-600 rounded-xl cursor-pointer hover:border-indigo-400 transition-all text-sm">
                <span className="truncate">{file ? file.name : "학습할 법령 PDF 선택"}</span>
                <input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
              </label>
              <button onClick={handleFileUpload} disabled={isUploading || !file} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 py-3.5 rounded-xl font-semibold shadow-lg transition-all">
                {isUploading ? <Loader2 className="animate-spin w-5 h-5 mx-auto" /> : "텍스트 추출 시작"}
              </button>
            </section>

            {/* 2. 텍스트 추출 및 카드 제련 영역 */}
            {parsedText && (
              <section className="bg-[#111827] border border-white/10 p-6 sm:p-8 rounded-3xl shadow-xl space-y-5">
                <div ref={textRef} className="bg-[#0A0F1C] p-6 rounded-2xl text-[15px] leading-loose h-64 overflow-y-auto border border-white/5 shadow-inner">
                  {parsedText}
                </div>
                <button onClick={handleMakeBlankCard} className="w-full bg-white/5 hover:bg-indigo-500/10 border border-white/10 py-4 rounded-xl font-semibold text-indigo-300 transition-all flex items-center justify-center gap-2">
                  <Flame className="w-5 h-5 text-orange-500" /> 드래그한 단어로 카드 제련 (Mint)
                </button>
              </section>
            )}

            {/* 3. CCG 인벤토리 (내 광산) 영역 */}
            {savedCards.length > 0 && (
              <section className="space-y-4 pt-8">
                <div className="flex items-center gap-3 px-2 border-b border-white/10 pb-4">
                  <Layers className="w-6 h-6 text-cyan-400" />
                  <h2 className="text-xl font-bold text-slate-100">내 컬렉션 (인벤토리)</h2>
                  <span className="text-sm bg-cyan-500/20 text-cyan-300 px-2 py-1 rounded-md ml-auto border border-cyan-500/20">{savedCards.length} Cards</span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {savedCards.map((card) => {
                    const isBurned = card.status === "BURNED";
                    const isAtRisk = card.status === "AT_RISK";

                    return (
                      <div 
                        key={card.id} 
                        onClick={() => {
                          if (isBurned) return alert("이미 소각된 카드입니다. 다시 제련하세요!");
                          setActiveCard(card);
                        }}
                        className={`group bg-[#111827] p-5 rounded-2xl border-2 transition-all cursor-pointer shadow-lg relative overflow-hidden
                          ${isBurned ? "opacity-50 grayscale border-red-900/50" : getLevelColor(card.level)}
                          ${!isBurned && "hover:scale-[1.02]"}
                        `}
                      >
                        {/* 레벨 배지 */}
                        <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/50 px-2 py-1 rounded-md border border-white/10">
                          <span className="text-xs font-bold text-yellow-400">Lv.{card.level}</span>
                        </div>
                        
                        {/* 위험/소각 경고 표시 */}
                        {isAtRisk && (
                          <div className="absolute top-3 left-3 flex items-center gap-1 text-red-400 text-xs font-bold animate-pulse">
                            <ShieldAlert className="w-4 h-4" /> 방어 필요!
                          </div>
                        )}
                        {isBurned && (
                          <div className="absolute inset-0 bg-red-950/80 flex items-center justify-center z-10 backdrop-blur-sm">
                            <span className="text-red-400 font-black text-xl tracking-widest border-2 border-red-500/50 px-4 py-2 rounded-lg rotate-[-10deg]">BURNED</span>
                          </div>
                        )}

                        <div className="mt-6 text-[14px] text-slate-300 leading-relaxed line-clamp-3">
                          {card.content}
                        </div>
                        
                        {!isBurned && (
                          <div className="mt-4 text-xs text-slate-500 flex justify-between items-center border-t border-white/5 pt-3">
                            <span>마감: {new Date(card.next_review).toLocaleString()}</span>
                            <span className="text-cyan-400 group-hover:text-cyan-300 font-semibold flex items-center gap-1">전투 돌입 <Swords className="w-3 h-3" /></span>
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

      {/* 🚨 4. 전투 모달창 (Play Mode) */}
      {activeCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#111827] w-full max-w-lg rounded-3xl border-2 border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.15)] overflow-hidden flex flex-col">
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
