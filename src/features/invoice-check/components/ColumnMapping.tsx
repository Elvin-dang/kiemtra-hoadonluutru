"use client";

import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/shared/components/ui/native-select";

import { MAPPING_FIELDS, validateMapping } from "../utils/columns";

import type { ColumnMapping as Mapping, MappingField, SheetColumn } from "../types/invoice";

type ColumnMappingProps = {
  fileName: string;
  columns: SheetColumn[];
  initialMapping: Mapping;
  onConfirm: (mapping: Mapping) => void;
  onCancel: () => void;
};

const NONE = "";

function columnLabel(column: SheetColumn): string {
  return column.header ? `${column.letter} — ${column.header}` : `${column.letter} — (trống)`;
}

export function ColumnMapping({ fileName, columns, initialMapping, onConfirm, onCancel }: ColumnMappingProps) {
  const [mapping, setMapping] = useState<Mapping>(initialMapping);
  const error = validateMapping(mapping);

  const handleChange = (field: MappingField, value: string) => {
    setMapping((current) => ({ ...current, [field]: value === NONE ? null : Number(value) }));
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
      <Alert>
        <AlertTitle>Chọn cột dữ liệu</AlertTitle>
        <AlertDescription>
          Không tìm thấy đủ các cột cần thiết trong “{fileName}”. Hãy chọn cột tương ứng cho từng thông tin rồi bấm
          Tiếp tục.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2">
        {MAPPING_FIELDS.map(({ field, label, isRequired }) => (
          <label key={field} className="flex flex-col gap-1 text-sm">
            <span className="font-medium">
              {label}
              {isRequired && <span className="text-red-600"> *</span>}
            </span>
            <NativeSelect
              className="w-full"
              value={mapping[field] === null ? NONE : String(mapping[field])}
              onChange={(event) => handleChange(field, event.target.value)}
            >
              <NativeSelectOption value={NONE}>{isRequired ? "— Chọn cột —" : "(Không có)"}</NativeSelectOption>
              {columns.map((column) => (
                <NativeSelectOption key={column.index} value={String(column.index)}>
                  {columnLabel(column)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <Button disabled={error !== null} onClick={() => onConfirm(mapping)}>
          Tiếp tục
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Chọn file khác
        </Button>
      </div>
    </section>
  );
}
