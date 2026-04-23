import { useState, useRef } from "react";
import { FileText, Highlighter, Loader2, Pickaxe } from "lucide-react";

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
      const res = await fetch("http://192.168.123.123:5001/api/upload-pdf", { method: "POST", body: formData });
      const data = await res.json();
      setParsedText(data.preview);
    } catch (error) {
      alert("백엔드 통신 실패: 파이썬 서버(5001)를 확인하세요.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleMakeBlankCard = () => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim() === "") return alert("빈칸으로 뚫을 키워드를 드래그해주세요!");
    const selectedText = selection.toString();
    const cardContent = parsedText.replace(selectedText, `[ ${"＿".repeat(selectedText.length)} ]`);
    setSavedCards([...savedCards, cardContent]);
    alert("새로운 빈칸 카드가 생성되었습니다!");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-6 font-sans pb-24">
      <header className="max-w-md mx-auto flex items-center justify-center gap-2 mb-12">
        <Pickaxe className="text-blue-400 w-8 h-8" />
        <h1 className="text-2xl font-black tracking-tighter">빈칸차원 (BlankD)</h1>
      </header>
      <main className="max-w-md mx-auto space-y-6">
        <section className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4 shadow-xl">
          <label className="block text-sm font-semibold text-slate-400">1. 법령 파일 업로드 (PDF)</label>
          <input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:bg-blue-600 file:text-white" />
          <button onClick={handleFileUpload} disabled={isUploading || !file} className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl flex justify-center items-center gap-2">
            {isUploading ? <Loader2 className="animate-spin w-5 h-5" /> : <><FileText className="w-5 h-5"/> 텍스트 추출하기</>}
          </button>
        </section>
        {parsedText && (
          <section className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4 shadow-xl">
            <label className="block text-sm font-semibold text-slate-400">2. 키워드를 드래그하여 빈칸 만들기</label>
            <div ref={textRef} className="bg-slate-950 p-4 rounded-xl text-sm text-slate-300 h-48 overflow-y-auto border border-slate-800">{parsedText}</div>
            <button onClick={handleMakeBlankCard} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl flex justify-center items-center gap-2">
              <Highlighter className="w-5 h-5" /> 선택 영역 카드 만들기
            </button>
          </section>
        )}
        {savedCards.length > 0 && (
          <section className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4 shadow-xl">
            <label className="block text-sm font-semibold text-slate-400">내 빈칸 카드 ({savedCards.length}장)</label>
            <div className="space-y-2">
              {savedCards.map((card, idx) => <div key={idx} className="bg-slate-950 p-4 rounded-xl text-sm text-slate-300 border border-slate-800">{card}</div>)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
export default App;