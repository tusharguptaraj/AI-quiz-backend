import express from "express";
import Quiz from "../models/Quiz.js";

const router = express.Router();

/**
 * GET /api/quizzes/:email
 * Fetch all quizzes created by the given user.
 */
router.get("/:email", async (req, res) => {
  try {
    const { email } = req.params;

    // Fetch all quizzes created by this user
    const quizzes = await Quiz.find({ email }).sort({ createdAt: -1 }).lean();

    // Format for frontend
    const formatted = quizzes.map((quiz) => ({
      _id: quiz._id,
      
      topic: quiz.topic || "General",
      difficulty: quiz.difficulty || "Medium",
      attempted: quiz.attemptStatus === "attempted",
      score: quiz.score ?? null,
      createdAt: quiz.createdAt,
      updatedAt: quiz.updatedAt,
      quiz, // full quiz data for modal
      answers: quiz.selectedAnswers || [],
    }));

    res.json(formatted);
  } catch (err) {
    console.error("❌ Failed to fetch quizzes:", err);
    res.status(500).json({ error: "Failed to fetch quizzes", details: err.message });
  }
});

export default router;
