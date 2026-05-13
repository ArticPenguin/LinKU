/**
 * Background Script Message Types
 * Type definitions for communication between popup and background script
 */

import type { GoogleOAuthResponse } from '../types/api';

/**
 * Message types for popup -> background communication
 */
export enum BackgroundMessageType {
  GOOGLE_LOGIN = 'GOOGLE_LOGIN',
  SILENT_REAUTH = 'SILENT_REAUTH',
  ANALYTICS_EVENT = 'ANALYTICS_EVENT',
}

/**
 * Base message structure
 */
export interface BackgroundMessage<T = unknown> {
  type: BackgroundMessageType;
  data?: T;
}

/**
 * Analytics dispatch request message
 * Carries a fully-built Measurement Protocol request to the background worker.
 */
export interface AnalyticsDispatchData {
  payload: unknown;
  url: string;
}

export interface AnalyticsDispatchMessage
  extends BackgroundMessage<AnalyticsDispatchData> {
  type: BackgroundMessageType.ANALYTICS_EVENT;
  data: AnalyticsDispatchData;
}

export interface AnalyticsDispatchResponse {
  success: boolean;
  queued?: boolean;
  error?: string;
}

/**
 * Google Login Request Message
 */
export interface GoogleLoginMessage extends BackgroundMessage {
  type: BackgroundMessageType.GOOGLE_LOGIN;
}

/**
 * Google Login Success Response
 */
export interface GoogleLoginSuccessResponse {
  success: true;
  response: GoogleOAuthResponse;
}

/**
 * Google Login Error Response
 */
export interface GoogleLoginErrorResponse {
  success: false;
  error: string;
}

/**
 * Google Login Response (Union type)
 */
export type GoogleLoginResponse = GoogleLoginSuccessResponse | GoogleLoginErrorResponse;

/**
 * Type guard for Google Login Message
 */
export function isGoogleLoginMessage(
  message: BackgroundMessage
): message is GoogleLoginMessage {
  return message.type === BackgroundMessageType.GOOGLE_LOGIN;
}

/**
 * Silent Reauth Request Message
 * Used when token expires (5004 error) - triggers OAuth without user interaction
 */
export interface SilentReauthMessage extends BackgroundMessage {
  type: BackgroundMessageType.SILENT_REAUTH;
}

/**
 * Silent Reauth Response
 */
export interface SilentReauthResponse {
  success: boolean;
  error?: string;
}

/**
 * Type guard for Silent Reauth Message
 */
export function isSilentReauthMessage(
  message: BackgroundMessage
): message is SilentReauthMessage {
  return message.type === BackgroundMessageType.SILENT_REAUTH;
}

/**
 * Type guard for analytics dispatch messages.
 */
export function isAnalyticsDispatchMessage(
  message: BackgroundMessage
): message is AnalyticsDispatchMessage {
  return (
    message.type === BackgroundMessageType.ANALYTICS_EVENT &&
    typeof message.data === "object" &&
    message.data !== null &&
    typeof (message.data as AnalyticsDispatchData).url === "string" &&
    "payload" in message.data
  );
}
