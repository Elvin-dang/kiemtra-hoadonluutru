import { cn } from "cn";

import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

import type { Counts } from "../types/invoice";

type SummaryTilesProps = { counts: Counts };

export function SummaryTiles({ counts }: SummaryTilesProps) {
  const tiles = [
    { label: "Tổng hóa đơn", value: counts.total, tone: "text-foreground" },
    { label: "Bình thường", value: counts.ok, tone: "text-green-700" },
    { label: "Cảnh báo", value: counts.warn, tone: "text-red-600" },
    { label: "Không xác định", value: counts.unknown, tone: "text-amber-600" },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{tile.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-3xl font-bold", tile.tone)}>{tile.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
