/**
 * @fileoverview Export hooks - TanStack Query hooks for data export
 * 
 * Provides React hooks for exporting data to CSV format:
 * - Guest lists with all details
 * - Attendance reports
 * - Campaign delivery reports
 * 
 * @module hooks/use-export
 * @requires @tanstack/react-query
 * @requires sonner - Toast notifications
 * 
 * @example
 * ```tsx
 * import { useExportGuestList } from '@/hooks';
 * 
 * function ExportButton({ eventId }) {
 *   const { exportGuestList, isPending } = useExportGuestList();
 *   
 *   return (
 *     <button onClick={() => exportGuestList(eventId)} disabled={isPending}>
 *       Export Guests
 *     </button>
 *   );
 * }
 * ```
 */

"use client"

import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"

/**
 * Export type options.
 * - guests: Full guest list with contact info and statuses
 * - attendance: Attendance report with check-in data
 * - campaign: Campaign delivery report
 */
type ExportType = "guests" | "attendance" | "campaign"

/**
 * Parameters for export operations.
 */
interface ExportParams {
  type: ExportType
  eventId?: string
  campaignId?: string
}

/**
 * Triggers a file download in the browser.
 * Creates a temporary link element to download the CSV.
 * 
 * @param csv - The CSV content as a string
 * @param filename - The filename for the download
 */
function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.setAttribute("download", filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Export functions
async function exportData({ type, eventId, campaignId }: ExportParams): Promise<{ csv: string; filename: string }> {
  let url: string
  let filename: string

  switch (type) {
    case "guests":
      if (!eventId) throw new Error("Event ID is required for guest export")
      url = `/api/events/${eventId}/export/guests`
      filename = `event-${eventId}-guests.csv`
      break
    case "attendance":
      if (!eventId) throw new Error("Event ID is required for attendance export")
      url = `/api/events/${eventId}/export/attendance`
      filename = `event-${eventId}-attendance.csv`
      break
    case "campaign":
      if (!campaignId) throw new Error("Campaign ID is required for campaign export")
      url = `/api/campaigns/${campaignId}/export`
      filename = `campaign-${campaignId}-report.csv`
      break
    default:
      throw new Error("Invalid export type")
  }

  const response = await fetch(url)
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || "Failed to export data")
  }

  const csv = await response.text()
  return { csv, filename }
}

/**
 * Base export hook that handles all export types.
 * 
 * @returns Mutation object with mutate function
 * 
 * @example
 * ```tsx
 * const exportMutation = useExport();
 * exportMutation.mutate({ type: 'guests', eventId: 'event123' });
 * ```
 */
export function useExport() {
  return useMutation({
    mutationFn: exportData,
    onSuccess: ({ csv, filename }) => {
      downloadCSV(csv, filename)
      toast.success("Export downloaded successfully")
    },
    onError: (err) => {
      toast.error(err.message || "Failed to export data")
    },
  })
}

/**
 * Convenience hook for exporting guest lists.
 * 
 * @returns Object with exportGuestList function and mutation state
 * 
 * @example
 * ```tsx
 * const { exportGuestList, isPending } = useExportGuestList();
 * exportGuestList('event123');
 * ```
 */
export function useExportGuestList() {
  const exportMutation = useExport()
  
  return {
    ...exportMutation,
    exportGuestList: (eventId: string) => 
      exportMutation.mutate({ type: "guests", eventId }),
  }
}

/**
 * Convenience hook for exporting attendance reports.
 * 
 * @returns Object with exportAttendance function and mutation state
 */
export function useExportAttendance() {
  const exportMutation = useExport()
  
  return {
    ...exportMutation,
    exportAttendance: (eventId: string) => 
      exportMutation.mutate({ type: "attendance", eventId }),
  }
}

/**
 * Convenience hook for exporting campaign reports.
 * 
 * @returns Object with exportCampaignReport function and mutation state
 */
export function useExportCampaignReport() {
  const exportMutation = useExport()
  
  return {
    ...exportMutation,
    exportCampaignReport: (campaignId: string) => 
      exportMutation.mutate({ type: "campaign", campaignId }),
  }
}
