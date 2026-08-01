import { ConsultationForm } from "../_components/consultation-form";

export default function NewConsultationPage() {
  return (
    <div className="px-5 md:px-8 pt-3 pb-8">
      <header className="max-w-4xl mx-auto px-4 md:px-6 mb-4">
        <h1 className="text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
          PT 상담 작성
        </h1>
        <p className="mt-1 text-[12.5px] text-[#8C8270] dark:text-zinc-500">
          상단에서 센터 회원을 검색하면 이름·연락처·생년월일이 자동 입력됩니다.
        </p>
      </header>
      <ConsultationForm mode="create" />
    </div>
  );
}
