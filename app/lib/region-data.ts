export interface SubRegion {
  code: string;
  name: string;
}

export interface RegionGroup {
  code: string;
  name: string;
  subRegions: SubRegion[];
}

export const REGION_GROUPS: RegionGroup[] = [
  {
    code: "SEOUL", name: "서울특별시",
    subRegions: [
      { code: "SEOUL_GANGNAM", name: "강남구" }, { code: "SEOUL_GANGDONG", name: "강동구" },
      { code: "SEOUL_GANGBUK", name: "강북구" }, { code: "SEOUL_GANGSEO", name: "강서구" },
      { code: "SEOUL_GWANAK", name: "관악구" }, { code: "SEOUL_GWANGJIN", name: "광진구" },
      { code: "SEOUL_GURO", name: "구로구" }, { code: "SEOUL_GEUMCHEON", name: "금천구" },
      { code: "SEOUL_NOWON", name: "노원구" }, { code: "SEOUL_DOBONG", name: "도봉구" },
      { code: "SEOUL_DONGDAEMUN", name: "동대문구" }, { code: "SEOUL_DONGJAK", name: "동작구" },
      { code: "SEOUL_MAPO", name: "마포구" }, { code: "SEOUL_SEODAEMUN", name: "서대문구" },
      { code: "SEOUL_SEOCHO", name: "서초구" }, { code: "SEOUL_SEONGDONG", name: "성동구" },
      { code: "SEOUL_SEONGBUK", name: "성북구" }, { code: "SEOUL_SONGPA", name: "송파구" },
      { code: "SEOUL_YANGCHEON", name: "양천구" }, { code: "SEOUL_YEONGDEUNGPO", name: "영등포구" },
      { code: "SEOUL_YONGSAN", name: "용산구" }, { code: "SEOUL_EUNPYEONG", name: "은평구" },
      { code: "SEOUL_JONGNO", name: "종로구" }, { code: "SEOUL_JUNG", name: "중구" },
      { code: "SEOUL_JUNGNANG", name: "중랑구" },
    ],
  },
  {
    code: "BUSAN", name: "부산광역시",
    subRegions: [
      { code: "BUSAN_GANGSEO", name: "강서구" }, { code: "BUSAN_GEUMJEONG", name: "금정구" },
      { code: "BUSAN_GIJANG", name: "기장군" }, { code: "BUSAN_NAM", name: "남구" },
      { code: "BUSAN_DONG", name: "동구" }, { code: "BUSAN_DONGNAE", name: "동래구" },
      { code: "BUSAN_BUK", name: "북구" }, { code: "BUSAN_SASANG", name: "사상구" },
      { code: "BUSAN_SAHA", name: "사하구" }, { code: "BUSAN_SEO", name: "서구" },
      { code: "BUSAN_SUYEONG", name: "수영구" }, { code: "BUSAN_YEONJE", name: "연제구" },
      { code: "BUSAN_YEONGDO", name: "영도구" }, { code: "BUSAN_JUNG", name: "중구" },
      { code: "BUSAN_HAEUNDAE", name: "해운대구" },
    ],
  },
  {
    code: "DAEGU", name: "대구광역시",
    subRegions: [
      { code: "DAEGU_NAM", name: "남구" }, { code: "DAEGU_DALSEO", name: "달서구" },
      { code: "DAEGU_DALSEONG", name: "달성군" }, { code: "DAEGU_DONG", name: "동구" },
      { code: "DAEGU_BUK", name: "북구" }, { code: "DAEGU_SEO", name: "서구" },
      { code: "DAEGU_SUSEONG", name: "수성구" }, { code: "DAEGU_JUNG", name: "중구" },
    ],
  },
  {
    code: "INCHEON", name: "인천광역시",
    subRegions: [
      { code: "INCHEON_GYEYANG", name: "계양구" }, { code: "INCHEON_MICHUHOL", name: "미추홀구" },
      { code: "INCHEON_NAM", name: "남동구" }, { code: "INCHEON_DONG", name: "동구" },
      { code: "INCHEON_BUK", name: "북구" }, { code: "INCHEON_SEO", name: "서구" },
      { code: "INCHEON_YEONSU", name: "연수구" }, { code: "INCHEON_ONGJIN", name: "옹진군" },
      { code: "INCHEON_JUNG", name: "중구" }, { code: "INCHEON_GANGHWA", name: "강화군" },
    ],
  },
  {
    code: "GWANGJU", name: "광주광역시",
    subRegions: [
      { code: "GWANGJU_GWANGSAN", name: "광산구" }, { code: "GWANGJU_NAM", name: "남구" },
      { code: "GWANGJU_DONG", name: "동구" }, { code: "GWANGJU_BUK", name: "북구" },
      { code: "GWANGJU_SEO", name: "서구" },
    ],
  },
  {
    code: "DAEJEON", name: "대전광역시",
    subRegions: [
      { code: "DAEJEON_DAEDEOK", name: "대덕구" }, { code: "DAEJEON_DONG", name: "동구" },
      { code: "DAEJEON_SEO", name: "서구" }, { code: "DAEJEON_YUSEONG", name: "유성구" },
      { code: "DAEJEON_JUNG", name: "중구" },
    ],
  },
  {
    code: "ULSAN", name: "울산광역시",
    subRegions: [
      { code: "ULSAN_NAM", name: "남구" }, { code: "ULSAN_DONG", name: "동구" },
      { code: "ULSAN_BUK", name: "북구" }, { code: "ULSAN_ULJ", name: "울주군" },
      { code: "ULSAN_JUNG", name: "중구" },
    ],
  },
  {
    code: "SEJONG", name: "세종특별자치시",
    subRegions: [{ code: "SEJONG_SEJONG", name: "세종시" }],
  },
  {
    code: "GYEONGGI", name: "경기도",
    subRegions: [
      { code: "GG_GAPYEONG", name: "가평군" }, { code: "GG_GOYANG", name: "고양시" },
      { code: "GG_GWACHEON", name: "과천시" }, { code: "GG_GWANGMYEONG", name: "광명시" },
      { code: "GG_GWANGJU", name: "광주시" }, { code: "GG_GURI", name: "구리시" },
      { code: "GG_GUNPO", name: "군포시" }, { code: "GG_GIMPO", name: "김포시" },
      { code: "GG_NAMYANGJU", name: "남양주시" }, { code: "GG_DONGDUCHEON", name: "동두천시" },
      { code: "GG_BUCHEON", name: "부천시" }, { code: "GG_SEONGNAM", name: "성남시" },
      { code: "GG_SUWON", name: "수원시" }, { code: "GG_SIHEUNG", name: "시흥시" },
      { code: "GG_ANSAN", name: "안산시" }, { code: "GG_ANSEONG", name: "안성시" },
      { code: "GG_ANYANG", name: "안양시" }, { code: "GG_YANGJU", name: "양주시" },
      { code: "GG_YANGPYEONG", name: "양평군" }, { code: "GG_YEOJU", name: "여주시" },
      { code: "GG_YEONCHEON", name: "연천군" }, { code: "GG_OSAN", name: "오산시" },
      { code: "GG_YONGIN", name: "용인시" }, { code: "GG_UIWANG", name: "의왕시" },
      { code: "GG_UIJEONGBU", name: "의정부시" }, { code: "GG_ICHEON", name: "이천시" },
      { code: "GG_PAJU", name: "파주시" }, { code: "GG_PYEONGTAEK", name: "평택시" },
      { code: "GG_POCHEON", name: "포천시" }, { code: "GG_HANAM", name: "하남시" },
      { code: "GG_HWASEONG", name: "화성시" },
    ],
  },
  {
    code: "GANGWON", name: "강원도",
    subRegions: [
      { code: "GW_GANGNEUNG", name: "강릉시" }, { code: "GW_GOSEONG", name: "고성군" },
      { code: "GW_DONGHAE", name: "동해시" }, { code: "GW_SAMCHEOK", name: "삼척시" },
      { code: "GW_SOKCHO", name: "속초시" }, { code: "GW_YANGGU", name: "양구군" },
      { code: "GW_YANGYANG", name: "양양군" }, { code: "GW_YEONGWOL", name: "영월군" },
      { code: "GW_WONJU", name: "원주시" }, { code: "GW_INJE", name: "인제군" },
      { code: "GW_JEONGSEON", name: "정선군" }, { code: "GW_CHEORWON", name: "철원군" },
      { code: "GW_CHUNCHEON", name: "춘천시" }, { code: "GW_TAEBAEK", name: "태백시" },
      { code: "GW_PYEONGCHANG", name: "평창군" }, { code: "GW_HONGCHEON", name: "홍천군" },
      { code: "GW_HWACHEON", name: "화천군" }, { code: "GW_HOENGSEONG", name: "횡성군" },
    ],
  },
  {
    code: "CHUNGBUK", name: "충청북도",
    subRegions: [
      { code: "CB_GOESAN", name: "괴산군" }, { code: "CB_DANYANG", name: "단양군" },
      { code: "CB_BOEUN", name: "보은군" }, { code: "CB_YEONGDONG", name: "영동군" },
      { code: "CB_OKCHEON", name: "옥천군" }, { code: "CB_EUMSEONG", name: "음성군" },
      { code: "CB_JECHEON", name: "제천시" }, { code: "CB_JINCHEON", name: "진천군" },
      { code: "CB_CHEONGJU", name: "청주시" }, { code: "CB_CHUNGJU", name: "충주시" },
      { code: "CB_JEUNGPYEONG", name: "증평군" },
    ],
  },
  {
    code: "CHUNGNAM", name: "충청남도",
    subRegions: [
      { code: "CN_GYERYONG", name: "계룡시" }, { code: "CN_GONGJU", name: "공주시" },
      { code: "CN_GEUMSAN", name: "금산군" }, { code: "CN_NONSAN", name: "논산시" },
      { code: "CN_DANGJIN", name: "당진시" }, { code: "CN_BORYEONG", name: "보령시" },
      { code: "CN_BUYEO", name: "부여군" }, { code: "CN_SEOSAN", name: "서산시" },
      { code: "CN_SEOCHEON", name: "서천군" }, { code: "CN_ASAN", name: "아산시" },
      { code: "CN_YESAN", name: "예산군" }, { code: "CN_CHEONAN", name: "천안시" },
      { code: "CN_CHEONGYANG", name: "청양군" }, { code: "CN_TAEAN", name: "태안군" },
      { code: "CN_HONGSEONG", name: "홍성군" },
    ],
  },
  {
    code: "JEONBUK", name: "전라북도",
    subRegions: [
      { code: "JB_GOCHANG", name: "고창군" }, { code: "JB_GUNSAN", name: "군산시" },
      { code: "JB_GIMJE", name: "김제시" }, { code: "JB_NAMWON", name: "남원시" },
      { code: "JB_MUJU", name: "무주군" }, { code: "JB_BUAN", name: "부안군" },
      { code: "JB_SUNCHANG", name: "순창군" }, { code: "JB_WANJU", name: "완주군" },
      { code: "JB_IKSAN", name: "익산시" }, { code: "JB_IMSIL", name: "임실군" },
      { code: "JB_JANGSU", name: "장수군" }, { code: "JB_JEONJU", name: "전주시" },
      { code: "JB_JEONGUP", name: "정읍시" }, { code: "JB_JINAN", name: "진안군" },
    ],
  },
  {
    code: "JEONNAM", name: "전라남도",
    subRegions: [
      { code: "JN_GANGJIN", name: "강진군" }, { code: "JN_GOHEUNG", name: "고흥군" },
      { code: "JN_GOKSEONG", name: "곡성군" }, { code: "JN_GWANGYANG", name: "광양시" },
      { code: "JN_GURYE", name: "구례군" }, { code: "JN_NAJU", name: "나주시" },
      { code: "JN_DAMYANG", name: "담양군" }, { code: "JN_MOKPO", name: "목포시" },
      { code: "JN_MUAN", name: "무안군" }, { code: "JN_BOSEONG", name: "보성군" },
      { code: "JN_SUNCHEON", name: "순천시" }, { code: "JN_SINAN", name: "신안군" },
      { code: "JN_YEOSU", name: "여수시" }, { code: "JN_YEONGAM", name: "영암군" },
      { code: "JN_YEONGGWANG", name: "영광군" }, { code: "JN_WANDO", name: "완도군" },
      { code: "JN_JANGHEUNG", name: "장흥군" }, { code: "JN_JANGSEONG", name: "장성군" },
      { code: "JN_JINDO", name: "진도군" }, { code: "JN_HAMPYEONG", name: "함평군" },
      { code: "JN_HAENAM", name: "해남군" }, { code: "JN_HWASUN", name: "화순군" },
    ],
  },
  {
    code: "GYEONGBUK", name: "경상북도",
    subRegions: [
      { code: "GB_GYEONGSAN", name: "경산시" }, { code: "GB_GYEONGJU", name: "경주시" },
      { code: "GB_GORYEONG", name: "고령군" }, { code: "GB_GUMI", name: "구미시" },
      { code: "GB_GUNWI", name: "군위군" }, { code: "GB_KIMCHEON", name: "김천시" },
      { code: "GB_MUNGYEONG", name: "문경시" }, { code: "GB_BONGHWA", name: "봉화군" },
      { code: "GB_SANGJU", name: "상주시" }, { code: "GB_SEONGJU", name: "성주군" },
      { code: "GB_ANDONG", name: "안동시" }, { code: "GB_YEONGDEOK", name: "영덕군" },
      { code: "GB_YEONGYANG", name: "영양군" }, { code: "GB_YEONGJU", name: "영주시" },
      { code: "GB_YEONGCHEON", name: "영천시" }, { code: "GB_YECHEON", name: "예천군" },
      { code: "GB_ULJIN", name: "울진군" }, { code: "GB_UISEONG", name: "의성군" },
      { code: "GB_CHEONGDO", name: "청도군" }, { code: "GB_CHEONGSONG", name: "청송군" },
      { code: "GB_CHILGOK", name: "칠곡군" }, { code: "GB_POHANG", name: "포항시" },
    ],
  },
  {
    code: "GYEONGNAM", name: "경상남도",
    subRegions: [
      { code: "GN_GEOJE", name: "거제시" }, { code: "GN_GEOCHANG", name: "거창군" },
      { code: "GN_GOSEONG", name: "고성군" }, { code: "GN_GIMHAE", name: "김해시" },
      { code: "GN_NAMHAE", name: "남해군" }, { code: "GN_MIRYANG", name: "밀양시" },
      { code: "GN_SACHEON", name: "사천시" }, { code: "GN_SANCHEONG", name: "산청군" },
      { code: "GN_YANGSAN", name: "양산시" }, { code: "GN_UIRYEONG", name: "의령군" },
      { code: "GN_JINJU", name: "진주시" }, { code: "GN_CHANGNYEONG", name: "창녕군" },
      { code: "GN_CHANGWON", name: "창원시" }, { code: "GN_TONGYEONG", name: "통영시" },
      { code: "GN_HAMYANG", name: "함양군" }, { code: "GN_HAMAN", name: "함안군" },
      { code: "GN_HAPCHEON", name: "합천군" },
    ],
  },
  {
    code: "JEJU", name: "제주특별자치도",
    subRegions: [
      { code: "JEJU_JEJU", name: "제주시" }, { code: "JEJU_SEOGWIPO", name: "서귀포시" },
    ],
  },
];

export function getRegionName(code: string): string {
  for (const group of REGION_GROUPS) {
    const sub = group.subRegions.find((s) => s.code === code);
    if (sub) return sub.name;
  }
  return code;
}
