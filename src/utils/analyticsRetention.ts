const ANALYTICS_TIME_ZONE = "Asia/Seoul";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type AnalyticsCohortSource = "first_open" | "migration";

export interface AnalyticsCohortContext {
  cohortDate: string;
  cohortWeek: string;
  cohortSource: AnalyticsCohortSource;
  installVersion: string;
}

export interface DailyUsageState {
  date: string;
  openCount: number;
  sessionCount: number;
  dayActiveSent: boolean;
}

export interface DailyUsageSummary {
  summaryDate: string;
  openCount: number;
  sessionCount: number;
}

export interface DailyUsageUpdate {
  currentUsage: DailyUsageState;
  previousSummary?: DailyUsageSummary;
  shouldSendDayActive: boolean;
}

export function getAnalyticsDateKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ANALYTICS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return date.toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

export function getAnalyticsWeekKey(dateKey: string): string {
  const date = parseDateKeyAsUtc(dateKey);
  const dayOfWeek = date.getUTCDay() || 7;

  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek);

  const weekYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const weekNumber = Math.ceil(((date.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7);

  return `${weekYear}-W${String(weekNumber).padStart(2, "0")}`;
}

export function getDaysBetweenDateKeys(startDateKey: string, endDateKey: string): number {
  const start = parseDateKeyAsUtc(startDateKey);
  const end = parseDateKeyAsUtc(endDateKey);

  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY));
}

export function createAnalyticsCohortContext(
  currentDateKey: string,
  extensionVersion: string,
  cohortSource: AnalyticsCohortSource
): AnalyticsCohortContext {
  return {
    cohortDate: currentDateKey,
    cohortWeek: getAnalyticsWeekKey(currentDateKey),
    cohortSource,
    installVersion: extensionVersion,
  };
}

export function buildDailyUsageUpdate(
  previousUsage: DailyUsageState | undefined,
  currentDateKey: string,
  isNewSession: boolean
): DailyUsageUpdate {
  const previousSummary =
    previousUsage && previousUsage.date !== currentDateKey
      ? {
          summaryDate: previousUsage.date,
          openCount: previousUsage.openCount,
          sessionCount: previousUsage.sessionCount,
        }
      : undefined;

  const currentUsage =
    previousUsage?.date === currentDateKey
      ? { ...previousUsage }
      : {
          date: currentDateKey,
          openCount: 0,
          sessionCount: 0,
          dayActiveSent: false,
        };

  currentUsage.openCount += 1;

  if (isNewSession) {
    currentUsage.sessionCount += 1;
  }

  return {
    currentUsage,
    previousSummary,
    shouldSendDayActive: !currentUsage.dayActiveSent,
  };
}

function parseDateKeyAsUtc(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day));
}
