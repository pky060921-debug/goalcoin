import React, { useState, useEffect, useRef } from 'react';

const BASE_URL = "https://api.blankd.top/api";

export const ExamTab = ({ walletAddress, address }: any) => {
  const userAddress = walletAddress || address;

  const [mode, setMode] = useState<'list' | 'coop'>('list');
  const [pendingExams, setPendingExams] = useState<Array<{ id: number; filename: string; chunks: string[] }>>([]);

  const [examFile, setExamFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // 진행 상태
  const [currentExamId, setCurrentExamId] = useState<number | null>(null);
  const [chunks, setChunks] = useState<string[]>([]);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [filename, setFilename] = useState('');

  // 검수 상태
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [explanation, setExplanation] = useState('');

  // 채팅 상태
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'ai' | 'user'; text: string }>>([]);
  const [userInput, setUserInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchPending = async () => {
    if (!userAddress) return;
    try {
      const res = await fetch(`${BASE_URL}/get-pending-exams?wallet_address=${userAddress}`);
      const data = await res.json();
      setPendingExams(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchPending(); }, [userAddress]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  // 업로드
  const handleUpload = async () => {
    if (!examFile || !userAddress) return alert('문제지 파일을 반드시 첨부해주세요.');
    setIsUploading(true);
    const fd = new FormData();
    fd.append('exam_file', examFile);
    if (answerFile) fd.append('answer_file', answerFile);
    fd.append('wallet_address', userAddress);

    try {
      const res = await fetch(`${BASE_URL}/upload-exam-coop`, { method: 'POST', body: fd });
      if (res.ok) {
        setExamFile(null);
        setAnswerFile(null);
        alert('업로드 완료!');
        fetchPending();
      } else {
        const err = await res.json();
        alert(`업로드 실패: ${err.error}`);
      }
    } catch (err: any) {
      alert(`업로드 실패: ${err.message}`);
    }
    setIsUploading(false);
  };

  // 검수 시작
  const startReview = (exam: any) => {
    setCurrentExamId(exam.id);
    setChunks(exam.chunks);
    setFilename(exam.filename);
    setChunkIndex(0);
    setQuestion(exam.chunks[0]);
    setAnswer('확인 필요');
    setExplanation('');
    setChatMessages([{
      sender: 'ai',
      text: `[${exam.filename}] 검수를 시작합니다.\n지문을 읽고 궁금한 내용을 질문하거나 "정답 알려줘", "O/X 판별해줘" 등을 입력하세요.`
    }]);
    setUserInput('');
    setMode('coop');
  };

  // AI와 대화 (gemma4:26b 직접 판단)
  const sendMessage = async () => {
    if (isAnalyzing || !userInput.trim()) return;
    setIsAnalyzing(true);

    const newChat: Array<{ sender: 'ai' | 'user'; text: string }> = [
      ...chatMessages,
      { sender: 'user', text: userInput }
    ];
    setChatMessages(newChat);
    setUserInput('');

    try {
      const res = await fetch(`${BASE_URL}/analyze-chunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chunk_text: question,
          user_feedback: newChat[newChat.length - 1].text,
          chat_history: newChat,
          wallet_address: userAddress,
        }),
      });
      const data = await res.json();
      if (res.ok && data.result) {
        const r = data.result;
        if (r.answer && r.answer !== '확인 필요') setAnswer(r.answer);
        if (r.explanation) setExplanation(r.explanation);
        const msg = r.chat_message && r.chat_message.trim()
          ? r.chat_message
          : '[AI 응답이 비어있습니다. 서버 로그를 확인해주세요.]';
        setChatMessages(prev => [...prev, { sender: 'ai', text: msg }]);
      } else {
        setChatMessages(prev => [...prev, { sender: 'ai', text: `오류: ${data.error || 'AI 응답 실패'}` }]);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { sender: 'ai', text: 'AI 통신 오류가 발생했습니다.' }]);
    }
    setIsAnalyzing(false);
  };

  // 저장 후 다음 문항으로
  const nextChunk = async () => {
    try {
      await fetch(`${BASE_URL}/save-golden-exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: userAddress,
          title: filename,
          question,
          options: [],
          answer,
          explanation,
        }),
      });

      const nextIndex = chunkIndex + 1;
      if (nextIndex < chunks.length) {
        setChunkIndex(nextIndex);
        setQuestion(chunks[nextIndex]);
        setAnswer('확인 필요');
        setExplanation('');
        setChatMessages([{ sender: 'ai', text: `[${nextIndex + 1}/${chunks.length}] 다음 문항입니다. 질문을 입력하세요.` }]);
      } else {
        await fetch(`${BASE_URL}/delete-pending-exam`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: currentExamId, wallet_address: userAddress }),
        });
        alert('이 모의고사의 검수가 모두 완료되었습니다!');
        setMode('list');
        fetchPending();
      }
    } catch (err) {
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  // ─── 대화형 검수 UI ───────────────────────────────────────────
  if (mode === 'coop') {
    return (
      <div className="flex flex-col h-[85vh] space-y-4 animate-in fade-in pb-10">
        <div className="flex justify-between items-center pb-4 border-b border-white/10">
          <h2 className="text-xl text-teal-400 font-serif">
            🔍 검수 중 [{filename}] ({chunkIndex + 1} / {chunks.length})
          </h2>
          <button
            onClick={() => setMode('list')}
            className="text-xs text-white/40 border border-white/10 px-3 py-1 rounded-sm hover:bg-white/5"
          >
            목록으로
          </button>
        </div>

        <div className="flex flex-1 gap-6 overflow-hidden">
          {/* 좌측: 지문 & 정답/해설 */}
          <div className="w-[50%] flex flex-col gap-4 border border-white/10 rounded-sm bg-black/20 p-5 overflow-y-auto">
            <label className="text-teal-300 font-bold text-sm">📝 지문</label>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              className="w-full min-h-[220px] bg-black/40 border border-white/10 text-white/90 p-4 text-[15px] leading-loose outline-none resize-none"
            />

            <div className="flex gap-2 items-center">
              <label className="text-sm font-bold text-teal-400 w-16">정답:</label>
              <input
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                className="bg-transparent border border-white/20 p-2 text-white outline-none w-24"
                placeholder="번호 입력"
              />
            </div>

            <label className="text-[13px] font-bold text-emerald-400 mt-2">💡 해설</label>
            <textarea
              value={explanation}
              onChange={e => setExplanation(e.target.value)}
              className="w-full min-h-[120px] bg-emerald-950/20 border border-emerald-500/30 text-emerald-100/90 p-4 text-[14px] leading-loose resize-none outline-none"
              placeholder="AI 답변을 참고해 해설을 정리하세요"
            />

            <button
              onClick={nextChunk}
              className="mt-auto py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-sm transition-all"
            >
              ✅ 저장 후 다음 문항
            </button>
          </div>

          {/* 우측: AI 채팅 */}
          <div className="w-[50%] flex flex-col border border-emerald-900/40 rounded-sm bg-[#0a192f]">
            <div className="bg-emerald-950/60 p-4 border-b border-emerald-900/40 shrink-0 text-emerald-300 font-bold text-sm">
              💬 AI 해설 (gemma4:26b)
              {isAnalyzing && <span className="animate-pulse ml-2 text-xs text-yellow-400">분석 중...</span>}
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col gap-4 p-5">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col max-w-[92%] ${msg.sender === 'user' ? 'self-end items-end' : 'self-start items-start'}`}
                >
                  <div className={`p-3 text-[14px] leading-relaxed rounded-lg whitespace-pre-wrap ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-emerald-50 border border-emerald-500/20'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="shrink-0 p-4 bg-slate-900 border-t border-white/5 flex gap-2">
              <input
                type="text"
                value={userInput}
                onChange={e => setUserInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="질문 또는 정답 판별 요청..."
                className="flex-1 bg-black/50 border border-indigo-500/40 text-white p-3 text-sm rounded outline-none"
              />
              <button
                onClick={sendMessage}
                disabled={isAnalyzing}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-sm rounded transition-all"
              >
                전송
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── 목록 & 업로드 UI ─────────────────────────────────────────
  return (
    <div className="space-y-8 animate-in fade-in pb-20">
      {/* 업로드 영역 */}
      <div className="flex flex-col md:flex-row gap-4 p-6 border border-teal-500/50 bg-teal-950/30 rounded-sm">
        <label className="flex-1 border border-teal-900/40 p-3 text-center text-sm cursor-pointer text-teal-400 hover:bg-teal-900/20 transition-colors">
          <input type="file" accept=".pdf,.txt" onChange={e => setExamFile(e.target.files?.[0] || null)} className="hidden" />
          {examFile ? `📂 ${examFile.name}` : '➕ 문제지 파일 선택 (PDF/TXT)'}
        </label>
        <label className="flex-1 border border-emerald-900/40 p-3 text-center text-sm cursor-pointer text-emerald-400 hover:bg-emerald-900/20 transition-colors">
          <input type="file" accept=".pdf,.txt" onChange={e => setAnswerFile(e.target.files?.[0] || null)} className="hidden" />
          {answerFile ? `📂 ${answerFile.name}` : '➕ 정답지 파일 선택 (선택)'}
        </label>
        <button
          onClick={handleUpload}
          disabled={isUploading || !examFile}
          className="px-6 py-3 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-teal-950 font-bold text-sm w-full md:w-32 transition-all"
        >
          {isUploading ? '업로드 중...' : '업로드'}
        </button>
      </div>

      {/* 목록 */}
      <div className="p-6 border border-teal-500/50 bg-teal-950/30 rounded-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-teal-400 font-bold text-lg">📁 업로드된 모의고사 목록</h3>
          <button onClick={fetchPending} className="text-xs text-white/40 border border-white/10 px-3 py-1 rounded-sm hover:bg-white/5">
            새로고침
          </button>
        </div>
        {pendingExams.length === 0 ? (
          <div className="py-8 text-center text-teal-500/50 text-sm">업로드된 파일이 없습니다.</div>
        ) : (
          <div className="space-y-2">
            {pendingExams.map(exam => (
              <div
                key={exam.id}
                onClick={() => startReview(exam)}
                className="p-4 bg-black/40 border border-teal-500/20 rounded-sm hover:border-teal-400 cursor-pointer flex justify-between items-center transition-colors"
              >
                <span className="text-teal-100 font-bold text-sm">{exam.filename}</span>
                <span className="text-white/40 text-xs">총 {exam.chunks.length} 문항 ➔ 클릭하여 시작</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
