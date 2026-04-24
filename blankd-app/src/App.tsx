import { useState, useRef } from "react";
import { Highlighter, Loader2, BookOpen, UploadCloud, Sparkles, Layers, CheckCircle2 } from "lucide-react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";

function App() {
  const account = useCurrentAccount();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedText, setParsedText] = useState("");
  const [savedCards, setSavedCards] = useState<string[]>([]);
  const textRef = useRef<HTMLDivElement>(null);

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
      alert("백엔드 통신 실패: api.blankd.top 터널이 열려있는지 확인하세요.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleMakeBlankCard = async () => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim() === "") {
      return alert("빈칸으로 만들 텍스트를 드래그해주세요!");
    }

    if (!account) {
      return alert("노력을 기록하려면 먼저 우측 상단에서 지갑을 연결해주세요!");
    }

    const selectedText = selection.toString();
    const cardContent = parsedText.replace(selectedText, `[ ${"＿".repeat(selectedText.length)} ]`);
    
    try {
      // 🚨 백엔드(DB)로 지갑 주소와 카드 내용 전송
      const res = await fetch("https://api.blankd.top/api/save-card", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          wallet_address: account.address,
          card_content: cardContent
        }),
      });

      if (res.ok) {
        setSavedCards([...savedCards, cardContent]);
        window.getSelection()?.removeAllRanges(); // 드래그 해제
      } else {
        alert("기록 실패: 서버에서 저장을 거부했습니다.");
      }
    } catch (error) {
      console.error(error);
      alert("통신 에러: api.blankd.top 서버와 연결할 수 없습니다.");
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0F1C] text-slate-300 font-sans selection:bg-indigo-500/40 selection:text-indigo-100 pb-24">
      
      <header className="sticky top-0 z-10 backdrop-blur-md bg-[#0A0F1C]/80 border-b border-white/5 mb-8">
        <div className="max-w-3xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-xl border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
              <BookOpen className="text-indigo-400 w-6 h-6" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300">
              BlankD
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-400">
              <Sparkles className="w-3.5 h-3.5 text-yellow-500" />
              Effort to Earn
            </div>
            <ConnectButton />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 space-y-8">
        {!account ? (
          <div className="text-center py-20 px-6 bg-[#111827]/80 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl">
            <Sparkles className="w-12 h-12 text-indigo-400 mx-auto mb-4 opacity-50" />
            <h2 className="text-xl font-bold text-slate-100 mb-2">지갑을 연결해주세요</h2>
            <p className="text-slate-400">BlankD에서 노력을 증명하려면 Sui 지갑 로그인이 필요합니다.</p>
          </div>
        ) : (
          <>
            <section className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500 opacity-50"></div>
              <div className="relative bg-[#111827]/80 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl flex flex-col items-center justify-center text-center gap-5 transition-transform duration-300 hover:scale-[1.01]">
                <div className="p-4 bg-white/5 rounded-full border border-white/10 group-hover:border-indigo-500/30 transition-colors duration-300">
                  <UploadCloud className="w-8 h-8 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100">법령 및 학습 자료 업로드</h2>
                  <p className="text-sm text-slate-500 mt-1">PDF 파일을 올려 텍스트를 추출하세요</p>
                </div>
                
                <div className="w-full max-w-sm flex flex-col gap-3">
                  <label className="flex items-center justify-center w-full px-4 py-3 bg-[#1F2937] border border-dashed border-slate-600 rounded-xl cursor-pointer hover:bg-[#374151] hover:border-indigo-400 transition-all text-sm text-slate-300">
                    <span className="truncate">{file ? file.name : "클릭하여 PDF 파일 선택"}</span>
                    <input 
                      type="file" 
                      accept=".pdf"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                  
                  <button 
                    onClick={handleFileUpload} 
                    disabled={isUploading || !file}
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl flex justify-center items-center gap-2 shadow-lg hover:shadow-indigo-500/25 transition-all duration-300"
                  >
                    {isUploading ? <Loader2 className="animate-spin w-5 h-5" /> : "텍스트 추출 시작"}
                  </button>
                </div>
              </div>
            </section>

            {parsedText && (
              <section className="bg-[#111827] border border-white/10 p-6 sm:p-8 rounded-3xl shadow-xl space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Highlighter className="w-5 h-5 text-purple-400" />
                    <h2 className="text-lg font-bold text-slate-100">핵심 키워드 드래그</h2>
                  </div>
                  <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded-md font-medium border border-purple-500/20">
                    원하는 단어를 마우스로 선택하세요
                  </span>
                </div>
                
                <div ref={textRef} className="bg-[#0A0F1C] p-6 rounded-2xl text-[15px] leading-loose text-slate-300 h-64 overflow-y-auto border border-white/5 shadow-inner">
                  {parsedText}
                </div>
                
                <button onClick={handleMakeBlankCard} className="w-full bg-white/5 hover:bg-indigo-500/10 border border-white/10 hover:border-indigo-500/30 text-indigo-300 font-semibold py-4 rounded-xl flex justify-center items-center gap-2 transition-all duration-300">
                  <CheckCircle2 className="w-5 h-5" />
                  선택한 영역을 빈칸 카드로 만들기 (저장)
                </button>
              </section>
            )}

            {savedCards.length > 0 && (
              <section className="space-y-4 pt-4">
                <div className="flex items-center gap-3 px-2">
                  <Layers className="w-5 h-5 text-cyan-400" />
                  <h2 className="text-lg font-bold text-slate-100">내 광산 (생성된 카드)</h2>
                  <span className="text-sm text-slate-500 ml-auto">{savedCards.length} Cards</span>
                </div>
                
                <div className="grid grid-cols-1 gap-3">
                  {savedCards.map((card, idx) => (
                    <div key={idx} className="group bg-[#111827] hover:bg-[#1F2937] p-5 rounded-2xl text-[15px] text-slate-300 leading-relaxed border border-white/5 hover:border-cyan-500/30 transition-all duration-300 shadow-md flex gap-4 items-start">
                      <div className="min-w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold mt-0.5">
                        {idx + 1}
                      </div>
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
