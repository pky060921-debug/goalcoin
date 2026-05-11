const BASE_URL = "https://api.blankd.top/api";

export const api = {
  // 카테고리(법령 조항) 목록 가져오기
  async getCategories(address: string) {
    const res = await fetch(`${BASE_URL}/get-categories?wallet_address=${address}`);
    return res.json();
  },
  
  // 사용자 빈칸 카드 목록 가져오기
  async getMyCards(address: string) {
    const res = await fetch(`${BASE_URL}/my-cards?wallet_address=${address}`);
    return res.json();
  },
  
  // 개별 카드 삭제
  async deleteCard(address: string, id: number) {
    return fetch(`${BASE_URL}/delete-card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: address, id })
    });
  },
  
  // 전체 데이터 초기화
  async deleteAll(address: string) {
    return fetch(`${BASE_URL}/delete-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: address })
    });
  },

  // 💡 실전 CBT 100문제 요청
  async getCbtSession() {
    const res = await fetch(`${BASE_URL}/get-cbt-session`);
    if (!res.ok) throw new Error("CBT 데이터를 불러오지 못했습니다.");
    return res.json();
  },

  // 💡 신규: 특정 조문 기반 10대 출제 스타일 샘플 생성
  async generateStyles(articleText: string) {
    const res = await fetch(`${BASE_URL}/generate-styles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ article_text: articleText })
    });
    if (!res.ok) throw new Error("스타일 샘플 생성 실패");
    return res.json();
  }
};
