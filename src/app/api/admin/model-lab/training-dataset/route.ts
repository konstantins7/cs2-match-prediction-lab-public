import { exportTrainingDatasetCsv } from "@/lib/modelLab/trainingDataset";

export async function GET() {
  const result = await exportTrainingDatasetCsv();
  return new Response(result.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=cs2-training-dataset-mvp-0-4-1.csv",
      "X-Training-Rows": String(result.rows)
    }
  });
}
