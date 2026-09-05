import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// 💡 Vite 환경에서 pdf.js 워커를 안전하게 불러오기 위한 CDN 설정
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const BASE_URL = "https://api.blankd.top/api";

export const ExamTab = ({ walletAddress, address }: any) => {
  const safeAddress = walletAddress || address;
  
  // 파일 및 상태 관리
  const [examFile, setExamFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [questionCount, setQuestionCount] = useState<number>(40);
  
  // OMR 및 채점 상태
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [correctAnswers, setCorrectAnswers] = useState<Record<number, number> | null>(null);
  const [isGrading, setIsGrading] = useState(false);
  const [score, setScore] = useState<{ correct: number, total: number } | null>(null);
  const [systemLog, setSystemLog] = useState<string>("");

  // 필기(Canvas) 관련 상태
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lines, setLines] = useState<Record<number, any[]>>({}); // 페이지별 필기 데이터 저장
  const currentPathRef = useRef<any[]>([]);

  // 📄 PDF 로드 완료 핸들러
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
    setLines({}); // 새 파일 로드 시 필기 초기화
  };

  // ✍️ 캔버스 필기 로직 (Palm Rejection 적용)
  const drawLines = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)'; // 빨간색 펜

    const pageLines = lines[pageNumber] || [];
    const allPaths = [...pageLines, currentPathRef.current].filter(p => p.length > 0);

    allPaths.forEach(path => {
      ctx.beginPath();
      path.forEach((point, i) => {
        if (i === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    });
  };

  useEffect(() => {
    drawLines();
  }, [lines, pageNumber]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // 💡 핵심: 손가락(touch)은 무시하고 오직 펜(pen)과 테스트용 마우스(mouse)만 허용합니다.
    if (e.pointerType !== 'pen' && e.pointerType !== 'mouse') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setIsDrawing(true);
    currentPathRef.current = [{ x, y }];
    drawLines();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || (e.pointerType !== 'pen' && e.pointerType !== 'mouse')) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    currentPathRef.current.push({ x, y });
    drawLines();
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPathRef.current.length > 0) {
      setLines(prev => ({
        ...prev,
        [pageNumber]: [...(prev[pageNumber] || []), currentPathRef.current]
      }));
      currentPathRef.current = [];
    }
  };

  // 📝 OMR 마킹 핸들러
  const handleAnswerSelect = (qNum: number, ans: number) => {
    if (score) return; // 채점 완료 후에는 수정 불가
    setUserAnswers(prev => ({ ...prev, [qNum]: ans }));
  };

  // 🤖 트랙 B: AI 스마트 채점
  const handleGradeExam = async () => {
    if (!answerFile) return alert("정답지 PDF 파일을 먼저 업로드해주세요.");
    
    setIsGrading(true);
    setSystemLog("📡 정답지 PDF에서 텍스트를 추출하는 중...");

    try {
      // 1. 정답지 텍스트 추출
      const formData = new FormData();
      formData.append("file", answerFile);
      const extractRes = await fetch(`${BASE_URL}/extract-pdf-text`, { method: "POST", body: formData });
      const extractData = await extractRes.json();
      
      if (!extractData.text) throw new Error("텍스트 추출 실패");

      setSystemLog("🤖 로컬 AI(Ollama)가 해설을 무시하고 정답 번호만 분석 중입니다...");

      // 2. Ollama에게 정답 추출 지시
      const prompt = `다음 텍스트는 모의고사 정답지 및 해설입니다.
해설에 속지 말고, 1번부터 ${questionCount}번까지의 '최종 정답 번호(1~5)'만 추출하세요.
반드시 마크다운 없이 순수한 JSON 객체(Dictionary) 형태로만 응답하세요.
예시: {"1": 3, "2": 4, "3": 1}

[정답지 텍스트]
${extractData.text.substring(0, 3000)}`; // 앞부분 위주로 전달

      const aiRes = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemma4:26b",
          messages: [{ role: "user", content: prompt }],
          stream: false,
          options: { temperature: 0.1 }
        })
      });

      const aiData = await aiRes.json();
      let rawText = aiData.message?.content || "";
      rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const parsedAnswers = JSON.parse(rawText);
      setCorrectAnswers(parsedAnswers);

      // 3. 채점 계산
      let correctCnt = 0;
      for (let i = 1; i <= questionCount; i++) {
        if (userAnswers[i] && parsedAnswers[i] && userAnswers[i] === parseInt(parsedAnswers[i])) {
          correctCnt++;
        }
      }
      
      setScore({ correct: correctCnt, total: questionCount });
      setSystemLog("✅ 채점이 완료되었습니다!");

    } catch (e: any) {
      console.error(e);
      setSystemLog(`❌ 채점 오류: ${e.message}`);
      alert("AI 채점 중 오류가 발생했습니다. 터미널을 확인해주세요.");
    } finally {
      setIsGrading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full h-[85vh] max-w-[1800px] mx-auto animate-in fade-in">
      
      {/* 📚 좌측: PDF 뷰어 및 펜 필기 영역 (75%) */}
      <div className="flex flex-col flex-[3] bg-[#0a0a0c] border border-white/10 rounded-sm shadow-xl overflow-hidden relative">
        <div className="flex justify-between items-center p-3 border-b border-white/10 bg-black/40">
          <div className="flex items-center gap-3">
            <span className="text-white/80 font-bold text-sm tracking-widest">📝 실전 모의고사 뷰어</span>
            {systemLog && <span className="text-[10px] text-teal-400 font-mono animate-pulse">{systemLog}</span>}
          </div>
          <div className="flex gap-2 items-center">
             <label className="cursor-pointer bg-white/10 hover:bg-white/20 text-white text-[10px] px-3 py-1.5 rounded-sm transition-colors border border-white/5">
               문제지 PDF 열기
               <input type="file" accept=".pdf" className="hidden" onChange={e => setExamFile(e.target.files?.[0] || null)} />
             </label>
             {examFile && (
               <button onClick={() => setLines(prev => ({ ...prev, [pageNumber]: [] }))} className="bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-500/30 text-[10px] px-3 py-1.5 rounded-sm transition-colors">
                 현재 쪽 필기 지우기
               </button>
             )}
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-[#1a1a1f] relative flex justify-center p-4 custom-scrollbar">
          {!examFile ? (
            <div className="flex flex-col items-center justify-center h-full text-white/30 space-y-4">
              <span className="text-4xl">📄</span>
              <p className="text-sm font-serif">상단의 버튼을 눌러 문제지 PDF를 불러오세요.</p>
            </div>
          ) : (
            <div className="relative inline-block shadow-2xl">
              {/* PDF 페이지 렌더링 */}
              <Document file={examFile} onLoadSuccess={onDocumentLoadSuccess} className="pointer-events-none">
                <Page 
                  pageNumber={pageNumber} 
                  renderTextLayer={false} 
                  renderAnnotationLayer={false}
                  width={800} // 데스크탑/태블릿 최적화 너비
                />
              </Document>

              {/* S펜 필기용 투명 캔버스 레이어 */}
              <canvas
                ref={canvasRef}
                width={800}
                height={1131} // A4 비율 대략적 높이
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                className="absolute top-0 left-0 w-full h-full cursor-crosshair touch-none"
                style={{ zIndex: 10 }}
              />
            </div>
          )}
        </div>

        {/* PDF 하단 페이지 컨트롤러 */}
        {numPages && (
          <div className="flex justify-center items-center gap-4 p-3 bg-black/40 border-t border-white/10 shrink-0">
            <button 
              onClick={() => setPageNumber(p => Math.max(1, p - 1))} 
              disabled={pageNumber <= 1}
              className="px-4 py-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-30 rounded-sm text-xs font-bold"
            >
              ◀ 이전 장
            </button>
            <span className="text-xs text-white/60 font-mono font-bold tracking-widest">
              {pageNumber} / {numPages}
            </span>
            <button 
              onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} 
              disabled={pageNumber >= numPages}
              className="px-4 py-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-30 rounded-sm text-xs font-bold"
            >
              다음 장 ▶
            </button>
          </div>
        )}
      </div>

      {/* 📋 우측: OMR 답안지 영역 (25%) */}
      <div className="flex flex-col flex-1 min-w-[280px] bg-[#0a0a0c] border border-white/10 rounded-sm shadow-xl overflow-hidden h-full">
        <div className="p-4 border-b border-white/10 bg-indigo-950/20">
          <div className="flex justify-between items-center mb-4">
             <h2 className="text-base font-bold tracking-widest text-indigo-300">OMR 답안지</h2>
             <div className="flex items-center gap-2">
               <span className="text-[10px] text-white/50">문항 수:</span>
               <select 
                 value={questionCount} 
                 onChange={e => setQuestionCount(Number(e.target.value))}
                 className="bg-black border border-white/20 text-xs text-white p-1 rounded outline-none"
                 disabled={score !== null}
               >
                 <option value={20}>20문제</option>
                 <option value={40}>40문제</option>
                 <option value={50}>50문제</option>
               </select>
             </div>
          </div>

          {score ? (
            <div className="bg-teal-900/30 border border-teal-500/50 p-4 rounded-sm text-center">
              <div className="text-[10px] text-teal-400 font-bold mb-1">최종 채점 결과</div>
              <div className="text-3xl font-mono font-bold text-white">
                {score.correct} <span className="text-lg text-white/40">/ {score.total}</span>
              </div>
              <div className="text-xs text-teal-300 mt-2">({Math.round((score.correct / score.total) * 100)}점)</div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
               <label className="cursor-pointer w-full text-center bg-indigo-900/40 hover:bg-indigo-900/60 border border-indigo-500/30 text-indigo-300 text-[11px] font-bold py-2 rounded-sm transition-colors shadow-sm">
                 {answerFile ? `✅ ${answerFile.name} (채점 준비됨)` : "📥 정답지 PDF 업로드 (채점용)"}
                 <input type="file" accept=".pdf" className="hidden" onChange={e => setAnswerFile(e.target.files?.[0] || null)} />
               </label>
               <button 
                 onClick={handleGradeExam}
                 disabled={isGrading || !answerFile}
                 className={`w-full py-3 text-xs font-bold rounded-sm transition-all shadow-md ${isGrading ? 'bg-white/10 text-white/30' : 'bg-teal-600 text-white hover:bg-teal-500'}`}
               >
                 {isGrading ? "AI 정답 추출 및 채점 중..." : "🚀 자동 채점 시작"}
               </button>
            </div>
          )}
        </div>

        {/* OMR 마킹 리스트 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 bg-black/20">
          <div className="space-y-2 pb-10">
            {Array.from({ length: questionCount }).map((_, idx) => {
              const qNum = idx + 1;
              const isCorrect = correctAnswers && userAnswers[qNum] === parseInt(correctAnswers[qNum] as any);
              const isWrong = correctAnswers && userAnswers[qNum] !== parseInt(correctAnswers[qNum] as any);

              return (
                <div key={qNum} className={`flex items-center gap-3 p-2 rounded-sm border ${isCorrect ? 'bg-teal-950/20 border-teal-500/30' : isWrong ? 'bg-red-950/20 border-red-500/30' : 'bg-white/5 border-transparent hover:border-white/10'}`}>
                  <div className="w-6 text-right font-mono text-[11px] font-bold text-white/60 shrink-0">
                    {String(qNum).padStart(2, '0')}.
                  </div>
                  
                  <div className="flex gap-1.5 flex-1 justify-center">
                    {[1, 2, 3, 4, 5].map(opt => (
                      <button
                        key={opt}
                        onClick={() => handleAnswerSelect(qNum, opt)}
                        className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full text-[10px] font-bold border transition-all flex items-center justify-center shrink-0 ${
                          userAnswers[qNum] === opt 
                            ? 'bg-indigo-500 border-indigo-400 text-white shadow-[0_0_8px_rgba(99,102,241,0.6)]' 
                            : 'bg-black/50 border-white/20 text-white/40 hover:border-indigo-500/50'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>

                  {/* 채점 결과 표시 영역 */}
                  {correctAnswers && (
                    <div className="w-10 flex items-center justify-center shrink-0 border-l border-white/10 pl-2">
                      {isCorrect ? (
                        <span className="text-teal-400 font-bold text-sm">✅</span>
                      ) : (
                        <div className="flex flex-col items-center">
                          <span className="text-red-400 font-bold text-[10px]">❌</span>
                          <span className="text-[9px] text-white/60 font-mono mt-0.5">정답:{correctAnswers[qNum] || '?'}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
