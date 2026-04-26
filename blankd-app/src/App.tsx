import { useState, useEffect, useRef } from "react";
import { Loader2, BookOpen, UploadCloud, Sparkles, Layers, Swords, ShieldAlert, Bot, Flame, LayoutDashboard, Hammer, Target, Users, Trash2 } from "lucide-react";
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

  // 🚨 UI 탭 상태 관리 ('dashboard', 'craft', 'enhance', 'mission', 'community')
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
      if (!res.ok) throw new Error(data.details || data.error);
      setSavedCards(data.cards || []);
    } catch (error: any) {
      console.error("DB 로드 실패:", error);
    }
  };

  const handleFileUpload = async () => {
    if (!file || !account) return alert("파일을 선택하고 로그인하세요.");
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("wallet_address", account.address); 
    
    try {
      const res = await fetch("https://api.blankd.top/api/upload-pdf", { method: "POST", body: formData });
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

  const handleAutoMakeCard = async (cat: Category, silent = false) => {
    if (!account) return;
    try {
      const res = await fetch("https://api.blankd.top/api/auto-make-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: account.address, category_id: cat.id, content: cat.content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      if (!silent) {
        alert(data.message);
        loadMyCards();
      }
    } catch (error: any) {
      if (!silent) alert(`[API 에러] 자동 제작 실패:\n${error.message}`);
    }
  };

  // 🚨 [신규 기능] 일괄 자동 제작
  const handleBatchAutoMake = async () => {
    if (!account || categories.length === 0) return alert("먼저 문서를 업로드하여 카테고리를 생성하세요.");
    if (!confirm("모든 조문에서 AI가 자동으로 카드를 추출합니다. 진행하시겠습니까?")) return;
    
    setIsBatching(true);
    for (const cat of categories) {
      await handleAutoMakeCard(cat, true); // 경고창 없이 백그라운드 생성
    }
    setIsBatching(false);
    alert("✨ 모든 카테고리 일괄 제작이 완료되었습니다!");
    loadMyCards();
    setActiveTab('enhance'); // 제작 완료 후 카드 강화 탭으로 자동 이동
  };

  // 🚨 [신규 기능] 전체 데이터 삭제 (초기화)
  const handleDeleteAll = async () => {
    if (!account) return;
    if (!confirm("⚠️ 경고: 귀하의 모든 차원(카테고리)과 수집한 카드가 영구적으로 소각됩니다. 정말 삭제하시겠습니까?")) return;
    
    try {
      const res = await fetch("https://api.blankd.top/api/delete-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: account.address }),
      });
      if (res.ok) {
        alert("모든 데이터가 소각되었습니다.");
        setCategories([]);
        setSavedCards([]);
        setParsedText("");
      }
    } catch (error) {
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  const loadTextForManualSelection = (content: string) => {
    setParsedText(content);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleMakeBlankCard = async () => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim() === "" || !account) return alert("단어를 드래그하세요!");

    const answerText = selection.toString().trim();
    const cardContent = parsedText.replace(answerText, `[ ${"＿".repeat(answerText.length)} ]`);
    
    try {
      const res = await fetch("https://api.blankd.top/api/save-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: account.address, card_content: cardContent, answer_text: answerText }),
      });
      if (res.ok) {
        alert("성공적으로 카드가 제작되었습니다!");
        window.getSelection()?.removeAllRanges();
        setParsedText(""); 
        loadMyCards(); 
      }
    } catch (error) { alert("제작 실패"); }
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
      if (isCorrect) alert(`💥 방어 성공! (정답)\n${data.message}`);
      else alert(`☠️ 방어 실패! (오답)\n정답은 [${activeCard.answer}] 입니다.\n${data.message}`);
      
      setActiveCard(null);
      loadMyCards();
    } catch (error) { alert("전투 처리 실패"); }
  };

  const handleGoogleZkLogin = async () => {
    try {
      const createUrl = enokiFlow.createAuthorizationUrl || (enokiFlow as any).createAuthorizationURL;
      const url = await createUrl.call(enokiFlow, {
        provider: 'google',
        clientId: '536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com',
        redirectUrl: window.location.origin
      });
      window.location.href = url;
    } catch (err: any) { alert(`구글 로그인 에러: ${err.message}`); }
  };

  const getLevelColor = (level: number) => {
    if (level === 0) return "border-slate-500 shadow-slate-500/20"; 
    if (level === 1) return "border-blue-500 shadow-blue-500/30"; 
    if (level === 2) return "border-purple-500 shadow-purple-500/40"; 
    return "border-yellow-500 shadow-yellow-500/50"; 
  };

  // 통계 계산
  const totalCards = savedCards.length;
  const atRiskCards = savedCards.filter(c => c.status === 'AT_RISK').length;
  const burnedCards = savedCards.filter(c => c.status === 'BURNED').length;
  const legendCards = savedCards.filter(c => c.level >= 3).length;

  return (
    <div className="min-h-screen bg-[#0A0F1C] text-slate-300 font-sans pb-24 relative">
      <header className="sticky top-0 z-20 backdrop-blur-md bg-[#0A0F1C]/90 border-b border-white/5">
        <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-lg">
              <Sparkles className="text-white w-6 h-6" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">BlankD</h1>
          </div>
          {account && (
            <div className="flex items-center gap-3">
              <ConnectButton />
              {zkLogin?.address && (
                <button onClick={() => enokiFlow.logout().then(()=>window.location.reload())} className="text-xs font-bold text-slate-500 hover:text-rose-400">로그아웃</button>
              )}
            </div>
          )}
        </div>
        
        {/* 🚨 게임 네비게이션 메뉴바 */}
        {account && (
          <div className="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto hide-scrollbar border-t border-white/5 pt-2 pb-2">
            {[
              { id: 'dashboard', icon: LayoutDashboard, label: '대시보드' },
              { id: 'craft', icon: Hammer, label: '카드 제작' },
              { id: 'enhance', icon: Swords, label: '카드 강화' },
              { id: 'mission', icon: Target, label: '미션 설정' },
              { id: 'community', icon: Users, label: '커뮤니티' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm transition-all whitespace-nowrap
                  ${activeTab === tab.id ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-400 hover:bg-white/5'}
                `}
              >
                <tab.icon className="w-4 h-4" /> {tab.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        {!account ? (
          <div className="text-center py-20 px-6 bg-[#111827]/80 rounded-3xl shadow-2xl max-w-md mx-auto border border-white/5">
            <Sparkles className="w-16 h-16 text-cyan-400 mx-auto mb-6" />
            <h2 className="text-3xl font-black text-white mb-2">BlankD</h2>
            <p className="text-slate-400 mb-10 text-sm">노력 증명(E2E) 기반 수집형 학습 게임</p>
            <div className="space-y-4">
              <ConnectButton connectText="Splash 지갑 연결" />
              <button onClick={handleGoogleZkLogin} className="w-full bg-white text-slate-900 font-bold py-3.5 rounded-xl flex justify-center items-center gap-3">
                 구글 이메일로 시작하기
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 1. 대시보드 탭 */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <h2 className="text-2xl font-bold text-white">사령관 현황 보고</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-[#111827] p-6 rounded-2xl border border-white/5 text-center">
                    <Layers className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
                    <div className="text-3xl font-black text-white">{totalCards}</div>
                    <div className="text-xs text-slate-500 mt-1">총 수집 카드</div>
                  </div>
                  <div className="bg-gradient-to-b from-[#1F111D] to-[#111827] p-6 rounded-2xl border border-rose-500/20 text-center">
                    <ShieldAlert className="w-8 h-8 text-rose-400 mx-auto mb-2" />
                    <div className="text-3xl font-black text-rose-400">{atRiskCards}</div>
                    <div className="text-xs text-rose-500/70 mt-1">방어 임박 (위험)</div>
                  </div>
                  <div className="bg-gradient-to-b from-[#1C160C] to-[#111827] p-6 rounded-2xl border border-yellow-500/20 text-center">
                    <Flame className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
                    <div className="text-3xl font-black text-yellow-500">{legendCards}</div>
                    <div className="text-xs text-yellow-600/70 mt-1">전설 달성 (Lv.3+)</div>
                  </div>
                  <div className="bg-[#111827] p-6 rounded-2xl border border-white/5 text-center opacity-70">
                    <Trash2 className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                    <div className="text-3xl font-black text-slate-400">{burnedCards}</div>
                    <div className="text-xs text-slate-500 mt-1">소각된 카드</div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. 카드 제작 탭 */}
            {activeTab === 'craft' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex justify-between items-center bg-[#111827] p-6 rounded-3xl border border-white/5">
                  <div>
                    <h2 className="text-xl font-bold text-white mb-1">차원 탐색기 (문서 업로드)</h2>
                    <p className="text-sm text-slate-500">법령이나 문서를 올려 새로운 차원을 개척하세요.</p>
                  </div>
                  <button onClick={handleDeleteAll} className="flex items-center gap-2 text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 px-4 py-2.5 rounded-lg transition-colors border border-rose-500/20">
                    <Trash2 className="w-4 h-4" /> 전체 데이터 삭제
                  </button>
                </div>

                <label className="flex flex-col items-center justify-center w-full h-40 bg-[#1F2937]/50 border-2 border-dashed border-slate-600 rounded-2xl cursor-pointer hover:border-indigo-400 hover:bg-[#1F2937] transition-all">
                  <UploadCloud className="w-10 h-10 text-indigo-400 mb-3" />
                  <span className="text-sm font-bold text-slate-300">{file ? file.name : "여기를 눌러 문서(PDF, DOCX 등) 업로드"}</span>
                  <input type="file" accept="*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
                </label>
                <button onClick={handleFileUpload} disabled={isUploading || !file} className="w-full bg-indigo-600 py-4 rounded-xl font-bold text-lg shadow-lg">
                  {isUploading ? <Loader2 className="animate-spin w-6 h-6 mx-auto" /> : "차원 분리 개시"}
                </button>

                {/* 수동 제작기 */}
                {parsedText && (
                  <div className="bg-[#111827] border border-teal-500/30 p-6 rounded-3xl mt-8">
                    <div className="flex items-center gap-2 text-teal-400 font-bold mb-4">
                      <Hammer className="w-5 h-5" /> 수동 카드 제련소
                    </div>
                    <div ref={textRef} className="bg-[#0A0F1C] p-6 rounded-2xl text-[15px] leading-loose h-64 overflow-y-auto border border-white/5">
                      {parsedText}
                    </div>
                    <button onClick={handleMakeBlankCard} className="mt-4 w-full bg-teal-600/20 hover:bg-teal-600/40 border border-teal-500/30 py-4 rounded-xl font-bold text-teal-300">
                      드래그한 단어로 직접 카드 추출
                    </button>
                  </div>
                )}

                {/* 분석된 카테고리 & 일괄 제작 */}
                {categories.length > 0 && (
                  <div className="mt-8 space-y-4">
                    <div className="flex justify-between items-center">
                      <h2 className="text-lg font-bold text-white flex items-center gap-2"><BookOpen className="w-5 h-5"/> 확보된 차원 ({categories.length}건)</h2>
                      <button onClick={handleBatchAutoMake} disabled={isBatching} className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg flex items-center gap-2">
                        {isBatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4"/>} 
                        모든 차원 일괄 AI 제작
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto pr-2">
                      {categories.map(cat => (
                        <div key={cat.id} className="bg-[#111827] p-5 rounded-xl border border-white/5 flex justify-between items-center gap-4 hover:border-indigo-500/30">
                          <div className="flex-1 cursor-pointer" onClick={() => loadTextForManualSelection(cat.content)}>
                            <h3 className="font-bold text-indigo-300">{cat.title}</h3>
                            <p className="text-xs text-slate-500 mt-1 line-clamp-1">{cat.content}</p>
                          </div>
                          <button onClick={() => handleAutoMakeCard(cat)} className="flex-shrink-0 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 px-4 py-2 rounded-lg text-sm font-bold">
                            개별 추출
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. 카드 강화 탭 (인벤토리 및 전투) */}
            {activeTab === 'enhance' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                  <Swords className="w-6 h-6 text-cyan-400" />
                  <h2 className="text-xl font-bold text-white">전투 덱 (보유 카드)</h2>
                </div>
                
                {savedCards.length === 0 ? (
                  <div className="text-center py-20 text-slate-500">보유한 카드가 없습니다. '카드 제작' 탭에서 카드를 만들어보세요.</div>
                ) : (
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
                )}
              </div>
            )}

            {/* 4. 미션 탭 (준비 중) */}
            {activeTab === 'mission' && (
              <div className="text-center py-32 animate-in fade-in">
                <Target className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-slate-400">미션 설정</h2>
                <p className="text-slate-500 mt-2">일일 퀘스트와 목표 설정 시스템이 곧 추가됩니다.</p>
              </div>
            )}

            {/* 5. 커뮤니티 탭 (준비 중) */}
            {activeTab === 'community' && (
              <div className="text-center py-32 animate-in fade-in">
                <Users className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-slate-400">커뮤니티 (PvP 랭킹)</h2>
                <p className="text-slate-500 mt-2">다른 사령관들과의 랭킹 및 카드 배틀 콜로세움이 열릴 예정입니다.</p>
              </div>
            )}
          </>
        )}
      </main>

      {/* 🚨 전투 모달창 (강화) */}
      {activeCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#111827] w-full max-w-lg rounded-3xl border-2 border-cyan-500/30 overflow-hidden flex flex-col shadow-[0_0_50px_rgba(6,182,212,0.15)]">
            <div className="bg-gradient-to-r from-cyan-950 to-blue-950 p-5 border-b border-cyan-500/20 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Swords className="text-cyan-400 w-6 h-6" />
                <span className="font-bold text-white text-lg">방어전 개시 (Lv.{activeCard.level})</span>
              </div>
              <button onClick={() => setActiveCard(null)} className="text-slate-400 hover:text-white text-3xl leading-none">&times;</button>
            </div>
            
            <div className="p-6 sm:p-8 space-y-8">
              <div className="bg-[#0A0F1C] p-6 rounded-2xl text-[16px] leading-relaxed text-slate-200 border border-white/10 shadow-inner font-medium">
                {activeCard.content}
              </div>
              
              <div className="space-y-3">
                <p className="text-xs text-center text-cyan-500/70 mb-4 font-bold tracking-widest">알맞은 단어를 선택하여 방어막을 전개하세요</p>
                {activeCard.options?.map((opt, idx) => (
                  <button 
                    key={idx}
                    onClick={() => submitCombatAnswer(opt)}
                    className="w-full text-left px-5 py-4 bg-[#1F2937] hover:bg-cyan-900/60 border border-slate-700 hover:border-cyan-400 rounded-xl text-white font-medium transition-all shadow-md hover:shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                  >
                    <span className="inline-block w-8 text-cyan-500/50 font-bold">{idx + 1}.</span> {opt}
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
