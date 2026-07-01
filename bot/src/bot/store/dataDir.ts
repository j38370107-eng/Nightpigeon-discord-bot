import { join } from "node:path";

export const DATA_DIR = process.env["DATA_DIR"] ?? join(process.cwd(), "data");
