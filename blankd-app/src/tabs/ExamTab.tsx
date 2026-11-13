import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

export interface ExamQuestionItem {
  id: number;
  category: string;
  subCategory?: string;
  folder?: string;
  question: string;
  answer: string; // 'O' | 'X' | calculation answer
  correctAnswer: string;
  explanation: string;
  source?: string;
}

export interface ExamTabProps {
  walletAddress?: string;
  address?: string;
}

interface BoxSubItem {
  label: string; // 가, 나, 다, 라, 마, 바, 사
  originItem: ExamQuestionItem;
  displayQuestion: string;
  effectiveAnswer: 'O' | 'X';
  shortCorrection: string;
  isSynthesizedTrue: boolean;
}

interface GeneratedBoxQuestion {
  id: string;
  boxNo: number;
  targetType: 'WRONG_COUNT' | 'CORRECT_COUNT'; // 틀린 개수 vs 맞는 개수
  subItems: BoxSubItem[];
  correctCount: number;
  choices: number[]; // 4지선다 보기 (예: [2, 3, 4, 5])
}

interface EditDraft {
  question: string;
  answer: string;
  correctAnswer: string;
  explanation: string;
  category: string;
  subCategory: string;
}

const DEFAULT_CATEGORIES = [
  '법령 1장 총칙',
  '법령 2장 가입자',
  '법령 3장 공단',
  '법령 4장 보험급여',
  '법령 5장 심평원',
  '법령 6장 보험료',
  '법령 7장 이의신청',
  '법령 8장 보칙',
  '법령 9장 벌칙',
  '정관',
  '인사규정',
  '직제규정',
  '사무관리규정',
  '계산문제',
];

const KOR_LABELS = ['가', '나', '다', '라', '마', '바', '사'];
const CIRCLED_NUMS = ['①', '②', '③', '④'];

const QUESTION_STORAGE_KEYS = [
  'blankd_exam_questions_v3',
  'blankd_exam_questions_v2',
  'blankd_exam_questions_v1',
  'blankd_exam_questions',
  'blankd_exam_items',
  'exam_questions',
];

const FOLDER_STORAGE_KEYS = [
  'blankd_exam_custom_folders_v1',
  'blankd_exam_custom_folders',
  'blankd_exam_folders',
  'exam_folders',
];

const PRIMARY_QUESTION_KEY = 'blankd_exam_questions_v3';
const PRIMARY_FOLDER_KEY = 'blankd_exam_custom_folders_v1';

/**
 * X 지문의 correctAnswer("잘못된표현(X) → 바른표현")를 분석하여
 * 실전 박스형 문제에서 정답 개수가 0~N개로 다양하게 분포하도록
 * 현행 법령 기준 옳은(O) 지문으로 자연스럽게 치환하는 헬퍼 함수
 */
