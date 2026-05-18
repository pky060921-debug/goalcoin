import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';

const BASE_URL = "https://api.blankd.top/api";

export const ExamTab = ({ walletAddress, address }: any) => {
  const userAddress = walletAddress || address;
  
  const [mode, setMode] = useState<'list' | 'coop' | 'cbt' | 'result'>('list');
  const [examFile, setExamFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  
  const [pendingExams, setPendingExams] = useState<Array<{id: number, filename: string, chunks: string[]}>>([]);
  const [goldenExams, setGoldenExams] = useState<any[]>([]); 
  const [uploadedLaws, setUploadedLaws] = useState<string[]>([]);
  const [rawLawsData, setRawLawsData] = useState<any[]>([]); 
  const [expandedExamId, setExpandedExamId] = useState<number | null>(null);
  
  const [viewingFile, setViewingFile] = useState<string | null>(null); 
  const [viewingArticle, setViewingArticle] = useState<{title: string, content: string, id: number} | null>(null); 

  const [selectedLaws, setSelectedLaws] = useState<string[]>([]);

  const examInputRef = useRef<HTMLInputElement>(null);
  const answerInputRef = useRef<HTMLInputElement>(null);
  
  const [currentExamId, setCurrentExamId] = useState<number | null>(null);
  const [chunks, setChunks] = useState<string[]>([]);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [filename, setFilename] = useState("");
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [parsedResult, setParsedResult] = useState<any>(null);

  const [chatMessages, setChatMessages] = useState<Array<{sender: 'ai' | 'user', text: string}>>([]);
  const [userFeedback, setUserFeedback] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [isExamUploading, setIsExamUploading] = useState(false);

  const [cbtQuestions, setCbtQuestions] = useState<any[]>([]);
  const [cbtCurrentIndex, setCbtCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [wrongNotes, setWrongNotes] = useState<any[]>([]);

  const fetchData = async () => {
    if (!userAddress) return;
    try {
      const [pending, goldenRes, catsRes] = await Promise.all([
        api.getPendingExams(userAddress),
        fetch(`${BASE_URL}/get-golden-exams?wallet_address=${userAddress}`).then(r => r.json()),
        fetch(`${BASE_URL}/get-categories?wallet_address=${userAddress}`).then(r => r.json())
      ]);
      setPendingExams(Array.isArray(pending) ? pending : []);
      setGoldenExams(goldenRes.exams || []);
      
      if (catsRes.categories) {
        setRawLawsData(catsRes.categories);
        const uniqueLawNames = Array.from(new Set(catsRes.categories.map((c: any) => c.folder_name)));
        setUploadedLaws(uniqueLawNames as string[]);
        
        if (selectedLaws.length === 0) {
            setSelectedLaws(uniqueLawNames as string[]);
        }
      }
    } catch (err: any) {
      console.error("[데이터 로드 에러 진단]", err);
    }
  };

  useEffect(() => { fetchData(); }, [userAddress]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleDeleteLaw = async (e: React.MouseEvent, folderName: string) => {
    e.stopPropagation();
    if (!confirm(`[${folderName}] 파일을 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`${BASE_URL}/delete-law-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_name: folderName, wallet_address: userAddress })
      });
      if (res.ok) {
        alert("법령 파일이 삭제되었습니다.");
        fetchData();
        if (viewingFile === folderName) { setViewingFile(null); setViewingArticle(null); }
      } else {
        const data = await res.json();
        alert("삭제 실패: " + data.error);
      }
    } catch (err: any) { alert("삭제 중 통신 오류가 발생했습니다."); }
  };

  const handleUploadForReview = async () => {
    if (!examFile || !userAddress) return alert("문제지 파일을 반드시 첨부해주세요.");
    setIsExamUploading(true);
    const fd = new FormData();
    fd.append('exam_file', examFile);
    if (answerFile) fd.append('answer_file', answerFile);
    fd.append('wallet_address', userAddress);

    try {
      const res = await fetch(`${BASE_URL}/upload-exam-coop`, { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        setExamFile(null); setAnswerFile(null);
        alert("대기소에 저장되었습니다! (정답지 빨간색 텍스트 인식 완료)");
        fetchData();
      } else alert("업로드 실패: " + data.error);
    } catch (err: any) { alert(`업로드 실패: ${err.message}`); }
    setIsExamUploading(false);
  };

  const handleDeletePendingExam = async (id: number) => {
    if (!confirm("이 모의고사를 삭제하시겠습니까?")) return;
    try {
      await fetch(`${BASE_URL}/delete-pending-exam`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, wallet_address: userAddress })
      });
      fetchData();
    } catch (e: any) {}
  };

  const handleGenerateRAGFromPending = async (id: number) => {
    if (selectedLaws.length === 0) return alert("참고할 근거 자료를 체크해주세요!");
    if (!confirm(`해설을 자동 생성하시겠습니까?`)) return;
    
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${BASE_URL}/generate-rag-from-pending`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, wallet_address: userAddress, selected_laws: selectedLaws })
      });
      if (res.ok) {
         const data = await res.json();
         const taskId = data.task_id;
         const timer = setInterval(async () => {
           const sRes = await fetch(`${BASE_URL}/task-status?task_id=${taskId}`);
           const sData = await sRes.json();
           if (sData.status === 'completed') {
             clearInterval(timer); setIsAnalyzing(false); fetchData();
             alert("해설 자동 생성이 완료되었습니다!");
           } else if (sData.status === 'error') {
             clearInterval(timer); setIsAnalyzing(false); alert("분석 오류");
           }
         }, 2000);
      }
    } catch(e: any) { setIsAnalyzing(false); }
  };

  const handleDeleteExam = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("이 문제를 삭제하시겠습니까?")) return;
    try {
      await fetch(`${BASE_URL}/delete-exam`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, wallet_address: userAddress })
      });
      fetchData();
    } catch (err: any) {}
  };

  const startCoopReview = (exam: {id: number, filename: string, chunks: string[]}) => {
    if (selectedLaws.length === 0) return alert("상단에서 근거 자료를 먼저 체크해주세요!");
    setCurrentExamId(exam.id); setChunks(exam.chunks); setFilename(exam.filename); setChunkIndex(0); setMode('coop');
    
    setParsedResult({
        question: exam.chunks[0],
        options: ["① 1개", "② 2개", "③ 3개", "④ 4개", "⑤ 5개"],
        answer: "확인 필요",
        explanation: "",
    });
    
    setChatMessages([
        { sender: 'ai', text: "안녕하세요 대표님! 문제를 같이 풀어보겠습니다.\n먼저 어떤 조항을 검색해서 대조해 드릴까요?\n(예: 법 제1조 검색해줘)" }
    ]); 
    setUserFeedback("");

    try {
        const initLog = `> [SYSTEM] Initializing AI Copilot for [${exam.filename}]...`;
        console.log(initLog);
        window.dispatchEvent(new CustomEvent('global-terminal-log', { detail: initLog }));
    } catch(e) {}
  };

  const analyzeCurrentChunk = async (isFeedback = true) => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);

    const currentFeedback = userFeedback.trim();
    let updatedHistory = [...chatMessages];

    if (currentFeedback) {
        updatedHistory.push({ sender: 'user', text: currentFeedback });
        setChatMessages(updatedHistory);
        setUserFeedback("");

        try {
            const userLog = `> [USER] ${currentFeedback}`;
            console.log(userLog);
            window.dispatchEvent(new CustomEvent('global-terminal-log', { detail: userLog }));
        } catch(e) {}
    }

    try {
      const payload = {
        chunk_text: parsedResult ? parsedResult.question : chunks[chunkIndex],
        wallet_address: userAddress,
        user_feedback: currentFeedback,
        chat_history: updatedHistory, 
        selected_laws: selectedLaws,
        current_explanation: parsedResult?.explanation || ""
      };
      
      const res = await fetch(`${BASE_URL}/analyze-chunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (res.ok && data.result) {
        setParsedResult(data.result);
        
        const aiResponseText = data.result.chat_message || data.result.chatMessage || "알겠습니다. 다음 지시를 내려주세요!";
        setChatMessages(prev => [...prev, { sender: 'ai', text: aiResponseText }]);

        if (data.result.search_process) {
            try {
                const processLog = `\n[🧠 AI N-Gram SEARCH & REASONING LOG]\n${data.result.search_process}\n`;
                console.log(processLog);
                window.dispatchEvent(new CustomEvent('global-terminal-log', { detail: processLog }));
            } catch(e) {}
        }
      } else {
        alert("AI 분석 실패: " + data.error);
        try { window.dispatchEvent(new CustomEvent('global-terminal-log', { detail: `[ERROR] AI 분석 실패: ${data.error}` })); } catch(e){}
      }
    } catch (err: any) {
      alert("AI 통신 에러가 발생했습니다.");
      try { window.dispatchEvent(new CustomEvent('global-terminal-log', { detail: `[CRITICAL] AI 서버 타임아웃` })); } catch(e){}
    }
    setIsAnalyzing(false);
  };

  const handleEdit = (field: string, value: any) => { setParsedResult({ ...parsedResult, [field]: value }); };
  const handleOptionEdit = (idx: number, value: string) => {
    const newOptions = [...(parsedResult.options || [])];
    newOptions[idx] = value;
    setParsedResult({ ...parsedResult, options: newOptions });
  };

  const approveAndNext = async () => {
    if (!parsedResult?.question || !parsedResult?.answer) return alert("데이터가 불완전합니다.");
    try {
      await fetch(`${BASE_URL}/save-golden-exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: userAddress,
          title: filename,
          question: parsedResult.question,
          options: parsedResult.options,
          answer: parsedResult.answer,
          explanation: parsedResult.explanation,
          search_process: "Diagnostic Terminal Output Saved" 
        })
      });

      if (chunkIndex + 1 < chunks.length) {
        setChunkIndex(chunkIndex + 1);
        setParsedResult({
            question: chunks[chunkIndex + 1],
            options: ["① 1개", "② 2개", "③ 3개", "④ 4개", "⑤ 5개"],
            answer: "확인 필요",
            explanation: "",
        });
        setChatMessages([{ sender: 'ai', text: `[${chunkIndex + 2}번 문제]입니다! 어떤 조항을 찾아드릴까요?` }]); 
        setUserFeedback("");
        
        try { window.dispatchEvent(new CustomEvent('global-terminal-log', { detail: `> [SYSTEM] Saved to Golden DB. Loaded next chunk [${chunkIndex + 2}].` })); } catch(e){}
      } else {
        if (currentExamId && userAddress) {
          await fetch(`${BASE_URL}/delete-pending-exam`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: currentExamId, wallet_address: userAddress })
          });
        }
        alert("해당 모의고사의 모든 검수 및 AI 학습이 완료되었습니다!");
        fetchData(); setMode('list');
      }
    } catch(err: any) { console.error(`[승인 에러 진단]`, err); }
  };

  const startCBT = async () => {
    if (!userAddress) return alert("로그인이 필요합니다.");
    try {
      const data = await fetch(`${BASE_URL}/get-cbt-session?wallet_address=${userAddress}`).then(r => r.json());
      if (data.error) throw new Error(data.error);
      setCbtQuestions(data); setCbtCurrentIndex(0); setUserAnswers({}); setMode('cbt');
    } catch (e: any) { alert(e.message); }
  };
  const handleMark = (ans: string) => { setUserAnswers({ ...userAnswers, [cbtCurrentIndex]: ans }); };
  const submitExam = () => {
    const wrongs = cbtQuestions.filter((q, idx) => String(q.answer) !== userAnswers[idx]);
    setWrongNotes(wrongs); setMode('result');
  };

  if (mode === 'coop') {
    return (
      <div className="flex flex-col h-[85vh] space-y-4 animate-in fade-in pb-10">
        <div className="flex justify-between items-center pb-4 border-b border-white/10">
          <h2 className="text-xl text-teal-400 font-serif">🤝 대화형 AI 튜터 시스템 [{filename}]</h2>
          <div className="flex gap-4 items-center">
            <span className="text-white/40 text-sm font-bold bg-teal-950/50 px-3 py-1 rounded-sm border border-teal-900/50">진행도: {chunkIndex + 1} / {chunks.length}</span>
            <button onClick={() => setMode('list')} className="text-xs text-white/40 hover:text-white border border-white/10 px-3 py-1 rounded-sm hover:bg-white/5 transition-all">목록으로 나가기</button>
          </div>
        </div>

        <div className="flex flex-1 gap-6 overflow-hidden">
          
          <div className="w-[55%] flex flex-col gap-5 border border-white/10 rounded-sm bg-black/20 p-5 overflow-y-auto custom-scrollbar shadow-inner">
            <div className="flex flex-col gap-2">
              <label className="text-teal-300 font-bold text-sm">📝 1. 추출된 원문 (수정 가능)</label>
              <textarea 
                value={parsedResult ? parsedResult.question : chunks[chunkIndex]} 
                onChange={(e) => handleEdit('question', e.target.value)}
                className="w-full min-h-[220px] bg-black/40 border border-white/10 text-white/90 p-4 text-[15px] leading-loose outline-none resize-none rounded-sm focus:border-teal-500/50"
              />
            </div>

            {parsedResult && (
              <>
                <div className="space-y-3 pt-3 border-t border-white/10">
                  <label className="text-sm font-bold text-teal-400 block mb-1">📋 2. 보기 및 정답 체크</label>
                  <div className="text-[11px] text-white/40 mb-2">버튼을 눌러 최종 정답을 지정하세요. (정답지의 빨간색 텍스트가 자동 지정됩니다.)</div>
                  {(parsedResult.options || ['', '', '', '']).map((opt: string, i: number) => {
                    const isCorrect = String(i + 1) === String(parsedResult.answer);
                    return (
                      <div key={i} className={`flex gap-3 items-center p-2 rounded-sm border transition-all ${isCorrect ? 'bg-red-950/20 border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.2)]' : 'border-white/5 hover:bg-white/5'}`}>
                        <button 
                          onClick={() => handleEdit('answer', String(i + 1))}
                          className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isCorrect ? 'border-red-500 bg-red-500 text-white font-bold' : 'border-white/30 text-transparent'}`}>✓</button>
                        <input value={opt} onChange={e => handleOptionEdit(i, e.target.value)} className={`w-full bg-transparent outline-none text-sm transition-colors ${isCorrect ? 'text-red-400 font-bold' : 'text-white/80'}`} />
                      </div>
                    );
                  })}
                </div>
                
                <div className="flex flex-col gap-2 pt-3 border-t border-white/10">
                    <label className="text-[13px] font-bold text-emerald-400 block">💡 3. 최종 공식 상세 해설 (대화하며 자동 업데이트)</label>
                    <textarea 
                      value={parsedResult.explanation || ''} 
                      onChange={e => handleEdit('explanation', e.target.value)} 
                      className="w-full min-h-[140px] bg-emerald-950/20 border border-emerald-500/30 text-emerald-100/90 p-4 text-[14px] leading-loose rounded-sm resize-none outline-none focus:border-emerald-400" 
                    />
                </div>
              </>
            )}
          </div>

          <div className="w-[45%] flex flex-col border border-emerald-900/40 rounded-sm bg-[#0a192f] overflow-hidden relative shadow-lg">
            
            <div className="bg-emerald-950/60 p-4 border-b border-emerald-900/40 shrink-0 flex items-center justify-between">
                <span className="text-emerald-300 font-bold text-sm">💬 AI 튜터 채팅창</span>
                {isAnalyzing && <span className="text-xs text-emerald-400 animate-pulse">상대방이 타이핑 중...</span>}
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4 p-5 bg-[#0a192f]">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex flex-col max-w-[90%] animate-in fade-in slide-in-from-bottom-2 ${msg.sender === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
                  <span className="text-[11px] text-white/30 mb-1 px-1">{msg.sender === 'user' ? '대표님' : 'AI 아키'}</span>
                  <div className={`p-3.5 text-[14.5px] leading-relaxed rounded-2xl shadow-md whitespace-pre-wrap ${msg.sender === 'user' ? 'bg-[#2563eb] text-white rounded-tr-sm' : 'bg-[#1e293b] text-emerald-50 rounded-tl-sm border border-emerald-500/20'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="shrink-0 p-4 bg-[#0f172a] border-t border-white/5">
                <div className="flex gap-2 mb-3">
                  <input 
                    type="text" 
                    value={userFeedback} 
                    onChange={e => setUserFeedback(e.target.value)} 
                    placeholder="지시를 내려주세요. (예: 법 제1조 찾아서 대조해줘)"
                    className="flex-1 bg-black/50 border border-indigo-500/40 text-white p-3 text-[14px] rounded-full outline-none focus:border-indigo-400 px-5 transition-all"
                    onKeyDown={e => e.key === 'Enter' && analyzeCurrentChunk(true)}
                  />
                  <button 
                    onClick={() => analyzeCurrentChunk(true)} 
                    disabled={isAnalyzing || !userFeedback.trim()}
                    className="px-6 py-2 bg-indigo-600 text-white font-bold text-sm rounded-full hover:bg-indigo-500 transition-all shadow-md disabled:opacity-50 shrink-0"
                  >
                    전송
                  </button>
                </div>
                
                <button 
                  onClick={approveAndNext} 
                  className="w-full py-3.5 bg-teal-600/80 hover:bg-teal-500 text-white font-bold rounded-full transition-all shadow-[0_0_15px_rgba(20,184,166,0.3)] hover:shadow-[0_0_20px_rgba(20,184,166,0.5)] flex justify-center items-center text-sm"
                >
                  ✨ 현재 해설 저장 및 다음 문제로 이동
                </button>
            </div>
          </div>

        </div>
      </div>
    );
  }

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
                <button key={idx} onClick={() => handleMark(numStr)} className={`w-full text-left p-4 rounded-sm border transition-all ${isSelected ? 'border-teal-400 bg-teal-900/40 text-teal-100' : 'border-white/10 text-white/60 hover:bg-white/5'}`}>
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
              <p className="font-bold mb-2">🎯 정답: {q.answer}번</p>
              <p>{q.explanation}</p>
            </div>
          </div>
        ))}
        <button onClick={() => setMode('list')} className="w-full py-4 border border-white/10 text-white/40 hover:bg-white/5 transition-colors text-sm">열람실로 돌아가기</button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in pb-20">
      
      <div className="flex gap-4 border-b border-white/10 pb-4">
        <button onClick={() => setMode('list')} className={`px-4 py-2 ${mode === 'list' ? 'bg-teal-600 text-white' : 'text-teal-400'}`}>목록/업로드</button>
      </div>

      {mode === 'list' && (
        <div className="space-y-8">
          
          <div className="flex flex-col gap-4 p-6 border border-teal-500/50 bg-teal-950/30 rounded-sm">
            <h3 className="text-teal-400 font-bold text-lg mb-2">🔍 1. 참고할 근거 자료 (DB) 선택</h3>
            <p className="text-white/50 text-xs mb-4">
              [만들기] 탭에서 업로드해둔 법령/정관 목록입니다. 이번 모의고사 해설에 참고할 자료만 체크해 주세요.<br/>
              (불필요한 자료를 빼면 AI가 훨씬 빠르고 똑똑해지며 에러를 방지합니다!)
            </p>
            
            {uploadedLaws.length === 0 ? (
              <div className="text-center p-4 border border-dashed border-teal-800 text-teal-400/50 text-sm">
                현재 등록된 법령 자료가 없습니다. [만들기] 탭에서 법령을 먼저 업로드해 주세요.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 bg-black/30 border border-teal-900/50 rounded-sm">
                {uploadedLaws.map((law, idx) => (
                  <label key={idx} className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center">
                      <input 
                        type="checkbox" 
                        checked={selectedLaws.includes(law)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedLaws([...selectedLaws, law]);
                          else setSelectedLaws(selectedLaws.filter(l => l !== law));
                        }}
                        className="peer appearance-none w-5 h-5 border-2 border-teal-700 rounded-sm bg-black/50 checked:bg-teal-500 checked:border-teal-500 transition-all cursor-pointer"
                      />
                      <svg className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none opacity-0 peer-checked:opacity-100 text-teal-950" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span 
                        onClick={(e) => { e.preventDefault(); setViewingFile(law); }} 
                        className={`text-sm transition-colors hover:underline ${selectedLaws.includes(law) ? 'text-teal-200 font-bold' : 'text-teal-500/60 group-hover:text-teal-400'}`}
                    >
                      📄 {law}
                    </span>
                    <button 
                        onClick={(e) => handleDeleteLaw(e, law)}
                        className="ml-auto px-2 text-red-500 hover:text-red-300 font-bold text-xs"
                    >
                        ✕
                    </button>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4 p-6 border border-teal-500/50 bg-teal-950/30 rounded-sm">
            <h3 className="text-teal-400 font-bold text-lg mb-2">📥 2. 모의고사 (문제와 정답 한 쌍) 업로드</h3>
            <p className="text-white/50 text-xs mb-4">문제지 파일과 정답지 파일을 각각 선택하여 하나의 세트로 묶어서 올립니다.</p>

            <div className="flex flex-col md:flex-row gap-4">
              <label className="flex-1 border border-teal-900/40 p-3 text-center text-sm hover:bg-teal-900/20 cursor-pointer text-teal-400 transition-colors">
                <input ref={examInputRef} type="file" accept=".pdf,.txt" onChange={e => setExamFile(e.target.files?.[0] || null)} className="hidden"/>
                <span className="font-bold">Q.</span> {examFile ? `📂 ${examFile.name}` : '문제지 파일 선택 (필수)'}
              </label>

              <label className="flex-1 border border-emerald-900/40 p-3 text-center text-sm hover:bg-emerald-900/20 cursor-pointer text-emerald-400 transition-colors">
                <input ref={answerInputRef} type="file" accept=".pdf,.txt" onChange={e => setAnswerFile(e.target.files?.[0] || null)} className="hidden"/>
                <span className="font-bold">A.</span> {answerFile ? `📂 ${answerFile.name}` : '정답/해설지 파일 선택 (선택)'}
              </label>

              <button onClick={handleUploadForReview} disabled={isExamUploading} className="px-6 py-3 bg-teal-500 text-teal-950 font-bold text-sm shadow-lg w-full md:w-32 shrink-0 hover:bg-teal-400 transition-all">
                {isExamUploading ? "처리 중..." : "한 쌍 업로드"}
              </button>
            </div>
          </div>

          <div className="p-6 border border-teal-500/50 bg-teal-950/30 rounded-sm shadow-[0_0_15px_rgba(45,212,191,0.1)]">
            <h3 className="text-teal-400 font-bold mb-2 text-lg">📁 3. 합동 검수 목록 (클라우드 연동)</h3>
            <p className="text-white/50 text-xs mb-6">스마트폰이나 PC 어디서든 업로드한 파일이 동기화됩니다.</p>
            
            {pendingExams.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-teal-900/40 rounded-sm text-teal-500/50 text-sm">
                대기 중인 모의고사가 없습니다. 위 버튼을 눌러 모의고사를 업로드해주세요.
              </div>
            ) : (
              <div className="space-y-3">
                {pendingExams.map((exam) => (
                  <div key={exam.id} className="flex flex-col xl:flex-row justify-between items-center p-4 bg-black/40 border border-teal-500/20 rounded-sm hover:border-teal-400 transition-colors gap-4">
                    <div className="flex flex-col w-full xl:w-auto">
                      <span className="text-teal-100 font-bold text-sm">{exam.filename} (문제+정답 세트)</span>
                      <span className="text-white/40 text-xs mt-1">총 {exam.chunks.length} 문제 대기 중</span>
                    </div>
              
                    <div className="flex flex-wrap gap-2 w-full xl:w-auto justify-end">
                      <button onClick={() => startCoopReview(exam)} className="px-4 py-2 border border-teal-500/50 text-teal-400 font-bold text-xs rounded-sm hover:bg-teal-900/30 transition-all">
                        대화형 검수 시작 🚀
                      </button>
                      <button onClick={() => handleGenerateRAGFromPending(exam.id)} className="px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-sm shadow-lg hover:bg-emerald-500 transition-all">
                        해설 자동생성 (Gemini)
                      </button>
                      <button onClick={() => handleDeletePendingExam(exam.id)} className="px-3 py-2 bg-red-950/40 border border-red-500/30 text-red-400 font-bold text-xs rounded-sm hover:bg-red-900/50 transition-all">
                        🗑️ 삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {isAnalyzing && <div className="mt-4 text-emerald-400 text-sm font-bold text-center animate-pulse">✨ AI가 분석 중입니다. 터미널의 로그를 주시해주세요...</div>}
          </div>

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
                        <div className="text-teal-400 font-bold text-sm mb-4">정답: {exam.answer}</div>
                        
                        <div className="explanation-box mt-3 text-white/80">
                          {exam.explanation}
                        </div>

                        <div className="mt-6 flex justify-end">
                          <button onClick={(e) => handleDeleteExam(e, exam.id)} className="px-4 py-2 border border-red-500/30 text-red-400 hover:bg-red-500/20 rounded-sm text-xs font-bold transition-all">
                            🗑️ 이 문제 영구 삭제
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {viewingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-in fade-in">
          <div className="bg-teal-950 border border-teal-500/50 rounded-sm w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            
            <div className="flex justify-between items-center p-4 border-b border-teal-500/30 bg-teal-900/30 shrink-0">
              <h3 className="text-teal-300 font-bold text-lg">📄 {viewingFile}</h3>
              <button 
                onClick={() => { setViewingFile(null); setViewingArticle(null); }} 
                className="text-white/50 hover:text-white text-2xl font-bold px-2"
              >
                &times;
              </button>
            </div>
            
            <div className="flex flex-1 overflow-hidden">
              <div className="w-1/3 border-r border-teal-500/30 bg-black/40 overflow-y-auto custom-scrollbar p-2 space-y-1">
                {rawLawsData.filter(l => l.folder_name === viewingFile).map((law, idx) => (
                  <button
                    key={idx}
                    onClick={() => setViewingArticle(law)}
                    className={`w-full text-left px-3 py-3 text-sm rounded transition-colors ${
                      viewingArticle?.id === law.id 
                        ? 'bg-teal-600 text-white font-bold shadow-md' 
                        : 'text-teal-400 hover:bg-teal-900/50'
                    }`}
                  >
                    {law.title}
                  </button>
                ))}
              </div>
              
              <div className="w-2/3 p-6 overflow-y-auto custom-scrollbar bg-black/20 text-white/80 text-[15px] leading-loose whitespace-pre-wrap">
                {viewingArticle ? (
                  <div className="animate-in fade-in slide-in-from-right-2">
                    <h4 className="text-teal-300 font-bold text-xl mb-4 border-b border-white/10 pb-4">
                      {viewingArticle.title}
                    </h4>
                    {viewingArticle.content}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-white/30 text-sm">
                    좌측에서 열람할 조항을 선택해주세요.
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
