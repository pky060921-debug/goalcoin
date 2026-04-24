import { useState, useRef, useEffect } from "react";
import { Highlighter, Loader2, BookOpen, UploadCloud, Sparkles, Layers, CheckCircle2, BrainCircuit } from "lucide-react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";

function App() {
  const enokiFlow = useEnokiFlow();
  const zkLogin = useZkLogin();
  const suiWalletAccount = useCurrentAccount();
  
  const accountAddress = suiWalletAccount?.address || zkLogin?.address;
  const account = accountAddress ? { address: accountAddress } : null;

  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedText, setParsedText] = useState("");
  const [savedCards, setSavedCards] = useState<string[]>([]);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiQuestions, setAiQuestions] = useState("");
  
  const textRef = useRef<HTMLDivElement>(null);

  // 🚨 추가된 핵심 로직: 구글 로그인 후 돌아왔을 때 토큰을 처리하는 마중물 함수
  useEffect(() => {
    const handleAuth = async () => {
      try {
        await enokiFlow.handleAuthCallback();
        // 로그인 성공 후 URL 뒤에 지저분하게 붙은 토큰을 깔끔하게 지워줍니다.
        window.history.replaceState(null, '', window.location.pathname);
      } catch (error) {
        console.error("zkLogin 처리 에러:", error);
      }
    };
    
    // URL에 토큰이 묻어있다면 마중물 함수 실행
    if (window.location.hash.includes("id_token=")) {
      handleAuth();
    }
  }, [enokiFlow]);

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
      setParsedText(data.preview);
    } catch (error) {
      console.error(error);
      alert("백엔드 통신 실패");
    } finally {
      setIsUploading(false);
    }
  };

  const handleMakeBlankCard = async () => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim() === "" || !account) return;

    const selectedText = selection.toString();
    const cardContent = parsedText.replace(selectedText, `[ ${"＿".repeat(selectedText.length)} ]`);
    
    try {
      const res = await fetch("https://api.blankd.top/api/save-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: account.address, card_content: cardContent }),
      });
      if (res.ok) {
        setSavedCards([...savedCards, cardContent]);
        window.getSelection()?.removeAllRanges();
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleGenerateQuestions = async () => {
    if (!parsedText) return;
    setIsGenerating(true);
    try {
      const res = await fetch("https://api.blankd.top/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text_context: parsedText.slice(0, 2000) }),
      });
      const data = await res.json();
      if (res.ok) setAiQuestions(data.questions);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGoogleZkLogin = async () => {
    const protocol = window.location.protocol;
    const host = window.location.host;
    const redirectUrl = `${protocol}//${host}`;

    try {
      const url = await enokiFlow.createAuthorizationUrl({
        provider: 'google',
        clientId: '536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com',
        redirectUrl,
      });
      window.location.href = url;
    } catch (err) {
      console.error("구글 로그인 URL 생성 실패:", err);
      alert("구글 로그인 준비 중 오류가 발생했습니다.");
    }
  };

  const handleLogout = async () => {
    try {
      await enokiFlow.logout();
    } catch (e) {
      console.error(e);
    }
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-[#0A0F1C] text-slate-300 font-sans selection:bg-indigo-500/40 selection:text-indigo-100 pb-24">
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
            <section className="bg-[#111827]/80 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-5 transition-all">
              <UploadCloud className="w-8 h-8 text-indigo-400" />
              <label className="flex items-center justify-center w-full px-4 py-3 bg-[#1F2937] border border-dashed border-slate-600 rounded-xl cursor-pointer hover:border-indigo-400 transition-all text-sm">
                <span className="truncate">{file ? file.name : "학습할 법령 PDF 선택"}</span>
                <input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
              </label>
              <button onClick={handleFileUpload} disabled={isUploading || !file} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 py-3.5 rounded-xl font-semibold shadow-lg transition-all">
                {isUploading ? <Loader2 className="animate-spin w-5 h-5 mx-auto" /> : "텍스트 추출 시작"}
              </button>
            </section>

            {parsedText && (
              <section className="bg-[#111827] border border-white/10 p-6 sm:p-8 rounded-3xl shadow-xl space-y-5 transition-all">
                <div ref={textRef} className="bg-[#0A0F1C] p-6 rounded-2xl text-[15px] leading-loose h-64 overflow-y-auto border border-white/5 shadow-inner">{parsedText}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <button onClick={handleMakeBlankCard} className="w-full bg-white/5 hover:bg-indigo-500/10 border border-white/10 py-4 rounded-xl font-semibold text-indigo-300 transition-all">빈칸 카드로 만들기 (저장)</button>
                  <button onClick={handleGenerateQuestions} disabled={isGenerating} className="w-full bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 py-4 rounded-xl font-semibold text-teal-300 transition-all">
                    {isGenerating ? <Loader2 className="animate-spin w-5 h-5 mx-auto" /> : "AI 모의고사 생성"}
                  </button>
                </div>
              </section>
            )}

            {aiQuestions && (
              <section className="bg-gradient-to-br from-[#0A1929] to-[#0D1B2A] border border-teal-500/20 p-6 rounded-3xl shadow-xl space-y-4 transition-all">
                <div className="flex items-center gap-3 border-b border-teal-500/20 pb-4"><BrainCircuit className="w-6 h-6 text-teal-400" /><h2 className="text-xl font-bold">Gemma 4 출제 모의고사</h2></div>
                <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{aiQuestions}</div>
              </section>
            )}

            {savedCards.length > 0 && (
              <section className="space-y-4 pt-4 transition-all">
                <div className="flex items-center gap-3 px-2"><Layers className="w-5 h-5 text-cyan-400" /><h2 className="text-lg font-bold">내 광산 (생성된 카드)</h2></div>
                <div className="grid grid-cols-1 gap-3">
                  {savedCards.map((card, idx) => (
                    <div key={idx} className="group bg-[#111827] p-5 rounded-2xl border border-white/5 hover:border-cyan-500/30 transition-all flex gap-4">
                      <div className="min-w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">{idx + 1}</div>
                      <div>{card}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
