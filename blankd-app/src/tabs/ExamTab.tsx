import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

// 💡 Vite 환경에서 pdf.js 워커를 안전하게 불러오기 위한 CDN 설정
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const BASE_URL = "https://api.blankd.top/api";

export interface OxQuestion {
  id: number;
  category: string;
  subCategory?: string;
  question: string;
  answer: 'O' | 'X';
  wrongParts?: string[];      // 💡 문장 내 틀린 부분(터치 타겟) 목록
  correctAnswer?: string;     // 💡 틀린 부분 터치 시 즉시 표시할 핵심 정답·수정 문구
  explanation: string;
  source?: string;
}

// 💡 기본 내장 핵심 OX 문제 (틀린 부분 wrongParts 및 핵심 정답 correctAnswer 포함)
const DEFAULT_OX_QUESTIONS: OxQuestion[] = [
  {
    id: 1,
    category: "즉시·지체없이·미리",
    question: "공단은 기관장이 예탁한 현역병 등의 요양급여비용과 요양비가 공단이 부담해야 할 금액에 미치지 못할 때에는 기관장에게 이를 지체 없이 청구해야 한다.",
    answer: "X",
    wrongParts: ["지체 없이"],
    correctAnswer: "즉시",
    explanation: "지체 없이가 아니라 '즉시' 청구하고, 기관장은 공단의 청구에 따라 지급해야 합니다(영 제27조제4항)."
  },
  {
    id: 2,
    category: "즉시·지체없이·미리",
    question: "공단은 부당이득 징수금 압류 통지를 받은 자가 징수금에 상당하는 다른 재산을 담보로 제공하고 압류 해제를 요구하는 경우 압류를 즉시 해제하여야 한다.",
    answer: "O",
    wrongParts: ["즉시 해제하여야 한다."],
    correctAnswer: "O (맞는 지문 - 즉시 해제)",
    explanation: "타 재산 담보 제공 요구 시 또는 법원의 무죄 판결 확정 등으로 위반 혐의가 입증되지 아니한 경우 '즉시' 압류를 해제해야 합니다(법 제81조의2제3항)."
  },
  {
    id: 3,
    category: "즉시·지체없이·미리",
    question: "시·도지사 또는 시장·군수·구청장은 공고기간 중 위반사실 공표 사항이 변경된 사실이 확인되었을 때에는 즉시 보건복지부장관에게 알려야 하며, 장관은 변경 사항이 공고 내용에 지체 없이 반영되도록 필요한 조치를 해야 한다.",
    answer: "X",
    wrongParts: ["즉시 보건복지부장관에게 알려야 하며", "지체 없이 반영되도록"],
    correctAnswer: "지체 없이 장관에게 알림 / 즉시 반영되도록 조치",
    explanation: "앞뒤가 바뀌었습니다. 지자체장이 장관에게 알리는 것은 '지체 없이'이고, 장관이 공고 내용에 반영하도록 조치하는 것이 '즉시'입니다(영 제74조제4항)."
  },
  {
    id: 4,
    category: "즉시·지체없이·미리",
    question: "재정운영위원회 위원장은 법 제30조제1항 각 호의 사항을 심의·의결한 때에는 그 내용을 공단 이사장에게 즉시 통보하여야 한다.",
    answer: "O",
    wrongParts: ["즉시 통보하여야 한다."],
    correctAnswer: "O (맞는 지문 - 즉시 통보)",
    explanation: "정관 제34조에 따라 재정운영위원회 위원장은 심의·의결 내용을 공단 이사장에게 '즉시' 통보해야 합니다."
  },
  {
    id: 5,
    category: "즉시·지체없이·미리",
    question: "인사규정상 이사장은 직위해제 사유 중 제3호에 해당하는 직원에 대해서는 해당 사유 발생 시 지체 없이 직위를 부여하지 아니한다.",
    answer: "X",
    wrongParts: ["지체 없이"],
    correctAnswer: "즉시",
    explanation: "인사규정 제60조제1항 단서에 따라 제3호의 경우에는 해당 사유 발생 시 '즉시' 직위를 부여하지 아니합니다."
  },
  {
    id: 6,
    category: "즉시·지체없이·미리",
    question: "공단은 요양급여비용의 지급을 보류하려는 경우에는 해당 요양기관에 지체 없이 문서로 통지하여야 한다.",
    answer: "X",
    wrongParts: ["지체 없이"],
    correctAnswer: "미리",
    explanation: "지급을 보류하려는 경우에는 해당 요양기관에 '미리' 문서로 통지하여야 합니다(영 제22조의2제1항)."
  },
  {
    id: 7,
    category: "즉시·지체없이·미리",
    question: "공단은 제84조제1항제3호(체납처분 종결 후 배분금액 부족)에 따라 결손처분을 한 후 압류할 수 있는 다른 재산이 있는 것을 발견한 때에는 즉시 그 처분을 취소하고 체납처분을 하여야 한다.",
    answer: "X",
    wrongParts: ["즉시"],
    correctAnswer: "지체 없이",
    explanation: "결손처분 취소 및 체납처분은 '지체 없이' 하여야 합니다(법 제84조제2항)."
  },
  {
    id: 8,
    category: "보험자·공단·이사장",
    question: "법 제78조의2(가산금)에서는 사용자가 거짓으로 '공단'에게 직장가입자로 신고한 경우 가산금을 부과한다고 규정하여 '공단'으로 표기하고 있다.",
    answer: "X",
    wrongParts: ["'공단'에게", "'공단'으로 표기"],
    correctAnswer: "'보험자'로 표기",
    explanation: "법 제13조 이후임에도 제78조의2(가산금), 제98조(업무정지), 제101조(제조업자 등의 금지행위)에서는 공단 대신 '보험자'로 표기한 부분이 있습니다."
  },
  {
    id: 9,
    category: "보험자·공단·이사장",
    question: "보건복지부장관은 종합계획 및 시행계획을 수립하거나 변경한 경우에는 관계 중앙행정기관의 장, 공단 및 심사평가원에 그 내용을 알려야 한다.",
    answer: "X",
    wrongParts: ["공단 및 심사평가원"],
    correctAnswer: "공단의 이사장 및 심사평가원의 원장",
    explanation: "공단과 심평원이 아니라 '공단의 이사장' 및 '심사평가원의 원장'에게 알려야 합니다(법 제2조의2제3항)."
  },
  {
    id: 10,
    category: "보험자·공단·이사장",
    question: "건강보험심사평가원의 비상임이사 중 1명은 공단의 이사장이 추천한다.",
    answer: "X",
    wrongParts: ["공단의 이사장이"],
    correctAnswer: "공단이 추천",
    explanation: "심평원 비상임이사(법 제65조)와 진료심사평가위원회 위원(규칙 제33조) 추천 주체는 공단의 이사장이 아니라 '공단'입니다."
  },
  {
    id: 11,
    category: "위원회·조직·인사",
    question: "건강보험정책심의위원회 위원, 공단 이사장, 이의신청위원회 위원, 건강보험분쟁조정위원회 위원의 임기는 모두 3년이다.",
    answer: "O",
    wrongParts: ["모두 3년이다."],
    correctAnswer: "O (맞는 지문 - 모두 3년)",
    explanation: "위 4가지는 3년이며, 이사·감사·재정운영위·진료심사평가위·정보공개심의위·공표심의위·부당이득체납공개심의위 위원의 임기는 2년입니다."
  },
  {
    id: 12,
    category: "위원회·조직·인사",
    question: "건강보험공표심의위원회의 공무원 위원 1명은 보건복지부의 4급 이상 공무원 또는 고위공무원단에 속하는 일반직공무원 중에서 장관이 임명한다.",
    answer: "X",
    wrongParts: ["4급 이상 공무원 또는"],
    correctAnswer: "고위공무원단에 속하는 일반직공무원 중에서만 임명 (4급 이상 X)",
    explanation: "공표심의위원회(9명)의 공무원 위원은 급수 언급 없이 오직 '보건복지부의 고위공무원단에 속하는 일반직공무원(고일)'으로만 규정되어 있습니다(영 제73조)."
  },
  {
    id: 13,
    category: "위원회·조직·인사",
    question: "지역본부 소속 2급 직원의 징계에 관한 사항은 해당 지역본부의 보통징계위원회에서 심의·의결한다.",
    answer: "X",
    wrongParts: ["해당 지역본부의 보통징계위원회"],
    correctAnswer: "본부의 중앙징계위원회",
    explanation: "본부 각 부서 소속 직원 및 지역본부·지사 소속 '2급 이상 직원'의 징계는 본부의 '중앙징계위원회' 관할입니다(보통징계위는 3급 이하 관할)."
  },
  {
    id: 14,
    category: "위원회·조직·인사",
    question: "공단 임직원과 건강보험분쟁조정위원회 위원 중 공무원이 아닌 사람은 형법 제127조(공무상 비밀누설) 및 제129조부터 제132조까지의 규정을 적용할 때 공무원으로 본다.",
    answer: "X",
    wrongParts: ["형법 제127조(공무상 비밀누설) 및"],
    correctAnswer: "형법 제129조~제132조만 적용 (제127조 제외)",
    explanation: "공단 임직원(법 제28조)과 분쟁조정위원회 비공무원 위원(법 제89조)은 형법 제129조~제132조만 적용되며, 형법 제127조까지 포함되는 것은 건정심 위원과 공표심의위원회 위원(법 제114조의2)뿐입니다."
  },
  {
    id: 15,
    category: "승인·인가·제정주체",
    question: "공단이 회계연도마다 결산보고서와 사업보고서를 작성한 경우, 국민건강보험법 제39조에서는 다음 해 2월 말일까지 장관에게 '보고'하도록 규정하고 있으나, 정관 제59조에서는 회계연도 종료 후 2개월 이내에 장관에게 제출하고 '승인'을 얻도록 규정하고 있다.",
    answer: "O",
    wrongParts: ["법 제39조에서는 다음 해 2월 말일까지 장관에게 '보고'", "정관 제59조에서는 회계연도 종료 후 2개월 이내에 장관에게 제출하고 '승인'"],
    correctAnswer: "O (맞는 지문 - 법은 보고, 정관은 승인)",
    explanation: "결산에 대해 법에는 '보고', 정관에는 '승인'으로 다르게 표현되어 있는 핵심 비교 포인트입니다."
  },
  {
    id: 16,
    category: "승인·인가·제정주체",
    question: "정관상 공단 일산병원의 병원장은 이사장이 임명하고, 직영장기요양기관의 장은 이사회의 의결을 거쳐 이사장이 임명한다.",
    answer: "X",
    wrongParts: ["병원장은 이사장이 임명하고", "직영장기요양기관의 장은 이사회의 의결을 거쳐 이사장이 임명한다."],
    correctAnswer: "병원장: 이사회 의결 거쳐 이사장 임명 / 직영장기요양기관장: 이사장이 임면",
    explanation: "반대입니다! 병원장(정관 제65조)은 '이사회의 의결을 거쳐 이사장이 임명'하고, 직영장기요양기관의 장(정관 제73조)은 이사회 의결 없이 '이사장이 임면'합니다."
  },
  {
    id: 17,
    category: "주요키워드·준용법",
    question: "정관 제47조에 따라 연체금 징수 예외가 되는 소액 기준은 체납된 보험료 및 그 밖의 징수금이 남아 있지 않은 연체금으로서 건강보험은 '1건당 2천원 미만', 노인장기요양보험은 '1건당 1천원 미만'이다.",
    answer: "X",
    wrongParts: ["'1건당 2천원 미만'", "'1건당 1천원 미만'"],
    correctAnswer: "'1건당' 문구 없음 (2천원 미만 / 1천원 미만)",
    explanation: "법 제106조(소액 처리)에는 '1건당' 2천원 미만이라는 표현이 있으나, 정관 제47조(연체금 징수의 예외)에는 '1건당'이라는 문구가 없습니다."
  },
  {
    id: 18,
    category: "주요키워드·준용법",
    question: "부당이득 징수금 체납자 인적사항 공개 제외 사유(영 제26조의3)에는 '재해 등으로 재산에 심한 손실을 입은 경우'만 규정되어 있고, '사업이 중대한 위기에 처한 경우'는 규정되어 있지 않다.",
    answer: "O",
    wrongParts: ["'사업이 중대한 위기에 처한 경우'는 규정되어 있지 않다."],
    correctAnswer: "O (맞는 지문)",
    explanation: "영 제26조의3(부당이득 공개 제외)은 '재해 등으로 재산에 심한 손실'만 있고 사업 위기가 없습니다(영 제48조 고액보험료 공개 제외와 영 제47조 신용정보 제공 제외에는 사업 위기가 포함됨)."
  },
  {
    id: 19,
    category: "비율·기한·종합비교",
    question: "요양기관이 속임수를 사용하여 공단·가입자 및 피부양자에게 요양급여비용을 부담하게 하였더라도, 적발되기 전에 감독관청에 부당청구 사실을 자진하여 신고한 경우에는 과징금을 2분의 1 범위에서 감경할 수 있다.",
    answer: "X",
    wrongParts: ["과징금을 2분의 1 범위에서 감경할 수 있다."],
    correctAnswer: "속임수를 사용한 때에는 감경할 수 없음",
    explanation: "시행령 별표2 감면처분 단서에 따라 '속임수를 사용하여 부담하게 하였을 때'에는 자진신고 등을 불문하고 감면할 수 없습니다."
  },
  {
    id: 20,
    category: "비율·기한·종합비교",
    question: "공단은 법 제58조에 따른 손해배상청구권 대위 행사 사무와 법 제82조에 따른 분할납부 승인 사무를 수행하기 위하여 불가피한 경우 범죄경력자료나 주민등록번호 등이 포함된 민감정보 및 고유식별정보를 처리할 수 있다.",
    answer: "X",
    wrongParts: ["법 제58조에 따른 손해배상청구권 대위 행사 사무와 법 제82조에 따른 분할납부 승인 사무"],
    correctAnswer: "민감정보·고유식별정보 처리 대상 사무(영 제81조)에 해당하지 않음",
    explanation: "손해배상청구권(제58조), 보험료 경감(제75조), 분할납부 승인(제82조)은 이사장 권한 위임(영 제13조)에는 있지만 민감정보 및 고유식별정보 처리 사무(영 제81조)에는 없습니다."
  }
];

