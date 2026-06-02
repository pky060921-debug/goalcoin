import React, { useState, useRef, useEffect } from "react";

const BASE_URL = "https://api.blankd.top/api";

interface ExamQuestion {
  id: number;
  questionText: string;
  choices: string[];
  correctAnswer: number; 
  explanation: string;   
}

export const ExamTab = ({ walletAddress, address }: any) => {
  const userAddress = walletAddress || address;
  const [phase, setPhase] = useState<'idle' | 'analyzing' | 'ready' | 'testing' | 'result'>('idle');
  const [progress, setProgress] = useState(0);
  const [examData, setExamData] = useState<ExamQuestion[]>([]);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [score, setScore] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (phase === 'analyzing') {
      setProgress(0);
      interval = setInterval(() => {
        setProgress(prev => (prev >= 95 ? 95 : prev + (prev < 50 ? 5 : prev < 80 ? 2 : 0.5)));
      }, 500);
    }
    return () => clearInterval(interval);
  }, [phase]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userAddress) return alert("파일과 지갑 주소가 필요합니다.");

    setPhase('analyzing'); 
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("wallet_address", userAddress);

      const response = await fetch(`${BASE_URL}/upload-exam-cbt`, { method: "POST", body: formData });
      const data = await response.json();

      if (response.ok && data.questions) {
        setProgress(100); 
        setTimeout(() => {
          setExamData(data.questions); 
          setPhase('ready');
        }, 500); 
      } else {
        throw new Error(data.error || "분석 결과가 올바르지 않습니다.");
      }
    } catch (error: any) {
      alert(`파일 분석 중 오류가 발생했습니다: ${error.message}`);
      setPhase('idle');
    }
  };

  const submitExam = () => {
    if (Object.keys(userAnswers).length < examData.length) {
      if (!confirm("아직 풀지 않은 문제가 있습니다. 그래도 제출하시겠습니까?")) return;
    }
    const currentScore = examData.filter(q => userAnswers[q.id] === q.correctAnswer).length;
    setScore(Math.round((currentScore / examData.length) * 100));
    setPhase('result');
  };

  const resetExamTab = () => {
    setPhase('idle'); setExamData([]); setUserAnswers({}); setProgress(0); setScore(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="p-6 h-full flex flex-col font-sans animate-in fade-in">
      {phase === 'idle' && (
        <div className="flex-1 flex flex-col items-center justify-center border border-white/10 bg-[#121214] p-10 text-center">
          <h2 className="text-xl font-bold text-white mb-2">모의고사 CBT 변환 시스템</h2>
          <p className="text-white/50 text-sm mb-8">가지고 계신 모의고사 파일(문제+정답)을 업로드하면 AI가 실전용으로 변환합니다.</p>
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept=".txt,.pdf" />
          <button onClick={() => fileInputRef.current?.click()} className="px-6 py-3 bg-teal-900/30 text-teal-400 border border-teal-500/50 hover:bg-teal-900/50 transition-colors font-bold tracking-wide">
            문제 업로드 및 분석 시작
          </button>
        </div>
      )}

      {phase === 'analyzing' && (
        <div className="flex-1 flex flex-col items-center justify-center border border-white/10 bg-[#121214] p-10">
          <h2 className="text-xl font-bold text-teal-300 mb-6 animate-pulse">로컬 AI 분석 가동 중...</h2>
          <div className="w-full max-w-md h-2 bg-black border border-white/20 mb-4 relative overflow-hidden">
            <div className="h-full bg-teal-500 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-white/70 font-mono text-sm">{Math.floor(progress)}% 파싱 및 해설 작성 중</p>
        </div>
      )}

      {phase === 'ready' && (
        <div className="flex-1 flex flex-col items-center justify-center border border-teal-900/50 bg-[#121214] p-10 text-center">
          <h2 className="text-2xl font-bold text-teal-400 mb-2">출제 완료!</h2>
          <p className="text-white/70 mb-8">총 {examData.length}문항 변환 완료. 실전처럼 풀어보세요.</p>
          <button onClick={() => setPhase('testing')} className="px-8 py-4 bg-teal-900/30 text-teal-300 border border-teal-500/50 hover:bg-teal-900/60 font-bold transition-colors">
            실전 모의고사 시작
          </button>
        </div>
      )}

      {phase === 'testing' && (
        <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10">
            <h2 className="text-lg font-bold text-white">실전 모의고사</h2>
            <span className="text-teal-400 font-mono">{Object.keys(userAnswers).length} / {examData.length} 완료</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-8 pb-10 pr-2">
            {examData.map((q, idx) => (
              <div key={q.id} className="bg-[#1a1a1d] border border-white/5 p-6">
                <p className="text-white/90 font-bold mb-4 whitespace-pre-wrap"><span className="text-teal-500 mr-2">Q{idx + 1}.</span> {q.questionText}</p>
                <div className="space-y-2">
                  {q.choices.map((choice, cIdx) => (
                    <label key={cIdx} className={`block p-3 border transition-colors cursor-pointer ${userAnswers[q.id] === cIdx ? 'bg-teal-900/20 border-teal-500/50 text-teal-200' : 'bg-black/40 border-white/10 text-white/60 hover:bg-white/5'}`}>
                      <input type="radio" name={`q_${q.id}`} className="hidden" checked={userAnswers[q.id] === cIdx} onChange={() => setUserAnswers(prev => ({ ...prev, [q.id]: cIdx }))} />
                      <span className="mr-3 text-xs opacity-50">{(cIdx + 1)}</span> {choice}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="pt-4 border-t border-white/10"><button onClick={submitExam} className="w-full py-4 bg-white/10 text-white border border-white/20 hover:bg-white/20 font-bold">답안지 제출</button></div>
        </div>
      )}

      {phase === 'result' && (
        <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
          <div className="text-center mb-8 pb-6 border-b border-white/10">
            <h2 className="text-2xl font-bold text-white mb-2">테스트 결과</h2>
            <p className={`text-5xl font-black ${score >= 80 ? 'text-teal-400' : 'text-amber-400'}`}>{score}점</p>
          </div>
          <div className="flex-1 overflow-y-auto space-y-8 pb-10 pr-2">
            {examData.map((q, idx) => {
              const isCorrect = userAnswers[q.id] === q.correctAnswer;
              return (
                <div key={q.id} className={`p-6 border ${isCorrect ? 'bg-teal-900/10 border-teal-900/30' : 'bg-red-900/10 border-red-900/30'}`}>
                  <p className="text-white/90 font-bold mb-4 whitespace-pre-wrap"><span className={isCorrect ? 'text-teal-500 mr-2' : 'text-red-500 mr-2'}>{isCorrect ? '✅' : '❌'} Q{idx + 1}.</span> {q.questionText}</p>
                  <div className="space-y-2 mb-6 opacity-70">
                    {q.choices.map((c, cIdx) => (
                      <div key={cIdx} className={`p-2 px-4 border flex items-center ${q.correctAnswer === cIdx ? 'bg-teal-900/30 border-teal-500/50 text-teal-300' : userAnswers[q.id] === cIdx ? 'bg-red-900/30 border-red-500/50 text-red-300' : 'border-white/5 text-white/40'}`}>
                        <span className="mr-3 text-xs opacity-50">{(cIdx + 1)}</span> {c}
                        {q.correctAnswer === cIdx && <span className="ml-auto text-xs font-bold text-teal-400">정답</span>}
                      </div>
                    ))}
                  </div>
                  <div className="bg-black/60 border border-teal-900/30 p-4 relative">
                    <span className="absolute -top-3 left-4 bg-[#121214] px-2 text-xs font-bold text-teal-500 uppercase">AI 해설</span>
                    <p className="text-white/70 text-sm leading-relaxed mt-2 whitespace-pre-wrap">{q.explanation}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="pt-4 border-t border-white/10 text-center"><button onClick={resetExamTab} className="px-8 py-3 bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white">처음으로</button></div>
        </div>
      )}
    </div>
  );
};