function trySynthesizeTrueStatement(item: ExamQuestionItem): {
  success: boolean;
  text: string;
  note: string;
} {
  if (item.answer === 'O') {
    return {
      success: true,
      text: item.question,
      note: item.correctAnswer || '옳은 지문 (원문 그대로 출제)',
    };
  }

  if (item.question.includes('\n(1)') || item.question.includes('(1)')) {
    return { success: false, text: item.question, note: item.correctAnswer };
  }

  const ca = (item.correctAnswer || '').trim();
  const arrowMatch = ca.match(/^([^→/]+?)(?:\(X\))?\s*→\s*([^(/]+)/);
  if (arrowMatch) {
    const wrongPart = arrowMatch[1].trim().replace(/^['"‘“]|['"’”]$/g, '');
    let rightPart = arrowMatch[2].trim().replace(/^['"‘“]|['"’”]$/g, '');
    rightPart = rightPart.replace(/\s*(?:임|으로\s*틀림|이므로\s*틀림).*$/, '').trim();

    if (
      wrongPart.length >= 2 &&
      wrongPart.length <= 28 &&
      rightPart.length >= 2 &&
      rightPart.length <= 40 &&
      !wrongPart.includes('·') &&
      item.question.includes(wrongPart)
    ) {
      const replaced = item.question.replace(wrongPart, rightPart);
      if (replaced !== item.question) {
        return {
          success: true,
          text: replaced,
          note: `옳은 지문 ('${wrongPart}' → '${rightPart}' 바른 표현 반영)`,
        };
      }
    }
  }

  return { success: false, text: item.question, note: item.correctAnswer };
}

export const ExamTab: React.FC<ExamTabProps> = () => {
  const [questions, setQuestions] = useState<ExamQuestionItem[]>([]);
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('전체');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('전체');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 화면 모드: 'single'(한 페이지 1문장 단문 시험모드) | 'box'(박스형 시험모드)
  const [viewMode, setViewMode] = useState<'single' | 'box'>('single');

  // 상단 메뉴(필터/검색/단축키/JSON 관리) 열림 상태 — 평소에는 숨겨서 화면을 깔끔하게 유지
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [showShortcutModal, setShowShortcutModal] = useState<boolean>(false);

  // 단문 1문항 페이지 인덱스 (좌/우 이동)
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [jumpInput, setJumpInput] = useState<string>('');

  // 단문 모드 상태: 해답 표시 여부, 사용자 O/X 선택 기록
  const [revealedAnswers, setRevealedAnswers] = useState<Record<number, boolean>>({});
  const [userGuesses, setUserGuesses] = useState<Record<number, 'O' | 'X'>>({});
  const [showMetaInfo, setShowMetaInfo] = useState<boolean>(false);

  // 해답/내용 인라인 수정 상태
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>({
    question: '',
    answer: 'X',
    correctAnswer: '',
    explanation: '',
    category: '',
    subCategory: '',
  });

  // 폴더 추가 상태
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [isAddingFolder, setIsAddingFolder] = useState<boolean>(false);

  // ==========================================
  // 박스형 시험모드 상태 (한 페이지 1박스씩 좌우 넘기기)
  // ==========================================
  const [boxSizeSetting, setBoxSizeSetting] = useState<number | 'random'>(5);
  const [boxTargetSetting, setBoxTargetSetting] = useState<'WRONG_COUNT' | 'CORRECT_COUNT' | 'RANDOM'>('WRONG_COUNT');
  const [autoMixTrueStatements, setAutoMixTrueStatements] = useState<boolean>(true);

  const [boxList, setBoxList] = useState<GeneratedBoxQuestion[]>([]);
  const [currentBoxIdx, setCurrentBoxIdx] = useState<number>(0);
  const [focusedSubIdx, setFocusedSubIdx] = useState<number>(0);
  // key: `${boxId}-${subIdx}` -> 'O' | 'X' | null
  const [userMarks, setUserMarks] = useState<Record<string, 'O' | 'X' | null>>({});
  // key: boxId -> selected choice number
  const [selectedChoices, setSelectedChoices] = useState<Record<string, number>>({});
  // key: boxId -> boolean (해답/해설 표시 토글)
  const [boxShowExplanation, setBoxShowExplanation] = useState<Record<string, boolean>>({});

  // 터치 스와이프(태블릿/모바일 좌우 넘기기) 좌표 기록
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  // 초기 로드 (기존 모든 버전의 localStorage 키 호환)
  useEffect(() => {
    try {
      for (const key of QUESTION_STORAGE_KEYS) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setQuestions(parsed);
            localStorage.setItem(PRIMARY_QUESTION_KEY, JSON.stringify(parsed));
            break;
          }
        }
      }
      for (const fKey of FOLDER_STORAGE_KEYS) {
        const rawF = localStorage.getItem(fKey);
        if (rawF) {
          const parsedF = JSON.parse(rawF);
          if (Array.isArray(parsedF) && parsedF.length > 0) {
            setCustomFolders(parsedF);
            localStorage.setItem(PRIMARY_FOLDER_KEY, JSON.stringify(parsedF));
            break;
          }
        }
      }
    } catch (e) {
      console.error('Failed to load ExamTab data from localStorage:', e);
    }
  }, []);

  const saveQuestions = useCallback((nextQuestions: ExamQuestionItem[]) => {
    setQuestions(nextQuestions);
    try {
      const serialized = JSON.stringify(nextQuestions);
      localStorage.setItem(PRIMARY_QUESTION_KEY, serialized);
      QUESTION_STORAGE_KEYS.forEach((key) => {
        if (key !== PRIMARY_QUESTION_KEY && localStorage.getItem(key) !== null) {
          localStorage.setItem(key, serialized);
        }
      });
    } catch (e) {
      console.error('Failed to save questions:', e);
    }
  }, []);

  const saveCustomFolders = useCallback((nextFolders: string[]) => {
    setCustomFolders(nextFolders);
    try {
      localStorage.setItem(PRIMARY_FOLDER_KEY, JSON.stringify(nextFolders));
    } catch (e) {
      console.error('Failed to save custom folders:', e);
    }
  }, []);

  // JSON 파일 업로드 (병합 및 중복 제거)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = JSON.parse(content);
          const incomingList: any[] = Array.isArray(parsed)
            ? parsed
            : parsed.questions || parsed.items || [];

          setQuestions((prev) => {
            const existingMap = new Map<string, ExamQuestionItem>();
            prev.forEach((q) => {
              const key = q.question.replace(/\s+/g, '');
              existingMap.set(key, q);
            });

            let maxId = prev.reduce((max, q) => Math.max(max, q.id || 0), 0);

            incomingList.forEach((raw) => {
              const qText = (raw.question || '').trim();
              if (!qText) return;
              const normKey = qText.replace(/\s+/g, '');
              maxId += 1;
              const item: ExamQuestionItem = {
                id: raw.id || maxId,
                category: raw.category || '모의고사/기타',
                subCategory: raw.subCategory || '',
                folder: raw.folder || '',
                question: qText,
                answer: raw.answer || 'X',
                correctAnswer: raw.correctAnswer || raw.explanation || '',
                explanation: raw.explanation || raw.correctAnswer || '',
                source: raw.source || '',
              };
              existingMap.set(normKey, item);
            });

            const merged = Array.from(existingMap.values()).map((item, idx) => ({
              ...item,
              id: idx + 1,
            }));
            localStorage.setItem(PRIMARY_QUESTION_KEY, JSON.stringify(merged));
            return merged;
          });
        } catch (err) {
          alert(`파일 파싱 오류가 발생했습니다: ${file.name}`);
        }
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  };

  // 수정된 문제집 JSON 파일로 내보내기
  const handleExportJson = () => {
    if (questions.length === 0) {
      alert('내보낼 문항이 없습니다.');
      return;
    }
    try {
      const dataStr = JSON.stringify(questions, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `국민건강보험공단_법령_정관규정_오답정리_수정본_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export JSON:', e);
    }
  };

  // 전체 카테고리 목록
  const allCategories = useMemo(() => {
    const dynamicCats = new Set<string>(DEFAULT_CATEGORIES);
    questions.forEach((q) => {
      if (q.category) dynamicCats.add(q.category);
      if (q.folder) dynamicCats.add(q.folder);
    });
    customFolders.forEach((f) => dynamicCats.add(f));
    return ['전체', ...Array.from(dynamicCats)];
  }, [questions, customFolders]);

  // 현재 선택된 카테고리의 세부 분류(subCategory) 목록
  const subCategories = useMemo(() => {
    if (selectedCategory === '전체') return [];
    const subs = new Set<string>();
    questions.forEach((q) => {
      const matchCat = q.category === selectedCategory || q.folder === selectedCategory;
      if (matchCat && q.subCategory) {
        subs.add(q.subCategory);
      }
    });
    return Array.from(subs).sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
  }, [questions, selectedCategory]);

  useEffect(() => {
    setSelectedSubCategory('전체');
  }, [selectedCategory]);

  // 필터링된 문항 목록
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const matchCat =
        selectedCategory === '전체' ||
        q.category === selectedCategory ||
        q.folder === selectedCategory;
      if (!matchCat) return false;

      const matchSub =
        selectedSubCategory === '전체' || q.subCategory === selectedSubCategory;
      if (!matchSub) return false;

      if (searchQuery.trim()) {
        const kw = searchQuery.trim().toLowerCase();
        const inQ = q.question.toLowerCase().includes(kw);
        const inCA = (q.correctAnswer || '').toLowerCase().includes(kw);
        const inExp = (q.explanation || '').toLowerCase().includes(kw);
        return inQ || inCA || inExp;
      }
      return true;
    });
  }, [questions, selectedCategory, selectedSubCategory, searchQuery]);

  // 필터 변경 시 첫 문제로 이동
  useEffect(() => {
    setCurrentIndex(0);
    setEditingId(null);
  }, [selectedCategory, selectedSubCategory, searchQuery]);

  // currentIndex 범위 보정
  const safeCurrentIndex = useMemo(() => {
    if (filteredQuestions.length === 0) return 0;
    return Math.min(Math.max(0, currentIndex), filteredQuestions.length - 1);
  }, [currentIndex, filteredQuestions.length]);

  const currentQuestion = filteredQuestions[safeCurrentIndex] || null;

  // ==========================================
  // 박스형 문제 생성 함수 (20세트씩 생성하여 좌우로 넘기며 풀이)
  // ==========================================
  const generateBoxQuestions = useCallback(() => {
    const singleLinePool = filteredQuestions.filter(
      (q) => !q.question.includes('\n(1)') && (q.answer === 'O' || q.answer === 'X')
    );
    const pool = singleLinePool.length >= 5 ? singleLinePool : filteredQuestions;

    if (pool.length === 0) {
      setBoxList([]);
      return;
    }

    const batchSize = Math.max(10, Math.ceil(pool.length / 5));
    const generated: GeneratedBoxQuestion[] = [];
    const shuffledMaster = [...pool].sort(() => Math.random() - 0.5);
    let cursor = 0;

    for (let bIdx = 0; bIdx < batchSize; bIdx++) {
      const count =
        boxSizeSetting === 'random'
          ? [5, 6, 7][Math.floor(Math.random() * 3)]
          : boxSizeSetting;
      const actualCount = Math.min(count, pool.length, 7);

      const picked: ExamQuestionItem[] = [];
      for (let i = 0; i < actualCount; i++) {
        picked.push(shuffledMaster[(cursor + i) % shuffledMaster.length]);
      }
      cursor += actualCount;

      const targetType: 'WRONG_COUNT' | 'CORRECT_COUNT' =
        boxTargetSetting === 'RANDOM'
          ? Math.random() < 0.7
            ? 'WRONG_COUNT'
            : 'CORRECT_COUNT'
          : boxTargetSetting;

      const subItems: BoxSubItem[] = picked.map((item, idx) => {
        const label = KOR_LABELS[idx] || String(idx + 1);
        if (item.answer === 'O') {
          return {
            label,
            originItem: item,
            displayQuestion: item.question,
            effectiveAnswer: 'O',
            shortCorrection: item.correctAnswer || '옳은 지문입니다.',
            isSynthesizedTrue: false,
          };
        }

        if (autoMixTrueStatements && Math.random() < 0.45) {
          const syn = trySynthesizeTrueStatement(item);
          if (syn.success) {
            return {
              label,
              originItem: item,
              displayQuestion: syn.text,
              effectiveAnswer: 'O',
              shortCorrection: syn.note,
              isSynthesizedTrue: true,
            };
          }
        }

        return {
          label,
          originItem: item,
          displayQuestion: item.question,
          effectiveAnswer: 'X',
          shortCorrection: item.correctAnswer,
          isSynthesizedTrue: false,
        };
      });

      const wrongCount = subItems.filter((s) => s.effectiveAnswer === 'X').length;
      const rightCount = subItems.filter((s) => s.effectiveAnswer === 'O').length;
      const answerNum = targetType === 'WRONG_COUNT' ? wrongCount : rightCount;

      let startNum = Math.max(0, answerNum - Math.floor(Math.random() * 3));
      if (startNum + 3 > actualCount) {
        startNum = Math.max(0, actualCount - 3);
      }
      const choices: number[] = [];
      for (let i = 0; i < 4; i++) {
        if (startNum + i <= actualCount) {
          choices.push(startNum + i);
        }
      }
      if (!choices.includes(answerNum)) {
        choices[0] = answerNum;
        choices.sort((a, b) => a - b);
      }

      generated.push({
        id: `box-${Date.now()}-${bIdx}-${Math.random().toString(36).slice(2, 7)}`,
        boxNo: bIdx + 1,
        targetType,
        subItems,
        correctCount: answerNum,
        choices,
      });
    }

    setBoxList(generated);
    setCurrentBoxIdx(0);
    setFocusedSubIdx(0);
    setUserMarks({});
    setSelectedChoices({});
    setBoxShowExplanation({});
  }, [filteredQuestions, boxSizeSetting, boxTargetSetting, autoMixTrueStatements]);

  useEffect(() => {
    if (viewMode === 'box') {
      generateBoxQuestions();
    }
  }, [viewMode, selectedCategory, selectedSubCategory, boxSizeSetting, boxTargetSetting]);

  // ==========================================
  // 단문 이동 및 조작 함수
  // ==========================================
  const goPrevQuestion = useCallback(() => {
    setEditingId(null);
    if (viewMode === 'single') {
      setCurrentIndex((prev) => Math.max(0, prev - 1));
    } else {
      setCurrentBoxIdx((prev) => Math.max(0, prev - 1));
      setFocusedSubIdx(0);
    }
  }, [viewMode]);

  const goNextQuestion = useCallback(() => {
    setEditingId(null);
    if (viewMode === 'single') {
      setCurrentIndex((prev) =>
        filteredQuestions.length > 0
          ? Math.min(filteredQuestions.length - 1, prev + 1)
          : 0
      );
    } else {
      setCurrentBoxIdx((prev) =>
        boxList.length > 0 ? Math.min(boxList.length - 1, prev + 1) : 0
      );
      setFocusedSubIdx(0);
    }
  }, [viewMode, filteredQuestions.length, boxList.length]);

  // 단문 해답 토글
  const toggleRevealAnswer = useCallback((id: number) => {
    setRevealedAnswers((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // 단문 O / X 선택 (선택 시 하단에 해답 표시)
  const handleSelectSingleOx = useCallback((id: number, choice: 'O' | 'X') => {
    setUserGuesses((prev) => ({ ...prev, [id]: choice }));
    setRevealedAnswers((prev) => ({ ...prev, [id]: true }));
  }, []);

  // 단문 해답/내용 수정 시작
  const handleStartEdit = useCallback((item: ExamQuestionItem) => {
    setEditingId(item.id);
    setEditDraft({
      question: item.question || '',
      answer: item.answer || 'X',
      correctAnswer: item.correctAnswer || '',
      explanation: item.explanation || item.correctAnswer || '',
      category: item.category || '',
      subCategory: item.subCategory || '',
    });
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleSaveEdit = (id: number) => {
    const trimmedQuestion = editDraft.question.trim();
    const trimmedCorrectAnswer = editDraft.correctAnswer.trim();
    const trimmedAnswer = editDraft.answer.trim() || 'X';
    const trimmedExplanation = editDraft.explanation.trim() || trimmedCorrectAnswer;
    const trimmedCategory = editDraft.category.trim();
    const trimmedSubCategory = editDraft.subCategory.trim();

    if (!trimmedQuestion) {
      alert('문제 지문을 입력해 주세요.');
      return;
    }

    const nextQuestions = questions.map((q) => {
      if (q.id !== id) return q;
      const shouldSyncExp =
        !q.explanation ||
        q.explanation === q.correctAnswer ||
        editDraft.explanation === q.explanation;

      return {
        ...q,
        question: trimmedQuestion,
        answer: trimmedAnswer,
        correctAnswer: trimmedCorrectAnswer,
        explanation:
          editDraft.explanation.trim() && editDraft.explanation !== q.explanation
            ? trimmedExplanation
            : shouldSyncExp
            ? trimmedCorrectAnswer
            : trimmedExplanation,
        category: trimmedCategory || q.category,
        subCategory: trimmedSubCategory,
      };
    });

    saveQuestions(nextQuestions);
    setRevealedAnswers((prev) => ({ ...prev, [id]: true }));
    setEditingId(null);
  };

  // 개별 문항 삭제
  const handleDeleteQuestion = (id: number) => {
    if (!window.confirm('이 문항을 삭제하시겠습니까?')) return;
    if (editingId === id) setEditingId(null);
    const next = questions.filter((q) => q.id !== id);
    saveQuestions(next);
  };

  // 번호 직접 이동
  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(jumpInput, 10);
    if (!isNaN(num) && num >= 1 && num <= filteredQuestions.length) {
      setCurrentIndex(num - 1);
      setJumpInput('');
    }
  };

  // 새 폴더 생성
  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    if (!customFolders.includes(trimmed)) {
      saveCustomFolders([...customFolders, trimmed]);
    }
    setNewFolderName('');
    setIsAddingFolder(false);
    setSelectedCategory(trimmed);
  };

  // 박스형 지문 마킹 (O / X)
  const toggleUserMark = useCallback(
    (boxId: string, subIdx: number, mark: 'O' | 'X') => {
      if (selectedChoices[boxId] !== undefined) return;
      const key = `${boxId}-${subIdx}`;
      setUserMarks((prev) => ({
        ...prev,
        [key]: prev[key] === mark ? null : mark,
      }));
    },
    [selectedChoices]
  );

  // 박스형 객관식 보기 선택 (채점)
  const handleSelectBoxChoice = useCallback(
    (box: GeneratedBoxQuestion, choiceNum: number) => {
      setSelectedChoices((prev) => ({ ...prev, [box.id]: choiceNum }));
      setBoxShowExplanation((prev) => ({ ...prev, [box.id]: true }));
    },
    []
  );

  // ==========================================
  // 전역 키보드 단축키 핸들러 (좌우 넘기기 & 즉시 풀이)
  // ==========================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (editingId !== null || isAddingFolder) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key;

      // 공통: F키로 메뉴 열기/닫기, ?키로 단축키 안내
      if (key === 'f' || key === 'F') {
        e.preventDefault();
        setIsMenuOpen((prev) => !prev);
        return;
      }
      if (key === '?' || key === '/') {
        e.preventDefault();
        setShowShortcutModal((prev) => !prev);
        return;
      }

      // 1) 단문 시험모드 (1페이지 1문항)
      if (viewMode === 'single') {
        if (!currentQuestion) return;

        if (key === 'ArrowRight' || key === 'd' || key === 'D' || key === 'j' || key === 'J') {
          e.preventDefault();
          goNextQuestion();
        } else if (key === 'ArrowLeft' || key === 'a' || key === 'A' || key === 'k' || key === 'K') {
          e.preventDefault();
          goPrevQuestion();
        } else if (key === ' ' || key === 'Enter' || key === 'e' || key === 'E') {
          e.preventDefault();
          toggleRevealAnswer(currentQuestion.id);
        } else if (key === 'o' || key === 'O' || key === '1') {
          e.preventDefault();
          handleSelectSingleOx(currentQuestion.id, 'O');
        } else if (key === 'x' || key === 'X' || key === '2') {
          e.preventDefault();
          handleSelectSingleOx(currentQuestion.id, 'X');
        } else if (key === 'm' || key === 'M' || key === 'u' || key === 'U') {
          e.preventDefault();
          handleStartEdit(currentQuestion);
        } else if (key === 'i' || key === 'I') {
          e.preventDefault();
          setShowMetaInfo((prev) => !prev);
        }
        return;
      }

      // 2) 박스형 시험모드 (1페이지 1박스)
      if (viewMode === 'box') {
        const currentBox = boxList[currentBoxIdx];
        if (!currentBox) return;
        const subLen = currentBox.subItems.length;
        const safeSubIdx = Math.min(Math.max(0, focusedSubIdx), subLen - 1);
        const itemKey = `${currentBox.id}-${safeSubIdx}`;

        if (key === 'ArrowRight') {
          e.preventDefault();
          goNextQuestion();
        } else if (key === 'ArrowLeft') {
          e.preventDefault();
          goPrevQuestion();
        } else if (key === 'ArrowDown' || key === 'j' || key === 'J') {
          e.preventDefault();
          setFocusedSubIdx((prev) => (prev + 1) % subLen);
        } else if (key === 'ArrowUp' || key === 'k' || key === 'K') {
          e.preventDefault();
          setFocusedSubIdx((prev) => (prev - 1 + subLen) % subLen);
        } else if (key === 'o' || key === 'O') {
          e.preventDefault();
          setUserMarks((prev) => ({ ...prev, [itemKey]: 'O' }));
          if (safeSubIdx < subLen - 1) setFocusedSubIdx(safeSubIdx + 1);
        } else if (key === 'x' || key === 'X') {
          e.preventDefault();
          setUserMarks((prev) => ({ ...prev, [itemKey]: 'X' }));
          if (safeSubIdx < subLen - 1) setFocusedSubIdx(safeSubIdx + 1);
        } else if (key === '1' || key === '2' || key === '3' || key === '4') {
          e.preventDefault();
          const cIdx = Number(key) - 1;
          const choiceVal = currentBox.choices[cIdx];
          if (choiceVal !== undefined) {
            handleSelectBoxChoice(currentBox, choiceVal);
          }
        } else if (key === ' ' || key === 'Enter' || key === 'e' || key === 'E') {
          e.preventDefault();
          setBoxShowExplanation((prev) => ({
            ...prev,
            [currentBox.id]: !prev[currentBox.id],
          }));
        } else if (key === 'n' || key === 'N') {
          e.preventDefault();
          generateBoxQuestions();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    viewMode,
    editingId,
    isAddingFolder,
    currentQuestion,
    boxList,
    currentBoxIdx,
    focusedSubIdx,
    goNextQuestion,
    goPrevQuestion,
    toggleRevealAnswer,
    handleSelectSingleOx,
    handleStartEdit,
    handleSelectBoxChoice,
    generateBoxQuestions,
  ]);

  // 터치 스와이프 핸들러 (태블릿/모바일에서 좌우로 밀어서 문제 넘기기)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (editingId !== null) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (
      editingId !== null ||
      touchStartXRef.current === null ||
      touchStartYRef.current === null
    ) {
      return;
    }
    const dx = e.changedTouches[0].clientX - touchStartXRef.current;
    const dy = e.changedTouches[0].clientY - touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) {
        goNextQuestion();
      } else {
        goPrevQuestion();
      }
    }
  };

  // 문장 포맷터: 상단 질문 + (1)(2)(3) 항목 분리 표시
  const renderFormattedQuestion = (qText: string) => {
    if (!qText.includes('(1)')) {
      return <span>{qText}</span>;
    }
    const parts = qText.split(/(?=\(\d+\))/g);
    const firstPart = parts[0]?.trim();
    const subParts = parts.slice(1);

    if (subParts.length === 0) {
      return <span>{qText}</span>;
    }

    return (
      <span className="inline-block w-full">
        {firstPart && (
          <span className="block font-semibold text-slate-900 mb-2">
            {firstPart}
          </span>
        )}
        <span className="block space-y-1.5 pl-1">
          {subParts.map((sp, i) => (
            <span key={i} className="block text-slate-800 leading-relaxed">
              {sp.trim()}
            </span>
          ))}
        </span>
      </span>
    );
  };

  const currentBox = boxList[currentBoxIdx] || null;

  return (
    <div className="w-full max-w-4xl mx-auto p-3 sm:p-5 space-y-3 text-slate-900 select-none">
      {/* ================================================================= */}
      {/* 1. 최소화된 상단 컨트롤 바 (모드 전환 + 진행 번호 + 메뉴/단축키 버튼) */}
      {/* ================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 shadow-2xs">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode('single')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition ${
              viewMode === 'single'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            단문 OX
          </button>
          <button
            type="button"
            onClick={() => setViewMode('box')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition ${
              viewMode === 'box'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            박스형 (5~7지문)
          </button>

          {selectedCategory !== '전체' && (
            <span className="ml-1 px-2 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700">
              {selectedCategory}
            </span>
          )}
        </div>

        {/* 가운데: 문항 진행률 & 번호 이동 */}
        {viewMode === 'single' && filteredQuestions.length > 0 && (
          <form onSubmit={handleJumpSubmit} className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-700">
              {safeCurrentIndex + 1} / {filteredQuestions.length}
            </span>
            <input
              type="text"
              value={jumpInput}
              onChange={(e) => setJumpInput(e.target.value)}
              placeholder="번호"
              className="w-14 px-2 py-1 text-xs text-center border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </form>
        )}

        {viewMode === 'box' && boxList.length > 0 && (
          <div className="text-xs font-bold text-slate-700">
            박스 {currentBoxIdx + 1} / {boxList.length}
          </div>
        )}

        {/* 우측: 단축키 버튼 & 메뉴(필터/파일) 버튼 */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowShortcutModal((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition ${
              showShortcutModal
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
            title="단축키 안내 (?)"
          >
            ⌨️ 단축키
          </button>
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
              isMenuOpen
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
            title="폴더 필터, 검색, 파일 불러오기/저장 (단축키: F)"
          >
            ☰ 메뉴·필터
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 2. 단축키 안내 팝오버 (`⌨️ 단축키` 버튼을 누를 때만 표시) */}
      {/* ================================================================= */}
      {showShortcutModal && (
        <div className="bg-slate-900 text-slate-100 rounded-xl p-3.5 text-xs space-y-2 shadow-md">
          <div className="flex items-center justify-between border-b border-slate-700 pb-2">
            <span className="font-extrabold text-teal-300">
              ⌨️ 키보드 단축키 안내
            </span>
            <button
              type="button"
              onClick={() => setShowShortcutModal(false)}
              className="text-slate-400 hover:text-white font-bold"
            >
              ✕ 닫기
            </button>
          </div>
          {viewMode === 'single' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
              <div>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded font-mono">←</kbd>{' '}
                /{' '}
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded font-mono">→</kbd>{' '}
                이전 / 다음 문제
              </div>
              <div>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded font-mono">O</kbd>(1) ·{' '}
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded font-mono">X</kbd>(2){' '}
                O / X 선택
              </div>
              <div>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded font-mono">Space</kbd>{' '}
                /{' '}
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded font-mono">Enter</kbd>{' '}
                해답 보기/숨기기
              </div>
              <div>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded font-mono">M</kbd>{' '}
                해답·지문 수정
              </div>
              <div>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded font-mono">I</kbd>{' '}
                출처/분류 정보 보기
              </div>
              <div>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded font-mono">F</kbd>{' '}
                메뉴·필터 열기/닫기
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
              <div>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded font-mono">←</kbd>{' '}
                /{' '}
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded font-mono">→</kbd>{' '}
                이전 / 다음 박스
              </div>
              <div>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded font-mono">↑</kbd>{' '}
                /{' '}
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded font-mono">↓</kbd>{' '}
                박스 내 지문 이동
              </div>
              <div>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded font-mono">O</kbd> ·{' '}
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded font-mono">X</kbd>{' '}
                현재 지문 O/X 표시
              </div>
              <div>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded font-mono">1</kbd>~
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded font-mono">4</kbd>{' '}
                ①~④번 보기 선택
              </div>
              <div>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded font-mono">Space</kbd>{' '}
                전체 해설 보기/숨기기
              </div>
              <div>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded font-mono">N</kbd>{' '}
                새 박스 세트 섞기
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* 3. 접이식 메뉴·필터 패널 (`☰ 메뉴·필터` 버튼을 누를 때만 표시) */}
      {/* ================================================================= */}
      {isMenuOpen && (
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-4 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
            <span className="text-xs font-extrabold text-slate-800">
              📂 문제집 파일 & 폴더 관리
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition">
                📂 JSON 불러오기
                <input
                  type="file"
                  accept=".json"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              {questions.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition"
                >
                  💾 수정본 JSON 저장
                </button>
              )}
              {isAddingFolder ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateFolder();
                    }}
                    placeholder="새 폴더명"
                    className="px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={handleCreateFolder}
                    className="px-2.5 py-1 text-xs font-bold bg-teal-600 text-white rounded-md"
                  >
                    추가
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingFolder(false)}
                    className="px-2 py-1 text-xs text-slate-500"
                  >
                    취소
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingFolder(true)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  + 새 폴더
                </button>
              )}
            </div>
          </div>

          {/* 1단 카테고리 선택 */}
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-slate-600">장·규정 선택</div>
            <div className="flex flex-wrap gap-1.5">
              {allCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                    selectedCategory === cat
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* 2단 세부 분류 선택 */}
          {subCategories.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <div className="text-xs font-bold text-slate-600">세부 조문 필터</div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedSubCategory('전체')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition ${
                    selectedSubCategory === '전체'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  전체
                </button>
                {subCategories.map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setSelectedSubCategory(sub)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                      selectedSubCategory === sub
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 박스형 전용 설정 (박스형 모드일 때만 표시) */}
          {viewMode === 'box' && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center gap-1">
                <span className="font-bold text-slate-600 mr-1">박스 지문 수:</span>
                {([5, 6, 7, 'random'] as const).map((sz) => (
                  <button
                    key={String(sz)}
                    type="button"
                    onClick={() => setBoxSizeSetting(sz)}
                    className={`px-2.5 py-1 rounded-md font-bold ${
                      boxSizeSetting === sz
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {sz === 'random' ? '5~7 랜덤' : `${sz}지문`}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="font-bold text-slate-600 mr-1">질문 유형:</span>
                <button
                  type="button"
                  onClick={() => setBoxTargetSetting('WRONG_COUNT')}
                  className={`px-2.5 py-1 rounded-md font-bold ${
                    boxTargetSetting === 'WRONG_COUNT'
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  틀린 개수
                </button>
                <button
                  type="button"
                  onClick={() => setBoxTargetSetting('CORRECT_COUNT')}
                  className={`px-2.5 py-1 rounded-md font-bold ${
                    boxTargetSetting === 'CORRECT_COUNT'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  옳은 개수
                </button>
                <button
                  type="button"
                  onClick={() => setBoxTargetSetting('RANDOM')}
                  className={`px-2.5 py-1 rounded-md font-bold ${
                    boxTargetSetting === 'RANDOM'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  혼합
                </button>
              </div>
              <label className="flex items-center gap-1.5 font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoMixTrueStatements}
                  onChange={(e) => setAutoMixTrueStatements(e.target.checked)}
                />
                옳은(O) 지문 자동 배합
              </label>
            </div>
          )}

          {/* 검색창 */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="조문, 키워드, 숫자 검색..."
                className="w-full pl-3 pr-8 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsMenuOpen(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-white"
            >
              메뉴 닫기
            </button>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 4. 메인 시험지 영역 (한 페이지에 한 문제씩 표시 & 좌/우 넘기기) */}
      {/* ================================================================= */}
      {viewMode === 'single' ? (
        !currentQuestion ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
            <div className="text-sm text-slate-500">
              표시할 문항이 없습니다. 우측 상단의 <strong>[☰ 메뉴·필터]</strong>를 눌러 JSON 문제집 파일을 불러와 주세요.
            </div>
            <button
              type="button"
              onClick={() => setIsMenuOpen(true)}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-teal-600 text-white"
            >
              ☰ 메뉴·필터 열기
            </button>
          </div>
        ) : (
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="bg-white rounded-2xl shadow-xs border-2 border-slate-800 p-5 sm:p-8 space-y-6"
          >
            {/* ----------------------------------------------------------- */}
            {/* 문제 영역: 오직 [번호]와 [지문]만 깔끔하게 시험문제 형식으로 표시 */}
            {/* ----------------------------------------------------------- */}
            <div
              onClick={() => {
                if (editingId !== currentQuestion.id) {
                  toggleRevealAnswer(currentQuestion.id);
                }
              }}
              className="min-h-[130px] flex items-start cursor-pointer select-text"
            >
              <div className="text-base sm:text-xl leading-relaxed text-slate-900 font-medium tracking-tight">
                <span className="font-extrabold text-slate-900 mr-2">
                  {safeCurrentIndex + 1}.
                </span>
                {renderFormattedQuestion(currentQuestion.question)}
              </div>
            </div>

            {/* ----------------------------------------------------------- */}
            {/* 하단 컨트롤 버튼 바 (오른쪽 상단에 있던 버튼을 모두 아래로 배치) */}
            {/* ----------------------------------------------------------- */}
            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              {/* 좌측: 이전 문제 버튼 */}
              <button
                type="button"
                onClick={goPrevQuestion}
                disabled={safeCurrentIndex === 0}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold border transition ${
                  safeCurrentIndex === 0
                    ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed'
                    : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                }`}
              >
                ◀ 이전 (←)
              </button>

              {/* 중앙: 시험문제 형식 O / X 선택 및 해답·수정·정보 버튼 */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectSingleOx(currentQuestion.id, 'O')}
                  className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold border-2 transition ${
                    userGuesses[currentQuestion.id] === 'O'
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-white text-slate-800 border-slate-300 hover:border-sky-500 hover:bg-sky-50'
                  }`}
                >
                  ① O (옳음)
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectSingleOx(currentQuestion.id, 'X')}
                  className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold border-2 transition ${
                    userGuesses[currentQuestion.id] === 'X'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-white text-slate-800 border-slate-300 hover:border-rose-500 hover:bg-rose-50'
                  }`}
                >
                  ② X (틀림)
                </button>

                <button
                  type="button"
                  onClick={() => toggleRevealAnswer(currentQuestion.id)}
                  className={`px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold border transition ${
                    revealedAnswers[currentQuestion.id]
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  {revealedAnswers[currentQuestion.id] ? '해답 숨기기' : '해답 보기'}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    editingId === currentQuestion.id
                      ? handleCancelEdit()
                      : handleStartEdit(currentQuestion)
                  }
                  className={`px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold border transition ${
                    editingId === currentQuestion.id
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {editingId === currentQuestion.id ? '수정 취소' : '수정'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowMetaInfo((prev) => !prev)}
                  className={`px-2.5 py-2.5 rounded-xl text-xs font-bold border transition ${
                    showMetaInfo
                      ? 'bg-slate-200 text-slate-800 border-slate-300'
                      : 'bg-white text-slate-400 border-slate-200 hover:text-slate-700'
                  }`}
                  title="분류·출처·삭제 메뉴 (단축키: I)"
                >
                  •••
                </button>
              </div>

              {/* 우측: 다음 문제 버튼 */}
              <button
                type="button"
                onClick={goNextQuestion}
                disabled={safeCurrentIndex >= filteredQuestions.length - 1}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold border transition ${
                  safeCurrentIndex >= filteredQuestions.length - 1
                    ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed'
                    : 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                }`}
              >
                다음 (→) ▶
              </button>
            </div>

            {/* ----------------------------------------------------------- */}
            {/* 부가 정보 바 (`•••` 버튼이나 I키를 눌렀을 때만 노출) */}
            {/* ----------------------------------------------------------- */}
            {showMetaInfo && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-800">
                    [{currentQuestion.category}]
                  </span>
                  {currentQuestion.subCategory && (
                    <span>{currentQuestion.subCategory}</span>
                  )}
                  {currentQuestion.source && (
                    <span className="text-slate-400">
                      ({currentQuestion.source})
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteQuestion(currentQuestion.id)}
                  className="px-2.5 py-1 rounded-md text-xs font-bold text-rose-600 hover:bg-rose-50"
                >
                  문항 삭제
                </button>
              </div>
            )}

            {/* ----------------------------------------------------------- */}
            {/* 하단 해답 영역 (빨간 캡슐 없이 깔끔한 하단 박스로 표시) */}
            {/* ----------------------------------------------------------- */}
            {revealedAnswers[currentQuestion.id] &&
              editingId !== currentQuestion.id && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs sm:text-sm">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2.5 py-0.5 rounded-md font-extrabold ${
                          currentQuestion.answer === 'O'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        정답: {currentQuestion.answer}
                      </span>

                      {userGuesses[currentQuestion.id] && (
                        <span
                          className={`font-extrabold ${
                            userGuesses[currentQuestion.id] ===
                              currentQuestion.answer ||
                            (currentQuestion.answer !== 'O' &&
                              userGuesses[currentQuestion.id] === 'X')
                              ? 'text-emerald-600'
                              : 'text-rose-600'
                          }`}
                        >
                          {userGuesses[currentQuestion.id] ===
                            currentQuestion.answer ||
                          (currentQuestion.answer !== 'O' &&
                            userGuesses[currentQuestion.id] === 'X')
                            ? '✓ 맞았습니다'
                            : `✗ 틀렸습니다 (내 선택: ${
                                userGuesses[currentQuestion.id]
                              })`}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleStartEdit(currentQuestion)}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-100"
                    >
                      수정
                    </button>
                  </div>

                  <div className="text-slate-900 font-semibold leading-relaxed whitespace-pre-line">
                    {currentQuestion.correctAnswer}
                  </div>

                  {currentQuestion.explanation &&
                    currentQuestion.explanation !==
                      currentQuestion.correctAnswer && (
                      <div className="text-slate-600 leading-relaxed whitespace-pre-line pt-1 border-t border-slate-200">
                        {currentQuestion.explanation}
                      </div>
                    )}
                </div>
              )}

            {/* ----------------------------------------------------------- */}
            {/* 인라인 수정 폼 (`수정` 버튼 또는 M키를 눌렀을 때만 하단에 표시) */}
            {/* ----------------------------------------------------------- */}
            {editingId === currentQuestion.id && (
              <div className="p-4 rounded-xl bg-slate-50 border-2 border-teal-500 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-900 text-sm">
                    해답 및 지문 수정
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-600 mr-1">정답:</span>
                    {(['O', 'X'] as const).map((ox) => (
                      <button
                        key={ox}
                        type="button"
                        onClick={() =>
                          setEditDraft((prev) => ({ ...prev, answer: ox }))
                        }
                        className={`px-3 py-1 rounded-md font-extrabold border ${
                          editDraft.answer === ox
                            ? ox === 'O'
                              ? 'bg-sky-600 text-white border-sky-600'
                              : 'bg-rose-600 text-white border-rose-600'
                            : 'bg-white text-slate-600 border-slate-300'
                        }`}
                      >
                        {ox}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">해답</label>
                  <input
                    type="text"
                    autoFocus
                    value={editDraft.correctAnswer}
                    onChange={(e) =>
                      setEditDraft((prev) => ({
                        ...prev,
                        correctAnswer: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSaveEdit(currentQuestion.id);
                      } else if (e.key === 'Escape') {
                        handleCancelEdit();
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">
                    문제 지문
                  </label>
                  <textarea
                    rows={3}
                    value={editDraft.question}
                    onChange={(e) =>
                      setEditDraft((prev) => ({
                        ...prev,
                        question: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') handleCancelEdit();
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 text-xs sm:text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block font-bold text-slate-700">
                      카테고리(폴더)
                    </label>
                    <input
                      type="text"
                      value={editDraft.category}
                      onChange={(e) =>
                        setEditDraft((prev) => ({
                          ...prev,
                          category: e.target.value,
                        }))
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-bold text-slate-700">
                      세부 분류
                    </label>
                    <input
                      type="text"
                      value={editDraft.subCategory}
                      onChange={(e) =>
                        setEditDraft((prev) => ({
                          ...prev,
                          subCategory: e.target.value,
                        }))
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-xs"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-600 border border-slate-300 hover:bg-slate-100"
                  >
                    취소 (Esc)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(currentQuestion.id)}
                    className="px-4 py-1.5 rounded-lg text-xs font-extrabold bg-teal-600 text-white hover:bg-teal-700"
                  >
                    저장하기 (Enter)
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        /* ================================================================= */
        /* 5. 박스형 시험문제 모드 (1페이지에 1박스씩 표시 & 좌/우 넘기기) */
        /* ================================================================= */
        !currentBox ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-500">
            문항이 없습니다. 우측 상단의 [☰ 메뉴·필터]에서 문제집을 불러와 주세요.
          </div>
        ) : (
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="bg-white rounded-2xl shadow-xs border-2 border-slate-800 p-5 sm:p-7 space-y-5"
          >
            {/* 박스형 문제 발문 */}
            <div className="text-base sm:text-lg font-extrabold text-slate-900">
              {currentBox.boxNo}. 다음 설명 중{' '}
              <span className="underline decoration-2">
                {currentBox.targetType === 'WRONG_COUNT'
                  ? '틀린 것은 모두 몇 개인가?'
                  : '옳은 것은 모두 몇 개인가?'}
              </span>
            </div>

            {/* 박스 내부 지문 (가, 나, 다, 라, 마...) — 불필요한 빨간 캡슐 제거 */}
            <div className="border-2 border-slate-700 rounded-xl p-4 bg-white space-y-3">
              {currentBox.subItems.map((sub, idx) => {
                const itemKey = `${currentBox.id}-${idx}`;
                const userMark = userMarks[itemKey];
                const isSubFocused = focusedSubIdx === idx;

                return (
                  <div
                    key={itemKey}
                    onClick={() => setFocusedSubIdx(idx)}
                    className={`flex items-start justify-between gap-3 p-2 rounded-lg transition ${
                      isSubFocused ? 'bg-slate-100/80' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-sm sm:text-base leading-relaxed text-slate-900 select-text">
                      <span className="font-extrabold mr-1.5">{sub.label}.</span>
                      <span>{sub.displayQuestion}</span>
                    </div>

                    {/* 우측 O / X 간단 메모 버튼 */}
                    <div className="flex items-center gap-1 shrink-0 pt-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFocusedSubIdx(idx);
                          toggleUserMark(currentBox.id, idx, 'O');
                        }}
                        className={`w-7 h-7 rounded-md text-xs font-extrabold border transition ${
                          userMark === 'O'
                            ? 'bg-sky-600 text-white border-sky-600'
                            : 'bg-white text-slate-400 border-slate-200 hover:text-slate-700'
                        }`}
                      >
                        O
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFocusedSubIdx(idx);
                          toggleUserMark(currentBox.id, idx, 'X');
                        }}
                        className={`w-7 h-7 rounded-md text-xs font-extrabold border transition ${
                          userMark === 'X'
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-white text-slate-400 border-slate-200 hover:text-slate-700'
                        }`}
                      >
                        X
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 4지선다 객관식 보기 버튼 */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 pt-1">
              {currentBox.choices.map((choiceNum, cIdx) => {
                const chosen = selectedChoices[currentBox.id];
                const isGraded = chosen !== undefined;
                const isThisSelected = chosen === choiceNum;
                const isCorrectChoice = choiceNum === currentBox.correctCount;

                let btnStyle =
                  'bg-white text-slate-900 border-slate-300 hover:border-slate-800';
                if (isGraded) {
                  if (isCorrectChoice) {
                    btnStyle = 'bg-emerald-600 text-white border-emerald-600';
                  } else if (isThisSelected) {
                    btnStyle = 'bg-rose-600 text-white border-rose-600';
                  } else {
                    btnStyle = 'bg-slate-50 text-slate-400 border-slate-200';
                  }
                }

                return (
                  <button
                    key={choiceNum}
                    type="button"
                    onClick={() => handleSelectBoxChoice(currentBox, choiceNum)}
                    className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold border-2 transition ${btnStyle}`}
                  >
                    {CIRCLED_NUMS[cIdx] || `${cIdx + 1}.`} {choiceNum}개
                  </button>
                );
              })}
            </div>

            {/* 하단 네비게이션 & 해답 보기 버튼 바 */}
            <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={goPrevQuestion}
                disabled={currentBoxIdx === 0}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold border transition ${
                  currentBoxIdx === 0
                    ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed'
                    : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                }`}
              >
                ◀ 이전 (←)
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setBoxShowExplanation((prev) => ({
                      ...prev,
                      [currentBox.id]: !prev[currentBox.id],
                    }))
                  }
                  className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  {boxShowExplanation[currentBox.id] ? '해답 숨기기' : '해답 보기'}
                </button>
                <button
                  type="button"
                  onClick={generateBoxQuestions}
                  className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-100"
                >
                  새로 섞기 (N)
                </button>
              </div>

              <button
                type="button"
                onClick={goNextQuestion}
                disabled={currentBoxIdx >= boxList.length - 1}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold border transition ${
                  currentBoxIdx >= boxList.length - 1
                    ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed'
                    : 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                }`}
              >
                다음 (→) ▶
              </button>
            </div>

            {/* 박스형 하단 해답 영역 */}
            {boxShowExplanation[currentBox.id] && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs sm:text-sm">
                <div className="font-extrabold text-slate-900">
                  정답: {currentBox.correctCount}개
                </div>
                <div className="space-y-1.5 pt-1">
                  {currentBox.subItems.map((sub, sIdx) => (
                    <div key={sIdx} className="text-slate-700 leading-relaxed">
                      <span
                        className={`font-extrabold mr-1.5 ${
                          sub.effectiveAnswer === 'X'
                            ? 'text-rose-600'
                            : 'text-sky-700'
                        }`}
                      >
                        {sub.label}. ({sub.effectiveAnswer})
                      </span>
                      <span>{sub.shortCorrection}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
};

export default ExamTab;
