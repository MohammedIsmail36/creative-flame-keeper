import { describe, expect, it, vi } from "vitest";
import { fetchAllPaged } from "./paged-fetch";

describe("fetchAllPaged", () => {
  it("يجلب أكثر من 1000 سجل على دفعات دون فقد بيانات", async () => {
    const rows = Array.from({ length: 1205 }, (_, id) => ({ id }));
    const ranges: Array<[number, number]> = [];
    const queryBuilder = vi.fn(() => ({
      range: async (from: number, to: number) => {
        ranges.push([from, to]);
        return {
          data: rows.slice(from, to + 1),
          count: rows.length,
          error: null,
        };
      },
    }));

    const result = await fetchAllPaged<{ id: number }>(queryBuilder, {
      batchSize: 500,
    });

    expect(result).toHaveLength(1205);
    expect(result[1204]).toEqual({ id: 1204 });
    expect(ranges).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1204],
    ]);
    expect(queryBuilder).toHaveBeenCalledTimes(3);
  });

  it("يفشل بوضوح بدلاً من إعادة نتيجة ناقصة عند تجاوز الحد الآمن", async () => {
    const queryBuilder = () => ({
      range: async () => ({
        data: [{ id: 1 }],
        count: 1001,
        error: null,
      }),
    });

    await expect(
      fetchAllPaged(queryBuilder, { batchSize: 500, maxRows: 1000 }),
    ).rejects.toThrow("عدد السجلات (1001) يتجاوز الحد الآمن للتحميل (1000)");
  });

  it("يمرر خطأ قاعدة البيانات إلى المستدعي", async () => {
    const databaseError = new Error("database unavailable");
    const queryBuilder = () => ({
      range: async () => ({ data: null, count: null, error: databaseError }),
    });

    await expect(fetchAllPaged(queryBuilder)).rejects.toBe(databaseError);
  });
});
