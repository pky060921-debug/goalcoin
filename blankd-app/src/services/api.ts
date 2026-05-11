const BASE_URL = "https://api.blankd.top/api";

export const api = {
  async getCategories(address: string) {
    const res = await fetch(`${BASE_URL}/get-categories?wallet_address=${address}`);
    return res.json();
  },
  
  async getMyCards(address: string) {
    const res = await fetch(`${BASE_URL}/my-cards?wallet_address=${address}`);
    return res.json();
  },
  
  async deleteCard(address: string, id: number) {
    return fetch(`${BASE_URL}/delete-card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: address, id })
    });
  },
  
  async deleteAll(address: string) {
    return fetch(`${BASE_URL}/delete-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: address })
    });
  },

  // ==========================================
  // 💡 [신규 추가] CBT 실전 모의고사 100문제 요청 함수
  // ==========================================
  async getCbtSession() {
    const res = await fetch(`${BASE_URL}/get-cbt-session`);
    if (!res.ok) {
      throw new Error("CBT 데이터를 불러오지 못했습니다.");
    }
    return res.json();
  }
};
