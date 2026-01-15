import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import userRoutes from "./routes/user.js";
import quizRoutes from "./routes/quiz.js";
import quizzesRoutes from "./routes/quizzes.js";


dotenv.config();
connectDB();

const app = express();
app.use(cors({
  origin: "https://intelliq.onrender.com",
  credentials: true
}));
app.use(express.json());

// Routes
app.use("/api/user", userRoutes);

app.use("/api/quiz", quizRoutes);

app.use("/api/quizzes", quizzesRoutes);

// Error handler (optional)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Server Error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
