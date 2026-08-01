// Ad hoc, management-requested exception: these two employees should not
// appear on the payslip PDF (per-employee page or the summary page) or on
// the equivalent per-period Reports view, for any period where their net
// pay is exactly ₱0. Not derived from any general business rule — keyed by
// employee id (not name) so it can't accidentally match someone else with
// the same surname.
const HIDE_WHEN_ZERO_NET_EMPLOYEE_IDS = new Set<string>([
  "bad06b68-8186-413e-b118-e018432935c6", // Simplicia Cuevas
  "457853f6-643c-4cba-98c6-7a836b366305", // Ardin Cedullo
]);

export function hideFromZeroNetReports(employeeId: string, netWeeklyPay: number): boolean {
  return netWeeklyPay === 0 && HIDE_WHEN_ZERO_NET_EMPLOYEE_IDS.has(employeeId);
}
