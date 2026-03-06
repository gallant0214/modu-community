export const metadata = {
  title: '계정 삭제 요청 - 모두의 지도사',
  description: '모두의 지도사 앱 계정 삭제 요청 페이지',
}

export default function DeleteAccountPage() {
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
        계정 삭제 요청
      </h1>

      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>삭제 방법</h2>
        <p>아래 방법 중 하나로 계정 삭제를 요청할 수 있습니다.</p>
      </section>

      <section style={{
        background: '#f8f9fa',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '24px',
      }}>
        <h3 style={{ fontSize: '16px', marginBottom: '8px' }}>방법 1: 앱 내 삭제</h3>
        <p>앱 &gt; 마이페이지 &gt; 설정 &gt; 계정 삭제</p>
      </section>

      <section style={{
        background: '#f8f9fa',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '24px',
      }}>
        <h3 style={{ fontSize: '16px', marginBottom: '8px' }}>방법 2: 이메일 요청</h3>
        <p>
          아래 이메일로 계정에 등록된 이메일 주소와 함께 삭제 요청을 보내주세요.
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
          <li>계정 정보 (이메일, 닉네임)</li>
          <li>작성한 게시글 및 댓글</li>
          <li>작성한 구인 공고</li>
          <li>좋아요 및 북마크 기록</li>
        </ul>
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
        <p>모두의 지도사 | gallant0214@naver.com</p>
      </footer>
    </div>
  )
}
