import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** 문자열에서 숫자만 추출 */
export function digitsOnly(s: string | null | undefined): string {
  return (s || "").replace(/[^0-9]/g, "");
}

/**
 * 주민등록번호(13자리) → SHA-256 해시(hex). 평문 저장 대신 해시만 보관·비교.
 * 형식이 13자리가 아니면 null.
 */
export function residentHash(raw: string | null | undefined): string | null {
  const d = digitsOnly(raw);
  if (d.length !== 13) return null;
  return createHash("sha256").update(d).digest("hex");
}

/** 주민번호 앞 6자리(생년월일 YYMMDD) 추출. 아니면 null */
export function residentBirth(raw: string | null | undefined): string | null {
  const d = digitsOnly(raw);
  return d.length >= 6 ? d.slice(0, 6) : null;
}

/**
 * 환경변수 RESIDENT_ENC_KEY (32 byte hex, 64 문자) 를 32-byte Buffer 로.
 * 미설정이면 null.
 */
function getResidentEncKey(): Buffer | null {
  const raw = process.env.RESIDENT_ENC_KEY;
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) return null;
  return Buffer.from(trimmed, "hex");
}

/** RESIDENT_ENC_KEY 가 유효하게 설정돼 있는지 */
export function isResidentEncryptionConfigured(): boolean {
  return getResidentEncKey() !== null;
}

/**
 * 주민번호 원문 → AES-256-GCM 암호화 → hex 문자열
 * 형식: iv(12 bytes) || ciphertext || authTag(16 bytes) 를 hex 인코딩
 * 형식이 13자리가 아니거나 키가 없으면 null.
 */
export function residentEncrypt(raw: string | null | undefined): string | null {
  const d = digitsOnly(raw);
  if (d.length !== 13) return null;
  const key = getResidentEncKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(d, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, authTag]).toString("hex");
}

/**
 * AES-256-GCM 암호화 hex 문자열 → 주민번호 원문
 * 실패(키 없음/데이터 손상) 시 null.
 */
export function residentDecrypt(hex: string | Buffer | Uint8Array | null | undefined): string | null {
  if (!hex) return null;
  const key = getResidentEncKey();
  if (!key) return null;
  let buf: Buffer;
  if (typeof hex === "string") {
    const clean = hex.startsWith("\\x") ? hex.slice(2) : hex;
    if (!/^[0-9a-fA-F]+$/.test(clean)) return null;
    buf = Buffer.from(clean, "hex");
  } else {
    buf = Buffer.isBuffer(hex) ? hex : Buffer.from(hex);
  }
  if (buf.length < 12 + 16 + 1) return null;
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(buf.length - 16);
  const ciphertext = buf.subarray(12, buf.length - 16);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    return /^[0-9]{13}$/.test(plain) ? plain : null;
  } catch {
    return null;
  }
}
