export const metadata = {
  title: '아동 안전 표준 - 모두의 지도사',
  description: '모두의 지도사 앱 아동 안전 표준 정책',
}

export default function ChildSafetyPage() {
  return (
    <div style={{
      maxWidth: '600px',
      margin: '0 auto',
      padding: '40px 20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#333',
      lineHeight: '1.8',
    }}>
      <h1 style={{ fontSize: '24px', marginBottom: '24px' }}>
        아동 안전 표준 (Child Safety Standards)
      </h1>

      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>개요</h2>
        <p>
          모두의 지도사는 아동의 안전을 최우선으로 생각하며,
          아동 성적 학대 및 착취(CSAE)를 포함한 모든 형태의 아동 학대에 대해
          무관용 원칙을 적용합니다.
        </p>
      </section>

      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>금지 콘텐츠</h2>
        <p>다음과 같은 콘텐츠는 앱 내에서 엄격히 금지됩니다:</p>
        <ul style={{ paddingLeft: '20px' }}>
          <li>아동 성적 학대 자료(CSAM)</li>
          <li>아동을 대상으로 한 성적, 폭력적, 착취적 콘텐츠</li>
          <li>아동에 대한 그루밍 또는 부적절한 접촉 시도</li>
          <li>아동의 개인정보를 노출하는 콘텐츠</li>
        </ul>
      </section>

      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>대응 조치</h2>
        <p>위반 사항이 발견될 경우 다음과 같은 조치를 취합니다:</p>
        <ul style={{ paddingLeft: '20px' }}>
          <li>해당 콘텐츠 즉시 삭제</li>
          <li>위반 사용자 계정 영구 정지</li>
          <li>관련 법 집행 기관에 신고</li>
          <li>NCMEC(National Center for Missing & Exploited Children) 등 관련 기관에 보고</li>
        </ul>
      </section>

      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>신고 방법</h2>
        <p>
          아동 안전과 관련된 우려 사항이 있거나 의심스러운 콘텐츠를 발견한 경우,
          아래 방법으로 즉시 신고해 주세요.
        </p>
        <ul style={{ paddingLeft: '20px' }}>
          <li>앱 내 신고 기능 사용</li>
          <li>
            이메일:{' '}
            <a href="mailto:gallant0214@naver.com" style={{ color: '#1a73e8' }}>
              gallant0214@naver.com
            </a>
          </li>
        </ul>
        <p style={{ marginTop: '8px' }}>
          모든 신고는 신속하게 검토되며, 필요한 경우 관계 당국에 통보됩니다.
        </p>
      </section>

      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>연령 제한</h2>
        <p>
          본 앱은 만 18세 이상의 사용자를 대상으로 하며,
          미성년자의 사용을 권장하지 않습니다.
        </p>
      </section>

      <footer style={{
        marginTop: '40px',
        paddingTop: '20px',
        borderTop: '1px solid #e0e0e0',
        fontSize: '14px',
        color: '#666',
      }}>
        <p>모두의 지도사 | gallant0214@naver.com</p>
        <p>최종 수정일: 2026년 3월 7일</p>
      </footer>
    </div>
  )
}
