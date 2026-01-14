import mongoose from "mongoose";

const QuizSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  topic: { type: String, required: true },
  difficulty: { type: String, default: "Medium" },

  questions: [
    {
      question: { type: String, required: true },
      options: { type: [String], required: true },
      answer: { type: Number, required: true },
      explanation: { type: String, required: true },
    },
  ],

  // For tracking user attempt
  selectedAnswers: { type: Object, default: {} }, // { "0": 1, "1": 3, ... }
  score: { type: Number, default: 0 },
  attemptStatus: { type: String, default: "unattempted" }, // "unattempted" or "attempted"

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

QuizSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const Quiz = mongoose.models?.Quiz || mongoose.model("Quiz", QuizSchema);
export default Quiz;
