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

  // 💡 [핵심 개편] 실시간 채팅 UI 상태 관리
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
      console.error("[데이터 로드 에러]", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [userAddress]);

  useEffect(() => {
    // 채팅이 업데이트될 때마다 스크롤을 맨 아래로 내림
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
        if (viewingFile === folderName) {
            setViewingFile(null);
            setViewingArticle(null);
        }
      } else {
        const data = await res.json();
        alert("삭제 실패: " + data.error);
      }
    } catch (err: any) {
      alert("삭제 중 통신 오류가 발생했습니다.");
    }
  };

  const handleUploadForReview = async () => {
    if (!examFile || !userAddress) return alert("문제지 파일을 반드시 첨부해주세요.");
    setIsExamUploading(true);
    
    const fd = new FormData();
    fd.append('exam_file', examFile);
    if (answerFile) fd.append('answer_file', answerFile);
    fd.append('wallet_address', userAddress);

    try {
      const res = await fetch(`${BASE_URL}/upload-exam-coop`, {
        method: 'POST',
        body: fd
      });
      const data = await res.json();
      
      if (res.ok) {
        setExamFile(null);
        setAnswerFile(null);
        alert("대기소에 저장되었습니다!");
        fetchData();
      } else {
        alert("업로드 실패: " + data.error);
      }
    } catch (err: any) {
      alert(`업로드 실패: ${err.message}`);
    }
    setIsExamUploading(false);
  };

  const handleDeletePendingExam = async (id: number) => {
    if (!confirm("이 모의고사를 삭제하시겠습니까?")) return;
    try {
      await fetch(`${BASE_URL}/delete-pending-exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, wallet_address: userAddress })
      });
      fetchData();
    } catch (e: any) {}
  };

  const handleGenerateRAGFromPending = async (id: number) => {
    if (selectedLaws.length === 0) return alert("상단에서 최소 1개 이상의 법령을 체크해주세요!");
    if (!confirm(`해설을 자동 생성하시겠습니까?`)) return;
    
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${BASE_URL}/generate-rag-from-pending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, wallet_address: userAddress, selected_laws: selectedLaws })
      });
      if (res.ok) {
         const data = await res.json();
         const taskId = data.task_id;
         const timer = setInterval(async () => {
           const sRes = await fetch(`${BASE_URL}/task-status?task_id=${taskId}`);
           const sData = await sRes.json();
           if (sData.status === 'completed') {
             clearInterval(timer); 
             setIsAnalyzing(false); 
             fetchData();
             alert("해설 자동 생성이 완료되었습니다!");
           } else if (sData.status === 'error') {
             clearInterval(timer); 
             setIsAnalyzing(false); 
             alert("분석 오류");
           }
         }, 2000);
      }
    } catch(e: any) {
      setIsAnalyzing(false); 
    }
  };

  const handleDeleteExam = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("이 문제를 삭제하시겠습니까?")) return;
    try {
      await fetch(`${BASE_URL}/delete-exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, wallet_address: userAddress })
      });
      fetchData();
    } catch (err: any) {}
  };

  const startCoopReview = (exam: {id: number, filename: string, chunks: string[]}) => {
    if (selectedLaws.length === 0) {
      alert("상단에서 참고할 근거 자료를 먼저 체크해주세요!");
      return;
    }
    setCurrentExamId(exam.id);
    setChunks(exam.chunks);
    setFilename(exam.filename);
    setChunkIndex(0);
    setMode('coop');
    setParsedResult(null);
    setChatMessages([]); // 채팅 내역 초기화
    setUserFeedback("");
  };

  // 💡 [대화형 AI 엔진]
  const analyzeCurrentChunk = async (isFeedback = false) => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);

    const currentFeedback = userFeedback.trim();
    if (isFeedback && currentFeedback) {
        // 사용자가 보낸 채팅을 먼저 화면에 띄움
        setChatMessages(prev => [...prev, { sender: 'user', text: currentFeedback }]);
        setUserFeedback("");
    }

    try {
      const payload = {
        chunk_text: chunks[chunkIndex],
        wallet_address: userAddress,
        user_feedback: isFeedback ? currentFeedback : "",
        chat_history: chatMessages, // 기존 대화 내용 전체 전송
        selected_laws: selectedLaws 
      };
      
      const res = await fetch(`${BASE_URL}/analyze-chunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (res.ok && data.result) {
        setParsedResult(data.result);
        
        // AI가 작성한 메시지(chat_message)가 있으면 화면 채팅창에 추가
        if (data.result.chat_message) {
            setChatMessages(prev => [...prev, { sender: 'ai', text: data.result.chat_message }]);
        } else {
            // chat_message 속성이 누락되었을 경우 기본 메시지 대체
            setChatMessages(prev => [...prev, { sender: 'ai', text: "요청하신 분석을 완료했습니다. 해설을 확인해보시겠어요?" }]);
        }
      } else {
        alert("AI 분석 실패: " + data.error);
      }
    } catch (err: any) {
      alert("AI 분석 중 통신 에러가 발생했습니다.");
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

  // 💡 저장 버튼 누를 때
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
          search_process: parsedResult.search_process || ""
        })
      });

      if (chunkIndex + 1 < chunks.length) {
        setChunkIndex(chunkIndex + 1);
        setParsedResult(null);
        setChatMessages([]); // 다음 문제로 넘어가면 채팅 내역 초기화
        setUserFeedback("");
      } else {
        if (currentExamId && userAddress) {
          await fetch(`${BASE_URL}/delete-pending-exam`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: currentExamId, wallet_address: userAddress })
          });
        }
        alert("해당 모의고사의 모든 검수 및 AI 학습이 완료되었습니다!");
        fetchData(); 
        setMode('list');
      }
    } catch(err: any) {
      console.error(`[승인 및 저장 에러]`, err);
    }
  };

  const startCBT = async () => {
    if (!userAddress) return alert("로그인이 필요합니다.");
    try {
      const data = await fetch(`${BASE_URL}/get-cbt-session?wallet_address=${userAddress}`).then(r => r.json());
      if (data.error) throw new Error(data.error);
      setCbtQuestions(data);
      setCbtCurrentIndex(0);
      setUserAnswers({});
      setMode('cbt');
    } catch (e: any) {
      alert(e.message);
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

  if (mode === 'coop') {
    return (
      <div className="flex flex-col h-[85vh] space-y-4 animate-in fade-in pb-10">
        <div className="flex justify-between items-center pb-4 border-b border-white/10">
          <h2 className="text-xl text-teal-400 font-serif">🤝 대화형 AI 튜터 시스템 [{filename}]</h2>
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
          
          {/* 💡 [좌측 패널] 통합 문제 에디터 & 정답 선택 UI */}
          <div className="w-1/2 flex flex-col gap-4 border border-white/10 rounded-sm bg-black/20 p-5 overflow-y-auto custom-scrollbar">
            
            <div className="flex justify-between items-center">
              <div className="text-teal-300 font-bold text-sm">📝 1. 문제 영역 (클릭하여 직접 수정 가능)</div>
              {!parsedResult && (
                <button 
                  onClick={() => analyzeCurrentChunk(false)} 
                  disabled={isAnalyzing}
                  className="py-2 px-4 bg-teal-600 text-white text-xs font-bold rounded-sm shadow-md hover:bg-teal-500 transition-all"
                >
                  {isAnalyzing ? "AI가 지문을 스캔 중입니다..." : "🚀 AI 분석 시작"}
                </button>
              )}
            </div>

            {/* 통합된 문제 원문 텍스트에리어 */}
            <textarea 
              value={parsedResult ? parsedResult.question : chunks[chunkIndex]} 
              onChange={(e) => {
                if (parsedResult) handleEdit('question', e.target.value);
                else {
                    const newChunks = [...chunks];
                    newChunks[chunkIndex] = e.target.value;
                    setChunks(newChunks);
                }
              }}
              className="w-full flex-1 min-h-[200px] bg-black/40 border border-white/10 text-white/80 p-4 text-[15px] leading-loose outline-none resize-none rounded-sm focus:border-teal-500/50"
              placeholder="문제 내용을 입력하세요..."
            />

            {/* 정답 선택 라디오형 보기 리스트 */}
            {parsedResult && (
              <div className="space-y-3 mt-4 animate-in fade-in">
                <label className="text-sm font-bold text-teal-400 block mb-1">📋 2. 보기 및 정답 선택</label>
                <div className="text-xs text-white/40 mb-3">빨간색 원을 클릭하여 진짜 정답을 지정해주세요.</div>
                {(parsedResult.options || ['', '', '', '']).map((opt: string, i: number) => {
                  const isCorrect = String(i + 1) === String(parsedResult.answer);
                  return (
                    <div key={i} className={`flex gap-3 items-center p-2 rounded-sm border transition-all ${isCorrect ? 'bg-red-950/20 border-red-500/50' : 'border-transparent hover:bg-white/5'}`}>
                      <button 
                        onClick={() => handleEdit('answer', String(i + 1))}
                        className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isCorrect ? 'border-red-500 bg-red-500 text-white' : 'border-white/30 text-transparent'}`}
                      >
                        ✓
                      </button>
                      <input 
                        value={opt} 
                        onChange={e => handleOptionEdit(i, e.target.value)} 
                        className={`w-full bg-transparent outline-none text-sm ${isCorrect ? 'text-red-400 font-bold' : 'text-white/80'}`} 
                        placeholder={`보기 ${i + 1} 내용`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 💡 [우측 패널] 실시간 대화창 (Chat UI) 및 해설 저장 */}
          <div className="w-1/2 flex flex-col border border-emerald-900/40 rounded-sm bg-emerald-950/10 p-5 overflow-hidden relative">
            
            <div className="text-emerald-300 font-bold text-sm mb-4 shrink-0">💬 3. AI 대화 및 사고 과정 (티키타카)</div>
            
            {/* 채팅 내역 출력 영역 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4 pr-2 pb-4">
              {chatMessages.length === 0 && !isAnalyzing ? (
                <div className="h-full flex flex-col items-center justify-center text-white/30 text-sm space-y-4">
                  <div className="text-4xl">🤖</div>
                  <p>좌측에서 [AI 분석 시작]을 누르면 저와 대화가 시작됩니다!</p>
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex flex-col max-w-[85%] animate-in fade-in slide-in-from-bottom-2 ${msg.sender === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
                    <span className="text-[10px] text-white/40 mb-1 px-1">{msg.sender === 'user' ? '대표님' : '아키 (AI 튜터)'}</span>
                    <div className={`p-3 text-[14px] leading-relaxed rounded-2xl shadow-md whitespace-pre-wrap ${msg.sender === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-emerald-800/80 text-emerald-50 rounded-tl-sm border border-emerald-600'}`}>
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
              {isAnalyzing && (
                <div className="self-start flex flex-col max-w-[85%] items-start animate-pulse">
                  <span className="text-[10px] text-white/40 mb-1 px-1">아키 (AI 튜터)</span>
                  <div className="p-3 text-[14px] bg-emerald-900/50 text-emerald-200/50 rounded-2xl rounded-tl-sm border border-emerald-800/50">
                    열심히 고민 중입니다... 🤔
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* 하단 힌트 전송 및 저장 버튼 영역 */}
            {parsedResult && (
              <div className="shrink-0 pt-4 border-t border-emerald-900/50 mt-2 bg-emerald-950/10">
                <div className="flex gap-2 mb-4">
                  <input 
                    type="text" 
                    value={userFeedback} 
                    onChange={e => setUserFeedback(e.target.value)} 
                    placeholder="예: 틀렸어, 주어는 공단이 아니라 '이 법인'이야 다시 고쳐!"
                    className="flex-1 bg-black/40 border border-indigo-500/50 text-white p-3 text-sm rounded-full outline-none focus:border-indigo-400 px-5 shadow-inner"
                    onKeyDown={e => e.key === 'Enter' && analyzeCurrentChunk(true)}
                  />
                  <button 
                    onClick={() => analyzeCurrentChunk(true)} 
                    disabled={isAnalyzing || !userFeedback.trim()}
                    className="px-6 py-2 bg-indigo-600 text-white font-bold text-sm rounded-full hover:bg-indigo-500 transition-all shadow-md disabled:opacity-50"
                  >
                    전송 🚀
                  </button>
                </div>
                
                <button 
                  onClick={approveAndNext} 
                  className="w-full py-4 bg-emerald-600 text-white font-bold rounded-sm hover:scale-[1.01] hover:bg-emerald-500 transition-all shadow-lg flex justify-center items-center gap-2"
                >
                  <span>✨ 내용 확인 완료 (현재 문제 저장 및 다음으로)</span>
                </button>
              </div>
            )}
            
          </div>
        </div>
      </div>
    );
  }

  // ... (이하 cbt, result, list 모드는 모두 이전 코드와 100% 동일하게 유지됨)

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
                        해설 자동생성
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
                        
                        {exam.search_process && (
                          <div className="mb-4 p-4 bg-black/40 border-l-2 border-indigo-500 rounded-sm">
                            <div className="text-indigo-400 font-bold text-xs mb-2">🧠 AI 장기기억 (사고 과정)</div>
                            <div className="text-white/60 text-xs leading-relaxed whitespace-pre-wrap">{exam.search_process}</div>
                          </div>
                        )}

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
