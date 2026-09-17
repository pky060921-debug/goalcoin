import React, { useState, useEffect } from 'react';

const BASE_URL = "https://api.blankd.top/api";

export const ExamTab = ({ walletAddress, address }: any) => {
  const safeAddress = walletAddress || address;

  const [viewMode, setViewMode] = useState<'list' | 'cbt'>('list');
  const [examBanks, setExamBanks] = useState<any[]>([]);
  const [selectedBank, setSelectedBank] = useState<any>(null);
  
  // CBT 상태
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [isGraded, setIsGraded] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [isUploading, setIsUploading] = useState(false);

  // 모의고사 목록 불러오기
  const fetchExamBanks = async () => {
    try {
      const res = await fetch(`${BASE_URL}/get-exam-banks?wallet_address=${safeAddress}`);
      const data = await res.json();
      setExamBanks(data);
    } catch (e) {
      console.error("목록 불러오기 실패:", e);
    }
  };

  useEffect(() => {
    fetchExamBanks();
  }, [safeAddress]);

  // JSON 파일 업로드
  const handleUploadJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("wallet_address", safeAddress);

    try {
      const res = await fetch(`${BASE_URL}/upload-exam-json`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "성공적으로 업로드되었습니다.");
        fetchExamBanks();
      } else {
        alert(`업로드 실패: ${data.error}`);
      }
    } catch (err) {
      alert("업로드 중 서버 에러가 발생했습니다.");
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  // 모의고사 시작
  const startExam = async (bank: any) => {
    try {
      const res = await fetch(`${BASE_URL}/get-exam-bank-questions-cbt?bank_id=${bank.id}&wallet_address=${safeAddress}`);
      const data = await res.json();
      setQuestions(data);
      setSelectedBank(bank);
      setAnswers({});
      setIsGraded(false);
      setCurrentQIdx(0);
      setViewMode('cbt');
    } catch (e) {
      alert("문제를 불러오는데 실패했습니다.");
    }
  };

  const handleAnswerSelect = (qNo: number, ans: string) => {
    if (isGraded) return;
    setAnswers(prev => ({ ...prev, [qNo]: ans }));
  };

  const submitExam = () => {
    if (!window.confirm("제출하고 채점하시겠습니까?")) return;
    
    let correct = 0;
    questions.forEach(q => {
      if (answers[q.question_no] === q.correct_answer) correct++;
    });
    setScore({ correct, total: questions.length });
    setIsGraded(true);
    setCurrentQIdx(0); // 첫 문제로 돌아가서 해설 확인
  };

  // 📋 1. 목록 화면
  if (viewMode === 'list') {
    return (
      <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in pb-24 w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-white/10 pb-4 gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif text-indigo-400 tracking-tight mb-2">실전 CBT 모의고사</h1>
            <p className="text-[11px] sm:text-xs text-white/40 leading-relaxed">
              통합 JSON 모의고사 파일을 업로드하고, 실제 시험장과 동일한 환경에서 문제를 풀어보세요.
            </p>
          </div>
          
          <label className={`cursor-pointer px-4 py-2.5 rounded-sm font-bold text-[11px] sm:text-xs transition-all shadow-lg flex items-center gap-2 ${isUploading ? 'bg-white/5 text-white/30 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}>
            {isUploading ? '⏳ JSON 파일 처리 중...' : '📥 JSON 모의고사 세트 일괄 업로드'}
            <input type="file" accept=".json" className="hidden" onChange={handleUploadJson} disabled={isUploading} />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {examBanks.map(bank => (
            <div key={bank.id} className="bg-[#0a0a0c] border border-white/10 p-5 rounded-sm shadow-md flex flex-col justify-between gap-4 hover:border-indigo-500/50 transition-colors">
              <div>
                <h3 className="font-bold text-white/90 text-sm mb-1">{bank.filename}</h3>
                <span className="text-xs text-indigo-400 font-mono">총 {bank.total_questions}문항</span>
              </div>
              <button 
                onClick={() => startExam(bank)}
                className="w-full py-2 bg-indigo-900/30 text-indigo-300 text-xs font-bold rounded border border-indigo-500/30 hover:bg-indigo-900/50 transition-all"
              >
                CBT 응시하기 ▶
              </button>
            </div>
          ))}
          {examBanks.length === 0 && (
             <div className="col-span-full text-center py-20 text-white/30 text-sm font-serif border border-dashed border-white/10 rounded-sm bg-black/20">
               우측 상단 버튼을 눌러 모의고사 JSON 파일을 업로드 해주세요.
             </div>
          )}
        </div>
      </div>
    );
  }

  // 📝 2. CBT 시험 응시 화면
  const currentQ = questions[currentQIdx];

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full h-[85vh] max-w-[1600px] mx-auto animate-in fade-in">
      
      {/* 좌측: 문제 풀이 영역 (75%) */}
      <div className="flex flex-col flex-[3] bg-[#0a0a0c] border border-white/10 rounded-sm shadow-xl overflow-hidden relative">
        <div className="flex justify-between items-center p-4 border-b border-white/10 bg-indigo-950/20">
          <h2 className="text-indigo-300 font-bold text-sm tracking-widest">{selectedBank.filename}</h2>
          <button onClick={() => setViewMode('list')} className="text-white/40 hover:text-white text-xs px-3 py-1 bg-white/5 rounded transition-colors">
            목록으로 나가기 ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar">
          {currentQ && (
            <div className="animate-in slide-in-from-right-4">
              <div className="flex gap-4 items-start">
                <span className="text-2xl font-bold text-indigo-400 font-mono shrink-0 leading-none mt-1">
                  Q{currentQ.question_no}.
                </span>
                <div className="text-[15px] sm:text-[17px] leading-loose text-white/90 font-serif whitespace-pre-wrap">
                  {currentQ.question_text}
                </div>
              </div>

              {/* 1~5번 답안 선택 버튼 */}
              <div className="mt-10 ml-12 flex gap-3 flex-wrap">
                {[1, 2, 3, 4, 5].map(opt => {
                  const isSelected = answers[currentQ.question_no] === String(opt);
                  const isAnswer = isGraded && currentQ.correct_answer === String(opt);
                  const isWrongSelected = isGraded && isSelected && !isAnswer;

                  let btnStyle = "bg-black/50 border-white/20 text-white/60 hover:border-indigo-400";
                  if (isSelected && !isGraded) btnStyle = "bg-indigo-600 border-indigo-400 text-white shadow-[0_0_15px_rgba(79,70,229,0.4)]";
                  if (isAnswer) btnStyle = "bg-teal-600 border-teal-400 text-white shadow-[0_0_15px_rgba(13,148,136,0.4)]";
                  if (isWrongSelected) btnStyle = "bg-red-600 border-red-400 text-white";

                  return (
                    <button
                      key={opt}
                      onClick={() => handleAnswerSelect(currentQ.question_no, String(opt))}
                      className={`w-12 h-12 rounded-full border-2 font-bold text-lg transition-all ${btnStyle}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>

              {/* 해설 영역 (채점 후 표시) */}
              {isGraded && currentQ.explanation && (
                <div className="mt-10 ml-12 bg-indigo-900/20 border border-indigo-500/30 p-5 rounded-sm animate-in slide-in-from-bottom-4">
                  <div className="text-indigo-400 font-bold mb-3 flex items-center gap-2">
                    <span className="text-lg">💡</span> 정답 및 해설 (정답: {currentQ.correct_answer}번)
                  </div>
                  <div className="text-[13px] text-white/80 leading-relaxed font-serif break-keep">
                    {currentQ.explanation}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 이전/다음 버튼 */}
        <div className="flex justify-between p-4 border-t border-white/10 bg-black/40">
          <button 
            onClick={() => setCurrentQIdx(p => Math.max(0, p - 1))}
            disabled={currentQIdx === 0}
            className="px-6 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded text-xs font-bold transition-colors"
          >
            ◀ 이전 문제
          </button>
          <button 
            onClick={() => setCurrentQIdx(p => Math.min(questions.length - 1, p + 1))}
            disabled={currentQIdx === questions.length - 1}
            className="px-6 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded text-xs font-bold transition-colors"
          >
            다음 문제 ▶
          </button>
        </div>
      </div>

      {/* 우측: OMR 답안지 영역 (25%) */}
      <div className="flex flex-col flex-1 min-w-[280px] bg-[#0a0a0c] border border-white/10 rounded-sm shadow-xl overflow-hidden h-full">
        <div className="p-4 border-b border-white/10 bg-black/40">
          <h2 className="text-sm font-bold tracking-widest text-white/80 mb-4">OMR 답안지</h2>
          {isGraded ? (
            <div className="bg-teal-900/20 border border-teal-500/50 p-4 rounded-sm text-center">
              <div className="text-[10px] text-teal-400 font-bold mb-1">최종 점수</div>
              <div className="text-3xl font-mono font-bold text-white">
                {score.correct} <span className="text-lg text-white/40">/ {score.total}</span>
              </div>
              <div className="text-xs text-teal-300 mt-2">({Math.round((score.correct / score.total) * 100)}점)</div>
            </div>
          ) : (
            <button 
              onClick={submitExam}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-sm shadow-[0_0_15px_rgba(79,70,229,0.3)] transition-all"
            >
              제출 및 채점하기
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-black/20 custom-scrollbar">
          <div className="grid grid-cols-5 sm:grid-cols-4 md:grid-cols-5 gap-2 pb-10">
            {questions.map((q, idx) => {
              const isAnswered = !!answers[q.question_no];
              const isCorrect = isGraded && answers[q.question_no] === q.correct_answer;
              const isWrong = isGraded && answers[q.question_no] !== q.correct_answer;
              const isActive = currentQIdx === idx;

              let btnColor = "bg-black/50 border-white/10 text-white/40"; // 기본
              if (isAnswered && !isGraded) btnColor = "bg-indigo-900/60 border-indigo-500/50 text-indigo-200"; // 마킹됨
              if (isCorrect) btnColor = "bg-teal-900/80 border-teal-500 text-teal-300 shadow-[0_0_8px_rgba(13,148,136,0.3)]"; // 정답
              if (isWrong) btnColor = "bg-red-900/80 border-red-500 text-red-300 shadow-[0_0_8px_rgba(239,68,68,0.3)]"; // 오답

              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentQIdx(idx)}
                  className={`relative w-full aspect-square rounded-sm border font-mono font-bold text-[11px] sm:text-xs flex items-center justify-center transition-all hover:scale-105 ${btnColor} ${isActive ? 'ring-2 ring-white ring-offset-2 ring-offset-black z-10' : ''}`}
                >
                  {q.question_no}
                  {/* 채점 완료 시 번호 아래에 내가 마킹한 번호 작게 표시 */}
                  {isGraded && (
                     <span className="absolute bottom-0.5 right-1 text-[8px] opacity-70">
                       {answers[q.question_no] || '-'}
                     </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
