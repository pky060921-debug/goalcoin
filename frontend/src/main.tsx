import React from "react";
import ReactDOM from "react-dom/client";

function SimpleApp() {
  return (
    <div style={{ background: 'blue', color: 'white', padding: '100px', fontSize: '50px', textAlign: 'center' }}>
      아키님! 파란 화면이 보이면 성공입니다!
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <SimpleApp />
);