// 💡 wrongParts가 명시되지 않은 일반 문제에서도 틀린 부분을 자동 추론하는 보조 함수
function getEffectiveWrongParts(q: OxQuestion): string[] {
  if (Array.isArray(q.wrongParts) && q.wrongParts.length > 0) {
    const valid = q.wrongParts.filter(p => p && q.question.includes(p));
    if (valid.length > 0) return valid;
  }
  const exp = q.explanation || "";
  const matched: string[] = [];

  // 1) A -> B 패턴에서 A 추출
  const arrowRegex = /([가-힣0-9a-zA-Z\sㆍ․·,()「」]+?)\s*(?:→|☞|≫|->)/g;
  let m: RegExpExecArray | null;
  while ((m = arrowRegex.exec(exp)) !== null) {
    const left = m[1].replace(/^[㉠-㉭①-⑩\d]+\s*(?:은|는|번)?\s*/, '').trim();
    if (left.length >= 2 && q.question.includes(left)) {
      matched.push(left);
    }
  }
  // 2) 밑줄 기호 ㉠~㉭ 추출
  const circleRegex = /([㉠-㉭])[^㉠-㉭,.)]+/g;
  while ((m = circleRegex.exec(q.question)) !== null) {
    if (exp.includes(m[1])) {
      matched.push(m[0].trim());
    }
  }
  if (matched.length > 0) return Array.from(new Set(matched));

  // 3) 기본 폴백: 마지막 서술어 어절(3어절) 하이라이트
  const words = q.question.trim().split(/\s+/);
  if (words.length >= 3) {
    return [words.slice(-3).join(" ")];
  }
  return [q.question];
}

