import { useState, useRef } from "react";
import { Highlighter, Loader2, BookOpen, UploadCloud, Sparkles, Layers, CheckCircle2 } from "lucide-react";

function App() {
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
      const res = await fetch("http://192.168.123.123:5001/api/upload-pdf", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setParsedText(data.preview);
    } catch (error) {
      console.error(error);
      alert("백엔드 통신 실패: 파이썬 서버(5001)가 켜져 있는지 확인하세요.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleMakeBlankCard = () => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim() === "") {
      return alert("빈칸으로 만들 텍스트를 드래그해주세요!");
    }

    const selectedText = selection.toString();
    const cardContent = parsedText.replace(selectedText, `[ ${"＿".repeat(selectedText.length)} ]`);
    
    setSavedCards([...savedCards, cardContent]);
    
    // 시각적 피드백을 위해 선택 영역 해제
    window.getSelection()?.removeAllRanges();
  };

  return (
    // 배경: 깊은 다크 네이비, 텍스트 드래그 시 우아한 인디고 색상 하이라이트
    <div className="min-h-screen bg-[#0A0F1C] text-slate-300 font-sans selection:bg-indigo-500/40 selection:text-indigo-100 pb-24">
      
      {/* 프리미엄 헤더 */}
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
          <div className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-yellow-500" />
            Effort to Earn
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 space-y-8">
        
        {/* 1. 파일 업로드 섹션 */}
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

        {/* 2. 빈칸 뚫기 섹션 (추출된 텍스트가 있을 때만 표시) */}
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
            
            <div 
              ref={textRef} 
              className="bg-[#0A0F1C] p-6 rounded-2xl text-[15px] leading-loose text-slate-300 h-64 overflow-y-auto border border-white/5 shadow-inner"
            >
              {parsedText}
            </div>
            
            <button 
              onClick={handleMakeBlankCard}
              className="w-full bg-white/5 hover:bg-indigo-500/10 border border-white/10 hover:border-indigo-500/30 text-indigo-300 font-semibold py-4 rounded-xl flex justify-center items-center gap-2 transition-all duration-300"
            >
              <CheckCircle2 className="w-5 h-5" />
              선택한 영역을 빈칸 카드로 만들기
            </button>
          </section>
        )}

        {/* 3. 생성된 카드 덱 섹션 */}
        {savedCards.length > 0 && (
          <section className="space-y-4 pt-4">
            <div className="flex items-center gap-3 px-2">
              <Layers className="w-5 h-5 text-cyan-400" />
              <h2 className="text-lg font-bold text-slate-100">내 광산 (생성된 카드)</h2>
              <span className="text-sm text-slate-500 ml-auto">{savedCards.length} Cards</span>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              {savedCards.map((card, idx) => (
                <div 
                  key={idx} 
                  className="group bg-[#111827] hover:bg-[#1F2937] p-5 rounded-2xl text-[15px] text-slate-300 leading-relaxed border border-white/5 hover:border-cyan-500/30 transition-all duration-300 shadow-md flex gap-4 items-start"
                >
                  <div className="min-w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold mt-0.5">
                    {idx + 1}
                  </div>
                  <div>{card}</div>
                </div>
              ))}
            </div>
          </section>
        )}

      </main>
    </div>
  );
}

export default App;