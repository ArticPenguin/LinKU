/**
 * Client ID 관리 유틸리티
 * 기기별 고유 식별자를 생성하고 관리합니다.
 */

import { getStorage, setStorage } from "./chrome";
import { errorLog } from '@/utils/logger';

let clientIdPromise: Promise<string> | null = null;
let fallbackClientId: string | null = null;

function createClientId(): string {
  return self.crypto.randomUUID();
}

function getFallbackClientId(): string {
  if (!fallbackClientId) {
    fallbackClientId = `error-${createClientId()}`;
  }

  return fallbackClientId;
}

/**
 * Client ID 생성 및 가져오기
 * 사용자별 고유 ID로 chrome.storage에 저장됨
 * @returns Promise<string> - 기기 고유 UUID
 */
export async function getOrCreateClientId(): Promise<string> {
  if (clientIdPromise) {
    return clientIdPromise;
  }

  clientIdPromise = readOrCreateClientId();

  try {
    return await clientIdPromise;
  } finally {
    clientIdPromise = null;
  }
}

async function readOrCreateClientId(): Promise<string> {
  try {
    let clientId = await getStorage<string>("clientId");

    if (!clientId) {
      // UUID v4 생성
      clientId = createClientId();
      await setStorage({ clientId });
    }

    return clientId;
  } catch (error) {
    errorLog("[ClientID] Error getting/creating client ID:", error);
    // 에러 시 popup 세션 동안 재사용되는 임시 ID 반환
    return getFallbackClientId();
  }
}
