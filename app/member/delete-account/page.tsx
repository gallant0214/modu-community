export const metadata = {
  title: '계정 삭제 요청 - 모두의지도사(회원용)',
  description: '모두의지도사 회원용 앱 계정 및 데이터 삭제 요청 안내',
}

export default function MemberDeleteAccountPage() {
  return (
    <div style={{
      maxWidth: '600px',
      margin: '0 auto',
      padding: '40px 20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#333',
      lineHeight: '1.6',
    }}>
      <h1 style={{ fontSize: '24px', marginBottom: '24px' }}>
        계정 삭제 요청 (회원용 앱)
      </h1>

      <section style={{ marginBottom: '24px' }}>
        <p>
          <strong>모두의지도사(회원용)</strong> 앱의 계정 및 관련 데이터 삭제를
          아래 방법 중 하나로 요청할 수 있습니다.
        </p>
      </section>

      <section style={{
        background: '#f8f9fa',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '16px',
      }}>
        <h3 style={{ fontSize: '16px', marginBottom: '8px' }}>방법 1: 앱 내 삭제 (즉시)</h3>
        <p>앱 실행 &gt; 하단 <strong>MY</strong> 탭 &gt; 맨 아래 <strong>회원탈퇴</strong></p>
      </section>

      <section style={{
        background: '#f8f9fa',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '24px',
      }}>
        <h3 style={{ fontSize: '16px', marginBottom: '8px' }}>방법 2: 이메일 요청</h3>
        <p>
          아래 이메일로 <strong>앱에 로그인한 이메일 주소</strong>와 함께 삭제 요청을 보내주세요.
        </p>
        <p style={{ marginTop: '8px' }}>
          <strong>이메일:</strong>{' '}
          <a href="mailto:gallant0214@naver.com" style={{ color: '#1a73e8' }}>
            gallant0214@naver.com
          </a>
        </p>
      </section>

      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>삭제되는 데이터</h2>
        <ul style={{ paddingLeft: '20px' }}>
          <li>앱 계정 정보 (Google/Apple 로그인 식별자, 이메일)</li>
          <li>센터 연동 정보</li>
          <li>푸시 알림 설정 및 기기 토큰</li>
          <li>앱 내 알림 수신 내역</li>
        </ul>
      </section>

      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>보관될 수 있는 데이터</h2>
        <p>
          이용자가 소속된 센터(체육시설)가 보관하는 회원권·수강권·결제·이용 기록 등은
          센터의 개인정보 보관 정책 및 관련 법령(전자상거래 등에서의 소비자보호에 관한 법률 등)에
          따라 일정 기간 보관될 수 있습니다.
        </p>
      </section>

      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>처리 기간</h2>
        <p>계정 삭제 요청은 접수 후 <strong>7일 이내</strong>에 처리됩니다.</p>
      </section>

      <footer style={{
        marginTop: '40px',
        paddingTop: '20px',
        borderTop: '1px solid #e0e0e0',
        fontSize: '14px',
        color: '#666',
      }}>
        <p>모두의지도사(회원용) | gallant0214@naver.com</p>
      </footer>
    </div>
  )
}
