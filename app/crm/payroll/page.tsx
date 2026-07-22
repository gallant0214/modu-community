"use client";

import { PayrollList } from "./_payroll-list";

export default function CrmPayrollPage() {
  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-6xl mx-auto">
      <header className="mb-5">
        <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
          직원 급여
        </h1>
      </header>
      <PayrollList />
    </div>
  );
}
