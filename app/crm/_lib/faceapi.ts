/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

// face-api.js (@vladmandic/face-api) 런타임 로드 + 얼굴 디스크립터 계산 공용 헬퍼.
// 얼굴출석(실시간 매칭)과 회원 얼굴 등록(디스크립터 사전 계산) 양쪽에서 사용.

const FACEAPI_SRC = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js";
export const FACEAPI_MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";

let scriptPromise: Promise<any> | null = null;
let modelsPromise: Promise<any> | null = null;

export function loadFaceApi(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as any).faceapi) return Promise.resolve((window as any).faceapi);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = FACEAPI_SRC;
    s.async = true;
    s.onload = () => resolve((window as any).faceapi);
    s.onerror = () => reject(new Error("얼굴인식 라이브러리 로드 실패 (네트워크 확인)"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** 라이브러리 + 필요한 모델(탐지·랜드마크·인식)을 1회 로드. */
export async function ensureFaceModels(): Promise<any> {
  const faceapi = await loadFaceApi();
  if (!modelsPromise) {
    modelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(FACEAPI_MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(FACEAPI_MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACEAPI_MODEL_URL),
    ]);
  }
  await modelsPromise;
  return faceapi;
}

/**
 * 이미지 소스(data URL / objectURL / http)에서 128차원 얼굴 디스크립터를 계산.
 * 얼굴을 못 찾으면 null. 반환은 저장하기 좋은 number[] (JSON 직렬화 가능).
 */
export async function computeFaceDescriptor(imgSrc: string): Promise<number[] | null> {
  const faceapi = await ensureFaceModels();
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = imgSrc;
  await img.decode();
  // 등록용은 정확도 우선(inputSize 크게, 낮은 score 문턱)
  const opt = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 });
  const det = await faceapi
    .detectSingleFace(img, opt)
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!det?.descriptor) return null;
  return Array.from(det.descriptor as Float32Array).map((n) => Number(n));
}
