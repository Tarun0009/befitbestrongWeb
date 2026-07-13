import { Router } from "express";
import { getAdminDemand } from "./stockAlerts.service.js";

const router = Router();

router.get("/demand", async (_req, res, next) => {
  try {
    const result = await getAdminDemand();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
