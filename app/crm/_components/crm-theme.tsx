"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type CrmTheme = "light" | "dark";

interface CrmThemeCtx {
  theme: CrmTheme;
  setTheme: (t: CrmTheme) => void;
}

const Ctx = createContext<CrmThemeCtx>({ theme: "light", setTheme: () => {} });

export function useCrmTheme() {
  return useContext(Ctx);
}

/**
 * CRM 전용 테마(화이트/블랙). localStorage("crm-theme") 에 저장, 기기별 유지.
 * 래퍼 div 에 .dark 클래스를 붙여 CRM 영역 안에서만 dark: 유틸리티가 활성화된다.
 */
export function CrmThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<CrmTheme>("light");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("crm-theme");
      if (saved === "dark" || saved === "light") setThemeState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const setTheme = (t: CrmTheme) => {
    setThemeState(t);
    try {
      localStorage.setItem("crm-theme", t);
    } catch {
      /* ignore */
    }
  };

  return (
    <Ctx.Provider value={{ theme, setTheme }}>
      <div className={`${theme === "dark" ? "dark " : ""}bg-[#FEFCF7] dark:bg-zinc-950 min-h-dvh text-[#2A251D] dark:text-zinc-100`}>
        {children}
      </div>
    </Ctx.Provider>
  );
}
