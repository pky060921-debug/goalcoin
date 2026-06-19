import React, { useState, useEffect } from 'react';

export const DashboardTab = ({ setActiveTab, goalBalance, setGoalBalance }: any) => {
  const [activityLog, setActivityLog] = useState<Record<string, number>>({});
  const [currentDate, setCurrentDate] = useState(new Date());
  const [claimedRewards, setClaimedRewards] = useState<Record<string, boolean>>({});

  // 💡 앱 진입 시 로컬 스토리지에서 달력 기록 및 보상 수령 내역 불러오기
  useEffect(() => {
    const log = JSON.parse(localStorage.getItem('blankd_activity_log') || '{}');
    setActivityLog(log);
    const claimed = JSON.parse(localStorage.getItem('blankd_claimed_rewards') || '{}');
    setClaimedRewards(claimed);
  }, [goalBalance]); // 잔액이 바뀔 때마다(카드를 풀 때마다) 최신화

  const saveClaim = (key: string, points: number) => {
    const next = { ...claimedRewards, [key]: true };
    setClaimedRewards(next);
    localStorage.setItem('blankd_claimed_rewards', JSON.stringify(next));
    setGoalBalance((prev: number) => prev + points);
    alert(`🎉 목표 달성! 보상으로 ${points}P가 지급되었습니다.`);
  };

  const changeMonth = (offset: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(currentDate.getMonth() + offset);
    setCurrentDate(newDate);
  };

  // 💡 통계 계산 로직 (일간, 주간, 월간)
  const todayStr = new Date().toISOString().split('T')[0];
  const dailyFilled = activityLog[todayStr] || 0;

  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekKey = weekStart.toISOString().split('T')[0];

  let weeklyFilled = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    weeklyFilled += activityLog[d.toISOString().split('T')[0]] || 0;
  }

  const d = new Date();
  const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  let monthlyFilled = 0;
  Object.keys(activityLog).forEach(dateStr => {
    if (dateStr.startsWith(monthKey)) monthlyFilled += activityLog[dateStr];
  });

  // 🎯 목표 설정치 (수정 가능)
  const GOALS = {
    daily: { title: "일일 빈칸 채우기", target: 50, reward: 50, current: dailyFilled, key: `daily_${todayStr}` },
    weekly: { title: "주간 빈칸 채우기", target: 300, reward: 300, current: weeklyFilled, key: `weekly_${weekKey}` },
    monthly: { title: "월간 집중 훈련", target: 1000, reward: 1000, current: monthlyFilled, key: `monthly_${monthKey}` }
  };

  // 💡 달력 렌더링 로직
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const blankCells = Array.from({ length: firstDay });
  const dayCells = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const renderGoalCard = (goal: any, icon: string) => {
    const isCompleted = goal.current >= goal.target;
    const isClaimed = claimedRewards[goal.key];
    const progressPercent = Math.min((goal.current / goal.target) * 100, 100);

    return (
      <div className="bg-[#0a0a0c] border border-white/10 p-5 rounded-sm flex flex-col gap-3 shadow-md relative overflow-hidden">
        {isCompleted && !isClaimed && <div className="absolute top-0 right-0 bg-amber-500 text-black text-[9px] font-bold px-2 py-0.5 rounded-bl-sm animate-pulse">달성 완료!</div>}
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <h3 className="text-[13px] font-bold text-white/80">{goal.title}</h3>
        </div>
        <div className="flex justify-between items-end mb-1">
          <span className="text-[20px] font-mono font-bold text-teal-400">{goal.current} <span className="text-[11px] text-white/40">/ {goal.target}칸</span></span>
        </div>
        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden mb-2">
          <div className="h-full bg-teal-500 transition-all duration-500 ease-out" style={{ width: `${progressPercent}%` }}></div>
        </div>
        <button 
          disabled={!isCompleted || isClaimed}
          onClick={() => saveClaim(goal.key, goal.reward)}
          className={`w-full py-2 text-[11px] font-bold rounded-sm transition-all ${
            isClaimed ? 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5' :
            isCompleted ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_10px_rgba(245,158,11,0.4)]' : 
            'bg-teal-900/20 text-teal-500/50 border border-teal-500/20 cursor-not-allowed'
          }`}
        >
          {isClaimed ? '보상 수령 완료' : isCompleted ? `${goal.reward}P 보상 받기` : `진행 중 (목표: ${goal.target}칸)`}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in">
      <div className="flex justify-between items-end mb-6 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif text-current tracking-tight">학습 대시보드</h1>
          <p className="text-xs sm:text-sm text-white/40 mt-1">목표를 달성하고 보상을 획득하여 상점 스킬을 이용하세요.</p>
        </div>
        <button onClick={() => setActiveTab('enhance')} className="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 text-[11px] sm:text-xs font-bold rounded-sm transition-colors shadow-md">
          채우기 바로가기 ▶
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* 왼쪽: 활동 달력 (잔디 심기) */}
        <div className="lg:col-span-2 bg-[#08080a]/80 border border-white/10 p-5 sm:p-6 rounded-sm shadow-xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-[14px] font-bold text-white/80">📅 나의 학습 기록</h2>
            <div className="flex items-center gap-4 bg-white/5 rounded-sm px-2 py-1">
              <button onClick={() => changeMonth(-1)} className="text-white/40 hover:text-teal-400 px-2 font-bold transition-colors">&lt;</button>
              <span className="text-[12px] font-mono font-bold text-white/70 w-20 text-center">{year}년 {month + 1}월</span>
              <button onClick={() => changeMonth(1)} className="text-white/40 hover:text-teal-400 px-2 font-bold transition-colors">&gt;</button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
            {['일', '월', '화', '수', '목', '금', '토'].map(d => (
              <div key={d} className="text-center text-[10px] sm:text-[11px] font-bold text-white/30 py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {blankCells.map((_, i) => <div key={`b-${i}`} className="aspect-square"></div>)}
            {dayCells.map(day => {
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const count = activityLog[dateStr] || 0;
              
              // 잔디(Heatmap) 색상 결정 로직
              let bgClass = "bg-white/5 text-white/20 border border-white/5";
              if (count > 0 && count < 20) bgClass = "bg-teal-900/40 text-teal-400 border border-teal-500/20";
              else if (count >= 20 && count < 50) bgClass = "bg-teal-700/60 text-teal-100 border border-teal-500/40";
              else if (count >= 50) bgClass = "bg-teal-500 text-black border border-teal-400 shadow-[0_0_10px_rgba(20,184,166,0.3)] font-bold";

              return (
                <div key={day} className={`aspect-square rounded-sm flex flex-col items-center justify-center transition-all hover:scale-105 cursor-default ${bgClass}`} title={`${dateStr}: ${count}칸 완료`}>
                  <span className="text-[11px] sm:text-[13px]">{day}</span>
                  {count > 0 && <span className="text-[8px] sm:text-[9px] mt-0.5 opacity-80 font-mono tracking-tighter">{count}</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* 오른쪽: 목표 및 보상 패널 */}
        <div className="flex flex-col gap-4">
          {renderGoalCard(GOALS.daily, "🎯")}
          {renderGoalCard(GOALS.weekly, "🔥")}
          {renderGoalCard(GOALS.monthly, "👑")}
        </div>
      </div>
    </div>
  );
};
