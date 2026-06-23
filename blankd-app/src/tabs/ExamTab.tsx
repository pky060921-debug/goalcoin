import React, { useState, useEffect, useRef } from 'react';

const BASE_URL = "https://api.blankd.top/api";

type Mode = 'list' | 'cbt' | 'result';

interface ExamBank {
  id: number;
  filename: string;
  total_questions: number;
  processed_count: number;
  status: 'processing' | 'completed' | 'failed';
  error_message: string;
}

interface BankQuestion {
  id: number;
  question_no: number;
  question_text: string;
  correct_answer: string;
}

interface QuestionResult {
  question: string;
  correctAnswer: string;
  userAnswer: string;
  explanation: string;
  loadingExplanation: boolean;
}

export const ExamTab = ({ walletAddress, address }: any) => {
  const userAddress = walletAddress || address;
  const [mode, setMode] = useState<Mode>('list');
  const [banks, setBanks] = useState<ExamBank[]>([]);
  const [examFile, setExamFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // CBT 상태
  const [currentBank, setCurrentBank] = useState<ExamBank | null>(null);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [timeElapsed, setTimeElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 결과 상태
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const fetchBanks = async () => {
    if (!userAddress) return;
    try {
      const res = await fetch(`${BASE_URL}/get-exam-banks?wallet_address=${userAddress}`);
      const data = await res.json();
      setBanks(Array.isArray(data) ? data : []);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchBanks(); }, [userAddress]);

  // 처리 중인 모의고사가 있으면 자동 폴링
  useEffect(() => {
    const hasProcessing = banks.some(b => b.status === 'processing');
    if (hasProcessing) {
      pollRef.current = setInterval(fetchBanks, 2500);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [banks]);

  // CBT 타이머
  useEffect(() => {
    if (mode === 'cbt') {
      timerRef.current = setInterval(() => setTimeElapsed(t => t + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [mode]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleUpload = async () => {
    if (!examFile || !userAddress) return alert('문제지 파일을 첨부해주세요.');
    setIsUploading(true);
    const fd = new FormData();
    fd.append('exam_file', examFile);
    if (answerFile) fd.append('answer_file', answerFile);
    fd.append('wallet_address', userAddress);
    try {
      const res = await fetch(`${BASE_URL}/upload-exam-ai`, { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        alert(`AI 분석을 시작했습니다!\n총 ${data.question_count}문항을 정제하고 있습니다.\n목록에서 진행 상황을 확인하세요.`);
        setExamFile(null); setAnswerFile(null);
        fetchBanks();
      } else {
        alert(`업로드 실패: ${data.error}`);
      }
    } catch (err: any) { alert(`업로드 실패: ${err.message}`); }
    setIsUploading(false);
  };

  const startCBT = async (bank: ExamBank) => {
    try {
      const res = await fetch(`${BASE_URL}/get-exam-bank-questions?bank_id=${bank.id}&wallet_address=${userAddress}`);
      const data: BankQuestion[] = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        return alert('문제를 불러오지 못했습니다.');
      }
      setCurrentBank(bank);
      setQuestions(data);
      setCurrentIdx(0);
      setUserAnswers(new Array(data.length).fill(''));
      setSelectedAnswer('');
      setTimeElapsed(0);
      setMode('cbt');
    } catch (err) {
      alert('문제 로드 중 오류가 발생했습니다.');
    }
  };

  const submitAnswer = () => {
    if (!selectedAnswer) return alert('답을 선택해주세요.');
    const updated = [...userAnswers];
    updated[currentIdx] = selectedAnswer;
    setUserAnswers(updated);

    if (currentIdx + 1 < questions.length) {
      setCurrentIdx(currentIdx + 1);
      setSelectedAnswer(updated[currentIdx + 1] || '');
    } else {
      finishExam(updated);
    }
  };

  const goToPrev = () => {
    if (currentIdx === 0) return;
    const updated = [...userAnswers];
    updated[currentIdx] = selectedAnswer;
    setUserAnswers(updated);
    setCurrentIdx(currentIdx - 1);
    setSelectedAnswer(updated[currentIdx - 1] || '');
  };

  const finishExam = (finalAnswers: string[]) => {
    const r: QuestionResult[] = questions.map((q, i) => ({
      question: q.question_text,
      correctAnswer: q.correct_answer || '?',
      userAnswer: finalAnswers[i] || '미응답',
      explanation: '',
      loadingExplanation: false,
    }));
    setResults(r);
    setMode('result');
  };

  const loadExplanation = async (idx: number) => {
    const r = results[idx];
    if (r.explanation || r.loadingExplanation) return;
    setResults(prev => prev.map((item, i) => i === idx ? { ...item, loadingExplanation: true } : item));
    try {
      const res = await fetch(`${BASE_URL}/cbt-explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: r.question,
          correct_answer: r.correctAnswer,
          user_answer: r.userAnswer,
          wallet_address: userAddress,
        }),
      });
      const data = await res.json();
      setResults(prev => prev.map((item, i) =>
        i === idx ? { ...item, explanation: data.explanation || '해설 없음', loadingExplanation: false } : item
      ));
    } catch {
      setResults(prev => prev.map((item, i) =>
        i === idx ? { ...item, explanation: 'AI 통신 오류', loadingExplanation: false } : item
      ));
    }
  };

  const handleExpandResult = (idx: number) => {
    if (expandedIdx === idx) {
      setExpandedIdx(null);
    } else {
      setExpandedIdx(idx);
      loadExplanation(idx);
    }
  };

  const deleteBank = async (bankId: number, filename: string) => {
    if (!window.confirm(`"${filename}" 을 삭제할까요?`)) return;
    await fetch(`${BASE_URL}/delete-exam-bank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bank_id: bankId, wallet_address: userAddress }),
    });
    fetchBanks();
  };

  // ── 결과 화면 ─────────────────────────────────────────────────
  if (mode === 'result' && currentBank) {
    const known = results.filter(r => r.correctAnswer !== '?');
    const score = results.filter(r => r.userAnswer === r.correctAnswer && r.correctAnswer !== '?').length;
    const total = results.length;
    const pct = known.length > 0 ? Math.round((score / known.length) * 100) : 0;

    return (
      <div className="space-y-6 animate-in fade-in pb-20">
        <div className="p-6 border border-teal-500/50 bg-teal-950/20 rounded-sm text-center">
          <div className="text-white/50 text-sm mb-1">{currentBank.filename}</div>
          <div className={`text-6xl font-bold mb-2 ${pct >= 60 ? 'text-teal-400' : 'text-red-400'}`}>{pct}점</div>
          <div className="text-white/60 text-lg">
            {total}문제 중 {score}개 정답 · 소요시간 {formatTime(timeElapsed)}
            {known.length < total && <span className="block text-white/30 text-xs mt-1">(정답 미확인 {total - known.length}문항 제외)</span>}
          </div>
          <div className="flex gap-3 justify-center mt-4">
            <button onClick={() => { setMode('list'); fetchBanks(); }} className="px-6 py-2 border border-white/20 text-white/60 text-sm rounded-sm hover:bg-white/5">
              목록으로
            </button>
            <button onClick={() => startCBT(currentBank)} className="px-6 py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold rounded-sm">
              다시 풀기
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {results.map((r, idx) => {
            const unknown = r.correctAnswer === '?';
            const isCorrect = !unknown && r.userAnswer === r.correctAnswer;
            const isExpanded = expandedIdx === idx;
            return (
              <div key={idx} className={`border rounded-sm overflow-hidden transition-all ${unknown ? 'border-white/10' : isCorrect ? 'border-teal-500/30' : 'border-red-500/40'}`}>
                <button
                  onClick={() => handleExpandResult(idx)}
                  className={`w-full flex items-center justify-between p-4 text-left ${unknown ? 'bg-white/5 hover:bg-white/10' : isCorrect ? 'bg-teal-950/20 hover:bg-teal-950/30' : 'bg-red-950/20 hover:bg-red-950/30'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-bold ${unknown ? 'text-white/30' : isCorrect ? 'text-teal-400' : 'text-red-400'}`}>
                      {unknown ? '？' : isCorrect ? '✓' : '✗'}
                    </span>
                    <span className="text-white/80 text-sm font-bold">{idx + 1}번</span>
                    <span className="text-white/50 text-xs">
                      내 답: <span className={isCorrect ? 'text-teal-300' : 'text-red-300'}>{r.userAnswer}번</span>
                      {!unknown && !isCorrect && <span className="ml-2 text-teal-300">정답: {r.correctAnswer}번</span>}
                      {unknown && <span className="ml-2 text-white/30">정답 미확인</span>}
                    </span>
                  </div>
                  <span className="text-white/30 text-xs">{isExpanded ? '▲ 닫기' : '▼ 해설 보기'}</span>
                </button>

                {isExpanded && (
                  <div className="border-t border-white/10 bg-black/30 p-5 space-y-4">
                    <div className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap bg-white/5 p-4 rounded-sm">
                      {r.question}
                    </div>
                    <div className="border-t border-emerald-900/40 pt-4">
                      <div className="text-emerald-400 text-xs font-bold mb-2">💡 AI 해설 (gemma4:26b)</div>
                      {r.loadingExplanation ? (
                        <div className="flex items-center gap-2 text-white/40 text-sm">
                          <span className="animate-spin">⟳</span> AI가 해설을 생성 중입니다...
                        </div>
                      ) : r.explanation ? (
                        <div className="text-emerald-100/80 text-sm leading-relaxed whitespace-pre-wrap">{r.explanation}</div>
                      ) : (
                        <button onClick={() => loadExplanation(idx)} className="text-xs text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-sm hover:bg-emerald-900/20">
                          AI 해설 불러오기
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── CBT 풀기 화면 ──────────────────────────────────────────────
  if (mode === 'cbt' && currentBank && questions.length > 0) {
    const q = questions[currentIdx];
    const total = questions.length;
    const answered = userAnswers.filter(a => a !== '').length;

    return (
      <div className="flex flex-col h-[85vh] animate-in fade-in">
        <div className="flex justify-between items-center pb-3 border-b border-white/10 mb-4">
          <div className="flex items-center gap-3">
            <span className="text-teal-400 font-bold">{currentIdx + 1} / {total}</span>
            <span className="text-white/30 text-xs">응답 {answered}/{total}</span>
            <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-teal-500 transition-all" style={{ width: `${(currentIdx / total) * 100}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-white/40 font-mono text-sm">⏱ {formatTime(timeElapsed)}</span>
            <button
              onClick={() => {
                if (window.confirm('시험을 종료하고 결과를 확인할까요?')) {
                  const updated = [...userAnswers];
                  updated[currentIdx] = selectedAnswer;
                  finishExam(updated);
                }
              }}
              className="text-xs text-white/40 border border-white/10 px-3 py-1 rounded-sm hover:bg-white/5"
            >
              제출 종료
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="bg-black/20 border border-white/10 rounded-sm p-5 mb-4">
            <div className="text-white/80 text-sm leading-loose whitespace-pre-wrap">{q.question_text}</div>
          </div>

          <div className="grid grid-cols-5 gap-2 mb-4">
            {['1', '2', '3', '4', '5'].map(n => (
              <button
                key={n}
                onClick={() => setSelectedAnswer(n)}
                className={`py-4 rounded-sm text-xl font-bold transition-all border ${
                  selectedAnswer === n
                    ? 'bg-teal-500 border-teal-400 text-white shadow-lg shadow-teal-500/30'
                    : 'bg-black/30 border-white/10 text-white/50 hover:border-teal-500/50 hover:text-white/80'
                }`}
              >
                {['①', '②', '③', '④', '⑤'][parseInt(n) - 1]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 p-3 bg-black/20 border border-white/5 rounded-sm mb-4">
            {questions.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  const updated = [...userAnswers];
                  updated[currentIdx] = selectedAnswer;
                  setUserAnswers(updated);
                  setCurrentIdx(i);
                  setSelectedAnswer(updated[i] || '');
                }}
                className={`w-8 h-8 text-xs font-bold rounded-sm border transition-all ${
                  i === currentIdx
                    ? 'bg-teal-500 border-teal-400 text-white'
                    : userAnswers[i]
                    ? 'bg-teal-900/50 border-teal-500/30 text-teal-300'
                    : 'bg-black/30 border-white/10 text-white/30'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-3 border-t border-white/10">
          <button onClick={goToPrev} disabled={currentIdx === 0} className="px-6 py-3 border border-white/10 text-white/50 rounded-sm disabled:opacity-30 hover:bg-white/5 transition-all">
            ← 이전
          </button>
          <button onClick={submitAnswer} disabled={!selectedAnswer} className="flex-1 py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white font-bold rounded-sm transition-all">
            {currentIdx + 1 === total ? '🏁 최종 제출' : '다음 →'}
          </button>
        </div>
      </div>
    );
  }

  // ── 목록 & 업로드 ─────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in pb-20">
      <div className="p-5 border border-teal-500/50 bg-teal-950/20 rounded-sm space-y-3">
        <h3 className="text-teal-400 font-bold text-sm">📤 모의고사 업로드 (AI 분석)</h3>
        <div className="flex flex-col md:flex-row gap-3">
          <label className="flex-1 border border-teal-900/40 p-3 text-center text-sm cursor-pointer text-teal-400 hover:bg-teal-900/20 transition-colors rounded-sm">
            <input type="file" accept=".pdf,.txt" onChange={e => setExamFile(e.target.files?.[0] || null)} className="hidden" />
            {examFile ? `📂 ${examFile.name}` : '➕ 문제지 파일 (PDF/TXT)'}
          </label>
          <label className="flex-1 border border-emerald-900/40 p-3 text-center text-sm cursor-pointer text-emerald-400 hover:bg-emerald-900/20 transition-colors rounded-sm">
            <input type="file" accept=".pdf,.txt" onChange={e => setAnswerFile(e.target.files?.[0] || null)} className="hidden" />
            {answerFile ? `📂 ${answerFile.name}` : '➕ 정답지 파일 (선택)'}
          </label>
          <button onClick={handleUpload} disabled={isUploading || !examFile} className="px-6 py-3 bg-teal-500 hover:bg-teal-400 disabled:opacity-40 text-teal-950 font-bold text-sm rounded-sm transition-all">
            {isUploading ? '업로드 중...' : '업로드'}
          </button>
        </div>
        <p className="text-white/30 text-xs">
          AI(gemma4:26b)가 형식에 관계없이 문제를 읽고 문제은행으로 정리합니다. 정답지가 없어도 빨간색 표시나 법령 지식으로 정답을 추론합니다.
        </p>
      </div>

      <div className="p-5 border border-white/10 rounded-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white/70 font-bold text-sm">📋 문제은행 목록</h3>
          <button onClick={fetchBanks} className="text-xs text-white/30 border border-white/10 px-3 py-1 rounded-sm hover:bg-white/5">
            새로고침
          </button>
        </div>
        {banks.length === 0 ? (
          <div className="py-10 text-center text-white/20 text-sm">업로드된 모의고사가 없습니다.</div>
        ) : (
          <div className="space-y-2">
            {banks.map(bank => (
              <div key={bank.id} className="flex items-center justify-between p-4 bg-black/30 border border-white/10 rounded-sm hover:border-teal-500/40 transition-colors group">
                <div className="flex-1">
                  <div className="text-white/80 font-bold text-sm">{bank.filename}</div>
                  <div className="text-white/30 text-xs mt-0.5 flex items-center gap-2">
                    {bank.status === 'processing' && (
                      <>
                        <span className="text-amber-400 animate-pulse">🤖 AI 분석 중...</span>
                        <span>{bank.processed_count}/{bank.total_questions}</span>
                        <div className="w-24 h-1 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 transition-all" style={{ width: `${(bank.processed_count / Math.max(bank.total_questions, 1)) * 100}%` }} />
                        </div>
                      </>
                    )}
                    {bank.status === 'completed' && <span className="text-teal-400">✓ 완료 · 총 {bank.total_questions}문항</span>}
                    {bank.status === 'failed' && <span className="text-red-400">✗ 실패: {bank.error_message}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={() => deleteBank(bank.id, bank.filename)} className="px-3 py-2 bg-red-900/40 hover:bg-red-700 text-red-400 hover:text-white text-xs font-bold rounded-sm border border-red-500/30 transition-all">
                    🗑 삭제
                  </button>
                  {bank.status === 'completed' && (
                    <button onClick={() => startCBT(bank)} className="px-5 py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold rounded-sm transition-all">
                      CBT 시작 →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
