import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { syncSession, revokeSession } from "./auth.service.js";

const router = Router();

router.use(rateLimit({ keyPrefix: "auth", max: 20, windowSec: 60 }));

const sessionBody = z.object({
  idToken: z.string().min(20, "idToken looks too short"),
});

router.post("/session", async (req, res, next) => {
  try {
    const { idToken } = sessionBody.parse(req.body);
    const user = await syncSession(idToken);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, (req, res) => {
  const auth = req.auth!;
  res.json({
    user: {
      id: auth.userId,
      email: auth.email,
      role: auth.role,
    },
  });
});

router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await revokeSession(req.auth!.uid);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
