import React, { useState } from 'react';

export const ExamTab = ({ exams }: { exams: any[] }) => {
  const [expandedExamId, setExpandedExamId] = useState<number | null>(null);
  
  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="text-white/60 text-xs border-b border-white/10 pb-2">CBT 모의고사 기출문제 열람실</div>
      {exams.length === 0 ? (
        <div className="py-32 text-center text-white/20 text-xs tracking-widest">저장된 모의고사가 없습니다. 지식 추출 탭에서 업로드하세요.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {exams.map(exam => {
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
