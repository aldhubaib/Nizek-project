"use client";

import { useRouter } from "next/navigation";
import { Briefcase, Eye, Printer, Trash } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { PageOverflowItems } from "@/components/page-overflow-menu";
import { REPORT_VARIANT } from "@/app/equity-report/report-variant";

/**
 * What you can do to the equity module as a whole, rather than to one portfolio:
 * read the report here, print either cut of it, or go looking for something that
 * was deleted.
 *
 * Both reports are offered rather than one link into the report's own picker,
 * since which one you want is usually decided before you open it. They open in
 * their own tab — a report is read or printed, then closed.
 */
export function EquityMenu() {
  const router = useRouter();

  return (
    <PageOverflowItems id="equity-menu">
      <DropdownMenuItem
        onClick={() => router.push("/dashboard/equity/preview")}
      >
        <Eye className="h-4 w-4" />
        <span className="flex-1">Preview</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => window.open("/equity-report", "_blank")}
      >
        <Printer className="h-4 w-4" />
        <span className="flex-1">{REPORT_VARIANT.nizek}</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() =>
          window.open("/equity-report?view=investor", "_blank")
        }
      >
        <Briefcase className="h-4 w-4" />
        <span className="flex-1">{REPORT_VARIANT.investor}</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => router.push("/dashboard/trash")}>
        <Trash className="h-4 w-4" />
        <span className="flex-1">Trash</span>
      </DropdownMenuItem>
    </PageOverflowItems>
  );
}
