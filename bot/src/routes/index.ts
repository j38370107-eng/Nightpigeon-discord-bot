import { Router, type IRouter } from "express";
import healthRouter from "./health";
import statsRouter from "./stats";
import cacheRouter from "./cache";

const router: IRouter = Router();

router.use(healthRouter);
router.use(statsRouter);
router.use(cacheRouter);

export default router;
