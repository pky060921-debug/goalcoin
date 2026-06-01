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

  // 상태 관리: idle -> analyzing -> ready -> testing -> result
  const [phase, setPhase] = useState<'idle' | 'analyzing' | 'ready' | 'testing' | 'result'>('idle');
  const [progress, setProgress] = useState(0);
  
  const [examData, setExamData] = useState<ExamQuestion[]>([]);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [score, setScore] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 💡 가짜 프로그레스 바 (AI 통신 대기 중 시각적 효과)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (phase === 'analyzing') {
      setProgress(0);
      interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) return 95;
          const increment = prev < 50 ? 5 : prev < 80 ? 2 : 0.5;
          return prev + increment;
        });
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

      // 💡 백엔드(api.py)의 새로운 객관식 자동 출제 API 호출
      const response = await fetch(`${BASE_URL}/upload-exam-cbt`, {
        method: "POST",
        body: formData,
      });
      
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
      console.error("AI 분석 실패:", error);
      alert(`파일 분석 중 오류가 발생했습니다: ${error.message}`);
      setPhase('idle');
    }
  };

  const submitExam = () => {
    if (Object.keys(userAnswers).length < examData.length) {
      if (!confirm("아직 풀지 않은 문제가 있습니다. 그래도 제출하시겠습니까?")) return;
    }
    
    let currentScore = 0;
    examData.forEach(q => {
      if (userAnswers[q.id] === q.correctAnswer) currentScore++;
    });
    
    setScore(Math.round((currentScore / examData.length) * 100));
    setPhase('result');
  };

  const resetExamTab = () => {
    setPhase('idle');
    setExamData([]);
    setUserAnswers({});
    setProgress(0);
    setScore(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="p-6 h-full flex flex-col font-sans animate-in fade-in">
      
      {/* 1. 대기 및 업로드 화면 */}
      {phase === 'idle' && (
        <div className="flex-1 flex flex-col items-center justify-center border border-white/10 bg-[#121214] p-10 text-center">
          <h2 className="text-xl font-bold text-white mb-2">모의고사 자동 생성 시스템</h2>
          <p className="text-white/50 text-sm mb-8">참고할 법령이나 교재 파일을 올리면, AI가 읽고 즉시 4지선다형 모의고사를 출제합니다.</p>
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept=".txt,.pdf" />
          <button onClick={() => fileInputRef.current?.click()} className="px-6 py-3 bg-teal-900/30 text-teal-400 border border-teal-500/50 hover:bg-teal-900/50 transition-colors font-bold tracking-wide">
            문서 업로드 및 AI 분석 시작
          </button>
        </div>
      )}

      {/* 2. AI 분석 진행 중 화면 */}
      {phase === 'analyzing' && (
        <div className="flex-1 flex flex-col items-center justify-center border border-white/10 bg-[#121214] p-10">
          <h2 className="text-xl font-bold text-amber-300 mb-6 animate-pulse">로컬 뇌(Gemma 26B) 가동 중...</h2>
          <div className="w-full max-w-md h-2 bg-black border border-white/20 mb-4 relative overflow-hidden">
            <div className="h-full bg-amber-500 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-white/70 font-mono text-sm">{Math.floor(progress)}% 분석 및 문제 출제 중</p>
          <p className="text-white/40 text-xs mt-4">문맥을 파악하고 함정 보기를 생성하고 있습니다.</p>
        </div>
      )}

      {/* 3. 분석 완료 및 시험 준비 화면 */}
      {phase === 'ready' && (
        <div className="flex-1 flex flex-col items-center justify-center border border-teal-900/50 bg-[#121214] p-10 text-center">
          <h2 className="text-2xl font-bold text-teal-400 mb-2">출제 완료!</h2>
          <p className="text-white/70 mb-8">총 {examData.length}문항의 실전 테스트 및 AI 해설 생성이 완료되었습니다.</p>
          <button onClick={() => setPhase('testing')} className="px-8 py-4 bg-teal-900/30 text-teal-300 border border-teal-500/50 hover:bg-teal-900/60 font-bold text-lg transition-colors">
            실전 모의고사 시작
          </button>
        </div>
      )}

      {/* 4. 실전 풀이 화면 */}
      {phase === 'testing' && (
        <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10">
            <h2 className="text-lg font-bold text-white">실전 모의고사</h2>
            <span className="text-amber-400 font-mono">{Object.keys(userAnswers).length} / {examData.length} 완료</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-8 pb-10 custom-scrollbar pr-2">
            {examData.map((q, idx) => (
              <div key={q.id} className="bg-[#1a1a1d] border border-white/5 p-6">
                <p className="text-white/90 font-bold mb-4 leading-relaxed whitespace-pre-wrap">
                  <span className="text-amber-500 mr-2">Q{idx + 1}.</span> {q.questionText}
                </p>
                <div className="space-y-2">
                  {q.choices.map((choice, cIdx) => (
                    <label key={cIdx} className={`block p-3 border transition-colors cursor-pointer ${userAnswers[q.id] === cIdx ? 'bg-amber-900/20 border-amber-500/50 text-amber-200' : 'bg-black/40 border-white/10 text-white/60 hover:bg-white/5'}`}>
                      <input type="radio" name={`q_${q.id}`} className="hidden" checked={userAnswers[q.id] === cIdx} onChange={() => setUserAnswers(prev => ({ ...prev, [q.id]: cIdx }))} />
                      <span className="mr-3 text-xs opacity-50">{(cIdx + 1)}</span> {choice}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="pt-4 border-t border-white/10 mt-4">
            <button onClick={submitExam} className="w-full py-4 bg-white/10 text-white border border-white/20 hover:bg-white/20 font-bold transition-colors">
              답안지 제출 및 채점
            </button>
          </div>
        </div>
      )}

      {/* 5. 결과 및 해설 확인 화면 */}
      {phase === 'result' && (
        <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
          <div className="text-center mb-8 pb-6 border-b border-white/10">
            <h2 className="text-2xl font-bold text-white mb-2">테스트 결과</h2>
            <p className={`text-5xl font-black ${score >= 80 ? 'text-teal-400' : score >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{score}점</p>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-8 pb-10 custom-scrollbar pr-2">
            {examData.map((q, idx) => {
              const isCorrect = userAnswers[q.id] === q.correctAnswer;
              return (
                <div key={q.id} className={`p-6 border ${isCorrect ? 'bg-teal-900/10 border-teal-900/30' : 'bg-red-900/10 border-red-900/30'}`}>
                  <p className="text-white/90 font-bold mb-4 leading-relaxed whitespace-pre-wrap">
                    <span className={isCorrect ? 'text-teal-500 mr-2' : 'text-red-500 mr-2'}>
                      {isCorrect ? '✅' : '❌'} Q{idx + 1}.
                    </span> 
                    {q.questionText}
                  </p>
                  
                  <div className="space-y-2 mb-6 opacity-70">
                    {q.choices.map((choice, cIdx) => (
                      <div key={cIdx} className={`p-2 px-4 border flex items-center ${q.correctAnswer === cIdx ? 'bg-teal-900/30 border-teal-500/50 text-teal-300' : userAnswers[q.id] === cIdx ? 'bg-red-900/30 border-red-500/50 text-red-300' : 'border-white/5 text-white/40 bg-black/20'}`}>
                        <span className="mr-3 text-xs opacity-50">{(cIdx + 1)}</span> {choice}
                        {q.correctAnswer === cIdx && <span className="ml-auto text-xs font-bold text-teal-400">정답</span>}
                        {userAnswers[q.id] === cIdx && !isCorrect && <span className="ml-auto text-xs font-bold text-red-400">내 선택</span>}
                      </div>
                    ))}
                  </div>

                  <div className="bg-black/60 border border-amber-900/30 p-4 relative">
                    <span className="absolute -top-3 left-4 bg-[#121214] px-2 text-xs font-bold text-amber-500 uppercase tracking-widest">AI 해설</span>
                    <p className="text-white/70 text-sm leading-relaxed mt-2 whitespace-pre-wrap">
                      {q.explanation}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-white/10 mt-4 text-center">
            <button onClick={resetExamTab} className="px-8 py-3 bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white transition-colors">
              처음으로 돌아가기
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
