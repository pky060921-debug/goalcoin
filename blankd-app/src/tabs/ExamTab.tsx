import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

export const ExamTab = ({ walletAddress }: any) => {
  const [mode, setMode] = useState<'list' | 'cbt' | 'result'>('list');
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [timeLeft, setTimeLeft] = useState(6000); // 100분
  const [wrongNotes, setWrongNotes] = useState<any[]>([]);

  // CBT 시작: 백엔드에서 100문제 가져오기
  const startCBT = async () => {
    const data = await api.getCbtSession(walletAddress);
    setQuestions(data);
    setMode('cbt');
    setTimeLeft(6000);
  };

  // 답안 마킹
  const handleMark = (ans: string) => {
    setUserAnswers({ ...userAnswers, [currentIndex]: ans });
  };

  // 제출 및 채점
  const submitExam = () => {
    const wrongs = questions.filter((q, idx) => String(q.answer) !== userAnswers[idx]);
    setWrongNotes(wrongs);
    setMode('result');
  };

  if (mode === 'cbt') {
    const q = questions[currentIndex];
    return (
      <div className="flex flex-col h-[70vh] bg-teal-950/10 border border-teal-900/40 p-8 rounded-sm">
        <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
          <span className="text-teal-400 font-mono">Q. {currentIndex + 1} / 100</span>
          <span className="text-red-400 font-bold font-mono">⏱ {Math.floor(timeLeft / 60)}:{timeLeft % 60}</span>
        </div>
        
        <div className="flex-1 overflow-y-auto mb-8">
          <h2 className="text-lg text-white mb-8 leading-relaxed">{q.question}</h2>
          <div className="space-y-4">
            {JSON.parse(q.options).map((opt: string, i: number) => (
              <button 
                key={i} 
                onClick={() => handleMark(String(i + 1))}
                className={`w-full text-left p-4 border transition-all ${userAnswers[currentIndex] === String(i+1) ? 'bg-teal-500/20 border-teal-400 text-teal-100' : 'border-white/5 text-white/60 hover:bg-white/5'}`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-between gap-4">
          <button onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))} className="px-6 py-3 border border-white/10 text-white/40">이전</button>
          {currentIndex === 99 ? 
            <button onClick={submitExam} className="px-6 py-3 bg-teal-500 text-teal-950 font-bold rounded-sm">최종 제출</button> :
            <button onClick={() => setCurrentIndex(prev => Math.min(99, prev + 1))} className="px-6 py-3 border border-teal-400 text-teal-400">다음 문제</button>
          }
        </div>
      </div>
    );
  }

  if (mode === 'result') {
    return (
      <div className="space-y-8 animate-in fade-in">
        <div className="text-center p-12 border border-teal-900/40 bg-teal-500/5">
          <h1 className="text-4xl font-serif text-teal-400 mb-2">{100 - wrongNotes.length} / 100</h1>
          <p className="text-white/40 text-xs">CBT 모의고사 채점 결과</p>
        </div>
        
        <div className="text-white/60 text-xs border-b border-white/10 pb-2">취약점 분석 및 오답노트</div>
        {wrongNotes.map((q, i) => (
          <div key={i} className="p-6 border border-red-900/30 bg-red-950/5 rounded-sm space-y-4">
            <div className="text-white/80">{q.question}</div>
            <div className="text-teal-400 text-sm bg-teal-950/30 p-4 border-l-2 border-teal-500">
              <p className="font-bold mb-2">💡 AI 해설:</p>
              {q.explanation}
            </div>
            {/* 🌟 핵심: 오답노트에서 바로 빈칸 학습 추천 */}
            <button 
              onClick={() => {/* AI에게 이 지문으로 빈칸 카드 생성을 요청하는 로직 */}}
              className="text-[11px] text-red-400 underline decoration-red-900/50"
            >
              이 규정 기반으로 빈칸 카드 생성 추천받기 →
            </button>
          </div>
        ))}
        <button onClick={() => setMode('list')} className="w-full py-4 border border-white/10 text-white/40 text-xs">목록으로 돌아가기</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-32 space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-serif text-teal-100">AI 실전 CBT 모의고사</h2>
        <p className="text-white/40 text-xs">법령, 인사, 실무 규정을 반영한 지능형 100문항</p>
      </div>
      <button onClick={startCBT} className="px-12 py-4 bg-teal-500 text-teal-950 font-bold rounded-sm shadow-lg shadow-teal-500/20 hover:scale-105 transition-all">
        시험 시작 (100분)
      </button>
    </div>
  );
};
