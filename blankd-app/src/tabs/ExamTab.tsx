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

  // (1)(2) 복수 항목형 문제는 단일 문장 자동 치환에서 제외
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

  // 화면 모드: 'list'(기존 단문 리스트 모드) | 'box'(실전 박스형 훈련 모드)
  const [viewMode, setViewMode] = useState<'list' | 'box'>('list');

  // 단문 리스트 모드 상태
  const [revealedAnswers, setRevealedAnswers] = useState<Record<number, boolean>>({});
  const [expandedExplanations, setExpandedExplanations] = useState<Record<number, boolean>>({});
  const [showAllAnswers, setShowAllAnswers] = useState<boolean>(false);
  // 단문 모드에서 사용자가 키보드(O/X 또는 1/2)나 버튼으로 판정한 내 답안 기록
  const [userListGuesses, setUserListGuesses] = useState<Record<number, 'O' | 'X'>>({});

  // 키보드 포커스 상태 (단문 모드 & 박스 모드)
  const [focusedListIndex, setFocusedListIndex] = useState<number>(0);
  const [focusedBoxIdx, setFocusedBoxIdx] = useState<number>(0);
  const [focusedSubIdx, setFocusedSubIdx] = useState<number>(0);
  const [showShortcutGuide, setShowShortcutGuide] = useState<boolean>(true);

  const listCardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const boxSubItemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 단문 OX 해답/내용 인라인 수정 상태
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
  // 박스형 훈련 모드 전용 상태
  // ==========================================
  const [boxSizeSetting, setBoxSizeSetting] = useState<number | 'random'>(5); // 5, 6, 7, 'random'
  const [boxBatchCount, setBoxBatchCount] = useState<1 | 5 | 10>(1); // 1문제씩 집중 vs 5/10문제 시험지 모드
  const [boxTargetSetting, setBoxTargetSetting] = useState<'WRONG_COUNT' | 'CORRECT_COUNT' | 'RANDOM'>('WRONG_COUNT');
  const [autoMixTrueStatements, setAutoMixTrueStatements] = useState<boolean>(true);

  const [boxList, setBoxList] = useState<GeneratedBoxQuestion[]>([]);
  // key: `${boxId}-${subIdx}` -> 'O' | 'X' | null
  const [userMarks, setUserMarks] = useState<Record<string, 'O' | 'X' | null>>({});
  // key: boxId -> selected choice number
  const [selectedChoices, setSelectedChoices] = useState<Record<string, number>>({});
  // key: `${boxId}-${subIdx}` -> boolean (상세 해설 토글)
  const [boxExpandedExp, setBoxExpandedExp] = useState<Record<string, boolean>>({});
  // key: `${boxId}-${subIdx}` -> boolean (채점 전 개별 지문 정답 캡슐 미리보기 토글)
  const [boxSubRevealed, setBoxSubRevealed] = useState<Record<string, boolean>>({});

  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [boxStats, setBoxStats] = useState<{ solved: number; correct: number }>({
    solved: 0,
    correct: 0,
  });

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

  // 박스형 타이머 작동 (미채점 문제가 남아 있을 때만 작동)
  useEffect(() => {
    if (viewMode !== 'box' || !isTimerRunning || boxList.length === 0) return;
    const allGraded = boxList.every((b) => selectedChoices[b.id] !== undefined);
    if (allGraded) return;

    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [viewMode, isTimerRunning, boxList, selectedChoices]);

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

  // 수정된 문제집 JSON 파일로 내보내기 (다운로드)
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

  // 필터 변경 시 단문 포커스 초기화
  useEffect(() => {
    setFocusedListIndex(0);
  }, [selectedCategory, selectedSubCategory, searchQuery]);

  // 포커스된 단문 카드 자동 스크롤
  useEffect(() => {
    if (viewMode !== 'list') return;
    const item = filteredQuestions[focusedListIndex];
    if (!item) return;
    const el = listCardRefs.current[item.id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [focusedListIndex, viewMode, filteredQuestions]);

  // 포커스된 박스 지문 자동 스크롤
  useEffect(() => {
    if (viewMode !== 'box') return;
    const currentBox = boxList[focusedBoxIdx];
    if (!currentBox) return;
    const key = `${currentBox.id}-${focusedSubIdx}`;
    const el = boxSubItemRefs.current[key];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [focusedBoxIdx, focusedSubIdx, viewMode, boxList]);

  // ==========================================
  // 박스형 문제 세트 생성 함수 (1문제 또는 5/10문제 시험지 생성)
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

    const generated: GeneratedBoxQuestion[] = [];
    const shuffledMaster = [...pool].sort(() => Math.random() - 0.5);
    let cursor = 0;

    for (let bIdx = 0; bIdx < boxBatchCount; bIdx++) {
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
    setUserMarks({});
    setSelectedChoices({});
    setBoxExpandedExp({});
    setBoxSubRevealed({});
    setFocusedBoxIdx(0);
    setFocusedSubIdx(0);
    setElapsedSeconds(0);
    setIsTimerRunning(true);
  }, [
    filteredQuestions,
    boxSizeSetting,
    boxBatchCount,
    boxTargetSetting,
    autoMixTrueStatements,
  ]);

  useEffect(() => {
    if (viewMode === 'box') {
      generateBoxQuestions();
    }
  }, [
    viewMode,
    selectedCategory,
    selectedSubCategory,
    boxSizeSetting,
    boxBatchCount,
    boxTargetSetting,
  ]);

  // 단문 정답 캡슐 토글
  const toggleRevealAnswer = useCallback((id: number) => {
    setRevealedAnswers((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // 단문 OX 판정 선택 (키보드 O/X 또는 버튼 클릭 시 판정 기록 + 해답 공개)
  const handleGuessListOx = useCallback((id: number, guess: 'O' | 'X') => {
    setUserListGuesses((prev) => ({ ...prev, [id]: guess }));
    setRevealedAnswers((prev) => ({ ...prev, [id]: true }));
  }, []);

  // 상세 해설 토글
  const toggleExplanation = useCallback((id: number) => {
    setExpandedExplanations((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // 단문 문항 해답/내용 수정 시작
  const handleStartEdit = useCallback((item: ExamQuestionItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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

  // 단문 문항 해답/내용 수정 취소
  const handleCancelEdit = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingId(null);
  }, []);

  // 단문 문항 해답/내용 수정 저장
  const handleSaveEdit = (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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
    if (editingId === id) setEditingId(null);
    const next = questions.filter((q) => q.id !== id);
    saveQuestions(next);
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

  // 박스형 지문 마킹 (O / X 연필 메모)
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
      if (selectedChoices[box.id] !== undefined) return;
      setSelectedChoices((prev) => ({ ...prev, [box.id]: choiceNum }));
      const isCorrect = choiceNum === box.correctCount;
      setBoxStats((prev) => ({
        solved: prev.solved + 1,
        correct: prev.correct + (isCorrect ? 1 : 0),
      }));
    },
    [selectedChoices]
  );

  // ==========================================
  // 전역 키보드 단축키 핸들러 (단문 OX 모드 & 실전 박스형 모드)
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

      // 1) 단문 OX 리스트 모드 단축키
      if (viewMode === 'list') {
        if (filteredQuestions.length === 0) return;
        const safeIdx = Math.min(
          Math.max(0, focusedListIndex),
          filteredQuestions.length - 1
        );
        const currentItem = filteredQuestions[safeIdx];
        if (!currentItem) return;

        if (key === 'ArrowDown' || key === 'ArrowRight' || key === 'j' || key === 'J') {
          e.preventDefault();
          setFocusedListIndex((prev) =>
            Math.min(filteredQuestions.length - 1, prev + 1)
          );
        } else if (key === 'ArrowUp' || key === 'ArrowLeft' || key === 'k' || key === 'K') {
          e.preventDefault();
          setFocusedListIndex((prev) => Math.max(0, prev - 1));
        } else if (key === ' ' || key === 'Enter') {
          e.preventDefault();
          toggleRevealAnswer(currentItem.id);
        } else if (key === 'o' || key === 'O' || key === '1') {
          e.preventDefault();
          handleGuessListOx(currentItem.id, 'O');
        } else if (key === 'x' || key === 'X' || key === '2') {
          e.preventDefault();
          handleGuessListOx(currentItem.id, 'X');
        } else if (key === 'e' || key === 'E') {
          e.preventDefault();
          toggleExplanation(currentItem.id);
        } else if (key === 'm' || key === 'M' || key === 'u' || key === 'U') {
          e.preventDefault();
          handleStartEdit(currentItem);
        } else if (key === 'a' || key === 'A') {
          e.preventDefault();
          setShowAllAnswers((prev) => !prev);
        }
        return;
      }

      // 2) 실전 박스형 훈련 모드 단축키
      if (viewMode === 'box') {
        if (boxList.length === 0) return;
        const safeBoxIdx = Math.min(Math.max(0, focusedBoxIdx), boxList.length - 1);
        const currentBox = boxList[safeBoxIdx];
        if (!currentBox) return;
        const subLen = currentBox.subItems.length;
        const safeSubIdx = Math.min(Math.max(0, focusedSubIdx), subLen - 1);
        const itemKey = `${currentBox.id}-${safeSubIdx}`;

        if (key === 'ArrowDown' || key === 'j' || key === 'J') {
          e.preventDefault();
          if (safeSubIdx < subLen - 1) {
            setFocusedSubIdx(safeSubIdx + 1);
          } else if (safeBoxIdx < boxList.length - 1) {
            setFocusedBoxIdx(safeBoxIdx + 1);
            setFocusedSubIdx(0);
          }
        } else if (key === 'ArrowUp' || key === 'k' || key === 'K') {
          e.preventDefault();
          if (safeSubIdx > 0) {
            setFocusedSubIdx(safeSubIdx - 1);
          } else if (safeBoxIdx > 0) {
            const prevBox = boxList[safeBoxIdx - 1];
            setFocusedBoxIdx(safeBoxIdx - 1);
            setFocusedSubIdx(Math.max(0, prevBox.subItems.length - 1));
          }
        } else if (key === 'o' || key === 'O' || key === '[') {
          e.preventDefault();
          if (selectedChoices[currentBox.id] === undefined) {
            setUserMarks((prev) => ({ ...prev, [itemKey]: 'O' }));
            if (safeSubIdx < subLen - 1) {
              setFocusedSubIdx(safeSubIdx + 1);
            }
          }
        } else if (key === 'x' || key === 'X' || key === ']') {
          e.preventDefault();
          if (selectedChoices[currentBox.id] === undefined) {
            setUserMarks((prev) => ({ ...prev, [itemKey]: 'X' }));
            if (safeSubIdx < subLen - 1) {
              setFocusedSubIdx(safeSubIdx + 1);
            }
          }
        } else if (key === ' ') {
          e.preventDefault();
          setBoxSubRevealed((prev) => ({
            ...prev,
            [itemKey]: !prev[itemKey],
          }));
        } else if (key === 'e' || key === 'E') {
          e.preventDefault();
          setBoxExpandedExp((prev) => ({
            ...prev,
            [itemKey]: !prev[itemKey],
          }));
        } else if (key === '1' || key === '2' || key === '3' || key === '4') {
          e.preventDefault();
          const cIdx = Number(key) - 1;
          const choiceVal = currentBox.choices[cIdx];
          if (choiceVal !== undefined) {
            handleSelectBoxChoice(currentBox, choiceVal);
          }
        } else if (
          key === 'n' ||
          key === 'N' ||
          key === 'r' ||
          key === 'R' ||
          (key === 'Enter' && selectedChoices[currentBox.id] !== undefined)
        ) {
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
    filteredQuestions,
    focusedListIndex,
    boxList,
    focusedBoxIdx,
    focusedSubIdx,
    selectedChoices,
    toggleRevealAnswer,
    handleGuessListOx,
    toggleExplanation,
    handleStartEdit,
    handleSelectBoxChoice,
    generateBoxQuestions,
  ]);

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
          <span className="block font-semibold text-slate-900 mb-1.5">
            📌 {firstPart}
          </span>
        )}
        <span className="block space-y-1 pl-1">
          {subParts.map((sp, i) => (
            <span key={i} className="block text-slate-800 leading-relaxed">
              {sp.trim()}
            </span>
          ))}
        </span>
      </span>
    );
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}분 ${s < 10 ? `0${s}` : s}초`;
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-3 sm:p-4 space-y-4 text-slate-900 bg-slate-50 min-h-screen rounded-xl">
      {/* 상단 모드 전환 & 파일 업로드 헤더 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-extrabold transition-all ${
              viewMode === 'list'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            📋 단문 OX 리스트 ({filteredQuestions.length}문항)
          </button>
          <button
            type="button"
            onClick={() => setViewMode('box')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-extrabold transition-all ${
              viewMode === 'box'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            📦 실전 박스형 훈련 모드 (5~7지문 개수 찾기)
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowShortcutGuide((prev) => !prev)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
              showShortcutGuide
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
            }`}
          >
            ⌨️ 키보드 단축키 {showShortcutGuide ? '숨기기' : '안내'}
          </button>
          <label className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition">
            📂 JSON 문제집 불러오기
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
              title="수정된 해답과 지문을 JSON 파일로 다운로드합니다"
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
                className="px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
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
                className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700"
              >
                취소
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingFolder(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition"
            >
              + 새 폴더 만들기
            </button>
          )}
        </div>
      </div>

      {/* 키보드 단축키 안내 배너 */}
      {showShortcutGuide && (
        <div className="bg-slate-900 text-slate-100 rounded-xl px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 shadow-xs">
          {viewMode === 'list' ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="font-extrabold text-teal-300">
                ⌨️ 단문 OX 키보드 조작:
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[11px] font-mono">
                  ↑
                </kbd>{' '}
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[11px] font-mono">
                  ↓
                </kbd>{' '}
                또는{' '}
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[11px] font-mono">
                  ←
                </kbd>{' '}
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[11px] font-mono">
                  →
                </kbd>{' '}
                문항 이동
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[11px] font-mono">
                  O
                </kbd>{' '}
                /{' '}
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[11px] font-mono">
                  1
                </kbd>{' '}
                O 선택 ·{' '}
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[11px] font-mono">
                  X
                </kbd>{' '}
                /{' '}
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[11px] font-mono">
                  2
                </kbd>{' '}
                X 선택 (즉시 채점)
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[11px] font-mono">
                  Space
                </kbd>{' '}
                /{' '}
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[11px] font-mono">
                  Enter
                </kbd>{' '}
                해답 보기/숨기기
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[11px] font-mono">
                  E
                </kbd>{' '}
                상세 해설
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[11px] font-mono">
                  M
                </kbd>{' '}
                해답 수정
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="font-extrabold text-indigo-300">
                ⌨️ 실전 박스형 키보드 조작:
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[11px] font-mono">
                  ↑
                </kbd>{' '}
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[11px] font-mono">
                  ↓
                </kbd>{' '}
                지문(가~사) 이동
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[11px] font-mono">
                  O
                </kbd>{' '}
                맞는 지문 체크 ·{' '}
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[11px] font-mono">
                  X
                </kbd>{' '}
                틀린 지문 체크 (자동 다음 지문)
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[11px] font-mono">
                  1
                </kbd>
                ~
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[11px] font-mono">
                  4
                </kbd>{' '}
                객관식 ①~④번 정답 선택
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[11px] font-mono">
                  Space
                </kbd>{' '}
                지문 해답 미리보기
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[11px] font-mono">
                  N
                </kbd>{' '}
                (또는 채점 후{' '}
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[11px] font-mono">
                  Enter
                </kbd>
                ) 새 박스 문제 뽑기
              </span>
            </div>
          )}
        </div>
      )}

      {/* 1단 폴더(카테고리) 선택 탭 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {allCategories.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isSelected
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* 2단 조항별 세부 분류(subCategory) 필터 칩 */}
        {subCategories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
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
        )}

        {/* 검색 및 전체 정답 토글 바 */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700">
              현재 목록 {filteredQuestions.length}문항
            </span>

            {viewMode === 'list' && filteredQuestions.length > 0 && (
              <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200">
                현재 선택: {focusedListIndex + 1} / {filteredQuestions.length}번
              </span>
            )}

            {viewMode === 'list' && (
              <button
                type="button"
                onClick={() => setShowAllAnswers((prev) => !prev)}
                className={`px-3 py-1 rounded-md text-xs font-bold border transition ${
                  showAllAnswers
                    ? 'bg-amber-500 text-white border-amber-600'
                    : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                }`}
              >
                👀 {showAllAnswers ? '전체 정답 숨기기' : '전체 정답 한번에 보기'}
              </button>
            )}
          </div>

          {/* 우측 검색창 */}
          <div className="relative w-full sm:w-72">
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
        </div>
      </div>

      {/* ========================================== */}
      {/* MODE 1: 실전 박스형 훈련 모드 (5~7지문 개수형) */}
      {/* ========================================== */}
      {viewMode === 'box' ? (
        <div className="space-y-4">
          {/* 박스형 옵션 설정 바 */}
          <div className="bg-white rounded-xl shadow-sm border border-indigo-200 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* 지문 수 선택 */}
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-slate-600 mr-1">지문 수:</span>
                {([5, 6, 7, 'random'] as const).map((sz) => (
                  <button
                    key={String(sz)}
                    type="button"
                    onClick={() => setBoxSizeSetting(sz)}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition ${
                      boxSizeSetting === sz
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {sz === 'random' ? '5~7 랜덤' : `${sz}지문`}
                  </button>
                ))}
              </div>

              {/* 출제 문항 수(1문제 집중 vs 5/10문제 시험지) */}
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-slate-600 mr-1">출제 단위:</span>
                {([1, 5, 10] as const).map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setBoxBatchCount(cnt)}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition ${
                      boxBatchCount === cnt
                        ? 'bg-teal-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {cnt === 1 ? '1문제 집중' : `${cnt}문제 연속`}
                  </button>
                ))}
              </div>

              {/* 질문 유형 선택 */}
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-slate-600 mr-1">유형:</span>
                <button
                  type="button"
                  onClick={() => setBoxTargetSetting('WRONG_COUNT')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition ${
                    boxTargetSetting === 'WRONG_COUNT'
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  틀린 개수
                </button>
                <button
                  type="button"
                  onClick={() => setBoxTargetSetting('CORRECT_COUNT')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition ${
                    boxTargetSetting === 'CORRECT_COUNT'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  옳은 개수
                </button>
                <button
                  type="button"
                  onClick={() => setBoxTargetSetting('RANDOM')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition ${
                    boxTargetSetting === 'RANDOM'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  혼합
                </button>
              </div>

              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoMixTrueStatements}
                  onChange={(e) => setAutoMixTrueStatements(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                옳은(O) 지문 자동 배합
              </label>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300">
                ⏱ {formatTime(elapsedSeconds)}
              </span>
              <span className="text-xs font-bold text-slate-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-100">
                정답률: {boxStats.solved}문제 중 {boxStats.correct}정답 (
                {boxStats.solved > 0
                  ? Math.round((boxStats.correct / boxStats.solved) * 100)
                  : 0}
                %)
              </span>
              <button
                type="button"
                onClick={generateBoxQuestions}
                className="px-3.5 py-1.5 rounded-lg text-xs font-extrabold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition"
              >
                🔄 새 박스 문제 세트 뽑기 (N)
              </button>
            </div>
          </div>

          {/* 실전 박스형 문제 리스트 렌더링 */}
          {boxList.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
              현재 선택한 폴더/검색 조건에 해당하는 문항이 없습니다. 먼저 상단의 [📂 JSON 문제집 불러오기]로 파일을 추가하거나 다른 폴더를 선택해 주세요.
            </div>
          ) : (
            <div className="space-y-5">
              {boxList.map((box, bIdx) => {
                const chosen = selectedChoices[box.id];
                const isGraded = chosen !== undefined;
                const isBoxFocused = focusedBoxIdx === bIdx;
                const targetMark =
                  box.targetType === 'WRONG_COUNT' ? 'X' : 'O';
                const userCounted = box.subItems.filter(
                  (_, sIdx) => userMarks[`${box.id}-${sIdx}`] === targetMark
                ).length;

                return (
                  <div
                    key={box.id}
                    onClick={() => setFocusedBoxIdx(bIdx)}
                    className={`bg-white rounded-xl shadow-sm border-2 p-4 sm:p-5 space-y-4 transition ${
                      isBoxFocused
                        ? 'border-indigo-600 ring-2 ring-indigo-100'
                        : 'border-slate-800'
                    }`}
                  >
                    {/* 문제 번호 및 질문 타이틀 */}
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                      <div className="text-base sm:text-lg font-extrabold text-slate-900">
                        {box.boxNo}. 다음 설명 중{' '}
                        <span
                          className={
                            box.targetType === 'WRONG_COUNT'
                              ? 'text-rose-600 underline decoration-2'
                              : 'text-emerald-600 underline decoration-2'
                          }
                        >
                          {box.targetType === 'WRONG_COUNT'
                            ? '틀린 것은 모두 몇 개인가?'
                            : '옳은 것은 모두 몇 개인가?'}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-slate-500">
                        {selectedCategory} ({box.subItems.length}지문)
                      </span>
                    </div>

                    {/* 박스 내부 지문 (가, 나, 다, 라, 마...) */}
                    <div className="border-2 border-slate-700 rounded-lg p-3.5 sm:p-4 bg-white space-y-2.5">
                      {box.subItems.map((sub, idx) => {
                        const itemKey = `${box.id}-${idx}`;
                        const userMark = userMarks[itemKey];
                        const isExpOpen = !!boxExpandedExp[itemKey];
                        const isSubRevealed =
                          isGraded || !!boxSubRevealed[itemKey];
                        const isSubFocused =
                          isBoxFocused && focusedSubIdx === idx;

                        return (
                          <div
                            key={itemKey}
                            ref={(el) => {
                              boxSubItemRefs.current[itemKey] = el;
                            }}
                            onClick={() => {
                              setFocusedBoxIdx(bIdx);
                              setFocusedSubIdx(idx);
                            }}
                            className={`p-2.5 rounded-lg border transition ${
                              isGraded
                                ? sub.effectiveAnswer === 'X'
                                  ? 'bg-rose-50/40 border-rose-200'
                                  : 'bg-emerald-50/40 border-emerald-200'
                                : isSubFocused
                                ? 'bg-indigo-50/50 border-indigo-400 ring-2 ring-indigo-200'
                                : userMark === 'X'
                                ? 'bg-rose-50/30 border-rose-200'
                                : userMark === 'O'
                                ? 'bg-sky-50/30 border-sky-200'
                                : 'border-transparent hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              {/* 지문 텍스트: 클릭 시 개별 정답 캡슐 확인 가능 */}
                              <div
                                onClick={() =>
                                  setBoxSubRevealed((prev) => ({
                                    ...prev,
                                    [itemKey]: !prev[itemKey],
                                  }))
                                }
                                className="flex-1 text-sm sm:text-[15px] leading-relaxed text-slate-900 cursor-pointer"
                              >
                                <span className="font-extrabold text-slate-900 mr-1.5">
                                  {sub.label}.
                                </span>
                                <span>{sub.displayQuestion}</span>

                                {/* 지문 클릭 또는 채점 완료 시 우측에 빨간색 동그라미(캡슐) 표시 */}
                                {isSubRevealed && (
                                  <span
                                    className={`inline-flex items-center ml-2 mt-1 px-3 py-0.5 rounded-full text-xs font-extrabold border-2 align-middle ${
                                      sub.effectiveAnswer === 'X'
                                        ? 'bg-rose-50 text-rose-600 border-rose-500'
                                        : 'bg-emerald-50 text-emerald-700 border-emerald-500'
                                    }`}
                                  >
                                    {sub.effectiveAnswer === 'X'
                                      ? `👉 정답(X): ${sub.shortCorrection}`
                                      : `👉 정답(O): ${sub.shortCorrection}`}
                                  </span>
                                )}
                              </div>

                              {/* 우측: 풀이 중 O/X 메모 버튼 + 상세 해설 버튼 */}
                              <div className="flex items-center gap-1 shrink-0">
                                {!isGraded && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setFocusedBoxIdx(bIdx);
                                        setFocusedSubIdx(idx);
                                        toggleUserMark(box.id, idx, 'O');
                                      }}
                                      className={`w-7 h-7 rounded-md text-xs font-extrabold border transition ${
                                        userMark === 'O'
                                          ? 'bg-sky-600 text-white border-sky-600'
                                          : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-100'
                                      }`}
                                      title="맞는 지문으로 체크 (단축키: O)"
                                    >
                                      O
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setFocusedBoxIdx(bIdx);
                                        setFocusedSubIdx(idx);
                                        toggleUserMark(box.id, idx, 'X');
                                      }}
                                      className={`w-7 h-7 rounded-md text-xs font-extrabold border transition ${
                                        userMark === 'X'
                                          ? 'bg-rose-600 text-white border-rose-600'
                                          : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-100'
                                      }`}
                                      title="틀린 지문으로 체크 (단축키: X)"
                                    >
                                      X
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBoxExpandedExp((prev) => ({
                                      ...prev,
                                      [itemKey]: !prev[itemKey],
                                    }));
                                  }}
                                  className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition ${
                                    isExpOpen
                                      ? 'bg-slate-800 text-white border-slate-800'
                                      : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                                  }`}
                                >
                                  상세 해설
                                </button>
                              </div>
                            </div>

                            {/* 상세 해설 펼침 영역 */}
                            {isExpOpen && (
                              <div className="mt-2.5 p-3 rounded-lg bg-amber-50/70 border border-amber-200 text-xs text-slate-800 space-y-1">
                                <div className="font-bold text-amber-900">
                                  💡 오답 수정 · 정답 확인 (판정:{' '}
                                  {sub.effectiveAnswer}) —{' '}
                                  {sub.originItem.correctAnswer}
                                </div>
                                {sub.originItem.subCategory && (
                                  <div className="text-slate-600">
                                    [분류] {sub.originItem.category} &gt;{' '}
                                    {sub.originItem.subCategory}
                                  </div>
                                )}
                                {sub.originItem.source && (
                                  <div className="text-slate-500">
                                    [출처] {sub.originItem.source}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* 하단 4지선다 보기 & 채점 결과 */}
                    <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        {box.choices.map((choiceNum, cIdx) => {
                          const isThisSelected = chosen === choiceNum;
                          const isCorrectChoice =
                            choiceNum === box.correctCount;

                          let btnStyle =
                            'bg-white text-slate-900 border-slate-300 hover:border-indigo-500 hover:bg-indigo-50';
                          if (isGraded) {
                            if (isCorrectChoice) {
                              btnStyle =
                                'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-300';
                            } else if (isThisSelected && !isCorrectChoice) {
                              btnStyle =
                                'bg-rose-600 text-white border-rose-600';
                            } else {
                              btnStyle =
                                'bg-slate-100 text-slate-400 border-slate-200';
                            }
                          }

                          return (
                            <button
                              key={choiceNum}
                              type="button"
                              disabled={isGraded}
                              onClick={() =>
                                handleSelectBoxChoice(box, choiceNum)
                              }
                              className={`px-4 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-extrabold border-2 transition-all ${btnStyle}`}
                              title={`단축키: 숫자 ${cIdx + 1}`}
                            >
                              {CIRCLED_NUMS[cIdx] || `${cIdx + 1}.`}{' '}
                              {choiceNum}개
                            </button>
                          );
                        })}
                      </div>

                      <div className="text-xs font-bold text-slate-600">
                        {!isGraded ? (
                          <span>
                            내 체크 집계:{' '}
                            <strong className="text-indigo-600">
                              {box.targetType === 'WRONG_COUNT'
                                ? `틀린 지문(X) ${userCounted}개`
                                : `옳은 지문(O) ${userCounted}개`}
                            </strong>
                          </span>
                        ) : chosen === box.correctCount ? (
                          <span className="text-emerald-600 text-sm font-extrabold">
                            🎉 정답입니다! ({box.correctCount}개) — Enter로 다음 세트
                          </span>
                        ) : (
                          <span className="text-rose-600 text-sm font-extrabold">
                            ❗ 오답입니다! (선택: {chosen}개 → 정답:{' '}
                            {box.correctCount}개) — Enter로 다음 세트
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ========================================== */
        /* MODE 2: 단문 OX 리스트 모드 (키보드 풀이 + 해답 캡슐 + 내용 수정) */
        /* ========================================== */
        <div className="space-y-3">
          {filteredQuestions.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
              표시할 문항이 없습니다. 상단의 [📂 JSON 문제집 불러오기] 버튼을 눌러 문제집 파일을 추가해 주세요.
            </div>
          ) : (
            filteredQuestions.map((item, index) => {
              const isAnswerShown =
                showAllAnswers || !!revealedAnswers[item.id];
              const isExpOpen = !!expandedExplanations[item.id];
              const isEditing = editingId === item.id;
              const isFocused = focusedListIndex === index;
              const userGuess = userListGuesses[item.id];
              const isGuessCorrect =
                userGuess !== undefined &&
                (item.answer === userGuess ||
                  (item.answer !== 'O' && userGuess === 'X'));
              const numLabel =
                index + 1 < 10 ? `0${index + 1}.` : `${index + 1}.`;

              return (
                <div
                  key={item.id}
                  ref={(el) => {
                    listCardRefs.current[item.id] = el;
                  }}
                  onClick={() => setFocusedListIndex(index)}
                  className={`bg-white rounded-xl shadow-sm border p-4 transition ${
                    isEditing
                      ? 'border-teal-500 ring-2 ring-teal-100'
                      : isFocused
                      ? 'border-teal-500 ring-2 ring-teal-200 bg-teal-50/10'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* 상단 메타데이터 & 우측 버튼(O/X 판정 / 수정 / 상세 해설 / 삭제) */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-xs font-extrabold ${
                          isFocused ? 'text-teal-700' : 'text-slate-500'
                        }`}
                      >
                        {numLabel}
                      </span>
                      {isFocused && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-teal-600 text-white">
                          선택됨
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {item.category}
                      </span>
                      {item.subCategory && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600">
                          {item.subCategory}
                        </span>
                      )}
                      {userGuess && (
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold ${
                            isGuessCorrect
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-rose-100 text-rose-800 border border-rose-300'
                          }`}
                        >
                          {isGuessCorrect
                            ? `⭕ 정답 (내 선택: ${userGuess})`
                            : `❌ 오답 (내 선택: ${userGuess} / 정답: ${item.answer})`}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* 단문 O / X 빠른 판정 버튼 (키보드 O/X 또는 1/2와 연동) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFocusedListIndex(index);
                          handleGuessListOx(item.id, 'O');
                        }}
                        className={`w-7 h-7 rounded-md text-xs font-extrabold border transition ${
                          userGuess === 'O'
                            ? 'bg-sky-600 text-white border-sky-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-sky-50 hover:text-sky-700'
                        }`}
                        title="O 선택 (단축키: O 또는 1)"
                      >
                        O
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFocusedListIndex(index);
                          handleGuessListOx(item.id, 'X');
                        }}
                        className={`w-7 h-7 rounded-md text-xs font-extrabold border transition ${
                          userGuess === 'X'
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-rose-50 hover:text-rose-700'
                        }`}
                        title="X 선택 (단축키: X 또는 2)"
                      >
                        X
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          setFocusedListIndex(index);
                          if (isEditing) {
                            handleCancelEdit(e);
                          } else {
                            handleStartEdit(item, e);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition ${
                          isEditing
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'
                        }`}
                        title="단축키: M"
                      >
                        {isEditing ? '수정 취소' : '수정'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFocusedListIndex(index);
                          toggleExplanation(item.id);
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition ${
                          isExpOpen
                            ? 'bg-slate-800 text-white border-slate-800'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                        title="단축키: E"
                      >
                        상세 해설
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteQuestion(item.id);
                        }}
                        className="px-2 py-1 rounded-md text-xs text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        title="문항 삭제"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* 본문 지문 (클릭 또는 Space/Enter 시 우측에 빨간색 캡슐 해답 토글 & 수정 버튼) */}
                  <div
                    onClick={() => {
                      setFocusedListIndex(index);
                      if (!isEditing) toggleRevealAnswer(item.id);
                    }}
                    className={`text-sm sm:text-[15px] leading-relaxed text-slate-900 ${
                      isEditing ? '' : 'cursor-pointer'
                    } select-text`}
                  >
                    {renderFormattedQuestion(item.question)}

                    {isAnswerShown && !isEditing && (
                      <span className="inline-flex items-center gap-1.5 ml-2 mt-1 px-3 py-0.5 rounded-full text-xs font-extrabold bg-rose-50 text-rose-600 border-2 border-rose-500 shadow-xs align-middle">
                        <span>👉 정답: {item.correctAnswer}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            setFocusedListIndex(index);
                            handleStartEdit(item, e);
                          }}
                          className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-white text-rose-700 border border-rose-300 hover:bg-rose-600 hover:text-white transition"
                          title="해답 및 문항 내용 수정 (단축키: M)"
                        >
                          수정
                        </button>
                      </span>
                    )}
                  </div>

                  {/* 인라인 수정 폼 (`수정` 버튼 또는 M키 클릭 시 표시) */}
                  {isEditing && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="mt-3 p-3.5 rounded-xl bg-teal-50/60 border border-teal-300 space-y-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-teal-900 text-xs sm:text-sm">
                          ✏️ 해답 및 문항 내용 수정 (Enter: 저장 / Esc: 취소)
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-600 mr-1">
                            정답 판정:
                          </span>
                          {(['O', 'X'] as const).map((ox) => (
                            <button
                              key={ox}
                              type="button"
                              onClick={() =>
                                setEditDraft((prev) => ({
                                  ...prev,
                                  answer: ox,
                                }))
                              }
                              className={`px-2.5 py-1 rounded-md font-extrabold border transition ${
                                editDraft.answer === ox
                                  ? ox === 'O'
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-rose-600 text-white border-rose-600'
                                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              {ox}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 1. 해답 (빨간 캡슐에 표시되는 핵심 해답) */}
                      <div className="space-y-1">
                        <label className="block font-bold text-slate-700">
                          해답 (정답 캡슐 표시 내용)
                        </label>
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
                              handleSaveEdit(item.id);
                            } else if (e.key === 'Escape') {
                              handleCancelEdit();
                            }
                          }}
                          placeholder="예: 보건복지부장관(X) → 공단 이사장"
                          className="w-full px-3 py-2 rounded-lg border border-teal-300 bg-white text-slate-900 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>

                      {/* 2. 문제 지문 수정 */}
                      <div className="space-y-1">
                        <label className="block font-bold text-slate-700">
                          문제 지문
                        </label>
                        <textarea
                          rows={2}
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

                      {/* 3. 폴더/세부분류 수정 */}
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
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveEdit(item.id);
                              } else if (e.key === 'Escape') {
                                handleCancelEdit();
                              }
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block font-bold text-slate-700">
                            세부 분류 (조문/주제)
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
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveEdit(item.id);
                              } else if (e.key === 'Escape') {
                                handleCancelEdit();
                              }
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={(e) => handleCancelEdit(e)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-600 border border-slate-300 hover:bg-slate-100 transition"
                        >
                          취소 (Esc)
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleSaveEdit(item.id, e)}
                          className="px-4 py-1.5 rounded-lg text-xs font-extrabold bg-teal-600 text-white hover:bg-teal-700 shadow-xs transition"
                        >
                          저장하기 (Enter)
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 상세 해설 영역 (`상세 해설` 버튼 또는 E키 클릭 시 표시) */}
                  {isExpOpen && !isEditing && (
                    <div className="mt-3 p-3.5 rounded-lg bg-amber-50/60 border border-amber-200 text-xs text-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap font-bold text-amber-900">
                          <span>
                            💡 오답 수정 · 정답 확인 (정답: {item.answer})
                          </span>
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                            바른 표현: {item.correctAnswer}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => handleStartEdit(item, e)}
                          className="px-2.5 py-1 rounded-md text-xs font-bold bg-white text-amber-900 border border-amber-300 hover:bg-amber-100 transition"
                        >
                          ✏️ 내용 수정
                        </button>
                      </div>
                      <div className="text-slate-700 whitespace-pre-line leading-relaxed">
                        [정답·수정] {item.correctAnswer}
                      </div>
                      {item.explanation &&
                        item.explanation !== item.correctAnswer && (
                          <div className="text-slate-700 whitespace-pre-line leading-relaxed">
                            [상세해설] {item.explanation}
                          </div>
                        )}
                      {item.subCategory && (
                        <div className="text-slate-600">
                          [분류] {item.subCategory}
                        </div>
                      )}
                      {item.source && (
                        <div className="text-slate-500">
                          [출처] {item.source}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default ExamTab;
