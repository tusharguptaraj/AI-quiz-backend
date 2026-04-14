import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import mammoth from "mammoth";
import Quiz from "../models/Quiz.js";

dotenv.config();

const router = express.Router();
const upload = multer({ dest: "uploads/" });

// 🧩 Extract JSON array safely
function extractJsonArray(text) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("No JSON array found");
  return JSON.parse(text.slice(start, end + 1));
}

// 🧩 Extract text from supported file types
async function extractTextFromFile(filePath, mimeType) {
  const ext = mimeType?.toLowerCase();

  if (ext.includes("pdf")) {
    try {
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const data = new Uint8Array(fs.readFileSync(filePath));
      const pdf = await pdfjsLib.getDocument({ data }).promise;

  

      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item) => item.str).join(" ");
        fullText += pageText + "\n";
      }

      if (!fullText.trim() || fullText.trim().length < 20) {
        throw new Error("Unable to extract text from PDF (it may be scanned or image-based).");
      }

      return fullText;
    } catch (err) {
      console.error("❌ PDF parse error details:", err);
      throw new Error(`PDF extraction failed: ${err.message}`);
    }
  } else if (ext.includes("word") || filePath.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ path: filePath });
    if (!value.trim()) throw new Error("No readable text found in Word document.");
    return value;
  } else if (ext.includes("text") || filePath.endsWith(".txt")) {
    const text = fs.readFileSync(filePath, "utf8");
    if (!text.trim()) throw new Error("Text file is empty.");
    return text;
  } else {
    throw new Error("Unsupported file type");
  }
}

// 🧩 Generate concise AI topic/title
async function generateQuizTitle(text) {
  const prompt = `Summarize the following text into a concise, 3–5 word quiz topic/title. No formatting.\n"""${text}"""`;

  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: "You generate short quiz titles only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      timeout: 60000,
    }
  );

  return response.data.choices[0].message.content
    .trim()
    .replace(/\n/g, " ");
}


// ✅ POST /api/quiz/generate
router.post("/generate", upload.single("file"), async (req, res) => {
  try {
    const { topic: userTopic, email, difficulty = "Medium" } = req.body;
    let quizSource = userTopic?.trim();
    const file = req.file;

    if (!quizSource && !file)
      return res.status(400).json({ error: "Please provide a topic or upload a file." });

    // 🧠 Extract text from uploaded file
    if (file) {
      try {
        const extractedText = await extractTextFromFile(file.path, file.mimetype);
        if (!extractedText || extractedText.trim().length < 20) {
          throw new Error("Extracted text is too short or unreadable.");
        }
        quizSource = extractedText.slice(0, 4000);
      } catch (err) {
        fs.unlinkSync(file.path);
        return res.status(400).json({
          error: "Failed to extract text from uploaded PDF.",
          details: err.message,
        });
      } finally {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      }
    }

    // 🧠 Generate concise AI topic/title
    let quizTitle = "Generated Quiz";
    try {
      quizTitle = await generateQuizTitle(quizSource);
    } catch (err) {
      console.warn("⚠️ Failed to generate title, using fallback:", err.message);
    }

    // ✅ Generate quiz with distributed answer indices
    const systemPrompt = `Generate exactly 10 multiple-choice questions in JSON format.
Each object must include:
- "question": the question string
- "options": array of exactly 4 answer strings
- "answer": integer index (0–3) of the correct option
- "explanation": 2-line explanation of why the answer is correct

IMPORTANT: The "answer" values across all 10 questions MUST be distributed across indices 0, 1, 2, and 3.
Do NOT place the correct answer at index 0 for more than 2–3 questions.
Shuffle the position of the correct answer for each question independently.

Difficulty: "${difficulty}".
Based on this content:
"""${quizSource}"""
Return only the raw JSON array. No markdown, no backticks, no explanation.`;

    const aiRes = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful quiz generator that returns valid JSON only. Never wrap output in markdown code blocks." },
          { role: "user", content: systemPrompt },
        ],
        temperature: 0.7,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        timeout: 180000,
      }
    );

    const content = aiRes.data.choices[0].message.content;
    let questions;
    try {
      questions = extractJsonArray(content);
    } catch {
      questions = JSON.parse(content);
    }

    if (!Array.isArray(questions) || questions.length === 0)
      return res.status(500).json({ error: "Invalid quiz format", raw: content });

    // ✅ Save quiz in DB
    const newQuiz = new Quiz({
      email: email || "anonymous",
      topic: quizTitle,
      difficulty,
      questions,
      selectedAnswers: {},
      score: 0,
      attemptStatus: "unattempted",
      createdAt: new Date(),
    });

    await newQuiz.save();
    res.json({ quizId: newQuiz._id, topic: quizTitle, difficulty, questions });
  } catch (err) {
    console.error("❌ Quiz generation failed:", err.message);
    res.status(500).json({ error: "Failed to generate quiz", details: err.message });
  }
});

// ✅ POST /api/quiz/submit
router.post("/submit", async (req, res) => {
  try {
    const { quizId, selectedAnswers, score } = req.body;

    if (!quizId || !selectedAnswers)
      return res.status(400).json({ error: "Missing required fields" });

    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    quiz.selectedAnswers = selectedAnswers;
    quiz.score = Number(score) || 0;
    quiz.attemptStatus = "attempted";
    quiz.updatedAt = new Date();

    await quiz.save();
    res.json({ message: "✅ Quiz attempt updated successfully", quiz });
  } catch (err) {
    console.error("❌ Error updating quiz:", err);
    res.status(500).json({ error: "Failed to update quiz", details: err.message });
  }
});

export default router;