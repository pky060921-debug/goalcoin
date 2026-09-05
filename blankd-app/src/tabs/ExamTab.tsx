import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

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
  
  // 💡 [해결 3] OMR 마킹 영구 저장 (탭을 이동해도 날아가지 않음)
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>(() => {
    try { return JSON.parse(localStorage.getItem(`blankd_omr_${safeAddress}`) || '{}'); } catch { return {}; }
  });
  
  const [correctAnswers, setCorrectAnswers] = useState<Record<number, number> | null>(() => {
    try { return JSON.parse(localStorage.getItem(`blankd_omr_correct_${safeAddress}`) || 'null'); } catch { return null; }
  });

  const [isGrading, setIsGrading] = useState(false);
  const [score, setScore] = useState<{ correct: number, total: number } | null>(() => {
    try { return JSON.parse(localStorage.getItem(`blankd_omr_score_${safeAddress}`) || 'null'); } catch { return null; }
  });
  const [systemLog, setSystemLog] = useState<string>("");

  // 💡 [해결 3] S펜 필기 데이터 영구 저장
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lines, setLines] = useState<Record<number, any[]>>(() => {
    try { return JSON.parse(localStorage.getItem(`blankd_drawings_${safeAddress}`) || '{}'); } catch { return {}; }
  }); 
  const currentPathRef = useRef<any[]>([]);

  // 상태 변경 시 로컬 스토리지에 실시간 동기화
  useEffect(() => { localStorage.setItem(`blankd_omr_${safeAddress}`, JSON.stringify(userAnswers)); }, [userAnswers]);
  useEffect(() => { localStorage.setItem(`blankd_drawings_${safeAddress}`, JSON.stringify(lines)); }, [lines]);
  useEffect(() => { localStorage.setItem(`blankd_omr_correct_${safeAddress}`, JSON.stringify(correctAnswers)); }, [correctAnswers]);
  useEffect(() => { localStorage.setItem(`blankd_omr_score_${safeAddress}`, JSON.stringify(score)); }, [score]);

  // 📄 PDF 로드 완료 핸들러
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  // ✍️ 캔버스 렌더링
  const drawLines = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)'; // 빨간펜

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

  // 💡 [해결 2] 브라우저 확대/축소 비율과 캔버스 좌표를 1:1 매칭하는 보정 공식
  const getScaledCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== 'pen' && e.pointerType !== 'mouse') return;
    const { x, y } = getScaledCoordinates(e);
    setIsDrawing(true);
    currentPathRef.current = [{ x, y }];
    drawLines();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || (e.pointerType !== 'pen' && e.pointerType !== 'mouse')) return;
    const { x, y } = getScaledCoordinates(e);
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

  const handleAnswerSelect = (qNum: number, ans: number) => {
    if (score) return; // 채점 후 수정 불가
    setUserAnswers(prev => ({ ...prev, [qNum]: ans }));
  };

  // 기록 전체 초기화 (새로운 모의고사를 풀고 싶을 때)
  const handleResetAll = () => {
    if (window.confirm("모든 필기와 OMR 마킹 기록을 삭제하시겠습니까?")) {
      setLines({});
      setUserAnswers({});
      setCorrectAnswers(null);
      setScore(null);
      setPageNumber(1);
      setSystemLog("🔄 기록이 성공적으로 초기화되었습니다.");
    }
  };

  // 💡 [해결 1] 프록시 API(백엔드)를 거쳐 안전하게 채점 요청
  const handleGradeExam = async () => {
    if (!answerFile) return alert("정답지 PDF 파일을 먼저 업로드해주세요.");
    
    setIsGrading(true);
    setSystemLog("📡 정답지 PDF 텍스트 추출 중...");

    try {
      const formData = new FormData();
      formData.append("file", answerFile);
      const extractRes = await fetch(`${BASE_URL}/extract-pdf-text`, { method: "POST", body: formData });
      const extractData = await extractRes.json();
      
      if (!extractData.text) throw new Error("텍스트 추출 실패");

      setSystemLog("🤖 백엔드 서버(Ollama)에서 정답 번호 추출 중...");

      // 🚨 브라우저에서 직접 localhost를 부르지 않고 백엔드로 요청을 우회
      const aiRes = await fetch(`${BASE_URL}/grade-exam`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: extractData.text,
          question_count: questionCount
        })
      });

      if (!aiRes.ok) throw new Error("AI 채점 서버 연결 실패");

      const parsedAnswers = await aiRes.json();
      setCorrectAnswers(parsedAnswers);

      let correctCnt = 0;
      for (let i = 1; i <= questionCount; i++) {
        if (userAnswers[i] && parsedAnswers[String(i)] && userAnswers[i] === parseInt(parsedAnswers[String(i)])) {
          correctCnt++;
        }
      }
      
      setScore({ correct: correctCnt, total: questionCount });
      setSystemLog("✅ 채점이 완료되었습니다!");

    } catch (e: any) {
      console.error(e);
      setSystemLog(`❌ 채점 오류: ${e.message}`);
      alert("서버 연결에 실패했습니다. 백엔드가 정상적으로 작동 중인지 확인해주세요.");
    } finally {
      setIsGrading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full h-[85vh] max-w-[1800px] mx-auto animate-in fade-in">
      
      {/* 📚 좌측: PDF 뷰어 및 펜 필기 영역 */}
      <div className="flex flex-col flex-[3] bg-[#0a0a0c] border border-white/10 rounded-sm shadow-xl overflow-hidden relative">
        <div className="flex justify-between items-center p-3 border-b border-white/10 bg-black/40">
          <div className="flex items-center gap-3">
            <span className="text-white/80 font-bold text-sm tracking-widest">📝 실전 모의고사 뷰어</span>
            {systemLog && <span className="text-[10px] text-teal-400 font-mono animate-pulse">{systemLog}</span>}
          </div>
          <div className="flex gap-2 items-center">
             <label className="cursor-pointer bg-white/10 hover:bg-white/20 text-white text-[10px] px-3 py-1.5 rounded-sm transition-colors border border-white/5">
               문제지 열기
               <input type="file" accept=".pdf" className="hidden" onChange={e => setExamFile(e.target.files?.[0] || null)} />
             </label>
             <button onClick={handleResetAll} className="bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-500/30 text-[10px] px-3 py-1.5 rounded-sm transition-colors">
               모든 기록 초기화
             </button>
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
              <Document file={examFile} onLoadSuccess={onDocumentLoadSuccess} className="pointer-events-none">
                <Page 
                  pageNumber={pageNumber} 
                  renderTextLayer={false} 
                  renderAnnotationLayer={false}
                  width={800} 
                />
              </Document>

              <canvas
                ref={canvasRef}
                width={800}
                height={1131}
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

      {/* 📋 우측: OMR 답안지 영역 */}
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
                 {isGrading ? "AI 자동 채점 진행 중..." : "🚀 자동 채점 시작"}
               </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 bg-black/20">
          <div className="space-y-2 pb-10">
            {Array.from({ length: questionCount }).map((_, idx) => {
              const qNum = idx + 1;
              const isCorrect = correctAnswers && userAnswers[qNum] === parseInt(correctAnswers[String(qNum)] as any);
              const isWrong = correctAnswers && userAnswers[qNum] !== parseInt(correctAnswers[String(qNum)] as any);

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

                  {correctAnswers && (
                    <div className="w-10 flex items-center justify-center shrink-0 border-l border-white/10 pl-2">
                      {isCorrect ? (
                        <span className="text-teal-400 font-bold text-sm">✅</span>
                      ) : (
                        <div className="flex flex-col items-center">
                          <span className="text-red-400 font-bold text-[10px]">❌</span>
                          <span className="text-[9px] text-white/60 font-mono mt-0.5">답:{correctAnswers[String(qNum)] || '?'}</span>
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
