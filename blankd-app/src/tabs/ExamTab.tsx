import React, { useState } from 'react';

export const ExamTab = ({ exams, examFile, setExamFile, uploadExam }: any) => {
  const [expandedExamId, setExpandedExamId] = useState<number | null>(null);
  
  return (
    <div className="space-y-8 animate-in fade-in">
      
      {/* 💡 만들기 탭에서 이사온 모의고사 전용 업로드 버튼 */}
      <div className="flex gap-2 mb-8">
        <label className="flex-1 border border-teal-900/40 p-2 text-center text-xs hover:bg-teal-900/20 cursor-pointer text-teal-400">
          <input type="file" accept=".txt,.pdf,.html" onChange={e => setExamFile(e.target.files?.[0] || null)} className="hidden"/> {examFile ? `✅ ${examFile.name}` : '+ 모의고사 파일 업로드'}
        </label>
        <button onClick={uploadExam} className="px-4 border border-teal-900/40 text-xs text-teal-400 hover:bg-teal-900/20">전송</button>
      </div>

      <div className="text-white/60 text-xs border-b border-white/10 pb-2">CBT 기출문제 열람실</div>
      {exams.length === 0 ? (
        <div className="py-32 text-center text-white/20 text-xs tracking-widest">저장된 모의고사가 없습니다. 파일을 업로드하세요.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {exams.map((exam: any) => {
            const isExpanded = expandedExamId === exam.id;
            return (
              <div key={exam.id} className="border border-teal-900/40 bg-teal-950/10 p-6 rounded-sm cursor-pointer hover:bg-teal-900/20 transition-all" onClick={() => setExpandedExamId(isExpanded ? null : exam.id)}>
                <div className="text-[13px] text-teal-100 font-serif leading-loose whitespace-pre-wrap">{exam.question}</div>
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-teal-900/50 animate-in fade-in">
                    <div className="text-amber-400 font-bold mb-2">정답: {exam.answer}</div>
                    <div className="text-[11px] text-white/60 leading-relaxed bg-black/40 p-3 rounded">{exam.explanation}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  );
};
