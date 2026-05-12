import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';

// 💡 [중요 수정] App.tsx에서 넘어오는 지갑 주소 변수명이 다를 경우를 대비한 다중 매핑
export const ExamTab = ({ walletAddress, address }: any) => {
  const userAddress = walletAddress || address; // 무엇으로 넘어오든 완벽히 잡습니다.
  
  // 상태: list(대기열+완료목록), coop(합동검수), cbt(시험응시), result(시험결과)
  const [mode, setMode] = useState<'list' | 'coop' | 'cbt' | 'result'>('list');
  
  // 데이터 상태
  const [examFile, setExamFile] = useState<File | null>(null);
  const [pendingExams, setPendingExams] = useState<Array<{id: number, filename: string, chunks: string[]}>>([]);
  const [goldenExams, setGoldenExams] = useState<any[]>([]); // 검수 완료된 무결점 문제들
  const [expandedExamId, setExpandedExamId] = useState<number | null>(null);

  // 합동 검수용 내부 상태
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentExamId, setCurrentExamId] = useState<number | null>(null);
  const [chunks, setChunks] = useState<string[]>([]);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [filename, setFilename] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [parsedResult, setParsedResult] = useState<any>(null);

  // CBT 응시용 내부 상태
  const [cbtQuestions, setCbtQuestions] = useState<any[]>([]);
  const [cbtCurrentIndex, setCbtCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [wrongNotes, setWrongNotes] = useState<any[]>([]);

  // 1. 초기 데이터 로딩
  const fetchData = async () => {
    if (!userAddress) return;
    try {
      const [pending, golden] = await Promise.all([
        api.getPendingExams(userAddress),
        api.getGoldenExams(userAddress)
      ]);
      setPendingExams(pending);
      setGoldenExams(golden.exams || []);
    } catch (err) {
      console.error("데이터 로딩 실패", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [userAddress]);

  // ==========================================
  // [기능 1] 파일 업로드 및 대기열 추가
  // ==========================================
  const handleUploadForReview = async () => {
    if (!examFile) {
      fileInputRef.current?.click();
      return;
    }
    if (!userAddress) {
      return alert("지갑 주소가 없습니다. 앱 상단에서 로그인을 확인해주세요.");
    }
    
    try {
      await api.uploadExamCoop(examFile, userAddress);
      setExamFile(null); 
      alert("파일이 DB에 안전하게 저장되었습니다! 이제 검수 대기소에서 확인 가능합니다.");
      fetchData(); 
    } catch (err) {
      alert("파일 업로드에 실패했습니다.");
    }
  };

  // ==========================================
  // [기능 2] 합동 검수소(Co-op) 실행
  // ==========================================
  const startCoopReview = (exam: {id: number, filename: string, chunks: string[]}) => {
    setCurrentExamId(exam.id);
    setChunks(exam.chunks);
    setFilename(exam.filename);
    setChunkIndex(0);
    setMode('coop');
    setParsedResult(null);
  };

  const analyzeCurrentChunk = async () => {
    setIsAnalyzing(true);
    try {
      const res = await api.analyzeChunk(chunks[chunkIndex]);
      setParsedResult(res.result);
    } catch (err) {
      alert("AI 분석에 실패했습니다.");
    }
    setIsAnalyzing(false);
  };

  const handleEdit = (field: string, value: any) => {
    setParsedResult({ ...parsedResult, [field]: value });
  };
  const handleOptionEdit = (idx: number, value: string) => {
    const newOptions = [...(parsedResult.options || [])];
    newOptions[idx] = value;
    setParsedResult({ ...parsedResult, options: newOptions });
  };

  const approveAndNext = async () => {
    if (!parsedResult?.question || !parsedResult?.answer) return alert("데이터가 불완전합니다.");
    
    await api.saveGoldenExam({
      wallet_address: userAddress,
      title: filename,
      question: parsedResult.question,
      options: parsedResult.options,
      answer: parsedResult.answer,
      explanation: parsedResult.explanation
    });

    if (chunkIndex + 1 < chunks.length) {
      setChunkIndex(chunkIndex + 1);
      setParsedResult(null);
    } else {
      if (currentExamId && userAddress) {
        await api.deletePendingExam(userAddress, currentExamId);
      }
      alert("🎉 해당 모의고사의 모든 검수가 완료되었습니다! 골든 DB에 완벽히 저장되었습니다.");
      fetchData(); 
      setMode('list');
    }
  };

  // ==========================================
  // [기능 3] 실전 CBT 모의고사 응시 (대표님이 만드신 기능 복구!)
  // ==========================================
  const startCBT = async () => {
    if (!userAddress) return alert("로그인이 필요합니다.");
    try {
      const data = await api.getCbtSession(userAddress);
      setCbtQuestions(data);
      setCbtCurrentIndex(0);
      setUserAnswers({});
      setMode('cbt');
    } catch (e: any) {
      alert(e.message); // 골든 DB가 비어있을 때 에러 알림
    }
  };

  const handleMark = (ans: string) => {
    setUserAnswers({ ...userAnswers, [cbtCurrentIndex]: ans });
  };

  const submitExam = () => {
    const wrongs = cbtQuestions.filter((q, idx) => String(q.answer) !== userAnswers[idx]);
    setWrongNotes(wrongs);
    setMode('result');
  };

  // ----------------------------------------------------------------------
  // 화면 렌더링 영역
  // ----------------------------------------------------------------------

  // 1. 합동 검수 화면
  if (mode === 'coop') {
    return (
      <div className="flex flex-col h-[80vh] space-y-4 animate-in fade-in pb-10">
        <div className="flex justify-between items-center pb-4 border-b border-white/10">
          <h2 className="text-xl text-teal-400 font-serif">🤝 AI-대표님 합동 검수소 [{filename}]</h2>
          <div className="flex gap-4 items-center">
            <span className="text-white/40 text-sm font-bold bg-teal-950/50 px-3 py-1 rounded-sm border border-teal-900/50">
              진행도: {chunkIndex + 1} / {chunks.length}
            </span>
            <button onClick={() => setMode('list')} className="text-xs text-white/40 hover:text-white border border-white/10 px-3 py-1 rounded-sm hover:bg-white/5 transition-all">
              목록으로 나가기
            </button>
          </div>
        </div>

        <div className="flex flex-1 gap-6 overflow-hidden">
          {/* 원본 텍스트 창 */}
          <div className="flex-1 flex flex-col border border-white/10 rounded-sm bg-black/20 p-4">
            <div className="text-white/40 text-xs mb-4">📄 PDF 원본 문단 (직접 수정 가능)</div>
            <textarea 
              value={chunks[chunkIndex] || ""} 
              onChange={(e) => {
                const newChunks = [...chunks];
                newChunks[chunkIndex] = e.target.value;
                setChunks(newChunks);
              }}
              className="flex-1 w-full bg-transparent text-white/80 text-sm leading-relaxed outline-none resize-none"
            />
            <button 
              onClick={analyzeCurrentChunk} 
              disabled={isAnalyzing}
              className="mt-4 py-3 bg-teal-900/50 text-teal-400 border border-teal-500/30 hover:bg-teal-800/50 transition-all shadow-md"
            >
              {isAnalyzing ? "🧠 AI가 띄어쓰기 교정 및 분석 중..." : "🚀 이 문단 AI에게 풀기 지시"}
            </button>
          </div>

          {/* AI 분석 및 교정 창 */}
          <div className="flex-1 flex flex-col border border-teal-900/40 rounded-sm bg-teal-950/10 p-4 overflow-y-auto custom-scrollbar">
            <div className="text-teal-400/60 text-xs mb-4">✨ AI 추출 결과 (수정 가능)</div>
            {!parsedResult ? (
              <div className="flex-1 flex items-center justify-center text-white/20 text-sm">
                좌측에서 'AI에게 풀기 지시' 버튼을 눌러주세요.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-teal-500 block mb-1">문제</label>
                  <textarea value={parsedResult.question || ''} onChange={e => handleEdit('question', e.target.value)} className="w-full bg-black/30 border border-white/10 text-white p-3 text-sm rounded-sm" rows={3}/>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-teal-500 block">보기 (4지 선다)</label>
                  {(parsedResult.options || ['', '', '', '']).map((opt: string, i: number) => (
                    <input key={i} value={opt} onChange={e => handleOptionEdit(i, e.target.value)} className="w-full bg-black/30 border border-white/10 text-white p-2 text-sm rounded-sm" />
                  ))}
                </div>
                <div className="flex gap-4">
                  <div className="w-1/4">
                    <label className="text-xs text-teal-500 block mb-1">정답 번호</label>
                    <input value={parsedResult.answer || ''} onChange={e => handleEdit('answer', e.target.value)} className="w-full bg-black/30 border border-white/10 text-teal-400 font-bold p-2 text-center rounded-sm" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-teal-500 block mb-1">해설</label>
                    <textarea value={parsedResult.explanation || ''} onChange={e => handleEdit('explanation', e.target.value)} className="w-full bg-black/30 border border-white/10 text-white/80 p-2 text-sm rounded-sm" rows={2}/>
                  </div>
                </div>
                <button onClick={approveAndNext} className="w-full mt-6 py-4 bg-teal-500 text-teal-950 font-bold rounded-sm hover:scale-[1.02] transition-all shadow-lg shadow-teal-500/20">
                  ✅ 완벽함! 승인 및 다음 문제로 이동
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 2. CBT 응시 화면 (대표님 원본 복구)
  if (mode === 'cbt') {
    const q = cbtQuestions[cbtCurrentIndex];
    if (!q) return null;
    return (
      <div className="flex flex-col h-[70vh] bg-teal-950/10 border border-teal-900/40 p-8 rounded-sm relative">
        <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
          <div className="text-teal-400 font-serif text-xl">Q. {cbtCurrentIndex + 1} / {cbtQuestions.length}</div>
        </div>
        
        <div className="flex-1 overflow-y-auto mb-6 pr-4">
          <div className="text-white/90 text-lg leading-relaxed whitespace-pre-wrap">{q.question}</div>
          <div className="mt-8 space-y-3">
            {q.options && q.options.map((opt: string, idx: number) => {
              const numStr = String(idx + 1);
              const isSelected = userAnswers[cbtCurrentIndex] === numStr;
              return (
                <button 
                  key={idx} 
                  onClick={() => handleMark(numStr)}
                  className={`w-full text-left p-4 rounded-sm border transition-all ${isSelected ? 'border-teal-400 bg-teal-900/40 text-teal-100' : 'border-white/10 text-white/60 hover:bg-white/5'}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-between mt-auto">
          <button onClick={() => setCbtCurrentIndex(Math.max(0, cbtCurrentIndex - 1))} disabled={cbtCurrentIndex === 0} className="px-6 py-3 border border-white/20 text-white/60 disabled:opacity-30">이전</button>
          {cbtCurrentIndex === cbtQuestions.length - 1 ? (
            <button onClick={submitExam} className="px-8 py-3 bg-teal-500 text-teal-950 font-bold rounded-sm">답안 제출 및 채점</button>
          ) : (
            <button onClick={() => setCbtCurrentIndex(cbtCurrentIndex + 1)} className="px-6 py-3 border border-teal-500/50 text-teal-400">다음 문제</button>
          )}
        </div>
      </div>
    );
  }

  // 3. CBT 오답노트 결과 화면 (대표님 원본 복구)
  if (mode === 'result') {
    return (
      <div className="space-y-8 animate-in fade-in pb-20">
        <div className="text-center space-y-2 mb-12">
          <h2 className="text-4xl font-serif text-teal-400">{cbtQuestions.length - wrongNotes.length}점 / {cbtQuestions.length}점</h2>
          <p className="text-white/50 text-sm">오답노트를 복습하여 다음 시험을 대비하세요.</p>
        </div>
        
        <div className="text-white/60 text-xs border-b border-white/10 pb-2">오답 취약점 분석</div>
        {wrongNotes.map((q, i) => (
          <div key={i} className="p-6 border border-red-900/30 bg-red-950/5 rounded-sm space-y-4">
            <div className="text-white/80 whitespace-pre-wrap">{q.question}</div>
            <div className="text-teal-400 text-sm bg-teal-950/30 p-4 border-l-2 border-teal-500">
              <p className="font-bold mb-2">💡 정답: {q.answer}번</p>
              <p>{q.explanation}</p>
            </div>
          </div>
        ))}
        <button onClick={() => setMode('list')} className="w-full py-4 border border-white/10 text-white/40 hover:bg-white/5 transition-colors text-sm">열람실로 돌아가기</button>
      </div>
    );
  }

  // 4. 기본 리스트 뷰 (대기열 + 완료된 골든 DB + 응시하기 버튼)
  return (
    <div className="space-y-8 animate-in fade-in pb-20">
      
      {/* 💡 업로드 및 CBT 시작 버튼 라인 */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <label className="flex-1 border border-teal-900/40 p-4 text-center text-sm hover:bg-teal-900/20 cursor-pointer text-teal-400 flex items-center justify-center transition-colors">
          <input ref={fileInputRef} type="file" accept=".pdf,.txt" onChange={e => setExamFile(e.target.files?.[0] || null)} className="hidden"/> 
          {examFile ? `✅ ${examFile.name} (선택됨)` : '📁 PDF 모의고사 첨부하기'}
        </label>
        
        <button onClick={handleUploadForReview} className="px-8 bg-teal-500 text-teal-950 font-bold text-sm hover:bg-teal-400 transition-colors shadow-lg">
          {examFile ? '이 모의고사 업로드 🚀' : '새 모의고사 업로드 🚀'}
        </button>

        {/* 🌟 복구된 진짜 기능: 모의고사 응시하기 */}
        <button onClick={startCBT} className="px-8 border border-teal-400 text-teal-400 font-bold text-sm hover:bg-teal-900/30 transition-colors">
          📝 100문제 실전 응시하기
        </button>
      </div>

      {/* 대기열 렌더링 */}
      {pendingExams.length > 0 && (
        <div className="mb-12 p-6 border border-teal-500/50 bg-teal-950/30 rounded-sm shadow-[0_0_15px_rgba(45,212,191,0.1)]">
          <h3 className="text-teal-400 font-bold mb-2 text-lg">⏳ 합동 검수 대기소</h3>
          <p className="text-white/50 text-xs mb-6">스마트폰에서 올린 파일을 PC에서 편안하게 검수하세요.</p>
          <div className="space-y-3">
            {pendingExams.map((exam) => (
              <div key={exam.id} className="flex justify-between items-center p-4 bg-black/40 border border-teal-500/20 rounded-sm hover:border-teal-400 transition-colors group">
                <div className="flex flex-col">
                  <span className="text-teal-100 font-bold text-sm">{exam.filename}</span>
                  <span className="text-white/40 text-xs mt-1">총 {exam.chunks.length} 문단 대기 중</span>
                </div>
                <button onClick={() => startCoopReview(exam)} className="px-6 py-2 bg-teal-500 text-teal-950 font-bold text-sm rounded-sm shadow-lg hover:scale-105 transition-all opacity-90 group-hover:opacity-100">
                  검수 시작 🎯
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 완료된 골든 DB 리스트 */}
      <div className="text-white/60 text-xs border-b border-white/10 pb-2">✅ 검수 완료된 무결점 문제 (골든 DB)</div>
      {goldenExams.length === 0 ? (
        <div className="py-20 text-center text-white/20 text-xs tracking-widest">저장된 문제가 없습니다. 검수를 완료해 주세요.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {goldenExams.map((exam: any) => {
            const isExpanded = expandedExamId === exam.id;
            return (
              <div key={exam.id} className="border border-teal-900/40 bg-teal-950/10 p-6 rounded-sm cursor-pointer hover:bg-teal-900/20 transition-all" onClick={() => setExpandedExamId(isExpanded ? null : exam.id)}>
                <div className="text-[13px] text-teal-100 font-serif leading-loose whitespace-pre-wrap">{exam.question}</div>
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-teal-900/50 animate-in fade-in slide-in-from-top-2">
                    <div className="text-teal-400 font-bold text-sm mb-2">정답: {exam.answer}</div>
                    <div className="text-white/70 text-xs leading-relaxed">{exam.explanation}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