export const ExamTab = ({ walletAddress, address }: any) => {
  const safeAddress = walletAddress || address || "guest";

  // 💡 모드 전환 상태 ('ox' : OX 퀴즈 및 오답 터치 암기 모드 | 'pdf' : PDF 실전 모의고사 모드)
  const [examMode, setExamMode] = useState<'ox' | 'pdf'>('ox');

  // =========================================================================
  // 1. OX 퀴즈 & 오답노트(틀린부분 터치 정답확인) 관련 상태 및 로직
  // =========================================================================
  const [oxBank, setOxBank] = useState<OxQuestion[]>(() => {
    try {
      const saved = localStorage.getItem(`blankd_ox_bank_${safeAddress}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_OX_QUESTIONS;
  });

  const [oxCategory, setOxCategory] = useState<string>('전체');
  const [oxSubCategory, setOxSubCategory] = useState<string>('전체');
  const [oxSearchQuery, setOxSearchQuery] = useState<string>('');
  const [oxFilterWrongOnly, setOxFilterWrongOnly] = useState<boolean>(false);

  // 💡 틀린 부분 하이라이트 & 터치 시 정답 표시 모드 ON/OFF (기본값: true)
  const [touchWrongMode, setTouchWrongMode] = useState<boolean>(true);

  // 💡 틀린 부분을 터치하여 정답이 펼쳐진 문항 ID 집합
  const [revealedTouchIds, setRevealedTouchIds] = useState<Set<number>>(new Set());

  // 💡 각 문항별로 사용자가 클릭한 답 ('O' | 'X')
  const [oxUserChoices, setOxUserChoices] = useState<Record<number, 'O' | 'X'>>({});

  // 💡 OX 문제 선택 삭제 모드 및 선택된 문제 ID 집합
  const [isOxDeleteMode, setIsOxDeleteMode] = useState<boolean>(false);
  const [selectedOxIds, setSelectedOxIds] = useState<Set<number>>(new Set());

  // 각 문제별 누적 풀이 기록: { [id]: 'correct' | 'wrong' }
  const [oxHistory, setOxHistory] = useState<Record<number, 'correct' | 'wrong'>>(() => {
    try { return JSON.parse(localStorage.getItem(`blankd_ox_history_${safeAddress}`) || '{}'); } catch { return {}; }
  });

  const oxFileInputRef = useRef<HTMLInputElement>(null);
  const oxReplaceFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { localStorage.setItem(`blankd_ox_bank_${safeAddress}`, JSON.stringify(oxBank)); } catch (e) {}
  }, [oxBank, safeAddress]);

  useEffect(() => {
    try { localStorage.setItem(`blankd_ox_history_${safeAddress}`, JSON.stringify(oxHistory)); } catch (e) {}
  }, [oxHistory, safeAddress]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    oxBank.forEach(q => { if (q.category) cats.add(q.category); });
    return ['전체', ...Array.from(cats)];
  }, [oxBank]);

  const subCategories = useMemo(() => {
    const subs = new Set<string>();
    oxBank.forEach(q => {
      if ((oxCategory === '전체' || q.category === oxCategory) && q.subCategory) {
        subs.add(q.subCategory);
      }
    });
    return ['전체', ...Array.from(subs)];
  }, [oxBank, oxCategory]);

  const filteredOxQuestions = useMemo(() => {
    const qLower = oxSearchQuery.trim().toLowerCase();
    return oxBank.filter(q => {
      if (oxCategory !== '전체' && q.category !== oxCategory) return false;
      if (oxSubCategory !== '전체' && q.subCategory !== oxSubCategory) return false;
      if (oxFilterWrongOnly && oxHistory[q.id] !== 'wrong') return false;
      if (qLower) {
        const hay = `${q.question} ${q.correctAnswer || ''} ${q.explanation || ''} ${q.subCategory || ''}`.toLowerCase();
        if (!hay.includes(qLower)) return false;
      }
      return true;
    });
  }, [oxBank, oxCategory, oxSubCategory, oxFilterWrongOnly, oxHistory, oxSearchQuery]);

  // 💡 틀린 부분(또는 문장)을 터치/클릭했을 때 정답 토글
  const handleToggleTouchReveal = (qId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isOxDeleteMode) {
      toggleSelectOxForDelete(qId);
      return;
    }
    setRevealedTouchIds(prev => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  };

  // 💡 현재 필터링된 문항 전체 정답 펼치기 / 접기
  const handleToggleRevealAllFiltered = () => {
    const filteredIds = filteredOxQuestions.map(q => q.id);
    const allRevealed = filteredIds.length > 0 && filteredIds.every(id => revealedTouchIds.has(id));
    setRevealedTouchIds(prev => {
      const next = new Set(prev);
      if (allRevealed) {
        filteredIds.forEach(id => next.delete(id));
      } else {
        filteredIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  // 💡 특정 문항의 O 또는 X 버튼 클릭 시 처리
  const handleSelectOxRow = (q: OxQuestion, choice: 'O' | 'X') => {
    setOxUserChoices(prev => {
      if (prev[q.id] === choice) {
        const next = { ...prev };
        delete next[q.id];
        return next;
      }
      return { ...prev, [q.id]: choice };
    });

    const isCorrect = choice === q.answer;
    setOxHistory(prev => ({
      ...prev,
      [q.id]: isCorrect ? 'correct' : 'wrong'
    }));
  };

  // 💡 JSON 문제 파일 파싱 및 정규화 공통 로직
  const parseUploadedOxItems = (parsed: any[], startId: number, existingQuestions: Set<string>) => {
    const addedQuestions: OxQuestion[] = [];
    let duplicateCount = 0;
    let maxId = startId;

    parsed.forEach((item: any) => {
      const rawQuestion = item.question || item.wrong_text || item.statement;
      if (!rawQuestion) return;
      const qText = String(rawQuestion).trim();
      if (existingQuestions.has(qText)) {
        duplicateCount++;
        return;
      }
      existingQuestions.add(qText);
      maxId += 1;

      const rawAns = item.answer ? String(item.answer).trim().toUpperCase() : 'X';
      const ans: 'O' | 'X' = rawAns === 'O' ? 'O' : 'X';
      const wrongParts: string[] = Array.isArray(item.wrongParts)
        ? item.wrongParts.map((p: any) => String(p).trim()).filter(Boolean)
        : item.wrongPart
        ? [String(item.wrongPart).trim()]
        : [];
      const correctAnswer = item.correctAnswer || item.correction || "";
      const explanation = item.explanation || (correctAnswer ? `[정답·수정] ${correctAnswer}` : "");

      addedQuestions.push({
        id: maxId,
        category: item.category ? String(item.category).trim() : "오답노트",
        subCategory: item.subCategory ? String(item.subCategory).trim() : undefined,
        question: qText,
        answer: ans,
        wrongParts: wrongParts.length > 0 ? wrongParts : undefined,
        correctAnswer: correctAnswer ? String(correctAnswer).trim() : undefined,
        explanation: String(explanation).trim(),
        source: item.source ? String(item.source).trim() : undefined
      });
    });

    return { addedQuestions, duplicateCount };
  };

  // 💡 JSON 문제 파일 업로드 핸들러 (기존 문제 뒤에 추가 또는 단독 교체)
  const handleUploadOxJson = (e: React.ChangeEvent<HTMLInputElement>, replaceAll: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setOxBank(prevBank => {
            const baseBank = replaceAll ? [] : prevBank;
            const existingQuestions = new Set(baseBank.map(q => q.question.trim()));
            const startId = baseBank.reduce((max, q) => Math.max(max, Number(q.id) || 0), 0);

            const { addedQuestions, duplicateCount } = parseUploadedOxItems(parsed, startId, existingQuestions);

            if (addedQuestions.length === 0) {
              alert(`⚠️ 새로 추가된 문제가 없습니다. (중복된 문제 ${duplicateCount}개 제외)`);
              return prevBank;
            }

            const nextBank = [...baseBank, ...addedQuestions];
            if (replaceAll) {
              setOxCategory('전체');
              setOxSubCategory('전체');
              setOxUserChoices({});
              setRevealedTouchIds(new Set());
              setOxHistory({});
            }
            alert(
              `✅ ${addedQuestions.length}개의 오답노트/OX 문제가 ${replaceAll ? '새로 로드' : '추가'}되었습니다! (총 ${nextBank.length}문제)` +
              (duplicateCount > 0 ? `\n* 중복 문제 ${duplicateCount}개는 자동 제외되었습니다.` : '') +
              `\n💡 문장 내 하이라이트된 [틀린 부분]을 터치하면 즉시 정답이 표시됩니다.`
            );
            return nextBank;
          });
        } else {
          alert("❌ 올바른 JSON 배열 형식이 아닙니다.");
        }
      } catch (err) {
        alert("❌ JSON 파일 파싱 중 오류가 발생했습니다.");
      }
      if (oxFileInputRef.current) oxFileInputRef.current.value = "";
      if (oxReplaceFileInputRef.current) oxReplaceFileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  // 💡 현재 문제은행을 JSON 파일로 다운로드 (백업/공유용)
  const handleExportOxJson = () => {
    const dataStr = JSON.stringify(oxBank, null, 2);
    const blob = new Blob([dataStr], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `국민건강보험공단_오답정리_${oxBank.length}제.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 💡 문장 내 틀린 부분(wrongParts)을 하이라이트하고 터치 시 정답이 나오도록 렌더링하는 함수
  const renderQuestionWithTouchableWrongParts = (q: OxQuestion, isTouchRevealed: boolean) => {
    if (!touchWrongMode) {
      return (
        <span
          onClick={(e) => handleToggleTouchReveal(q.id, e)}
          className="cursor-pointer hover:text-teal-200 transition-colors"
          title="터치하여 정답·해설 보기"
        >
          {q.question}
        </span>
      );
    }

    const targets = getEffectiveWrongParts(q).filter(Boolean);
    if (targets.length === 0) {
      return (
        <span
          onClick={(e) => handleToggleTouchReveal(q.id, e)}
          className="cursor-pointer hover:text-teal-200 transition-colors"
        >
          {q.question}
        </span>
      );
    }

    // 긴 구문부터 매칭하도록 정렬 후 정규식 분할
    const sortedTargets = [...targets].sort((a, b) => b.length - a.length);
    const escaped = sortedTargets.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escaped.join('|')})`, 'g');
    const segments = q.question.split(regex);
    const targetSet = new Set(sortedTargets);

    const shortRight = q.correctAnswer || q.explanation.split('\n')[0].replace(/^\[정답·수정\]\s*/, '');

    return (
      <span className="leading-relaxed">
        {segments.map((seg, i) => {
          if (targetSet.has(seg)) {
            return (
              <span
                key={i}
                onClick={(e) => handleToggleTouchReveal(q.id, e)}
                title="틀린 부분입니다. 터치하면 정답이 표시됩니다!"
                className={`inline-flex flex-wrap items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded-sm cursor-pointer select-none transition-all active:scale-95 ${
                  isTouchRevealed
                    ? 'bg-rose-950/70 text-rose-300 line-through decoration-rose-400 border border-rose-500/40'
                    : 'bg-rose-950/60 hover:bg-rose-900/80 text-rose-200 border-b-2 border-dashed border-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.25)]'
                }`}
              >
                <span>{seg}</span>
                {!isTouchRevealed && (
                  <span className="text-[10px] text-amber-300 font-bold no-underline">👆</span>
                )}
              </span>
            );
          }
          return (
            <span
              key={i}
              onClick={(e) => handleToggleTouchReveal(q.id, e)}
              className="cursor-pointer"
            >
              {seg}
            </span>
          );
        })}

        {/* 💡 틀린 부분 터치 시 문장 바로 옆(인라인)에 즉시 튀어나오는 핵심 정답 배지 */}
        {isTouchRevealed && shortRight && (
          <span
            onClick={(e) => handleToggleTouchReveal(q.id, e)}
            className="inline-flex items-center gap-1.5 ml-2 px-2 py-0.5 bg-teal-900/80 border border-teal-400 text-teal-200 text-xs sm:text-sm font-bold rounded-sm shadow-[0_0_10px_rgba(20,184,166,0.4)] cursor-pointer animate-in fade-in duration-150"
          >
            <span className="text-amber-300">👉 정답:</span>
            <span>{shortRight}</span>
          </span>
        )}
      </span>
    );
  };

  // 💡 단일 OX 문제 삭제
  const handleDeleteSingleOx = (targetId: number) => {
    if (!window.confirm(`#${targetId}번 문제를 삭제하시겠습니까?`)) return;
    setOxBank(prev => prev.filter(q => q.id !== targetId));
    setOxHistory(prev => {
      const next = { ...prev };
      delete next[targetId];
      return next;
    });
    setOxUserChoices(prev => {
      const next = { ...prev };
      delete next[targetId];
      return next;
    });
    setRevealedTouchIds(prev => {
      const next = new Set(prev);
      next.delete(targetId);
      return next;
    });
    setSelectedOxIds(prev => {
      const next = new Set(prev);
      next.delete(targetId);
      return next;
    });
  };

  // 💡 선택 삭제 모드에서 문제 선택/해제 토글
  const toggleSelectOxForDelete = (id: number) => {
    setSelectedOxIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 💡 현재 필터링된 목록 전체 선택 / 해제
  const handleToggleSelectAllFiltered = () => {
    const filteredIds = filteredOxQuestions.map(q => q.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedOxIds.has(id));
    setSelectedOxIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        filteredIds.forEach(id => next.delete(id));
      } else {
        filteredIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  // 💡 선택한 OX 문제들 일괄 삭제 실행
  const handleDeleteSelectedOxQuestions = () => {
    if (selectedOxIds.size === 0) return alert("삭제할 문제를 먼저 선택해주세요.");
    if (!window.confirm(`선택한 ${selectedOxIds.size}개의 문제를 삭제하시겠습니까?`)) return;

    setOxBank(prev => prev.filter(q => !selectedOxIds.has(q.id)));
    setOxHistory(prev => {
      const next = { ...prev };
      selectedOxIds.forEach(id => delete next[id]);
      return next;
    });
    setOxUserChoices(prev => {
      const next = { ...prev };
      selectedOxIds.forEach(id => delete next[id]);
      return next;
    });
    setRevealedTouchIds(prev => {
      const next = new Set(prev);
      selectedOxIds.forEach(id => next.delete(id));
      return next;
    });
    setSelectedOxIds(new Set());
    setIsOxDeleteMode(false);
  };

  const handleResetOxHistory = () => {
    if (window.confirm("풀이 기록 및 펼쳐진 정답 표시를 모두 초기화하시겠습니까?")) {
      setOxHistory({});
      setOxUserChoices({});
      setRevealedTouchIds(new Set());
    }
  };

  const handleRestoreDefaultOxBank = () => {
    if (window.confirm("모든 문제 변경사항을 초기화하고 기본 문제(20문항)로 되돌리시겠습니까?")) {
      setOxBank(DEFAULT_OX_QUESTIONS);
      localStorage.removeItem(`blankd_ox_bank_${safeAddress}`);
      setOxUserChoices({});
      setRevealedTouchIds(new Set());
      setOxCategory('전체');
      setOxSubCategory('전체');
      setSelectedOxIds(new Set());
      setIsOxDeleteMode(false);
    }
  };

  // =========================================================================
  // 2. PDF 실전 모의고사 관련 상태 및 로직
  // =========================================================================
  const [examFile, setExamFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [questionCount, setQuestionCount] = useState<number>(40);
  const [pageDim, setPageDim] = useState({ w: 800, h: 1131 });

  const examFileInputRef = useRef<HTMLInputElement>(null);
  const answerFileInputRef = useRef<HTMLInputElement>(null);

  const [userAnswers, setUserAnswers] = useState<Record<number, number>>(() => {
    try { return JSON.parse(localStorage.getItem(`blankd_omr_${safeAddress}`) || '{}'); } catch { return {}; }
  });
  
  const [correctAnswers, setCorrectAnswers] = useState<Record<number, number> | null>(() => {
    try { return JSON.parse(localStorage.getItem(`blankd_omr_correct_${safeAddress}`) || 'null'); } catch { return null; }
  });

  const [isGrading, setIsGrading] = useState(false);
  const [score, setScore] = useState<{ correct: number, total: number } | null>(() => {
    try { return JSON.parse(localStorage.getItem(`blankd_omr_score_${safeAddress}`) || 'null'); } catch { return null; }
  });
  const [systemLog, setSystemLog] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  const [lines, setLines] = useState<Record<number, any[]>>(() => {
    try { return JSON.parse(localStorage.getItem(`blankd_drawings_${safeAddress}`) || '{}'); } catch { return {}; }
  }); 
  const currentPathRef = useRef<any[]>([]);

  useEffect(() => { localStorage.setItem(`blankd_omr_${safeAddress}`, JSON.stringify(userAnswers)); }, [userAnswers, safeAddress]);
  useEffect(() => { localStorage.setItem(`blankd_omr_correct_${safeAddress}`, JSON.stringify(correctAnswers)); }, [correctAnswers, safeAddress]);
  useEffect(() => { localStorage.setItem(`blankd_omr_score_${safeAddress}`, JSON.stringify(score)); }, [score, safeAddress]);
  
  useEffect(() => {
    try {
      localStorage.setItem(`blankd_drawings_${safeAddress}`, JSON.stringify(lines));
    } catch (e) {
      console.warn("용량 초과로 일부 필기가 저장되지 않을 수 있습니다.");
    }
  }, [lines, safeAddress]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const onPageLoadSuccess = (page: any) => {
    const vp = page.getViewport({ scale: 1 });
    setPageDim({ w: vp.width, h: vp.height });
  };

  const drawLines = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';

    const pageLines = lines[pageNumber] || [];
    const allPaths = [...pageLines, currentPathRef.current].filter(p => p.length > 0);

    allPaths.forEach(path => {
      ctx.beginPath();
      path.forEach((point, i) => {
        if (i === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    });
  };

  useEffect(() => {
    drawLines();
  }, [lines, pageNumber, pageDim, examMode]);

  const getScaledCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = pageDim.w / rect.width;
    const scaleY = pageDim.h / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY)
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== 'pen' && e.pointerType !== 'mouse') return;
    const { x, y } = getScaledCoordinates(e);
    setIsDrawing(true);
    currentPathRef.current = [{ x, y }];
    drawLines();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || (e.pointerType !== 'pen' && e.pointerType !== 'mouse')) return;
    const { x, y } = getScaledCoordinates(e);
    const path = currentPathRef.current;
    const lastPoint = path[path.length - 1];
    if (lastPoint && Math.hypot(lastPoint.x - x, lastPoint.y - y) < 2) return;
    path.push({ x, y });
    drawLines();
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPathRef.current.length > 0) {
      setLines(prev => ({
        ...prev,
        [pageNumber]: [...(prev[pageNumber] || []), currentPathRef.current]
      }));
      currentPathRef.current = [];
    }
  };

  const handleAnswerSelect = (qNum: number, ans: number) => {
    if (score) return;
    setUserAnswers(prev => ({ ...prev, [qNum]: ans }));
  };

  const handleDeleteExamFile = () => {
    if (window.confirm("현재 올라와 있는 모의고사 문제지 PDF를 닫고 삭제하시겠습니까?")) {
      setExamFile(null);
      setNumPages(null);
      setPageNumber(1);
      if (examFileInputRef.current) examFileInputRef.current.value = "";
      setSystemLog("🗑️ 문제지 PDF가 삭제되었습니다.");
    }
  };

  const handleDeleteAnswerFile = () => {
    if (window.confirm("업로드된 정답지 PDF와 채점 결과를 삭제하시겠습니까?")) {
      setAnswerFile(null);
      setCorrectAnswers(null);
      setScore(null);
      localStorage.removeItem(`blankd_omr_correct_${safeAddress}`);
      localStorage.removeItem(`blankd_omr_score_${safeAddress}`);
      if (answerFileInputRef.current) answerFileInputRef.current.value = "";
      setSystemLog("🗑️ 정답지 및 채점 결과가 삭제되었습니다.");
    }
  };

  const handleResetAll = () => {
    if (window.confirm("업로드된 모의고사 PDF 파일과 모든 필기, OMR 마킹 기록을 완전히 삭제하시겠습니까?")) {
      setExamFile(null);
      setAnswerFile(null);
      setNumPages(null);
      setLines({});
      setUserAnswers({});
      setCorrectAnswers(null);
      setScore(null);
      setPageNumber(1);
      localStorage.removeItem(`blankd_omr_${safeAddress}`);
      localStorage.removeItem(`blankd_omr_correct_${safeAddress}`);
      localStorage.removeItem(`blankd_omr_score_${safeAddress}`);
      localStorage.removeItem(`blankd_drawings_${safeAddress}`);
      if (examFileInputRef.current) examFileInputRef.current.value = "";
      if (answerFileInputRef.current) answerFileInputRef.current.value = "";
      setSystemLog("🔄 모의고사 파일 및 모든 기록이 완전히 삭제되었습니다.");
    }
  };

  const handleGradeExam = async () => {
    if (!answerFile) return alert("정답지 PDF 파일을 먼저 업로드해주세요.");
    
    setIsGrading(true);
    setSystemLog("📡 정답지 PDF 텍스트 추출 중...");

    try {
      const formData = new FormData();
      formData.append("file", answerFile);
      const extractRes = await fetch(`${BASE_URL}/extract-pdf-text`, { method: "POST", body: formData });
      const extractData = await extractRes.json();
      
      if (!extractData.text) throw new Error("텍스트 추출 실패");

      setSystemLog("🤖 백엔드 서버(Ollama)에서 정답 번호 추출 중...");

      const aiRes = await fetch(`${BASE_URL}/grade-exam`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: extractData.text,
          question_count: questionCount
        })
      });

      if (!aiRes.ok) throw new Error("AI 채점 서버 연결 실패");

      const parsedAnswers = await aiRes.json();
      setCorrectAnswers(parsedAnswers);

      let correctCnt = 0;
      for (let i = 1; i <= questionCount; i++) {
        if (userAnswers[i] && parsedAnswers[String(i)] && userAnswers[i] === parseInt(parsedAnswers[String(i)])) {
          correctCnt++;
        }
      }
      
      setScore({ correct: correctCnt, total: questionCount });
      setSystemLog("✅ 채점이 완료되었습니다!");

    } catch (e: any) {
      console.error(e);
      setSystemLog(`❌ 채점 오류: ${e.message}`);
      alert("서버 연결에 실패했습니다. 백엔드가 정상적으로 작동 중인지 확인해주세요.");
    } finally {
      setIsGrading(false);
    }
  };

  const totalSolvedOx = Object.keys(oxHistory).length;
  const totalCorrectOx = Object.values(oxHistory).filter(v => v === 'correct').length;
  const totalWrongOx = Object.values(oxHistory).filter(v => v === 'wrong').length;

  return (
    <div className="flex flex-col w-full max-w-[1800px] mx-auto space-y-4 pb-16 animate-in fade-in">
      
      {/* 🧭 상단 모드 스위처 바 */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-[#0a0a0c] border border-white/10 p-3 sm:p-4 rounded-sm shadow-xl">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExamMode('ox')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-sm transition-all flex items-center gap-2 border ${
              examMode === 'ox'
                ? 'bg-teal-900/50 text-teal-300 border-teal-500 shadow-[0_0_12px_rgba(20,184,166,0.3)]'
                : 'bg-white/5 text-white/40 border-white/10 hover:text-white/80'
            }`}
          >
            <span>⚡ 오답노트 & 실전 OX ({oxBank.length}제)</span>
          </button>
          <button
            onClick={() => setExamMode('pdf')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-sm transition-all flex items-center gap-2 border ${
              examMode === 'pdf'
                ? 'bg-indigo-900/50 text-indigo-300 border-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.3)]'
                : 'bg-white/5 text-white/40 border-white/10 hover:text-white/80'
            }`}
          >
            <span>📄 PDF 실전 모의고사 (OMR)</span>
          </button>
        </div>

        {examMode === 'ox' ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* 💡 오답노트 JSON 단독 로드 (덮어쓰기) */}
            <label className="cursor-pointer bg-teal-900/40 hover:bg-teal-900/60 border border-teal-500/40 text-teal-300 text-[11px] font-bold px-3 py-1.5 rounded-sm transition-colors shadow-sm">
              📂 오답노트 JSON 불러오기(교체)
              <input
                ref={oxReplaceFileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => handleUploadOxJson(e, true)}
              />
            </label>
            {/* 💡 기존 목록 뒤에 추가 업로드 */}
            <label className="cursor-pointer bg-amber-900/40 hover:bg-amber-900/60 border border-amber-500/40 text-amber-300 text-[11px] font-bold px-3 py-1.5 rounded-sm transition-colors shadow-sm">
              ➕ JSON 문제 추가 업로드
              <input
                ref={oxFileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => handleUploadOxJson(e, false)}
              />
            </label>
            <button
              onClick={handleExportOxJson}
              className="bg-indigo-950/50 hover:bg-indigo-900/60 border border-indigo-500/40 text-indigo-300 text-[11px] font-bold px-3 py-1.5 rounded-sm transition-colors"
              title="현재 저장된 문제를 JSON 파일로 다운로드"
            >
              💾 JSON 저장
            </button>
            <button
              onClick={() => {
                setIsOxDeleteMode(prev => !prev);
                setSelectedOxIds(new Set());
              }}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-sm border transition-colors ${
                isOxDeleteMode
                  ? 'bg-red-600 text-white border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.4)]'
                  : 'bg-red-950/40 hover:bg-red-900/60 border-red-500/40 text-red-300'
              }`}
            >
              {isOxDeleteMode ? '✕ 선택 삭제 종료' : '🗑️ 문제 골라서 삭제'}
            </button>
            <button
              onClick={handleRestoreDefaultOxBank}
              className="bg-white/5 hover:bg-white/15 border border-white/10 text-white/60 text-[11px] font-bold px-3 py-1.5 rounded-sm transition-colors"
              title="기본 20문제로 되돌리기"
            >
              🔄 기본 문제로 복원
            </button>
            <button
              onClick={handleResetOxHistory}
              className="bg-white/5 hover:bg-white/15 border border-white/10 text-white/60 text-[11px] font-bold px-3 py-1.5 rounded-sm transition-colors"
            >
              🧹 풀이·정답표시 초기화
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {examFile && (
              <button
                onClick={handleDeleteExamFile}
                className="bg-red-950/50 hover:bg-red-900/70 text-red-300 border border-red-500/40 text-[11px] font-bold px-3 py-1.5 rounded-sm transition-colors"
              >
                🗑️ 올라온 문제지 삭제 ({examFile.name.substring(0, 12)}...)
              </button>
            )}
            {(answerFile || score) && (
              <button
                onClick={handleDeleteAnswerFile}
                className="bg-amber-950/50 hover:bg-amber-900/70 text-amber-300 border border-amber-500/40 text-[11px] font-bold px-3 py-1.5 rounded-sm transition-colors"
              >
                🗑️ 정답지·채점결과 삭제
              </button>
            )}
            <button
              onClick={handleResetAll}
              className="bg-red-600/80 hover:bg-red-500 text-white border border-red-400 text-[11px] font-bold px-3 py-1.5 rounded-sm transition-colors shadow-md"
            >
              🚨 모의고사 전체 삭제·초기화
            </button>
          </div>
        )}
      </div>

      {/* =========================================================================
          모드 A: ⚡ 오답노트 & 실전 OX 퀴즈 화면 (틀린 부분 터치 시 정답 즉시 표시)
      ========================================================================= */}
      {examMode === 'ox' && (
        <div className="bg-[#0a0a0c] border border-white/10 rounded-sm shadow-2xl p-4 sm:p-6 space-y-4">
          
          {/* 상단 카테고리 필터 + 검색 + 틀린부분 터치 컨트롤 */}
          <div className="flex flex-col gap-3 border-b border-white/10 pb-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => {
                      setOxCategory(cat);
                      setOxSubCategory('전체');
                    }}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-sm border transition-all ${
                      oxCategory === cat
                        ? 'bg-teal-900/50 text-teal-300 border-teal-500/50'
                        : 'bg-white/5 text-white/40 border-white/10 hover:text-white/70'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0 font-mono text-xs">
                <button
                  onClick={() => setTouchWrongMode(prev => !prev)}
                  className={`px-3 py-1 text-xs font-sans font-bold rounded-sm border transition-all ${
                    touchWrongMode
                      ? 'bg-rose-900/60 text-rose-200 border-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
                      : 'bg-white/5 text-white/50 border-white/10 hover:text-white/80'
                  }`}
                  title="문장 내 틀린 부분을 밑줄 하이라이트하고 터치 시 정답을 표시합니다"
                >
                  👆 틀린부분 터치모드 {touchWrongMode ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={handleToggleRevealAllFiltered}
                  className="px-3 py-1 text-xs font-sans font-bold rounded-sm border bg-amber-950/40 text-amber-300 border-amber-500/40 hover:bg-amber-900/50 transition-all"
                >
                  👁️ 현재 목록 정답 모두 펼치기/접기
                </button>
                <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-sm text-white/70">
                  표시 <b className="text-white">{filteredOxQuestions.length}</b>/{oxBank.length}
                </span>
                <span className="px-2.5 py-1 bg-teal-950/30 border border-teal-500/30 rounded-sm text-teal-300">
                  정답 <b>{totalCorrectOx}</b>
                </span>
                <span className="px-2.5 py-1 bg-red-950/30 border border-red-500/30 rounded-sm text-red-300">
                  오답 <b>{totalWrongOx}</b>
                </span>
                <button
                  onClick={() => setOxFilterWrongOnly(!oxFilterWrongOnly)}
                  className={`px-3 py-1 text-xs font-sans font-bold rounded-sm border transition-all ${
                    oxFilterWrongOnly
                      ? 'bg-red-600 text-white border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.4)]'
                      : 'bg-red-950/30 text-red-400 border-red-500/30 hover:bg-red-900/40'
                  }`}
                >
                  🎯 틀린 문제만 ({totalWrongOx})
                </button>
              </div>
            </div>

            {/* 세부 조문 분류(subCategory) 선택 및 키워드 검색창 */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
              {subCategories.length > 1 && (
                <select
                  value={oxSubCategory}
                  onChange={(e) => setOxSubCategory(e.target.value)}
                  className="bg-[#121216] border border-white/15 text-xs text-white/85 px-3 py-1.5 rounded-sm outline-none focus:border-teal-500"
                >
                  {subCategories.map(sub => (
                    <option key={sub} value={sub}>
                      {sub === '전체' ? '📑 세부 장·절 전체 보기' : sub}
                    </option>
                  ))}
                </select>
              )}
              <div className="relative flex-1">
                <input
                  type="text"
                  value={oxSearchQuery}
                  onChange={(e) => setOxSearchQuery(e.target.value)}
                  placeholder="🔍 조문 번호(예: 제41조), 법령명, 키워드로 오답 지문 검색..."
                  className="w-full bg-[#121216] border border-white/15 text-xs text-white px-3 py-1.5 rounded-sm outline-none focus:border-teal-500"
                />
                {oxSearchQuery && (
                  <button
                    onClick={() => setOxSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 선택 삭제 모드 컨트롤 바 */}
          {isOxDeleteMode && (
            <div className="flex flex-wrap justify-between items-center gap-2 bg-red-950/30 border border-red-500/40 px-4 py-2.5 rounded-sm">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-red-300">
                  🗑️ 삭제할 문제를 체크하세요 ({selectedOxIds.size}개 선택됨)
                </span>
                {filteredOxQuestions.length > 0 && (
                  <button
                    onClick={handleToggleSelectAllFiltered}
                    className="px-2.5 py-1 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-500/40 text-amber-300 text-[11px] font-bold rounded-sm"
                  >
                    현재 목록 전체 선택/해제
                  </button>
                )}
              </div>
              <button
                onClick={handleDeleteSelectedOxQuestions}
                disabled={selectedOxIds.size === 0}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-30 text-white text-xs font-bold rounded-sm shadow-md transition-all"
              >
                선택한 {selectedOxIds.size}개 문제 일괄 삭제
              </button>
            </div>
          )}

          {/* 문제 리스트 */}
          {filteredOxQuestions.length === 0 ? (
            <div className="py-16 text-center text-white/40 space-y-3">
              <div className="text-3xl">🎉</div>
              <p className="text-sm font-bold">조건에 해당하는 문제가 없습니다.</p>
              {(oxFilterWrongOnly || oxSearchQuery || oxCategory !== '전체') && (
                <button
                  onClick={() => {
                    setOxFilterWrongOnly(false);
                    setOxSearchQuery('');
                    setOxCategory('전체');
                    setOxSubCategory('전체');
                  }}
                  className="mt-2 px-4 py-2 bg-teal-900/40 border border-teal-500/40 text-teal-300 text-xs font-bold rounded-sm"
                >
                  필터 초기화 및 전체 문제 보기
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-white/10 border-t border-white/10">
              {filteredOxQuestions.map((q, idx) => {
                const userChoice = oxUserChoices[q.id];
                const isAnswered = userChoice !== undefined;
                const isTouchRevealed = revealedTouchIds.has(q.id);
                const showDetailBox = isAnswered || isTouchRevealed;
                const isCorrect = isAnswered ? userChoice === q.answer : true;
                const isSelectedForDelete = selectedOxIds.has(q.id);

                return (
                  <div
                    key={q.id}
                    className={`py-3 px-2 sm:px-3 transition-colors ${
                      isOxDeleteMode && isSelectedForDelete
                        ? 'bg-red-950/30'
                        : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    {/* 1줄: [체크박스(삭제모드)] + 번호 + 카테고리 + 문제 지문(틀린부분 터치 타겟) + [정답확인/O/X 버튼] */}
                    <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-4">
                      <div
                        className={`flex items-start sm:items-center gap-2 flex-1 min-w-0 ${
                          isOxDeleteMode ? 'cursor-pointer select-none' : ''
                        }`}
                        onClick={() => {
                          if (isOxDeleteMode) toggleSelectOxForDelete(q.id);
                        }}
                      >
                        {isOxDeleteMode && (
                          <input
                            type="checkbox"
                            checked={isSelectedForDelete}
                            onChange={() => toggleSelectOxForDelete(q.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 sm:mt-0 w-4 h-4 accent-red-500 shrink-0 cursor-pointer"
                          />
                        )}
                        <span className="font-mono text-xs font-bold text-white/40 shrink-0 mt-0.5 sm:mt-0">
                          {String(idx + 1).padStart(2, '0')}.
                        </span>
                        {q.category && (
                          <span className="px-1.5 py-0.5 bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold rounded-sm shrink-0 mt-0.5 sm:mt-0">
                            {q.category}
                          </span>
                        )}
                        <div className="text-xs sm:text-sm md:text-[15px] text-white/90 leading-relaxed break-keep flex-1">
                          {renderQuestionWithTouchableWrongParts(q, isTouchRevealed)}
                        </div>
                      </div>

                      {/* 우측: [정답토글] + [O] + [X] + [개별삭제] 버튼 */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={(e) => handleToggleTouchReveal(q.id, e)}
                          title="터치하여 정답·해설 토글"
                          className={`px-2 h-8 sm:h-9 rounded-sm font-bold text-[11px] border transition-all flex items-center justify-center active:scale-95 ${
                            isTouchRevealed
                              ? 'bg-amber-600 text-white border-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                              : 'bg-amber-950/30 border-amber-500/40 text-amber-300 hover:bg-amber-900/50'
                          }`}
                        >
                          {isTouchRevealed ? '정답숨김' : '👆정답'}
                        </button>
                        <button
                          onClick={() => handleSelectOxRow(q, 'O')}
                          className={`w-8 h-8 sm:w-9 sm:h-9 rounded-sm font-bold text-xs sm:text-sm border transition-all flex items-center justify-center active:scale-95 ${
                            userChoice === 'O'
                              ? q.answer === 'O'
                                ? 'bg-teal-600 text-white border-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.5)]'
                                : 'bg-red-600 text-white border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                              : 'bg-teal-950/30 border-teal-500/40 text-teal-300 hover:bg-teal-900/50'
                          }`}
                        >
                          O
                        </button>
                        <button
                          onClick={() => handleSelectOxRow(q, 'X')}
                          className={`w-8 h-8 sm:w-9 sm:h-9 rounded-sm font-bold text-xs sm:text-sm border transition-all flex items-center justify-center active:scale-95 ${
                            userChoice === 'X'
                              ? q.answer === 'X'
                                ? 'bg-teal-600 text-white border-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.5)]'
                                : 'bg-red-600 text-white border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                              : 'bg-red-950/30 border-red-500/40 text-red-300 hover:bg-red-900/50'
                          }`}
                        >
                          X
                        </button>
                        <button
                          onClick={() => handleDeleteSingleOx(q.id)}
                          title="이 문제 삭제"
                          className="w-7 h-8 sm:h-9 rounded-sm text-white/25 hover:text-red-400 hover:bg-red-950/30 text-xs flex items-center justify-center transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* 2줄: 틀린 부분을 터치했거나 O/X 버튼을 눌렀을 때 아래에 펼쳐지는 상세 정답 및 해설 */}
                    {showDetailBox && (
                      <div
                        onClick={(e) => handleToggleTouchReveal(q.id, e)}
                        className={`mt-2.5 ml-6 sm:ml-8 p-2.5 sm:p-3 rounded-sm border text-xs sm:text-sm cursor-pointer animate-in fade-in duration-150 ${
                          isAnswered
                            ? isCorrect
                              ? 'bg-teal-950/30 border-teal-500/40 text-teal-200'
                              : 'bg-red-950/30 border-red-500/40 text-red-200'
                            : 'bg-amber-950/25 border-amber-500/40 text-amber-100'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2 font-bold mb-1">
                          {isAnswered ? (
                            <span className={isCorrect ? 'text-teal-400' : 'text-red-400'}>
                              {isCorrect ? '⭕ 정답입니다!' : '❌ 오답입니다!'}
                            </span>
                          ) : (
                            <span className="text-amber-300">💡 오답 수정 · 정답 확인</span>
                          )}
                          <span className="text-white/70 font-mono text-xs">
                            (정답: <b className="text-amber-300">{q.answer}</b>)
                          </span>
                          {q.correctAnswer && (
                            <span className="px-2 py-0.5 bg-teal-900/60 border border-teal-400/40 text-teal-200 text-xs rounded-sm">
                              바른 표현: {q.correctAnswer}
                            </span>
                          )}
                        </div>
                        {q.explanation && (
                          <p className="text-white/85 leading-relaxed whitespace-pre-wrap text-xs sm:text-[13px]">
                            {q.explanation}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          모드 B: 📄 PDF 실전 모의고사 뷰어 및 OMR
      ========================================================================= */}
      {examMode === 'pdf' && (
        <div className="flex flex-col lg:flex-row gap-6 w-full h-[80vh]">
          
          {/* 좌측: PDF 뷰어 및 펜 필기 영역 */}
          <div className="flex flex-col flex-[3] bg-[#0a0a0c] border border-white/10 rounded-sm shadow-xl overflow-hidden relative">
            <div className="flex justify-between items-center p-3 border-b border-white/10 bg-black/40 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="text-white/80 font-bold text-sm tracking-widest">📝 실전 모의고사 뷰어</span>
                {systemLog && <span className="text-[10px] text-teal-400 font-mono animate-pulse">{systemLog}</span>}
              </div>
              <div className="flex gap-2 items-center flex-wrap">
                 <label className="cursor-pointer bg-white/10 hover:bg-white/20 text-white text-[10px] px-3 py-1.5 rounded-sm transition-colors border border-white/5 font-bold">
                   📂 문제지 PDF 열기
                   <input ref={examFileInputRef} type="file" accept=".pdf" className="hidden" onChange={e => setExamFile(e.target.files?.[0] || null)} />
                 </label>
                 {examFile && (
                   <button
                     onClick={handleDeleteExamFile}
                     className="bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-500/40 text-[10px] px-3 py-1.5 rounded-sm transition-colors font-bold"
                   >
                     🗑️ 문제지 삭제
                   </button>
                 )}
                 <button
                   onClick={() => {
                     if (window.confirm("현재 페이지의 펜 필기를 지우시겠습니까?")) {
                       setLines(prev => ({ ...prev, [pageNumber]: [] }));
                     }
                   }}
                   className="bg-amber-900/30 hover:bg-amber-900/50 text-amber-300 border border-amber-500/30 text-[10px] px-3 py-1.5 rounded-sm transition-colors"
                 >
                   ✏️ 현재 장 필기 지우기
                 </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-[#1a1a1f] relative flex justify-center p-4 custom-scrollbar">
              {!examFile ? (
                <div className="flex flex-col items-center justify-center h-full text-white/30 space-y-4">
                  <span className="text-4xl">📄</span>
                  <p className="text-sm font-serif">상단의 [문제지 PDF 열기] 버튼을 눌러 모의고사 파일을 불러오세요.</p>
                </div>
              ) : (
                <div className="relative inline-block shadow-2xl">
                  <Document file={examFile} onLoadSuccess={onDocumentLoadSuccess} className="pointer-events-none">
                    <Page 
                      pageNumber={pageNumber} 
                      renderTextLayer={false} 
                      renderAnnotationLayer={false}
                      width={800} 
                      onLoadSuccess={onPageLoadSuccess}
                      onRenderSuccess={drawLines}
                    />
                  </Document>

                  <canvas
                    ref={canvasRef}
                    width={pageDim.w}
                    height={pageDim.h}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    className="absolute top-0 left-0 w-full h-full cursor-crosshair touch-none"
                    style={{ zIndex: 10 }}
                  />
                </div>
              )}
            </div>

            {numPages && (
              <div className="flex justify-center items-center gap-4 p-3 bg-black/40 border-t border-white/10 shrink-0">
                <button 
                  onClick={() => setPageNumber(p => Math.max(1, p - 1))} 
                  disabled={pageNumber <= 1}
                  className="px-4 py-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-30 rounded-sm text-xs font-bold"
                >
                  ◀ 이전 장
                </button>
                <span className="text-xs text-white/60 font-mono font-bold tracking-widest">
                  {pageNumber} / {numPages}
                </span>
                <button 
                  onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} 
                  disabled={pageNumber >= numPages}
                  className="px-4 py-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-30 rounded-sm text-xs font-bold"
                >
                  다음 장 ▶
                </button>
              </div>
            )}
          </div>

          {/* 우측: OMR 답안지 영역 */}
          <div className="flex flex-col flex-1 min-w-[280px] bg-[#0a0a0c] border border-white/10 rounded-sm shadow-xl overflow-hidden h-full">
            <div className="p-4 border-b border-white/10 bg-indigo-950/20">
              <div className="flex justify-between items-center mb-4">
                 <h2 className="text-base font-bold tracking-widest text-indigo-300">OMR 답안지</h2>
                 <div className="flex items-center gap-2">
                   <span className="text-[10px] text-white/50">문항 수:</span>
                   <select 
                     value={questionCount} 
                     onChange={e => setQuestionCount(Number(e.target.value))}
                     className="bg-black border border-white/20 text-xs text-white p-1 rounded outline-none"
                     disabled={score !== null}
                   >
                     <option value={20}>20문제</option>
                     <option value={40}>40문제</option>
                     <option value={50}>50문제</option>
                     <option value={80}>80문제</option>
                     <option value={100}>100문제</option>
                   </select>
                 </div>
              </div>

              {score ? (
                <div className="bg-teal-900/30 border border-teal-500/50 p-4 rounded-sm text-center space-y-2">
                  <div className="text-[10px] text-teal-400 font-bold">최종 채점 결과</div>
                  <div className="text-3xl font-mono font-bold text-white">
                    {score.correct} <span className="text-lg text-white/40">/ {score.total}</span>
                  </div>
                  <div className="text-xs text-teal-300">({Math.round((score.correct / score.total) * 100)}점)</div>
                  <button
                    onClick={handleDeleteAnswerFile}
                    className="mt-2 w-full py-1.5 bg-red-950/60 hover:bg-red-900/80 border border-red-500/40 text-red-300 text-[11px] font-bold rounded-sm transition-colors"
                  >
                    🗑️ 채점결과 삭제 및 다시 풀기
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                   <div className="flex gap-1.5">
                     <label className="flex-1 cursor-pointer text-center bg-indigo-900/40 hover:bg-indigo-900/60 border border-indigo-500/30 text-indigo-300 text-[11px] font-bold py-2 px-2 rounded-sm transition-colors shadow-sm truncate">
                       {answerFile ? `✅ ${answerFile.name}` : "📥 정답지 PDF 업로드"}
                       <input ref={answerFileInputRef} type="file" accept=".pdf" className="hidden" onChange={e => setAnswerFile(e.target.files?.[0] || null)} />
                     </label>
                     {answerFile && (
                       <button
                         onClick={handleDeleteAnswerFile}
                         className="px-2.5 bg-red-950/60 hover:bg-red-900/80 border border-red-500/40 text-red-300 text-xs font-bold rounded-sm shrink-0"
                         title="정답지 삭제"
                       >
                         🗑️
                       </button>
                     )}
                   </div>
                   <button 
                     onClick={handleGradeExam}
                     disabled={isGrading || !answerFile}
                     className={`w-full py-3 text-xs font-bold rounded-sm transition-all shadow-md ${isGrading ? 'bg-white/10 text-white/30' : 'bg-teal-600 text-white hover:bg-teal-500'}`}
                   >
                     {isGrading ? "AI 자동 채점 진행 중..." : "🚀 자동 채점 시작"}
                   </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 bg-black/20">
              <div className="space-y-2 pb-10">
                {Array.from({ length: questionCount }).map((_, idx) => {
                  const qNum = idx + 1;
                  const isCorrect = correctAnswers && userAnswers[qNum] === parseInt(correctAnswers[String(qNum)] as any);
                  const isWrong = correctAnswers && userAnswers[qNum] !== parseInt(correctAnswers[String(qNum)] as any);

                  return (
                    <div key={qNum} className={`flex items-center gap-3 p-2 rounded-sm border ${isCorrect ? 'bg-teal-950/20 border-teal-500/30' : isWrong ? 'bg-red-950/20 border-red-500/30' : 'bg-white/5 border-transparent hover:border-white/10'}`}>
                      <div className="w-6 text-right font-mono text-[11px] font-bold text-white/60 shrink-0">
                        {String(qNum).padStart(2, '0')}.
                      </div>
                      
                      <div className="flex gap-1.5 flex-1 justify-center">
                        {[1, 2, 3, 4, 5].map(opt => (
                          <button
                            key={opt}
                            onClick={() => handleAnswerSelect(qNum, opt)}
                            className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full text-[10px] font-bold border transition-all flex items-center justify-center shrink-0 ${
                              userAnswers[qNum] === opt 
                                ? 'bg-indigo-500 border-indigo-400 text-white shadow-[0_0_8px_rgba(99,102,241,0.6)]' 
                                : 'bg-black/50 border-white/20 text-white/40 hover:border-indigo-500/50'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>

                      {correctAnswers && (
                        <div className="w-10 flex items-center justify-center shrink-0 border-l border-white/10 pl-2">
                          {isCorrect ? (
                            <span className="text-teal-400 font-bold text-sm">✅</span>
                          ) : (
                            <div className="flex flex-col items-center">
                              <span className="text-red-400 font-bold text-[10px]">❌</span>
                              <span className="text-[9px] text-white/60 font-mono mt-0.5">답:{correctAnswers[String(qNum)] || '?'}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
